/**
 * CalibrateTaste — the user's taste profile for one calibrate target.
 *
 * Calibrate sessions collect 0–10 scores with the user's own notes; the Distill
 * intent turns them into Taste.json, where every principle cites the label ids
 * that support it. Judges read the rendered profile: the assay skill's EvalRunner
 * appends it to the judged asserts of a suite whose name (or `calibration:` field)
 * matches a target, and an image critique tool can add it to its rubric prompt.
 * The file format is the contract; each skill keeps its own reader.
 *
 * Store: $AGENT_SKILLS_HOME/calibrate/Targets/<target>/Taste.json (CALIBRATE_DIR overrides the root).
 *
 * Adapted from MIT-licensed code (see LICENSE.txt).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expandHome, getEnv, skillDataDir } from '../_portable/paths.ts';

export interface TastePrinciple { principle: string; evidence: string[] }
export interface Taste {
  target: string;
  updated: string;
  labels_hash: string;
  label_count: number;
  summary: string;
  likes: TastePrinciple[];
  dislikes: TastePrinciple[];
}

const TARGET_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function calibrateRoot(): string {
  const override = getEnv('CALIBRATE_DIR');
  return override ? resolve(expandHome(override)) : skillDataDir('calibrate', false);
}

export function assertTargetName(target: string): string {
  if (!TARGET_RE.test(target)) throw new Error(`Invalid target name "${target}": lowercase letters, digits and dashes`);
  return target;
}

export function targetDir(target: string): string { return join(calibrateRoot(), 'Targets', assertTargetName(target)); }
export function tastePath(target: string): string { return join(targetDir(target), 'Taste.json'); }

const nonempty = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

/** Validates shape; with `knownIds`, every cited id must be a real label. */
export function parseTaste(x: unknown, knownIds?: Set<string>): Taste {
  if (typeof x !== 'object' || x === null) throw new Error('Taste must be an object');
  const t = x as Record<string, unknown>;
  if (!nonempty(t.target) || !nonempty(t.updated) || !nonempty(t.labels_hash) || !nonempty(t.summary)) throw new Error('Taste needs target, updated, labels_hash, summary');
  if (typeof t.label_count !== 'number' || !Number.isInteger(t.label_count) || t.label_count < 1) throw new Error('Taste label_count must be a positive integer');
  for (const side of ['likes', 'dislikes'] as const) {
    const list = t[side];
    if (!Array.isArray(list)) throw new Error(`Taste ${side} must be an array`);
    for (const p of list) {
      if (typeof p !== 'object' || p === null || !nonempty((p as TastePrinciple).principle)) throw new Error(`Taste ${side} entry needs a principle`);
      const ev = (p as TastePrinciple).evidence;
      if (!Array.isArray(ev) || ev.length === 0 || !ev.every(nonempty)) throw new Error(`Taste principle "${(p as TastePrinciple).principle}" cites no label ids`);
      if (knownIds) for (const id of ev) if (!knownIds.has(id)) throw new Error(`Taste principle "${(p as TastePrinciple).principle}" cites unknown label ${id}`);
    }
  }
  if ((t.likes as unknown[]).length + (t.dislikes as unknown[]).length === 0) throw new Error('Taste has no principles');
  return x as Taste;
}

export function loadTaste(target: string): Taste | null {
  const path = tastePath(target);
  if (!existsSync(path)) return null;
  return parseTaste(JSON.parse(readFileSync(path, 'utf8')));
}

/** A target's taste, or null when the name is not a valid target or has no profile. */
export function tasteFor(target: string | undefined): Taste | null {
  if (!target || !TARGET_RE.test(target)) return null;
  return loadTaste(target);
}

/** Text judges read taste appended to each judged assertion's instruction. */
export function withTasteValue(value: string, taste: Taste | null): string {
  return taste ? `${value}\n\n${renderTaste(taste)}` : value;
}

/** The block a judge reads. Label ids stay out: they mean nothing to a judge. */
export function renderTaste(taste: Taste): string {
  const lines = [
    `User taste, distilled from ${taste.label_count} artifacts the user personally labeled (target ${taste.target}, ${taste.updated.slice(0, 10)}).`,
    'Where this conflicts with generic taste, the user\'s taste wins. It does not excuse visible craft defects.',
    `Summary: ${taste.summary}`,
  ];
  if (taste.likes.length) lines.push('The user likes:', ...taste.likes.map(p => `- ${p.principle}`));
  if (taste.dislikes.length) lines.push('The user dislikes:', ...taste.dislikes.map(p => `- ${p.principle}`));
  return lines.join('\n');
}
