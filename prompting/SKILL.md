---
name: prompting
description: "Meta-prompting standard library for generating, optimizing, and composing prompts programmatically via Standards, Handlebars Templates, and Tools; output is always a prompt to use elsewhere, not final content. USE WHEN meta-prompting, template generation, prompt optimization, prompt engineering, write a prompt, create system prompt, Handlebars template. NOT FOR generating final content (use the appropriate domain skill), or any eval: judge prompts, rubrics, scoring, grading or comparing outputs (use the `assay` skill if installed)."
compatibility: "Template tools require bun 1.2+ and the handlebars and yaml npm packages (bun install in the skill folder). No env vars; Standards.md needs nothing but reading."
license: MIT (see LICENSE.txt)
---

# Prompting - Meta-Prompting & Template System

**Contents:** Ideal State · Anti-criteria · Intent Routing · Data & Config · Setup · Gotchas · Examples · References

Generates, optimizes, and composes prompts programmatically. It's the standard library for prompt engineering — other skills call it when they need to build or improve a prompt. The output is always a prompt to be used elsewhere, never the final content itself.

**Philosophy:** Prompts that write prompts. Structure is code, content is data. Meta-prompting enables dynamic composition where the same template with different data generates specialized agents, workflows, and evaluation frameworks.

## Ideal State

- Every prompt this library generates or optimizes articulates the ideal state, not the procedure: WHAT done looks like as testable outcomes, the CONSTRAINTS, and the high-quality TOOLS available, with the specificity moved to the outcome so the prompt is more precise, not vaguer.
- In every prompt this library generates or optimizes, the only HOW that survives is the four keep-classes (safety-gate, verified-gotcha, tool-contract, output-format-contract); every other procedural line failed the test of whether a smarter model would make it unnecessary. Deterministic tools (`*.ts`) are exempt. The full standard is `Standards.md` § Ideal-State Prompting.
- A prompt composed from data keeps structure as code and content as data: a Handlebars template under `Templates/` rendered with a data object, or from a .yaml or .json file, through `RenderTemplate.ts`.
- A reusable prompt captures the supplied intent, constraints, and output contract; its output contract can guide the intended downstream task; and it was tested before it was declared ready.
- When `Standards.md` is authored or audited (not on routine template renders), both official anchors were fetched and every place our standards diverge from the current official guidance is flagged.

## Anti-criteria

- No reasoning choreography ("first analyze, then consider, then decide") in a prompt this library generates or optimizes: it is scaffolding that fails the bitter-lesson test (`bitter-lesson-engineering`), caps a capable model and rots as models improve.
- Meta-prompting never produces the final deliverable: it generates PROMPTS, not content.
- No template or prompt depends on specific model quirks; templates stay model-agnostic.
- No generated prompt is declared ready untested: a prompt that looks good may perform poorly.
- Standards drift is reported, never auto-adopted, and an unreachable anchor URL never blocks the work.

## Intent Routing

Library skill, no `Intents/` directory. Requests route to the tools and reference docs:

| Intent | Trigger | File |
|--------|---------|------|
| **RenderTemplate** (tool) | render a template, compose a prompt from data, Handlebars template | `Tools/RenderTemplate.ts` |
| **ValidateTemplate** (tool) | validate a template | `Tools/ValidateTemplate.ts` |
| **Standards** (reference) | prompt engineering standards, best practices, prompt optimization | `Standards.md` |

| File | Read when |
|------|-----------|
| `Standards.md` | writing, optimizing or auditing any prompt: the ideal-state standard, the keep-classes, signal-to-noise, Anthropic and research-backed practice |
| `References/WritingGreatSkills.md` | the prompt is a skill or intent: invocation load, information hierarchy, completion criteria, pruning |
| `Templates/` | composing a prompt from data: Primitives (Briefing, Structure, Gate, Roster, Voice) (evals and judges are not composed here; use the `assay` skill if installed), `Data/` presets, and `Templates/README.md` for the template system |
| `Setup.md` | first-time setup: the one package the template tools need (`handlebars`) and a read-only check |

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/prompting/PREFERENCES.md` (default `~/.agent-skills/prompting/`) and override the defaults here; when absent, the defaults stand. Your own templates and data presets can sit in the same folder; pass their absolute paths to the tools.

First-time setup for the template tools is in [Setup.md](Setup.md).

## Setup

- bun 1.2+, then `bun install` in this skill's folder: `package.json` declares `handlebars` and `yaml`, the only packages the two template tools import.
- No API keys and no env vars. `Standards.md`, `References/` and the templates need nothing but reading.
- Read-only check that it works: [Setup.md](Setup.md) § Prove it works.

## Gotchas

- **`Tools/` is the only tool directory.** An older layout kept a byte-identical copy under `Templates/Tools/`; that copy is gone, so edit and import `Tools/` only.

## Examples

### Example 1: Using Briefing Template (compose an agent brief)

`renderTemplate(templatePath, data)` takes a path under `Templates/` and a data object and returns the text. `renderTemplate({ templatePath, dataPath })` renders from a .yaml or .json file instead.

```typescript
// Render a structured agent brief from data before launching a subagent
import { renderTemplate } from '<skill>/Tools/RenderTemplate.ts'; // <skill>: absolute path of this skill's folder

const prompt = renderTemplate('Primitives/Briefing.hbs', {
  briefing: { type: 'research' },
  agent: { id: 'EN-1', name: 'Skeptical Thinker', personality: {...} },
  task: { description: 'Analyze security architecture', questions: [...] },
  output_format: { type: 'markdown' }
});
```

### Example 2: Ideal-state brief from a data file (outcomes, constraints, tools)

The data states what done looks like, the limits, and the tools; it carries no steps.

```yaml
# Data: attack-surface-brief.yaml
briefing: { type: analysis }
agent: { id: SEC-1, name: Attack Surface Reviewer }
context:
  summary: Review the public API of the billing service before launch.
  background: "Tools available: the repo checkout, rg, and read-only staging credentials."
  constraints:
    - Read-only; no writes to staging or production.
    - Findings cite file:line or a reproducible request.
task:
  description: Report the external attack surface of the billing service.
  deliverables:
    - Every external entry point is listed with its auth requirement.
    - Each finding carries a severity and a reproducible request or file:line.
    - Entry points that could not be checked are named, with the reason.
output_format: { type: markdown }
```

```bash
# Relative paths are looked up under Templates/ first, then the current directory (so attack-surface-brief.yaml can sit where you run this).
bun run <skill>/Tools/RenderTemplate.ts \
  --template Primitives/Briefing.hbs \
  --data attack-surface-brief.yaml --preview
```

## References

- Agent briefs: if your agent can run subagents, give each one a brief rendered from `Templates/Primitives/Briefing.hbs`; otherwise use the same brief for each task run in this session.

**Official anchors (drift check):** the two authoritative Anthropic sources this skill's standards derive from. They change with each model family, which is why `Standards.md` is checked against them when it is authored or audited:
- Prompt engineering: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- Context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

**Research foundation:** every source behind the standards, with links, is listed once in `Standards.md` § References and § Prompt Templating System › References.
