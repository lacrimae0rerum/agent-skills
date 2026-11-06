# us-stats setup

Status: `test -n "$FRED_API_KEY" || grep -q '^FRED_API_KEY=' "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/.env"; test -f "${USMETRICS_DATA_DIR:-${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/us-stats/US-Common-Metrics}/US-Common-Metrics.md" && echo ok` · optional

## What it does

The us-stats skill answers two kinds of question about the United States. The long-run almanac side ("is crime getting better or worse over decades?") reads a public JSON almanac whose address you set once as `data_url` (see Fill in). The live-economy side pulls about 66 current indicators from the Federal Reserve's FRED service, the EIA (gas price) and Treasury FiscalData (federal debt) into a local dataset, and builds the 10, 5, 2 and 1 year trend report. That second side needs one key and a one-time seeding of the dataset folder.

Requires bun 1.2+. All tool commands below run from the skill folder.

## Fill in

### Install config

`$AGENT_SKILLS_HOME/us-stats/config.md` (default `~/.agent-skills/us-stats/config.md`; set `USSTATS_CONFIG` to keep it elsewhere). Create it by hand; nothing installs a starter. One `key: value` per line (lowercase key, colon, value); lines that do not match are ignored, so free notes may sit beside the keys, and the first occurrence of a key wins:

| Key | Required | Default | Meaning |
|---|---|---|---|
| `data_url` | yes, for Analyze and SyncCheck | none (tools stop and name this file) | the almanac JSON endpoint, schema in SKILL.md § Data Contract; env `USSTATS_DATA_URL` overrides it |
| `site_name` | no | `configured` | name shown in the CLI help |
| `data_dir` | no | `$AGENT_SKILLS_HOME/us-stats/US-Common-Metrics` | the US-Common-Metrics dataset folder; `~` is expanded; env `USMETRICS_DATA_DIR` overrides it |
| `seed_source` | no | generic hint | where the seed files below come from, printed when the dataset is unseeded |
| `seed_checkout_hint` | no | generic hint | the checkout path hint printed beside it |
| `reports_dir` | no | `$AGENT_SKILLS_HOME/us-stats/reports` | where the agent saves GetCurrentState reports (read by the agent, not the tools) |

Example:

```
data_url: https://example.org/data/us-stats.json
site_name: Example US Almanac
data_dir: ~/Projects/example-metrics/Data/US-Common-Metrics
seed_source: https://github.com/example/us-common-metrics
seed_checkout_hint: ~/Projects/example-metrics/Data/US-Common-Metrics
reports_dir: ~/Documents/research
```

The almanac download is cached in `$AGENT_SKILLS_HOME/us-stats/cache/` (owner-only, 6h); deleting it is always safe.

### Dataset folder

One folder of three files, plus one methodology note. By default it is `$AGENT_SKILLS_HOME/us-stats/US-Common-Metrics/` (`~/.agent-skills/us-stats/US-Common-Metrics/` when `AGENT_SKILLS_HOME` is unset); set `data_dir` in the config, or `USMETRICS_DATA_DIR`, to use another folder.

```bash
mkdir -p "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/us-stats/US-Common-Metrics"
# copy these from the seed named by seed_source in your config.md:
#   US-Common-Metrics.md  us-metrics-current.csv  us-metrics-historical.csv  source.md
```

The updater rewrites `US-Common-Metrics.md` in place and never invents it. A folder without that file stops with "dataset not seeded" before any fetch. If you keep a checkout of the seed dataset, you can skip the copy and point at it instead (or set `data_dir` to the same path):

```bash
export USMETRICS_DATA_DIR=~/Projects/example-metrics/Data/US-Common-Metrics
```

| File | Role |
|---|---|
| `US-Common-Metrics.md` | The master document. Required before the first update. |
| `us-metrics-current.csv` | Overwritten on each update with the latest snapshot. |
| `us-metrics-historical.csv` | Appended to on each update; created with its header if missing. |
| `source.md` | Methodology. Not read by the updater. |

## Accounts and secrets

Export these in your shell, or add them as `KEY=value` lines to `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`; variables already set in the environment win):

- `FRED_API_KEY` (required for the live side): a key from the FRED API key page at https://fred.stlouisfed.org/docs/api/api_key.html. FRED carries 64 of the 66 fetched indicators.
- `EIA_API_KEY` (optional): a key from the U.S. Energy Information Administration's open-data service. Without it the gas price is skipped with a warning and everything else still updates.

Treasury FiscalData and the almanac endpoint need no key. The tools read the process environment first, then `$AGENT_SKILLS_HOME/.env`.

## Prove it works

```bash
cd <path to the us-stats skill folder>
bun Tools/UsStats.ts summary
bun Tools/UpdateSubstrateMetrics.ts --dry-run
```

The first command needs no key and prints the almanac summary. The second fetches every live metric and writes nothing. Success is `Fetched 66/66 metrics` (fewer, with a `Failed:` line naming each one, if a key is missing or a source is down), followed by `[DRY RUN] Would write:` with byte counts for the three dataset files and a few sample CSV rows. If it prints `dataset not seeded`, finish the Fill in step; if it exits on a missing `FRED_API_KEY`, add the key.

Then ask your agent "how is the economy?" for the trend report, or run the update without `--dry-run` to refresh the dataset files.
