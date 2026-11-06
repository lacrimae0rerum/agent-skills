# Post

A single tweet or a thread posted to X through `Tools/post.ts` and verified by reading it back.

## Ideal State

- Every tweet, single or in a thread, is at most 280 X-weighted characters as `Tools/TwitterText.ts` counts them (every HTTP(S) URL is 23), and a thread's tweets remain in logical order.
- The posted text is the exact input text, with full canonical URLs unchanged.
- A success report rests on a `Tools/read.ts` read-back of every returned tweet in which the author, the exact intended text and every displayed `expanded_url` (especially final canonical links) match.

## Anti-criteria

- Over-limit text is never sliced or ellipsized; it is rejected.
- The script output is never treated as proof of posting: a missing post, or a URL expanded to a truncated destination, means posting failed.
- Nothing is posted without the user's explicit confirmation of the exact text, media and target account; posting is irreversible. `--yes` is passed only after that confirmation, never pre-emptively.
- A `SEND BLOCKED` result is reported to the user with its finding, never bypassed.
- No video or screen recording is posted before the user confirmed it shows or says nothing private (an address bar, an invoice, a credential, a messages window, a phone number or address read aloud); the tools do not scan media.

## Confirmation step

1. Run the same command with `--dry-run` (it prints every tweet with its weighted count, media and quote/reply target) and run `bun run Tools/profile.ts --me` for the account it will post as.
2. Show the user that exact preview and the account, and ask for an explicit yes. Any change to text or media means a new preview and a new yes.
3. Only then run the command with `--yes`. Without `--yes`, `post.ts` prints the preview, `NOT SENT: ...`, and exits 2.

## Tool contract

```bash
# Dry run (validate and preview only; always first)
bun run Tools/post.ts --dry-run "Test tweet"

# Single tweet (after the user confirmed the preview)
bun run Tools/post.ts --yes "Your tweet content"

# Thread
bun run Tools/post.ts --yes "Tweet 1" "Tweet 2" "Tweet 3"

# From JSON
echo '["Tweet 1", "Tweet 2"]' | bun run Tools/post.ts --yes

# Media on a single tweet (up to 4 files, comma-separated)
bun run Tools/post.ts --yes "Watch this" --media clip.mp4

# Composed post: a JSON spec on stdin is how media lands on tweet 1 of a chain
echo '[{"text":"Hook","media":["clip.mp4"]},{"text":"Article: …"}]' | bun run Tools/post.ts --yes

# Quote or reply: attaches tweet 1 to an existing tweet
bun run Tools/post.ts --yes "My take" --quote <tweet-id>
bun run Tools/post.ts --yes "Reply text" --reply-to <tweet-id>
```

Every check runs before any byte reaches X, so a stop means nothing was sent:

- **Length and media:** over-limit text (`--long` raises the cap for a Premium long post), a missing media file, or more than 4 files on one tweet exits 1.
- **Send check:** every tweet's exact text passes `Tools/lib/send-check.ts`, in `--dry-run` too. It stops on a secret-shaped string (API key, GitHub or Slack token, AWS key id, live Stripe key), a private key block, or your home-directory path. A block prints `SEND BLOCKED (x)`, the finding and `Nothing was sent.`, and exits 1. The fix is to remove what the finding names and run the same command again. Media bytes are not checked.
- **Confirmation:** without `--yes` the run prints the preview and `NOT SENT: ...` and exits 2 (§ Confirmation step).

Media needs the OAuth 2.0 grant. The OAuth 1.0a fallback posts text only, so a media tweet without a grant stops with an error naming `Setup.md`; in a thread, tweets before it may already be live, so read back what was returned.

Read back every returned tweet:

```bash
bun run Tools/read.ts <tweet-id-or-url>
```

### Rate limits

Each tweet in a thread is its own `POST /2/tweets` call and counts against the posting limit separately. `post.ts` does not retry: a rate-limited call exits 1 with `X API error (429)`, and in a thread the tweets already printed as `Posted:` are live, so read those back before running the rest.
