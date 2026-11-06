---
name: bright-data
description: "4-tier page fetching that moves from plain curl to curl with declared headers to a real browser (the agent's browser tools) to Bright Data's managed fetch product, single URL or multi-page crawl, output as markdown, within each target site's terms. USE WHEN Bright Data, scrape URL, web scraping, crawl site, extract page content, scrape whole site, spider domain, convert URL to markdown, page needs rendering. NOT FOR simple public content (a plain page fetch), social data with named actors, logged-in browser sessions (the agent's browser tools directly), or multi-source investigation (use `research`)."
compatibility: "Requires bun 1.2+ and curl. Tier 3 uses the agent's own browser tools when it has them. Paid paths: the Bright Data MCP server registered in your agent (Tier 4), and BRIGHT_DATA_API_KEY plus BRIGHT_DATA_CRAWL_DATASET_ID for Full Crawl."
license: MIT (see LICENSE.txt)
---

# bright-data

Fetches a single URL (FourTierScrape) or crawls a whole site (Crawl), moving through four tiers only as far as each page needs, always within the target site's terms and robots.txt. A site that refuses automated access is reported, not worked around. Output is always markdown. A Cloudflare `Accept: text/markdown` pre-check runs before Tier 1 (recipe in FourTierScrape.md).

## Ideal State

- Every page comes back as clean markdown that matches its URL, labeled with the tier that actually retrieved it.
- Cost tracks need: free tiers are tried first, and paid Bright Data calls (Tier 4, whether for one URL or for the pages of a Light Crawl that need it, and Full Crawl) happen only when cheaper ones fail or the user confirms.
- A crawl returns a site map, the page contents and its stats, with failed pages named rather than silently missing.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| FourTierScrape | "scrape/fetch/pull/get/retrieve [URL]", "fetch this page as markdown", "this page needs rendering", "use Bright Data to fetch" | `Intents/FourTierScrape.md` |
| Crawl | "crawl this site", "spider this domain", "map this website", "get all pages from", "scrape the whole site", "crawl all pages under /docs" | `Intents/Crawl.md` |

### References

| File | Read when |
|------|-----------|
| `Setup.md` | first-time setup: the free tiers, the paid Bright Data pieces (MCP server, API key, crawl dataset id), and a proof |

## The four tiers (tool contract)

| Tier | Tool | Wins on | Cost / latency |
|------|------|---------|----------------|
| 1 | plain `curl -sL`, raw HTML converted to markdown locally | public content | free · ~1-3s |
| 2 | curl + declared user agent and Accept headers | servers that need content negotiation | free · ~3-7s |
| 3 | the agent's browser tools (a real browser, e.g. Playwright or Chrome automation), if available | JavaScript-rendered / SPA pages | free · ~10-20s |
| 4 | Bright Data MCP server, its `scrape_as_markdown` tool | managed rendering, region-specific fetches | Bright Data credits · ~5-15s |

Every tier returns the page itself. A page fetch tool that hands back a small model's summary of the page, not the page, is never a tier.

Skip-ahead: explicit "use Bright Data" → Tier 4; "use browser" → Tier 3; a domain that already failed Tier 1 for a non-refusal reason (empty body, timeout) → start at Tier 2. A CAPTCHA, block page or login wall at any tier ends the retrieval with a report. The exact curl header block, Cloudflare pre-check, and browser step live in `Intents/FourTierScrape.md`. Tool commands run from the skill folder (the folder holding this SKILL.md).

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/bright-data/PREFERENCES.md` (default `~/.agent-skills/bright-data/`) and override the defaults here; when absent, the defaults stand. First-time setup (accounts, keys, config, a proof it works) is in [Setup.md](Setup.md).

The paid paths need pieces this skill does not install. Tier 4 needs the Bright Data MCP server, which supplies the `scrape_as_markdown` and `scrape_batch` tools. Full Crawl needs `BRIGHT_DATA_API_KEY` and `BRIGHT_DATA_CRAWL_DATASET_ID` (the Crawl API dataset id from the Bright Data dashboard) in the environment, or in `$AGENT_SKILLS_HOME/.env` loaded into the shell. Before the first paid call, confirm the MCP tools are present in the session and that each key the call needs is set (the check in `Setup.md` § Prove it works prints `yes` or `no` per name, never a value). When a piece is missing, stop at the last free tier and tell the user which piece is not configured; never report a Tier 4 or Full Crawl result that did not run.

## Gotchas

- **Bright Data proxy has usage costs.** Don't use Tier 4 for sites accessible via Tier 1-3.
- **Tier 4 is slower than the free tiers.** Allow extra time for its responses.
- **Credentials belong in the environment or `$AGENT_SKILLS_HOME/.env`** — BRIGHT_DATA_API_KEY (the name `Intents/Crawl.md` commands read). The curl commands read the shell environment, so load the file first (`set -a; . "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/.env"; set +a`). Check as Data & Config says instead of assuming the paid tiers work.

## Examples

- "Fetch example.com/pricing as markdown" → FourTierScrape. The pre-check returns HTML, Tier 1 returns an empty body, and Tier 2's declared headers get the page, delivered as markdown labeled Tier 2. If Tier 1 had returned a block page instead, the reply would report the block and stop.
- "Crawl the docs under docs.example.com/api/" → Crawl, a Light Crawl scoped to `/api/`, depth 3, at the default limit of 20 pages, which needs no confirmation (more than 20 does). Each page climbs the tiers on its own, and any page that needed Tier 4 is named in the stats with its cost.
- "Use Bright Data to fetch this region-specific listing" → FourTierScrape, skipping to Tier 4. If the MCP server is not registered, the reply says so and offers the best free-tier result.
