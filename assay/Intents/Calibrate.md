# Calibrate Intent

Judge governance: calibrate a suite's judge against user-labeled ground truth, mine judge↔user disagreements into deterministic asserts (the shrinkage doctrine), and turn a judged miss into one more judged assert plus a kept case.

## Ideal State

- Every suite that uses model-graded asserts has an EARNED calibration record against the judge chain that runs today: a user-labeled set of real outputs (pass/fail per judged assertion, at least two of each) at measured agreement ≥ 85% and Cohen's kappa ≥ 0.40 (the one definition, `Tools/lib/Calibration.ts`; `ASSAY_FLOOR_AGREEMENT` and `ASSAY_FLOOR_KAPPA` override the floors).
- Each class is checked separately, because raw agreement alone rewards a judge that always says pass on a skewed set; kappa is what catches a constant judge.
- An image record also binds the exact local artifact bytes, resolved case and reference, and the vision/meaning-ladder pipeline; a changed image, reference, model, or prompt makes it stale.
- An earned record gives the suite the calibrated-cheap judge: with no judge keys, EvalRunner runs the judge at the level the earned record was measured at (SKILL.md § Gotchas, the judge default).
- Each disagreement is diagnosed without changing the intended standard to improve agreement: the criterion may be ambiguous, the judge may be wrong, or the label may need the user's review. The owning spec (when the set names one) records the assertion, both verdicts, which side moved (criterion, judge, or label), and why in a dated `· calibration` block under `## Calibration Log`.
- A judged assert that answered wrong, or a criterion that needed a check it lacked, ends as one more small assert plus a kept labelled case, never a longer rubric.
- The report names which labeled set was used (calibration or reserved holdout) and the provenance of its labels.
- Labels from a named rater other than the user (for example, a collaborator's blind ratings) carry that rater's name in `label_source.labeler` and are reported as that rater's agreement. The record stays proxy: those labels never read as the user's, never merge with assistant labels, and never make a record earned.

## Anti-criteria

- Delegated or assistant labels attributed to the user, or assistant agreement described as independent human validation.
- A criterion, rubric or label changed to raise agreement rather than to preserve the intended standard; a label changed without the user's review.
- Calibration files (real outputs, the user's judgments) in the public skill folder or any public repo.
- A reserved set that was inspected while tuning reported as a fresh holdout (it is regression evidence now; validating the revision independently needs freshly reserved examples).

## Inputs

The calibration set:

- 10–20 real outputs for the suite's judged assertions, pulled from `$AGENT_SKILLS_HOME/assay/Results/<suite>/*/run.json` transcripts (real beats synthetic; supplement with 2–3 deliberately bad outputs so the set has both labels).
- The user's labels when supplied (`label_source: { kind: user }` on each entry; the `calibrate` skill's review page collects scores that can seed them). If the user delegates initial labeling, the assistant may supply a working baseline with an explicit labeler, delegation provenance, reason and review status on each entry. Keep an unmeasured working baseline in `Calibration/WorkingBaseline/`; selecting it for a calibration run uses `ASSAY_CALIBRATION_DIR` and does not activate it for production suites.
- The set file `$AGENT_SKILLS_HOME/assay/Calibration/<suite>.yaml`, shaped `{ spec: <path of the spec that owns the criterion>, claim: <criterion id>, entries: [...] }`. Text entries are `{output, assert, label: pass|fail, note?, moved?, why?}`. Image entries are `{image: {case_id, artifact, reference}, assert, label: pass|fail, note?, moved?, why?}`: `case_id`, local `artifact`, assertion, and effective reference must match a resolved image-suite case. The runner reads the artifact itself through ImageEvalRunner; cached blind descriptions and text substitutes cannot certify the image pipeline. `note` explains WHY and seeds the mining; `moved: claim|judge|label` and `why` are filled in after each disagreement is mined. `claim` means the criterion. (A bare entries list still parses; it just cannot route its log block to a spec.)
- Reserved labeled outputs, set aside before tuning the rubric, in a separate calibration directory under the same suite filename; `ASSAY_CALIBRATION_DIR=<held-out-directory>` selects those labels while `-s <suite>` continues to resolve the actual suite. The tool does not enforce a train/holdout split; report which set was used and preserve that separation. Human review remains available even after the judge earns calibration.

Labels assess one named assertion, not the whole skill. Source-dependent assertions carry the actual source in `reference:` so the executing judge can assess grounding. Synthetic anchors establish clear starting boundaries; they do not replace representative real outputs or held-out evaluation. Repeated labels on the same artifact are not additional examples. Before activating delegated labels, inspect measured disagreements and report the label provenance alongside the result; the user's review remains distinct from delegated labeling.

The shared validator rejects repeated output content for the same criterion and identical image bytes under different filenames. The same output may be assessed against different criteria; those labels still represent one output, not independent tasks. A promise such as “I did not invent details” is not grounding evidence: labels must check the actual statements against their source, and visual labels must check the relationship encoded by arrows or axes against the stated claim.

## Tool contract

```bash
bun <assay>/Tools/Calibrate.ts -s <suite> [--level low] [--json] [--append-log]   # run calibration; write result.json + <suite>.log.md; --append-log appends the block to the set's spec:
bun <assay>/Tools/Calibrate.ts --recheck                                           # re-run every STALE record over stored labels (after a model, prompt or rubric change); prints a notice for any suite that dropped below the floor
bun <assay>/Tools/Calibrate.ts --residue                                           # judged-residue shrinkage report + unlineaged judged asserts (no derived_from) + proxy records
```

`<assay>` is this skill's folder. Calibration calls the judge once per label through the inference helper; say how many calls a set will cost before a large run.

### The miss loop

When a judged assert answers wrong, or a criterion needed a check it did not have, the fix is one more small assert plus a kept case: add the output to the calibration set with the user's label and a `note`, add the missing assert to the suite (deterministic when it can be), and re-run `Calibrate.ts -s <suite>`. `Tools/FailureToCase.ts` turns one real failure into a draft case. No threshold is ever typed on the command line: the floors live in `Tools/lib/Calibration.ts`.

### Pairwise calibration

Delegated preference labels use the same per-entry `label_source` contract as rubric labels. Pairwise records and tournament output report `label_basis` and `human_validated` separately; agreement with assistant labels is not independent human validation. Provenance changes invalidate the record along with label or candidate changes.

`PairwiseCalibrate.ts --calibration <set.yaml> --json` accepts `{mode: text|image, question, examples: [{a, b, label: A|B|tie, note?}]}`. The question is the exact tournament criterion; candidates follow Tournament's file-or-text semantics. Use absolute file paths for portable local evidence. User labels cover at least two distinct examples of each outcome; reversed duplicates are not additional examples. Both orders run through the existing pairwise judge. Agreement of at least 85% and multiclass kappa of at least 0.4 are required. `--judge <model id>` calibrates one pinned text judge (`JudgeCall.namedJudge`), so judges can be compared on the same labels; `--concurrency <n>` judges that many examples at once and keeps verdicts in set order.

The record is stored beside the set as `<set.yaml>.pairwise.result.json`. `Tournament.ts --calibration <set.yaml>` checks its criterion, modality, labels, candidate bytes, implementation and configuration before reporting calibration. The candidate corpus must remain unchanged; the calibrated criterion may compare new tournament candidates. Provider-reported model IDs remain separate from configured IDs. Stable selection still does not establish absolute quality. Pairwise rechecks are explicit through this command; the rubric `Calibrate.ts --recheck` does not renew these records.

## Gotchas

- A disagreement in the REVIEW DISAGREEMENTS list that can be expressed deterministically becomes a candidate assert. Leave unresolved disagreements undecided (no `moved` value), re-run with `--append-log` for the owning spec, and validate revisions on the reserved labeled outputs.

- A suite reads the `calibrate` skill's taste profile when a calibrate target with its name (or its `calibration:` field) has a `Taste.json`: `EvalRunner` appends the profile to every string-valued judged assert. The rubric text changes, so this suite's record goes stale until re-measured. `calibration: none` opts out.

- Image rubric provider changes follow [Vision judge providers](../References/VisionJudgeProviders.md); a public capability probe proves image support, while authorized private calibration measures grading quality.

- Passing visual anchors are cumulative: clarity never excuses contradictory arrows, axes or captions. Separate communication defects from aesthetic preferences so a plain, correct chart does not fail an unrelated novelty test.

- Agreement is measured at the level you pass (`--level low` is the starting point); calibrating at 'high' then running at 'low' proves nothing.
- Runtime uses the earned record's measured level. A failed low-tier measurement can justify comparing the next supported tier on unchanged labels; retain the losing measurement and validate the chosen tier separately.
- Only the interactive run appends to a spec (`--append-log`). `--recheck` writes `<suite>.log.md` beside the record and never touches a spec — an unattended job must not rewrite a spec nobody is reviewing.
- Image calibration executes `vision-rubric` and `meaning-ladder` through their real paths, including deterministic prerequisites. Failed prerequisites cannot supply a negative judge label. Explicit `judge_model` overrides remain unsupported by the level-based rubric calibration runner.
