---
name: annual-reports
description: "Aggregate several hundred cybersecurity annual reports from CrowdStrike, Mandiant, IBM, Verizon, Microsoft, CISA, OWASP, Wiz, Palo Alto across 19+ categories (threat intel, ransomware, breaches, AppSec, cloud, AI, identity, pentest). Intents: UPDATE, ANALYZE, FETCH. USE WHEN annual reports, threat reports, vendor reports, ransomware trends, breach stats, DBIR, IBM Cost of Breach, threat landscape, CISO report, CVE trends. NOT FOR real-time threat feeds or live CVE lookup, or weekly security news (use `security-updates`)."
compatibility: "Requires bun 1.2+ and internet access; no keys. The refreshed catalog and fetched summaries live in $AGENT_SKILLS_HOME/annual-reports/."
license: MIT (see LICENSE.txt)
---

# annual-reports - Security Report Aggregation

**Contents:** Ideal State · Anti-criteria · Intent Routing · Tool contract · Data & Config · Gotchas · Examples

Keeps one indexed catalog of several hundred annual cybersecurity reports, fetches the ones that answer a question, and synthesizes trends across vendors with every figure traceable to its source.

**Source:** [awesome-annual-security-reports](https://github.com/jacobdjwilson/awesome-annual-security-reports)

## Ideal State

- UPDATE leaves the catalog (`$AGENT_SKILLS_HOME/annual-reports/sources.json`, seeded from `Data/sources.json`) refreshed from the upstream awesome-annual-security-reports GitHub list, and the counts of added and removed reports are reported.
- FETCH leaves a summary of the requested vendor report page saved under `$AGENT_SKILLS_HOME/annual-reports/Reports/<vendor>/`, with a note that most full PDFs need registration, and a listing request returns the reports in the asked category with their direct URLs; a requested fetch that could not be completed is reported as unavailable.
- An ANALYZE answer names the vendors consulted, and also the ones absent from the answer. A ransomware synthesis that skipped Sophos says so, because the gap changes how much weight the numbers carry.
- In an ANALYZE answer, every figure carries its vendor, its year, and the report it came from, and where vendors disagree, the disagreement is named and both numbers stand.
- The publication lag is stated once (2026 reports cover 2025 data) so a trend read isn't mistaken for this-minute data.

## Anti-criteria

- Never silently average disagreeing vendors' numbers into one clean figure that no source actually published.
- Never attribute a figure to the wrong report year, and never ship a stat without its vendor, year and report.
- Never leave a requested fetch unavailable without reporting it.
- Never conflate different vendors' terminology: each vendor has their own threat actor naming conventions.

## Intent Routing

The skill is one intent with three modes, UPDATE, ANALYZE and FETCH, each run through a tool in § Tool contract.

| File | Read when |
|------|-----------|
| `Setup.md` | first install, the optional PREFERENCES.md, proving the tools work |

## Tool contract

| Mode | Trigger | Tool |
|------|---------|------|
| UPDATE | "update the annual reports", refresh report sources from GitHub | `Tools/UpdateSources.ts` |
| ANALYZE | "analyze X reports", trends/insights across vendors | `Tools/ListSources.ts` + content analysis |
| FETCH | "download/fetch report Y", specific vendor report | `Tools/FetchReport.ts` |

Run the commands from the skill folder (the folder holding this SKILL.md):

```bash
# Update sources from GitHub
bun run Tools/UpdateSources.ts

# List all sources (no argument prints every category with its current count)
bun run Tools/ListSources.ts [category]
bun run Tools/ListSources.ts --search <term>   # match vendor or report name
bun run Tools/ListSources.ts --vendor <name>   # every report from one vendor

# Fetch a specific report (vendor and name match as case-insensitive substrings)
bun run Tools/FetchReport.ts <vendor> <report-name>
bun run Tools/FetchReport.ts --url <url>       # fetch a page not in the catalog
bun run Tools/FetchReport.ts --list-cached     # list summaries already saved under Reports/
```

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/annual-reports/PREFERENCES.md` (default `~/.agent-skills/annual-reports/`) and override the defaults here; when absent, the defaults stand. The skill needs no account or secret. First install and the proof commands: [Setup.md](Setup.md).

A seed catalog ships with the skill, so ListSources and FetchReport work on a fresh install; UPDATE writes a refreshed copy to the data folder, and the tools read that copy once it exists. If both are missing, the tools exit with the instruction to run `Tools/UpdateSources.ts`.

- `Data/sources.json` - All report sources with metadata (the seed that ships with the skill, never rewritten)
- `$AGENT_SKILLS_HOME/annual-reports/sources.json` - The refreshed catalog (written by `Tools/UpdateSources.ts`)
- `$AGENT_SKILLS_HOME/annual-reports/Reports/` - Downloaded report summaries (created by `Tools/FetchReport.ts` on first fetch)

Paths are resolved in `Tools/lib/catalog.ts`.

## Gotchas

- **Category counts drift with the upstream list.** `Tools/ListSources.ts` prints the current ones. The shipped seed (parsed 2026-10-14) holds 492 reports across 21 categories.
- **UPDATE reports counts, never entries.** It prints `New reports` and `Removed reports` counts only, and `--diff` lists only new category keys. Report the counts as printed and never present a list of changed entries the tool did not print.
- **A failed fetch saves nothing.** A fetch error, an HTTP error status, a PDF URL or an unknown report prints the reason to stderr and exits 1, with no summary file written. Report the reason as unavailable.
- **Requests declare this tool.** FetchReport sends `agent-skills-annual-reports/1.0`, plus the `contact` address from `$AGENT_SKILLS_HOME/annual-reports/Config.md` when set (see `Setup.md`), so a vendor site can see who is fetching.

## Examples

```
User: "Update the annual reports"
→ UPDATE
→ The refreshed catalog matches the upstream README, and the counts of added and removed reports are reported
```

```
User: "What threat reports are available?"
→ FETCH listing
→ The Global Threat Intelligence category's reports, each with its vendor and direct URL
```

```
User: "Analyze ransomware reports"
→ ANALYZE
→ A cross-vendor trend analysis where every figure names its vendor, year and report, and the vendors left out are named
```
