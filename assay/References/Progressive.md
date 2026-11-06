# Progressive verification

## Outcome

Each criterion gets evidence of the right kind at the right time. Ordinary checks are fast and token-free; scheduled integrity checks and explicit build checks spend only on the judgments the criterion needs. Use the project's existing runner, CI and scheduler for timing; never add a parallel scheduler.

| Occasion | Evidence | Execution |
|---|---|---|
| Development loop, critical checks | Small deterministic behavioral asserts, including known-bad fixtures | The project's test runner (`bun test ./<path>`, `npx vitest run`, …); set `ASSAY_INFERENCE_DISABLED=1` so nothing calls a model |
| Slower or scaled testing | Integration, property and load asserts | The same runner on its slow lane (a CI job, a nightly target); inference still disabled |
| Scheduled semantic integrity | Calibrated rubric on the remaining quality criterion | `bun <assay>/Tools/EvalRunner.ts -s <suite>` on a justified cadence from the project's scheduler or CI |
| Explicit change verification | Relevant asserts, then the selected judged suites | Asserts first; `EvalRunner.ts -s <suite>` only after they pass |
| Candidate selection | Flipped tournament and independent acceptance checks | `bun <assay>/Tools/Tournament.ts --candidates … --question …` |

Each criterion resolves at the cheapest honest tier: a code assert, then a model judge, then the user. `<assay>` is this skill's folder; the `development` skill's Test intent runs a spec's rows this way.

Stage is dependency order, not intelligence. A higher stage runs only when every lower prerequisite for that criterion passed on the same evidence.

## Escalation inside a judged assert

There is no escalation ladder of judges. A judged assert runs the model judge at the suite's calibrated level (else 'high'). The one exception is a format repair: a cheap judge that returns an unparseable verdict gets one retry at 'high'. There is no retry-until-pass. A quality failure stays a failure, and a stronger judge is chosen only when calibration shows the cheaper level is inadequate. Uncalibrated runs stay provisional.

## Skills

A skill's suites live in its own `Suites/` folder (or in this skill's `Suites/Capability/` for older ones) and run by path or through `ASSAY_SUITE_DIRS`. Deterministic commands run first; named suites run after commands pass. Manual exceptions remain observations owed. A suite-only skill cannot report a successful fast test with zero executed checks. Skill-wide evidence covers only the behaviors its cases exercise.

```bash
bun <assay>/Tools/EvalRunner.ts -s path/to/skill/Suites/<suite>.yaml
ASSAY_SUITE_DIRS=path/to/skill/Suites bun <assay>/Tools/SuiteManager.ts list
```

## Actual harness context

Tool-free EvalRunner measures answers. Suites needing skills, identity, tools or session state declare `requires_context: [skill, identity]`. Plain EvalRunner refuses those suites before inference. `Tools/Agentic.ts` exports `runAgenticSuite(name, adapter, requiredContext, overrides, deps)`: the same grader with a fresh scratch workspace per trial and persisted actual-model, context-hash and final-state evidence.

The adapter invokes the production harness and reports what it actually loaded. It owns sandboxing, tool permissions and cleanup outside the supplied workspace. Fixtures are synthetic; real-world mutations are excluded. Durable evidence lives outside the temporary workspace. A fabricated receipt is not evidence. With/without comparisons differ only in the named skill; shared context must load in both arms. `../Intents/RunAgentic.md` records the standalone-plugin limitations.

## Evidence and timing

Rerun affected checks after changes to skills, suite inputs, execution code or models. `latest.json` keeps the last valid score; an unavailable attempt is kept as run history beside it, never over it. Overrides and injected adapters are separate experiments (stored under `Results/experiments/`), not certification of the default suite. Status refreshes never regrade.

Deeper evidence is due on a relevant change, explicit request or declared cadence. Missing evidence stays open without forcing a model call on every spec edit.
