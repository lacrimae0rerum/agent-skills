#!/usr/bin/env bun
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { invariant } from './_portable/invariant.ts';
import { expandHome, getEnv } from './_portable/paths.ts';

/** sha256 of a file, or of a directory as every entry's relative path plus its bytes (symlinks by target, never followed). */
export function contentDigest(path: string): string {
  const fileSha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const info = lstatSync(path);
  if (info.isFile()) return fileSha(path);
  invariant(info.isDirectory(), `contentDigest needs a file or directory: ${path}`);
  const lines: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name), rel = relative(path, full).split(sep).join('/'), entry = lstatSync(full);
      if (entry.isSymbolicLink()) lines.push(`${rel}\0link:${readlinkSync(full)}`);
      else if (entry.isDirectory()) { lines.push(`${rel}/\0dir`); walk(full); }
      else if (entry.isFile()) lines.push(`${rel}\0${fileSha(full)}`);
    }
  };
  walk(path);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** `to` defaults to the hand-over folder: $AGENT_SKILLS_OUTPUT_DIR, else ~/Downloads. */
export interface DeliveryOptions { artifact: string; critique?: string; to?: string }
export interface CopiedFile { source: string; dest: string; bytes: number }
/** What was copied. */
export interface DeliveryResult { files: CopiedFile[] }
/** The default hand-over folder: $AGENT_SKILLS_OUTPUT_DIR, else ~/Downloads. */
export function defaultOutputDir(): string {
  const dir = getEnv('AGENT_SKILLS_OUTPUT_DIR');
  return dir ? resolve(expandHome(dir)) : join(homedir(), 'Downloads');
}
/** sha256 of one file's bytes. */
function sha256File(file: string): string { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
/** Resolve existing ancestors too, so a destination symlink cannot point into the source. */
function canonical(file: string): string {
  const path = resolve(file);
  return existsSync(path) ? realpathSync(path) : join(canonical(dirname(path)), basename(path));
}
/** The whole-deck digest a slides critique is bound to (Brief.json deckSha256): every file's path and bytes in the package. */
export function deckDigest(deck: string): string {
  const path = resolve(deck);
  if (extname(path).toLowerCase() !== '.key' || !existsSync(path)) throw new Error(`Not a .key deck: ${path}`);
  newestMtimeMs(path); // refuses symlinks, as delivery does
  return contentDigest(path);
}
/** deliverChecked's copied files, for callers that only need what landed. */
export async function deliver(options: DeliveryOptions): Promise<CopiedFile[]> {
  return (await deliverChecked(options)).files;
}
/** The newest mtime of any file in a deck (a Keynote package directory, or a single-file .key). */
function newestMtimeMs(path: string): number {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw new Error(`Deck symlinks are not supported: ${path}`);
  if (info.isFile()) return info.mtimeMs;
  return readdirSync(path).reduce((max, name) => Math.max(max, newestMtimeMs(join(path, name))), 0);
}
/**
 * A deck cannot be judged by Critique.ts, which reads images and video, so a deck is delivered on a critique of its
 * exported slide frames: the critique's brief is kind "slides" and carries `deckSha256`, the digest of the whole deck
 * when its frames were exported (`Deliver.ts --deck-digest <deck>`), which must equal the deck's digest now; the frame
 * it names (`artifact`) still has the bytes and mtime the critique scored; and no file in the deck is newer than that
 * frame. The digest is what ties the deck's bytes to the critique: mtimes can be copied or set back.
 * Returns the frame path and the deck digest.
 */
function deckFrame(deck: string, critique: Record<string, unknown>): { frame: string; deckSha256: string } {
  const brief = critique.brief;
  if (typeof brief !== 'object' || brief === null || (brief as { kind?: unknown }).kind !== 'slides') throw new Error('Deck critique must judge the slides: its brief kind must be "slides"');
  const bound = (brief as { deckSha256?: unknown }).deckSha256;
  if (typeof bound !== 'string' || !/^[0-9a-f]{64}$/.test(bound)) throw new Error(`Deck critique must bind the deck: its brief needs deckSha256 from \`bun Tools/Deliver.ts --deck-digest ${deck}\` (in this skill's folder), taken when the slides were exported`);
  const now = contentDigest(deck);
  if (bound !== now) throw new Error('Stale critique: the deck digest does not match the deckSha256 its slides critique was bound to; export and critique again');
  const frame = critique.artifact;
  if (typeof frame !== 'string' || !existsSync(frame) || !statSync(frame).isFile()) throw new Error('Deck critique must name the exported slide frame it scored (artifact)');
  if (critique.artifactMtime !== statSync(frame).mtime.toISOString()) throw new Error('Stale critique: the critiqued slide frame changed after the critique');
  if (typeof critique.artifactSha256 !== 'string' || critique.artifactSha256 !== createHash('sha256').update(readFileSync(frame)).digest('hex')) throw new Error('Stale critique: slide frame sha256 does not match the artifactSha256 in the critique');
  if (newestMtimeMs(deck) > statSync(frame).mtimeMs) throw new Error('Stale critique: the deck changed after its slides were exported and critiqued; export and critique again');
  return { frame, deckSha256: now };
}
/**
 * Refuses without a passing critique fresh to the artifact bytes (literal pass, exact mtime, matching sha256).
 * A .key deck (package directory or single file) is delivered on a critique of its exported slides (deckFrame).
 */
export async function deliverChecked(options: DeliveryOptions): Promise<DeliveryResult> {
  const artifact = resolve(options.artifact), to = canonical(options.to ?? defaultOutputDir());
  const deck = extname(artifact).toLowerCase() === '.key';
  if (deck ? !existsSync(artifact) : !statSync(artifact).isFile()) throw new Error(`Artifact is not a file: ${artifact}`);
  const critiqueFile = resolve(options.critique ?? join(dirname(artifact), 'Critique.json'));
  if (!existsSync(critiqueFile)) throw new Error(`Missing critique: ${critiqueFile}`);
  let critique: unknown;
  try { critique = JSON.parse(readFileSync(critiqueFile, 'utf8')); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid critique JSON: ${critiqueFile}`);
    throw error;
  }
  if (typeof critique !== 'object' || critique === null || Array.isArray(critique) || !('verdict' in critique) || typeof critique.verdict !== 'string' || !('artifactMtime' in critique) || typeof critique.artifactMtime !== 'string') throw new Error('Invalid critique shape: verdict and artifactMtime must be strings');
  if (critique.verdict !== 'pass') throw new Error(`Critique verdict is ${critique.verdict}; delivery requires pass`);
  // The file the critique scored: the artifact itself, or a deck's exported slide frame.
  const bound = deck ? deckFrame(artifact, critique as Record<string, unknown>) : null;
  const scored = bound ? bound.frame : artifact;
  if (!deck) {
    if (critique.artifactMtime !== statSync(artifact).mtime.toISOString()) throw new Error('Stale critique: artifact mtime does not match artifactMtime');
    // Bound by sha: Critique.ts writes artifactSha256, the sha256 of the bytes it scored. A critique without it, or with
    // another file's, is refused: mtime alone can match changed bytes, and a hand-written Critique.json has no binding.
    if (!('artifactSha256' in critique) || typeof critique.artifactSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(critique.artifactSha256)) throw new Error(`Unbound critique: ${critiqueFile} carries no artifactSha256, so it is not tied to these bytes; run the critique (Tools/Critique.ts in this skill) on ${artifact}`);
    if (critique.artifactSha256 !== createHash('sha256').update(readFileSync(artifact)).digest('hex')) throw new Error('Stale critique: artifact sha256 does not match the artifactSha256 in the critique');
  }
  const deckDest = join(to, basename(artifact));
  const files: CopiedFile[] = deck ? [] : [{ source: artifact, dest: deckDest, bytes: statSync(artifact).size }];
  const directories = [to], review = join(dirname(artifact), 'review');
  function collect(source: string, dest: string, label = 'Review'): void {
    const info = lstatSync(source);
    if (info.isSymbolicLink()) throw new Error(`${label} symlinks are not supported: ${source}`);
    if (info.isDirectory()) {
      directories.push(dest);
      for (const name of readdirSync(source).sort()) collect(join(source, name), join(dest, name), label);
    } else if (info.isFile()) files.push({ source, dest, bytes: info.size });
    else throw new Error(`${label} entry is not a regular file or directory: ${source}`);
  }
  if (deck) {
    const inside = relative(canonical(artifact), canonical(deckDest));
    if (inside === '' || (!inside.startsWith(`..${sep}`) && inside !== '..')) throw new Error('Deck destination must not be inside the deck');
    // Copying a package over an older one would leave the older one's files inside it.
    if (existsSync(deckDest) && lstatSync(deckDest).isDirectory()) throw new Error(`Deck destination already exists: ${deckDest}; move it aside first`);
    collect(artifact, deckDest, 'Deck');
  }
  if (extname(artifact).toLowerCase() === '.mp4' && existsSync(review)) {
    const destinationReview = canonical(join(to, 'review')), sourceReview = canonical(review);
    const inside = relative(sourceReview, destinationReview);
    if (inside === '' || (!inside.startsWith(`..${sep}`) && inside !== '..')) throw new Error('Review destination must not be inside source review');
    collect(review, join(to, 'review'));
  }
  for (const file of files) {
    if (canonical(file.source) === canonical(file.dest) || existsSync(file.dest) && statSync(file.source).dev === statSync(file.dest).dev && statSync(file.source).ino === statSync(file.dest).ino) throw new Error(`Destination would replace source: ${file.dest}`);
  }
  const scoredSha = sha256File(scored);
  function assertPassing(): void {
    invariant(critique !== null && typeof critique === 'object' && 'verdict' in critique && critique.verdict === 'pass', 'Delivery requires literal pass');
    invariant('artifactMtime' in critique && critique.artifactMtime === statSync(scored).mtime.toISOString(), 'Delivery requires exact artifact mtime');
  }
  for (const directory of directories) { assertPassing(); mkdirSync(directory, { recursive: true }); }
  for (const file of files) { assertPassing(); copyFileSync(file.source, file.dest); file.bytes = statSync(file.dest).size; }
  // The file that landed is the file the critique scored, byte for byte.
  if (!deck) invariant(sha256File(join(to, basename(artifact))) === scoredSha, `Delivered ${basename(artifact)} does not match the bytes its critique scored`);
  if (bound) {
    // The deck that landed is the deck the slides critique was bound to, byte for byte.
    const landed = contentDigest(deckDest);
    invariant(landed === bound.deckSha256, `Delivered deck ${deckDest} does not match the critiqued deck digest`);
  }
  return { files };
}

if (import.meta.main) {
  try {
    const { values: v } = parseArgs({ args: Bun.argv.slice(2), strict: true, options: { artifact: { type: 'string' }, critique: { type: 'string' }, to: { type: 'string' }, 'deck-digest': { type: 'string' } } });
    // The digest a slides Brief.json carries as deckSha256, taken when the frames are exported.
    if (v['deck-digest']) { console.log(deckDigest(v['deck-digest'])); process.exit(0); }
    if (!v.artifact) throw new Error('Use --artifact <file|deck.key> [--critique <Critique.json>] [--to <dir>] (default $AGENT_SKILLS_OUTPUT_DIR, else ~/Downloads), or --deck-digest <deck.key>');
    const result = await deliverChecked({ artifact: v.artifact, critique: v.critique, to: v.to });
    for (const file of result.files) console.log(`${file.source} → ${file.dest} (${file.bytes} bytes)`);
    process.exit(0);
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
}
