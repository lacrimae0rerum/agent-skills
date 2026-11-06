/**
 * Judge — the model-graded assertion layer (llm-rubric, llm-assert, text pairwise).
 *
 * Implements Anthropic's cookbook judge discipline: the judge reasons first, then
 * emits a machine-readable verdict; we force a parseable JSON object rather than
 * free text. Best practices baked in (from Anthropic's "develop-tests" docs and
 * "Demystifying evals"): reason-then-score, a DISTINCT judge level from the
 * agent-under-test, and an explicit "Unknown" escape hatch — a judge that can't
 * tell must say so, and Unknown is scored as a miss (conservative for regression).
 *
 * A copy of the assay skill's Tools/Judge.ts (kept in step by hand; skills never import
 * each other's code). Every call runs through ./JudgeCall.ts on the portable inference helper,
 * so any provider the user has configured can judge.
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt). The upstream hosted
 * judgment-layer first pass (a probability engine asked before the model judge) is
 * not part of this port: every judged assert goes to the model judge.
 */

import type { Assertion, AssertResult } from './Assertions.ts';
import { existsSync, readFileSync } from 'node:fs';
import { modelFor, resolveProvider, type InferenceLevel } from '../_portable/inference.ts';
import { evalJudgeVendor, judgeText, namedJudge } from './JudgeCall.ts';
import { RUBRIC_SYSTEM, ASSERT_SYSTEM, PAIRWISE_SYSTEM, anchorBlock, referenceBlock, JUDGE_PROMPT_HASH } from './JudgePrompts.ts';
import { invariant } from '../_portable/invariant.ts';

// The rubric's own pass/fail cut line on its normalized 0..1 score — an eval-authored value.
const RUBRIC_PASS_BAR = 0.6;
// The model judge's rubric prompt (RUBRIC_SYSTEM) contracts it to a 1-based integer level; a shape bound.
const MIN_SCORE_LEVEL = 1;

/** The claims an llm-assert puts to the judge: every array item is one claim, a scalar value is one claim. Pure. */
export function assertClaims(a: Assertion): string[] {
  return Array.isArray(a.value) ? a.value.map(String) : [String(a.value)];
}

/** One claim's verdict. */
export type ClaimVerdict = { verdict: 'TRUE' | 'FALSE' | 'UNKNOWN'; quotes?: string[]; reason?: string; by?: 'judge' };

/**
 * The assert result over its per-claim verdicts. The score is the share of claims TRUE and the assert passes only when
 * every claim is TRUE; any UNKNOWN is a miss with score 0, negated or not; a not-llm-assert inverts both. Pure.
 */
export function aggregateClaims(a: Assertion, verdicts: readonly ClaimVerdict[]): AssertResult {
  invariant(verdicts.length === assertClaims(a).length, 'one verdict per claim');
  const n = verdicts.length;
  const trueCount = verdicts.filter((v) => v.verdict === 'TRUE').length;
  const unknown = verdicts.some((v) => v.verdict === 'UNKNOWN');
  let passed = trueCount === n;
  let score = trueCount / n;
  if (a.type.startsWith('not-') && !unknown) { passed = !passed; score = 1 - score; }
  if (unknown) { passed = false; score = 0; }
  const evidence = verdicts.map((v, k) => `${k + 1}. ${v.verdict}: ${JSON.stringify(v.quotes ?? [])}${v.reason ? ` — ${v.reason}` : ''}`).join('; ');
  return { type: a.type, passed, score, reason: `${unknown ? 'UNKNOWN: ' : ''}${trueCount}/${n} assertions TRUE; ${evidence}`, weight: a.weight ?? 1, ...(unknown ? { unknown: true } : {}) };
}

/** The model judge's verdict on every claim of `a`, in order, or the reason it gave none (an unavailable judge). */
async function modelClaimVerdicts(output: string, a: Assertion, opts: JudgeOptions): Promise<ClaimVerdict[] | { error: string }> {
  const level: InferenceLevel = opts.level ?? 'high';
  const timeout = opts.timeout ?? 45_000;
  const invoke = opts.invoke ?? judgeText;
  const claims = assertClaims(a);
  const prompt = buildAssertPrompt(output, a);
  try {
    let res = await invoke({ systemPrompt: ASSERT_SYSTEM, userPrompt: prompt, level, vendor: evalJudgeVendor(), timeout });
    if (!res.success) return { error: `judge error: ${res.error}` };
    let j = extractJson(res.output) as { results?: { verdict?: string; quotes?: string[]; reason?: string }[] } | null;
    // A cheap judge with no verdicts gets ONE retry at 'high' before the assert is unavailable.
    if ((j?.results ?? []).length === 0 && level !== 'high') {
      res = await invoke({ systemPrompt: ASSERT_SYSTEM, userPrompt: prompt, level: 'high', vendor: evalJudgeVendor(), timeout });
      if (res.success) j = extractJson(res.output) as typeof j;
    }
    const results = j?.results ?? [];
    if (!Array.isArray(results) || results.length !== claims.length || results.some((r) => !r || !['TRUE', 'FALSE', 'UNKNOWN'].includes(String(r.verdict).toUpperCase()))) {
      return { error: 'judge returned no assertion verdicts' };
    }
    return results.map((r) => ({ verdict: String(r.verdict).toUpperCase() as ClaimVerdict['verdict'], quotes: r.quotes, reason: r.reason, by: 'judge' as const }));
  } catch (e) {
    return { error: `judge exception: ${(e as Error).message}` };
  }
}

// The system prompts and the three mechanics (quote first, choose lower, reference) live in
// ./JudgePrompts.ts so the vision judge shares them and the calibration
// record can hash them. Re-exported for readers of this file.
export { RUBRIC_SYSTEM, ASSERT_SYSTEM, JUDGE_PROMPT_HASH };

/** The user prompt a rubric assert sends: rubric, anchors, reference (when the assert carries one), then the output. Pure. */
export function buildRubricPrompt(output: string, a: Assertion): string {
  const rubric = typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
  const scale = a.scale && a.scale !== 5 ? `\n\n## SCALE\nInteger 1–${a.scale}. The anchors are the whole scale; ${a.scale} is the top.` : '';
  return `## RUBRIC\n${rubric}${anchorBlock(a.anchors)}${scale}${referenceBlock(a.reference)}\n\n## OUTPUT\n${output}`;
}

/** The user prompt an llm-assert sends: output, reference (when present), the numbered assertions. Pure. */
export function buildAssertPrompt(output: string, a: Assertion): string {
  const assertions = Array.isArray(a.value) ? a.value.map(String) : [String(a.value)];
  return `## OUTPUT\n${output}${referenceBlock(a.reference)}\n\n## ASSERTIONS\n${assertions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

export interface JudgeOptions {
  level?: InferenceLevel; // judge level; default 'high' (distinct from a 'medium' agent-under-test)
  timeout?: number;
  /** Injectable only for deterministic tests. */
  invoke?: typeof judgeText;
  /** Accepted for call-site compatibility; unused in this port. */
  turn?: string;
  session?: string;
  questionId?: string;
}

/** Pull the last balanced {...} JSON object out of a text blob. Robust to fences + prose. */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  const candidates: string[] = [];
  if (fenced) for (const f of fenced) candidates.push(f.replace(/```(?:json)?/gi, '').trim());
  // Scan complete top-level objects, respecting braces inside JSON strings.
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (start < 0) { if (c === '{') { start = i; depth = 1; } continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { candidates.push(text.slice(start, i + 1)); start = -1; }
  }
  for (const c of candidates.reverse()) {
    try { return JSON.parse(c); } catch { /* try next */ }
  }
  return null;
}

/** Grade one model-based assertion (llm-rubric or llm-assert) against the output. The assert's `derived_from` lineage rides on the result so run.json keeps it. */
export async function judgeAssertion(
  output: string,
  a: Assertion,
  opts: JudgeOptions = {},
): Promise<AssertResult> {
  const r = await judgeAssertionInner(output, a, opts);
  return a.derived_from ? { ...r, derived_from: a.derived_from } : r;
}

/** The model a text pairwise or text judge call runs on: the judge level 'high' on the configured provider (never the top rung). */
export function textPairwiseModel(): string {
  const p = resolveProvider({ vendor: evalJudgeVendor() });
  return p ? modelFor(p, 'high') ?? p : 'unconfigured';
}

/** The user prompt a pairwise comparison sends. Pure. */
export function buildPairwisePrompt(a: string, b: string, question: string): string {
  return `## QUESTION\n${question}\n\n## CANDIDATE A\n${a}\n\n## CANDIDATE B\n${b}`;
}

/**
 * Text pairwise: which of two candidates answers the question better. Each
 * candidate is a file path (read) or a literal. Order matters to a model, so
 * Tournament.ts calls this twice per pair with the order flipped; this
 * function judges ONE ordering and never flips on its own.
 */
export interface TextPairwiseResult {
  winner: 'A' | 'B' | 'tie';
  reason: string;
  executed_model?: string;
}

export async function judgeTextPairwise(a: string, b: string, question: string, opts: JudgeOptions = {}): Promise<TextPairwiseResult> {
  const text = (c: string) => (existsSync(c) ? readFileSync(c, 'utf-8') : c);
  const prompt = buildPairwisePrompt(text(a), text(b), question);
  const res = await (opts.invoke ?? judgeText)({ systemPrompt: PAIRWISE_SYSTEM, userPrompt: prompt, level: opts.level ?? 'high', vendor: evalJudgeVendor(), timeout: opts.timeout ?? 60_000 });
  if (!res.success) throw new Error(`pairwise judge error: ${res.error}`);
  const j = extractJson(res.output) as { winner?: string; reason?: string } | null;
  const w = typeof j?.winner === 'string' ? j.winner.toUpperCase() : '';
  if ((w !== 'A' && w !== 'B' && w !== 'TIE') || typeof j?.reason !== 'string' || !j.reason.trim()) throw new Error('pairwise judge returned unparseable verdict');
  const winner = w === 'A' ? 'A' : w === 'B' ? 'B' : 'tie';
  return { winner, reason: String(j.reason), ...(res.executedModel ? { executed_model: res.executedModel } : {}) };
}

/**
 * Text pairwise on one named judge model (`JudgeCall.namedJudge`):
 * the caller chose the model on purpose, so calibrating or comparing judges measures that model and nothing else.
 */
export function namedPairwiseJudge(name: string): (a: string, b: string, question: string) => Promise<TextPairwiseResult> {
  const judge = namedJudge(name, PAIRWISE_SYSTEM);
  const text = (c: string) => (existsSync(c) ? readFileSync(c, 'utf-8') : c);
  // Three attempts per verdict, as Panel.judgeOne does: one timeout or malformed reply must not void a whole calibration run.
  return async (a, b, question) => {
    let last = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await judge.ask(buildPairwisePrompt(text(a), text(b), question));
      if (!res.ok) { last = `error: ${res.error ?? 'no reply'}`; continue; }
      const j = extractJson(res.text) as { winner?: string; reason?: string } | null;
      const w = typeof j?.winner === 'string' ? j.winner.toUpperCase() : '';
      if ((w !== 'A' && w !== 'B' && w !== 'TIE') || typeof j?.reason !== 'string' || !j.reason.trim()) { last = 'returned unparseable verdict'; continue; }
      return { winner: w === 'A' ? 'A' : w === 'B' ? 'B' : 'tie', reason: String(j.reason), ...(res.model ? { executed_model: res.model } : {}) };
    }
    throw new Error(`pairwise judge ${name} ${last} (3 attempts)`);
  };
}

async function judgeAssertionInner(output: string, a: Assertion, opts: JudgeOptions): Promise<AssertResult> {
  const weight = a.weight ?? 1;
  const level: InferenceLevel = opts.level ?? 'high';
  const timeout = opts.timeout ?? 45_000;
  const base = a.type.startsWith('not-') ? a.type.slice(4) : a.type;
  const negated = a.type.startsWith('not-');
  const invoke = opts.invoke ?? judgeText;

  try {
    if (base === 'llm-rubric') {
      const prompt = buildRubricPrompt(output, a);
      let res = await invoke({ systemPrompt: RUBRIC_SYSTEM, userPrompt: prompt, level, vendor: evalJudgeVendor(), timeout });
      if (!res.success) return { type: a.type, passed: false, score: 0, reason: `judge error: ${res.error}`, weight, unavailable: true };
      let j = extractJson(res.output);
      // Escalation: a cheap judge that can't produce a parseable verdict gets ONE
      // retry at 'high' before the assert fails — the calibrated-cheap-judge
      // default stays cheap on the happy path and never silently degrades.
      if ((!j || typeof j.score !== 'number') && level !== 'high') {
        res = await invoke({ systemPrompt: RUBRIC_SYSTEM, userPrompt: prompt, level: 'high', vendor: evalJudgeVendor(), timeout });
        if (res.success) j = extractJson(res.output);
      }
      const top = a.scale && a.scale > 1 ? a.scale : 5;
      if (!j || typeof j.score !== 'number' || !Number.isInteger(j.score) || j.score < MIN_SCORE_LEVEL || j.score > top || typeof j.pass !== 'boolean' || typeof j.reason !== 'string') {
        return { type: a.type, passed: false, score: 0, reason: 'judge returned unparseable verdict', weight, unavailable: true };
      }
      const norm = Math.max(0, Math.min(1, (Number(j.score) - 1) / (top - 1)));
      const reason = String(j.reason ?? '');
      const unknown = /^unknown:/i.test(reason.trim());
      const threshold = a.threshold ?? RUBRIC_PASS_BAR;
      let passed = !unknown && (j.pass === true) && norm >= threshold;
      let score = unknown ? 0 : norm;
      if (negated && !unknown) { passed = !passed; score = 1 - score; }
      return { type: a.type, passed, score, reason: reason || `score ${j.score}/5`, weight };
    }

    if (base === 'llm-assert') {
      const verdicts = await modelClaimVerdicts(output, a, opts);
      return 'error' in verdicts ? { type: a.type, passed: false, score: 0, reason: verdicts.error, weight, unavailable: true } : aggregateClaims(a, verdicts);
    }

    return { type: a.type, passed: false, score: 0, reason: `unsupported model assert: ${base}`, weight, unavailable: true };
  } catch (e) {
    return { type: a.type, passed: false, score: 0, reason: `judge exception: ${(e as Error).message}`, weight, unavailable: true };
  }
}

