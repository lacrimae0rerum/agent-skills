/**
 * AssayPaths — where suites, results and calibration sets live, and how suite file references resolve.
 *
 *   <assay>/Suites/                       suites shipped with this skill (generic, publishable)
 *   $AGENT_SKILLS_HOME/assay/Suites/      the user's own suites (identity-bound ones stay here, never in a repo)
 *   ASSAY_SUITE_DIRS                      more suite folders, path-list (another skill's Suites/, a project's evals/)
 *   $AGENT_SKILLS_HOME/assay/Results/     run results: <suite>/<run>/run.json, <suite>/latest.json (ASSAY_RESULTS_DIR)
 *   $AGENT_SKILLS_HOME/assay/Calibration/ calibration sets and records (ASSAY_CALIBRATION_DIR)
 *
 * A suite can also be run by path from any folder (`-s path/to/suite.yaml`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { expandHome, getEnv, skillDataDir, skillRoot } from '../_portable/paths.ts';

export const SKILL_DIR = skillRoot(import.meta.url);
export const SKILL_SUITES = join(SKILL_DIR, 'Suites');

export function assayHome(): string {
  const o = getEnv('ASSAY_HOME');
  return o ? resolve(expandHome(o)) : skillDataDir('assay', false);
}
export function userSuitesDir(): string { return join(assayHome(), 'Suites'); }
export function resultsDir(): string {
  const o = getEnv('ASSAY_RESULTS_DIR');
  return o ? resolve(expandHome(o)) : join(assayHome(), 'Results');
}
export function calibrationDir(): string {
  const o = getEnv('ASSAY_CALIBRATION_DIR');
  return o ? resolve(expandHome(o)) : join(assayHome(), 'Calibration');
}
export function extraSuiteDirs(): string[] {
  return (getEnv('ASSAY_SUITE_DIRS') ?? '').split(delimiter).filter(Boolean).map((d) => resolve(expandHome(d)));
}
/** Suite roots, user first: the user's suites, then ASSAY_SUITE_DIRS, then the shipped suites. */
export function suiteDirs(): string[] {
  return [userSuitesDir(), ...extraSuiteDirs(), SKILL_SUITES];
}

/** A suite name (searched in each root, its Regression/ and Capability/) or a path to a .yaml/.yml file. */
export function resolveSuiteIn(name: string, dirs: string[] = suiteDirs()): string | null {
  if (/\.ya?ml$/i.test(name)) {
    const p = resolve(expandHome(name));
    if (existsSync(p)) return p;
  }
  for (const dir of dirs) {
    for (const ext of ['yaml', 'yml']) {
      for (const p of [join(dir, `${name}.${ext}`), join(dir, 'Regression', `${name}.${ext}`), join(dir, 'Capability', `${name}.${ext}`)]) {
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

/** Env var that points at an installed skill's folder: `detect-ai` → DETECT_AI_SKILL_DIR. */
export function skillDirEnv(skill: string): string {
  return `${skill.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_SKILL_DIR`;
}

/**
 * A path a suite names (system_prompt_file, image, …):
 *   skill:<name>/<rel>  → $<NAME>_SKILL_DIR/<rel>, else the sibling folder <assay>/../<name>/<rel>
 *   ~/… or $HOME/…      → expanded
 *   absolute            → as is
 *   relative            → against the suite file's folder
 */
export function resolveSuitePath(ref: string, suiteFile?: string | null): string {
  const m = ref.match(/^skill:([a-z0-9-]+)\/(.+)$/);
  if (m) {
    const base = getEnv(skillDirEnv(m[1]!)) ?? join(dirname(SKILL_DIR), m[1]!);
    return resolve(expandHome(base), m[2]!);
  }
  const p = expandHome(ref);
  if (isAbsolute(p)) return p;
  return suiteFile ? resolve(dirname(suiteFile), p) : resolve(p);
}

/** YAML through Bun's built-in parser (bun 1.2.21+), so the skill needs no npm install. */
export function parseYaml(text: string): unknown {
  return Bun.YAML.parse(text);
}
export function stringifyYaml(value: unknown): string {
  return Bun.YAML.stringify(value, null, 2);
}

/** The agent instructions a suite runs under when it names none: ASSAY_SYSTEM_PROMPT_FILE (e.g. the user's AGENTS.md), else a minimal prompt. */
export function defaultSystemPrompt(): string {
  const f = getEnv('ASSAY_SYSTEM_PROMPT_FILE');
  if (f) {
    const p = resolve(expandHome(f));
    if (existsSync(p)) return readFileSync(p, 'utf-8');
    throw new Error(`ASSAY_SYSTEM_PROMPT_FILE points at ${p}, which does not exist`);
  }
  return 'You are a precise assistant. Verify before claiming done; be concise.';
}
