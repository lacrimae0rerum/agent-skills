# Broadcast setup

**Contents:** What it does · Fill in · Accounts and secrets · When a post is held or blocked · Prove it works

Status: `bun src/index.ts status` (from the skill folder) · optional

## What it does

Broadcast posts one piece of content to X, LinkedIn, Bluesky and Instagram from one command, checking each platform's length and media limits first and previewing everything with `--dry-run`. It also publishes X Articles, publishes podcast episodes to Omny Studio, and shares a newsletter edition. It does not write copy; hand it finished text. Nothing posts until you confirm the exact preview: the agent then re-runs the command with `--yes` (§ When a post is held or blocked).

Each platform is optional. A platform you never set up shows `❌ Not configured` in `status` and is skipped, and the rest still post. X posting goes through the `x-twitter` skill, so install and set that skill up first if you want X (its own Setup.md), then set `X_TWITTER_SKILL_DIR` to its folder.

## Fill in

First install the skill's packages, once, from the skill folder (bun 1.2+):

```bash
cd <path-to-the-broadcast-skill> && bun install
```

This installs the packages the code imports (`commander`, `@atproto/api`, `aws4fetch`, `probe-image-size`) into the skill's own `node_modules`. Skip it and a command can stop on a missing-package error.

Then create `$AGENT_SKILLS_HOME/broadcast/Config.md` (default `~/.agent-skills/broadcast/Config.md`). Only the podcast, newsletter-share and posting-preference features read it; posting to the four platforms needs no config file. Each value is one `key = value` line at the start of a line, anywhere in the file; the first match wins, so write each key once and start no other line with a key name.

A worked example, every value made up:

````markdown
# Broadcast config

## Podcast (Omny Studio)

omny_program_id = 00000000-0000-0000-0000-00000000a001
omny_playlist_ids = 00000000-0000-0000-0000-00000000b001, 00000000-0000-0000-0000-00000000b002
omny_rss_container_id = 00000000-0000-0000-0000-00000000c001
omny_episode_type = Full
omny_include_intro_outro = true
omny_auto_level_audio = false

## Newsletter share

newsletter_name = Example Weekly
newsletter_url = https://news.example.com
edition_label = Issue
share_sponsor_thanks = true
share_card = true
share_card_spec = ShareCard.md
share_file_prefix = EW
share_highlight_own_writing = false
share_writing_audit = false
newsletter_share_overlay = ShareRules.md

## Posting preferences

house_style = false
video_followup = false

## Handles (reference only)

x_handle = example_writer
bluesky_handle = example-writer.bsky.social
````

| Key | Required | Meaning |
|-----|----------|---------|
| `omny_program_id` | for podcasts | The Omny program (show) episodes publish into: the `/programs/<id>` part of the program's URL in Omny Studio |
| `omny_playlist_ids` | for podcasts | Comma-separated playlists every episode joins, main RSS playlist first |
| `omny_rss_container_id` | no | First GUID in your public feed URL `https://www.omnycontent.com/d/playlist/<container>/<program>/<playlist>/podcast.rss`; only the Podcast intent's feed check uses it |
| `omny_episode_type` | no | `Full` (default), `Trailer` or `Bonus` |
| `omny_include_intro_outro` | no | `true` (default) inserts the program's intro and outro; `false` does not |
| `omny_auto_level_audio` | no | `false` (default) or `true` |
| `newsletter_name` | for shares | The newsletter's name as the hook line says it |
| `newsletter_url` | for shares | Base URL; an edition is `<newsletter_url>/p/<slug>` |
| `edition_label` | no | How editions are numbered in the hook: `No.` (default), `Issue`, `#` |
| `share_sponsor_thanks` | no | `true` adds one thank-you line per sponsor the edition credits, with that sponsor's link exactly as the edition printed it; `false` (default) omits the block |
| `share_card` | no | `true` makes a designed edition card in two sizes and runs it through the `art-direction` skill's critique when that skill is installed (else your own review); `false` (default) posts without one |
| `share_card_spec` | when `share_card = true` | Your card's brand file, relative to `$AGENT_SKILLS_HOME/broadcast/`: mark image path, wordmark, fonts and weights, palette, layout notes. The share stops and names this key if it is missing |
| `share_file_prefix` | no | Prefix for the card files in `~/Downloads`, `<prefix><NNN>-share-card-{wide,4x5}.png` (default `edition-`) |
| `share_highlight_own_writing` | no | `true` requires one highlight line linking your own writing when the edition has some (default `false`) |
| `share_writing_audit` | no | `true` runs the `writing` skill's detect pass and its Pangram score before the draft is shown (default `false`; needs that skill installed) |
| `newsletter_share_overlay` | no | A file of your own further share rules, relative to `$AGENT_SKILLS_HOME/broadcast/`, applied on top of the ShareNewsletter intent |
| `house_style` | no | `false` (default) posts your text as written. `true` turns on the bundled style rules: `post` and `edit` refuse a LinkedIn post with no `**bold**` span or `# Header` line (pass `--linkedin-plain` to post plain text anyway), and the intents add their style preferences (no X or Bluesky hashtags except a `#sponsored` disclosure, X posts spaced hours apart, a bold hook and 0–2 emoji on LinkedIn) |
| `video_followup` | no | `false` (default) asks separately before following a video-anchored post with the video link (an X reply, a LinkedIn comment). `true` puts that follow-up in the same preview you confirm for the main post |
| `x_handle`, `bluesky_handle`, `instagram_handle`, `linkedin_profile_url` | no | Reference only; posting reads credentials, never these |

Set the three episode settings to whatever your existing episodes use, so a new episode matches them; the tool verifies all three after publishing and exits 3 on a mismatch.

**Worked example of a share card brand file.** `$AGENT_SKILLS_HOME/broadcast/ShareCard.md`, read when `share_card = true`:

```markdown
# Share card brand for Example Weekly

- Mark: brand/example-mark-white.png (in the same folder as this file)
- Wordmark: EXAMPLE WEEKLY, caps
- Fonts: Inter Tight Bold for the wordmark and number, Inter for topics and date (installed in ~/Library/Fonts)
- Palette: ground #101820, accent #3B82F6 → #93C5FD
- Layout: thin grid at 6% opacity, corner ticks, oversized issue number
```

**Worked example of a share overlay.** The overlay is a plain markdown file of extra rules the ShareNewsletter intent reads before drafting. `$AGENT_SKILLS_HOME/broadcast/ShareRules.md`:

```markdown
# Share rules for Example Weekly

- End the LinkedIn share with "Reply with the story you liked most."
- Attach the edition's header image, saved as ~/Downloads/example-weekly-<NNN>.png.
- Never include more than five highlight lines.
```

## Accounts and secrets

Secrets are environment variables. Export them, or put them in `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`) as `NAME=value` lines (never in Config.md); variables already set in the environment win. LinkedIn, Bluesky and Instagram sessions are written by the skill's own auth commands to `$AGENT_SKILLS_HOME/broadcast/credentials.json` (mode 0600); keep that file out of any repo. An older install's `~/.broadcast/credentials.json` can be moved there as is.

**X.** Install the `x-twitter` skill and follow its Setup.md: an X developer app, `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `X_BEARER_TOKEN`, an OAuth 2.0 token store in the x-twitter skill's Config.md, and `bun $X_TWITTER_SKILL_DIR/Tools/bookmarks.ts authorize`. Text and media then post through it. Without a token store, the four OAuth 1.0a keys (`TWITTER_API_KEY`, `TWITTER_API_KEY_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`) post text only. Then set `X_TWITTER_SKILL_DIR` to the x-twitter skill's folder (in the environment or `$AGENT_SKILLS_HOME/.env`); `status` shows `❌ Not configured` for X until it points there.

**LinkedIn.** Create an app at developer.linkedin.com with the "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect" products, and add `http://localhost:8917/callback` as an authorized redirect URL on its Auth tab. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`, then run `bun Tools/LinkedInAuth.ts login` once. Tokens last 60 days; `ensure` renews silently while you are logged in to linkedin.com in your browser (on macOS it opens the browser in the background; on Linux and Windows the browser comes to the front). The token is stored only in `credentials.json`.

**Bluesky.** Create an app password at bsky.app/settings/app-passwords, then run:

```bash
bun Tools/Broadcast.ts auth bluesky --identifier example-writer.bsky.social --password <app-password>
```

**Instagram.** Needs a Creator or Business account and a Meta app with "API setup with Instagram login" (full steps in `Intents/Auth.md`). Set `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` and `INSTAGRAM_REDIRECT_URI`. Meta fetches media from a public URL, so Instagram also needs a public Cloudflare R2 bucket: `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BROADCAST_R2_BUCKET`, `BROADCAST_R2_PUBLIC_BASE`. Then `InstagramAuth.ts url`, open the URL, approve, and `InstagramAuth.ts exchange --code <code>`.

**Omny Studio (podcasts).** `OMNYSTUDIO_API_KEY` from Omny Studio's API settings. Episodes publish from a local audio file.

**Videos and images.** Media is not scanned for personal information. Before any video, screen recording or image goes out, the agent asks you to confirm it shows and says nothing private (an address bar, an invoice, a credential, a messages window, a phone number or address read aloud).

**Beehiiv (newsletter shares, optional).** `BEEHIIV_API_KEY` and `BEEHIIV_PUB_ID`, only if Beehiiv is where your newsletter lives; they let ShareNewsletter find the latest edition by itself. With any other newsletter platform, pass the published edition's URL instead.

**Worked example of the scheduled token renewal.** LinkedIn and Instagram tokens die after 60 days unless something renews them. Schedule both `ensure` commands once a day with your system scheduler. A crontab line (`crontab -e`), with the path to this skill's folder filled in and your secrets in `$AGENT_SKILLS_HOME/.env` so cron sees them:

```cron
30 5 * * * cd /path/to/broadcast && bun Tools/LinkedInAuth.ts ensure && bun Tools/InstagramAuth.ts ensure >> "$HOME/.agent-skills/broadcast/auth.log" 2>&1
```

Each `ensure` renews only when fewer than 14 days are left and exits 1 when renewal fails, so check that log (or wire the exit code to your own alert). On macOS a launchd agent with the same command works too. Drop the Instagram half if you only use LinkedIn.

## When a post is held or blocked

**Held (no `--yes`).** Every real post, edit, comment, Article publish and podcast publish needs `--yes`. Without it the command prints the exact previews, then `NOT SENT: ... needs the user's explicit confirmation`, and exits 2. The agent shows you those previews and the account each platform posts as (`status`), and re-runs with `--yes` only after you confirm. Any change to the text, media or platforms means a new preview and a new yes.

**Blocked (send check).** Just before each platform call, the exact text that platform receives passes `src/lib/send-check.ts`. It stops that platform's post if the text holds a secret-shaped string (an API key, a GitHub or Slack token, an AWS key id, a live Stripe key), a private key block, or your own home-directory path. A LinkedIn link card's title, description and image are fetched from the linked page at send time, so the check never sees them (a URL-only LinkedIn post uses that fetched title as its text). A block prints `SEND BLOCKED (<platform>)`, the finding and `Nothing was sent.`; that platform is reported as failed, the other platforms still post, and the command exits 1. There is no override: remove what the finding names and run the same command again. `--dry-run` shows the same finding in its preview (`⛔ SEND BLOCKED ...`). The check reads text only.

## Prove it works

```bash
bun src/index.ts post --content "**Testing** my Broadcast setup" --platforms twitter --dry-run
```

This sends nothing and needs no credentials. Success is a `┌─ TWITTER (30/280 weighted chars)` preview box with your text, then `✅ Dry run complete. To post, show the user these previews and, once they confirm, run again with --yes instead of --dry-run.` and exit code 0. Before X is set up, a `⚠️  TWITTER: Not configured (preview only; a live post skips it)` line comes first; that is expected.

```bash
bun src/index.ts status
```

Read-only. Each platform you set up shows `✅` with its account name; `⚠️` means credentials are present but the platform rejected them (re-run that platform's step above), and `❌ Not configured` means its step was not done.
