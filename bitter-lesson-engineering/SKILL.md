---
name: bitter-lesson-engineering
description: "Audits any AI instruction set for over-prompting by asking whether a smarter model would make each rule unnecessary, then classifies every rule from CUT to KEEP. USE WHEN BLE, bitter lesson, audit setup, over-prompting, trim instructions, dead weight, simplify setup, clean up CLAUDE.md or AGENTS.md. NOT FOR attacking logical flaws in ideas (use `red-team`)."
license: MIT (see LICENSE.txt)
---

# Bitter Lesson Engineering

Audits any AI instruction set for over-prompting: every rule goes through the Six Questions below and gets one classification from CUT to KEEP, with an estimate of the tokens saved. Two intents: Audit (full system) and QuickCheck (a single file or rule set). The core test for every rule: *"Would a smarter model make this unnecessary?"* If yes, it is scaffolding, not architecture, and a candidate to cut. Unnecessary rules compete for attention with the ones that matter, so a bloated setup produces worse output than a lean one.

## Ideal State

- Every audited rule is first sorted by kind under The First Sort below, and the report counts each kind. A preference is never cut, by judgment, score or ablation; a prescriptive step that is not a keep-class leaves as CUT or as REWRITE to the outcome it protects.
- Every audited rule carries one classification from the table below with a one-line reason, and no keep-class rule (safety gate, verified gotcha, tool contract, output-format contract) is ever marked CUT.
- No declarative content a model cannot derive (environment facts, domain invariants, API shapes, worked examples) is ever marked CUT; question 6 cuts imperative reasoning steps only.
- No rule is cut as default behavior unless it is still default on the current model and the failure it was added for is truly gone.
- Every report states its scope, the rule count and the verdict counts; a full audit also states estimated savings in lines and tokens.
- The audited files change only after the user approves the trimmed versions.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Audit** | "audit setup", "full audit", "check all rules" | `Intents/Audit.md` |
| **QuickCheck** | "quick check", "check this file", "check these rules" | `Intents/QuickCheck.md` |

## The First Sort

Whether a rule is BLE is decided by its kind, never by the length of the file it sits in (user directive, 2026-10-25). Sort every rule into one kind before asking the Six Questions:

| Kind | What it says | Verdict |
|------|--------------|---------|
| **Preference** | What the user wants: an outcome, a taste, a word's meaning, who is trusted, which tool is ours | **KEEP.** A smarter model still cannot know it. Questions 2, 3 and 5 may still MERGE, RESOLVE or SHARPEN it. |
| **Move guard** | What must exist before a move is allowed: evidence before a fix or a close, an approval before a deploy, an independent mind before a verdict, a re-check before building on uncertain direction, who rules a contradiction | **KEEP, rigid.** Its purpose is authority, accountability, independence, an external commitment or irreversibility, and a smarter model leaves each of those standing (author bias does not shrink with capability). Rigid moves, free work. |
| **Prescriptive step** | How to do something: an order of actions, a method, reasoning choreography | **CUT**, or **REWRITE** as the outcome it protects, unless it is a move guard or safety gate |
| **Verified gotcha** | A non-obvious failure of a tool or the install | **KEEP** where it fires before the mistake; **MOVE to tool** once the tool can make the mistake impossible |
| **Tool contract** | An exact command, path, flag or API shape | **KEEP**, beside the outcome it serves |
| **Safety gate / output-format contract** | An approval or destructive-op guard; a required deliverable shape | **KEEP** |

A with/without ablation measures steps, never preferences: most tasks never exercise a given preference, so an ablation scores it useless and would delete what only the user could say.

## The Six Questions

Ask each question of every rule, instruction, or preference found; a yes gives the verdict and action in its row.

| # | Question | Verdict | Action |
|---|----------|---------|--------|
| 1 | **Default behavior?** Does the model already do this without being told? | **CUT** | The model already does this. |
| 2 | **Contradiction?** Does it conflict with another rule in the same or a different file? | **RESOLVE** | Pick one, cut the other. |
| 3 | **Redundancy?** Is it already covered by a different rule or file? | **MERGE** | One location, one statement. |
| 4 | **One-off fix?** Was it added to fix one specific bad output rather than improve outputs generally? | **EVALUATE** | Still relevant, or already learned? |
| 5 | **Vague?** Would the model interpret it differently every time (e.g., "be more natural", numeric personality scales)? | **SHARPEN** | Add specific DO/DON'T examples, or cut. |
| 6 | **HOW instead of WHAT?** Is it **procedural over-prompting**: does it dictate execution methodology or reasoning choreography ("first analyze X, then consider Y, then decide Z") instead of articulating the ideal state (WHAT done looks like) plus the tools? | **CUT** | Scaffolding, unless it is a keep-class or declarative content. |

Two verdicts sit outside the questions. Content that is loaded but rarely actionable gets **MOVE to on-demand**: load it via the CLAUDE.md routing table when needed. A rule that is specific, actionable and non-default gets **KEEP**, which is what good instructions look like.

Declarative content is **KEEP**, never scaffolding: environment facts, domain invariants, API shapes and worked examples a model cannot derive. They state what is true, not how to reason, so question 6 does not reach them. Four keep-classes are legitimate HOW, never cut them: **safety-gate** (confirmation/destructive-op guard/approval), **verified-gotcha** (a documented non-obvious failure), **tool-contract** (exact CLI/API/path recipe), **output-format-contract** (required deliverable shape). Deterministic tools (`*.ts`) are exempt. A rule that survives "would a smarter model make this unnecessary?" is either a keep-class or genuine architecture. Infrastructure that makes output checkable (verification harnesses, acceptance criteria, data pipelines, routing rules) is architecture; machinery wrapped around the model's reasoning (CoT orchestrators, format parsers, retry cascades, process descriptions that aren't followed) is scaffolding. Doctrine: state the ideal outcome (what done looks like) and supply the tools; do not script the reasoning.

## Gotchas

- Process doctrine (the team's process doc, a release flow, an SOP) is mostly move guards, and they read like steps. On 2026-10-25 a first pass over the team's process doc marked "reproduce before fixing", "a fresh mind after two failed fixes" and "two re-calls, then the user rules" as prescriptive steps to cut; all three are guards. Ask what the step protects before calling it method.
- File length is not the finding. When OPERATIONAL_PREFERENCES.md was sorted on 2026-10-25, about 8 of its 359 rule lines were prescriptive steps; the rest were preferences, gotchas and tool contracts. An audit that reported "91 dated directives" as drift was wrong until it sorted them.
- Cutting domain content as choreography costs quality: in the 2026-10-10 skill-quality A/B, the `first-principles` skill lost −0.122 after its domain content was cut as methodology and won +0.089 once it was restored.
- Startup context includes the instruction file's imports (`@`-imports in Claude Code, equivalents elsewhere) and any harness setting that injects extra context. Settings the harness no longer reads (retired load-at-startup or restore keys) are dead weight to flag, not a sync obligation.
- Drift grows back after every cut. If the project has a linter or script that scans skills or rules for known over-prompting patterns, use it to find candidates mechanically, then judge each against the four keep-classes with this skill's questions. The scan finds candidates; this skill is the judgment.

## Examples

**Example 1: Full system audit**
```
User: "Run BLE on my setup"
→ Audit intent
→ A categorized report over every force-loaded file with estimated token savings, trimmed versions offered for approval
```

**Example 2: Check a single file**
```
User: "Quick check this CLAUDE.md"
→ QuickCheck intent
→ A concise keep/cut/sharpen verdict for every rule in the file
```

**Example 3: Post-cleanup validation**
```
User: "I trimmed my rules, check if anything's still redundant"
→ Audit intent
→ Any surviving dead weight flagged against current Claude defaults
```
