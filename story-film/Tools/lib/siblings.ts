/**
 * siblings: find another installed skill by folder name, for optional cross-skill tool calls.
 *
 * Skills are installed side by side (one folder each). $AGENT_SKILLS_DIR names that folder when the
 * skill runs from somewhere else. A sibling that is not installed reads as undefined, never an error:
 * the caller decides whether the step is optional.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expandHome, getEnv, skillRoot } from "../_portable/paths.ts";

/** The folder that holds the installed skills: $AGENT_SKILLS_DIR, else the parent of the calling skill. */
export function skillsDir(metaUrl: string): string {
  const env = getEnv("AGENT_SKILLS_DIR");
  return env ? resolve(expandHome(env)) : dirname(skillRoot(metaUrl));
}

/** A file inside a sibling skill (e.g. "art", "Tools/Generate.ts"), or undefined when it is not installed. */
export function siblingSkillFile(metaUrl: string, skill: string, rel: string): string | undefined {
  const p = join(skillsDir(metaUrl), skill, rel);
  return existsSync(p) ? p : undefined;
}
