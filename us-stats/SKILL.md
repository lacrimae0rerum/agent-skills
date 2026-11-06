---
name: us-stats
description: "Query the configured long-run US almanac (90+ annual series on economy, debt, cost of living, health, crime, family, trust, energy, many back to the 1940s: trends, verdicts, movers, correlations, freshness vs source datasets), and pull 66 current indicators from FRED, EIA and Treasury into the local US-Common-Metrics dataset for a 10y/5y/2y/1y read of the economy now. Use when the user asks about usstats, US stats, US indicators, long-run US trends, is X getting better or worse in America, US crime trend, wage trend, inflation history, correlate US indicators, compare decades, is the usstats data fresh, how is the economy, economic overview, economic metrics, economic trends, GDP, inflation, unemployment, gas prices, mortgage rates, FRED, US metrics, refresh data, refresh the economic data, refresh US-Common-Metrics. Not for pathogen surveillance, personal finances or investments, rebuilding or publishing the almanac site itself, refreshing our data sites (use `data-refresh`)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ and network access. Almanac side: USSTATS_DATA_URL or data_url in $AGENT_SKILLS_HOME/us-stats/config.md, no key. Live side: FRED_API_KEY (required), EIA_API_KEY (optional), optional USMETRICS_DATA_DIR; keys may live in $AGENT_SKILLS_HOME/.env."
---

# us-stats

**Contents:** Ideal State · Intent Routing · Data Contract · Setup · Data & Config · Quick Reference · Gotchas · Examples

Query and analyze the annual US indicator dataset at the almanac endpoint named by `data_url` in the user's config (`$AGENT_SKILLS_HOME/us-stats/config.md`, format in `Setup.md`) — read-only, keyless, no local repo dependencies. Every series carries publisher provenance (`source`, `sourceUrl`, `note`) and a `goodDirection` flag that lets the tool answer "better or worse?" deterministically.

It also reads the current US economy straight from the government APIs (ported from the retired USMetrics skill, 2026-10-10). The one count and source list for that side, read from the updater's `METRICS` config in `Tools/UpdateSubstrateMetrics.ts` on 2026-10-11: UpdateData fetches 66 indicators in 9 categories (Economic Output, Inflation, Employment, Housing, Consumer, Financial, Trade, Fiscal, Demographics) through three APIs, FRED (64 series, carrying BLS, BEA, Census, Fed and Treasury data), EIA (gas price) and Treasury FiscalData (total public debt), into the local US-Common-Metrics dataset (`US-Common-Metrics.md`, `us-metrics-current.csv`, `us-metrics-historical.csv`). The master document lists 68 metrics in 10 categories; its Health & Crisis rows (CDC WONDER, EPA AQS) have no fetcher and stay placeholders, and a master row the updater did not fetch is named, never silently counted. GetCurrentState produces a multi-timeframe (10y/5y/2y/1y) trend report with cross-metric analysis, pattern detection, and research recommendations from its own FRED and EIA fetch, so it does not depend on an UpdateData run. The almanac answers "over decades, annually"; the live side answers "right now, monthly and weekly".

## Ideal State

- Every answer about a US indicator rests on this session's tool output from the live dataset, names the publisher of each quoted series, and judges better or worse only through `goodDirection`.
- Year-to-date values, methodology breaks in `note`, base effects behind large percentage moves and the correlation-is-not-causation caveat reach the reader whenever they touch the numbers quoted.
- A freshness question gets a per-upstream fresh or stale verdict from a `--fresh` run, and nothing in the skill ever writes to the site or its upstream datasets.
- Every live-economy number reported is current and carries its period and source, whether it came from GetCurrentState's own FRED and EIA fetch or from the dataset UpdateData refreshed, and preliminary or stale figures are labelled as such, never presented as final.
- A "how is the economy" answer covers the report's eight categories across the four timeframes, names the categories it does not cover (Demographics, Health & Crisis), and ends with what deserves a closer look, without claiming that one metric caused another.
- A failed source or missing key degrades the result visibly (the affected metrics named) instead of aborting it or hiding the gap.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **Analyze** | "US trend", "better or worse", "movers", "correlate", any indicator question | `Intents/Analyze.md` |
| **SyncCheck** | "is the data fresh", "synced with the source datasets" | `Intents/SyncCheck.md` |
| **UpdateData** | "Update metrics", "refresh data", "pull latest", "refresh the US metrics": fetch live data from APIs and update the local US-Common-Metrics dataset | `Intents/UpdateData.md` |
| **GetCurrentState** | "How is the economy?", "economic overview", "get current state", "US metrics analysis", "economic metrics", "GDP", "inflation", "unemployment", "gas prices", "economic trends": multi-timeframe trend overview from live government data | `Intents/GetCurrentState.md` |

### References

| File | Read when |
|------|-----------|
| `Setup.md` | first-time setup: the config file format, FRED and EIA keys, and seeding the US-Common-Metrics dataset folder |

## Data Contract

- Endpoint: `data_url` in `$AGENT_SKILLS_HOME/us-stats/config.md` (default `~/.agent-skills/us-stats/config.md`; `$USSTATS_CONFIG` names another file), or env `USSTATS_DATA_URL` (`Tools/UsStatsConfig.ts`; the tool stops naming the file and key when neither is set). CSV siblings are listed in `_meta.siblings`.
- License: public-domain government and published survey data; cite the publisher in each series' `source` field
- Schema: `series[key] = { name, category, unit, coverage, goodDirection, partialYear, partialThrough, source, sourceUrl, historicalSourceUrls[], note, data{year: value} }`

## Setup

Requires bun 1.2+. First-time setup (config file, accounts, keys, files to fill in): [Setup.md](Setup.md). In short:

1. Create `$AGENT_SKILLS_HOME/us-stats/config.md` (default `~/.agent-skills/us-stats/config.md`) with at least `data_url: <almanac JSON endpoint>`, or export `USSTATS_DATA_URL`.
2. For the live side, set `FRED_API_KEY` (and optionally `EIA_API_KEY`) in the environment or in `$AGENT_SKILLS_HOME/.env`.
3. Seed the dataset folder before the first UpdateData run (`Setup.md` § Dataset folder).

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/us-stats/PREFERENCES.md` (default `~/.agent-skills/us-stats/`) and override the defaults here; when absent, the defaults stand.

The config file `$AGENT_SKILLS_HOME/us-stats/config.md` holds one `key: value` per line: `data_url` (almanac endpoint), `site_name`, `data_dir` (dataset folder), `seed_source`, `seed_checkout_hint`, `reports_dir` (where GetCurrentState saves reports). Every key, its default and an example: `Setup.md` § Install config.

The live dataset:
- **Location:** `$USMETRICS_DATA_DIR` if set, else `data_dir` from the config, otherwise `$AGENT_SKILLS_HOME/us-stats/US-Common-Metrics/` (`Tools/UsStatsConfig.ts`)
- **Master Document:** `US-Common-Metrics.md` (counts and fetched sources in the purpose paragraph above)
- **Source Documentation:** `source.md` (full methodology)
- **Underlying APIs:** FRED, EIA and Treasury FiscalData are fetched; the master document's CDC and EPA rows are not
- **Seeding:** the directory starts empty; copy the four files from the seed named by `seed_source` in `$AGENT_SKILLS_HOME/us-stats/config.md` before the first UpdateData run (the tool refuses an unseeded directory with that instruction).
- **Why local:** the skill keeps its own dataset so it never depends on another system's storage; notes on any other copy of the same pull can live as extra lines in `$AGENT_SKILLS_HOME/us-stats/config.md`.

### Metric Categories Covered

The master document's ten categories; the updater fetches the first nine.

1. **Economic Output & Growth** - GDP, industrial production, retail sales
2. **Inflation & Prices** - CPI, PCE, gas prices, oil prices
3. **Employment & Labor** - Unemployment, payrolls, jobless claims, quit rate
4. **Housing** - Home prices, mortgage rates, housing starts
5. **Consumer & Personal Finance** - Sentiment, saving rate, credit
6. **Financial Markets** - Interest rates, Treasury yields, volatility
7. **Trade & International** - Trade balance, USD index
8. **Government & Fiscal** - Federal debt, budget deficit, spending
9. **Demographics & Social** - Population, inequality, poverty
10. **Health & Crisis** - Deaths of despair, air quality, life expectancy

### API Keys Required

For live data fetching (environment variables, or lines in `$AGENT_SKILLS_HOME/.env`; real env vars win):
- `FRED_API_KEY` - Federal Reserve Economic Data
- `EIA_API_KEY` - Energy Information Administration

### Tools

| Tool | Purpose |
|------|---------|
| `Tools/UsStats.ts` | Query the configured long-run almanac (Analyze, SyncCheck) |
| `Tools/UpdateSubstrateMetrics.ts` | **Primary** live tool - Fetch all metrics, update the local dataset files |
| `Tools/UsStatsConfig.ts` | Read the user config (`data_url`, `site_name`, `data_dir`, `seed_source`) and resolve the dataset and cache folders |
| `Tools/FetchFredSeries.ts` | Fetch historical data from FRED API |
| `Tools/GenerateAnalysis.ts` | Generate the analysis report from its own FRED and EIA fetch (reads no local file) |

## Quick Reference

Run from the skill folder:

```bash
bun Tools/UsStats.ts summary            # dataset shape
bun Tools/UsStats.ts search crime       # find series keys
bun Tools/UsStats.ts trend income       # direction-aware verdict
bun Tools/UsStats.ts movers --window 20 # biggest changes
bun Tools/UsStats.ts correlate debt gdpGrowth
bun Tools/UsStats.ts sync-check --fresh # vs upstream source of record
```

All commands take `--json` (machine output) and `--fresh` (bypass the 6h cache).

## Gotchas

- **Partial years are YTD, not annual.** A series' `partialYear` value (e.g. a July year-to-date figure) is excluded from all math and flagged `← YTD` in output.
- **Percentage change is base-sensitive.** Movers rank by percent change; a series moving off a tiny base (CPI inflation 0.1 → 2.8) posts a huge percentage. Sanity-check the absolute values shown next to the rank before quoting a headline number.
- **Read `note` before comparing across years.** Several series have methodology breaks (survey redesigns, definition changes) disclosed in `note`; a naive 1970-vs-today comparison can cross one.
- **Correlation is not causation.** `correlate` prints the warning and the live report's cross-metric patterns are suggestive only; keep the caveat in any analysis you hand over and never claim one metric caused another.
- **Each of the three fetched APIs (FRED, EIA, Treasury FiscalData) has its own rate limits and data freshness**; the series FRED carries keep their originating agency's release lag.
- **Economic data has publication lag.** GDP is quarterly with revisions. Jobs data is monthly. Don't present preliminary data as final.
- **A seed dataset can carry corrupted rows** from an old string-replacer bug (dollar-led values read as `$2` group patterns). `UpdateSubstrateMetrics.ts` now repairs widened rows and uses function replacers.
- **Cache lives in the skill's data folder** (`$AGENT_SKILLS_HOME/us-stats/cache/`, created owner-only), never in the skill tree. Deleting it is always safe.

## Examples

**Example 1: "Is crime getting better or worse?"**
```
User: "What's the long-run crime trend in the US?"
→ Analyze intent (search crime, then trend on each hit: violentCrime, propertyCrime, …)
→ Direction-aware verdicts with sources, YTD caveats surfaced
```

**Example 2: "What's improved most in the last 20 years?"**
```
User: "Biggest US improvements since 2005?"
→ Analyze intent (movers --window 20)
→ Improving/worsening lists, direction-aware, absolute values alongside
```

**Example 3: Full analysis of the current economy**
```
User: "How is the US economy doing? Give me a full analysis."
→ GetCurrentState intent (GenerateAnalysis.ts fetches its own history; no UpdateData run needed)
→ The US Economic State Analysis report GenerateAnalysis.ts writes (Intents/GetCurrentState.md § Output format), saved to the report location (Intents/GetCurrentState.md § Output Location)
```

**Example 4: Refresh only**
```
User: "Pull the latest economic data"
→ UpdateData intent
→ The three dataset files refreshed, with any failed fetch or skipped source named
```

**Example 5: "Does household debt track income?"**
```
User: "Correlate median income with revolving debt"
→ Analyze intent (correlate income debt)
→ Pearson r, N, overlap window, causation caveat
```
