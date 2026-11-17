/**
 * Judge — the model-graded assertion layer (llm-rubric, llm-assert, text pairwise).
 *
 * Adapted from MIT-licensed code (see LICENSE.txt).
 * Only the model-judge path exists: no judgment-engine first pass, calibration
 * records or vendor routing.
 * Calls go through ../_portable/inference.ts, so any configured provider works.
 *
 * Judge discipline: the judge quotes the deciding evidence first,
 * chooses the lower level when torn, grades against a REFERENCE when one is given, and
 * emits a machine-readable verdict; an "UNKNOWN:" verdict is scored as a miss. Run the
 * judge at a level distinct from whatever generated the text (default 'high').
 */

import { existsSync, readFileSync } from "node:fs";
import { inference, type InferenceLevel, type InferenceOptions, type InferenceResult } from "../_portable/inference.ts";

export interface Assertion {
  type: string; // "llm-rubric" | "llm-assert", optionally prefixed "not-"
  value?: unknown; // rubric text, or the assertion(s)
  threshold?: number; // rubric pass bar on the normalized 0..1 score (default 0.6)
  weight?: number; // default 1
  anchors?: Record<string, string>; // llm-rubric: written description per level ("1": "...", "5": "...")
  scale?: number; // llm-rubric: top of the integer scale (default 5)
  reference?: string; // text the judge grades against
}

export interface AssertResult {
  type: string;
  passed: boolean;
  score: number; // 0..1
  reason: string;
  weight: number;
  /** The evaluator failed or returned a malformed verdict, so this is not a quality result. */
  unavailable?: boolean;
  /** Semantic uncertainty is a miss, including for a negated assertion. */
  unknown?: boolean;
}

export interface JudgeOptions {
  level?: InferenceLevel; // judge level; default 'high'
  timeout?: number;
  /** Injectable for deterministic tests. */
  invoke?: (o: InferenceOptions) => Promise<InferenceResult>;
}

const RUBRIC_PASS_BAR = 0.6;
const MIN_SCORE_LEVEL = 1;

const QUOTE_FIRST = "Before choosing a level, quote the deciding phrases from the OUTPUT verbatim (two to four short quotes). A level with no quotes behind it is not allowed.";
const CHOOSE_LOWER = "When torn between two adjacent levels, choose the LOWER one.";

export const RUBRIC_SYSTEM = `You are a strict, fair evaluator grading an AI OUTPUT against a RUBRIC.

${QUOTE_FIRST} Then reason briefly about how the quoted evidence meets or misses the rubric (and the REFERENCE, when one is given — grade against the reference, never against your own reading of the topic). ${CHOOSE_LOWER} THEN emit exactly one fenced JSON block and nothing after it:
\`\`\`json
{"quotes": ["<verbatim>", "..."], "score": <integer on the scale given: 1-5 unless a SCALE block says otherwise>, "pass": <true|false>, "reason": "<one sentence>"}
\`\`\`
1 = fails the rubric, 5 = fully satisfies it. If you genuinely cannot determine it from the output, set "pass": false and begin "reason" with "UNKNOWN:". Judge only what is present; do not assume unstated facts.`;

export const ASSERT_SYSTEM = `You are a strict assertion checker. For each ASSERTION, decide if it is TRUE of the OUTPUT.

Evaluate each assertion against the OUTPUT and supplied REFERENCE. The reference supplies source facts and task context; it is not a second candidate response. Quote the minimum sufficient verbatim evidence, including the whole output when it is short. An assertion about the absence of a statement is assessed over the complete output and needs no invented quote. Assess response interpretation from what the response says; a claim about an actual external action still requires evidence of that action. If the available output and reference cannot establish the requested property, mark it UNKNOWN (which counts as not satisfied). When torn between TRUE and UNKNOWN, choose UNKNOWN. First reason briefly, THEN emit exactly one fenced JSON block and nothing after it:
\`\`\`json
{"results": [{"assertion": "<verbatim>", "quotes": ["<verbatim>"], "verdict": "TRUE|FALSE|UNKNOWN"}]}
\`\`\``;

export const PAIRWISE_SYSTEM = `You are comparing two candidate OUTPUTS, A (first) and B (second), on ONE question.
Before choosing, quote the deciding phrases from EACH candidate verbatim (one or two per side). Judge only the question asked; ignore length and polish unless the question is about them. If the candidates are equally good on the question, say tie: a tie is a real answer, not a failure. Output exactly one JSON object and nothing after it: {"quotes": {"A": ["<verbatim>"], "B": ["<verbatim>"]}, "winner": "A"|"B"|"tie", "reason": "<one sentence>"}`;

/** The rubric-side block for a `reference:` assert field; empty when absent. */
export function referenceBlock(reference: string | undefined): string {
  const r = (reference ?? "").trim();
  return r ? `\n\n## REFERENCE\nGrade against this, not against the title or your own reading of the topic:\n${r}` : "";
}

/** Written level descriptions turn a vague 1–5 into something a judge scores reliably. */
export function anchorBlock(anchors: Record<string, string> | undefined, heading = "## SCALE ANCHORS"): string {
  if (!anchors) return "";
  return `\n\n${heading}\n${Object.entries(anchors).map(([k, v]) => `${k}: ${v}`).join("\n")}`;
}

/** The user prompt a rubric assert sends: rubric, anchors, reference (when present), then the output. Pure. */
export function buildRubricPrompt(output: string, a: Assertion): string {
  const rubric = typeof a.value === "string" ? a.value : JSON.stringify(a.value);
  const scale = a.scale && a.scale !== 5 ? `\n\n## SCALE\nInteger 1–${a.scale}. The anchors are the whole scale; ${a.scale} is the top.` : "";
  return `## RUBRIC\n${rubric}${anchorBlock(a.anchors)}${scale}${referenceBlock(a.reference)}\n\n## OUTPUT\n${output}`;
}

/** The claims an llm-assert puts to the judge: every array item is one claim. Pure. */
export function assertClaims(a: Assertion): string[] {
  return Array.isArray(a.value) ? a.value.map(String) : [String(a.value)];
}

/** The user prompt an llm-assert sends: output, reference (when present), the numbered assertions. Pure. */
export function buildAssertPrompt(output: string, a: Assertion): string {
  return `## OUTPUT\n${output}${referenceBlock(a.reference)}\n\n## ASSERTIONS\n${assertClaims(a).map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

/** The user prompt a pairwise comparison sends. Pure. */
export function buildPairwisePrompt(a: string, b: string, question: string): string {
  return `## QUESTION\n${question}\n\n## CANDIDATE A\n${a}\n\n## CANDIDATE B\n${b}`;
}

/** Pull the last balanced {...} JSON object out of a text blob. Robust to fences + prose. */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  const candidates: string[] = [];
  if (fenced) for (const f of fenced) candidates.push(f.replace(/```(?:json)?/gi, "").trim());
  // Scan complete top-level objects, respecting braces inside JSON strings.
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (start < 0) { if (c === "{") { start = i; depth = 1; } continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { candidates.push(text.slice(start, i + 1)); start = -1; }
  }
  for (const c of candidates.reverse()) {
    try { return JSON.parse(c); } catch { /* try next */ }
  }
  return null;
}

type ClaimVerdict = { verdict: "TRUE" | "FALSE" | "UNKNOWN"; quotes?: string[]; reason?: string };

/** The assert result over its per-claim verdicts: passes only when every claim is TRUE; UNKNOWN is a miss. Pure. */
export function aggregateClaims(a: Assertion, verdicts: readonly ClaimVerdict[]): AssertResult {
  const n = verdicts.length;
  const trueCount = verdicts.filter((v) => v.verdict === "TRUE").length;
  const unknown = verdicts.some((v) => v.verdict === "UNKNOWN");
  let passed = n > 0 && trueCount === n;
  let score = n ? trueCount / n : 0;
  if (a.type.startsWith("not-") && !unknown) { passed = !passed; score = 1 - score; }
  if (unknown) { passed = false; score = 0; }
  const evidence = verdicts.map((v, k) => `${k + 1}. ${v.verdict}: ${JSON.stringify(v.quotes ?? [])}${v.reason ? ` — ${v.reason}` : ""}`).join("; ");
  return { type: a.type, passed, score, reason: `${unknown ? "UNKNOWN: " : ""}${trueCount}/${n} assertions TRUE; ${evidence}`, weight: a.weight ?? 1, ...(unknown ? { unknown: true } : {}) };
}

/** Grade one model-based assertion (llm-rubric or llm-assert) against the output. */
export async function judgeAssertion(output: string, a: Assertion, opts: JudgeOptions = {}): Promise<AssertResult> {
  const weight = a.weight ?? 1;
  const level: InferenceLevel = opts.level ?? "high";
  const timeout = opts.timeout ?? 45_000;
  const base = a.type.startsWith("not-") ? a.type.slice(4) : a.type;
  const negated = a.type.startsWith("not-");
  const invoke = opts.invoke ?? inference;

  try {
    if (base === "llm-rubric") {
      const prompt = buildRubricPrompt(output, a);
      let res = await invoke({ systemPrompt: RUBRIC_SYSTEM, userPrompt: prompt, level, timeout });
      if (!res.success) return { type: a.type, passed: false, score: 0, reason: `judge error: ${res.error}`, weight, unavailable: true };
      let j = extractJson(res.output);
      // A cheaper judge that cannot produce a parseable verdict gets ONE retry at 'high'.
      if ((!j || typeof j.score !== "number") && level !== "high") {
        res = await invoke({ systemPrompt: RUBRIC_SYSTEM, userPrompt: prompt, level: "high", timeout });
        if (res.success) j = extractJson(res.output);
      }
      const top = a.scale && a.scale > 1 ? a.scale : 5;
      if (!j || typeof j.score !== "number" || !Number.isInteger(j.score) || j.score < MIN_SCORE_LEVEL || j.score > top || typeof j.pass !== "boolean" || typeof j.reason !== "string") {
        return { type: a.type, passed: false, score: 0, reason: "judge returned unparseable verdict", weight, unavailable: true };
      }
      const norm = Math.max(0, Math.min(1, (Number(j.score) - 1) / (top - 1)));
      const reason = String(j.reason ?? "");
      const unknown = /^unknown:/i.test(reason.trim());
      const threshold = a.threshold ?? RUBRIC_PASS_BAR;
      let passed = !unknown && j.pass === true && norm >= threshold;
      let score = unknown ? 0 : norm;
      if (negated && !unknown) { passed = !passed; score = 1 - score; }
      return { type: a.type, passed, score, reason: reason || `score ${j.score}/${top}`, weight };
    }

    if (base === "llm-assert") {
      const claims = assertClaims(a);
      const prompt = buildAssertPrompt(output, a);
      let res = await invoke({ systemPrompt: ASSERT_SYSTEM, userPrompt: prompt, level, timeout });
      if (!res.success) return { type: a.type, passed: false, score: 0, reason: `judge error: ${res.error}`, weight, unavailable: true };
      let j = extractJson(res.output) as { results?: { verdict?: string; quotes?: string[]; reason?: string }[] } | null;
      if ((j?.results ?? []).length === 0 && level !== "high") {
        res = await invoke({ systemPrompt: ASSERT_SYSTEM, userPrompt: prompt, level: "high", timeout });
        if (res.success) j = extractJson(res.output) as typeof j;
      }
      const results = j?.results ?? [];
      if (!Array.isArray(results) || results.length !== claims.length || results.some((r) => !r || !["TRUE", "FALSE", "UNKNOWN"].includes(String(r.verdict).toUpperCase()))) {
        return { type: a.type, passed: false, score: 0, reason: "judge returned unparseable verdict", weight, unavailable: true };
      }
      return aggregateClaims(a, results.map((r) => ({ verdict: String(r.verdict).toUpperCase() as ClaimVerdict["verdict"], quotes: r.quotes, reason: r.reason })));
    }

    return { type: a.type, passed: false, score: 0, reason: `unsupported model assert: ${base}`, weight, unavailable: true };
  } catch (e) {
    return { type: a.type, passed: false, score: 0, reason: `judge exception: ${(e as Error).message}`, weight, unavailable: true };
  }
}

export interface TextPairwiseResult {
  winner: "A" | "B" | "tie";
  reason: string;
  executed_model?: string;
}

/**
 * Text pairwise: which of two candidates answers the question better. Each candidate is a
 * file path (read) or a literal. Order matters to a model, so callers judge each pair twice
 * with the order flipped; this function judges ONE ordering and never flips on its own.
 */
export async function judgeTextPairwise(a: string, b: string, question: string, opts: JudgeOptions = {}): Promise<TextPairwiseResult> {
  const text = (c: string) => (existsSync(c) ? readFileSync(c, "utf-8") : c);
  const prompt = buildPairwisePrompt(text(a), text(b), question);
  const res = await (opts.invoke ?? inference)({ systemPrompt: PAIRWISE_SYSTEM, userPrompt: prompt, level: opts.level ?? "high", timeout: opts.timeout ?? 60_000 });
  if (!res.success) throw new Error(`pairwise judge error: ${res.error}`);
  const j = extractJson(res.output) as { winner?: string; reason?: string } | null;
  const w = typeof j?.winner === "string" ? j.winner.toUpperCase() : "";
  if ((w !== "A" && w !== "B" && w !== "TIE") || typeof j?.reason !== "string" || !j.reason.trim()) throw new Error("pairwise judge returned unparseable verdict");
  const winner = w === "A" ? "A" : w === "B" ? "B" : "tie";
  return { winner, reason: String(j.reason), ...(res.executedModel ? { executed_model: res.executedModel } : {}) };
}
