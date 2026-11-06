# annual-reports

Status: `bun run Tools/ListSources.ts` (from the skill folder) · optional

## What it does

annual-reports keeps a local catalog of several hundred cybersecurity annual reports (threat intelligence, breaches, ransomware, AppSec, cloud, identity and more) built from a public GitHub list. It can list the catalog by category, search by vendor, download a report page, and help the agent synthesize trends across vendors. It needs only internet access and Bun. No account, key or personal file is required.

## Fill in

Nothing is required. A seed catalog ships as sources.json in the skill's Data folder, and each update writes a refreshed copy from the upstream list to `$AGENT_SKILLS_HOME/annual-reports/sources.json` (default `~/.agent-skills/annual-reports/`).

To override defaults, create `$AGENT_SKILLS_HOME/annual-reports/PREFERENCES.md`. Smallest working example:

```markdown
# annual-reports preferences

- Favor reports from the last two years.
- Always list the vendors that were left out of a synthesis.
```

| Field | Meaning |
|---|---|
| Any prose bullet | Read by the agent and applied over the skill defaults. There is no fixed schema. |

Optional: so vendor sites can reach you, create `$AGENT_SKILLS_HOME/annual-reports/Config.md` with a fenced yaml block containing `contact: you@example.org`. FetchReport then sends `agent-skills-annual-reports/1.0 (you@example.org)` as its user agent; without it, it sends `agent-skills-annual-reports/1.0`.

## Accounts and secrets

None. The update reads the public raw README of the upstream list (`raw.githubusercontent.com`) without authentication. No `.env` keys are used.

## Prove it works

```bash
# from the skill folder; needs bun 1.2+
bun run Tools/UpdateSources.ts --dry-run
```

Success: it prints the upstream fetch, a nonzero `Total parsed:` figure, the `New reports:` and `Removed reports:` counts against the shipped seed (often zero), and ends with `Dry run - no changes saved`.

```bash
bun run Tools/UpdateSources.ts && bun run Tools/ListSources.ts
```

Success: the second command prints `Annual Security Reports`, a `Total Reports:` figure and the category list. If both the seed `Data/sources.json` and the refreshed copy are missing, ListSources exits 1 with `No source catalog at ... Run: bun run .../UpdateSources.ts`.
