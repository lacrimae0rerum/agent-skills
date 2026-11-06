#!/usr/bin/env bun
/**
 * Build.ts — write a run's film as a HyperFrames composition and render it through the shared seam.
 *
 *   bun Build.ts --run <slug|dir> [--no-captions] [--stage-only] [--workers N] [--end-line "text"]
 *
 * Staging writes <run>/Out/composition/ (FilmComposition.ts): every current shot cropped to its paper edge, the
 * narration, the plan, the runtime and the embedded serif. The render goes through the HyperFrames seam (lib/hyperframes) only:
 * pinned CLI, network sandbox, check + timeline probe, then a provenance-free Out/film.mp4 (1920x1080, 30 fps,
 * H.264 + AAC) that the seam has already checked for size, frame count, audio and motion. `--workers` is the
 * seam's Chrome worker count (default 1; raise it only for long films).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HYPERFRAMES_VERSION, render as renderComposition, type RenderResult } from "./lib/hyperframes/HyperFrames.ts";
import { invariant } from "./_portable/invariant.ts";
import { writeComposition } from "./FilmComposition.ts";
import { buildPlan, type FilmPlan } from "./FilmTimeline.ts";
import { FPS, HEIGHT, WIDTH, argValue, ensureDir, hasFlag, loadBeats, loadRun, loadSkillConfig, loadStoryboard, loadTimeline, resolveRunDir, runPaths, writeJson } from "./Lib.ts";
import { cropPaper, currentPath } from "./Paint.ts";
import { fileSha256 } from "./Verify.ts";

export async function stageRun(dir: string, opts: { captions?: boolean; endLine?: string } = {}): Promise<{ plan: FilmPlan; projectDir: string; trimmed: number }> {
  const paths = runPaths(dir);
  const run = loadRun(dir);
  const beats = loadBeats(dir);
  const sb = loadStoryboard(dir);
  const timeline = loadTimeline(dir);
  invariant(existsSync(paths.narrationWav), "narration.wav missing — run Narrate.ts first");
  invariant(timeline.beats.length === beats.beats.length, `timeline has ${timeline.beats.length} beats, story has ${beats.beats.length} — re-run Narrate.ts`);
  invariant(timeline.fps === FPS, `timeline is at ${timeline.fps} fps, the film renders at ${FPS}`);
  const shotsById = new Map(sb.shots.map((s) => [s.beat, s]));
  const filmBeats = beats.beats.map((b) => {
    const shot = shotsById.get(b.id);
    invariant(shot, `${b.id}: no storyboard shot`);
    invariant(currentPath(paths.shots, b.id), `${b.id}: shot missing — run Shots.ts first`);
    return { id: b.id, text: b.text, image: `${b.id}.png`, motion: shot.motion, focus: shot.focus ?? { x: 0.5, y: 0.5 } };
  });
  ensureDir(paths.out);
  // Staging intent only, with no film hash: it cannot excuse the caption check until render() binds it to the bytes it produced.
  writeJson(join(paths.out, "caption-mode.json"), { captions: opts.captions ?? true });
  const plan = buildPlan({ timeline, beats: filmBeats, title: run.title, author: run.author, endLine: opts.endLine, captions: opts.captions ?? true, width: WIDTH, height: HEIGHT });
  // Every shot is cropped to its painting on the way in: the image model leaves a bare-paper margin however it is asked.
  const { trimmed } = await writeComposition({
    projectDir: paths.composition,
    plan,
    narrationWav: paths.narrationWav,
    config: loadSkillConfig(),
    stageImage: async (id, dest) => (await cropPaper(currentPath(paths.shots, id)!, dest)).trimmed,
  });
  return { plan, projectDir: paths.composition, trimmed };
}

/** Bind the staged caption mode to the film just rendered, so Verify can trust it only for these exact bytes. */
export async function bindCaptionMode(video: string): Promise<void> {
  const p = join(dirname(video), "caption-mode.json");
  if (!existsSync(p)) return;
  const staged = JSON.parse(readFileSync(p, "utf8")) as { captions?: boolean };
  writeJson(p, { captions: staged.captions !== false, videoSha256: await fileSha256(video) });
}

export async function render(projectDir: string, out: string, opts: { workers?: number; logPath?: string } = {}): Promise<RenderResult> {
  const res = await renderComposition({ projectDir, out, fps: FPS, workers: opts.workers ?? 1, quality: "standard", expectAudio: true, expectMotion: true, logPath: opts.logPath });
  await bindCaptionMode(out);
  return res;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const runArg = argValue(argv, "--run");
  if (!runArg) { console.error("usage: Build.ts --run <slug|dir> [--no-captions] [--stage-only] [--workers N] [--end-line text]"); process.exit(2); }
  const dir = resolveRunDir(runArg);
  const paths = runPaths(dir);
  const workersArg = argValue(argv, "--workers");
  const workers = workersArg === undefined ? undefined : Number(workersArg);
  if (workers !== undefined && !(Number.isInteger(workers) && workers >= 1)) { console.error("--workers must be a positive integer"); process.exit(2); }
  const { plan, projectDir, trimmed } = await stageRun(dir, { captions: !hasFlag(argv, "--no-captions"), endLine: argValue(argv, "--end-line") });
  console.log(`✓ staged ${plan.paintings.length} beats (${trimmed} paper-trimmed) · ${plan.total.toFixed(1)}s · ${WIDTH}x${HEIGHT}@${FPS}${plan.captions ? " · captions" : ""} → ${projectDir}`);
  if (hasFlag(argv, "--stage-only")) process.exit(0);
  ensureDir(paths.out);
  const res = await render(projectDir, paths.video, { workers, logPath: paths.renderLog });
  writeJson(join(paths.out, "render.json"), { renderedAt: new Date().toISOString(), engine: `hyperframes@${HYPERFRAMES_VERSION}`, workers: workers ?? 1, seconds: Math.round(res.ms / 1000), video: res.validation.info, project: projectDir });
  console.log(`✓ ${paths.video} (${Math.round(res.ms / 1000)}s)`);
}
