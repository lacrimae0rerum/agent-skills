/**
 * UsStatsConfig.ts — reads the user's us-stats config:
 * $USSTATS_CONFIG, else $AGENT_SKILLS_HOME/us-stats/config.md (default ~/.agent-skills/us-stats/config.md)
 *
 * Format: `key: value` lines (inside or outside a fenced block). Read-only.
 * Keys: data_url, site_name, data_dir, seed_source, seed_checkout_hint (see Setup.md).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expandHome, getEnv, skillDataDir } from "./_portable/paths.ts";

export const SKILL_NAME = "us-stats";

export const CONFIG_PATH = getEnv("USSTATS_CONFIG")
  ? expandHome(getEnv("USSTATS_CONFIG")!)
  : join(skillDataDir(SKILL_NAME, false), "config.md");

export function parseConfig(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.+?)\s*$/);
    if (m && !(m[1] in out)) out[m[1]] = m[2];
  }
  return out;
}

export function readConfig(path: string = CONFIG_PATH): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseConfig(readFileSync(path, "utf8"));
}

/** Optional key: returns the configured value or the given fallback. */
export function configValue(key: string, fallback: string): string {
  return readConfig()[key] ?? fallback;
}

/** The almanac endpoint. Env USSTATS_DATA_URL wins; otherwise config `data_url`. Fails loud when neither is set. */
export function dataUrl(): string {
  const env = getEnv("USSTATS_DATA_URL");
  if (env) return env;
  const v = readConfig().data_url;
  if (!v) {
    throw new Error(
      `us-stats: no almanac endpoint configured. Set key \`data_url\` in ${CONFIG_PATH} ` +
        `(or export USSTATS_DATA_URL). See Setup.md in the us-stats skill.`,
    );
  }
  return v;
}

/**
 * The US-Common-Metrics dataset folder. Env USMETRICS_DATA_DIR wins; then config `data_dir`;
 * otherwise $AGENT_SKILLS_HOME/us-stats/US-Common-Metrics. Not created here.
 */
export function metricsDataDir(): string {
  const env = getEnv("USMETRICS_DATA_DIR");
  if (env) return expandHome(env);
  const v = readConfig().data_dir;
  if (v) return expandHome(v);
  return join(skillDataDir(SKILL_NAME, false), "US-Common-Metrics");
}

/** Owner-only cache folder for the almanac download: $AGENT_SKILLS_HOME/us-stats/cache. */
export function usStatsCacheDir(): string {
  return join(skillDataDir(SKILL_NAME, false), "cache");
}
