---
name: red-team
description: "Adversarial analysis deploying parallel expert agents to stress-test ideas, strategies, and plans — attacks atomic claims, then steelmans and counter-argues, with severity-ranked findings and remediation; also tests an idea or investment against 11 persistent world models from 6 months to 50 years (Fast/Standard/Deep), and refreshes and reports on those models. USE WHEN red team, attack idea, counterarguments, critique, stress test, devil's advocate, find weaknesses, break this, poke holes, strongest objection, world threat model, world model, test idea against the future, how will this hold up in 10 or 20 years, time horizon, long-term risk, update world models, show world models. NOT FOR collaborative debate to find best path (use `council`), or threat modeling your own estate (use `threat-model`)."
license: MIT (see LICENSE.txt)
---

# Red Team

**Contents:** Ideal State · Intent Routing · Data & Config · Gotchas · Examples

Attacks ideas, strategies, plans, designs and judgment-layer question sets to find their weak points before reality does. It breaks an argument into atomic claims, attacks each from several adversarial angles, and ranks what survives by severity. A full run uses attackers on distinct angles (parallel subagents when the agent has them, otherwise played in sequence; split across models or vendors when available) and ends in a steelman plus the strongest counter-argument; a quick run returns the few strongest objections, often inline inside a subagent that may not be able to spawn further agents. Targets arguments, not network vulnerabilities. The two intents compose: a synthesis from the AdversarialValidation intent can be stress-tested with the ParallelAnalysis intent.

It also attacks an idea through time. A persistent world-model harness (folded in from the upstream WorldThreatModel skill, 2026-10-10) stress-tests an idea, strategy, or investment against 11 time horizons from 6 months to 50 years. Each horizon is a deep (~10 page) world model covering geopolitics, technology, economics, society, environment, security, and wildcards. Three speed tiers: Fast (~2 min, single synthesizer), Standard (~10 min, 11 parallel analyses plus a red-team pass and `first-principles` classification), Deep (~1 hr, adds `research` and `council`). TestIdea returns a probability-weighted scenario matrix across all 11 horizons; UpdateModels refreshes the models and ViewModels reports their status and freshness.

## Ideal State

- Every attack lands on the argument's load-bearing claims, and the headline finding is the flaw that would collapse the structure, never a pile of nitpicks.
- Findings are ranked by severity with noise discarded, each names the claim it breaks, and each weakness carries a remediation that fits the stated constraints.
- Length follows the requested depth: a quick or inline pass returns the 4-6 strongest objections; a full stress test returns a steelman and a counter-argument (8 points each) from attackers on distinct angles (split across models or vendors when available); designing something new returns one synthesized solution from competing proposals.
- When the caller says inline or no agents, nothing is dispatched: no subagent and no extra model call.
- An idea tested through time gets a verdict at every one of the 11 horizons, stated as scenarios with probability ranges, never as predictions, at the tier asked for (Standard when none is named); any horizon or capability that failed is named in the result instead of vanishing.
- Every world model it reads or writes lives under `$AGENT_SKILLS_HOME/red-team/WorldModels/` (default `~/.agent-skills/red-team/WorldModels/`) with a `last_updated` date, so how fresh a model is shows before an idea is tested against it.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **ParallelAnalysis** | "red team this", "poke holes", "strongest objection", "quick adversarial pass", "inline, no agents": stress-test existing content | `Intents/ParallelAnalysis.md` |
| **AdversarialValidation** | "battle of bots", "which approach is better", "help me design/decide X": produce new content via competition | `Intents/AdversarialValidation.md` |
| **TestIdea** | "test idea", "test strategy", "test investment", "how will this hold up", "stress test against the future", "test against future", "threat model my bet", "world model": test any input against all 11 world models (6 months to 50 years), Fast/Standard/Deep | `Intents/TestIdea.md` |
| **UpdateModels** | "update world model", "update world models", "refresh models", "new analysis": refresh world model content with new research/analysis | `Intents/UpdateModels.md` |
| **ViewModels** | "view world model", "show models", "current models", "model status": read and summarize current world model state and freshness | `Intents/ViewModels.md` |

| File | Read when |
|------|-----------|
| `Philosophy.md` | framing what a fundamental flaw looks like |
| `Integration.md` | pairing red-team with `research`, `first-principles` or `extract-wisdom` |
| `References/WorldModelTemplate.md` | creating or updating a world model document (UpdateModels) |
| `References/WorldModelOutputFormat.md` | presenting TestIdea results, at any tier |
| `Setup.md` | first-time setup: building the 11 world models the time-horizon lane needs |

### World Model Storage

Models are stored at `$AGENT_SKILLS_HOME/red-team/WorldModels/` (default `~/.agent-skills/red-team/WorldModels/`): `INDEX.md` (summary of all models with last-updated dates) and one horizon file each, `6-month.md`, `1-year.md`, `2-year.md`, `3-year.md`, `5-year.md`, `7-year.md`, `10-year.md`, `15-year.md`, `20-year.md`, `30-year.md`, `50-year.md`. Scenario models (alternative futures) live in `$AGENT_SKILLS_HOME/red-team/WorldModels/Scenarios/`.

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/red-team/PREFERENCES.md` (default `~/.agent-skills/red-team/`) and override the defaults here; when absent, the defaults stand.

First-time setup (building the world models for the time-horizon lane) is in [Setup.md](Setup.md).

## Gotchas

- **Update models when major world events occur.** Static threat models decay in accuracy. For the world models, TestIdea warns past 30 days and flags past 90.
- **Scale the fan-out to the claim count — more attackers generate more volume, not more signal.** Not all findings are equal: rank by severity, discard noise.
- Subagents attacking judgment-layer question sets often cannot spawn further agents and ask for an inline pass. Their attack lenses were literal readings, look-alike inputs, injection through untrusted fields, averaging, and rule-order shadowing.

## Examples

**Attack an architecture proposal:**
```
User: "red team this microservices migration plan"
--> Intents/ParallelAnalysis.md
--> Returns steelman + devastating counter-argument (8 points each)
```

**Devil's advocate on a business decision:**
```
User: "poke holes in my plan to raise prices 20%"
--> Intents/ParallelAnalysis.md
--> Surfaces the one core issue that could collapse the plan
```

**Quick inline pass from a subagent:**
```
User: "Quick inline pass, no subagents: attack this judgment-layer question set for literal readings, look-alikes and injection"
--> Intents/ParallelAnalysis.md
--> The 4-6 strongest objections, severity-ranked, each with the claim it breaks and a fix
```

**Stress-test a bet through time:**
```
User: "threat model my bet on AI-first content creation, deep"
--> Intents/TestIdea.md at the Deep tier
--> Per-horizon verdicts, Cross-Horizon Synthesis and a Council Deliberation section
```

**Check world model freshness:**
```
User: "show me the world models"
--> Intents/ViewModels.md
--> INDEX table with a freshness label per horizon and the models that need a refresh
```

**Adversarial validation for content:**
```
User: "battle of bots - which approach is better for this feature?"
--> Intents/AdversarialValidation.md
--> Synthesizes best solution from competing ideas
```
