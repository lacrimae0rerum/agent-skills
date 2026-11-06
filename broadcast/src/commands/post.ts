/**
 * Broadcast - Post Command
 *
 * Handles posting content with optional media to multiple platforms
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { getEnv, skillDataDir } from '../../Tools/_portable/paths.ts';
import { loadCredentials } from '../config';
import { TwitterAdapter } from '../adapters/twitter';
import { BlueskyAdapter } from '../adapters/bluesky';
import { LinkedInAdapter, splitShareUrl } from '../adapters/linkedin';
import { formatForLinkedIn, linkedInStylingProblem, truncateCodePoints, escapeLittleText } from '../format/linkedin-formatter';
import { InstagramAdapter } from '../adapters/instagram';
import { loadMediaFiles, validateMediaArrayForPlatform, formatMediaInfo } from '../utils/media';
import type { Platform, PostResult, BroadcastResult, PostOptions, MediaAttachment, Credentials } from '../types';
import type { BaseAdapter } from '../adapters/base';
import { assertSendable, notConfirmedMessage } from '../lib/send-check';
import { PLATFORM_LIMITS } from '../types';
import { assertValidTweetText, getTweetWeightedLength } from '../lib/twitter-text';

// Log directory — runtime state lives in the skill's data folder ($AGENT_SKILLS_HOME/broadcast/logs), not inside
// the skill dir. BROADCAST_LOG_DIR overrides it.
const logsDir = (): string => getEnv('BROADCAST_LOG_DIR') ?? join(skillDataDir('broadcast', false), 'logs');

// Available adapters
const ADAPTERS = {
  twitter: TwitterAdapter,
  bluesky: BlueskyAdapter,
  linkedin: LinkedInAdapter,
  instagram: InstagramAdapter,
} as const;

type AvailablePlatform = keyof typeof ADAPTERS;

/** Test seams for executePost: injected adapters (no network) and credentials. */
export interface PostDeps {
  adapters?: Partial<Record<AvailablePlatform, (credentials: Credentials) => BaseAdapter>>;
  credentials?: Credentials;
}

/**
 * The text a platform's adapter puts on the wire for `content`, so the send check reads the bytes the platform receives.
 * Mirrors each adapter's own shaping: LinkedIn is markdown styling, little-text escape, code-point truncation; Bluesky and
 * Instagram truncate with an ellipsis; X validates and passes the text through. LinkedIn promotes the share URL to a link
 * card when no media is attached and strips it from the commentary before shaping, so the check strips it the same way
 * (splitShareUrl) and the cap applies to the same text. A URL-only post sends the card title, which is fetched at send
 * time; the check then reads the URL itself.
 */
export function platformText(platform: AvailablePlatform, content: string, hasMedia = false): string {
  switch (platform) {
    case 'linkedin': {
      const { shareUrl, commentaryRaw } = splitShareUrl(content, hasMedia);
      return truncateCodePoints(escapeLittleText(formatForLinkedIn(commentaryRaw || shareUrl || '')), PLATFORM_LIMITS.linkedin);
    }
    case 'twitter': return assertValidTweetText(content);
    default: {
      const max = PLATFORM_LIMITS[platform];
      return content.length <= max ? content : content.slice(0, max - 3) + '...';
    }
  }
}

/**
 * Log a post result to the daily log file
 */
function logPost(result: PostResult, content: string, media?: MediaAttachment[]): void {
  try {
    const LOGS_DIR = logsDir();
    if (!existsSync(LOGS_DIR)) {
      mkdirSync(LOGS_DIR, { recursive: true });
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const logFile = join(LOGS_DIR, `Broadcast-${dateStr}.jsonl`);

    const logEntry = {
      timestamp: now.toISOString(),
      platform: result.platform,
      status: result.success ? 'success' : 'failure',
      url: result.postUrl || null,
      error: result.error || null,
      content: content,
      media: media?.map(m => ({
        type: m.type,
        file: basename(m.filePath),
        size: m.size,
      })) || null,
    };

    appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    // Silent fail - logging shouldn't break posting
    console.error('Failed to log post:', err);
  }
}

/**
 * Load content from file or use provided text
 */
function loadContent(options: PostOptions): string {
  if (options.file) {
    if (!existsSync(options.file)) {
      throw new Error(`File not found: ${options.file}`);
    }
    return readFileSync(options.file, 'utf-8').trim();
  }

  if (options.content) {
    return options.content;
  }

  throw new Error('No content provided. Use --content or --file');
}

/**
 * Format platform-specific preview
 */
export function formatPreview(
  platform: Platform,
  content: string,
  media?: MediaAttachment[],
  // false for a commentary edit: editCommentary sends the whole text and never promotes a URL to a card.
  opts: { linkedinShareCard?: boolean } = {},
): string {
  const limit = PLATFORM_LIMITS[platform];
  const isTwitter = platform === 'twitter';
  let displayContent: string;
  let charCount: number;
  let cardLine = '';
  if (platform === 'linkedin') {
    // LinkedIn previews the adapter's own pipeline: the share URL leaves the commentary when it becomes a link card,
    // markdown becomes Unicode styling (bold hook, • bullets), reserved characters are escaped, and the cap is applied to
    // that escaped wire text by code point. The count is the wire text's; the text shown drops the escaping backslashes,
    // which readers never see, so the operator approves exactly the words that land.
    const { shareUrl, commentaryRaw } = opts.linkedinShareCard === false
      ? { shareUrl: null, commentaryRaw: content }
      : splitShareUrl(content, !!media?.length);
    const wire = truncateCodePoints(escapeLittleText(formatForLinkedIn(commentaryRaw)), limit);
    displayContent = commentaryRaw ? unescapeLittleText(wire) : '(no commentary: LinkedIn shows the link card title, fetched from the page at send time)';
    charCount = Array.from(wire).length;
    if (shareUrl) cardLine = `\n│ 🔗 Link card: ${shareUrl} (title, description and image are fetched from the page at send time)`;
  } else {
    // Bluesky and Instagram truncate by UTF-16 unit via BaseAdapter.truncate; X is validated, never truncated.
    displayContent = isTwitter
      ? assertValidTweetText(content)
      : content.length > limit ? content.slice(0, limit - 3) + '...' : content;
    charCount = isTwitter ? getTweetWeightedLength(content) : Array.from(displayContent).length;
  }
  const countLabel = isTwitter ? 'weighted chars' : 'chars';
  const previewContent = isTwitter ? displayContent : displayContent.split('\n').join('\n│ ');

  let mediaLine = '';
  if (media?.length) {
    mediaLine = `\n│ 📎 Media: ${formatMediaInfo(media)}`;
  }

  return `
┌─ ${platform.toUpperCase()} (${charCount}/${limit} ${countLabel})
│ ${previewContent}${cardLine}${mediaLine}
└─`;
}

/** Reader view of escapeLittleText output: LinkedIn renders `\#` as `#`, so the preview drops the escaping backslash. */
function unescapeLittleText(text: string): string {
  return text.replace(/\\([\\|{}@[\]()<>#*_~])/g, (_m, c: string) => c);
}

/**
 * Execute post command
 */
export async function executePost(options: PostOptions, deps: PostDeps = {}): Promise<BroadcastResult> {
  const content = loadContent(options);
  const credentials = deps.credentials ?? loadCredentials();
  const makeAdapter = (platform: AvailablePlatform): BaseAdapter => {
    const inject = deps.adapters?.[platform];
    return inject ? inject(credentials) : new ADAPTERS[platform](credentials);
  };

  // Load media files if provided
  let media: MediaAttachment[] | undefined;
  if (options.media?.length) {
    try {
      media = await loadMediaFiles(options.media);
      console.log(`📎 Loaded ${media.length} media file(s): ${formatMediaInfo(media)}`);
    } catch (error: any) {
      console.error(`❌ Error loading media: ${error.message}`);
      return { results: [], successCount: 0, failureCount: 1 };
    }
    // Media is not scanned for private content: the confirmation step asks the user to confirm every image and video.
  }

  const platforms = options.platforms.filter(p => p in ADAPTERS) as AvailablePlatform[];

  if (platforms.length === 0) {
    console.error('No supported platforms specified');
    return { results: [], successCount: 0, failureCount: 0 };
  }

  // LinkedIn styling gate — refuse the whole run so nothing half-posts.
  if (platforms.includes('linkedin') && !options.linkedinPlain) {
    const problem = linkedInStylingProblem(content);
    if (problem) {
      console.error(`❌ ${problem}`);
      return { results: [], successCount: 0, failureCount: 1 };
    }
  }

  // Validate media for each platform. A platform whose media fails is reported as failed and skipped; the others still
  // post (Intents/Post.md: when a platform fails, the other platforms still post).
  const results: PostResult[] = [];
  let postable = platforms;
  if (media?.length) {
    postable = [];
    for (const platform of platforms) {
      try {
        validateMediaArrayForPlatform(media, platform);
        postable.push(platform);
      } catch (error: any) {
        console.error(`❌ Media validation failed for ${platform}: ${error.message}`);
        results.push({ platform, success: false, error: `Media validation failed: ${error.message}` });
      }
    }
    if (postable.length === 0) return { results, successCount: 0, failureCount: results.length };
  }

  // Dry run, or no confirmation yet - just show previews. A live post needs --yes, which the agent passes only after
  // the user confirmed these exact previews (text, media, platforms and accounts).
  if (options.dryRun || !options.confirmed) {
    console.log(options.dryRun ? '\n🔍 DRY RUN - Preview only, not posting\n' : '\n🔍 PREVIEW - not posting until confirmed\n');

    for (const platform of postable) {
      const adapter = makeAdapter(platform);

      // An unconfigured platform still gets its preview, so the formatting can be checked before any
      // credentials exist; the note says a live post would skip it.
      if (!adapter.isConfigured()) {
        console.log(`⚠️  ${platform.toUpperCase()}: Not configured (preview only; a live post skips it)`);
      }

      console.log(formatPreview(platform, content, media));
      try {
        assertSendable(platform, platformText(platform, content, !!media?.length));
      } catch (error: any) {
        console.log(`⛔ ${error.message}`);
      }
    }

    if (options.dryRun) {
      console.log('\n✅ Dry run complete. To post, show the user these previews and, once they confirm, run again with --yes instead of --dry-run.\n');
      return { results: [], successCount: 0, failureCount: results.length };
    }
    console.error(`\n${notConfirmedMessage(`posting to ${postable.join(', ')}`)}\n`);
    return { results, successCount: 0, failureCount: results.length + 1, notConfirmed: true };
  }

  // Actual posting
  console.log('\n📤 Broadcasting to', postable.join(', '), '...\n');

  for (const platform of postable) {
    const adapter = makeAdapter(platform);

    if (!adapter.isConfigured()) {
      results.push({
        platform,
        success: false,
        error: 'Not configured',
      });
      console.log(`❌ ${platform.toUpperCase()}: Not configured`);
      continue;
    }

    // Send check: the exact text this platform receives is checked (no secret, private key or home-directory path)
    // inside this tool, immediately before the adapter's network calls. A block closes the platform; nothing is sent.
    let sentText: string;
    try {
      sentText = platformText(platform, content, !!media?.length);
    } catch (error: any) {
      const failed: PostResult = { platform, success: false, error: error?.message || 'Invalid post text' };
      results.push(failed);
      console.log(`❌ ${platform.toUpperCase()}: ${failed.error}`);
      continue;
    }
    try {
      assertSendable(platform, sentText);
    } catch (error: any) {
      const blocked: PostResult = { platform, success: false, error: 'Send blocked' };
      results.push(blocked);
      console.error(error.message);
      console.log(`❌ ${platform.toUpperCase()}: ${blocked.error}`);
      continue;
    }

    console.log(`📝 Posting to ${platform}...`);
    const result = await adapter.post(content, media);
    results.push(result);

    // Log the result
    logPost(result, content, media);

    if (result.success) {
      console.log(`✅ ${platform.toUpperCase()}: ${result.postUrl}`);
    } else {
      console.log(`❌ ${platform.toUpperCase()}: ${result.error}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  console.log(`\n📊 Results: ${successCount} succeeded, ${failureCount} failed\n`);

  return { results, successCount, failureCount };
}
