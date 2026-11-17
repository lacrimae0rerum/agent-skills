#!/usr/bin/env bun
/**
 * EvalRunner — assertion-first suite runner (v2).
 *
 * A CASE is `{id, prompt, assert:[...]}`. The agent-under-test runs the prompt with the
 * suite's system prompt (its `system_prompt`, its `system_prompt_file`, or the agent
 * instructions named by ASSAY_SYSTEM_PROMPT_FILE), producing real output. Each assertion
 * is graded deterministically (Assertions.ts) or by the model judge (Judge.ts). Cases run
 * `trials` times; we report pass^k (all trials pass — the honest metric for a
 * reliability-critical agent) alongside pass@k. Every model call goes through the
 * portable inference helper (Tools/_portable/inference.ts), so any configured provider works.
 *
 * Suite resolution order: the user's suites first (identity-bound suites live outside any
 * repo), then ASSAY_SUITE_DIRS, then the skill's own generic Suites/. A path to a suite
 * file runs from any folder.
 *
 * Anthropic doctrine encoded: grade the OUTPUT not the path; capability vs
 * regression; partial credit via weighted asserts; balanced should-do/should-not
 * via `not-*` and negative cases. Read transcripts — every run persists them.
 *
 * Adapted from MIT-licensed code (see LICENSE.txt). A hosted judgment layer, proof receipts,
 * router and state files are not included.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { evaluateDeterministic, isModelAssert, isJudgedAssert, type Assertion, type AssertResult } from './Assertions.ts';
import { judgeAssertion, type JudgeOptions } from './Judge.ts';
import { validateSuite } from './SuiteManager.ts';
import { summarize, type Summary } from './Stats.ts';
import { judgeLevelForModel } from './JudgeLevel.ts';
import { inference, type InferenceLevel, type InferenceVendor } from './_portable/inference.ts';
import { getEnv } from './_portable/paths.ts';
import { invariant } from './_portable/invariant.ts';
import { evalJudgeVendor } from './lib/JudgeCall.ts';
import { calibrationStatus, provisionalOf, type Provisional } from './lib/Calibration.ts';
import { tasteFor, withTasteValue } from './lib/CalibrateTaste.ts';
import { defaultSystemPrompt, parseYaml, resolveSuiteIn, resolveSuitePath, resultsDir as defaultResultsDir, SKILL_SUITES, userSuitesDir } from './lib/AssayPaths.ts';

export const USER_SUITES = userSuitesDir();
export { SKILL_SUITES };

export interface EvalCase {
  id: string;
  prompt: string;
  assert: Assertion[];
  threshold?: number;
  negative?: boolean; // documents a should-NOT case (balance); no behavior change
  /** A canned output that passes every deterministic assert on this case and only the judge can catch. The runner grades it every run; a judge that passes it is not load-bearing and the suite fails. */
  adversarial_output?: string;
}

export interface EvalSuiteV2 {
  /** These receipts must come from an actual harness adapter, never single-shot inference. */
  requires_context?: string[];
  name: string;
  type?: 'capability' | 'regression';
  pass_threshold?: number;
  agent_level?: InferenceLevel;
  judge_level?: InferenceLevel;
  judge_model?: string; // tier alias or model id; resolved via JudgeLevel.ts (capped at 'high'). Wins over judge_level.
  trials?: number;
  subject_timeout_ms?: number; // per-answer timeout for the model under test (default 90000); a large system prompt (a long intent) needs more
  system_prompt?: string; // override; default = ASSAY_SYSTEM_PROMPT_FILE, else a minimal prompt
  system_prompt_file?: string; // REPLACES the system prompt with this file's content (~ ok; relative to the suite file; `skill:<name>/<path>` for another installed skill). For skill suites: point at the SKILL.md.
  append_to_base?: boolean; // with system_prompt_file: append to the default base prompt instead of replacing — for suites judging identity-bound properties (voice) where the skill alone would fail for the wrong reason.
  /** Calibrate target whose Taste.json the judged asserts read. Defaults to the suite name; `none` opts out. */
  calibration?: string;
  cases: EvalCase[];
}

/** Appends the user's calibrated taste (the calibrate skill's Taste.json) to every string-valued judged assert. No profile, no change. */
export function applyCalibrationTaste<T extends { name: string; calibration?: string; cases?: EvalCase[] }>(suite: T): T {
  const taste = suite.calibration === 'none' ? null : tasteFor(suite.calibration ?? suite.name);
  if (!taste || !Array.isArray(suite.cases)) return suite;
  return { ...suite, cases: suite.cases.map(c => ({ ...c, assert: (c.assert ?? []).map(a => isJudgedAssert(a.type) && typeof a.value === 'string' ? { ...a, value: withTasteValue(a.value, taste) } : a) })) };
}

/**
 * Calibrated-cheap-judge default (Anthropic ships haiku as its plugin-eval
 * judge default; docs require model graders be calibrated against human
 * grading). A suite whose judge has an EARNED calibration record — agreement,
 * kappa, per-rung counts, and nothing stale (judge chain, rubric, labels), the
 * one rule in Tools/lib/Calibration.ts — gets the cheap judge; without
 * one the judge stays 'high'. Explicit judge_model / judge_level always wins.
 * The calibration dir is resolved per call (ASSAY_CALIBRATION_DIR in tests).
 */
export function defaultJudgeLevel(suiteName: string, dir?: string, suiteDirs?: string[]): { level: InferenceLevel; calibrated: boolean; reason: string } {
  const s = calibrationStatus(suiteName, { dir, suiteDirs });
  return { level: s.level, calibrated: s.calibrated, reason: s.reason };
}

/**
 * The provisional marker: a suite with judged asserts whose
 * judge has no earned calibration is provisional, and says so with the age in
 * days since its oldest persisted run. Pure over its dirs; the runner calls it
 * after the trials, tests call it on fixtures.
 */
export function provisionalReport(suiteName: string, judgedAsserts: number, opts: { calibrationDir?: string; resultsDir?: string; now?: number; suiteDirs?: string[] } = {}): Provisional {
  const status = calibrationStatus(suiteName, { dir: opts.calibrationDir, suiteDirs: opts.suiteDirs });
  return provisionalOf(suiteName, judgedAsserts, { status, dir: opts.calibrationDir, resultsDir: opts.resultsDir, now: opts.now });
}

/** Provenance accompanies calibrated results; assistant agreement is not human validation. */
export function calibrationProvenance(suiteName: string, eligible: boolean, suiteDirs?: string[]): { label_basis: 'user' | 'assistant' | 'mixed' | 'unspecified'; human_validated: boolean } {
  const status = calibrationStatus(suiteName, { suiteDirs });
  return { label_basis: status.record?.label_basis ?? 'unspecified', human_validated: eligible && status.calibrated && status.record?.human_validated === true };
}

export interface CaseResult {
  adversarial_asserts?: AssertResult[];
  id: string;
  mean_score: number;
  pass_at_k: number;
  pass_to_k: number;
  /** Trials whose inference call failed (timeout, refusal, envelope error). Not model failures. */
  infra_errors: number;
  trials: { score: number; passed: boolean; asserts: AssertResult[]; output: string; error?: string; model?: string; harness?: unknown }[];
}

export interface SuiteResult {
  suite: string;
  /** The suite file this run executed; the calibrate skill finds a suite through it. */
  suite_path?: string;
  type: string;
  passed: boolean;
  score: number; // suite mean
  pass_to_k: number; // headline: mean per-case pass^k
  pass_at_k: number;
  summary: string;
  run_id: string;
  /** Trials or adversarial checks with no evaluator verdict. Excluded from every denominator. */
  infra_errors: number;
  /** Any unavailable evaluator makes this run no-verdict.
   * Exit code 2; latest.json retains its valid verdict. */
  verifier_unavailable: boolean;
  cases: { id: string; mean_score: number; pass_to_k: number; pass_at_k: number; infra_errors: number }[];
  /** Never a bare mean (Anthropic statistical doctrine): SEM + 95% CI over per-case means. */
  stats?: Summary;
  /** Judge-shrinkage metric: fraction of the suite's assertions that are model-graded.
   * The doctrine goal is for this number to FALL over time as judged claims are
   * mined into deterministic asserts. */
  judged_residue?: number;
  agent_level?: InferenceLevel;
  /** The model under test: ASSAY_SUBJECT_MODEL when set, else `<vendor or provider default>:<level>`. */
  agent_model?: string;
  judge_level?: InferenceLevel | 'vision'; // 'vision' = image lane (VisionJudge)
  judge_calibrated?: boolean;
  label_basis?: 'user' | 'assistant' | 'mixed' | 'unspecified';
  human_validated?: boolean;
  /** Judged asserts with no earned calibration record. The suite still runs and scores; every surface says so. */
  provisional?: boolean;
  /** Days since the suite's oldest persisted run — how long the provisional verdicts have accumulated. */
  provisional_age_days?: number | null;
  provisional_reason?: string;
  /** Adversarial fixtures graded this run and how many the judge caught. cases > caught fails the suite. */
  adversarial?: { cases: number; caught: number; missed: string[] };
  duration_ms?: number;
  ts?: string;
}

/** Injectable dependencies keep unavailable-verifier semantics testable without paid inference. */
export interface EvalRunDeps {
  invoke?: typeof inference;
  /** Void trials whose served model is not the pinned subject model. Default: on for the real inference path, off for an injected invoker. */
  assertServedModel?: boolean;
  judge?: typeof judgeAssertion;
  resultsDir?: string;
  judgeOptions?: JudgeOptions;
}

/** Run work in input order without allowing a suite to fan out unbounded inference calls. */
export async function boundedPool<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export function resolveSuite(name: string): string | null {
  return resolveSuiteIn(name);
}

/** Every assert on one output. Judged asserts ride `judge` (Judge.ts by default; injectable for tests); the result keeps the assert's `derived_from` lineage, and run.json persists it. */
export async function applyAsserts(output: string, asserts: Assertion[], judgeLevel: InferenceLevel, judge: typeof judgeAssertion = judgeAssertion, session?: string): Promise<AssertResult[]> {
  // Evaluate prerequisites on the same immutable output before any model call,
  // while retaining declaration order in persisted results.
  const out: AssertResult[] = new Array(asserts.length);
  const record = (a: Assertion, r: AssertResult): AssertResult => ({
    ...r,
    required: a.required ?? !isModelAssert(a.type),
    ...(a.derived_from ? { derived_from: a.derived_from } : {}),
  });
  for (const [i, a] of asserts.entries()) {
    if (!isModelAssert(a.type)) out[i] = record(a, evaluateDeterministic(output, a));
  }
  const blocked = out.some((r) => r?.required && !r.passed);
  await Promise.all(asserts.map(async (a, i) => {
    if (!isModelAssert(a.type)) return;
    const r = blocked
      ? { type: a.type, passed: false, score: 0, weight: a.weight ?? 1, skipped: true, reason: 'Skipped: required deterministic prerequisite failed' }
      : await judge(output, a, { level: judgeLevel, session });
    out[i] = record(a, r);
  }));
  return out;
}

function weighted(results: AssertResult[]): number {
  const tw = results.reduce((s, r) => s + r.weight, 0);
  return tw > 0 ? results.reduce((s, r) => s + r.score * r.weight, 0) / tw : 0;
}

/** Required failures cannot be bought off by weights or a permissive threshold. */
export function scoreAssertions(results: AssertResult[], threshold: number): { score: number; passed: boolean } {
  const blocked = results.some((r) => r.skipped || (r.required && !r.passed));
  const score = blocked ? 0 : weighted(results);
  return { score, passed: !blocked && score >= threshold };
}

export async function runSuite(name: string, override: Partial<EvalSuiteV2> = {}, deps: EvalRunDeps = {}): Promise<SuiteResult> {
  const experiment = Object.keys(override).length > 0 || !!deps.invoke || !!deps.judge;
  const RESULTS_DIR = defaultResultsDir();
  const resultsDir = deps.resultsDir ?? (experiment ? join(RESULTS_DIR, 'experiments') : RESULTS_DIR);
  async function persist(result: SuiteResult, detail: CaseResult[] = []): Promise<SuiteResult> {
    invariant(/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name), 'suite result name must be a safe path component');
    invariant(!result.verifier_unavailable || !result.passed, 'unavailable evidence cannot pass');
    const dir = join(resultsDir, name);
    mkdirSync(join(dir, result.run_id), { recursive: true });
    const runFile = join(dir, result.run_id, 'run.json');
    if (path) result.suite_path = path;
    writeFileSync(runFile, JSON.stringify({ ...result, detail }, null, 2));
    if (!result.verifier_unavailable) writeFileSync(join(dir, 'latest.json'), JSON.stringify(result, null, 2));
    return result;
  }
  const path = resolveSuite(name);
  let suite: EvalSuiteV2;
  if (path) {
    suite = { ...(parseYaml(readFileSync(path, 'utf-8')) as EvalSuiteV2), ...override };
    // A path or qualified lookup persists under the declared safe suite name.
    if (name.includes('/') || /\.ya?ml$/i.test(name)) name = suite.name;
  } else if (override.cases?.length) {
    // Inline/ephemeral suite (e.g. a drafted case dry-run) — no file needed.
    suite = { name, cases: [], ...override } as EvalSuiteV2;
  } else {
    return { suite: name, type: 'unknown', passed: false, score: 0, pass_to_k: 0, pass_at_k: 0, summary: `Suite not found: ${name}`, run_id: 'error', infra_errors: 0, verifier_unavailable: false, cases: [] };
  }
  suite = applyCalibrationTaste(suite);
  // ported from a community contribution
  // Diagnose a v1 suite instead of dying on `for (const c of undefined)`. The
  // a legacy v1 suite uses the `tasks:` list,
  // so running it threw a bare TypeError — and callers that catch broadly
  // turned that into a regression eval which silently never ran. The two formats are not mechanically convertible: UseCases/*.yaml
  // define weighted graders and carry no `prompt`, so there is nothing for this
  // single-shot runner to send. Say so rather than guess.
  //
  // Returned, not thrown (a community-reported bug): an unrunnable suite
  // is the same operational fact as a failing one, so it takes the same shape as
  // the "Suite not found" path above — passed:false, run_id:'error', a named
  // summary. Callers keep working unchanged, and the CLI still exits 1.
  if (!Array.isArray(suite.cases) || suite.cases.length === 0) {
    const legacy = (suite as unknown as { tasks?: unknown[] }).tasks;
    const summary = Array.isArray(legacy)
      ? `Suite '${name}' is in the legacy v1 format: it lists ${legacy.length} \`tasks:\` that define graders and no \`prompt\`. This runner needs v2 \`cases:\` with prompt/assert. Run a v2 suite (e.g. core-dispositions), or convert this one.`
      : `Suite '${name}' has no \`cases:\` to run.`;
    return { suite: name, type: 'unknown', passed: false, score: 0, pass_to_k: 0, pass_at_k: 0, summary, run_id: 'error', infra_errors: 0, verifier_unavailable: false, cases: [] };
  }
  const validation = validateSuite(suite, 'text');
  if (!validation.ok) return { suite: name, type: suite.type ?? 'unknown', passed: false, score: 0, pass_to_k: 0, pass_at_k: 0, summary: `Invalid suite: ${validation.errors.join('; ')}`, run_id: 'error', infra_errors: 1, verifier_unavailable: true, cases: [] };
  if (suite.requires_context?.length && !deps.invoke) return persist({ suite: name, type: suite.type ?? 'unknown', passed: false, score: 0, pass_to_k: 0, pass_at_k: 0, summary: 'verifier unavailable — requires an actual harness adapter with context receipts', run_id: `run_${Date.now()}_preflight`, ts: new Date().toISOString(), infra_errors: 1, verifier_unavailable: true, cases: [] });
  const threshold = suite.pass_threshold ?? 0.75;
  const trials = suite.trials ?? 3;
  // The model under test: ASSAY_SUBJECT_MODEL / ASSAY_SUBJECT_VENDOR pin it (the model the user's agent
  // runs on); otherwise the inference helper's default provider at the suite's agent_level. A pinned
  // subject model is checked on every trial: a trial served by another model measures nothing about it.
  const agentLevel: InferenceLevel = suite.agent_level ?? 'high';
  const subjectModel = getEnv('ASSAY_SUBJECT_MODEL');
  const subjectVendorEnv = getEnv('ASSAY_SUBJECT_VENDOR');
  const subjectVendor = subjectVendorEnv === 'anthropic' || subjectVendorEnv === 'openai' ? subjectVendorEnv as InferenceVendor : undefined;
  const subjectRoute = { ...(subjectVendor ? { vendor: subjectVendor } : {}), ...(subjectModel ? { model: subjectModel } : {}) };
  // Judge resolution order: explicit judge_model (alias/id → level, capped at
  // 'high') > explicit judge_level > calibrated-cheap default.
  const calibDefault = defaultJudgeLevel(name);
  const judgeLevel: InferenceLevel = suite.judge_model
    ? judgeLevelForModel(suite.judge_model)
    : suite.judge_level ?? calibDefault.level;
  const judgeCalibrated = Object.keys(override).length === 0 && !suite.judge_model && calibDefault.calibrated && judgeLevel === calibDefault.level;
  if (suite.agent_level && judgeLevel === agentLevel) {
    console.log(`  ⚠️ judge_level equals agent_level ('${judgeLevel}') — Anthropic best practice is a distinct judge.`);
  }
  if (subjectVendor && evalJudgeVendor() === subjectVendor) {
    console.log(`  ⚠️ judge and subject share the vendor '${subjectVendor}' — set ASSAY_JUDGE_VENDOR to the other vendor for a cross-vendor judge.`);
  }
  const startedAt = Date.now();
  // Eval-context suffix: the agent-under-test runs single-shot with NO tools.
  // Without this, the full agentic system prompt makes it narrate/simulate tool
  // calls and defer the answer, so the eval measures "reaches for tools" instead
  // of the target disposition. This keeps the task unambiguous (Anthropic Step 2)
  // while preserving verify discipline — it can still caveat what it would check.
  const EVAL_CONTEXT =
    '\n\n---\n[EVALUATION CONTEXT] You are being evaluated in a single-shot setting with NO tools available. ' +
    'Do not narrate or simulate tool calls. Give your best final answer directly, applying your normal judgment, ' +
    'voice, and verification discipline within the answer itself (e.g. state plainly when something would need checking).';
  let basePrompt = suite.system_prompt ?? defaultSystemPrompt();
  if (suite.system_prompt_file) {
    const resolved = resolveSuitePath(suite.system_prompt_file, path);
    if (!existsSync(resolved)) throw new Error(`suite ${suite.name}${path ? ` (${path})` : ''}: system_prompt_file ${suite.system_prompt_file} resolves to ${resolved}, which does not exist`);
    const fileContent = readFileSync(resolved, 'utf-8');
    // Replace by default (parallel to system_prompt); append_to_base opts into
    // base+file for suites judging identity-bound properties like voice.
    basePrompt = suite.append_to_base ? `${defaultSystemPrompt()}\n\n---\n\n${fileContent}` : fileContent;
  }
  const systemPrompt = basePrompt + EVAL_CONTEXT;
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const invoke = deps.invoke ?? inference;
  const judge = deps.judge ?? judgeAssertion;

  const caseResults: CaseResult[] = [];
  const adversarial = { cases: 0, caught: 0, missed: [] as string[] };
  let adversarialInfraErrors = 0;
  const trialRuns: Array<Promise<Array<{ res: Awaited<ReturnType<typeof inference>>; asserts: AssertResult[] }>>> = [];
  // Barrier: finish every model run, enqueue every eligible output, then flush once per trial.
  const trialRun = (trial: number) => trialRuns[trial] ??= (async () => {
    const responses = await boundedPool(suite.cases, 8, c => invoke({ systemPrompt, userPrompt: c.prompt, level: agentLevel, ...subjectRoute, timeout: suite.subject_timeout_ms ?? 90_000 }));
    const checks = responses.map((res, index) => {
      // Served-model assertion: a trial answered by a model other than the one requested
      // measures nothing about the subject, so it is voided, never scored. An injected invoker
      // (a harness adapter, a test) reports its own identity and is not checked here.
      if (subjectModel && res.success && (deps.assertServedModel ?? !deps.invoke) && res.executedModel && res.executedModel !== subjectModel) {
        res.success = false; res.error = `served_model_mismatch: asked ${subjectModel}, served ${res.executedModel}`;
      }
      if (res.success && suite.requires_context?.length) {
        const context = (res as unknown as { harness?: { context?: Record<string, string> } }).harness?.context;
        if (suite.requires_context.some(key => !/^[a-f0-9]{64}$/.test(context?.[key] ?? ''))) {
          res.success = false; res.error = 'required harness context receipts missing';
        }
      }
      const c = suite.cases[index];
      return res.success ? applyAsserts(res.output.trim(), c.assert, judgeLevel, judge, runId) : Promise.resolve([]);
    });
    const asserts = await Promise.all(checks);
    return responses.map((res, index) => ({ res, asserts: asserts[index] }));
  })();
  await Promise.all(suite.cases.map(async (c, caseIndex) => {
    const caseThreshold = c.threshold ?? threshold;
    let adversarialAsserts: AssertResult[] | undefined;
    if (typeof c.adversarial_output === 'string') {
      // Recheck prerequisites at execution time too: an inline or edited suite
      // may not have passed SuiteManager validation.
      adversarial.cases++;
      const checked = await applyAsserts(c.adversarial_output, c.assert, judgeLevel, judge, runId);
      adversarialAsserts = checked;
      const judged = checked.filter((r) => isModelAssert(r.type));
      const unavailable = judged.some((r) => r.unavailable);
      if (unavailable) adversarialInfraErrors++;
      const caught = !unavailable && checked.filter((r) => !isModelAssert(r.type)).every((r) => r.passed)
        && judged.some((r) => !r.skipped && !r.passed && !/^unknown:/i.test(r.reason.trim()));
      if (caught) adversarial.caught++; else adversarial.missed.push(c.id);
      console.log(`  ${c.id} adversarial: ${unavailable ? '⚠️ verifier unavailable — no verdict' : caught ? '🪤 caught' : '❌ MISSED — the judge passed the fixture the asserts cannot catch'}`);
    }
    const trialResults: CaseResult['trials'] = [];
    for (let t = 0; t < trials; t++) {
      const { res, asserts } = (await trialRun(t))[caseIndex];
      if (!res.success) {
        // An inference failure is the verifier being unavailable, not the model
        // failing the case. It is recorded, excluded from every score, and never
        // read as a regression (an unavailable verifier means defer, never fail).
        const error = res.error || 'inference failed';
        trialResults.push({ score: 0, passed: false, asserts: [], output: '', error });
        console.log(`  ${c.id} t${t + 1}: ⚠️ verifier unavailable — ${error.split('\n')[0].slice(0, 120)}`);
        continue;
      }
      const output = res.output.trim();
      const unavailable = asserts.find((r) => r.unavailable);
      if (unavailable) {
        const error = unavailable.reason;
        trialResults.push({ score: 0, passed: false, asserts, output, error });
        console.log(`  ${c.id} t${t + 1}: ⚠️ evaluator unavailable — ${error.split('\n')[0].slice(0, 120)}`);
        continue;
      }
      const { score, passed } = scoreAssertions(asserts, caseThreshold);
      trialResults.push({ score, passed, asserts, output, ...(res.executedModel ? { model: res.executedModel } : {}),
        ...('harness' in res ? { harness: res.harness } : {}) });
      console.log(`  ${c.id} t${t + 1}: ${passed ? '✅' : '❌'} ${(score * 100).toFixed(0)}%`);
    }
    const valid = trialResults.filter((t) => t.error === undefined);
    const passed = valid.filter((t) => t.passed).length;
    caseResults[caseIndex] = {
      id: c.id,
      ...(adversarialAsserts ? { adversarial_asserts: adversarialAsserts } : {}),
      infra_errors: trialResults.length - valid.length,
      mean_score: valid.length ? valid.reduce((s, t) => s + t.score, 0) / valid.length : 0,
      pass_at_k: passed > 0 ? 1 : 0,
      // ported from a community contribution
      // pass^k is "every one of the k trials passed" — a reliability measure.
      // passed/trials is the MEAN, which reported 2-of-3 as 67% where the true
      // pass^k is 0, making a flaky case look like a mostly-passing one. Recorded
      // scores drop wherever trials partially pass; that is the corrected
      // semantics, not a regression — historical numbers are not comparable.
      // A partial trial set cannot establish pass^k, even if all completed trials passed.
      pass_to_k: valid.length === trials && passed === trials ? 1 : 0,
      trials: trialResults,
    };
  }));

  const meanScore = caseResults.reduce((s, c) => s + c.mean_score, 0) / caseResults.length;
  const passToK = caseResults.reduce((s, c) => s + c.pass_to_k, 0) / caseResults.length;
  const passAtK = caseResults.reduce((s, c) => s + c.pass_at_k, 0) / caseResults.length;
  const suiteType = suite.type ?? 'regression';
  // Regression gates on pass^k — "regression evals target ~100%" and pass^k is
  // the reliability metric; a mean gate let 2-of-3 flaky passes look healthy.
  // Capability keeps the mean gate (a hill being climbed reports progress).
  const infraErrors = caseResults.reduce((s, c) => s + c.infra_errors, 0) + adversarialInfraErrors;
  // An unavailable evaluator leaves this run with no quality verdict. Keep the
  // transcript for diagnosis, but never replace last known-valid state.
  const verifierUnavailable = infraErrors > 0;
  const passedByScore = !verifierUnavailable && (suiteType === 'regression' ? passToK >= threshold : meanScore >= threshold);
  const passed = passedByScore && adversarial.caught === adversarial.cases;
  const stats = summarize(caseResults.map((c) => c.mean_score));
  const allAsserts = suite.cases.flatMap((c) => c.assert ?? []);
  const judgedCount = allAsserts.filter((a) => isModelAssert(a.type)).length;
  const judgedResidue = allAsserts.length === 0 ? 0 : judgedCount / allAsserts.length;

  const provisional = provisionalReport(name, judgedCount, { resultsDir });
  if (judgedCount > 0 && !judgeCalibrated && !provisional.provisional) {
    provisional.provisional = true;
    provisional.reason = 'runtime suite or judge configuration is not covered by calibration';
  }
  const result: SuiteResult = {
    suite: name,
    type: suiteType,
    passed,
    score: meanScore,
    pass_to_k: passToK,
    pass_at_k: passAtK,
    summary: verifierUnavailable
      ? `verifier unavailable — ${infraErrors} trial${infraErrors === 1 ? '' : 's'} had no evaluator verdict; no verdict`
      : `pass^k ${(passToK * 100).toFixed(0)}%, mean ${(meanScore * 100).toFixed(1)}% ±${(stats.sem * 100).toFixed(1)} over ${trials} trials${infraErrors ? ` (${infraErrors} trial${infraErrors === 1 ? '' : 's'} excluded: verifier unavailable)` : ''}`,
    run_id: runId,
    infra_errors: infraErrors,
    verifier_unavailable: verifierUnavailable,
    cases: caseResults.map((c) => ({ id: c.id, mean_score: c.mean_score, pass_to_k: c.pass_to_k, pass_at_k: c.pass_at_k, infra_errors: c.infra_errors })),
    stats,
    judged_residue: judgedResidue,
    agent_level: agentLevel,
    agent_model: subjectModel ?? `${subjectVendor ?? 'default'}:${agentLevel}`,
    judge_level: judgeLevel,
    judge_calibrated: judgeCalibrated,
    ...calibrationProvenance(name, judgedCount > 0 && judgeCalibrated),
    adversarial,
    provisional: provisional.provisional,
    provisional_age_days: provisional.age_days,
    provisional_reason: provisional.reason,
    duration_ms: Date.now() - startedAt,
    ts: new Date().toISOString(),
  };

  return persist(result, caseResults);
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      suite: { type: 'string', short: 's' },
      trials: { type: 'string', short: 't' },
      json: { type: 'boolean' },
      report: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });
  if (values.help || !values.suite) {
    console.log(`EvalRunner — assertion-first suite runner\n\n  bun run EvalRunner.ts -s <suite> [-t trials] [--json]\n\nExit 0 = passed, 1 = regressed, 2 = evaluator unavailable (no verdict).`);
    process.exit(values.help ? 0 : 1);
  }
  const override: Partial<EvalSuiteV2> = {};
  if (values.trials) override.trials = parseInt(values.trials);
  console.log(`\nRunning suite: ${values.suite}\n`);
  const result = await runSuite(values.suite, override);
  if (values.json && !values.report) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n📊 ${result.verifier_unavailable ? '⚠️ NO VERDICT' : result.passed ? '✅ PASSED' : '❌ REGRESSED'}: ${result.suite} (${result.type})`);
    console.log(`   ${result.summary}`);
    if (result.stats) console.log(`   95% CI [${(result.stats.ci95_lo * 100).toFixed(1)}%, ${(result.stats.ci95_hi * 100).toFixed(1)}%] over ${result.stats.n} cases`);
    console.log(`   judge: ${result.judge_level}${result.judge_calibrated ? ' (calibrated-cheap)' : ''}${result.provisional ? ` · ${result.provisional_reason?.startsWith('proxy:') ? 'PROXY' : 'PROVISIONAL'} (${result.provisional_age_days ?? '?'}d: ${result.provisional_reason})` : ''} · judged residue ${((result.judged_residue ?? 0) * 100).toFixed(0)}% · ${((result.duration_ms ?? 0) / 1000).toFixed(0)}s`);
    for (const c of result.cases) console.log(`   - ${c.id}: pass^k ${(c.pass_to_k * 100).toFixed(0)}%  mean ${(c.mean_score * 100).toFixed(0)}%`);
  }
  process.exit(result.verifier_unavailable ? 2 : result.passed ? 0 : 1);
}
