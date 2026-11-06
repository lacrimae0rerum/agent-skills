---
name: broadcast
description: "Multi-platform social syndication CLI: post text and media to X, LinkedIn, Bluesky and Instagram from one command, with per-platform limits, a --dry-run preview the user confirms before anything posts, and status checks; also X Articles, podcast episodes to Omny Studio, LinkedIn edits and comments, newsletter share posts. Use when broadcast, post to social media, cross-post, post to all, syndicate, publish to all platforms, post to LinkedIn, post to Bluesky, post to Instagram, check platform status, post this everywhere, share the newsletter, edition share card, sponsor thank-you in the share, publish podcast episode. Not for writing the copy itself (use `writing`), X-only operations such as search, bookmarks or deletes (use `x-twitter`), or Substack."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ and `bun install` in the skill folder. X needs the x-twitter skill (X_TWITTER_SKILL_DIR). Env per platform used: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET; INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI, CLOUDFLARE_ACCOUNT_ID, BROADCAST_R2_BUCKET, BROADCAST_R2_PUBLIC_BASE, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY; OMNYSTUDIO_API_KEY; optional BEEHIIV_API_KEY, BEEHIIV_PUB_ID, BROADCAST_LOG_DIR. ffprobe for video checks; sips (macOS) or ffmpeg for Instagram JPEG."
---

# Broadcast Skill

**Contents:** Ideal State · Intent Routing · Platforms · Data & Config · Setup · Gotchas · Examples

Posts to X/Twitter, LinkedIn, Bluesky and Instagram from one command, and also publishes X Articles, podcast episodes to Omny Studio and newsletter share posts. It checks each platform's character and media limits before sending, previews with `--dry-run`, and reports per-platform status. Auth is per platform (table under Platforms; first-time setup in `Setup.md`, day-two auth in `Intents/Auth.md`). X posting runs through the `x-twitter` skill's tools and its OAuth 2.0 token store (optional: without that skill, X is reported as not configured and the other platforms still post). This skill posts; it does not write the copy, which comes from the `writing` skill (if installed) or the user first.

Run every command from this skill's folder (`src/index.ts`, `Tools/...` are relative to it). `$X_TWITTER_SKILL_DIR` in commands is the folder of the installed `x-twitter` skill.

## Ideal State

- A broadcast reaches every platform the user named, and "all channels", "everywhere", "all three" or "all four" means all four; a platform that fails or is skipped is reported with its reason while the rest still post.
- Each platform gets text that fits its own limit and format before anything is sent: X text is weighed and never sliced, and styled LinkedIn text goes in a run of its own.
- When the user hands over written prose, their words go out verbatim with only platform markup added; drafting new copy belongs to a copywriting skill (`writing`, if installed).
- A cross-post of the user's latest X post ("put my latest tweet on LinkedIn and Insta") carries that post's exact text and media, read back from X with the x-twitter skill's `$X_TWITTER_SKILL_DIR/Tools/read.ts`, with t.co links expanded to their real URLs and nothing added beyond LinkedIn styling.
- Nothing public goes out unconfirmed: a `--dry-run` comes first, its exact previews (each platform's text, the media, the account from `status`) are shown to the user, and every post, edit, comment, Article publish and podcast publish runs with `--yes` only after the user's explicit yes to that exact content. Success is reported from what the platform returned (post links, X `expanded_url` matching the canonical URL, a verified Omny publish).

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **X** | "post to X", "tweet", "post to Twitter" | `Intents/X.md` |
| **Article** | "post an article to X", "publish as an X article", "long-form on X", "intro post plus article link" | `Intents/Article.md` |
| **LinkedIn** | "post to LinkedIn", "LinkedIn post" | `Intents/LinkedIn.md` |
| **Bluesky** | "post to Bluesky", "Bluesky post" | `Intents/Bluesky.md` |
| **Instagram** | "post to Instagram", "Instagram post", "reel", "carousel" | `Intents/Instagram.md` |
| **Podcast** | "post as podcast", "publish podcast episode", "put this on the podcast", "Omny" | `Intents/Podcast.md` |
| **ShareNewsletter** | "share the newsletter", "newsletter share post", "post the newsletter to LinkedIn", "share this week's edition", "edition share card", "sponsor thank-you in the share" | `Intents/ShareNewsletter.md` |
| **Post** | "broadcast", "post to all", "cross-post" | `Intents/Post.md` |
| **Status** | "check status", "platform status" | `Intents/Status.md` |
| **Auth** | "configure", "auth", "setup platform" | `Intents/Auth.md` |
| **SecurityValidation** | "validate content", "check post" | `Intents/SecurityValidation.md` |

| File | Read when |
|------|-----------|
| `Setup.md` | first-time setup: the Config.md fields, each platform's account and secrets, the scheduled token renewal, and the proof it works |
| `Tools/` | running a platform tool directly; `Tools/LinkedInAuth.help.md` is the full `LinkedInAuth.ts` contract (the tool itself prints a one-line usage) |

## Platforms

| Platform | Auth | Images | Videos | Media limits | Text limit |
|----------|------|--------|--------|--------------|------------|
| Twitter/X | OAuth 2.0 user context (the x-twitter skill's token store); OAuth 1.0a keys for text only | Up to 4 | 1 per post | Images: 5MB, Videos: 512MB | 280 weighted characters (URLs = 23) |
| LinkedIn | OAuth 2.0 access token | Up to 20 (multiImage) | 1 per post | Images: 8MB, Videos: 500MB | 3,000 |
| Bluesky | App password | Up to 4 | 1 per post | Images: 1MB, Videos: 50MB | 300 |
| Instagram | Instagram Login (60-day token) | Up to 10 (carousel) | 1 (Reel) | Images: 8MB JPEG, Videos: 300MB | 2,200 |
| Podcast (Omny Studio) | OMNYSTUDIO_API_KEY | | | | |
| X Articles (long-form) | Same X OAuth 2.0 store (x-twitter skill) | | | | |

**Supported formats:**
- Images: JPG, JPEG, PNG, GIF, WebP (Instagram auto-converts to JPEG)
- Videos: MP4, MOV, AVI, WebM

`--media` takes local file paths only; a remote URL fails with "Media file not found". **Instagram is media-required** (no text-only posts) and JPEG-only for images; its R2 staging contract is in `Intents/Instagram.md`.

Post logs append to `$AGENT_SKILLS_HOME/broadcast/logs/Broadcast-YYYY-MM-DD.jsonl` (default `~/.agent-skills/broadcast/logs/`; `BROADCAST_LOG_DIR` overrides it), outside the skill dir. The CLI entry points are `bun src/index.ts` and its alias `Tools/Broadcast.ts`; each intent carries its own commands.

## Data & Config

The skill body carries no handles, program IDs or newsletter identity. Account-bound values live outside
the skill tree in `$AGENT_SKILLS_HOME/broadcast/Config.md` (default `~/.agent-skills/broadcast/`): the Omny
program, playlist ids and episode settings, which `Tools/OmnyPublish.ts` reads at runtime through
`src/skill-config.ts`; the newsletter name, URL, edition label, the optional share features (sponsor thank-yous, the edition
share card and its brand file, the card file prefix, the writing audit) and an optional house-rules overlay,
which the ShareNewsletter intent reads; the optional posting preferences `house_style` and `video_followup` (both off by default), which `post`, `edit` and the platform intents read; and the account handles for reference. Every key, with a made-up example, is in `Setup.md`. User preferences, when present, live in `$AGENT_SKILLS_HOME/broadcast/PREFERENCES.md` (default `~/.agent-skills/broadcast/`) and override the defaults here; when absent, the defaults stand. X's token store is configured
in the x-twitter skill's own Config.md (its Setup.md). Per-platform API keys are env-var names whose values
live in the environment or `$AGENT_SKILLS_HOME/.env`; LinkedIn, Bluesky and Instagram sessions live in `$AGENT_SKILLS_HOME/broadcast/credentials.json` (mode 0600).

## Setup

1. `bun install` in this skill's folder (commander, @atproto/api, aws4fetch, probe-image-size).
2. For X: install the `x-twitter` skill, set it up (its Setup.md), and set `X_TWITTER_SKILL_DIR` to its folder.
3. For each other platform you use, set its env vars (in the environment or `$AGENT_SKILLS_HOME/.env`) and run its auth step: every account, key and first-run proof is in `Setup.md`; day-two auth is `Intents/Auth.md`.
4. Optional: `Config.md` in `$AGENT_SKILLS_HOME/broadcast/` for Omny, newsletter shares and house style (`Setup.md` § Fill in).

## Gotchas

- **"All channels" includes Instagram, which needs media.** A post with no media still goes to the three text platforms and reports Instagram as skipped, so ship an image whenever one exists.
- **LinkedIn styling is converted from markdown, and required only under the house style.** `**bold**`, `# Header` and the rest become LinkedIn's styled text (the table in `Intents/LinkedIn.md`). With `house_style = true` in Config.md, every LinkedIn post (cross-posts, newsletter shares, edits) carries a `**bold**` hook line or `# Header` lines, the author's words stay verbatim with only the markup added, and `post` and `edit` refuse LinkedIn content with no bold span or header line (exit 1, dry-run included); `--linkedin-plain` is the named exception. With the key absent or `false` (the default), plain text posts as written. Either way, because `**` would show raw on X and Bluesky, LinkedIn gets its own run with its own styled file whenever styled text is shared with another platform.
- **X text is weighted, never raw-truncated.** Every HTTP(S) URL counts as 23 characters, while Unicode uses X's code-point/emoji weighting. `src/lib/twitter-text.ts` and the x-twitter skill's `$X_TWITTER_SKILL_DIR/Tools/TwitterText.ts` apply the same rules: Broadcast validates before it previews, and `post.ts` validates again before it posts. Preserve the caller's exact text and full canonical URLs; if weighted length exceeds 280, fail closed instead of slicing or adding an ellipsis. After publishing, read the returned tweet with the x-twitter skill's `$X_TWITTER_SKILL_DIR/Tools/read.ts` and confirm each `expanded_url` equals the intended canonical URL before reporting success.
- **`--yes` is the user's word, not a formality.** `post`, `edit`, `article --publish`, `Tools/LinkedInComment.ts` and `Tools/OmnyPublish.ts` refuse to send without it: they print the exact preview, `NOT SENT: ...`, and exit 2. Pass `--yes` only after the user confirmed that exact preview and the target accounts; any change to text, media or platforms means a new preview and a new yes.
- **Media is not scanned for private content.** Before any image, video or screen recording goes out, ask the user to confirm it shows and says nothing private (an address bar, an invoice, a credential, a messages window, a phone number or address read aloud).
- **The send check reads the exact text each platform receives.** `post` runs `src/lib/send-check.ts` on each platform's wire text immediately before the network call, and shows any finding in the dry-run preview too: a secret-shaped string (API key, GitHub or Slack token, AWS key id, live Stripe key), a private key block, or your home-directory path closes that platform (`SEND BLOCKED`) and nothing is transmitted to it. A link card's title, description and image are fetched from the linked page at send time, so the check never sees them (on a URL-only post the commentary is that fetched title, and the check reads the URL).
- **LinkedIn's `commentary` field is "little text format" — unescaped `( ) [ ] { } < > @ # * _ ~ |` silently swallow content.** The API returns 201 and the post publishes truncated at the first reserved char, so a hook like "(No. 42) is out" is cut mid-line. `escapeLittleText()` in `src/format/linkedin-formatter.ts` escapes these outside URLs, well-formed mentions, and letter-led `#Word` hashtags (`#42` still escapes), and `assertLittleText()` runs on the exact wire string before POST and throws on any unescaped reserved char, so this class now fails loud instead of shipping truncated. Truncation never cuts inside a mention. Dry-run shows the styled text without the escaping backslashes, cut where the escaped wire form is cut, with the link-card URL on its own line.
- **Auth tokens expire.** If posting fails, re-check OAuth tokens for each platform before debugging the content.
- **ALL X posting — text and media — runs on the x-twitter skill's OAuth 2.0 token store.** The twitter adapter hands every post to the x-twitter skill's `$X_TWITTER_SKILL_DIR/Tools/post.ts`, which uses OAuth 2.0 user context (`tweet.write` + `media.write` + `offline.access`). Where the grant lives and who refreshes it is the x-twitter skill's Config.md, never this skill's. With no store configured, `post.ts` falls back to the OAuth 1.0a env keys for text only; X can revoke those keys without notice and they have no media path, so a split path would post text while video silently fails. A twitter 401 on text means the grant lost `tweet.write`; a **403 on media means the grant is missing `media.write`** — either way, re-auth once via `bun $X_TWITTER_SKILL_DIR/Tools/bookmarks.ts authorize`.
- **`status`'s twitter row verifies the path posting will use.** It runs the x-twitter skill's `profile.ts --me`, which checks that skill's token store first and calls `/users/me` through it; only with no store does it verify the OAuth 1.0a keys. Keys that merely sit in `.env` never count as connected, because revoked keys look exactly like live ones until a call fails. Without `X_TWITTER_SKILL_DIR` pointing at the skill, the row is `❌ Not configured`.

## Examples

```
User: "put my latest tweet on linkedin and insta"
→ Post intent: read the X post back, dry-run LinkedIn and Instagram, show both previews and accounts, wait for the user's yes
→ Posted with --yes: the X post's exact text, links expanded, is live on LinkedIn (bold hook added) and on Instagram with its image, both links reported
```

```
User: "Post to LinkedIn only: 'Finally moved the whole build to the new toolchain.' with link https://example.com/blog/toolchain"
→ LinkedIn intent: dry-run preview shown and confirmed, then posted with --yes
→ The post is live with the words verbatim and the article's link-preview card, and the post link is reported
```

```
User: "post my video ./my-export.mp4 to Instagram"  (the user's own local file; given only a link, the run asks for the local file and never downloads it)
→ Instagram intent
→ Dry-run preview shown; the user confirms the caption and that the video shows nothing private; posted with --yes as a Reel; the Reel link is reported
```
