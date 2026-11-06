# CreateSuite Intent

**Contents:** Ideal State · Anti-criteria · Inputs · Tool contract · Safety gates · Gotchas

Author a new v2 eval suite.

## Ideal State

- The suite parses and runs: `EvalRunner -s <name> -t 1` completes.
- A skill suite's rubric comes from its intents' Ideal State by default: one `llm-assert` per Ideal State bullet and one `not-llm-assert` must-not per Anti-criteria bullet, each with `derived_from` lineage to the intent (`<intent path>#IS-n` / `#AC-n`). A project suite's rubric comes the same way from its spec's acceptance criteria (`<spec path>#<criterion id>`). Hand-written asserts cover only what the bullets do not.
- Its cases came from reality (real failures and real use), not invented scenarios.
- Its asserts are as deterministic as the property allows; every judged assert is one the author tried and failed to express deterministically.
- It is balanced: at least one should-not case.
- A judged suite keeps an adversarial fixture that passes its deterministic asserts and only the judge can catch.
- For a capability suite, a reference solution exists proving each case is solvable.
- A suite for video or motion output says how the motion reaches a judge: sampled frames through the image lane, or a blind describer's detailed description of the motion graded against the case's `reference:` the way the meaning ladder grades an image. A suite whose judge never saw the motion or a description of it is not a motion eval.
- Its quality survives the two-experts test: two domain experts reading a case would independently reach the same pass/fail verdict.

## Anti-criteria

- A suite that regenerates something that already exists on disk: judge the existing file with one case whose prompt carries it (or a `system_prompt` that does), not a generating suite.
- A hand-written rubric that restates an intent's Ideal State bullets instead of generating it from them.
- Suite cases published as worked examples, real case prompts pasted into public artifacts, or identity-bound suites in a public repo.
- A case whose pass condition needs a tool call in the single-shot lane.
- A case kept that never passes without a reference solution proving it solvable.

## Inputs

**Suite or single check.** A suite exists to generate output: each trial calls the agent under test and grades what comes back, which is why pass^k needs it. When the thing to judge already exists (a file, a rendered page, a diff, a log tail, a query result), it needs no generation: check it with code when code can answer, else one judged assert over that state, shaped as a yes/no (`llm-assert`), a choice, or an anchored score (`llm-rubric`) (CreateJudge). Output generated per trial takes a suite.

**Sourcing (Anthropic roadmap, encoded).**

- Seed from 20–50 real failures, not invented scenarios — effect sizes are large early, so small curated sets beat big synthetic ones. `FailureToCase.ts` appends a case skeleton per failure to a `_drafts` suite.
- When two experts' verdicts on a case disagree, diagnose before revising: distinguish an ambiguous criterion from a mistaken judge or label. Preserve the intended standard and check revisions on held-out labeled outputs.
- 0% pass@100 usually means a broken task, not a hard one.
- Balance: test where the behavior should fire and where it should not (`negative: true` documents the should-not case). One-sided suites train one-sided optimization.
- Edge cases worth deliberate coverage (docs taxonomy): irrelevant/nonexistent input, overly long input, harmful input, typos, sarcasm, contradictory signals, ambiguity.

## Tool contract

**A skill suite from its intents (the default rubric).** The intent's `## Ideal State` and `## Anti-criteria` are the rubric, so the definition of done the model reads is the one its output is graded on. Write it by hand, mechanically:

1. Read the intent file. Number its Ideal State bullets `IS-1…` and its Anti-criteria bullets `AC-1…` in order.
2. For each Ideal State bullet visible in one text answer, add an `llm-assert` whose value is the bullet restated as a claim about the output, with `derived_from: <intent path>#IS-n`.
3. For each Anti-criteria bullet, add a `not-llm-assert` with `derived_from: <intent path>#AC-n`.
4. Point the suite at the skill: `system_prompt_file: "skill:<skill-name>/SKILL.md"` (resolved through `<SKILL_NAME>_SKILL_DIR`, else the sibling skill folder) or a path relative to the suite file.
5. Run `bun <assay>/Tools/SuiteManager.ts validate <suite>`.

Hand-written asserts (deterministic first) follow the derived ones; when the intent changes, re-derive the asserts rather than editing them by hand.

**Schema.**

```yaml
name: my-suite
type: capability            # starts low, hill to climb; graduates → regression at saturation
pass_threshold: 0.75        # regression gates on pass^k, capability on mean
# model under test: ASSAY_SUBJECT_MODEL / ASSAY_SUBJECT_VENDOR, else the inference helper's default at agent_level;
# agent_level: high         # only to test one level on purpose (Compare arms use it)
# judge: omit both keys for the calibrated-cheap default (the earned record's measured level, else high);
# judge_model: sonnet       # alias/id, resolved via JudgeLevel.ts, capped at high
# system_prompt_file: "skill:<skill-name>/SKILL.md"   # or a path relative to this file
trials: 3
cases:
  - id: descriptive_name
    prompt: "the user turn sent to the agent-under-test"
    assert:
      - type: not-icontains          # deterministic first — free, objective
        value: "should work"
        weight: 1
      - type: llm-rubric             # judged only where code can't reach; anchor the scale
        weight: 2
        value: "Does the output tie any done-claim to evidence?"
        anchors:                     # every level 1..scale: anchored scales beat bare ones
          "1": "claims done with no evidence named"
          "2": "names evidence for some done-claims only"
          "3": "names evidence but doesn't tie it to the claim"
          "4": "ties most done-claims to evidence"
          "5": "every done-claim cites its specific evidence"
  - id: should_not_case
    negative: true
    prompt: "..."
    assert: [...]
```

Deterministic types: `equals, contains, icontains, contains-all, contains-any, regex, starts-with, ends-with, is-json, contains-json, max-length, min-length`, each with `not-` negation. Judged: `llm-rubric` (1–5 → 0–1, threshold default 0.6), `llm-assert` (NL assertions, all must be TRUE, UNKNOWN = miss), and their `not-` forms.

Deterministic asserts are prerequisites that run before any judge (SKILL.md § Gotchas); set `required: false` only for a deliberately optional, weighted quality check. Model assertions remain weighted by default; set `required: true` when their own verdict must pass regardless of the average. Persisted results retain YAML order and mark skipped judgments.

**Placement.**

- Generic suites for this skill: `<assay>/Suites/{Capability,Regression}/<name>.yaml`.
- A skill's own suites: that skill's `Suites/` folder (e.g. the `fabric` skill's `Suites/`), run by path or listed in `ASSAY_SUITE_DIRS`.
- Identity-bound suites (the user's dispositions, voice): `$AGENT_SKILLS_HOME/assay/Suites/` — never a public repo.
- Drafts from FailureToCase: `$AGENT_SKILLS_HOME/assay/Suites/_drafts/`, promoted once sharpened.

## Safety gates

Contamination hygiene (eval-awareness doctrine, 2026-03): eval integrity is adversarial, and a capable model under eval has located and decrypted a published answer key. Never publish suite cases as worked examples in docs or posts; never paste real case prompts into public artifacts; keep identity suites in your own data folder. Assume anything published is training data for the thing being measured.

## Gotchas

- The agent-under-test runs single-shot with a no-tools suffix; a case whose pass condition requires a tool call cannot pass — write cases observable in one text answer, or take the agentic lane (RunAgentic).
- An Ideal State bullet that describes something invisible in one text answer (a file written, a tool called) cannot pass single-shot either: sharpen the bullet, or run that intent in RunAgentic.
- Suites sharing a source document should note it — clustered cases understate uncertainty (`Stats.clusteredSem`).
