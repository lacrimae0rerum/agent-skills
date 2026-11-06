/**
 * Broadcast - Configuration Loading
 *
 * Loads credentials from:
 * 1. environment variables (optionally from $AGENT_SKILLS_HOME/.env): the X OAuth 1.0a
 *    fallback keys, for reference only. X posting itself runs through the x-twitter skill
 *    (src/lib/x-skill.ts), which owns the X credentials and its OAuth 2.0 token store.
 * 2. $AGENT_SKILLS_HOME/broadcast/credentials.json (LinkedIn, Bluesky, Instagram)
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { Credentials, TwitterCredentials, BlueskyCredentials, LinkedInCredentials, InstagramCredentials } from './types';
import { getEnv, skillDataDir } from '../Tools/_portable/paths.ts';
import { join } from 'path';
import { xSkillDir } from './lib/x-skill';

/** LinkedIn, Bluesky and Instagram sessions: $AGENT_SKILLS_HOME/broadcast/credentials.json (default ~/.agent-skills). */
export const BROADCAST_CREDS_PATH = join(skillDataDir('broadcast', false), 'credentials.json');

/**
 * Load the X OAuth 1.0a fallback keys from the environment
 */
function loadTwitterCredentials(): TwitterCredentials | undefined {
  try {
    const apiKey = getEnv('TWITTER_API_KEY');
    const apiKeySecret = getEnv('TWITTER_API_KEY_SECRET');
    const accessToken = getEnv('X_ACCESS_TOKEN');
    const accessTokenSecret = getEnv('X_ACCESS_TOKEN_SECRET');
    const bearerToken = getEnv('X_BEARER_TOKEN');

    if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
      return undefined;
    }

    return {
      apiKey,
      apiKeySecret,
      accessToken,
      accessTokenSecret,
      bearerToken,
    };
  } catch {
    return undefined;
  }
}

/**
 * Load other platform credentials from $AGENT_SKILLS_HOME/broadcast/credentials.json
 */
function loadBroadcastCredentials(): Partial<Credentials> {
  if (!existsSync(BROADCAST_CREDS_PATH)) {
    return {};
  }

  try {
    const content = readFileSync(BROADCAST_CREDS_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save credentials to $AGENT_SKILLS_HOME/broadcast/credentials.json (mode 0600)
 */
export function saveCredentials(creds: Partial<Credentials>): void {
  const dir = dirname(BROADCAST_CREDS_PATH);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Load existing and merge
  const existing = loadBroadcastCredentials();
  const merged = { ...existing, ...creds };

  writeFileSync(BROADCAST_CREDS_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });
}

/**
 * Load all credentials from all sources
 */
export function loadCredentials(): Credentials {
  const twitter = loadTwitterCredentials();
  const broadcast = loadBroadcastCredentials();

  return {
    twitter,
    linkedin: broadcast.linkedin as LinkedInCredentials | undefined,
    bluesky: broadcast.bluesky as BlueskyCredentials | undefined,
    instagram: broadcast.instagram as InstagramCredentials | undefined,
  };
}

/**
 * X posting runs through the x-twitter skill. Where its token store lives (a local file,
 * or a Cloudflare KV namespace another process refreshes) is that skill's own Config.md;
 * Broadcast only asks whether the skill is reachable (X_TWITTER_SKILL_DIR).
 */
export function hasXSkill(): boolean {
  return xSkillDir() !== null;
}

/** True when the OAuth 1.0a text-only fallback keys are all present. */
export function hasXOAuth1Keys(creds: Credentials): boolean {
  const t = creds.twitter;
  return !!(t?.apiKey && t?.apiKeySecret && t?.accessToken && t?.accessTokenSecret);
}

export function isPlatformConfigured(platform: string, creds: Credentials): boolean {
  switch (platform) {
    case 'twitter':
      return hasXSkill();
    case 'linkedin':
      return !!creds.linkedin?.accessToken;
    case 'bluesky':
      return !!creds.bluesky?.identifier && !!creds.bluesky?.password;
    case 'instagram':
      return !!creds.instagram?.accessToken && !!creds.instagram?.igUserId;
    default:
      return false;
  }
}
