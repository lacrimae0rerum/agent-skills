---
name: assay
description: "Assertion-first eval framework: code asserts, calibrated model judges, pass^k and pass@k with SEM and 95% CI, paired A/B comparison, flipped-order tournaments, image evals, and agentic evals over a real harness. USE WHEN eval, evaluate, benchmark, judge, judge prompt, regression test, assert, llm-rubric, llm-assert, calibrate judge, judged residue, pass@k, pass^k, grade output, compare prompts or models, A/B test, ablation, with/without, test agent, agentic eval, image eval, vision rubric, tournament, which output is better, write an eval suite, eval for a skill. NOT FOR scientific-method framing (use `science`), property or mutation testing (use `hardening`), rating outputs by hand to teach a judge your taste (use `calibrate`), live UI verification (use the agent's browser tools), or non-eval prompts (use `prompting`)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2.21+. Text judges and subjects: ANTHROPIC_API_KEY, OPENAI_API_KEY, the claude or codex CLI, or AGENT_SKILLS_LLM_CMD. Image judges: OPENAI_API_KEY (or codex CLI), ANTHROPIC_API_KEY, GOOGLE_API_KEY for Gemini; ImageAsserts needs ImageMagick and tesseract. See Setup.md for the ASSAY_* variables."
---

# Assay — Assertion-First AI Evaluation

**Contents:** Ideal State · Intent Routing · Setup · The taxonomy · Choosing a check: tier first, then shape · Selection, acceptance, and unavailable evidence · The canonical path · Doctrine (from Anthropic; encode, don't restate) · The image lane (visual evals) · Project integration · Data & Config · Gotchas · Examples

An eval gives an AI an input, then applies **assertions** to its output to measure success (Anthropic's definition). A case is `{id, prompt, assert:[...]}`. Each assertion is either deterministic (code, free) or model-graded (a calibrated judge). Cases run multiple trials and report **pass^k** (every trial passes; the reliability metric and the regression gate) and **pass@k** (any trial passes).

Sources: [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) (2026-01), [A Statistical Approach to Model Evaluations](https://www.anthropic.com/research/statistical-approach-to-model-evals) (2024-11), [develop tests](https://platform.claude.com/docs/en/docs/build-with-claude/develop-tests), the eval-awareness contamination post (2026-03), and the live `claude plugin eval` surface.

**Freshness contract:** "aligned to Anthropic's doctrine" is a live claim. When designing a new suite class or touching `## Doctrine`, fetch the demystifying-evals post again and flag where it has moved. Report divergence, never auto-adopt; an unreachable URL never blocks a run.

## Ideal State

- Every check sits at the lowest tier that can honestly answer it (code, judge, human), and only code runs on a blocking path.
- Every score ships with pass^k, SEM and a 95% CI from the trials that completed, with the requested and completed trial counts beside it; fewer completed trials than requested never claims pass^k.
- A judged check is calibrated against the user's labels or reads PROVISIONAL wherever it shows, and a judged suite keeps an adversarial fixture its judge must fail.
- Transport failures, malformed verdicts and missing observations are reported as unavailable evidence, never as a pass, a quality failure or an adversarial catch.
- When Assay builds the eval system for a project, the project's spec ends current: every criterion it checks names its suite or check in the spec's verification table, and the hand-rolled eval code and stale criteria it replaced are removed in the same change.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **RunEval** | "run the eval", "run suite", "evaluate this" | `Intents/RunEval.md` |
| **CreateSuite** | "new eval", "create a suite", "eval for X" | `Intents/CreateSuite.md` |
| **CreateJudge** | "write a judge", "llm-rubric", "grading criteria", "yes/no, choice or score check" | `Intents/CreateJudge.md` |
| **Calibrate** | "calibrate the judge", "judge agreement", "judged residue", "shrink the judges", "judged miss" | `Intents/Calibrate.md` |
| **Compare** | "compare prompts", "compare models", "A/B this", "with/without", "ablation" | `Intents/Compare.md` |
| **RunAgentic** | "multi-turn eval", "agentic eval", "eval with tools", "plugin eval" | `Intents/RunAgentic.md` |
| **ViewResults** | "eval results", "how did it score", "saturation" | `Intents/ViewResults.md` |

| File | Read when |
|------|-----------|
| `References/Progressive.md` | timing, depth, skill coverage, and actual harness context |
| `References/VisionJudgeProviders.md` | grading images: provider selection per suite, private-image consent, capability probes, failure behavior |
| `Tools/Tournament.help.md` | the `Tournament.ts` flags |
| `Suites/` | the skill's eval suites; eval data, never edited as prose |
| `Setup.md` | first-time setup: providers and keys, the optional config files, and a proof that needs no key |

## Setup

- bun 1.2.21+ (YAML is parsed with Bun's built-in parser; no `bun install` needed to run the tools).
- A model provider for subjects and judges, through `Tools/_portable/inference.ts`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, the `claude` or `codex` CLI on PATH, or `AGENT_SKILLS_LLM_CMD`. Keys may live in `$AGENT_SKILLS_HOME/.env`.
- Image lane: `OPENAI_API_KEY` (or the `codex` CLI) and `ANTHROPIC_API_KEY` for the default panel, `GOOGLE_API_KEY` for Gemini; ImageMagick (`magick`) and `tesseract` for the deterministic image asserts.
- Every `ASSAY_*` variable and a proof it works: [Setup.md](Setup.md).
- Running a suite calls the model under test and the judge for every trial: say how many calls a run will make (cases × trials, plus one judge call per judged assert) before a large run.

## The taxonomy

`eval` is the parent word for every check a criterion carries. Its two branches are the **assert** (a tool says no: `Assertions.ts`, `bun test`, a curl probe) and the **judged** check (a model says no, bound to content derived from the ideal state). A judged check takes one of two harness shapes: a **rubric** or **assertion** run from an eval suite (`Judge.ts`, one output scored against anchored levels or checked against literal claims), or a **tournament** on a pairwise question (`Tournament.ts`, every pair judged in both orders, then a shuffled-seed rerun). `manual` is not a class; it is the top of the ladder below, and every attestation the user gives is a label for the rung beneath it. What makes a judge good is its content, derived from the articulated ideal state in the project's spec or the skill's intents.

**The three-tier ladder.** Every check sits on one of three tiers, ordered by speed and by how much intelligence the verifier needs: `code`, `judge`, `human`. Code is a tool that exits zero. Judge is a model reading an output against anchored levels, literal claims or a flipped bracket, in seconds to minutes. Human is the user recognizing the thing on encounter. The tier comes from the check's type: deterministic asserts give `code`, `llm-rubric`, `llm-assert`, `vision-rubric`, `meaning-ladder` and pairwise give `judge`, and `manual` gives `human`. A check sits at the lowest tier that can honestly answer it, and it drifts down the ladder as it earns labels: a human check becomes a judged check once the criterion carries labels, and a judged check becomes a code check once the question is sharp enough to be a tool. Two guards hold this in place. Only code runs on the blocking path, so no judged check runs inside a deploy or close gate, and a judged check never gates a deterministic check of the same criterion. A gate runs no judge, but it reads recorded results: an earned judged check's latest fail keeps the criterion open at close. Labels that came from a model or from the deterministic layer put the calibration record in the `proxy` state, which never reads earned.

## Choosing a check: tier first, then shape

Tier first. If code can answer, write the assert and stop. If reading is needed, write a judged assert: in an eval suite when the output is generated fresh on every trial (a prompt's answer, an agent's run), because pass^k needs trials; as one case over the existing state when the state already exists (a file, a rendered page, a diff, a log tail, a query result). A `manual` check holds taste until labels exist.

Shape second, for anything that has to be read. The question type is what separates the shapes, and each one becomes a different piece of code:

| Question | Shape | What the code does with it | Where it lives here |
|---|---|---|---|
| Is this true? | yes/no | an `if` | `llm-assert` in a suite (one literal claim per line) |
| Which of these? (an unordered set) | choice | a `switch` | A/B/tie inside a tournament; a pairwise question |
| How much? (an ordered ladder) | score | a sort, or a threshold | anchored `llm-rubric` in a suite |

Critical, high, medium, low is a ladder and can be sorted. Korean, Mexican, Thai cannot, so a question over them is a choice. Ask many small questions rather than one big rubric. A rubric whose levels mix dimensions is several questions crushed into one call, the same failure as a system message packed with instructions in the hope that every one lands. Fall back to a multi-level anchored rubric or a tournament only when the property will not split.

An unearned judgment only flags; an earned confident no fails like a code check. A judged miss is fixed with one more small assert plus a kept labelled case, never a longer prompt: `Intents/Calibrate.md` § The miss loop.

## Selection, acceptance, and unavailable evidence

A tournament answers which candidate is preferred under a written definition. It never proves the winner meets an absolute bar. A quality criterion carries its own asserts and rubric, or a named user attestation when calibration is unavailable. Both definitions derive from the owning spec; neither the word "best" nor a number supplies the standard.

`Tournament.ts` needs at least two distinct candidates and a completed shuffled rerun to verify; `--no-rerun` is diagnostic only. Identical content under different paths is not candidate diversity.

Semantic UNKNOWN stays a miss even under negation. Unavailable evidence and trial counts follow the Ideal State above.

## The canonical path

`<assay>` below is this skill's folder.

| Tool | Role |
|------|------|
| `Tools/Assertions.ts` | Deterministic assert engine: 12 types + `not-` negation. Sync, free, no model call. |
| `Tools/Judge.ts` | Model-graded asserts `llm-rubric` (anchored 1–5 → 0–1) and `llm-assert` (TRUE/FALSE/UNKNOWN), plus `judgeTextPairwise`. System prompts live in `Tools/lib/JudgePrompts.ts`, shared with the vision judge and hashed into every calibration record. UNKNOWN is a miss; an unparseable cheap verdict gets one retry at 'high'. Calls go through `Tools/lib/JudgeCall.ts` on the inference helper. |
| `Tools/Tournament.ts` | The tournament: a bracket in code over an injected pairwise judge (images → VisionJudge pairwise, which runs on Gemini alone (see Gotchas); text → Judge.ts). A flipped winner is position bias and reads as a tie; a different winner on the shuffled rerun reads unstable. The result names generator and judge ids and flags a same-family pair. Exit 0 stable · 1 unstable/all tied · 2 verifier unavailable. |
| `Tools/JudgeLevel.ts` | judge_model alias/id → inference level, capped at 'high' (grading never rides the top rung). |
| `Tools/EvalRunner.ts` | Suite runner: trials, pass^k/pass@k + SEM/CI, calibrated-cheap judge default, regression gates on pass^k, judged-residue metric, transcripts persisted per run. Shared suite validation precedes inference. Exit 0 passed · 1 regressed · 2 verifier unavailable (no run verdict; run.json kept as history; latest.json untouched, so the last valid result stays visible). |
| `Tools/Stats.ts` | SEM, 95% CI, paired differences, clustered SEs, power analysis (pure functions). |
| `Tools/Compare.ts` | Paired A/B on one suite: prompts, levels, with/without ablation. Verdict from the paired CI. |
| `Tools/Calibrate.ts` | Judge calibration vs the user's labels. EARNED has one definition (`Tools/lib/Calibration.ts`): the user's pass/fail labels at agreement ≥ 85% and Cohen's kappa ≥ 0.40, with at least 2 labels per class for every judged assert. A record goes STALE when any model in the judge chain, the judge prompts, the rubric text, the suite's judge configuration, or the label file changes. Labels from a model or the deterministic layer make the record `proxy`, which never reads earned. `--append-log` appends the calibration log block to the spec the set names; `--recheck` re-runs stale records; `--residue` reports judged residue and judged asserts with no `derived_from`. |
| `Tools/PairwiseCalibrate.ts` | Calibrates one tournament criterion against flipped A/B/tie labels; `Tournament.ts --calibration <set.yaml>` reads its record. |
| `Tools/SuiteManager.ts` | Suite inventory (`list`, `show <suite> [--json]`), `validate [suite]` (a judged suite must keep an adversarial fixture), saturation detection, capability→regression graduation. |
| `Tools/FailureToCase.ts` | One real failure → one draft case skeleton. |
| `Tools/Agentic.ts` | `runAgenticSuite`: the same asserts and judges over an actual harness adapter, a fresh workspace per trial. |

```bash
bun <assay>/Tools/EvalRunner.ts -s <suite | path/to/suite.yaml> [-t trials] [--json]
bun <assay>/Tools/Assertions.ts   # deterministic self-test, offline
bun <assay>/Tools/Stats.ts        # stats self-test, offline
bun <assay>/Tools/Judge.ts        # good-vs-bad discrimination (live inference: two judge calls per assert type)
```

## Doctrine (from Anthropic; encode, don't restate)

- Deterministic first; judges are debt. "Prefer deterministic graders where possible, use LLM graders where necessary." Every judged assert carries a retirement plan: calibration against the user's labels, disagreements mined into deterministic asserts, and a per-suite judged residue reported every run and expected to fall.
- Grade outcomes, not paths. Agents find valid approaches designers did not anticipate. Transcript analysis is for quality signals only, never pass/fail.
- Capability suites start low and graduate; regression suites target ~100% and gate on pass^k. SuiteManager tracks saturation.
- Statistics or it didn't happen. Every score ships with SEM and a 95% CI, never a bare mean; comparisons are paired-difference only; null results check power first; clustered cases use clustered SEs.
- Judge discipline: the judge is never the generator, one dimension per judge, anchored scales, reason before score, UNKNOWN is a miss, and a suite earns the cheap judge only on an EARNED record (thresholds in the Calibrate.ts row above; authoring rules in CreateJudge). Raw agreement alone rewards a constant judge on a skewed set, which is why kappa and per-class counts are part of earned.
- A judged suite with no earned record is PROVISIONAL and says so everywhere. EvalRunner's report carries `provisional`, its age in days, and the reason (red past 30 days). Nothing blocks, but the count stays in sight.
- Eval integrity is adversarial (contamination post, 2026-03). Never publish suite cases as examples; identity-bound suites stay in your own data folder; assume anything published is trained on.
- Never trust a score until you read the transcripts. Every run persists them to `$AGENT_SKILLS_HOME/assay/Results/<suite>/<run>/run.json`.

## The image lane (visual evals)

Suite-scoped rubric provider selection, private-image consent, capability probes and failure behavior follow [Vision judge providers](References/VisionJudgeProviders.md). The default rubric judge is the OpenAI + Anthropic panel (see Gotchas); any other provider requires its own current calibration. Image cases share the text runner's prerequisite contract (see Gotchas), and a skipped judgment can never count as catching an adversarial fixture.

Images are graded, never generated, by `Tools/ImageEvalRunner.ts -s <suite>` over the same suite roots and result shape as text. Deterministic layer (`Tools/ImageAsserts.ts`, magick + tesseract, local, no egress): dimensions, aspect, format, max-bytes, luminance bands (dark-ground rule), `ocr-contains`, and `ocr-word-ratio`, the mechanical garbled-text catch. Judged layer (`Tools/VisionJudge.ts`, the OpenAI + Anthropic panel by default; Gemini only when a suite's config entry names Google, on `--public`, or for pairwise): anchored `vision-rubric` asserts (trials apply to judged asserts only; deterministic image checks run once), a `pairwise` CLI for which-of-two verdicts (Gemini only; see Gotchas), and the meaning ladder (`meaning-ladder` asserts; `VisionJudge.ts describe` then `ladder`). The ladder's blind describer sees the image and nothing else (no article, thesis, or title); a text judge then grades the description against the case's `reference:` argument summary on four anchored rungs (unrelated · topic only · argument · specific claim) and never sees the image. Worked shape: assert gate → blind describer → meaning ladder → flipped `Tournament.ts`. A result records generator, describer, and judge ids and flags a same-family pair. `Suites/art-quality-template.yaml` is a starting image suite.

Identity guard: images carrying the user's likeness are not sent to the vision judge pending explicit clearance. VisionJudge refuses `/headshot/i` paths without `--allow-identity`, suites default `allow_identity: false`, and deterministic asserts remain available for everything. Taste guard: pure-taste dimensions ride pairwise plus the user's ratification (the `calibrate` skill), never absolute auto-grades.

## Project integration

- Config-change regression: after the instructions your agent runs under change (AGENTS.md, CLAUDE.md, a system prompt), run `ASSAY_SYSTEM_PROMPT_FILE=<that file> bun <assay>/Tools/EvalRunner.ts -s core-dispositions` (or the suite named by `config_change_suite` in `$AGENT_SKILLS_HOME/assay/config.json`).
- Specs: in a project built with the `development` skill, every criterion carries a check in the spec's `## Test Strategy`; a row typed `eval` runs `EvalRunner.ts -s <suite>` and its pass^k verdict is the criterion's evidence; `pairwise` runs `Tournament.ts` and its stable winner is the evidence. A per-criterion `eval` row is required for behavioral, quality, and regression criteria. Judged rows run after the criterion's asserts pass; a gated row is never dispatched and never a pass.
- Skills: a skill's own suites live in its `Suites/` folder (the `fabric` skill ships its suites there) and run by path or through `ASSAY_SUITE_DIRS`. A suite points at another installed skill with `system_prompt_file: "skill:<name>/SKILL.md"`.
- The `calibrate` skill: a suite reads its taste profile (`$AGENT_SKILLS_HOME/calibrate/Targets/<suite>/Taste.json`) on every judged assert; `calibration: none` opts out.

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/assay/PREFERENCES.md` (default `~/.agent-skills/assay/`) and override the defaults here; when absent, the defaults stand. The same folder holds the user's own suites (`Suites/`, identity-bound ones included), run results (`Results/`), calibration sets and records (`Calibration/`), `config.json` and the optional `vision-judge.json`. First-time setup (providers, keys, config, a proof it works) is in [Setup.md](Setup.md).

## Gotchas

- Assert-only runs (CI, a fast loop) set `ASSAY_INFERENCE_DISABLED=1`; the vision judge refuses calls under that flag before loading credentials or contacting a provider, and agentic runs refuse a live adapter.
- A lane-liveness suite needs its own `system_prompt`. Under a full agent prompt the assistant may treat "reply with exactly one word" as a format conflict and refuse, a real answer to the wrong question. Suites that test plumbing rather than behavior set a minimal echo `system_prompt`.
- The single-shot agent under test narrates tool calls. EvalRunner injects an `[EVALUATION CONTEXT] no tools, answer directly` suffix; keep it when authoring output-graded cases. Tool-dependent properties belong in RunAgentic.
- The judge default is dynamic. No judge keys in the suite → the level measured by its current EARNED calibration record, else 'high'. Explicit `judge_model`/`judge_level` always wins. A model bump, rubric edit or label edit makes the old record provisional until Calibrate re-runs; earning at medium or high never certifies low.
- Regression pass/fail changed at v2.0.0: the gate is pass^k ≥ threshold (was mean ≥ threshold). Historical `passed` values are not comparable across the boundary.
- A judged suite keeps an adversarial fixture, and the runner grades it every run. Text: `adversarial_output:` on a case, a canned output that passes every deterministic assert on that case; the judge must fail it or the suite fails (`adversarial.missed` in the result). Image: a case with `expect: fail`, an unrelated image that passes the deterministic asserts and must land below the judged threshold. `SuiteManager.ts validate` rejects a judged suite with neither, and rejects a fixture that fails its own deterministic asserts. Without one, a green suite proves nothing about the judge.
- Order matters to a pairwise judge. `judgeTextPairwise` and `VisionJudge pairwise` judge one ordering; only `Tournament.ts` flips. A single unflipped pairwise call is a position-bias measurement, not a preference.
- Deterministic asserts are prerequisites, for text and image alike. They default to `required: true`, run before any judge whatever the YAML order, and a failure skips the judges and zeroes the trial. Suites that relied on deterministic partial credit must opt in with `required: false`, and their scores before and after that change are two series. `is-json` checks the whole output; `contains-json` checks an embedded fragment.
- A judge, rubric, or anchor edit breaks score comparability. Recalibrate and treat the trend as two series.
- The judge and the subject should come from different vendors: set `ASSAY_JUDGE_VENDOR` to the other vendor than `ASSAY_SUBJECT_VENDOR`; EvalRunner warns when they match.
- `claude plugin eval` is a Claude Code command whose flags and schema can change between releases. Wrap it, never bind our suite format to its schema, and probe `--help` again before relying on flags.
- Legacy v1 suites (`tasks:` format) are diagnosed, not run. EvalRunner returns a named error result so callers degrade loudly, never silently.
- Image suites with no entry in `vision-judge.json` are judged by the OpenAI + Anthropic panel: both vendors judge each trial, it passes only when both pass, the score is the lower, and a missing vendor gives no verdict. Google is never the default seat; a suite reaches Google only when its config entry names it.
- `bun test` with a bare relative path silently drops every child process's stdout and stderr in Bun 1.3.6, so spawn-based tests fail with empty output. Always prefix the path with `./`.
- Image tournaments and `VisionJudge.ts pairwise` judge on Gemini alone (`judgeImagePairwise` in `Tools/VisionJudge.ts`). Private material reaches Google only when `ASSAY_PRIVATE_VENDORS` includes `google`; otherwise every private image tournament exits 2 verifier unavailable, and `--public` declares the images public. A pairwise run needs `GOOGLE_API_KEY`; without it the tournament exits 2.

## Examples

**Example 1: Run a skill's suite**
```
User: "run the extract-wisdom eval"
→ RunEval intent
→ EvalRunner.ts -s extractwisdom-contract
→ pass^k with SEM and CI, provisional until calibrated, the failing cases with their transcript lines
```

**Example 2: Ask whether a judge can be trusted**
```
User: "is the art-meaning judge any good?"
→ Calibrate intent
→ Calibrate.ts against the user's labels for that suite
→ an earned, proxy or stale record with agreement, kappa and per-class counts against the floors
```

**Example 3: Pick the better of three drafts**
```
User: "which of these three intros reads best for a skeptical reader?"
→ CreateJudge (the question from the spec's Principles), then Tournament.ts --candidates a.md,b.md,c.md --question "..."
→ a stable winner on the flipped bracket and the shuffled rerun, or "unstable" with both winners named
```
