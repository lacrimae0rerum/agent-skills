# Red Team

Status: test -f "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/red-team/WorldModels/INDEX.md" && echo ok · optional

## What it does

The red team skill attacks an idea, plan or design to find its weak points before reality does. Attacking an argument (`ParallelAnalysis`) and designing by competition (`AdversarialValidation`) work from the first message with no setup. The time-horizon lane is different. `TestIdea` tests an idea against 11 stored world models, from 6 months to 50 years, and refuses to run until all 11 exist. You build those models once with `UpdateModels`, then refresh them as the world changes.

## Fill in

There is no config file. The setup is one run that creates the model files. Models live in `$AGENT_SKILLS_HOME/red-team/WorldModels/` (default `~/.agent-skills/red-team/WorldModels/`):

```text
INDEX.md   6-month.md  1-year.md  2-year.md  3-year.md  5-year.md
7-year.md  10-year.md  15-year.md  20-year.md  30-year.md  50-year.md
```

Ask your agent to run **UpdateModels** with a full creation: "update world models, build all 11". It researches each horizon with the `research` skill if installed, otherwise the agent's own web search (near-term, mid-term and long-term batches in parallel), writes each file from `References/WorldModelTemplate.md` with frontmatter like the made-up example below, and writes the index.

```markdown
---
horizon: 5-year
last_updated: 2026-01-15
version: 1
confidence: medium
---

# World Threat Model: 5-Year Horizon

## 1. Executive Summary
```

Plan on a long first run. After that, a targeted update changes only the models a new event or piece of analysis affects, and `TestIdea` warns when a model is over 30 days old and flags it past 90. Named alternative futures go under `WorldModels/Scenarios/`, apart from the baseline files.

## Accounts and secrets

No keys of its own.

- UpdateModels needs web research: the `research` skill (if installed; set it up first, see its own `Setup.md`) or the agent's web search.
- A full adversarial run is stronger when attackers run on different models or vendors, but that is optional and needs nothing here; use whatever models your agent can reach.
- A quick or inline pass dispatches nothing and needs no account.

## Prove it works

```bash
ls "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/red-team/WorldModels"
grep -m1 '^last_updated:' "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/red-team/WorldModels/6-month.md"
```

Success is the 11 horizon files above plus `INDEX.md` in the listing (a `Scenarios/` folder may sit beside them) and a `last_updated: YYYY-MM-DD` line, ideally within the last 30 days. With none, `ViewModels` answers `No world models found. Run 'update world models' to create them.`, which means the build above has not run yet. Then ask your agent "how will a subscription cooking-box business hold up over 10 years?" and expect a verdict at all 11 horizons.
