/**
 * Calibration — the one definition of what a calibrated judge is.
 *
 * Every reader of a calibration record (EvalRunner's judge default and provisional marker,
 * SuiteManager, Tournament, Calibrate.ts itself) goes through this module so no two of them can
 * disagree about "earned".
 *
 * EARNED: the user's own pass/fail labels for the suite's judged asserts, run through the judge
 * that executes today, clear both floors (agreement ≥ 0.85, Cohen's kappa ≥ 0.40; override with
 * ASSAY_FLOOR_AGREEMENT / ASSAY_FLOOR_KAPPA), with at least MIN_PER_RUNG labels on each side for
 * every distinct judged assert, and nothing is stale. Labels that come from a model, the assistant
 * or the deterministic layer make the record `proxy`, which never reads earned.
 *
 * STALE: the judge chain (vendor + model per level), the judge prompts, the rubric text, the suite's
 * judge configuration and the label file must be unchanged since the record was written.
 *
 * Directories are resolved PER CALL from the environment, never at import
 * (Tools/lib/AssayPaths.ts: ASSAY_CALIBRATION_DIR, ASSAY_RESULTS_DIR, ASSAY_SUITE_DIRS).
 *
 * Adapted from MIT-licensed code (see LICENSE.txt). There is no label store, caller
 * registry or router; the record itself carries earned.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { getEnv } from "../_portable/paths.ts";
import { modelFor as providerModel, resolveProvider, type InferenceLevel } from "../_portable/inference.ts";
import { JUDGE_PROMPT_HASH } from "./JudgePrompts.ts";
import { calibrationDir as assayCalibrationDir, parseYaml, resultsDir, SKILL_DIR, suiteDirs } from "./AssayPaths.ts";
import { resolveVisionJudge, type VisionRubricConfig } from './VisionJudgeConfig.ts';

type EffortLevel = InferenceLevel;

export type CalibrationFloors = { agreement: number; kappa: number };
export const DEFAULT_FLOORS: CalibrationFloors = { agreement: 0.85, kappa: 0.4 };

function floorEnv(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`${name} must be a number between 0 and 1 (got "${raw}")`);
  return n;
}

/** The agreement and Cohen's-kappa floors an earned calibration record clears, read per call. */
export function calibrationFloors(): CalibrationFloors {
  return { agreement: floorEnv("ASSAY_FLOOR_AGREEMENT", DEFAULT_FLOORS.agreement), kappa: floorEnv("ASSAY_FLOOR_KAPPA", DEFAULT_FLOORS.kappa) };
}
export const MIN_PER_RUNG = 2;
/** A provisional suite older than this many days is reported red. */
export const PROVISIONAL_RED_DAYS = 30;

export type Label = "pass" | "fail";
export type MovedSide = "claim" | "judge" | "label" | "undecided";
export type Vendor = "openai" | "anthropic" | "command";

/** Only labels the user gave (or explicitly delegated) are eligible for earned calibration; every other labeler is proxy. */
export function userAttested(entry: Pick<CalEntry, "attested_by" | "label_source">): boolean {
  return entry.attested_by !== undefined ? entry.attested_by === "user" || entry.attested_by.includes("delegated by user") : entry.label_source?.kind === "user";
}

export interface CalEntry {
  attested_by?: string;
  /** Explicit provenance; delegation is not a claim that a human assigned the label. */
  label_source?: { kind: 'user' | 'assistant' | 'model' | 'deterministic'; delegated?: boolean; labeler?: string; date?: string; user_reviewed?: boolean };
  /** Text calibration evidence. Image entries use `image` instead. */
  output?: string;
  assert: { type: string; value?: unknown; [k: string]: unknown };
  label: Label;
  /** Image calibration evidence must name the resolved suite case and local artifact. */
  image?: { case_id: string; artifact: string; reference?: string };
  note?: string;
  /** Filled by the mining step of the Calibrate intent: which side moved after the disagreement, and why. */
  moved?: MovedSide;
  why?: string;
}

/** A calibration set is a bare entries array or a wrapped object naming the spec and criterion it belongs to. */
export interface CalibrationSet {
  spec?: string;
  claim?: string;
  entries: CalEntry[];
}

export interface ChainLink { vendor: Vendor | "google"; level: EffortLevel; model: string }

export interface Disagreement {
  i: number;
  label: Label;
  judge: Label;
  reason: string;
  note?: string;
  moved: MovedSide;
  why?: string;
}

export type CalibrationState = 'earned' | 'provisional' | 'proxy';

export function calibrationState(record: Pick<CalibrationRecord, 'label_basis' | 'human_validated' | 'earned' | 'state'>): CalibrationState {
  if (record.state === 'proxy' || record.label_basis !== 'user' || record.human_validated !== true) return 'proxy';
  return record.earned ? 'earned' : 'provisional';
}

export interface CalibrationRecord {
  state?: CalibrationState;
  label_basis?: 'user' | 'assistant' | 'mixed' | 'unspecified';
  human_validated?: boolean;
  suite: string;
  judge_level: EffortLevel;
  agreement: number;
  kappa: number;
  n: number;
  per_rung: { pass: number; fail: number };
  counts_ok: boolean;
  earned: boolean;
  /** The first model the judge runs on: the calibration level on the default vendor. */
  judge_model_id: string;
  chain: ChainLink[];
  chain_hash: string;
  /** Hash of every judged assertion in the suite the runner resolves, not just the labeled subset. */
  suite_rubric_hash?: string;
  /** Hash of suite-level judge configuration (`judge_level` / `judge_model`). */
  judge_config_hash?: string;
  /** Whether the user's labels include every distinct judged assertion in that resolved suite. */
  coverage_ok?: boolean;
  /** The modality executed to create this record. Text records predate this optional binding. */
  modality?: "text" | "image";
  /** Current local artifact bytes plus case/reference bindings for image calibration. */
  image_evidence_hash?: string;
  /** Vision-rubric, blind-description, and text-judge prompt/program binding. */
  image_pipeline_hash?: string;
  rubric_hash: string;
  /** Hash of the judge system prompts (JudgePrompts.ts) the record was scored under; a prompt edit is a judge change. */
  judge_prompt_hash?: string;
  /** mtime of the label file when the record was written — a later edit marks it stale. */
  labels_ts: string;
  /** Content binding also catches edits within filesystem timestamp precision. */
  labels_hash?: string;
  ts: string;
  disagreements: Disagreement[];
}

// ── directories (per call) ──────────────────────────────────────────────────

export function calibrationDir(): string { return assayCalibrationDir(); }
export function evalResultsDir(): string { return resultsDir(); }

export function setPathOf(suite: string, dir = calibrationDir()): string { return join(dir, `${suite}.yaml`); }
export function recordPathOf(suite: string, dir = calibrationDir()): string { return join(dir, `${suite}.result.json`); }

// ── sets and records ────────────────────────────────────────────────────────

export function parseCalibrationSet(text: string): CalibrationSet {
  const y = parseYaml(text) as unknown;
  if (Array.isArray(y)) return { entries: y as CalEntry[] };
  if (y && typeof y === "object" && Array.isArray((y as CalibrationSet).entries)) return y as CalibrationSet;
  return { entries: [] };
}

export function readSet(suite: string, dir = calibrationDir()): { path: string; set: CalibrationSet; labels_ts: string } | null {
  const path = setPathOf(suite, dir);
  if (!existsSync(path)) return null;
  try { return { path, set: parseCalibrationSet(readFileSync(path, "utf8")), labels_ts: new Date(statSync(path).mtimeMs).toISOString() }; }
  catch { return null; }
}

export function validCalibrationEntries(entries: CalEntry[]): boolean {
  const seen = new Set<string>();
  return entries.length > 0 && entries.every((e) => {
    const common = e && (e.label === 'pass' || e.label === 'fail') && e.assert && typeof e.assert.type === 'string';
    if (!common) return false;
    let evidence: string;
    if (e.image) {
      if (typeof e.image.case_id !== 'string' || !e.image.case_id.trim() || typeof e.image.artifact !== 'string' || !e.image.artifact.trim()) return false;
      try { evidence = createHash('sha256').update(readFileSync(imagePath(e.image.artifact))).digest('hex'); }
      catch { return false; }
    } else {
      if (typeof e.output !== 'string' || !e.output.trim()) return false;
      evidence = e.output.trim();
    }
    const key = stableJson([e.image ? 'image' : 'text', evidence, e.assert, e.image?.reference ?? '']);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readRecord(suite: string, dir = calibrationDir()): CalibrationRecord | null {
  const path = recordPathOf(suite, dir);
  if (!existsSync(path)) return null;
  try { const record = JSON.parse(readFileSync(path, "utf8")) as CalibrationRecord; record.state = calibrationState(record); if (record.state === 'proxy') record.earned = false; return record; } catch { return null; }
}

// ── the statistics ──────────────────────────────────────────────────────────

export function perRungCounts(entries: { label: Label }[]): { pass: number; fail: number } {
  let pass = 0, fail = 0;
  for (const e of entries) { if (e.label === 'pass') pass++; else if (e.label === 'fail') fail++; }
  return { pass, fail };
}

export function countsOk(counts: { pass: number; fail: number }): boolean {
  return counts.pass >= MIN_PER_RUNG && counts.fail >= MIN_PER_RUNG;
}

/**
 * Cohen's kappa over (user label, judge verdict) pairs. Exactly 0 for any
 * constant judge; undefined (returned as 0) when expected agreement is 1,
 * which the per-rung minimum rules out for real sets.
 */
export function cohenKappa(pairs: { label: Label; judge: Label }[]): number {
  const n = pairs.length;
  if (n === 0) return 0;
  let agree = 0, lp = 0, jp = 0;
  for (const p of pairs) {
    if (p.label === p.judge) agree++;
    if (p.label === "pass") lp++;
    if (p.judge === "pass") jp++;
  }
  const po = agree / n;
  const pe = (lp / n) * (jp / n) + ((n - lp) / n) * ((n - jp) / n);
  if (pe >= 1) return 0;
  const k = (po - pe) / (1 - pe);
  return Number.isFinite(k) ? k : 0;
}

// ── the judge chain ─────────────────────────────────────────────────────────

/** The model the inference helper runs for a vendor and level (AGENT_SKILLS_MODEL_<LEVEL> overrides apply). */
export function modelFor(vendor: Vendor, level: EffortLevel): string {
  if (vendor === "command") return getEnv("AGENT_SKILLS_LLM_CMD") ?? "command";
  return providerModel(vendor === "anthropic" ? "anthropic-api" : "openai-api", level) ?? `${vendor}:${level}`;
}

/**
 * Every (vendor, level, model) the judge path can execute for a calibration
 * level: the level itself on the default vendor, Judge.ts's 'high' escalation,
 * and both again on the fallback vendor. A change to ANY of these models is a
 * change to the judge, and the record that measured the old judge is stale.
 */
export function judgeChain(level: EffortLevel, vendors: { default: Vendor; fallback?: Vendor }, model: (v: Vendor, l: EffortLevel) => string = modelFor): ChainLink[] {
  const levels: EffortLevel[] = level === "high" ? ["high"] : [level, "high"];
  const out: ChainLink[] = [];
  for (const v of [vendors.default, vendors.fallback].filter((x): x is Vendor => !!x)) {
    for (const l of levels) out.push({ vendor: v, level: l, model: model(v, l) });
  }
  return out;
}

/** The image lane's actual evaluator chain: the configured vision vendors see pixels (default: the OpenAI + Anthropic panel); meaning ladders run OpenAI's blind describer, then the normal text judge over the description. */
export function imageJudgeChain(level: EffortLevel, assertions: { type: string }[], vendors: { default: Vendor; fallback?: Vendor }, model: (v: Vendor, l: EffortLevel) => string = modelFor, suite?: string, config: VisionRubricConfig = resolveVisionJudge(suite)): ChainLink[] {
  const types = new Set(assertions.map((a) => a.type.replace(/^not-/, "")));
  const chain: ChainLink[] = [];
  if (types.has('vision-rubric')) {
    if (config.provider === 'openai' || config.provider === 'panel') chain.push({ vendor: 'openai', level: 'medium', model: model('openai', 'medium') });
    if (config.provider === 'anthropic' || config.provider === 'panel') chain.push({ vendor: 'anthropic', level: 'high', model: model('anthropic', 'high') });
    if (config.provider === 'google' || (config.provider === 'openai' && config.fallback === 'google')) chain.push({ vendor: 'google', level, model: getEnv('ASSAY_GEMINI_MODEL') ?? 'gemini-2.5-pro' });
  }
  if (types.has('meaning-ladder') && !chain.some((c) => c.vendor === 'openai' && c.level === 'medium')) chain.push({ vendor: 'openai', level: 'medium', model: model('openai', 'medium') });
  if (types.has("meaning-ladder")) chain.push(...judgeChain(level, vendors, model));
  return chain;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Stable across harmless YAML key ordering; assertions are semantic objects, not source-text fragments. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertionKey(assertion: CalEntry["assert"]): string { return stableJson(assertion); }
export function calibrationLabelsHash(entries: CalEntry[]): string { return sha(stableJson(entries)); }

export function chainHashOf(chain: ChainLink[]): string {
  return sha(chain.map((c) => `${c.vendor}:${c.level}:${c.model}`).join("|"));
}

/** Hash of the judged assertions' text (type, value, anchors, threshold), in set order. Outputs and labels are not the rubric. */
export function rubricHashOf(entries: { assert: CalEntry["assert"] }[]): string {
  return sha(stableJson(entries.map((e) => e.assert)));
}

export interface ResolvedSuiteDefinition {
  path: string;
  modality?: 'text' | 'image';
  judge_level?: unknown;
  judge_model?: unknown;
  judged_assertions: CalEntry["assert"][];
  image_cases?: { id: string; image: string; reference?: string; assert: CalEntry["assert"][] }[];
  suite_rubric_hash: string;
  judge_config_hash: string;
}

/**
 * Resolve the same file EvalRunner resolves: the user's suites first, then ASSAY_SUITE_DIRS, then the shipped
 * suite, with direct / Regression / Capability names and `.yaml` before
 * `.yml`. Calibration must bind to this runtime definition rather than a
 * same-named calibration label file.
 */
export function resolveSuiteDefinition(suite: string, dirs = defaultSuiteDirs()): ResolvedSuiteDefinition | null {
  for (const dir of dirs) {
    for (const ext of ["yaml", "yml"]) {
      for (const path of [join(dir, `${suite}.${ext}`), join(dir, "Regression", `${suite}.${ext}`), join(dir, "Capability", `${suite}.${ext}`)]) {
        if (!existsSync(path)) continue;
        try {
          const parsed = parseYaml(readFileSync(path, "utf8")) as {
            cases?: { id?: unknown; image?: unknown; reference?: unknown; assert?: CalEntry["assert"][] }[];
            judge_level?: unknown;
            judge_model?: unknown;
          };
          if (!Array.isArray(parsed.cases)) return null;
          const judged_assertions = parsed.cases.flatMap((c) => c.assert ?? []).filter((a) => isJudgedAssertType(a.type));
          const image_cases = parsed.cases.flatMap((c) => typeof c.image === "string" && typeof c.id === "string"
            ? [{ id: c.id, image: c.image, reference: typeof c.reference === "string" ? c.reference : undefined, assert: c.assert ?? [] }]
            : []);
          const imageBinding = image_cases.map((c) => ({ id: c.id, image: c.image, reference: c.reference ?? null, assert: c.assert }));
          return {
            path,
            modality: image_cases.length ? 'image' : 'text',
            judge_level: parsed.judge_level,
            judge_model: parsed.judge_model,
            judged_assertions,
            suite_rubric_hash: image_cases.length ? sha(stableJson(imageBinding)) : rubricHashOf(judged_assertions.map((assert) => ({ assert }))),
            judge_config_hash: sha(stableJson({ judge_level: parsed.judge_level ?? null, judge_model: parsed.judge_model ?? null,
              ...(image_cases.length ? { vision_rubric: resolveVisionJudge(suite) } : {}) })),
            image_cases: image_cases.length ? image_cases : undefined,
          };
        } catch { return null; }
      }
    }
  }
  return null;
}

/** Each distinct criterion needs positive and negative labels; another criterion cannot supply its balance. */
export function coversSuiteAssertions(entries: CalEntry[], suite: ResolvedSuiteDefinition): boolean {
  if (suite.modality === "image") {
    const targets = new Map<string, { assertion: CalEntry["assert"]; reference: string }>();
    for (const c of suite.image_cases ?? []) for (const assertion of c.assert.filter((a) => isJudgedAssertType(a.type))) {
      const reference = effectiveImageReference(c.reference, assertion);
      targets.set(`${assertionKey(assertion)}|${reference}`, { assertion, reference });
    }
    const matchesResolvedCase = (e: CalEntry): boolean => !!e.image && (suite.image_cases ?? []).some((c) => {
      const assertion = c.assert.find((a) => assertionKey(a) === assertionKey(e.assert));
      return e.image!.case_id === c.id && !!assertion && (e.image!.reference ?? "") === effectiveImageReference(c.reference, assertion)
        && sameImageArtifact(e.image!.artifact, c.image, suite.path);
    });
    return entries.every(matchesResolvedCase) && [...targets.values()].every(({ assertion, reference }) => {
      const matching = entries.filter((e) => e.image && assertionKey(e.assert) === assertionKey(assertion)
        && (e.image.reference ?? "") === reference && matchesResolvedCase(e));
      return countsOk(perRungCounts(matching));
    });
  }
  return suite.judged_assertions.every((assertion) => {
    const matching = entries.filter((e) => assertionKey(e.assert) === assertionKey(assertion));
    return countsOk(perRungCounts(matching));
  });
}

function effectiveImageReference(caseReference: string | undefined, assertion: CalEntry["assert"]): string {
  return String(assertion.reference ?? caseReference ?? "").trim();
}

function imagePath(value: string, suitePath?: string): string {
  const expanded = value.replace(/^~\//, `${homedir()}/`);
  return expanded.startsWith("/") ? expanded : suitePath ? resolve(suitePath, "..", expanded) : resolve(expanded);
}

function sameImageArtifact(artifact: string, expected: string, suitePath: string): boolean {
  try { return realpathSync(imagePath(artifact)) === realpathSync(imagePath(expected, suitePath)); }
  catch { return false; }
}

/** Hashes the exact local bytes and resolved case/reference binding; missing artifacts cannot certify a record. */
export function imageEvidenceHashOf(entries: CalEntry[]): string | null {
  try {
    const evidence = entries.map((e) => {
      if (!e.image) throw new Error("text entry in image calibration set");
      const artifact = imagePath(e.image.artifact);
      return { case_id: e.image.case_id, artifact, bytes: createHash("sha256").update(readFileSync(artifact)).digest("hex"), reference: e.image.reference ?? "", assert: e.assert };
    });
    return sha(stableJson(evidence));
  } catch { return null; }
}

/** Bind all executable image-judge behavior, including the blind describer prompt, without trusting cached descriptions. */
export function imagePipelineHash(suite?: string, config?: VisionRubricConfig): string | null {
  try { return sha(`${JUDGE_PROMPT_HASH}|${stableJson(config ?? resolveVisionJudge(suite))}|${['lib/VisionJudgeConfig.ts', '_portable/inference.ts', 'VisionJudge.ts', 'OpenAIVision.ts', 'AnthropicVision.ts', 'ImageEvalRunner.ts', 'Judge.ts'].map((file) => readFileSync(join(SKILL_DIR, 'Tools', file), 'utf8')).join('|')}`); }
  catch { return null; }
}

// ── scoring and staleness ───────────────────────────────────────────────────

/** `available:false` means no judgment was produced; it must never be scored as a failed label. */
export interface Verdict { passed: boolean; reason: string; available?: boolean }

export function scoreCalibration(input: {
  suite: string;
  level: EffortLevel;
  entries: CalEntry[];
  verdicts: Verdict[];
  chain: ChainLink[];
  labels_ts: string;
  ts?: string;
  judge_prompt_hash?: string;
  suite_definition?: ResolvedSuiteDefinition;
  modality?: "text" | "image";
  image_evidence_hash?: string;
  image_pipeline_hash?: string;
}): CalibrationRecord {
  const { suite, level, entries, verdicts, chain } = input;
  if (!validCalibrationEntries(entries)) throw new Error('scoreCalibration: every example needs an output, assertion, and explicit pass/fail label');
  if (verdicts.length !== entries.length) throw new Error(`scoreCalibration: ${verdicts.length} verdicts for ${entries.length} entries`);
  if (verdicts.some((v) => v.available === false)) throw new Error('scoreCalibration: unavailable verdicts cannot be scored');
  const pairs = entries.map((e, i) => ({ label: e.label, judge: (verdicts[i]!.passed ? "pass" : "fail") as Label }));
  const agree = pairs.filter((p) => p.label === p.judge).length;
  const agreement = entries.length ? agree / entries.length : 0;
  const kappa = cohenKappa(pairs);
  const per_rung = perRungCounts(entries);
  const counts_ok = countsOk(per_rung);
  const coverage_ok = input.suite_definition ? coversSuiteAssertions(entries, input.suite_definition) : undefined;
  const imageBindingOk = input.modality !== "image" || (!!input.image_evidence_hash && !!input.image_pipeline_hash);
  const floors = calibrationFloors();
  const clears = agreement >= floors.agreement && kappa >= floors.kappa && counts_ok && (coverage_ok ?? true) && imageBindingOk;
  const disagreements: Disagreement[] = [];
  pairs.forEach((p, i) => {
    if (p.label === p.judge) return;
    const e = entries[i]!;
    disagreements.push({ i, label: p.label, judge: p.judge, reason: verdicts[i]!.reason, note: e.note, moved: e.moved ?? "undecided", why: e.why });
  });
  return {
    suite,
    label_basis: entries.every(userAttested) ? 'user'
      : entries.every((e) => e.label_source?.kind === 'assistant') ? 'assistant'
      : entries.some((e) => e.label_source) ? 'mixed' : 'unspecified',
    human_validated: entries.every(userAttested),
    judge_level: level,
    agreement,
    kappa,
    n: entries.length,
    per_rung,
    counts_ok,
    state: entries.every(userAttested) ? (clears ? 'earned' : 'provisional') : 'proxy',
    earned: entries.every(userAttested) && clears,
    judge_model_id: chain[0]?.model ?? "",
    chain,
    chain_hash: chainHashOf(chain),
    suite_rubric_hash: input.suite_definition?.suite_rubric_hash,
    judge_config_hash: input.suite_definition?.judge_config_hash,
    coverage_ok,
    modality: input.modality,
    image_evidence_hash: input.image_evidence_hash,
    image_pipeline_hash: input.image_pipeline_hash,
    rubric_hash: rubricHashOf(entries),
    judge_prompt_hash: input.judge_prompt_hash ?? JUDGE_PROMPT_HASH,
    labels_ts: input.labels_ts,
    labels_hash: sha(stableJson(entries)),
    ts: input.ts ?? new Date().toISOString(),
    disagreements,
  };
}

/** Why a record no longer describes the judge that would run today. Empty = fresh. */
export function stalenessOf(record: CalibrationRecord, now: { chain_hash: string; rubric_hash: string; labels_ts: string; labels_hash?: string; judge_prompt_hash?: string; suite_rubric_hash?: string; judge_config_hash?: string; image_evidence_hash?: string | null; image_pipeline_hash?: string | null }): string[] {
  const out: string[] = [];
  if (now.labels_hash && record.labels_hash !== now.labels_hash) out.push('calibration label contents changed');
  const promptNow = now.judge_prompt_hash ?? JUDGE_PROMPT_HASH;
  if (record.judge_prompt_hash && record.judge_prompt_hash !== promptNow) out.push("judge prompt changed since calibration (JudgePrompts.ts)");
  if (record.chain_hash !== now.chain_hash) {
    out.push(`judge chain changed (was ${record.judge_model_id || record.chain_hash}, now ${now.chain_hash})`);
  }
  if (record.rubric_hash !== now.rubric_hash) out.push("rubric text changed since calibration");
  if (record.suite_rubric_hash && now.suite_rubric_hash && record.suite_rubric_hash !== now.suite_rubric_hash) out.push("suite rubric changed since calibration");
  if (record.judge_config_hash && now.judge_config_hash && record.judge_config_hash !== now.judge_config_hash) out.push("judge configuration changed since calibration");
  if (record.modality === "image") {
    if (!record.image_evidence_hash || !now.image_evidence_hash) out.push("image calibration evidence unavailable");
    else if (record.image_evidence_hash !== now.image_evidence_hash) out.push("image artifact, case, assertion, or reference changed since calibration");
    if (!record.image_pipeline_hash || !now.image_pipeline_hash) out.push("image judge pipeline binding unavailable");
    else if (record.image_pipeline_hash !== now.image_pipeline_hash) out.push("image judge pipeline changed since calibration");
  }
  if (Date.parse(now.labels_ts) > Date.parse(record.labels_ts) + 1000) out.push(`labels edited since calibration (${now.labels_ts})`);
  return out;
}

export interface CalibrationStatus {
  state?: CalibrationState;
  level: EffortLevel;
  calibrated: boolean;
  earned: boolean;
  stale: string[];
  reason: string;
  record: CalibrationRecord | null;
}

/**
 * The one answer to "does this suite's judge count?". A missing, unearned,
 * or stale record all mean the judge runs at 'high' and the suite is
 * provisional; the reason says which.
 */
export function calibrationStatus(suite: string, opts: {
  dir?: string;
  suiteDirs?: string[];
  vendors?: { default: Vendor; fallback?: Vendor };
  model?: (v: Vendor, l: EffortLevel) => string;
} = {}): CalibrationStatus {
  const dir = opts.dir ?? calibrationDir();
  const record = readRecord(suite, dir);
  const none = (reason: string): CalibrationStatus => ({ state: record && calibrationState(record) === 'proxy' ? 'proxy' : 'provisional', level: "high", calibrated: false, earned: false, stale: [], reason, record });
  // The record is what binds the labels to one judge chain (model, prompt, rubric): nothing reads earned until a calibration run writes one.
  if (!record) return none(existsSync(setPathOf(suite, dir)) ? "labels exist but no calibration record binds them to a judge chain (run Calibrate.ts)" : "no calibration record");
  if (calibrationState(record) === 'proxy') return none("proxy: labels lack the user's attestation");
  const floors = calibrationFloors();
  const labelReason = !record.counts_ok ? `fewer than ${MIN_PER_RUNG} labels on each side`
    : record.agreement < floors.agreement ? `agreement ${(record.agreement * 100).toFixed(0)}% below ${floors.agreement * 100}%`
    : record.kappa < floors.kappa ? `kappa ${record.kappa.toFixed(2)} below ${floors.kappa}` : "calibration did not clear the floors";
  if (typeof record.agreement !== "number") return none("calibration record unreadable");
  // Records written before F4 carry only agreement; they are provisional until re-run under the full rule.
  if (!Array.isArray(record.chain) || typeof record.kappa !== "number") return none("calibration record predates kappa/chain (re-run Calibrate.ts)");
  if (!record.suite_rubric_hash || !record.judge_config_hash || typeof record.coverage_ok !== "boolean") return none("calibration record predates suite binding (re-run Calibrate.ts)");
  const set = readSet(suite, dir);
  if (!set) return none("calibration labels unavailable");
  if (!validCalibrationEntries(set.set.entries)) return none("calibration labels incomplete or malformed");
  if (!record.labels_hash || record.labels_hash !== sha(stableJson(set.set.entries))) return none('calibration labels changed or lack a content binding');
  const suiteDefinition = resolveSuiteDefinition(suite, opts.suiteDirs);
  if (!suiteDefinition) return none("suite definition unavailable");
  const image = suiteDefinition.modality === "image";
  if (image && (record.modality !== "image" || !record.image_evidence_hash || !record.image_pipeline_hash)) return none("calibration record lacks image pipeline bindings (re-run Calibrate.ts)");
  if (!image && suiteDefinition.judged_assertions.some((a) => !['llm-rubric', 'not-llm-rubric', 'llm-assert', 'not-llm-assert'].includes(a.type))) return none("calibration does not yet execute this suite's judge modality");
  if (suiteDefinition.judge_model != null) return none("explicit judge_model requires calibration of that execution path");
  if (suiteDefinition.judge_level != null && suiteDefinition.judge_level !== record.judge_level) return none("judge configuration changed: executing judge level differs from calibration");
  const vendors = opts.vendors ?? resolveVendors();
  const stale = stalenessOf(record, {
    chain_hash: chainHashOf(image ? imageJudgeChain(record.judge_level, suiteDefinition.judged_assertions, vendors, opts.model, suite) : judgeChain(record.judge_level, vendors, opts.model)),
    rubric_hash: rubricHashOf(set.set.entries),
    labels_ts: set.labels_ts,
    suite_rubric_hash: suiteDefinition.suite_rubric_hash,
    judge_config_hash: suiteDefinition.judge_config_hash,
    ...(image ? { image_evidence_hash: imageEvidenceHashOf(set.set.entries), image_pipeline_hash: imagePipelineHash(suite) } : {}),
  });
  if (stale.length) return { state: 'provisional', level: "high", calibrated: false, earned: false, stale, reason: `stale: ${stale.join("; ")}`, record };
  if (!coversSuiteAssertions(set.set.entries, suiteDefinition)) return none('calibration labels do not cover every judged assertion with positive and negative examples');
  if (!record.earned) return { state: 'provisional', level: "high", calibrated: false, earned: false, stale: [], reason: labelReason, record };
  return { state: 'earned', level: record.judge_level, calibrated: true, earned: true, stale: [], reason: "earned", record };
}

/**
 * The vendors the judge path runs on: ASSAY_JUDGE_VENDOR when set, else the vendor of the provider the
 * inference helper resolves. Writers and readers of a record MUST share this, or a record is stale the
 * moment it is written.
 */
export function resolveVendors(): { default: Vendor; fallback?: Vendor } {
  const pinned = getEnv("ASSAY_JUDGE_VENDOR");
  if (pinned === "anthropic" || pinned === "openai") return { default: pinned };
  const p = resolveProvider({});
  return { default: p === "openai-api" || p === "codex-cli" ? "openai" : p === "command" ? "command" : "anthropic" };
}

// ── provisional age ─────────────────────────────────────────────────────────

/** Days since the oldest persisted run of the suite — how long the provisional verdicts have been accumulating. Null when no run has been persisted. */
export function provisionalAgeDays(suite: string, resultsDir = evalResultsDir(), now = Date.now()): number | null {
  const dir = join(resultsDir, suite);
  if (!existsSync(dir)) return null;
  let oldest = Infinity;
  for (const run of readdirSync(dir, { withFileTypes: true })) {
    if (!run.isDirectory()) continue;
    const p = join(dir, run.name, "run.json");
    if (!existsSync(p)) continue;
    let ts = NaN;
    try { ts = Date.parse((JSON.parse(readFileSync(p, "utf8")) as { ts?: string }).ts ?? ""); } catch { /* fall through to mtime */ }
    if (!Number.isFinite(ts)) ts = statSync(p).mtimeMs;
    if (ts < oldest) oldest = ts;
  }
  return Number.isFinite(oldest) ? Math.max(0, Math.floor((now - oldest) / 86_400_000)) : null;
}

export interface Provisional { provisional: boolean; age_days: number | null; reason: string; red: boolean }

/** The provisional marker every surface renders: a suite with judged asserts and no earned calibration. */
export function provisionalOf(suite: string, judged: number, opts: { status?: CalibrationStatus; dir?: string; resultsDir?: string; now?: number } = {}): Provisional {
  if (judged === 0) return { provisional: false, age_days: null, reason: "no judged asserts", red: false };
  const status = opts.status ?? calibrationStatus(suite, { dir: opts.dir });
  if (status.earned) return { provisional: false, age_days: null, reason: "earned", red: false };
  const age = provisionalAgeDays(suite, opts.resultsDir, opts.now);
  return { provisional: true, age_days: age, reason: status.reason, red: age !== null && age >= PROVISIONAL_RED_DAYS };
}

// ── the calibration log block ───────────────────────────────────────────────

/** Strip the one thing an appended block may never carry: a line beginning with `#` (it would forge a section). */
export function demoteHashLines(text: string): string {
  return text.split("\n").map((l) => (l.startsWith("#") ? `> ${l.replace(/^#+\s*/, "")}` : l)).join("\n");
}

function oneLine(s: string, max = 240): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function assertText(a: CalEntry["assert"]): string {
  const v = typeof a.value === "string" ? a.value : Array.isArray(a.value) ? a.value.map(String).join("; ") : JSON.stringify(a.value ?? "");
  return `${a.type}: ${oneLine(v, 200)}`;
}

/**
 * Render the calibration log block for a calibration run: one dated block,
 * one row per disagreement naming the assert, the user's label, the
 * judge's verdict, which side moved, and why. The caller appends it (the
 * Calibrate intent, or Calibrate.ts under --append-log, to the spec the set
 * names); an unattended recheck only writes it to a report file.
 */
export function renderCalibrationLogBlock(record: CalibrationRecord, entries: CalEntry[], opts: { claim?: string; ts?: Date } = {}): string {
  const d = opts.ts ?? new Date(record.ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const lines: string[] = [];
  lines.push(`label basis: ${record.label_basis ?? 'unspecified'} · human validation: ${record.human_validated === true ? 'recorded' : 'not recorded'}`);
  lines.push(`suite ${record.suite}${opts.claim ? ` · criterion ${opts.claim}` : ""} · judge ${record.judge_level} (${record.judge_model_id}) · agreement ${(record.agreement * 100).toFixed(0)}% · kappa ${record.kappa.toFixed(2)} · n ${record.n} (${record.per_rung.pass} pass / ${record.per_rung.fail} fail) · ${calibrationState(record)}`);
  if (record.disagreements.length === 0) {
    lines.push("");
    lines.push("no disagreements: every judge verdict matched the supplied label");
  }
  for (const dis of record.disagreements) {
    const e = entries[dis.i];
    lines.push("");
    lines.push(`- disagreement #${dis.i} · assert ${e ? assertText(e.assert) : "?"}`);
    lines.push(`  label: ${dis.label} · judge: ${dis.judge} (${oneLine(dis.reason, 160)})`);
    lines.push(`  moved: ${dis.moved}${dis.why ? ` · why: ${oneLine(dis.why, 200)}` : dis.moved === "undecided" ? " · why: not yet mined (Calibrate intent § shrinkage loop)" : ""}${dis.note ? ` · note: ${oneLine(dis.note, 160)}` : ""}`);
  }
  lines.push("");
  // The dated header is the ONLY line allowed to start with `#`; every body line is demoted.
  return `### ${stamp} · calibration\n\n${demoteHashLines(lines.join("\n"))}`;
}

const JUDGED_ASSERT_TYPES = new Set(["llm-rubric", "llm-assert", "vision-rubric", "meaning-ladder"]);
export function isJudgedAssertType(type: string): boolean {
  return JUDGED_ASSERT_TYPES.has(type.startsWith("not-") ? type.slice(4) : type);
}

/** The suite homes, user first (Tools/lib/AssayPaths.ts). */
export function defaultSuiteDirs(): string[] {
  return suiteDirs();
}

export interface JudgedSuite { suite: string; file: string; judged: number; asserts: number }

/** Every suite file carrying at least one model-graded assert. */
export function judgedSuites(dirs = defaultSuiteDirs()): JudgedSuite[] {
  const out: JudgedSuite[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory() && !f.name.startsWith("_") && !f.name.startsWith(".")) walk(join(d, f.name));
      else if (/\.ya?ml$/.test(f.name)) {
        const file = join(d, f.name);
        try {
          const s = parseYaml(readFileSync(file, "utf8")) as { name?: string; cases?: { assert?: { type: string }[] }[] };
          if (!Array.isArray(s.cases)) continue;
          const asserts = s.cases.flatMap((c) => c.assert ?? []);
          const judged = asserts.filter((a) => isJudgedAssertType(a.type)).length;
          if (judged > 0) out.push({ suite: s.name ?? f.name.replace(/\.ya?ml$/, ""), file, judged, asserts: asserts.length });
        } catch { /* unparseable suite: not a judged suite */ }
      }
    }
  };
  for (const d of dirs) if (existsSync(d)) walk(d);
  return out.sort((a, b) => a.suite.localeCompare(b.suite));
}

export interface CoverageRow extends JudgedSuite { earned: boolean; reason: string; age_days: number | null; red: boolean }
export interface Coverage { total: number; earned: number; provisional: number; rows: CoverageRow[] }

/** Which judged suites run on an earned calibration record, and which are provisional and why. */
export function calibrationCoverage(opts: { suiteDirs?: string[]; dir?: string; resultsDir?: string; now?: number } = {}): Coverage {
  const rows: CoverageRow[] = judgedSuites(opts.suiteDirs).map((s) => {
    const status = calibrationStatus(s.suite, { dir: opts.dir, suiteDirs: opts.suiteDirs });
    const p = provisionalOf(s.suite, s.judged, { status, dir: opts.dir, resultsDir: opts.resultsDir, now: opts.now });
    return { ...s, earned: status.earned, reason: status.reason, age_days: p.age_days, red: p.red };
  });
  const earned = rows.filter((r) => r.earned).length;
  return { total: rows.length, earned, provisional: rows.length - earned, rows };
}
