---
name: x-twitter
description: "Runs all X (Twitter) operations via X API v2 and the xurl CLI: post tweets and threads with media (each post confirmed by the user first), publish X Articles, delete posts, search, fetch bookmarks, sweep new bookmarks into GitHub idea-issues with upgrade analysis for the user's own projects, look up profiles, read tweets and articles. Use when post to X, tweet, post thread, search X, search Twitter, X bookmarks, fetch bookmarks, pull bookmarks, check bookmarks, what have I bookmarked, bookmarks for upgrades, bookmark sweep, bookmark ideas, read tweet, X article, X profile, lookup user, who is on X, authorize X. Not for posting the same content to several platforms at once (use `broadcast`), writing social copy, Instagram/LinkedIn/TikTok data, or bulk reads beyond what the X API plan allows (use your own exported data or a data product X licenses)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ and `bun install` in the skill folder (yaml). Env: X_BEARER_TOKEN, TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET; optional TWITTER_API_KEY, TWITTER_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, X_AUTHORIZE_TIMEOUT_S; CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, X_TOKENS_KV_NAMESPACE for a KV token store. Bookmark sweep needs the GitHub CLI gh. Optional xurl CLI."
---

# X — Unified X (Twitter) API

**Contents:** Ideal State · Intent Routing · Tools Reference · CLI: xurl · Data & Config · Setup · Gotchas · Examples

Handles every X (Twitter) operation through the X API v2 (direct `fetch()`) and the `xurl` CLI: post single tweets, threads and media, publish long-form Articles, search recent tweets, fetch bookmarks, look up user profiles, and read tweets by ID or URL. Other skills (for example `broadcast`, if it is installed) delegate their X work here, so the credentials, the auth handling and the OAuth 2.0 token store live in one place; if each skill wired up its own, the secrets would sprawl and the refresh chain would break.

Not for posting the same content to several platforms (use the `broadcast` skill if it is installed), writing social copy (the `writing` skill if installed), or bulk collection beyond what the X API allows. X reads use the official API or the user’s own exported data; when X refuses a read, the intent stops and reports it.

Run every tool command from this skill's folder (paths such as `Tools/post.ts` are relative to it), or prefix the folder's path.

## Ideal State

- Every X operation runs through this skill's tools or `xurl` on the auth mode it needs, and every X read goes through `Tools/read.ts`, never a web fetch or browser.
- Nothing reaches the account (a tweet, thread, reply, quote, media post, published Article or deletion) without the user's explicit confirmation of the exact text, media and account: the agent shows the `--dry-run` preview and the account from `Tools/profile.ts --me`, and passes `--yes` only after the user says yes. A post is reported done only after reading it back.
- Posted text and URLs go out exactly as given, measured by X's weighted count; over-limit text is rejected, never cut.
- The OAuth 2.0 grant survives every run: one refresher per grant, and a missing scope or revoked grant ends in a surfaced re-authorization URL, never a guess.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **Post** | "post to X", "tweet", "post tweet", "send tweet", "thread" | `Intents/Post.md` |
| **Search** | "search X", "search twitter", "find tweets" | `Intents/Search.md` |
| **Bookmarks** | "X bookmarks", "fetch bookmarks", "re-authorize bookmarks", "authorize X", "bookmark token expired" | `Intents/Bookmarks.md` |
| **PullBookmarks** | "pull bookmarks", "check bookmarks", "bookmark sweep", "bookmarks for upgrades", "tb", "quick bookmark check" | `Intents/PullBookmarks.md` |
| **Profile** | "X profile", "twitter profile", "lookup user", "who is @user" | `Intents/Profile.md` |
| **Read** | "read tweet", "get tweet", "fetch tweet" | `Intents/Read.md` |
| Article | "X article", "Twitter article", "long-form on X", "publish an article to X" | `Tools/article.ts`: `render --file piece.md` previews offline, `create --file piece.md` drafts (the default), `create ... --publish --yes` publishes after the user confirmed the exact article, then read the post back with `Tools/read.ts`. Publishing is irreversible through the API. |
| Delete | "delete tweet", "remove that post" | `Tools/delete.ts`: `--dry-run <id>` lists it; `--yes <id>` deletes after the user confirmed the exact ids. Irreversible. |

| File | Read when |
|------|-----------|
| `Setup.md` | first-time setup: the token-store Config.md, the X app and its secrets, and the first-run proof |

## Tools Reference

All tools are in `Tools/` inside this skill's folder and run with `bun`. Each intent carries the command for its own tool (`post.ts`, `search.ts`, `profile.ts`, `read.ts`, `bookmarks.ts`, and `bookmark-issue.ts` for the sweep's `check`, `create`, `skip` and `audit`); this table holds only the tools no intent owns. Which auth mode each path uses is in Gotchas.

| Tool | Purpose | Usage |
|------|---------|-------|
| `x-client.ts` | Credential loader, token store, auth helpers | Imported by the other tools |
| `Tools/lib/send-check.ts` | The confirmation step: `--yes` on every sending command, and a refusal to send text with a secret, a private key or your home-directory path | Imported by `post.ts`, `article.ts`, `delete.ts` |
| `profile.ts --me` | The account a post would go out as (JSON: id, username, name, auth) | `bun run Tools/profile.ts --me` |
| `media.ts` | Chunked media upload (video/image/GIF) | `bun run media.ts upload clip.mp4` |
| `article.ts` | Long-form X Articles: markdown to `content_state`, draft, publish | `bun run article.ts create --file piece.md --publish --yes` |
| `delete.ts` | Delete tweets by id | `bun run delete.ts --yes <id> [<id> ...]` |
| send check, confirmation | What stops a post and how each block is reported | Post intent § Tool contract (`Intents/Post.md`) |

## CLI: xurl

`xurl` is the official X CLI. Use for quick API calls not covered by tools:

```bash
# Quick lookups
xurl /2/users/me
xurl /2/tweets/1234567890

# Search
xurl "/2/tweets/search/recent?query=from:<username>&max_results=10"

# Post (use Tools/post.ts instead for threads; confirm the exact text with the user first)
xurl -X POST /2/tweets -d '{"text":"Hello"}'
```

`xurl` writes bypass this skill's confirmation step, so use them only after the user confirmed the exact request.

## Data & Config

Config: `$AGENT_SKILLS_HOME/x-twitter/Config.md` (default `~/.agent-skills/x-twitter/`; a fenced `yaml` block choosing the OAuth 2.0 token store: `local`, a 0600 file on this machine that `x-client.ts` refreshes, or `cloudflare-kv`, a KV namespace that another process such as a scheduled Worker refreshes). Setup, field table and first-run proof: `Setup.md`. Without it, reads still work on the bearer token, posting falls back to OAuth 1.0a text-only, and every OAuth 2.0 path (media, Articles, bookmarks, delete) stops with an error naming Setup.md.

The bookmark sweep (PullBookmarks) reads two more things from the same folder: the `bookmark_sweep` mapping in that yaml block (the repo for idea-issues, issue labels, property label prefix) and `PREFERENCES.md` (relevance profile, what counts as an idea, and the prior-work list of the user's own projects). User preferences, when present, live in `$AGENT_SKILLS_HOME/x-twitter/PREFERENCES.md` (default `~/.agent-skills/x-twitter/`) and override the defaults here; when absent, the defaults stand. The sweep's state lives in the same folder (`bookmarks-state.json`, `bookmark-issues.json`), outside the skill tree.

Secrets come from environment variables, optionally loaded from `$AGENT_SKILLS_HOME/.env` (real env vars win), read by `Tools/x-client.ts` and never hardcoded (names only):

| Var | Purpose |
|-----|---------|
| `TWITTER_CLIENT_ID` | OAuth 2.0 client ID (authorize + local refresh) |
| `TWITTER_CLIENT_SECRET` | OAuth 2.0 client secret |
| `X_BEARER_TOKEN` | App-only bearer token (reads) |
| `TWITTER_API_KEY`, `TWITTER_API_KEY_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` | Optional OAuth 1.0a text-only posting fallback |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `X_TOKENS_KV_NAMESPACE` | Only for `token_store: cloudflare-kv` |
| `X_AUTHORIZE_TIMEOUT_S` | Optional: how long `bookmarks.ts authorize` waits for the consent click (default 600) |

## Setup

1. `bun install` in this skill's folder (installs `yaml`).
2. Create the X developer app, put the keys above in the environment or `$AGENT_SKILLS_HOME/.env`, write `Config.md`, and run `bun Tools/bookmarks.ts authorize`. Every step, with examples and the first-run proof, is in `Setup.md`.
3. Optional: the `xurl` CLI for ad-hoc API calls, and the GitHub CLI `gh` (signed in) for the bookmark sweep.

## Gotchas

- **A published X Article cannot be deleted or edited through the API.** X documents `POST /2/articles/draft` and `POST /2/articles/{id}/publish` and nothing else — no GET, no PATCH, no DELETE. Drafts are free to create and invisible until published, so iterate on drafts and treat `--publish` as one-way. `article.ts` defaults to draft-only for exactly this reason. The X web UI does offer Edit and Delete on a published Article, so a bad publish is recoverable by hand in the browser, not in code.
- **Article `content_state` is DraftJS in snake_case**, not the camelCase DraftJS raw state every online example shows: `inline_style_ranges`, `entity_ranges`, and a flat `entities` array of `{key, value}` rather than an `entityMap` object. Offsets index the stripped text (markers removed). Images, embedded posts, code and dividers are `atomic` blocks whose single-space text is covered entirely by one entity range — a zero-length atomic block is rejected.
- **X's 280-character limit is weighted, not JavaScript `text.length`.** HTTP(S) URLs count as exactly 23 characters and emoji/Unicode follow X weighting in `Tools/TwitterText.ts`. `Tools/post.ts` sends the exact caller input or rejects it (Post intent).
- **`read.ts` returns article and long-tweet text in one call.** It requests `tweet.fields=article,note_tweet`, while X answers a plain page fetch with 402 and automation browsers are usually logged out, so any other route first only burns time.
- **One refresh chain per grant, ever.** X rotates the refresh token on every refresh and treats reuse of a consumed one as theft, revoking the whole grant until a human re-authorizes. With `token_store: local`, `x-client.ts` is the only refresher: refreshes run behind `<token_file>.lock`, waiters re-read the file instead of replaying a consumed token, and writes are tmp+rename. With `cloudflare-kv`, the external owner refreshes and this client never does. Never call the token endpoint directly with a stored refresh token — always go through `getValidTokens()` — and never point two installs' local stores at the same grant.
- **Three auth modes, not one.** Posting, media, Articles and delete = OAuth 2.0 user context (OAuth 1.0a text-only fallback when no OAuth 2.0 store is configured), reads (search, profiles, tweets) = app-only bearer token, bookmarks = OAuth 2.0 PKCE. A 401 on one path says nothing about the other two.
- **`--yes` is the user's word, not a formality.** `post.ts`, `article.ts create --publish`, `article.ts publish` and `delete.ts` refuse to act without it (exit 2, `NOT SENT`), after printing the exact preview. Pass it only once the user has confirmed that preview and the account from `profile.ts --me`. A `SEND BLOCKED (x)` stop means the text carries a secret-shaped string, a private key or your home-directory path; remove it and run again — never work around it.
- **Videos are not scanned for private content.** Before a video or screen recording goes out, ask the user to confirm it shows or says nothing private (an address bar, an invoice, a credential, a messages window, a phone number or address read aloud).
- **Prefer the OAuth 2.0 store for posting.** OAuth 1.0a portal keys can be revoked or regenerated without notice and then 401 on every post; `post.ts` uses the OAuth 2.0 store whenever one is configured and falls back to OAuth 1.0a only without one. If posting 403s, read the body first: `type: …/spend-cap-reached` means the account's Billing Cycle Cap in the X developer console is hit (every endpoint 403s until the cap is raised or the cycle resets). Otherwise the grant lacks `tweet.write`: re-run `bookmarks.ts authorize`. The consent click is a human's, so surface the URL; if the app grant is still active on the account, authorize completes with no click.
- **Media upload needs its own scope: `media.write`.** Without it `POST /2/media/upload` returns a bare 403 while `/2/tweets` keeps working, which reads as "video posting is broken" rather than "the grant is short a scope". `SCOPES` in `bookmarks.ts` carries it; a grant authorized without it must be re-authorized once.
- **The v2 media endpoints are sub-paths, not `command=` parameters, and X's own chunked-upload doc still describes the retired v1.1 shape.** The working contract is: `POST /2/media/upload/initialize` (**JSON** body: `media_type`, `total_bytes`, `media_category`) → `POST /2/media/upload/{id}/append` (**multipart**: `segment_index`, `media`, segments ≤5MB) → `POST /2/media/upload/{id}/finalize`. Sending `command=INIT` to the base path returns 400 *"Missing media field in JSON"* — the parameter is ignored and the call is read as a simple upload, so the error names the wrong problem. Images ≤5MB skip all of it: one multipart `POST /2/media/upload` with a `media` field.
- **Status is the one call that still speaks the old dialect:** `GET /2/media/upload?media_id=<id>&command=STATUS`. It rejects `media_ids` (the plural that every other v2 endpoint takes) and has no sub-path form. Video/GIF process asynchronously — poll to `succeeded` before attaching, because an unprocessed media_id publishes a tweet with no video and no error. All of this is encoded in `Tools/media.ts`.

## Examples

**Example 1: Read a tweet link**
```
User: "read this: https://x.com/<user>/status/<id>"
→ bun run Tools/read.ts <url> (immediately — no browser attempts)
→ Returns the tweet, plus the full article plain_text when the post carries an X Article
```
`read.ts` takes a status URL or a numeric tweet ID. A bare `x.com/i/article/<id>` link is an article ID, not a tweet ID, and the API has no read-by-article-ID call; use the status URL of the post that carries the article.

**Example 2: Fetch recent bookmarks**
```
User: "show my last 20 X bookmarks"
→ Bookmarks intent: bun run Tools/bookmarks.ts fetch 20
→ Author, text and links per bookmark
```

**Example 3: Bookmark sweep**
```
User: "bookmark sweep"  (or "just check bookmarks" for quick mode: last 30, MEDIUM skipped)
→ PullBookmarks intent: fetch 50 --json, filter seenIds
→ each new bookmark created-or-skipped inline via bookmark-issue.ts, audit passes, upgrade report with prior-work tags
```

**Example 4: Post a tweet**
```
User: "tweet: Shipped the new release today https://example.com/release"
→ Post intent: bun run Tools/post.ts --dry-run "<text>" and bun run Tools/profile.ts --me
→ Show the user the exact text, the weighted count and the account; wait for an explicit yes
→ bun run Tools/post.ts --yes "<text>", then read it back with Tools/read.ts before reporting the link
```
