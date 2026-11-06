# X

Content posted to X (formerly Twitter), text or media.

## Ideal State

- The posted content fits X's 280-character limit, with every URL counted as ~23 chars (t.co wrapper) and mentions in @username format.
- An attached video or image is on the live post and plays: it went up on the OAuth2 grant's `media.write` scope, and a video reached `succeeded` processing before the tweet went out.
- An attached clip is X-safe: encoded in a format X accepts (H.264 video, AAC audio, MP4) and within the account's video length limit (140 seconds on a standard account; longer on X Premium).
- A multi-tweet composition (media on tweet 1, a handoff link on tweet 2, or a video tweet quoting an existing article tweet) is live exactly as composed, each tweet in order with its media, link or quote.
- House rules are optional posting preferences, off by default. When Config.md sets `house_style = true`, several X posts are spaced hours apart rather than sent back to back, since X's ranking can down-weight a second post from the same author in a viewer's feed.
- With `house_style = true`, a single post that delivers the point is preferred to a thread; a thread is for genuinely separate observations.
- With `house_style = true`, video clips carry burned-in captions.

## Anti-criteria

- No media_id attached before video processing finished: `media.ts` polls STATUS, don't bypass it.
- With `house_style = true`, no hashtags except a sponsorship disclosure such as `#sponsored`.

## Inputs

X posting runs through the `x-twitter` skill (optional; X is "not configured" without it): install
it, set `X_TWITTER_SKILL_DIR` to its folder, and set it up with its own Setup.md. X auth is that
skill's OAuth 2.0 token store: a local file or a Cloudflare KV namespace, chosen in its Config.md.
With no store configured, the OAuth 1.0a keys (`TWITTER_API_KEY`, `TWITTER_API_KEY_SECRET`,
`X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`) post text only; media always needs the OAuth 2.0 grant.

## Tool contract

```bash
# Preview; show it and the account (`status`) to the user, then replace --dry-run with --yes once they confirm
bun Tools/Broadcast.ts post \
  --content "CONTENT_HERE" \
  --platforms twitter \
  --dry-run
```

Attach a video or image by passing the file (after the user confirmed the preview and that the clip shows and says nothing private):

```bash
bun src/index.ts post \
  --content "CONTENT_HERE" --media ./clip.mp4 --platforms twitter --yes
```

A **multi-tweet composition** goes straight through the `x-twitter` skill's tool, which speaks the
composition contract this adapter doesn't (same rule: preview, the user's yes, then `--yes`):

```bash
echo '[{"text":"Lead-in","media":["clip.mp4"]},{"text":"Article: <url>"}]' \
  | bun $X_TWITTER_SKILL_DIR/Tools/post.ts --dry-run
bun $X_TWITTER_SKILL_DIR/Tools/post.ts --yes "Lead-in" --media clip.mp4 --quote <tweet-id>
```

Cut and encode the clip before posting with whatever video tool you use (ffmpeg is enough: H.264,
AAC, MP4, under the account's length limit). The authoring side of that post type (lead-in copy,
quote fidelity, article handoff) belongs to your copywriting skill (the `writing` skill, if installed); Broadcast only transports.

## Gotchas

### Common Issues

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | The OAuth2 grant lost `tweet.write` or was revoked — `bun $X_TWITTER_SKILL_DIR/Tools/bookmarks.ts authorize` |
| 403 on a media post | Grant is missing `media.write`, or only the OAuth 1.0a keys are set — same re-auth (it asks for `media.write`) |
| 403 `spend-cap-reached` | The X developer account hit its Billing Cycle Cap; raise it in the developer console |
| Video posts but doesn't play | media_id attached before processing finished — `media.ts` polls STATUS, don't bypass it |
| Duplicate content | X rejects identical tweets |
| Rate limited | 50 tweets per 24 hours |
