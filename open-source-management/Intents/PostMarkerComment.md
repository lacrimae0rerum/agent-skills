# PostMarkerComment

**Contents:** Ideal State · Anti-criteria · Safety gates · Inputs · Output format · Tool contract · Examples

Post or update a single bot-authored comment on a GitHub issue or PR, identified by a hidden HTML marker. Same marker on the same issue/PR = one comment forever, edited in place.

## Ideal State

- Exactly one comment exists per (issue/PR, marker ID) however many times it runs: the first run creates it, every later run edits it in place.
- The comment body opens with the hidden `<!-- agent-marker:<id> -->` line, then the visible agent-attribution note, and ends with the visible bot-authored footer.
- The marker ID follows the Marker-ID Convention (`<intent-name>-<purpose>`, matching `/^[a-z0-9-]{1,40}$/`) and no other intent uses it on the same issue.
- On a public community repo (any repo in `OSS_REPOS`, or another public repo when another skill calls this tool), a `--dry-run` body and marker ID were inspected before the live write.

## Anti-criteria

- No comment claiming something is fixed/merged/adopted posts before the change is verified in the code's source of truth.
- Never embed credentials, hostnames, or identity in the body.
- No automatic posting on community repos: the intent runs only when the user asks for the post.

## Safety gates

`CheckIssues`, `CheckPullRequests`, and `CheckDiscussions` are still **proposal-only** by default — they read state and produce recommendations. This intent is opt-in: when the user says "post the triage" or "leave a marker comment", it's the executor that calls `MarkerComment.ts upsert`. No automatic posting on community repos.

Before every live write: run `--dry-run`, show the user the exact body, the target (`<owner>/<repo>#<number>`) and the marker ID, and confirm the exact action with the user first. A body or target that changes after the confirmation needs a new one.

The footer is how the community knows the comment will edit in place rather than stacking.

## Inputs

### When to Use

Whenever an intent (`CheckIssues`, `CheckPullRequests`, or any future triage flow) wants to leave a comment that should *not* stack on repeated runs. The default behavior of `gh issue comment` and `gh pr comment` is "post a new one every time" — that's wrong for any kind of bot-authored status, triage note, or rolling summary.

Examples of the problem this solves:
- Triage status updates ("classified as feature-request, needs maintainer review")
- Rolling weekly summaries on a long-lived discussion
- "We're still tracking this" pings on stale issues
- Per-PR review summaries that get refreshed on each new push

Examples of when **not** to use this:
- Real human conversation (just use `gh issue comment`)
- One-off acknowledgments that should remain in the timeline as a record
- Anything that needs threaded replies

## Output format

### How It Works

The Tool injects a hidden HTML marker as the first line of the comment body:

```
<!-- agent-marker:<id> -->
```

GitHub renders HTML comments as nothing — humans see clean Markdown. The Tool finds the existing comment by exact-prefix match on the marker line, then PATCHes that comment with the new body, or POSTs a fresh comment if no match.

Comments go out from the user's own account, so an attribution note goes right after the marker, and a visible footer is appended, so contributors know the comment is bot-authored and edits in place rather than getting reposted:

```
> [!NOTE]
> 🤖 **<agent name> (AI assistant) responding on behalf of <maintainer>**

…body…

---
_Bot-authored by <agent name> via the open-source-management agent skill — this comment edits in place._
```

The names come from `OSM_AGENT_NAME` / `OSM_MAINTAINER_NAME`, or `AGENT_NAME:` / `MAINTAINER_NAME:` in Config.md; without them the note reads "An AI assistant responding on behalf of <OSS_OWNER>" (see `Setup.md`).

## Tool contract

### Marker-ID Convention

`<intent-name>-<purpose>` — lowercase, hyphen-separated, ≤40 chars, matches `/^[a-z0-9-]{1,40}$/`.

| Marker ID | Used by |
|-----------|---------|
| `triage-status` | CheckIssues — rolling triage classification |
| `prfeedback-summary` | CheckPullRequests — review summary that refreshes per push |
| `discussion-digest` | CheckDiscussions — rolling community sentiment summary |
| `state-snapshot` | CheckState — periodic cross-repo health check |

When in doubt, prefix with the intent name.

```bash
# upsert from a file
bun run Tools/MarkerComment.ts \
  upsert <repo> <number> <marker-id> <body-file>

# upsert from stdin
echo "## Triage status\n\n- Type: feature-request\n- Owner: @owner" | \
  bun run Tools/MarkerComment.ts \
  upsert <owner>/<repo> 42 triage-status -

# dry-run (prints body, never calls write API)
bun run Tools/MarkerComment.ts \
  upsert <owner>/<repo> 42 triage-status note.md --dry-run

# look up existing comment id
bun run Tools/MarkerComment.ts \
  find <owner>/<repo> 42 triage-status
```

### Execution Log

The Tool reports each action (`created`, `edited`, `would-*`, `*-failed`) on stderr and keeps no log file of its own.

## Examples

A `CheckPullRequests` run on PR #1234 in one of the listed repos wants to post a status:

```bash
cat > /tmp/pr1234-summary.md <<'MD'
## Review status

**Verdict:** approve with one nit
**Files reviewed:** src/widget/render.ts, lib/gadget_parser.go
**Concerns:** none blocking. Suggested rename of `gdgt_p` → `gadget_parse_compact` for clarity.

Will refresh on every push.
MD

bun run Tools/MarkerComment.ts \
  upsert <owner>/<repo> 1234 prfeedback-summary /tmp/pr1234-summary.md --dry-run
```

Output (stderr):
```
marker-comment | would-create | <owner>/<repo> | #1234 | prfeedback-summary | (new)
```

After the user has reviewed the body and confirmed the exact post, drop `--dry-run`. A subsequent run with an updated body will produce:
```
marker-comment | edited | <owner>/<repo> | #1234 | prfeedback-summary | <comment-id>
```
