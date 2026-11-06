/**
 * Config — where this skill's per-user settings live, and the small readers every tool shares.
 *
 *   $AGENT_SKILLS_HOME/open-source-management/Config.md   (default ~/.agent-skills/open-source-management/)
 *
 * `KEY: value` lines (OSS_OWNER, OSS_REPOS, OSS_PRIORITY, AGENT_NAME, MAINTAINER_NAME), prose sections
 * (## Source of truth, ## Out of scope) and one `## Local Model Host` table. Setup.md documents the format.
 * The public deny list for PublicReady sits beside it as deny-list.txt.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { skillDataDir } from "../_portable/paths.ts";

export const SKILL = "open-source-management";

/** The skill's data folder; not created on read, so a missing setup stays visible. */
export function dataDir(): string {
  return skillDataDir(SKILL, false);
}

export function configPath(): string {
  return join(dataDir(), "Config.md");
}

export function denyListPath(): string {
  return join(dataDir(), "deny-list.txt");
}

/** Config.md text, or "" when the file is missing. */
export function readConfig(path = configPath()): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** The value of a `KEY: value` line, trimmed; null when absent or empty. */
export function configValue(configText: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = configText.match(new RegExp(`^${esc}:[ \\t]*(.*?)[ \\t]*$`, "m"));
  return m && m[1] ? m[1] : null;
}
