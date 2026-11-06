/**
 * Broadcast - Twitter/X Adapter
 *
 * Delegates ALL posting — text and media — to the x-twitter skill's Tools/post.ts
 * (located through X_TWITTER_SKILL_DIR, src/lib/x-skill.ts), which runs on OAuth 2.0
 * user context from that skill's configured token store (`tweet.write` +
 * `media.write`; its Setup.md). With no store configured, post.ts falls back to the
 * OAuth 1.0a env keys for text only; media always needs the OAuth 2.0 grant.
 *
 * One auth path for text and media means one failure mode: X can revoke OAuth 1.0a
 * keys without notice, and a split path posts text while media silently fails.
 *
 * post() is reached only after Broadcast's own confirmation step (the user confirmed
 * the exact preview; `broadcast post --yes`), so it passes --yes to post.ts.
 */

import { existsSync } from 'fs';
import { BaseAdapter } from './base';
import type { Platform, PostResult, MediaAttachment } from '../types';
import { assertValidTweetText } from '../lib/twitter-text';
import { runXTool, xSkillDir, xSkillHint } from '../lib/x-skill';

export function createTwitterPostSpec(content: string, media?: MediaAttachment[]) {
  const text = assertValidTweetText(content);
  return [{ text, ...(media?.length ? { media: media.map((m) => m.filePath) } : {}) }];
}

export class TwitterAdapter extends BaseAdapter {
  readonly name: Platform = 'twitter';
  readonly maxLength = 280;

  isConfigured(): boolean {
    return xSkillDir() !== null;
  }

  async verifyCredentials(): Promise<boolean> {
    return !!(await this.getMe());
  }

  async post(content: string, media?: MediaAttachment[]): Promise<PostResult> {
    if (!this.isConfigured()) {
      return this.failure(`Twitter not configured: ${xSkillHint()}`);
    }

    let spec: ReturnType<typeof createTwitterPostSpec>;
    try {
      spec = createTwitterPostSpec(content, media);
    } catch (error: any) {
      return this.failure(error?.message || 'Invalid Twitter text');
    }

    for (const file of spec[0].media ?? []) {
      if (!existsSync(file)) return this.failure(`Media file not found: ${file}`);
    }

    try {
      const run = await runXTool('post.ts', ['--yes'], JSON.stringify(spec));
      if (run.code !== 0) {
        return this.failure((run.stderr || run.stdout).trim() || 'Failed to post via the x-twitter skill');
      }

      const urlMatch = run.stdout.match(/https:\/\/x\.com\/\S+/);
      const idMatch = run.stdout.match(/status\/(\d+)/);
      if (!idMatch) return this.failure(`Post reported success but returned no tweet id:\n${run.stdout.trim()}`);
      return this.success(idMatch[1], urlMatch?.[0] ?? `https://x.com/i/status/${idMatch[1]}`, content);
    } catch (error: any) {
      return this.failure(error?.message || 'Unknown error posting to Twitter');
    }
  }

  /**
   * The account behind whichever auth path posting will use (`x-twitter Tools/profile.ts --me`):
   * the OAuth 2.0 store when one is configured, else the OAuth 1.0a fallback keys. Null when
   * neither verifies, so `status` reports X as configured but failing verification.
   */
  async getMe(): Promise<{ id: string; username: string; name: string } | null> {
    if (!this.isConfigured()) return null;
    try {
      const run = await runXTool('profile.ts', ['--me']);
      if (run.code !== 0) return null;
      const data = JSON.parse(run.stdout.trim().split('\n').pop() ?? '');
      if (typeof data?.id !== 'string' || typeof data?.username !== 'string') return null;
      return { id: data.id, username: data.username, name: typeof data.name === 'string' ? data.name : data.username };
    } catch {
      return null;
    }
  }
}
