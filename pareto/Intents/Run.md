# Run

Take one topic from "what's out there" to one report: what people used to think, what the mainstream thinks now, and where the people ahead of the curve are heading.

## Ideal State

- A report at `~/Downloads/pareto-<topic-slug>-<YYYY-MM-DD>.md` in the shape below, plus a console summary of five lines or fewer: the shift in one sentence, the two or three forward thinkers worth following, and any source that failed.
- The frontier section names people or projects, links to them, and draws mostly on items that are not the biggest by reach. A frontier section that restates the most-viewed videos is a failed run even if `Check.ts` passes.
- `$RUN/collection.json`, `$RUN/research-collection.json` (built from the `research` skill handoff's cited sources) and `$RUN/ranked.json` exist before the report is written, and the report is synthesized from `ranked.json`.
- `Check.ts` exits 0 against the report.

## Anti-criteria

- A report that failed `Check.ts` twice is never silently shipped: the second failure is reported to the user with the failure list.
- The synthesis, interpreting what a body of work means, never runs on a fast, light model.
- No URL in the report that did not come from the collected data, and no link to a cracked-software lure repo.

## Inputs

A bare topic is enough. If the topic has two readings that would produce different sweeps (for example "rust", the language or the corrosion), pick the likelier one from the conversation and say so in one `⚠️` line. Ask only when there is no reasonable default.

## Tool contract

Run the commands from the skill folder. Work in a run directory: `RUN="${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/pareto/runs/<topic-slug>-$(date +%Y-%m-%d)"`, then `mkdir -p "$RUN"`.

**Wide sweep:**

```bash
bun Tools/Collect.ts "<topic>" [FLAGS] --out "$RUN/collection.json"
```

**Research handoff.** In parallel with the sweep, use the `research` skill in Quick mode if it is installed (otherwise a few targeted web searches of your own) on: *who is ahead of the mainstream on <topic>, and what are they arguing that most people are not yet saying?* Save every cited source as a JSON array of `{url, title, description, author, published_at}` to `$RUN/research.json`, then:

```bash
bun Tools/Collect.ts "<topic>" --sources extra --extra "$RUN/research.json" --out "$RUN/research-collection.json"
```

**Rank to the vital few:**

```bash
bun Tools/Rank.ts "$RUN/collection.json" "$RUN/research-collection.json" --top 100 --out "$RUN/ranked.json"
```

**Synthesis — the most capable model available.** If your agent can run subagents, hand the synthesis to one running the most capable model available at its highest reasoning effort; otherwise do it in this session on that model. Give it the topic, the path to `ranked.json`, the output format below, and this goal: read the ranked set, read the full text of the items that carry the argument (YouTube transcripts via the Gemini watch pass on the public URL, `bun Tools/GeminiWatch.ts <url> --out "$RUN/<id>.txt"`; without `GOOGLE_API_KEY`, the video is named in the report as unread; pages via a raw fetch, `curl -sL <url>` with the body text extracted in a `.ts` file; a page or video that refuses automated access is named in the report as unread and never fetched another way; never a page fetch tool that returns a small model's summary instead of the page), and write the report to `$REPORT` (`~/Downloads/pareto-<topic-slug>-<YYYY-MM-DD>.md`).

**Verify:**

```bash
bun Tools/Check.ts "$REPORT" "$RUN/ranked.json" --collection "$RUN/collection.json"
```

On failure, send the failures back to the same synthesis subagent (or pass) once.

### Intent-to-flag mapping

| The user says | Flag | Effect |
|---|---|---|
| (default) | `--per-source 100` | about 100 candidates per source before ranking |
| "quick", "just a glance" | `--per-source 40` then `Rank.ts --top 40` | smaller sweep, cheaper YouTube quota |
| "go wide", "exhaustive" | `--per-source 200` then `Rank.ts --top 150` | more candidates, more synthesis reading |
| "only YouTube", "skip the web", etc. | `--sources youtube,github` | restrict collectors (`youtube,github,web`) |

## Output format

```markdown
# Pareto: <topic>

_<date> · <kept>/<considered> items · sources: youtube N, github N, web N, research N · failed: <none | names>_

**The shift:** <one sentence: from X, to Y, heading toward Z>

## Past meta (<years>)
<2–4 short paragraphs. Every claim dated and linked to a source from the ranked set.>

## Current mainstream meta (<years>)
<Same rules. This is what most of the high-reach content says.>

## Where the forward thinkers are heading
<The core of the report. Each thread names a person or project, says what they argue and why it breaks from the mainstream, and links at least one source. At least two links in the section.>

## Who to follow
| Who | Where | Why they are early |

## The vital few
| # | Title | Source | Author | Reach | Date | Era |
<Top 20 from ranked.json. The full list stays in ranked.json.>
```
