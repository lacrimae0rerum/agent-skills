---
name: speaking
description: "Finds and tracks paid speaking opportunities that fit your own topics by scraping conference CFPs and speaker pages, ranks them by fit and urgency with deadlines, and drafts talk and panel proposals. USE WHEN speaking engagements, speaking opportunities, find speaking, conferences, keynote, CFP, paid speaking, where should I speak, propose talks, panel topics. NOT FOR media appearances, podcasts, or general PR."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ for Tools/CheckOpportunities.ts and web search/fetch access for FindOpportunities. No keys or env vars beyond optional AGENT_SKILLS_HOME."
---

# speaking

Discovers and tracks paid speaking opportunities that fit the topics you list in Config.md. FindOpportunities scrapes conference CFPs and monitors speaker pages, then updates the opportunities list; ShowOpportunities analyzes fit, prioritizes by urgency, and returns recommendations with CFP deadlines; ProposeTalks drafts talk and panel proposals to send an organizer. Paid speaking slots get filled months ahead and the good ones close their CFPs quietly; miss the deadline and the opportunity is gone for a year, so the skill watches the sources, keeps a running list, and flags what fits and what is about to close.

**Topics (the fit test for every intent):** the `## Topics` list in Config.md (§ Data & Config). An event listed under `## Excluded events` there is never tracked or recommended, whatever its fit.

**Urgency windows (every intent):** Immediate (urgent) means the CFP or submission closes within 14 days, or is rolling; High Priority means it closes in 15-30 days; Worth Watching means it closes later or the CFP is not open yet.

## Ideal State

- The tracked list holds only paid (or flagged very-high-prestige) opportunities that fit the Config.md topics, each with its CFP close date, pay tier and next action. Unpaid community meetups appear only when the user asks for them.
- Nothing closes unnoticed: deadlines inside the Immediate window surface as urgent, and past events move to the archive with their outcome instead of disappearing.
- Every recommendation is specific to its opportunity, carries its submission deadline, and carries a URL or contact to act on.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **FindOpportunities** | "find speaking opportunities", "update speaking list", "check speaking sources" | `Intents/FindOpportunities.md` |
| **ShowOpportunities** | "show me opportunities", "what speaking opportunities", "analyze speaking list", "where should I speak" | `Intents/ShowOpportunities.md` |
| **ProposeTalks** | "propose talks", "talk ideas for a conference", "panel topics", "what could I speak on" | `Intents/ProposeTalks.md` |

| File | Read when |
|------|-----------|
| `Setup.md` | first-time setup, what Config.md holds, adding your own sources, a scheduled deadline check, proving the skill works |
| `Sources.md` | the kinds of source to check (speaker pages, conferences, bureaus, CFP aggregators), what each yields, and how often; the actual sources are in Config.md |
| `Tools/CheckOpportunities.ts` | checking the opportunities list for entries missing a close date, a URL or contact, or a pay tier, and for past deadlines left outside Archive (`--json`, `--today YYYY-MM-DD`, optional list path; exit 0 clean, 1 findings, 2 unreadable) |
| `Patterns/` | `recommend_talkpanel_topics/system.md` is the system prompt ProposeTalks runs to turn the speaker's goals, positions and interests into talk or panel proposals for an organizer |

## Data & Config

First-time setup, the Config.md fields, accounts and a proof command: [Setup.md](Setup.md). The data folder is `$AGENT_SKILLS_HOME/speaking/` (default `~/.agent-skills/speaking/`). If Config.md is missing, stop and point the user at Setup.md; never guess topics, fees or sources.

- **Config:** `$AGENT_SKILLS_HOME/speaking/Config.md` holds `## Topics`, `## Fee range`, `## Excluded events`, `## Speaker record` (where goals, positions and credentials come from), `## Signature talking points`, `## Highest-yield source`, `## Speaker pages to monitor`, `## Conferences` (by pay tier, plus priority targets), `## Speaker bureaus` and `## Extra CFP aggregators`.
- **Opportunities list:** `$AGENT_SKILLS_HOME/speaking/Opportunities.md`, written by FindOpportunities and read by the other intents. Created on the first run when absent.
- **Preferences:** user preferences, when present, live in `$AGENT_SKILLS_HOME/speaking/PREFERENCES.md` (default `~/.agent-skills/speaking/`) and override the defaults here; when absent, the defaults stand.

## Setup

Install [Bun](https://bun.sh) 1.2+ for the list checker (no npm dependencies, no `bun install`). FindOpportunities needs the agent's web search and page fetch (or `curl`); the `research` skill, if installed, can do the lookups. No accounts or keys. Write Config.md before the first run: [Setup.md](Setup.md).

## Gotchas

- None recorded yet.

## Examples

```
User: "Find speaking opportunities"
→ FindOpportunities
→ The opportunities list gains the new finds, and the user gets what's new, what closes within two weeks, and what was archived
```

```
User: "Update the speaking list"
→ FindOpportunities
→ An incremental update since the last run: new opportunities added, expired ones archived with their outcome
```

```
User: "Show me opportunities"
→ ShowOpportunities
→ Opportunities bucketed by urgency and fit, each with its deadline, pay tier and one specific next step
```

```
User: "Propose some talks for Example Engineering Summit"
→ ProposeTalks
→ Three talk abstracts and three panel topics fitted to that event, ready to paste to the organizer
```
