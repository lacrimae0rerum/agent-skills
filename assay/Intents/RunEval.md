# RunEval Intent

Run a suite and read the result honestly.

## Ideal State

- The headline is pass^k with its SEM and 95% CI; regression suites are judged on pass^k, capability suites on the mean.
- Every surprising score in the report, good or bad, cites the transcripts of the extreme cases it rests on, and those transcripts were read before the score was reported.
- An erroring suite is reported as unverified, the same operational fact as a failing one.
- A judge running at 'high' on a suite expected to be cheap is reported as uncalibrated, with the Calibrate intent named as the fix.
- When a suite's judged asserts carry `derived_from` lineage (`<spec or intent path>#<section>`), each failed assert is reported against the criterion or Ideal State bullet it came from.

## Anti-criteria

- A bare mean quoted without its interval.
- A score reported before its transcripts were read.
- Two runs on either side of a judge or rubric change compared as one series.

## Tool contract

`<assay>` is this skill's folder.

```bash
bun <assay>/Tools/EvalRunner.ts -s <suite> [-t trials] [--json]
# Exit 0 = passed, 1 = regressed, 2 = verifier unavailable (no run verdict; run.json kept as history; latest.json untouched). Your own suites resolve before the skill's; -s also takes a path to a suite file.
bun <assay>/Tools/SuiteManager.ts list      # what exists + last results
```

Every run persists full per-trial transcripts to `$AGENT_SKILLS_HOME/assay/Results/<suite>/<run_id>/run.json` (Anthropic gate: never trust a score until the transcripts are read).

Inputs the runner reads: `ASSAY_SYSTEM_PROMPT_FILE` (the agent instructions a suite runs under when it names none), `ASSAY_SUBJECT_MODEL` / `ASSAY_SUBJECT_VENDOR` (the model under test), `ASSAY_JUDGE_VENDOR` (the judge's vendor; pick the other vendor than the subject for a cross-vendor judge).

## Output format

- Lead with pass^k, SEM and the 95% CI, the requested and completed trial counts, the judge level and whether it is calibrated (`provisional` and its reason), and the judged residue. Then the cases that failed, each with the transcript lines that decided it.

## Gotchas

- The agent-under-test runs single-shot, no tools, with the suite's system prompt (or `ASSAY_SYSTEM_PROMPT_FILE`) — a config edit that shifts dispositions shows up; a property requiring tool use belongs in RunAgentic.
