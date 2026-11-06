---
name: research
description: "Multi-vendor web research with verified URLs and confidence-tagged output at four depths (Quick, Standard, Extensive, Deep Investigation). USE WHEN research, do research, quick research, extensive research, deep investigation, find information, investigate, extract alpha, analyze content, retrieve content, AI trends, enhance content, extract knowledge, web scraping, YouTube extraction, map landscape, competitive analysis, find it, find this, find this product, identify this, what is this, what's that thing, track down, locate, help me find, I can't find X online, can't find it online, source this, best X in a place, what's good in <city>, trip or itinerary planning, things to do, is X open, hours, where is X, venue or resort policies — never substitute one raw web search or page fetch for a find/identify/investigate/look-up request. NOT FOR entity background, papers (use `arxiv`), JSON entity extraction, wisdom extraction (use `extract-wisdom`), raw page fetching or crawling (use `bright-data`)."
compatibility: "Tools need bun 1.2+. Optional vendors: PERPLEXITY_API_KEY, GOOGLE_API_KEY, XAI_API_KEY, the codex CLI. Optional community sources: X_BEARER_TOKEN, YOUTUBE_API_KEY, the fabric CLI. With none of them, the agent's own web search runs every tier. Keys load from the environment or $AGENT_SKILLS_HOME/.env."
license: MIT (see LICENSE.txt)
---

# Research

**Contents:** Ideal State · Intent Routing · Tool contract · Vendor roster · Output format · Data & Config · Gotchas · References

Researches a topic across multiple sources and verifies every claim before delivery. Four depth modes scale from a single fast lookup to a multi-session investigation: Quick (1 Perplexity call, ~10-15s), Standard (four vendors cross-checked as parallel tool calls in the session, ~30-60s), Extensive (7 explorers + 2 independent verifiers, ~60-90s), and Deep Investigation (progressive iteration with a persistent vault, ~3-60min). Output is confidence-tagged: [HIGH] [MED] [LOW] [CONFLICT].

A lone research agent fails in two quiet ways. It hallucinates URLs, confident links that go nowhere and cost the whole report its trust. And it answers from one angle, parroting the first few search results and missing conflicts, gaps, and what real people thought; asked "what did fans think of X", it hands back promoter copy dressed as consensus. This skill runs several vendors in parallel (as tool calls at Quick and Standard, as researcher subagents at Extensive and Deep, or as sequential passes when the agent cannot run subagents), cross-checks and independently verifies their findings, checks every URL before it ships, and routes sentiment questions to community sources first.

**Vendor diversity scales with effort.** Quick is one vendor, Standard four, Extensive and Deep all five. Each vendor's model comes from a different training distribution, so the more a question is worth, the more independent distributions check it.

## Ideal State

- Every URL in a delivered answer was fetched and its page supports the claim it is cited for; a link that could not be verified was dropped, never shipped.
- The depth matches the ask: "research" alone ran Standard, Quick ran only on an explicit quick request or an everyday look-up, and each tier's vendor roster was complete (a higher tier never drops a vendor a lower tier uses), or the answer says which slot was swapped and why.
- Findings carry `[HIGH]` `[MED]` `[LOW]` `[CONFLICT]` tags from cross-checking, and a disagreement between sources is shown with both sides rather than averaged away.
- A sentiment or lived-experience answer rests on the communities first (each platform's official API, then a licensed data product only where the platform has no API, then web search for context), quotes people verbatim with their thread URLs, and carries the disappointments alongside the praise.
- A claim that a venue exists, is open, keeps certain hours, or books a certain way matches the official page of the venue or its host property.
- A request this skill should not own left it: entity background to an OSINT skill, papers to `arxiv`, an X URL through the X-URL gate with the path taken named in the answer.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **QuickResearch** | "quick research", "minor research", everyday look-ups (venue, hours, travel, best-of); 1 Perplexity call, 1 query, no agent | `Intents/QuickResearch.md` |
| **StandardResearch** | "research", "do research", "research this": the DEFAULT; Claude (the agent's own web search) + Gemini + Perplexity + OpenAI/Codex cross-checked as parallel tool calls in the session, no subagents; + Grok when X is a plausible source | `Intents/StandardResearch.md` |
| **ExtensiveResearch** | "extensive research", "deep research", "comprehensive research"; all five vendors, 7 explorers + 2 verifiers, + a community slot on lived-experience questions | `Intents/ExtensiveResearch.md` |
| **DeepInvestigation** | "deep investigation", "investigate [topic]", "map the [X] landscape"; progressive deepening into a persistent vault, loop-compatible | `Intents/DeepInvestigation.md` |
| **Verify** | Verify research findings / cross-check claims / confidence scoring | `Intents/Verify.md` |
| **ExtractAlpha** | Extract alpha / deep analysis / highest-alpha insights | `Intents/ExtractAlpha.md` |
| **Retrieve** | Difficulty accessing content (JavaScript-rendered pages, multi-page pulls, a site that refuses automated access) | `Intents/Retrieve.md` |
| **YoutubeExtraction** | YouTube URL extraction (use `fabric -y URL` immediately) | `Intents/YoutubeExtraction.md` |
| **WebScraping** | Web scraping | `Intents/WebScraping.md` |
| **ClaudeResearch** | The agent's own web search only (free, no API keys) | `Intents/ClaudeResearch.md` |
| **InterviewResearch** | Interview preparation (surprise-maximizing questions, style from PREFERENCES.md) | `Intents/InterviewResearch.md` |
| **AnalyzeAiTrends** | AI trends analysis | `Intents/AnalyzeAiTrends.md` |
| **Fabric** | Use Fabric patterns (242+ specialized prompts); "enhance content" or "improve this" runs `improve_writing` here | `Intents/Fabric.md` |
| **ExtractKnowledge** | Extract knowledge from content | `Intents/ExtractKnowledge.md` |

| File | Read when |
|------|-----------|
| `SourceRoutingProtocol.md` | Step 0 of every research intent: the sentiment, technical and discourse signals, the per-platform API → vendor data product (no-API platforms only) → web-search cascade, and the sentiment-mode output shape |
| `UrlVerificationProtocol.md` | before delivering any URL: the one verifier, `Tools/VerifyUrls.ts`, which checks each URL's body for the key phrase its citation rests on |
| `QuickReference.md` | comparing modes: roster, speed, and the verification each mode adds |
| `Setup.md` | first-time setup: the vendor accounts and keys each depth uses, the optional community sources, and a read-only check |
| `References/Examples.md` | unsure which intent a request lands on (worked examples) |
| `Templates/` | DeepInvestigation domain packs: `Templates/MarketResearch.md` (Companies, Products, People, Technologies, Trends, Investors) and `Templates/ThreatLandscape.md` (Threat Actors, Campaigns, TTPs, Vulnerabilities, Tools, Defenders); with no match the intent builds entity categories from the landscape research |

## Tool contract

Verification runs in three layers, inspired by Nomad (arXiv:2603.29353). `Intents/Verify.md` holds the full protocol.

| Layer | What | Where |
|-------|------|-------|
| **Self-Verification** | Each researcher subagent or pass drops URLs it cannot reach and tags confidence before returning; this is a pre-filter, never the verification of record, and every delivered URL still passes `Tools/VerifyUrls.ts` (`UrlVerificationProtocol.md`) | Extensive, Deep (Quick and Standard run no agents) |
| **Cross-Check** | Synthesis step detects conflicts and cross-references findings | Standard, Extensive, Deep |
| **Independent Verification** | Dedicated verifier subagents (or passes run before the explorers) with no access to explorer reasoning | Extensive, Deep only |

Commands in this skill run from the skill folder (the folder holding this SKILL.md); from anywhere else, prefix `Tools/` with that folder's path.

## Vendor roster

Each vendor is a separate account. A vendor runs when its key or command-line tool is present; a missing one narrows the roster instead of stopping the run, its slot goes to the agent's own web search, and the answer names the swap. The agent's own web search and page fetch are the baseline that is always there.

| Slot | How it searches | Needs |
|------|-----------------|-------|
| **Claude** (native) | the agent's own web search and page fetch; when the agent runs on another model, this slot is that model and the answer says so | nothing |
| **Gemini** | `bun Tools/GeminiSearch.ts` (Google Search grounding) | `GOOGLE_API_KEY` |
| **Perplexity** | `bun Tools/PerplexitySearch.ts` (live web with citations) | `PERPLEXITY_API_KEY` |
| **OpenAI/Codex** | `codex exec --sandbox read-only -c tools.web_search=true` (live web search) | the `codex` CLI, logged in |
| **Grok** | `bun Tools/GrokQuery.ts` (what is being said on X); public material only | `XAI_API_KEY` |

The exact command for each slot, with the safe query quoting, is in `Intents/StandardResearch.md` § Tool contract.

**Researcher subagents.** Extensive and Deep run several researchers at once. If your agent can run subagents, launch them in parallel in one message, each with its brief, and tell each one which slot's command it runs and the skill folder's path (the tools live there). Otherwise run them one after another in this session, one pass per brief: run the verifier passes first, before any explorer pass, so their findings cannot lean on explorer results, and say in the answer that the run was sequential. The vendor slots are plain commands, so without subagents they can still run as parallel shell calls. Every researcher brief ends the same way: tag each finding `[HIGH]`, `[MED]` or `[LOW]`, check its own URLs with `bun Tools/VerifyUrls.ts` on a `url|key phrase` pairs file before returning, and return findings with their URLs.

## Output format

- Findings carry `[HIGH]` `[MED]` `[LOW]` `[CONFLICT]` tags; sentiment-routed answers use the tier-of-agreement shape in `SourceRoutingProtocol.md` § Output Format When Sentiment-Routed.
- Working files (temporary work artifacts) go in a work folder for the task, `$AGENT_SKILLS_HOME/research/work/<slug>/` (default `~/.agent-skills/research/work/`; `<slug>` is `$(date +%Y%m%d)-<kebab-topic>`), created with `mkdir -p` before anything is written, so files never land in the current directory.
- Research artifacts (permanent) go in `$AGENT_SKILLS_HOME/research/history/YYYY-MM/YYYY-MM-DD_[topic]/` (default `~/.agent-skills/research/history/`), or in a folder the user names, such as one in their project.

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/research/PREFERENCES.md` (default `~/.agent-skills/research/`) and override the defaults here; when absent, the defaults stand.

First-time setup (vendor accounts, keys, the `codex` tool) is in [Setup.md](Setup.md).

## Gotchas

- **X/Twitter-URL gate, checked before anything else.** Scan the prompt for `x\.com|twitter\.com` (e.g. `rg -q 'x\.com|twitter\.com'` on the request text) before launching any researchers. X blocks page fetch tools and generic scraping, so generic research agents pointed at the URL burn turns and return nothing. When the gate fires, take the first path below that is actually available, and say in the response which path you took and why; a silent skip is a failure:
  1. The `x-twitter` skill, or another X/Twitter reader skill, if one is installed — it is the highest-fidelity path.
  2. `X_BEARER_TOKEN` in the environment → read the post via X API v2 directly.
  3. The user's own exported X data, if provided.
  4. None of the above → tell the user plainly that X does not allow automated reads here and ask them to paste the post text. Then research the *substance* normally.
  Research the rest of the request either way: one unreadable X URL never cancels the whole task.
- **Recap journalism is not fan sentiment.** Press articles invent consensus, fabricate timestamps, and parrot promoter copy, so on a community-sentiment question X goes through the X-URL gate ladder above and recap web search stays the *secondary* source. Quick mode can return recap-only and miss the actual fan data; pull Reddit directly rather than waiting to be asked again.
- **API first, a licensed data product second where there is no API, web search last; never invert.** For every platform, try the official API path (Reddit JSON, X API v2 if `X_BEARER_TOKEN` is set, YouTube Data API v3 if `YOUTUBE_API_KEY` is set) before a vendor data product (the `bright-data` skill, or a data-product skill the install carries). A vendor product is the fallback for platforms with no API, within each platform's terms; for Reddit and X, when the API path is unavailable or rate-limited, the run reports it rather than switching routes. A vendor product also covers data shapes the API does not expose (YouTube transcripts use `fabric -y` even when the Data API key is set). The cascade inversion is the recurring failure mode. `SourceRoutingProtocol.md` § Cascade Priority has the per-platform table.
- **A refused page is reported, not worked around (2026-10-12, revised).** A 403, a bot wall, a CAPTCHA or a login wall on a cited source means the site does not allow automated access. The run tags that finding unverified, names the URL and the reason in the response, and looks for the same fact in another source, the site's official API, or a copy the user can open. A page that only fails because it renders client-side is read in a real browser with the agent's browser tools (e.g. a Playwright or Chrome automation tool), if available. Paid vendor products (Bright Data, Apify actors) need the user's yes first, except a single cheap call, and are used within the target site's terms.
- **Everyday look-ups are research too, and route to Quick (2026-09-30).** Some questions never say "research": "best <thing> in <place>", "a plan for our trip", "can non-guests use <venue>'s facilities", "where is this venue". Sent to one raw web search, single-summary answers put wrong claims in a plan that a Quick run caught (closed days, departed staff, changed booking channels). Unless the user asks for depth, treat a travel, venue, or best-of question as Quick mode.
- **For "does it exist / is it open", the venue's own page wins (2026-09-30).** A single search answer can deny a venue that its host property's own page lists. When a claim is about whether a venue exists, its hours, or how to book, check the official site of the venue or its host property before stating it.
- **An Extensive run with only Anthropic, Google and Perplexity researchers is a failed roster (2026-09-26).** A run left OpenAI and Grok out because both were gated on narrow technical/discourse signals. Every vendor whose key or tool is present runs at the top tier. Grok's brief stays public-only; when the question carries private or restricted data (personal, customer, financial or private-file content), its slot becomes a Claude slot and the response says so.
- **Due diligence, background checks and people lookup go to a dedicated OSINT/entity-investigation skill, not Research.** Research handles general investigation; entity-specific deep investigation belongs to that skill.
- **"extract alpha" routes to the ExtractAlpha intent, not the `extract-wisdom` skill.** They are different things.

## References

- Optional skills this one uses when installed: `be-creative` (deep thinking for extract alpha), `bright-data` (single-URL fetches, crawls and search results through the vendor's documented products), `fabric` (pattern catalog), `x-twitter` (reading X posts).
- **Official anchor (drift check):** this skill's orchestrator-worker shape matches Anthropic's published architecture, [How we built our multi-agent research system](https://www.anthropic.com/engineering/built-multi-agent-research-system) (2025-06-13). When changing the orchestration itself (rosters, verifier layers; not on routine research runs), re-fetch that post and compare: it names lessons this skill may not have adopted yet (e.g. async agent coordination). Advisory only: report divergence, never auto-adopt; an unreachable URL never blocks anything.
