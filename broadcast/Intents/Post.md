# Post

Content posted to the configured social media platforms.

## Ideal State

- Nothing secret, internal or private goes out: no credential or token, internal or staging URL, or personal information in any platform's text or media. The SecurityValidation intent reviewed the content for all of it. The code check inside `post` backs only part of that review: the send check stops a secret-shaped string, a private key or your own home-directory path in each platform's exact text. Media is not scanned, so every image and video was confirmed by the user to show and say nothing private. Internal URLs and personal information in text rest on the review, and a LinkedIn link card's title, description and image (and a URL-only post's commentary, which is that fetched title) are fetched from the linked page at send time and never pass the check (SKILL.md § Gotchas: the send check and confirmation).
- The post went to the platforms the user specified; when none were specified, the user was asked which, and "all", "everywhere", "all three" or "all four" meant all four platforms (twitter, linkedin, bluesky, instagram).
- A dry run ran first and its preview (every platform's exact text, the media, and the account each platform posts as, from `status`) was shown to the user and explicitly confirmed before the actual post. "Post now" from the user skips waiting for a second message only when the user has already seen that exact preview; otherwise the preview still comes first.
- Each platform's text meets the platform handling under Output format.
- When the broadcast is built around someone's video and Config.md sets `video_followup = true`, the loop is closed with the video on both platforms as part of the same confirmed preview: on X a reply to the last tweet with the bare video URL alone so X renders the embed, and on LinkedIn a comment carrying the video link. The preview the user confirms names both follow-ups. With the key absent or `false` (the default), the follow-up is offered to the user and posted only on their yes.
- The report names which platforms succeeded, links to the posts, the embed reply (X) and link comment (LinkedIn) when one was posted, and any failures and why.
- For X, the report comes only after the returned post was read with `bun $X_TWITTER_SKILL_DIR/Tools/read.ts <tweet-url>` and every displayed expanded URL exactly matches the intended canonical URL; a CLI success exit alone is insufficient.
- When a platform fails, the other platforms still post, and the report gives the specific error for the failed platform with suggested fixes.

## Anti-criteria

- X text is never raw-sliced, truncated or given an appended ellipsis; the whole X post is rejected before sending when weighted length exceeds 280.
- The video link never goes in the LinkedIn post body; it goes in a comment.
- The `**` LinkedIn markup never reaches X, Bluesky or Instagram.

## Safety gates

Run the SecurityValidation intent on the content, then a dry run, and confirm the preview with the user before the live post:

```bash
bun src/index.ts post \
  --content "CONTENT_HERE" \
  --platforms PLATFORM_LIST \
  --dry-run
bun src/index.ts status   # the account each platform will post as
```

Show the user the previews and the accounts, and wait for an explicit yes. Any change to text, media or platforms means a new preview and a new yes. For a video or screen recording, ask the user to confirm it shows and says nothing private (an address bar, an invoice, a credential, a messages window, a phone number or address read aloud).

## Tool contract

Once confirmed, the same command with `--yes` instead of `--dry-run` (without `--yes`, `post` prints the previews, `NOT SENT: ...`, and exits 2):

```bash
bun src/index.ts post \
  --content "CONTENT_HERE" \
  --platforms PLATFORM_LIST \
  --yes
```

| Flag | Description |
|------|-------------|
| `--content <text>` | Content to post |
| `--file <path>` | Load content from file |
| `--media <paths>` | Comma-separated local media files |
| `--platforms <list>` | Comma-separated platforms or "all" |
| `--dry-run` | Preview without posting |
| `--yes` | Post for real; only after the user confirmed the exact previews |
| `--linkedin-plain` | Skip the LinkedIn styling gate on purpose |

```bash
# Post with media (images or videos), after the user confirmed the dry-run preview and that the media is safe to share
bun src/index.ts post --content "Check this out!" --media ./image.jpg --platforms all --yes
bun src/index.ts post --content "New video!" --media ./video.mp4 --platforms twitter,bluesky --yes

# Multiple images (Twitter/Bluesky support up to 4)
bun src/index.ts post --content "Gallery" --media ./img1.jpg,./img2.jpg --platforms twitter --yes
```

Video-anchored follow-up (opt-in):

When the broadcast is built around someone's video (a share, teaser, or reaction to a video), the video can follow on both platforms. Read `video_followup` in Config.md: `true` includes the follow-up below in the preview the user confirms; absent or `false` (the default) asks the user separately first. Either way both commands need `--yes`, passed only after the user confirmed the exact reply and comment text.

- **X:** after the thread, reply to the LAST tweet with the bare video URL alone so X renders the embed:

  ```bash
  echo '["<videoUrl>"]' | bun $X_TWITTER_SKILL_DIR/Tools/post.ts --reply-to <lastTweetId> --yes
  ```

- **LinkedIn:** the main post keeps its own framing; the video link goes in a COMMENT, never the body (LinkedIn suppresses reach on body links):

  ```bash
  bun Tools/LinkedInComment.ts --yes <shareUrn> "Video: <videoUrl>"
  ```

  The share URN is the `urn:li:share:...` in the post result. (Comment tool uses the v2 `socialActions` endpoint — the REST/partner endpoint 403s. See the tool's header.)

## Output format

The report carries what the Ideal State names. Platform handling:

- **Twitter (280 weighted chars):** weighted length, the shared validator (`src/lib/twitter-text.ts`, the same rules as the x-twitter skill's) and the `expanded_url` read-back follow the X gotcha in SKILL.md.
- **LinkedIn (3000 chars):** markdown is converted to LinkedIn's styled text; with `house_style = true` an unstyled post is refused (the LinkedIn styling gotcha in SKILL.md; `--linkedin-plain` overrides).
- **Bluesky (300 chars):** plain text, cut to fit before the send (`Intents/Bluesky.md`).
- **Instagram (2,200-char caption):** media required, so a text-only broadcast reports Instagram as skipped (`Intents/Instagram.md`).
