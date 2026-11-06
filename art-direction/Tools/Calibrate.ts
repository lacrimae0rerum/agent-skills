#!/usr/bin/env bun
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { invariant } from './_portable/invariant.ts';
import { artDirectionUserDir } from './Critique.ts';

export interface CalibrationOptions { artifact: string; verdict: string | number; note: string }
/** One label: the user's verdict verbatim, the artifact it judges, and `pass` (verdict at or above keeper_verdict). */
export interface Label { artifact: string; sha256: string; mtime: string; verdict: number; note: string; date: string; medianAtLabel: unknown; pass: boolean; keeperVerdict: number }
/** The keeper bar when the user has not set one: the shipped Config.md template's value. */
export const DEFAULT_KEEPER_VERDICT = 7;
/** The user's keeper bar: a 1-10 verdict at or above it is recorded as a pass. It is the `keeper_verdict: N` line in
 * the skill's Config.md; a missing file or key falls back to DEFAULT_KEEPER_VERDICT, and a malformed value is an error
 * naming both. */
export function keeperVerdict(dir: string = artDirectionUserDir()): number {
  const file = join(dir, 'Config.md');
  let text: string;
  try { text = readFileSync(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_KEEPER_VERDICT;
    throw error;
  }
  const match = text.match(/^keeper_verdict:[ \t]*(\S*)[ \t]*$/m);
  if (!match) return DEFAULT_KEEPER_VERDICT;
  const bar = Number(match[1]);
  if (match[1] === '' || !Number.isInteger(bar) || bar < 1 || bar > 10) throw new Error(`keeper_verdict in ${file} must be an integer 1–10, got "${match[1]}"`);
  return bar;
}
export function calibrate(options: CalibrationOptions, deps: { labelsFile?: string; configDir?: string } = {}): Label {
  const verdict = typeof options.verdict === 'string' && options.verdict.trim() === '' ? NaN : Number(options.verdict);
  if (!Number.isInteger(verdict) || verdict < 1 || verdict > 10) throw new Error('Verdict must be an integer 1–10');
  if (typeof options.note !== 'string') throw new Error('Note must be a string');
  const artifact = resolve(options.artifact), info = statSync(artifact);
  if (!info.isFile()) throw new Error(`Artifact is not a file: ${artifact}`);
  const passAt = keeperVerdict(deps.configDir);
  const sha256 = createHash('sha256').update(readFileSync(artifact)).digest('hex');
  let medianAtLabel: unknown = null;
  try {
    const critique: unknown = JSON.parse(readFileSync(join(dirname(artifact), 'Critique.json'), 'utf8'));
    if (typeof critique === 'object' && critique !== null && 'median' in critique) medianAtLabel = critique.median ?? null;
  } catch (error) { if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const label: Label = { artifact, sha256, mtime: info.mtime.toISOString(), verdict, note: options.note, date: new Date().toISOString(), medianAtLabel, pass: verdict >= passAt, keeperVerdict: passAt };
  const labelsFile = resolve(deps.labelsFile ?? join(artDirectionUserDir(), 'labels.jsonl'));
  invariant(Number.isInteger(verdict) && verdict >= 1 && verdict <= 10, 'Calibration requires an integer verdict 1–10');
  mkdirSync(dirname(labelsFile), { recursive: true });
  invariant(Number.isInteger(label.verdict) && label.verdict >= 1 && label.verdict <= 10, 'Calibration label verdict is valid');
  // Append only: earlier labels stay intact, and this file is the one label store.
  appendFileSync(labelsFile, JSON.stringify(label) + '\n');
  return label;
}
if (import.meta.main) {
  try {
    const { values: v } = parseArgs({ args: Bun.argv.slice(2), strict: true, options: { artifact: { type: 'string' }, verdict: { type: 'string' }, note: { type: 'string' } } });
    if (!v.artifact || v.verdict === undefined || v.note === undefined) throw new Error('Use --artifact <file> --verdict <1-10> --note "<the user\'s words>"');
    console.log(JSON.stringify(calibrate({ artifact: v.artifact, verdict: v.verdict, note: v.note })));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
