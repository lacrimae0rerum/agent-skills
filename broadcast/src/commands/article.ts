/**
 * Broadcast — X Article + intro post.
 *
 * Publishes a markdown file as an X Article, then posts the intro text with a
 * video attached and the article linked. The article primitive lives in the
 * x-twitter skill's `Tools/article.ts`; this command only composes it with the
 * intro post, the same way the twitter adapter composes its `Tools/post.ts`
 * (both reached through X_TWITTER_SKILL_DIR, src/lib/x-skill.ts).
 *
 * Ordering is load-bearing: the intro text is weight-validated BEFORE the
 * article is published. The other order can leave a published article on the
 * timeline with no post pointing at it, and articles have no delete endpoint.
 *
 * Publishing needs `confirmed` (`broadcast article --publish --yes`): the agent
 * passes it only after the user confirmed the dry-run preview of both legs.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { assertValidTweetText } from '../lib/twitter-text';
import { runXTool } from '../lib/x-skill';
import { notConfirmedMessage } from '../lib/send-check';

/** What x-twitter's `article.ts create --json` returns. */
export interface BuildResult {
  articleId: string;
  title: string;
  blocks: number;
  entities: number;
  published: boolean;
  postId?: string;
  url?: string;
}

export interface BuildOptions { file: string; title?: string; cover?: string; publish?: boolean; log?: (msg: string) => void }

/** Drafts (and with `publish`, publishes) the article through x-twitter's article.ts. */
export async function buildArticle(o: BuildOptions): Promise<BuildResult> {
  const args = ['create', '--file', resolve(o.file), '--json'];
  if (o.title) args.push('--title', o.title);
  if (o.cover) args.push('--cover', resolve(o.cover));
  if (o.publish) args.push('--publish', '--yes');
  const run = await runXTool('article.ts', args);
  if (run.code !== 0) throw new Error((run.stderr || run.stdout).trim() || 'x-twitter article.ts failed');
  const last = run.stdout.trim().split('\n').pop() ?? '';
  try {
    return JSON.parse(last) as BuildResult;
  } catch {
    throw new Error(`x-twitter article.ts returned no result:\n${run.stdout.trim()}`);
  }
}

/** Posts one tweet through x-twitter's post.ts (already confirmed by the user). */
export async function postTweet(spec: { text: string; media?: string[] }, opts: { replyToId?: string } = {}): Promise<{ id: string; text: string }> {
  const args = ['--yes', ...(opts.replyToId ? ['--reply-to', opts.replyToId] : [])];
  const body = [{ text: spec.text, ...(spec.media?.length ? { media: spec.media.map((m) => resolve(m)) } : {}) }];
  const run = await runXTool('post.ts', args, JSON.stringify(body));
  if (run.code !== 0) throw new Error((run.stderr || run.stdout).trim() || 'x-twitter post.ts failed');
  const id = run.stdout.match(/status\/(\d+)/)?.[1];
  if (!id) throw new Error(`post reported success but returned no tweet id:\n${run.stdout.trim()}`);
  return { id, text: spec.text };
}

// Every http(s) URL weighs 23 characters on X regardless of its real length,
// so a placeholder validates the final text exactly.
const URL_PLACEHOLDER = 'https://x.com/i/status/0000000000000000000';

export interface ArticleOptions {
  file: string;
  title?: string;
  cover?: string;
  intro: string;
  video?: string;
  /**
   * Canonical source URL. Posted as a bare-URL REPLY to the article so X
   * unfurls it into a link card with a thumbnail. A markdown link inside the
   * article body renders as plain underlined text and gets no card, which is
   * why this is a reply and not a line in the body.
   */
  canonical?: string;
  publish?: boolean;
  dryRun?: boolean;
  /** The user confirmed the exact preview of both legs (`--yes`); required to publish. */
  confirmed?: boolean;
}

export interface ArticleDeps {
  build: typeof buildArticle;
  post: typeof postTweet;
  log?: (msg: string) => void;
}

export interface ArticleResult {
  article: BuildResult | null;
  postId?: string;
  postUrl?: string;
  canonicalReplyId?: string;
  dryRun: boolean;
}

/** Intro text plus the article link, exactly as it will be posted. */
export function composeIntro(intro: string, url: string): string {
  const body = intro.trim();
  return body.length ? `${body}\n\n${url}` : url;
}

/**
 * Throws if the intro cannot fit alongside the article link. Runs before any
 * publish so a too-long intro costs nothing.
 */
export function assertIntroFits(intro: string): void {
  assertValidTweetText(composeIntro(intro, URL_PLACEHOLDER));
}

export async function executeArticle(
  options: ArticleOptions,
  deps: ArticleDeps = { build: buildArticle, post: postTweet },
): Promise<ArticleResult> {
  const log = deps.log ?? ((m: string) => console.log(m));

  if (!options.file) throw new Error('--file is required (the article markdown)');
  if (options.video && !existsSync(options.video)) {
    throw new Error(`video not found: ${options.video}`);
  }

  // 1. Validate the intro first — cheapest failure, and the only one that is
  //    still reversible once the article is public.
  assertIntroFits(options.intro);

  // Publishing is the irreversible leg: without the user's confirmation, show the preview and stop.
  const unconfirmedPublish = !!options.publish && !options.confirmed;
  if (options.dryRun || unconfirmedPublish) {
    log(options.dryRun ? '\n🧪 Dry run — nothing sent\n' : '\n🔍 Preview — nothing sent until confirmed\n');
    log(`  article file : ${options.file}`);
    if (options.title) log(`  title        : ${options.title}`);
    if (options.cover) log(`  cover        : ${options.cover}`);
    log(`  publish      : ${options.publish ? 'yes' : 'no (draft only)'}`);
    log('\n  intro post:');
    log(`  ${composeIntro(options.intro, URL_PLACEHOLDER).split('\n').join('\n  ')}`);
    if (options.video) log(`\n  video        : ${options.video}`);
    if (options.canonical) log(`\n  reply to article: ${options.canonical}`);
    if (unconfirmedPublish && !options.dryRun) {
      throw new Error(notConfirmedMessage('publishing this article and its intro post'));
    }
    return { article: null, dryRun: true };
  }

  // 2. Build (and optionally publish) the article.
  const article = await deps.build({
    file: options.file,
    title: options.title,
    cover: options.cover,
    publish: options.publish,
    log: (m) => log(`  ${m}`),
  });

  if (!article.published || !article.url) {
    log(`\n📝 Draft only: ${article.title}`);
    log(`  article id: ${article.articleId}`);
    log('  no intro post — an unpublished draft has no link to point at.');
    log('  rerun with --publish to publish it and post the intro.');
    return { article, dryRun: false };
  }

  // 3. Post the intro with the video and the article link.
  const text = composeIntro(options.intro, article.url);
  const posted = await deps.post({ text, media: options.video ? [options.video] : undefined });

  log(`\n✅ Article: ${article.url}`);
  log(`✅ Intro post: https://x.com/i/status/${posted.id}`);

  // 4. Reply to the article with the canonical URL alone, so X unfurls a card.
  //    A failure here costs a link card, never the article or the intro — both
  //    are already public, so this never throws upward.
  let canonicalReplyId: string | undefined;
  if (options.canonical && article.postId) {
    try {
      const reply = await deps.post({ text: options.canonical }, { replyToId: article.postId });
      canonicalReplyId = reply.id;
      log(`✅ Canonical reply: https://x.com/i/status/${reply.id}`);
    } catch (error: any) {
      log(`⚠️  Canonical reply failed (article and intro are live): ${error?.message}`);
    }
  }

  return {
    article,
    postId: posted.id,
    postUrl: `https://x.com/i/status/${posted.id}`,
    canonicalReplyId,
    dryRun: false,
  };
}
