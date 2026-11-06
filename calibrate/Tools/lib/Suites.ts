/**
 * Suites — where calibrate finds the assay skill's eval suites and their stored run outputs.
 *
 * Calibrate never imports assay's code; it reads the files assay writes. Search order for a
 * suite named `<name>`:
 *   1. a path to a .yaml/.yml suite file, used as is
 *   2. $AGENT_SKILLS_HOME/assay/Suites/ (the user's own suites; ASSAY_HOME moves the root), then each folder in
 *      ASSAY_SUITE_DIRS (path-list, e.g. the assay skill's bundled Suites/ or another skill's Suites/),
 *      each with its Regression/ and Capability/ subfolders
 *   3. the `suite_path` recorded in the suite's newest stored run (assay's EvalRunner writes it)
 * Stored outputs: $AGENT_SKILLS_HOME/assay/Results/<suite>/<run>/run.json (ASSAY_RESULTS_DIR overrides).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { agentSkillsHome, expandHome, getEnv } from '../_portable/paths.ts';

export function assayHome(): string {
  const o = getEnv('ASSAY_HOME');
  return o ? resolve(expandHome(o)) : join(agentSkillsHome(), 'assay');
}

export function evalsResultsDir(): string {
  const o = getEnv('ASSAY_RESULTS_DIR');
  return o ? resolve(expandHome(o)) : join(assayHome(), 'Results');
}

export function suiteDirs(): string[] {
  const extra = (getEnv('ASSAY_SUITE_DIRS') ?? '').split(delimiter).filter(Boolean).map((d) => resolve(expandHome(d)));
  return [join(assayHome(), 'Suites'), ...extra];
}

/** The suite file path the newest stored run of `name` recorded, when it still exists. */
function recordedSuitePath(name: string): string | null {
  const dir = join(evalsResultsDir(), name);
  if (!existsSync(dir)) return null;
  for (const run of readdirSync(dir).sort().reverse()) {
    try {
      const p = (JSON.parse(readFileSync(join(dir, run, 'run.json'), 'utf8')) as { suite_path?: string }).suite_path;
      if (p && existsSync(p)) return p;
    } catch { /* not a run folder */ }
  }
  return null;
}

export function resolveSuite(name: string): string | null {
  if (/\.ya?ml$/.test(name) && existsSync(name)) return resolve(name);
  for (const dir of suiteDirs()) {
    for (const ext of ['yaml', 'yml']) {
      for (const p of [join(dir, `${name}.${ext}`), join(dir, 'Regression', `${name}.${ext}`), join(dir, 'Capability', `${name}.${ext}`)]) {
        if (existsSync(p)) return p;
      }
    }
  }
  return recordedSuitePath(name);
}

/** Every suite name in the suite folders, plus every suite with stored results. */
export function listSuiteNames(): string[] {
  const names = new Set<string>();
  for (const root of suiteDirs()) for (const dir of [root, join(root, 'Regression'), join(root, 'Capability')]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (/\.ya?ml$/.test(f) && !f.includes('template') && !f.startsWith('_')) names.add(f.replace(/\.ya?ml$/, ''));
  }
  const results = evalsResultsDir();
  if (existsSync(results)) for (const n of readdirSync(results)) if (recordedSuitePath(n)) names.add(n);
  return [...names].sort();
}

/** YAML through Bun's built-in parser (bun 1.2.21+), so the skill needs no npm install. */
export function parseYaml(text: string): unknown {
  return Bun.YAML.parse(text);
}
