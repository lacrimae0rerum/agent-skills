/**
 * Optional sibling skills. EvalRound drives judges that ship with other skills of this collection as CLIs:
 * `assay` (ImageAsserts, VisionJudge, Tournament, Proof), `art-direction` (Critique, Deliver) and, for film
 * rounds, `hyperframes` (FilmStats, TextFit). Each is found through its env var when set, else as a folder
 * beside this skill (the usual layout when the skills are installed together). Nothing here is imported from
 * those skills: they run as separate processes, and a missing one is reported, never guessed at.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { expandHome, getEnv, skillRoot } from '../_portable/paths.ts';

export const SIBLINGS = {
  assay: 'ASSAY_SKILL_DIR',
  'art-direction': 'ART_DIRECTION_SKILL_DIR',
  hyperframes: 'HYPERFRAMES_SKILL_DIR',
} as const;
export type Sibling = keyof typeof SIBLINGS;

/** Folder of an optional sibling skill: $<NAME>_SKILL_DIR, else <skills dir>/<name> beside this skill. */
export function siblingDir(name: Sibling): string {
  const fromEnv = getEnv(SIBLINGS[name]);
  if (fromEnv) return resolve(expandHome(fromEnv));
  return join(dirname(skillRoot(import.meta.url)), name);
}

/** A tool file inside a sibling skill's Tools/ folder. */
export function siblingTool(name: Sibling, file: string): string {
  return join(siblingDir(name), 'Tools', file);
}

/** The tools in `paths` that do not exist, each with the install hint for its skill. */
export function missingTools(paths: Record<string, string>): string[] {
  return Object.entries(paths)
    .filter(([, p]) => !existsSync(p))
    .map(([k, p]) => `${k}: ${p} not found`);
}

export function siblingHint(): string {
  return `install the optional skills beside this one, or point ${Object.values(SIBLINGS).join(' / ')} at their folders`;
}
