/**
 * Where annual-reports keeps its files. The seed catalog ships with the skill
 * (Data/sources.json, never rewritten); UPDATE writes the refreshed catalog, and FETCH
 * writes report summaries, to the user's data folder, so the skill folder stays read-only.
 *
 *   $AGENT_SKILLS_HOME/annual-reports/sources.json   refreshed catalog (wins over the seed)
 *   $AGENT_SKILLS_HOME/annual-reports/Reports/       fetched report summaries
 *   $AGENT_SKILLS_HOME/annual-reports/Config.md      optional `contact:` for the user agent
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { skillDataDir, skillRoot } from "../_portable/paths.ts";

const SKILL = "annual-reports";

/** The catalog that ships with the skill. */
export const SEED_CATALOG = join(skillRoot(import.meta.url), "Data", "sources.json");

/** Where UPDATE writes the refreshed catalog. */
export function userCatalogPath(): string {
  return join(skillDataDir(SKILL, false), "sources.json");
}

/** The catalog to read: the refreshed copy when UPDATE has run, else the seed. */
export function catalogPath(): string {
  const user = userCatalogPath();
  return existsSync(user) ? user : SEED_CATALOG;
}

export function reportsDir(): string {
  return join(skillDataDir(SKILL, false), "Reports");
}

export function configPath(): string {
  return join(skillDataDir(SKILL, false), "Config.md");
}
