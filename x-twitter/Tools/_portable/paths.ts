/**
 * paths: where a skill's own files, the user's data, and secrets live, for any agent.
 *
 * Portable agent-skills library. Canonical copy: agent-skills/tools/portable-lib/.
 * Skills carry a vendored copy in Tools/_portable/; edit the canonical copy and run
 * `python3 tools/lint.py --sync-lib`.
 *
 * Layout:
 *   <skill>/                      the skill folder (SKILL.md, Tools/, References/ ...)
 *   $AGENT_SKILLS_HOME/<skill>/   per-user data and config (default ~/.agent-skills)
 *   $AGENT_SKILLS_HOME/.env       optional KEY=VALUE secrets; real env vars win
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Expands a leading `~`, `$HOME` or `${HOME}`. */
export function expandHome(p: string): string {
  const home = homedir();
  return p.replace(/^(~|\$HOME|\$\{HOME\})(?=\/|$)/, () => home);
}

/** Root for user data of all skills: $AGENT_SKILLS_HOME or ~/.agent-skills. */
export function agentSkillsHome(): string {
  const env = process.env.AGENT_SKILLS_HOME;
  return env ? resolve(expandHome(env)) : join(homedir(), ".agent-skills");
}

/** Data/config folder of one skill, created on demand. */
export function skillDataDir(skill: string, create = true): string {
  const dir = join(agentSkillsHome(), skill);
  if (create) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path inside a skill's data folder. */
export function skillDataPath(skill: string, ...segments: string[]): string {
  return join(skillDataDir(skill), ...segments);
}

/**
 * The skill folder that contains the calling file: walks up from `import.meta.url`
 * until it finds SKILL.md. Use for files shipped with the skill (templates, references).
 */
export function skillRoot(metaUrl: string): string {
  let dir = dirname(fileURLToPath(metaUrl));
  for (;;) {
    if (existsSync(join(dir, "SKILL.md"))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`no SKILL.md above ${fileURLToPath(metaUrl)}`);
    dir = up;
  }
}

let envLoaded = false;

/** Loads $AGENT_SKILLS_HOME/.env once; variables already set in the environment win. */
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const file = join(agentSkillsHome(), ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

/** Reads an env var (after loadEnv); returns undefined when unset or empty. */
export function getEnv(name: string): string | undefined {
  loadEnv();
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

/** Reads a required env var or throws an error that says how to set it. */
export function requireEnv(name: string, hint = ""): string {
  const v = getEnv(name);
  if (v === undefined) {
    throw new Error(
      `${name} is not set. Export it or add it to ${join(agentSkillsHome(), ".env")}${hint ? ` (${hint})` : ""}.`,
    );
  }
  return v;
}
