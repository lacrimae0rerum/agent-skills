/**
 * AgentComment — every GitHub comment the agent posts on the user's behalf says so. Comments go out from the
 * user's own account, so without this a reader cannot tell the agent's words from the user's.
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt)
 * Names come from config, never hardcoded.
 *
 *   > [!NOTE]
 *   > 🤖 **<agent> (AI assistant) responding on behalf of <maintainer>**
 *
 * Names, first match wins:
 *   agent:      OSM_AGENT_NAME env var · `AGENT_NAME:` in Config.md · "An AI assistant" (header then reads
 *               "🤖 **An AI assistant responding on behalf of ...**")
 *   maintainer: OSM_MAINTAINER_NAME env var · `MAINTAINER_NAME:` in Config.md · `OSS_OWNER:` · "the maintainer"
 */

import { getEnv } from "../_portable/paths.ts";
import { configValue, readConfig } from "./Config.ts";

/** The glyph every header carries; `attribute()` uses it to spot a body that is already attributed. */
export const AGENT_MARK = "🤖";

const DEFAULT_AGENT = "An AI assistant";

export function agentName(configText = readConfig()): string {
  return getEnv("OSM_AGENT_NAME") ?? configValue(configText, "AGENT_NAME") ?? DEFAULT_AGENT;
}

export function maintainerName(configText = readConfig()): string {
  return getEnv("OSM_MAINTAINER_NAME") ?? configValue(configText, "MAINTAINER_NAME") ?? configValue(configText, "OSS_OWNER") ?? "the maintainer";
}

export function attributionHeader(agent = agentName(), maintainer = maintainerName()): string {
  const who = agent === DEFAULT_AGENT ? agent : `${agent} (AI assistant)`;
  return `> [!NOTE]\n> ${AGENT_MARK} **${who} responding on behalf of ${maintainer}**`;
}

/** The body with the header in front, unless it already opens with one. Pure apart from the name lookup. */
export function attribute(body: string, header = attributionHeader()): string {
  const trimmed = body.replace(/^\s+/, "");
  if (trimmed.startsWith("> [!NOTE]") && trimmed.split("\n").slice(0, 2).join("\n").includes(AGENT_MARK)) return body;
  return `${header}\n\n${trimmed}`;
}
