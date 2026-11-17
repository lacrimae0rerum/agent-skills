#!/usr/bin/env bun
// Adapted from MIT-licensed code (see LICENSE.txt).
/**
 * HyperFrames seam: the one path every HyperFrames render goes through.
 *
 *   bun HyperFrames.ts render   --project <dir> --out <file.mp4|webm|mov> [--fps 30] [--workers 1] [--quality standard]
 *                               [--variables vars.json] [--still] [--audio] [--skip-check] [--no-contrast] [--log render.log] [--gpu auto|hardware|software]
 *   bun HyperFrames.ts snapshot --project <dir> --at 0,1.5 --out-dir <dir> [--gpu auto|hardware|software]
 *   bun HyperFrames.ts check    --project <dir> [--no-contrast] [--gpu auto|hardware|software]
 *   bun HyperFrames.ts bands    --wav narration.wav --fps 30 --out bands.json [--bands 8] [--spectrum 32]
 *   bun HyperFrames.ts stage-gsap --project <dir>
 *   bun HyperFrames.ts install
 *
 * Exit codes: 0 done, 1 the work failed (check, probe, render or validation), 2 usage error.
 * Contract and gotchas: README.md beside this file.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { audioBands } from "./audio";
import { HYPERFRAMES_VERSION } from "./constants";
import { GPU_REQUESTS, resolveGpu, type GpuDecision, type GpuRequest } from "./gpu";
import { blankOf, CODEC_FOR, ffprobe, FLAT_MAX_VARIED, meanLevel, motionOf, sampleFrames, stillStats, stripProvenance, validateOutput, variedFraction, type MotionResult, type OutputFormat, type Validation } from "./media";
import { preflight, type Finding } from "./preflight";
import { probeTimelines, type ProbeResult } from "./probe";
import { ensureInstalled, runHyperFrames, stageGsap } from "./run";

export { audioBands, audioBandsScript, computeAudioBands } from "./audio";

export { embedFonts, facesFromFamilies, facesFromRoles, injectFonts, registerAfterFonts, FontEmbedError } from "./fonts";
export { stageGsap, ensureInstalled } from "./run";
export { preflight } from "./preflight";
export { gpuCanary, resolveGpu, type GpuDecision, type GpuRequest } from "./gpu";
export { HYPERFRAMES_VERSION, GSAP_VERSION } from "./constants";

export type Quality = "draft" | "standard" | "looks" | "high" | "delivery";
export type Stage = "input" | "check" | "probe" | "render" | "strip" | "validate" | "snapshot";

export class HyperFramesError extends Error {
  constructor(public readonly stage: Stage, message: string, public readonly findings: Finding[] = [], public readonly logTail = "") {
    super(`[hyperframes:${stage}] ${message}${findings.length ? "\n" + findings.map(fmtFinding).join("\n") : ""}`);
    this.name = "HyperFramesError";
  }
}

export function fmtFinding(f: Finding): string {
  return `  ${f.severity === "error" ? "✗" : "⚠"} [${f.source}:${f.code}] ${f.message}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : ""}`;
}

/** Root composition attributes, read from the entry HTML. */
export interface RootMeta { id: string; width: number; height: number; durationSec: number | null; fps: number | null }

export function readRoot(projectDir: string, entry = "index.html"): RootMeta {
  const path = join(projectDir, entry);
  if (!existsSync(path)) throw new HyperFramesError("input", `no ${entry} in ${projectDir}`);
  const html = readFileSync(path, "utf8");
  const tag = /<[a-z][^>]*\bdata-composition-id\s*=\s*["']([^"']+)["'][^>]*>/i.exec(html);
  if (!tag) throw new HyperFramesError("input", `${entry} has no element with data-composition-id`);
  const attr = (name: string): number | null => {
    const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag[0]);
    const n = m ? Number(m[1]) : Number.NaN;
    return Number.isFinite(n) ? n : null;
  };
  const width = attr("data-width"), height = attr("data-height");
  if (!width || !height) throw new HyperFramesError("input", `root composition "${tag[1]}" must declare data-width and data-height`);
  return { id: tag[1]!, width, height, durationSec: attr("data-duration"), fps: attr("data-fps") };
}

/** HyperFrames --json output is untyped CLI JSON (`any` on purpose); callers coerce each field they read. */
function parseJsonOutput(stdout: string, what: string): any {
  const start = stdout.indexOf("{");
  if (start < 0) throw new HyperFramesError("check", `${what} printed no JSON: ${stdout.slice(-300)}`);
  try { return JSON.parse(stdout.slice(start)); } catch (e) { throw new HyperFramesError("check", `${what} printed unparseable JSON: ${(e as Error).message}`); }
}

/** gpu: HyperFrames check drives its own Chrome, so it runs in the canary-chosen mode too (README § GPU). */
export interface CheckOptions { projectDir: string; contrast?: boolean; timeoutMs?: number; gpu?: GpuRequest }
export interface CheckResult { ok: boolean; findings: Finding[] }

/** HyperFrames warnings that mean the video will be wrong, promoted to errors. */
const PROMOTED = [/GSAP target .* not found/i, /Failed to load resource/i, /net::ERR_/i];

/** Our static preflight, then HyperFrames `lint`, then its browser `check`. Fails on any error. */
export async function check(opts: CheckOptions): Promise<CheckResult> {
  const projectDir = resolve(opts.projectDir);
  const findings = preflight(projectDir);
  if (findings.some((f) => f.severity === "error")) return { ok: false, findings };
  const gpuWant = gpuRequest(opts.gpu, undefined);
  const inst = await ensureInstalled();
  const lint = await runHyperFrames(["lint", projectDir, "--json"], { timeoutMs: opts.timeoutMs ?? 120_000 });
  const lintJson = parseJsonOutput(lint.stdout, "hyperframes lint");
  for (const f of (lintJson.findings ?? []) as any[]) findings.push({ source: "lint", severity: f.severity === "error" ? "error" : "warning", code: String(f.code), message: String(f.message), file: f.file, line: f.line });
  if (Number(lintJson.errorCount ?? 0) > 0 || lint.code !== 0) return { ok: false, findings };
  const args = ["check", projectDir, "--json"];
  if (opts.contrast === false) args.push("--no-contrast");
  const gpu = await decideGpu(inst.browserPath, gpuWant);
  const chk = await runHyperFrames(args, { timeoutMs: opts.timeoutMs ?? 300_000, extraEnv: { PRODUCER_BROWSER_GPU_MODE: gpu.mode } });
  const chkJson = parseJsonOutput(chk.stdout, "hyperframes check");
  let promoted = false;
  for (const section of ["runtime", "layout", "motion", "contrast"]) {
    for (const f of (chkJson[section]?.findings ?? []) as any[]) {
      const msg = String(f.message);
      const isPromoted = f.severity !== "error" && PROMOTED.some((re) => re.test(msg));
      promoted ||= isPromoted;
      if (f.severity === "info") continue;
      findings.push({ source: "check", severity: f.severity === "error" || isPromoted ? "error" : "warning", code: `${section}:${f.code}`, message: msg, file: f.sourceFile });
    }
  }
  const ok = chk.code === 0 && chkJson.ok === true && !promoted && !findings.some((f) => f.severity === "error");
  return { ok, findings };
}

export interface RenderOptions {
  projectDir: string;
  out: string;
  fps?: number;
  /** Chrome workers. Default 1: on macOS one worker streams frames into the encoder; more spool raw frames to disk (README § Workers). */
  workers?: number;
  quality?: Quality;
  /**
   * x264 constant rate factor (0–51, lower is sharper), passed as --crf over the quality preset's own (high = 15).
   * Text on flat paper wants a low one: the preset's deblock=1,1 smooths letter edges, and a low QP leaves it little to do.
   */
  crf?: number;
  /**
   * Output pixels per composition pixel: 2 renders a 1920x1080 (or 1080x1920) root at 4K through the CLI's --resolution
   * preset, so text and images keep full detail and YouTube serves its high-bitrate 4K encodes (a 1080p upload
   * came out "massively blurry", 2026-10-24). Default 1.
   */
  scale?: 1 | 2;
  format?: OutputFormat;
  variables?: Record<string, unknown>;
  /** Default true. A render whose sampled frames do not differ fails. Set false only for a deliberately still video. */
  expectMotion?: boolean;
  /** Default false. When true the output must carry a non-silent audio stream. */
  expectAudio?: boolean;
  /** Required when the root has no data-duration. */
  durationSec?: number;
  /** Skip check() when the caller just ran it on the same files. The probe and validation always run. */
  skipCheck?: boolean;
  contrast?: boolean;
  timeoutMs?: number;
  logPath?: string;
  motionSamples?: number;
  /**
   * HyperFrames/producer switches for the render process only (HF_* and PRODUCER_* keys; buildEnv refuses
   * anything else). Screenshot capture is on by default; `{ PRODUCER_FORCE_SCREENSHOT: "false" }` opts out (README § Capture modes).
   */
  extraEnv?: Record<string, string>;
  /** Default "auto": hardware when the GPU canary passes, SwiftShader when it does not (README § GPU). "hardware" fails on a failed canary. */
  gpu?: GpuRequest;
}

/** The CLI's 4K --resolution preset for a root of these dimensions; any other root cannot be rendered at scale 2. */
export function resolutionPreset(width: number, height: number): "landscape-4k" | "portrait-4k" {
  if (width === 1920 && height === 1080) return "landscape-4k";
  if (width === 1080 && height === 1920) return "portrait-4k";
  throw new HyperFramesError("input", `scale 2 needs a 1920x1080 or 1080x1920 root, got ${width}x${height}`);
}

export interface RenderResult { out: string; ms: number; check: CheckResult | null; probe: ProbeResult; gpu: GpuDecision; validation: Validation; motion: MotionResult | null; log: string }

function gpuLabel(gpu: GpuDecision): string {
  return `${gpu.mode} (requested ${gpu.requested}${gpu.canary ? `; canary ${gpu.canary.ok ? "passed" : "failed"}: ${gpu.canary.detail}` : ""})`;
}

/**
 * Choose the GPU mode through the canary. The mode reaches HyperFrames as PRODUCER_BROWSER_GPU_MODE,
 * so a caller may not set that key itself: the seam would lose the canary's answer.
 */
function gpuRequest(requested: GpuRequest | undefined, extraEnv: Record<string, string> | undefined): GpuRequest {
  const want = requested ?? "auto";
  if (!GPU_REQUESTS.includes(want)) throw new HyperFramesError("input", `gpu must be one of ${GPU_REQUESTS.join(", ")}, got "${want}"`);
  if (extraEnv && "PRODUCER_BROWSER_GPU_MODE" in extraEnv) throw new HyperFramesError("input", "set the GPU mode with the gpu option (auto, hardware, software), not PRODUCER_BROWSER_GPU_MODE in extraEnv");
  return want;
}

const warned = new WeakSet<GpuDecision>();

async function decideGpu(browserPath: string, want: GpuRequest): Promise<GpuDecision> {
  const gpu = await resolveGpu(browserPath, want);
  if (gpu.requested === "hardware" && !gpu.canary?.ok) {
    throw new HyperFramesError("probe", "hardware GPU was requested but the GPU canary failed", [{ source: "probe", severity: "error", code: "gpu-canary", message: gpuLabel(gpu) }]);
  }
  if (gpu.requested === "auto" && gpu.mode === "software" && !warned.has(gpu)) {
    warned.add(gpu);
    console.error(`[hyperframes:gpu] hardware compositing failed the canary; using SwiftShader. ${gpuLabel(gpu)}`);
  }
  return gpu;
}

const QUALITIES: readonly Quality[] = ["draft", "standard", "looks", "high", "delivery"];

/**
 * Default worker count from the composition's length. Under 20 s one worker wins (2026-09-24 bench: two were slower,
 * four only ~15% faster on 10 s); longer renders split across a third of the cores, capped at 8, and stream captures
 * (HF_CAPTURE_PARALLEL_STREAM, the fastest multi-worker row in the README table).
 */
export function autoWorkers(durationSec: number, cores = availableParallelism()): number {
  if (!(durationSec >= 20)) return 1;
  return Math.max(2, Math.min(8, Math.floor(cores / 3)));
}

/**
 * Render a composition to a validated, provenance-free file. Throws HyperFramesError at the
 * first failed stage. A rejected output is moved to `<name>.rejected.<ext>` so no caller ships it.
 */
export async function render(opts: RenderOptions): Promise<RenderResult> {
  const started = performance.now();
  const projectDir = resolve(opts.projectDir);
  const out = resolve(opts.out);
  const format: OutputFormat = opts.format ?? (extname(out).slice(1).toLowerCase() as OutputFormat);
  if (!(format in CODEC_FOR)) throw new HyperFramesError("input", `unsupported format "${format}" (mp4, webm, mov)`);
  if (extname(out).slice(1).toLowerCase() !== format) throw new HyperFramesError("input", `output ${out} does not end in .${format}`);
  const root = readRoot(projectDir);
  const fps = opts.fps ?? root.fps ?? 30;
  if (!Number.isInteger(fps) || fps < 1 || fps > 240) throw new HyperFramesError("input", `fps must be an integer 1..240, got ${fps}`);
  const durationHint = readRoot(projectDir).durationSec ?? opts.durationSec ?? 0;
  // Every video render goes through here, so long renders run in parallel by default: frame ranges are captured
  // across workers and stitched into one encode.
  const workers = opts.workers ?? autoWorkers(durationHint);
  if (!Number.isInteger(workers) || workers < 1 || workers > 24) throw new HyperFramesError("input", `workers must be 1..24, got ${workers}`);
  const quality = opts.quality ?? "standard";
  if (!QUALITIES.includes(quality)) throw new HyperFramesError("input", `quality must be one of ${QUALITIES.join(", ")}`);
  if (opts.crf !== undefined && !(Number.isInteger(opts.crf) && opts.crf >= 0 && opts.crf <= 51)) throw new HyperFramesError("input", `crf must be an integer 0..51, got ${opts.crf}`);
  if (opts.crf !== undefined && format === "mov") throw new HyperFramesError("input", "crf does not apply to mov output");
  const durationSec = root.durationSec ?? opts.durationSec;
  if (!(durationSec && durationSec > 0)) throw new HyperFramesError("input", "the root has no data-duration and no durationSec was given; the output cannot be validated");
  const expectMotion = opts.expectMotion ?? true;
  const gpuWant = gpuRequest(opts.gpu, opts.extraEnv);

  const checked = opts.skipCheck ? null : await check({ projectDir, contrast: opts.contrast, gpu: gpuWant });
  if (checked && !checked.ok) throw new HyperFramesError("check", "composition failed check", checked.findings.filter((f) => f.severity === "error"));

  const inst = await ensureInstalled();
  const probe = await probeTimelines({ projectDir, browserPath: inst.browserPath, variables: opts.variables, expectMotion, width: root.width, height: root.height });
  if (!probe.ok) throw new HyperFramesError("probe", "timeline probe failed", probe.findings);
  const gpu = await decideGpu(inst.browserPath, gpuWant);

  mkdirSync(dirname(out), { recursive: true });
  const raw = join(dirname(out), `.${basename(out, extname(out))}.hf-raw.${format}`);
  const work = mkdtempSync(join(tmpdir(), "hf-render-"));
  const scale = opts.scale ?? 1;
  const preset = scale === 2 ? resolutionPreset(root.width, root.height) : undefined;
  const args = ["render", projectDir, "--output", raw, "--format", format, "--fps", String(fps), "--workers", String(workers), "--quality", quality, ...(opts.crf !== undefined ? ["--crf", String(opts.crf)] : []), ...(preset ? ["--resolution", preset] : []), "--no-best-effort", "--strict"];
  if (opts.variables) {
    const varsFile = join(work, "variables.json");
    writeFileSync(varsFile, JSON.stringify(opts.variables));
    args.push("--variables-file", varsFile, "--strict-variables");
  }
  const timeoutMs = opts.timeoutMs ?? 120_000 + durationSec * 3_000;
  let log = "";
  try {
    // Screenshot capture is the default: draw-element capture shipped stale frames under load with exit 0
    // (2026-09-24: most of a batch of simultaneous renders on a loaded machine). A caller may opt back in with PRODUCER_FORCE_SCREENSHOT=false.
    const res = await runHyperFrames(args, { timeoutMs, extraEnv: { PRODUCER_FORCE_SCREENSHOT: "true", PRODUCER_BROWSER_GPU_MODE: gpu.mode, ...(workers > 1 ? { HF_CAPTURE_PARALLEL_STREAM: "true" } : {}), ...opts.extraEnv } });
    log = `# gpu: ${gpuLabel(gpu)}\n$ hyperframes ${args.join(" ")}\n${res.stdout}\n${res.stderr}`;
    if (opts.logPath) writeFileSync(opts.logPath, log);
    if (res.code !== 0 || !existsSync(raw)) {
      throw new HyperFramesError("render", res.timedOut ? `render timed out after ${timeoutMs} ms` : `hyperframes render exited ${res.code}`, [], tailOf(log));
    }
    await stripProvenance(raw, out, format);
  } finally {
    rmSync(raw, { force: true });
    rmSync(work, { recursive: true, force: true });
  }

  const reject = (stage: Stage, message: string, findings: Finding[]): never => {
    const rejected = join(dirname(out), `${basename(out, extname(out))}.rejected.${format}`);
    renameSync(out, rejected);
    throw new HyperFramesError(stage, `${message}; output moved to ${rejected}`, findings, tailOf(log));
  };
  const validation = await validateOutput(out, { format, width: root.width * scale, height: root.height * scale, fps, durationSec, audio: opts.expectAudio ?? false });
  if (!validation.ok) reject("validate", "output failed validation", validation.findings);
  const sample = await sampleFrames(out, durationSec, fps, opts.motionSamples ?? 12);
  const blank = blankOf(sample);
  if (!blank.ok) {
    reject("validate", "every sampled frame is one flat colour", [{ source: "validate", severity: "error", code: "blank-frames", message: `${blank.flat} of ${blank.total} frames at ${sample.times.join(", ")} s are flat (mean gray ${blank.meanLevels.join(", ")}); gpu ${gpuLabel(gpu)}. A compositor that draws nothing gives this (README § GPU)` }]);
  }
  let motion: MotionResult | null = null;
  if (expectMotion) {
    motion = motionOf(sample);
    if (!motion.ok) {
      reject("validate", "motion was expected but the rendered frames do not change", [{ source: "validate", severity: "error", code: "no-motion", message: `max changed-pixel fraction ${motion.maxChanged} across ${motion.times.length} frames at ${motion.times.join(", ")} s (needs ≥ 0.001)` }]);
    }
  }
  return { out, ms: Math.round(performance.now() - started), check: checked, probe, gpu, validation, motion, log };
}

function tailOf(log: string, lines = 25): string {
  return log.split("\n").filter((l) => !l.includes("[Render:trace]") && !/Streaming frame|Capturing frame/.test(l)).slice(-lines).join("\n");
}

const FRAME_NAME = /^frame-\d+-at-.*\.png$/;

/** Modification time of every snapshot frame already in `dir`, so a repeat run can tell rewritten frames from stale ones. */
export function frameStamps(dir: string): Map<string, number> {
  return new Map(readdirSync(dir).filter((n) => FRAME_NAME.test(n)).map((n) => [n, statSync(join(dir, n)).mtimeMs]));
}

/** Frames the renderer wrote since `before`: new names, and existing names it overwrote (a repeat into the same directory). */
export function writtenFrames(dir: string, before: Map<string, number>): string[] {
  return readdirSync(dir)
    .filter((n) => FRAME_NAME.test(n) && (!before.has(n) || statSync(join(dir, n)).mtimeMs > before.get(n)!))
    .sort()
    .map((n) => join(dir, n));
}

export interface SnapshotOptions { projectDir: string; times: number[]; outDir: string; variables?: Record<string, unknown>; timeoutMs?: number; gpu?: GpuRequest }
export interface SnapshotResult { files: string[]; probe: ProbeResult; gpu: GpuDecision }

/**
 * Stills at exact times (thumbnails, review frames). Probe first; every PNG is checked for the
 * composition's size, and the set is refused when a still is fully transparent or every still is
 * one flat colour (renamed to `rejected-<name>.png`, so no caller picks them up).
 */
export async function snapshot(opts: SnapshotOptions): Promise<SnapshotResult> {
  const projectDir = resolve(opts.projectDir);
  const outDir = resolve(opts.outDir);
  const root = readRoot(projectDir);
  if (opts.times.length === 0) throw new HyperFramesError("input", "snapshot needs at least one time");
  for (const t of opts.times) {
    if (!Number.isFinite(t) || t < 0 || (root.durationSec !== null && t > root.durationSec)) throw new HyperFramesError("input", `snapshot time ${t} is outside 0..${root.durationSec ?? "?"} s`);
  }
  const gpuWant = gpuRequest(opts.gpu, undefined);
  const findings = preflight(projectDir).filter((f) => f.severity === "error");
  if (findings.length) throw new HyperFramesError("check", "composition failed preflight", findings);
  const inst = await ensureInstalled();
  const probe = await probeTimelines({ projectDir, browserPath: inst.browserPath, variables: opts.variables, expectMotion: false, width: root.width, height: root.height });
  if (!probe.ok) throw new HyperFramesError("probe", "timeline probe failed", probe.findings);
  const gpu = await decideGpu(inst.browserPath, gpuWant);
  mkdirSync(outDir, { recursive: true });
  const before = frameStamps(outDir);
  // runHyperFrames appends --describe false to every snapshot; callers can never pass --describe.
  const res = await runHyperFrames(["snapshot", projectDir, "--at", opts.times.join(","), "--output", outDir, "--no-end"], { timeoutMs: opts.timeoutMs ?? 180_000, extraEnv: { PRODUCER_BROWSER_GPU_MODE: gpu.mode } });
  if (res.code !== 0) throw new HyperFramesError("snapshot", `hyperframes snapshot exited ${res.code}`, [], tailOf(`${res.stdout}\n${res.stderr}`));
  const files = writtenFrames(outDir, before);
  if (files.length !== opts.times.length) throw new HyperFramesError("snapshot", `expected ${opts.times.length} new PNGs in ${outDir}, found ${files.length}`);
  for (const file of files) {
    const info = await ffprobe(file);
    const s = info.streams[0];
    if (!s || s.width !== root.width || s.height !== root.height) throw new HyperFramesError("snapshot", `${basename(file)} is ${s?.width}x${s?.height}, expected ${root.width}x${root.height}`);
    if (statSync(file).size === 0) throw new HyperFramesError("snapshot", `${basename(file)} is empty`);
  }
  const stills = await Promise.all(files.map(stillStats));
  const blank: Finding[] = [];
  files.forEach((file, i) => {
    if (stills[i]!.alphaMax === 0) blank.push({ source: "validate", severity: "error", code: "transparent-frame", message: `${basename(file)} is fully transparent: the compositor drew nothing` });
  });
  if (blank.length === 0 && stills.every((s) => variedFraction(s.gray) < FLAT_MAX_VARIED)) {
    blank.push({ source: "validate", severity: "error", code: "blank-frames", message: `every still is one flat colour (mean gray ${stills.map((s) => meanLevel(s.gray)).join(", ")})` });
  }
  if (blank.length) {
    for (const file of files) renameSync(file, join(dirname(file), `rejected-${basename(file)}`));
    throw new HyperFramesError("snapshot", `stills refused; gpu ${gpuLabel(gpu)} (README § GPU)`, blank, tailOf(`${res.stdout}\n${res.stderr}`));
  }
  return { files, probe, gpu };
}

// ─────────────────────────────────────────────────────────────── CLI

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const need = (name: string): string => {
    const v = flag(rest, name);
    if (!v) throw new UsageError(`--${name} is required`);
    return v;
  };
  const num = (name: string): number | undefined => {
    const v = flag(rest, name);
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new UsageError(`--${name} must be a number`);
    return n;
  };
  switch (cmd) {
    case "render": {
      const varsPath = flag(rest, "variables");
      const project = need("project"), out = need("out"), logPath = flag(rest, "log");
      const res = await render({
        projectDir: project, out, fps: num("fps"), workers: num("workers"), quality: flag(rest, "quality") as Quality | undefined,
        variables: varsPath ? JSON.parse(readFileSync(varsPath, "utf8")) : undefined, expectMotion: !rest.includes("--still"), expectAudio: rest.includes("--audio"),
        durationSec: num("duration"), skipCheck: rest.includes("--skip-check"), contrast: !rest.includes("--no-contrast"), logPath,
        gpu: flag(rest, "gpu") as GpuRequest | undefined,
      });
      console.log(JSON.stringify({ ok: true, out: res.out, ms: res.ms, gpu: res.gpu.mode, video: res.validation.info, motion: res.motion && { maxChanged: res.motion.maxChanged } }));
      return 0;
    }
    case "snapshot": {
      const times = need("at").split(",").map(Number);
      const res = await snapshot({ projectDir: need("project"), times, outDir: need("out-dir"), gpu: flag(rest, "gpu") as GpuRequest | undefined });
      console.log(JSON.stringify({ ok: true, gpu: res.gpu.mode, files: res.files }));
      return 0;
    }
    case "check": {
      const res = await check({ projectDir: need("project"), contrast: !rest.includes("--no-contrast"), gpu: flag(rest, "gpu") as GpuRequest | undefined });
      for (const f of res.findings) console.error(fmtFinding(f));
      console.log(JSON.stringify({ ok: res.ok, errors: res.findings.filter((f) => f.severity === "error").length, warnings: res.findings.filter((f) => f.severity === "warning").length }));
      return res.ok ? 0 : 1;
    }
    case "bands": {
      const fps = num("fps");
      if (!fps) throw new UsageError("--fps is required");
      const res = await audioBands({ wav: need("wav"), fps, out: need("out"), bands: num("bands"), spectrumSamples: num("spectrum") });
      console.log(JSON.stringify({ ok: true, frames: res.frameCount, bands: res.bands.count, spectrum: res.spectrum?.samples ?? 0 }));
      return 0;
    }
    case "stage-gsap":
      console.log(await stageGsap(resolve(need("project"))));
      return 0;
    case "install": {
      const inst = await ensureInstalled();
      console.log(JSON.stringify({ ok: true, version: inst.version, browser: inst.browserPath, pinned: HYPERFRAMES_VERSION }));
      return 0;
    }
    default:
      throw new UsageError(`unknown command "${cmd ?? ""}" (render, snapshot, check, bands, stage-gsap, install)`);
  }
}

class UsageError extends Error {}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    if (err instanceof HyperFramesError && err.logTail) console.error(`--- render log tail ---\n${err.logTail}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}
