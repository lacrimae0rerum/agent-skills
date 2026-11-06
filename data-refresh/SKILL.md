---
name: data-refresh
description: "Keeps your data-backed public sites and their source datasets current from a registry you configure: freshness check, source repull, rebuild, gated deploy, live verify. Use when the user says update our data sites, refresh the data sites, are our datasets stale, data freshness, repull the data, refresh the dataset, update the data and the site, stale data check, which sites need updating, or names a registered data target. Not for system upgrades, uptime or security monitoring, US economic indicators (use `us-stats`), or non-data deploys (use your deploy tooling)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ and a local clone of each registered site repo. Optional env: DATAREFRESH_REGISTRY (registry path), DATAREFRESH_POLL_MS, AGENT_SKILLS_HOME. Targets' own fetch/deploy scripts may need their own keys."
---

# data-refresh

Registry-driven freshness engine for data-backed public sites. Each registered target carries its own fetch scripts, source-of-record dataset updater, build step, sanctioned deploy command, and live verify probe. One command reports staleness across the fleet; one command brings a target current.

## Ideal State

- Every registered target's freshness is known against its own cadence, and a stale one is brought current from its real upstream sources, not from a cached or frozen copy.
- A target that passes its cadence can reach the user without being asked, through a read-only status check the user schedules (cron, launchd, CI, or the agent's own scheduler) that reports exit code 2 when anything is stale; that check never refreshes or deploys.
- Nothing reaches production unless the user's ask covered publishing and the user confirmed the exact deploy, and a deployed refresh is proven on the live site.
- Narrative figures that the fresh data contradicts are found and fixed by hand; deterministic code never rewrites prose.
- Every refresh run leaves one line per target in the run log (status writes none), and every touched repo ends committed per its own conventions.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Status** | "are our data sites stale", "data freshness", "status" | `Intents/Status.md` |
| **Refresh** | "update the data sites", "refresh <target>", "repull and redeploy" | `Intents/Refresh.md` |

| File | Read when |
|------|-----------|
| `Setup.md` | first install, registry fields, accounts and secrets, the throwaway-target proof |

## Setup

Requires bun 1.2+. Create the registry at `$AGENT_SKILLS_HOME/data-refresh/registry.json` (default `~/.agent-skills/data-refresh/registry.json`) as described in `Setup.md`. No key is needed by the skill itself; the targets' own scripts may need theirs.

## Data & Config

- **Registry (private data, never in this skill):** `$AGENT_SKILLS_HOME/data-refresh/registry.json` (default `~/.agent-skills/data-refresh/registry.json`). `$DATAREFRESH_REGISTRY` overrides the path. With no registry, or one with no targets, the tool exits 1 and points at Setup.md. Field reference and a minimal example: `Setup.md`.
- **Run log:** `$AGENT_SKILLS_HOME/data-refresh/runs.jsonl`, one line per target per refresh run.
- User preferences, when present, live in `$AGENT_SKILLS_HOME/data-refresh/PREFERENCES.md` (default `~/.agent-skills/data-refresh/`) and override the defaults here; when absent, the defaults stand.

## Gotchas

- **Registry validation is fail-loud by design.** A missing repo path or malformed entry throws an InvariantViolation naming the entry — fix the registry, never wrap the load in a try/catch.
- **Frozen upstream sources look alive.** A source can keep serving 200s with years-stale data (a government feed that froze). When a target's record dates stop advancing across multiple refreshes while cadence says they should, check the source series itself before trusting the pull.

## Examples

```
User: "are our data sites stale?"
→ Status intent
→ One table of every target with last pull, age vs cadence and STALE/FRESH, plus a one-line read and an offer to refresh what is stale
```

```
User: "refresh example-site"
→ Refresh intent, no --deploy (no publish intent)
→ Data repulled and rebuilt but not deployed; the report shows before → after record dates
```

```
User: "update the data sites"
→ Refresh intent with --all --deploy, after the user confirms the exact targets and deploy commands
→ Every target current, deployed through its sanctioned command, live freshness field shown advancing, repos committed
```
