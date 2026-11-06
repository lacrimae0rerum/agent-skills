/**
 * Tournament — a bracket in code over an injected pairwise judge.
 *
 * The bracket, the order
 * flip, the tie rule, the shuffled rerun, and the model bookkeeping are all
 * deterministic code here; the only model call is the pairwise judge handed
 * in. Every pair is judged TWICE with the order flipped: a winner that flips
 * with the order is position bias, not preference, and counts as a tie. The
 * whole bracket then runs a second time with shuffled seeding; a different
 * winner means the result is unstable and says so.
 *
 *
 * Usage (tool contract; the real judge is VisionJudge pairwise for images or
 * the text pairwise in Judge.ts):
 *   bun Tournament.ts --candidates a.png,b.png,c.png --question "which better recovers the argument?" [--generator <model-id>] [--json]
 * Exit 0 stable winner · 1 unstable (or every pair tied) · 2 verifier unavailable.
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt). The upstream hosted judgment-layer first
 * tier for two-candidate pairs is not part of this port: the bracket always decides.
 */
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { invariant } from './_portable/invariant.ts';
import type { PairwiseCalibrationStatus } from './PairwiseCalibrate.ts';
import { guardVisionRequest } from './OpenAIVision.ts';

export type Winner = 'A' | 'B' | 'tie';
export interface PairVerdict { winner: Winner; reason: string; executed_model?: string }
/** One pairwise call: A first, B second. The tool never sees what A and B are. */
export type PairwiseJudge = (a: string, b: string, question: string) => Promise<PairVerdict>;

export interface PairLog {
  a: string;
  b: string;
  /** verdict with (a, b) in that order */
  forward: PairVerdict;
  /** verdict with the order flipped, mapped back to a/b */
  flipped: PairVerdict;
  /** the pair's result after the flip rule: a flipped winner is a tie */
  result: Winner;
  position_bias: boolean;
}

export interface TournamentResult {
  winner: string | null;
  /** the bracket order the winner was found on */
  seeding: string[];
  log: PairLog[];
  /** the shuffled rerun's winner, and whether it agreed */
  rerun: { seeding: string[]; winner: string | null; log: PairLog[] } | null;
  stable: boolean;
  /** generator and judge ids, and whether they share a model family */
  models: { generator: string | null; judge: string; same_family: boolean };
  exit: 0 | 1 | 2;
  summary: string;
  provisional: boolean;
  provisional_reason: string;
  model_provenance: string;
  label_basis: 'user' | 'assistant' | 'mixed' | 'unspecified';
  human_validated: boolean;
}

export const EXIT_STABLE = 0;
export const EXIT_UNSTABLE = 1;
export const EXIT_UNAVAILABLE = 2;
export const DEFAULT_CONCURRENCY = 8;

type JudgeExecutor = <T>(task: () => Promise<T>) => Promise<T>;

function concurrencyLimiter(concurrency: number): JudgeExecutor {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('concurrency must be a positive integer');
  }
  let active = 0;
  const queued: Array<() => void> = [];
  const release = () => {
    active--;
    queued.shift()?.();
  };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) await new Promise<void>((resolve) => queued.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/** Judge one pair both ways. Forward and flipped must agree on a winner or the pair is a tie. */
export async function judgePair(judge: PairwiseJudge, a: string, b: string, question: string, execute: JudgeExecutor = (task) => task()): Promise<PairLog> {
  const [forward, raw] = await Promise.all([
    execute(() => judge(a, b, question)),
    execute(() => judge(b, a, question)),
  ]);
  for (const verdict of [forward, raw]) {
    if (!verdict || !['A', 'B', 'tie'].includes(verdict.winner) || typeof verdict.reason !== 'string') {
      throw new Error('pairwise judge returned a malformed verdict');
    }
  }
  // map the flipped verdict back into a/b terms
  const flipped: PairVerdict = { ...raw, winner: raw.winner === 'A' ? 'B' : raw.winner === 'B' ? 'A' : 'tie', reason: raw.reason };
  const agree = forward.winner === flipped.winner;
  const result: Winner = agree ? forward.winner : 'tie';
  const position_bias = !agree && forward.winner !== 'tie' && flipped.winner !== 'tie';
  return { a, b, forward, flipped, result, position_bias };
}

/**
 * Single-elimination over the seeding order. A tie keeps the earlier seed
 * (the incumbent) so the bracket always resolves; the tie is visible in the
 * log, and the shuffled rerun catches a winner that only won on seeding.
 */
export async function runBracket(candidates: string[], judge: PairwiseJudge, question: string, concurrency = DEFAULT_CONCURRENCY, execute = concurrencyLimiter(concurrency)): Promise<{ winner: string | null; log: PairLog[] }> {
  const log: PairLog[] = [];
  let round = [...candidates];
  while (round.length > 1) {
    const matches = [] as Array<{ a: string; b?: string }>;
    for (let i = 0; i < round.length; i += 2) {
      const a = round[i]!;
      const b = round[i + 1];
      matches.push({ a, b });
    }
    const results = await Promise.all(matches.map(async ({ a, b }) => {
      if (b === undefined) return { winner: a, log: null }; // bye
      const pair = await judgePair(judge, a, b, question, execute);
      return { winner: pair.result === 'B' ? b : a, log: pair };
    }));
    const next: string[] = [];
    for (const result of results) {
      if (result.log) log.push(result.log);
      next.push(result.winner);
    }
    round = next;
  }
  return { winner: round[0] ?? null, log };
}

/** Deterministic shuffle (mulberry32) so a rerun is reproducible from its seed. */
export function shuffled<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Model family for the same-family flag: Claude ids parse to their family, everything else is its vendor prefix (`gpt-…` → gpt, `gemini-…` → gemini). */
export function familyOf(id: string | null | undefined): string | null {
  if (!id) return null;
  const c = id.toLowerCase().match(/^claude-(?:\d+-\d+-)?(haiku|sonnet|opus|fable)\b/) ?? id.toLowerCase().match(/^claude-(haiku|sonnet|opus|fable)-/);
  if (c) return `claude-${c[1]}`;
  const m = id.toLowerCase().match(/^([a-z]+)/);
  return m ? m[1]! : id.toLowerCase();
}

export function sameFamily(generator: string | null | undefined, judge: string): boolean {
  const g = familyOf(generator);
  return g !== null && g === familyOf(judge);
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;
export const isImageCandidate = (c: string): boolean => IMAGE_RE.test(c);

/**
 * The image pairwise judge, bound to its material policy. Gemini is the image judge and receives only public material,
 * so a bracket over private images is refused unless the caller passes `--public` (publicMaterial), exactly as
 * VisionJudge.ts pairwise does; nothing here widens that policy.
 */
export function imagePairwiseJudge(
  opts: { allowIdentity?: boolean; publicMaterial?: boolean },
  judgeImagePairwise: (a: string, b: string, question: string, allowIdentity?: boolean, publicMaterial?: boolean) => ReturnType<PairwiseJudge>,
): PairwiseJudge {
  return (a, b, q) => judgeImagePairwise(a, b, q, opts.allowIdentity ?? false, opts.publicMaterial ?? false);
}

export interface TournamentOptions {
  judge: PairwiseJudge;
  question: string;
  /** the model that produced the candidates, when known */
  generator?: string | null;
  /** the model behind `judge` */
  judgeModel: string;
  /** seed for the shuffled rerun; the default is fixed so runs are reproducible */
  seed?: number;
  /** Diagnostic only: omitting the rerun cannot establish verified stability. */
  rerun?: boolean;
  /** Maximum simultaneous judge requests across both brackets. */
  concurrency?: number;
  /** Status of an explicitly supplied, provenance-bound user-label calibration record. */
  calibration?: PairwiseCalibrationStatus;
  /** Native CLI binding; injected judges do not inherit a calibration record by default. */
  calibrationRuntime?: 'text' | 'image';
}

export async function runTournament(candidates: string[], opts: TournamentOptions): Promise<TournamentResult> {
  const models = { generator: opts.generator ?? null, judge: opts.judgeModel, same_family: sameFamily(opts.generator, opts.judgeModel) };
  const seeding = [...candidates];
  const record = opts.calibration?.record;
  const bound = opts.calibration?.earned && record?.earned && opts.calibrationRuntime === record.mode
    && record.question === opts.question && record.requested_model === opts.judgeModel;
  const evidence = {
    provisional: !bound,
    provisional_reason: bound ? 'earned' : opts.calibration?.earned ? 'calibration is not bound to this executing judge and criterion' : opts.calibration?.reason ?? 'no pairwise calibration record supplied',
    model_provenance: 'models names configured models; executed_model in each verdict is observed when available',
    label_basis: record?.label_basis ?? 'unspecified',
    human_validated: bound === true && record?.human_validated === true,
  };
  const flag = (s: string) => (models.same_family ? `${s} · SAME FAMILY: generator and judge are both ${familyOf(opts.judgeModel)}` : s);
  if (candidates.length < 2 || new Set(candidates).size !== candidates.length) {
    return { ...evidence, winner: null, seeding, log: [], rerun: null, stable: false, models, exit: EXIT_UNSTABLE, summary: flag('comparison requires at least two distinct candidates without duplicate entries') };
  }
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const execute = concurrencyLimiter(concurrency);
  let rerunSeeding: string[] | null = null;
  if (opts.rerun !== false) {
    rerunSeeding = shuffled(seeding, opts.seed ?? 1);
    if (rerunSeeding.every((candidate, index) => candidate === seeding[index])) rerunSeeding = [...seeding].reverse();
  }
  let first: { winner: string | null; log: PairLog[] };
  let rerun: TournamentResult['rerun'] = null;
  try {
    const brackets = await Promise.all([
      runBracket(seeding, opts.judge, opts.question, concurrency, execute),
      rerunSeeding === null ? null : runBracket(rerunSeeding, opts.judge, opts.question, concurrency, execute),
    ]);
    first = brackets[0];
    if (rerunSeeding !== null && brackets[1] !== null) {
      rerun = { seeding: rerunSeeding, winner: brackets[1].winner, log: brackets[1].log };
    }
  } catch (e) {
    return { ...evidence, winner: null, seeding, log: [], rerun: null, stable: false, models, exit: EXIT_UNAVAILABLE, summary: `verifier unavailable: ${(e as Error).message}` };
  }
  const allTied = first.log.length > 0 && first.log.every((p) => p.result === 'tie');
  const decisiveWinner = (bracket: { winner: string | null; log: PairLog[] }): boolean => {
    const matches = bracket.log.filter((p) => p.a === bracket.winner || p.b === bracket.winner);
    return matches.length > 0 && matches.every((p) => p.result !== 'tie' && (p.result === 'A' ? p.a : p.b) === bracket.winner);
  };
  const stable = !allTied && rerun !== null && rerun.winner === first.winner && decisiveWinner(first) && decisiveWinner(rerun);
  const bias = first.log.filter((p) => p.position_bias).length;
  const summary = allTied
    ? 'every pair tied: the judge cannot separate these candidates'
    : rerun === null
      ? `diagnostic winner ${first.winner}; stability not verified (shuffled rerun omitted)`
    : stable
      ? `winner ${first.winner} (${first.log.length} pairs${rerun ? ', shuffled rerun agrees' : ''}${bias ? `, ${bias} position-bias tie${bias > 1 ? 's' : ''}` : ''})`
      : `unstable: ${first.winner} on seeded order, ${rerun?.winner} on shuffled order; differing winners or an undecided winner comparison`;
  if (bound && record?.observed_models.length) {
    const observed = [...first.log, ...(rerun?.log ?? [])].flatMap((p) => [p.forward.executed_model, p.flipped.executed_model]);
    if (observed.some((model) => !model || !record.observed_models.includes(model))) {
      evidence.provisional = true;
      evidence.human_validated = false;
      evidence.provisional_reason = 'executing model evidence differs from the calibrated comparison path';
    }
  }
  const winner = stable ? first.winner : null;
  return { ...evidence, winner, seeding, log: first.log, rerun, stable, models, exit: stable ? EXIT_STABLE : EXIT_UNSTABLE, summary: flag(summary) };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      candidates: { type: 'string' },
      question: { type: 'string' },
      generator: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
      'allow-identity': { type: 'boolean', default: false },
      public: { type: 'boolean', default: false },
      'no-rerun': { type: 'boolean', default: false },
      concurrency: { type: 'string' },
      calibration: { type: 'string' },
    },
  });
  if (values.help || !values.candidates || !values.question) {
    console.log('Tournament — bracket + flipped pairwise + shuffled rerun\n\n  bun Tournament.ts --candidates <a>,<b>[,more...] --question "..." [--generator <model-id>] [--calibration <set.yaml>] [--concurrency N] [--json] [--allow-identity] [--public] [--no-rerun]\n\nEvery pair is judged twice with the order flipped; the whole bracket reruns on a shuffled seeding. Concurrency defaults to 8 simultaneous judge requests. Exit 0 stable winner · 1 unstable or all tied · 2 verifier unavailable.');
    process.exit(values.help ? 0 : 1);
  }
  const candidates = values.candidates.split(',').map((s) => s.trim()).filter(Boolean);
  // Image candidates ride the vision judge; anything else is a text pairwise over Judge.ts's inference path.
  const images = candidates.every(isImageCandidate);
  let judge: PairwiseJudge;
  let judgeModel: string;
  if (images) {
    const { judgeImagePairwise } = await import('./VisionJudge.ts');
    const { geminiModel } = await import('./lib/VisionCall.ts');
    judge = imagePairwiseJudge({ allowIdentity: values['allow-identity'], publicMaterial: values.public }, judgeImagePairwise);
    judgeModel = geminiModel();
  } else {
    const { judgeTextPairwise, textPairwiseModel } = await import('./Judge.ts');
    judge = judgeTextPairwise;
    judgeModel = textPairwiseModel();
  }
  const { pairwiseCalibrationStatus } = await import('./PairwiseCalibrate.ts');
  const calibration = pairwiseCalibrationStatus(values.calibration, { mode: images ? 'image' : 'text', question: values.question, requestedModel: judgeModel });
  const concurrency = values.concurrency === undefined ? DEFAULT_CONCURRENCY : Number(values.concurrency);
  const r = await runTournament(candidates, { judge, question: values.question, generator: values.generator ?? null, judgeModel, rerun: !values['no-rerun'], concurrency, calibration, calibrationRuntime: images ? 'image' : 'text' });
  if (values.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`\n🏆 ${r.summary}\n`);
    console.log(`  calibration: ${r.provisional ? r.provisional_reason : 'earned'} · labels ${r.label_basis} · human validation ${r.human_validated ? 'recorded' : 'not recorded'}`);
    for (const p of r.log) console.log(`  ${p.result === 'tie' ? '=' : p.result === 'A' ? '<' : '>'} ${p.a} vs ${p.b}${p.position_bias ? ' (position bias → tie)' : ''}\n      fwd: ${p.forward.reason}\n      flp: ${p.flipped.reason}`);
    if (r.rerun) console.log(`\n  rerun (shuffled): winner ${r.rerun.winner ?? 'none'}`);
  }
  process.exit(r.exit);
}
