---
name: iterative-depth
description: "Structured multi-angle exploration running 2-8 sequential passes over the same problem, each through a different scientific lens, to surface hidden requirements and edge cases invisible from one angle; each pass yields new ideal-state criteria (ISC: binary-testable statements of what must be true). USE WHEN iterative depth, explore deeper, multi-angle analysis, surface hidden requirements, blind spot check, what am I missing. NOT FOR scope/zoom analysis (use `aperture-oscillation`)."
license: MIT (see LICENSE.txt)
---

# Iterative Depth

Iterative depth examines one problem through several structurally different lenses (literal, stakeholder, failure, temporal and more) and merges what each angle surfaces into ISC criteria a single pass misses. The method rests on 20 established techniques across cognitive science, AI/ML, requirements engineering and design thinking (`ScientificFoundation.md`).

## Ideal State

- A run returns ISC criteria and anti-criteria that a single pass over the same problem would have missed, each one binary-testable and deduplicated across lenses.
- The lenses fit the problem (a security problem leans on the failure and adversary angles, a UX problem on the experiential one). A run uses between two and eight passes and ends once a pass only repeats earlier findings, usually by about the fifth.
- The result names the lenses used and the cross-angle finding that only appeared because two lenses collided.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Explore** | "iterative depth", "explore deeper", "multi-angle" | `Intents/Explore.md` |

| File | Read when |
|------|-----------|
| `TheLenses.md` | choosing lenses: the catalog of eight exploration angles, concrete to abstract, each with its question, grounding and example prompt |
| `ScientificFoundation.md` | justifying the method or explaining why multi-lens passes work: the 20 techniques it rests on and how it differs from CS iterative deepening |

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/iterative-depth/PREFERENCES.md` (default `~/.agent-skills/iterative-depth/`) and override the defaults here; when absent, the defaults stand.

## Gotchas

None reproduced yet.

## Examples

```
User: "Inline, no subagents: 3 quick passes over the issue-security route design (private vs public)"
→ Explore intent
→ Three lenses run inline; new criteria and anti-criteria for each route outcome, with the cross-angle finding
```

```
User: "What am I missing in this multi-agent coordination design?"
→ Explore intent
→ Criteria and anti-criteria the design lacked and existing criteria refined, with the lenses named, returned to the user
```
