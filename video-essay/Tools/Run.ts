#!/usr/bin/env bun
/**
 * Run.ts — the production orchestrator. Everything after the essay and the script is
 * deterministic, so this runs it, resuming from any stage. Each stage starts as soon as the
 * stages it depends on have passed (DEPS), so independent stages run side by side:
 *
 *   lint ─┬─ narrate ── score ─┐
 *         └─ capture ──────────┴─ build ─┬─ verify ── describe
 *                                        └─ thumbnail
 *
 *   bun Run.ts --run <slug|dir> [--from <stage>] [--to <stage>] [--force] [--captions] [--music ambient|pulse] [--accept-review-shortfall] [--polish]
 *
 * Voice runs: clean → align → plan → meaning → lint → capture → build → verify → describe, one
 * after another. `meaning` (Meaning.ts) directs the inserts from the post's meaning and compiles
 * Plan.json; a failed plan review stops the run unless --accept-review-shortfall; --polish adds one
 * polish round after a pass.
 *
 * Every stage is idempotent and content-cached by its own tool; `--force` passes
 * through to narrate/score/capture. `score` is a no-op unless the run has a Score.json
 * or `--music <preset>` generates one. A --from/--to window treats stages outside it as done.
 * After a stage fails no new stage starts; stages already running finish (their output stays
 * cached for the resume), every failure and every stage not run is reported, and the exit code
 * is the first failing stage's. Output lines carry their stage name, since stages interleave.
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { invariant } from "./_portable/invariant.ts";
import { argValue, hasFlag, resolveRunDir, readJson, runPaths, type RunMeta } from "./Lib.ts";

export const STAGES = ["lint", "narrate", "score", "capture", "build", "verify", "thumbnail", "describe"] as const;
export const VOICE_STAGES = ["clean", "align", "plan", "meaning", "lint", "capture", "build", "verify", "describe"] as const;
export type Stage = (typeof STAGES)[number] | (typeof VOICE_STAGES)[number];
export type PipelineMode = "essay" | "voice";

/**
 * What each stage must wait for. Essay stages wait only for the stages whose files they read;
 * voice stages each rewrite what the next one reads (Script.json, timeline.json), so they stay a chain.
 */
export const DEPS: Record<PipelineMode, Readonly<Partial<Record<Stage, readonly Stage[]>>>> = {
  essay: {
    lint: [],
    narrate: ["lint"],                      // Script.json, once lint has passed it
    score: ["narrate"],                     // timeline.json and narration.wav
    capture: ["lint"],                      // Script.json visuals only; never the narration
    build: ["narrate", "score", "capture"], // narration.wav, timeline.json, bed.wav, Assets/
    verify: ["build"],                      // the render
    // Reads Script.json, but renders inside public/runs/<slug>/thumbnail/, which Build clears when it stages. Safe beside
    // verify: verify reads Out/essay.mp4 and writes Out/{frames,review,whisper}/, rendered-audio.wav, pii.json and
    // verify.json; thumbnail writes Out/thumbnail{,-320}.png. No shared file, browser or port.
    thumbnail: ["build"],
    // Reads only Script.json and timeline.json, but Out/description.md is a deliverable: a failed verify must not
    // leave a fresh one. It takes under a second, so the wait costs nothing.
    describe: ["verify"],
  },
  voice: {
    clean: [], align: ["clean"], plan: ["align"], meaning: ["plan"], lint: ["meaning"],
    capture: ["lint"], build: ["capture"], verify: ["build"], describe: ["verify"],
  },
};

/** Stages to execute for a --from/--to window, in pipeline order. */
export function stagesFrom(from?: string, to?: string, mode: PipelineMode = "essay"): Stage[] {
  const stages: readonly Stage[] = mode === "voice" ? VOICE_STAGES : STAGES;
  const start = from ? stages.indexOf(from as Stage) : 0;
  const end = to ? stages.indexOf(to as Stage) : stages.length - 1;
  invariant(start >= 0, `unknown stage: ${from}`);
  invariant(end >= 0, `unknown stage: ${to}`);
  invariant(start <= end, `--from ${from} is after --to ${to}`);
  return stages.slice(start, end + 1);
}

export interface StageOpts { force?: boolean; captions?: boolean; music?: string; acceptReviewShortfall?: boolean; polish?: boolean }
export function stageCommand(stage: Stage, runDir: string, opts: StageOpts): string[] {
  const tool = (name: string) => join(import.meta.dir, name);
  const force = opts.force ? ["--force"] : [];
  switch (stage) {
    case "clean": return ["bun", tool("Clean.ts"), "--run", runDir];
    case "align": return ["bun", tool("Align.ts"), "--run", runDir, "--verify"];
    case "plan": return ["bun", tool("PlanBeats.ts"), "--run", runDir];
    case "meaning": return ["bun", tool("Meaning.ts"), "--run", runDir, ...force, ...(opts.acceptReviewShortfall ? ["--accept-review-shortfall"] : []), ...(opts.polish ? ["--polish"] : [])];
    case "lint": return ["bun", tool("ScriptLint.ts"), "--run", runDir];
    case "narrate": return ["bun", tool("Narrate.ts"), "--run", runDir, ...force];
    case "score": return ["bun", tool("Score.ts"), "--run", runDir, ...force, ...(opts.music ? ["--preset", opts.music] : [])];
    case "capture": return ["bun", tool("Capture.ts"), "--run", runDir, ...force];
    case "build": return ["bun", tool("Build.ts"), "--run", runDir, ...(opts.captions ? ["--captions"] : [])];
    case "verify": return ["bun", tool("Verify.ts"), "--run", runDir];
    case "thumbnail": return ["bun", tool("Thumbnail.ts"), "--run", runDir];
    case "describe": return ["bun", tool("Describe.ts"), "--run", runDir];
  }
}

export interface StageFailure { stage: Stage; code: number }
export interface PipelineResult { code: number; failed: StageFailure[]; notRun: Stage[] }

/**
 * Run a window of stages, each as soon as its in-window dependencies have passed. `runStage`
 * resolves to the stage's exit code; a thrown error counts as exit 1. After the first failure no
 * new stage starts, and the running ones are awaited rather than killed.
 */
export async function runPipeline(stages: readonly Stage[], mode: PipelineMode, runStage: (stage: Stage) => Promise<number>, onFail: (f: StageFailure, error?: unknown) => void = () => {}): Promise<PipelineResult> {
  const window = new Set(stages);
  invariant(window.size === stages.length, `duplicate stage in window: ${stages.join(", ")}`);
  const deps = new Map<Stage, Stage[]>();
  for (const [i, s] of stages.entries()) {
    const declared = DEPS[mode][s];
    invariant(declared, `stage ${s} has no dependencies declared for ${mode} runs`);
    const inWindow = declared.filter((d) => window.has(d));
    for (const d of inWindow) invariant(stages.indexOf(d) < i, `${s} waits on ${d}, which comes after it in pipeline order`);
    deps.set(s, inWindow);
  }
  const pending: Stage[] = [...stages];
  const passed = new Set<Stage>();
  const failed: StageFailure[] = [];
  // Every stage pushes its result here the moment it settles. The loop drains ALL of them before it schedules, so a
  // failure that settled beside a success is seen before that success's dependents could start.
  const settled: { stage: Stage; code: number; error?: unknown }[] = [];
  let running = 0;
  let wake: () => void = () => {};
  for (;;) {
    if (!failed.length) {
      for (const s of pending.filter((p) => deps.get(p)!.every((d) => passed.has(d)))) {
        pending.splice(pending.indexOf(s), 1);
        running++;
        Promise.resolve().then(() => runStage(s)).then((code) => ({ stage: s, code }), (error: unknown) => ({ stage: s, code: 1, error }))
          .then((r) => { settled.push(r); wake(); });
      }
    }
    if (!running) break;
    if (!settled.length) await new Promise<void>((r) => { wake = r; });
    // One macrotask more, so stages that exited in the same instant (child exits arrive as separate events) are drained together.
    await new Promise<void>((r) => setImmediate(r));
    for (const { stage, code, error } of settled.splice(0)) {
      running--;
      if (code === 0) passed.add(stage);
      else { const f = { stage, code }; failed.push(f); onFail(f, error); }
    }
  }
  invariant(failed.length > 0 || pending.length === 0, `pipeline stalled with ${pending.join(", ")} unstarted and nothing failed`);
  return { code: failed[0]?.code ?? 0, failed, notRun: pending };
}

/**
 * Copy a child's output to ours line by line, each line prefixed with its stage name. A line ends at \n, \r\n or a
 * bare \r, so a progress line redrawn with \r comes through as it happens instead of waiting for the next newline;
 * each redraw becomes its own line, since an in-place redraw would overwrite whatever another stage printed meanwhile.
 */
export async function relay(stream: ReadableStream<Uint8Array>, prefix: string, write: (s: string) => void): Promise<void> {
  const decoder = new TextDecoder();
  let buf = "";
  const emit = (final: boolean) => {
    const end = /\r\n|\r|\n/g;
    let from = 0;
    for (let m = end.exec(buf); m; m = end.exec(buf)) {
      // A \r as the last character may be the first half of a \r\n split across chunks: the next chunk decides.
      if (!final && m[0] === "\r" && m.index === buf.length - 1) break;
      const line = buf.slice(from, m.index);
      // An empty segment before a \r is a cursor reset, not a line; an empty one before a newline is a real blank line.
      if (line || m[0] !== "\r") write(`${prefix}${line}\n`);
      from = m.index + m[0].length;
    }
    buf = buf.slice(from);
  };
  const reader = stream.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    buf += decoder.decode(r.value, { stream: true });
    emit(false);
  }
  buf += decoder.decode();
  emit(true);
  if (buf) write(`${prefix}${buf}\n`);
}

async function spawnStage(stage: Stage, cmd: string[]): Promise<number> {
  const prefix = `[${stage}] `;
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [code] = await Promise.all([
    p.exited,
    relay(p.stdout, prefix, (s) => process.stdout.write(s)),
    relay(p.stderr, prefix, (s) => process.stderr.write(s)),
  ]);
  return code;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const runArg = argValue(argv, "--run");
  if (!runArg) { console.error("usage: Run.ts --run <slug|dir> [--from <stage>] [--to <stage>] [--force] [--captions] [--music ambient|pulse] [--accept-review-shortfall] [--polish]"); process.exit(2); }
  const dir = resolveRunDir(runArg);
  const opts: StageOpts = { force: hasFlag(argv, "--force"), captions: hasFlag(argv, "--captions"), music: argValue(argv, "--music"), acceptReviewShortfall: hasFlag(argv, "--accept-review-shortfall"), polish: hasFlag(argv, "--polish") };
  const t0 = Date.now();
  const metaPath = runPaths(dir).meta;
  const mode: PipelineMode = existsSync(metaPath) ? readJson<RunMeta>(metaPath).mode ?? "essay" : "essay";
  const result = await runPipeline(stagesFrom(argValue(argv, "--from"), argValue(argv, "--to"), mode), mode, async (stage) => {
    console.log(`\n━━ ${stage} ━━`);
    const code = await spawnStage(stage, stageCommand(stage, dir, opts));
    if (code !== 0 || stage !== "capture" || mode !== "voice") return code;
    return spawnStage(stage, ["bun", join(import.meta.dir, "Capture.ts"), "--run", dir, "--verify"]);
  }, ({ stage, code }, error) => console.error(`✗ stage ${stage} failed (${code})${error ? `: ${error instanceof Error ? error.message : String(error)}` : ""}`));
  if (result.failed.length) {
    if (result.notRun.length) console.error(`· not run: ${result.notRun.join(", ")}`);
    console.error(`✗ run failed at ${result.failed.map((f) => f.stage).join(", ")}: nothing in ${dir}/Out is deliverable until a run passes`);
    process.exit(result.code);
  }
  console.log(`\n✓ pipeline done in ${Math.round((Date.now() - t0) / 1000)}s → ${dir}/Out`);
}
