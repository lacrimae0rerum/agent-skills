# PullBookmarks

**Contents:** Ideal State · Anti-criteria · Output format · Upgrade extraction · Inputs · Safety gates · Tool contract · Gotchas

The bookmark sweep: new X bookmarks fetched, previously-seen ones filtered out, each new one given an idea-issue or skip disposition in the user's configured GitHub repo, and an upgrade analysis (what each finding could improve in the user's own projects and systems) run on the new findings into one report.

## Ideal State

- Every bookmark analyzed carries its full text and fields from the `--json` fetch of 50 bookmarks (last 30 in quick mode).
- New bookmarks are exactly the fetched ones whose `id` is not in `seenIds`; a missing, empty or malformed state file is treated as a first run (no seen IDs, no last pull).
- The run reports Fetched, Previously seen and New counts; with zero new bookmarks it reports "No new bookmarks since last pull on [lastPull date]" and updates only the `lastPull` timestamp.
- Every new bookmark is classified HIGH, MEDIUM or LOW by the relevance profile in `PREFERENCES.md` (§ Inputs): HIGH gets deep analysis and upgrade extraction (§ Upgrade extraction), MEDIUM a note for awareness with brief analysis (skipped in quick mode), LOW is skipped.
- Every new bookmark ends with exactly one disposition, recorded inline while it is classified, never as a trailing batch step or an afterthought, so none is dropped on a long run: `create` (it is an actionable idea under the idea definition in `PREFERENCES.md`, filed via `bookmark-issue.ts create`) or `skip` (it isn't, with a reason).
- The final `bookmark-issue.ts audit` over ALL new bookmark ids this run passed before the run finished; the audit gate fails loudly (exits nonzero, lists the ids) if any new bookmark has neither disposition.
- A prior-work index, a concise list of topics the user has already implemented or actively worked on, existed before any bookmark was analyzed. It draws on `PREFERENCES.md` § Prior work (the user's projects, systems and components), the README or architecture notes of the projects listed there, and, if your agent keeps persistent memory, a recall of the last 60 days of sessions on keywords from the HIGH bookmark topics. With none of these, ask the user for a short list of what they have built before analyzing.
- The index is aggressive about marking things ALREADY BUILT: a bookmark recommending something that maps to an existing subsystem of the user's (a memory system, a security pipeline, a delegation or agent system, a skill or plugin system, hooks, workflows, a feed, etc.) is ALREADY BUILT, so nothing already implemented is recommended.
- Every recommendation, without exception, is tagged with its correct prior-work status (NEW, ALREADY BUILT, IN PROGRESS or EXTENDS) from that index.
- Each HIGH-relevance bookmark has its own analysis in the per-bookmark JSON shape (in parallel where the agent can run subagents), that covers the external URLs in the tweet (articles, repos, blog posts) and extracts techniques under § Upgrade extraction, quoting the actual content with no vague summaries and mapping each to a specific component of the user's systems.
- The report uses the output format below with the disposition table (idea-issues created with URLs, skipped, audit result) at the top.
- After successful processing the state file holds the current `lastPull`, all previously seen plus newly processed IDs in `seenIds`, and `pullCount` incremented by one, with the oldest 500 `seenIds` trimmed when over 1000 entries (they're old enough to never reappear in bookmarks).

## Anti-criteria

- New bookmarks are never filtered by tweet `created_at`. The tweet's `created_at` is its *publication* time, not when the user *bookmarked* it — a month-old tweet bookmarked today is a brand-new bookmark. `seenIds` is the only correct dedup for "new bookmark." Filtering by `created_at` would silently drop newly-saved older tweets before they reach capture/audit. (Audit finding, 2026-06-11.)
- No new bookmark is left without a disposition, and when it is uncertain whether one is an idea it is created: a stray issue is one click to close, but a skipped idea is lost forever once its id enters `seenIds` and is never re-analyzed (2026-06-11).
- Nothing tagged ALREADY BUILT or IN PROGRESS appears in Recommendations; it is mentioned only in Discoveries as external validation.
- Issue capture never replaces the upgrade report; it is additive.
- No idea-issue is filed into a repo the user has not confirmed: on the first sweep (or after `bookmark_sweep.repo` changes) the agent names the repo and gets the user's yes before the first `create`.
- Issue provenance never comes from the human fetch output, which truncates text to 80 chars.

## Output format

**Output count:**
```
Fetched: N total bookmarks
Previously seen: N skipped
New bookmarks: N to analyze
```

**Report** a disposition table at the top of the report — `Idea-issues created: N` (with URLs), `Skipped: M`, and the audit result (`all disposed` or the failing ids). Already-issued bookmarks report their existing URL — note as "already captured," not new.

**Return format per bookmark:**
```json
{
  "tweet_id": "12345",
  "tweet_url": "https://x.com/user/status/12345",
  "author": "@username",
  "text": "full tweet text",
  "external_links": ["https://..."],
  "relevance": "HIGH",
  "techniques": [
    {
      "name": "Technique name",
      "source": "Twitter: @username — tweet text snippet",
      "exact_content": "Quoted code/config/approach from linked content",
      "target_component": "Which of the user's projects/files/components this improves",
      "implementation": "What to change there",
      "priority": "CRITICAL|HIGH|MEDIUM|LOW"
    }
  ]
}
```

Tags:
- **NEW** — No prior work found. Genuinely novel for the user's systems.
- **ALREADY BUILT** — The user already has this. Skip from recommendations entirely. Note in Discoveries as validation.
- **IN PROGRESS** — Active or recent work found. Skip from recommendations, note status.
- **EXTENDS** — The user has the base capability but this bookmark suggests a specific enhancement. Include in recommendations with context on what exists vs what's new.

```markdown
# X Bookmarks Upgrade Report
**Generated:** [timestamp]
**Bookmarks Fetched:** [N] total | [N] new | [N] skipped (seen)
**Idea-issues created:** [N] new issues | [N] already captured (with URLs)
**Analysis:** [N] HIGH relevance | [N] MEDIUM | [N] LOW (skipped)
**Prior Work Check:** [N] already built | [N] in progress | [N] new

---

## Discoveries

| # | Discovery | Source | Status | Why Interesting |
|---|-----------|--------|--------|-----------------|
| 1 | [name] | @user | NEW/ALREADY BUILT/EXTENDS | [why — if ALREADY BUILT, note what the user has] |

## Recommendations (NEW and EXTENDS only)

### CRITICAL — Integrate immediately
| # | Recommendation | Tag | What Exists | What's New | Effort |
|---|---------------|-----|-------------|------------|--------|

### HIGH — Integrate this week
...

### MEDIUM — When convenient
...

## Technique Details
[Full extraction per § Upgrade extraction — NEW and EXTENDS items only]
```

## Upgrade extraction

For each HIGH bookmark, read the tweet and every external link it carries, then list each concrete technique it offers:

- **name** — a short label for the technique.
- **source** — the author and the tweet snippet it came from.
- **exact_content** — the code, config, prompt or procedure quoted verbatim from the linked content; a paraphrase is not an extraction.
- **target_component** — the specific project, file or component of the user's (from the prior-work index) it would improve; "general improvement" is not a target.
- **implementation** — what to change there, concretely enough to start.
- **priority** — CRITICAL (fixes a known gap now), HIGH (this week), MEDIUM (when convenient), LOW (note only).

Tag every technique with its prior-work status before it can appear in Recommendations.

## Inputs

The state file, `$AGENT_SKILLS_HOME/x-twitter/bookmarks-state.json` (default `~/.agent-skills/x-twitter/`), carries:

- `lastPull` — ISO timestamp of last successful pull
- `seenIds` — Array of tweet IDs already processed
- `pullCount` — Running count of pulls

The install's sweep settings live in `$AGENT_SKILLS_HOME/x-twitter/` (default `~/.agent-skills/x-twitter/`):

- `PREFERENCES.md` § Relevance profile — the HIGH, MEDIUM and LOW criteria for this install. Without it, HIGH is anything that could improve the user's AI agent setup (agents, skills, hooks, prompting, evals, MCP, context handling), MEDIUM is general AI and software-architecture news, and LOW is everything else plus the user's own posts.
- `PREFERENCES.md` § What counts as an idea — the definition used for the create-or-skip call, and the `--property` values that map an idea to one of the user's properties. Without it, an idea is anything the user could act on, and `--property` is omitted.
- `PREFERENCES.md` § Prior work — the user's projects, systems and components, the base of the prior-work index. Without it, ask the user.
- `Config.md` `bookmark_sweep` — the repo idea-issues are filed in (`bookmark_sweep.repo`, required for `create`), the labels every idea-issue carries and the property label prefix (`Setup.md` § Fill in).

If the user says "quick bookmark check" or "just check bookmarks":
- Fetch only last 30 bookmarks
- Skip MEDIUM relevance items
- Abbreviated report (Discoveries + Recommendations only, no Technique Details)

## Safety gates

For each NEW bookmark, decide whether it is an actionable idea under `PREFERENCES.md` § What counts as an idea. When uncertain, create (§ Anti-criteria has the reason).

**Final gate.** After processing all new bookmarks, run the audit over every new bookmark id; finishing without it is how an undisposed idea gets lost. It exits nonzero and lists any bookmark you forgot to dispose — if it fails, go back and create-or-skip those before finishing:

```bash
bun Tools/bookmark-issue.ts audit --ids "<comma-separated list of ALL new bookmark ids this run>"
```

## Tool contract

**Parallel where possible, one writer always.** If your agent can run subagents, run the per-HIGH-bookmark analyses in parallel, each with the bookmark's full JSON, the prior-work index and § Upgrade extraction as its brief; otherwise run them one after another in this session. The dependent steps (fetch, filter, dispositions, audit, state update) stay in order, and the main session stays the only writer of the report and the state files.

**Pipeline:**
```
Tools/bookmarks.ts (fetch) → State filter (skip seen) → [Capture actionable ideas as issues] → upgrade analysis → State update
```

```bash
bun run Tools/bookmarks.ts fetch 50 --json
```

Use `--json` so you get each bookmark's FULL text and fields (the human output truncates text to 80 chars, which would weaken issue provenance). Parse the JSON array; each object has `id`, `text` (full), `author`, `author_name`, `created_at`, `url`, `urls`.

**Create** (it's an idea) — draft a one-line title and a 1–3 sentence body in the user's voice:

```bash
bun Tools/bookmark-issue.ts create \
  --id "<tweet_id>" \
  --title "<short idea title>" \
  --body "<1-3 sentence idea — what it is and why it's worth doing>" \
  --url "<tweet_url>" --author "<@author>" --text "<original tweet text>" \
  [--property <a value from PREFERENCES.md>]
```

Set `--property` only when the idea clearly maps to one; omit otherwise and let triage assign. The tool self-dedups by bookmark id (safe on re-runs), refuses when a configured label is missing from the repo (exit 3), and tags the issue with the `bookmark_sweep.labels` from `Config.md`.

**Skip** (genuinely not an idea — pure-interest reading, news with no action, humor, personal, the user's own tweets):

```bash
bun Tools/bookmark-issue.ts skip --id "<tweet_id>" --reason "<why — e.g. humor, no action>"
```

**Prior-work recall** for the index: if your agent keeps persistent memory, search it for the keywords of the HIGH bookmark topics over the last 60 days; otherwise use `PREFERENCES.md` § Prior work and the listed projects' own docs.

**Per-HIGH-bookmark agent sources.** Tweet content comes from `bun Tools/read.ts <tweet id or URL>`, which uses the official X API with the user’s own credentials, or from the user’s own exported data. When the API refuses a tweet (deleted, protected, rate-limited, or the plan does not cover it), that bookmark is recorded as unreadable with the reason and the sweep stops trying other routes for it; no scraping service is used. Never fetch an X URL as a web page. External links (articles, repos, blog posts) are read as raw page text (`fetch` or `curl`, body extracted in a `.ts` file) with an honest user agent, within the site’s terms; when a site blocks automated access, the bookmark is marked unreadable and the block is reported. Never use a web-fetch tool that returns a model’s summary of the page, which cannot supply the quoted `exact_content`.

Write updated state to `$AGENT_SKILLS_HOME/x-twitter/bookmarks-state.json` after successful processing:

```json
{
  "lastPull": "[current ISO timestamp]",
  "seenIds": ["[all previously seen + newly processed IDs]"],
  "pullCount": [previous + 1]
}
```

Per-id dispositions live in `$AGENT_SKILLS_HOME/x-twitter/bookmark-issues.json`, written only by `bookmark-issue.ts`.

## Gotchas

- **Token expiry** — Access tokens last ~2 hours. When `Config.md` names `token_store: cloudflare-kv`, an external process owns the refresh chain; an expired token means that process is down, so fix it rather than refreshing locally. If the grant itself is revoked, re-authorize: `bun run Tools/bookmarks.ts authorize`
- **API rate limit** — 180 requests per 15-min window for bookmarks endpoint
- **Max 100 per request** — Use pagination (next_token) for larger pulls
