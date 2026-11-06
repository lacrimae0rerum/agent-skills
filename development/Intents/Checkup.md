# Checkup — why is it red, is the spec still the truth, and what does production say?

A full health check of an app against its spec. Checkup joins what the repo knows (the spec, the code, the rows) with what the world reports (the app's live health checks, alerts, bug reports and user complaints, open security findings), says why every red criterion is red, and repairs the spec side until the spec tells the truth again. Test runs the criteria and reports; Checkup is the run that acts on the answer.

## Ideal State

- The report rests on a `Tools/Checkup.ts` bundle gathered before any repair, plus the production signals gathered by hand (Inputs), and names every source the bundle lists under `unavailable` and was not gathered by hand as unchecked, never as clean.
- The criteria results come from Test's tool contract (`Intents/Test.md`), run at the depth the Inputs table gives for the user's words; Checkup never re-implements a criterion check.
- Every criterion that is red (failing in the app's live health checks, failing under Test, or open on a deployed app) carries exactly one cause from Output format § Causes, with the evidence that decided it.
- Each cause has its repair in the spec: a broken row is fixed and re-run, a criterion with no executable check gets one at the cheapest honest tier and is run, a criterion that passes but was never ticked is ticked with an evidence stub, and an obsolete criterion is tombstoned with a Decisions row saying why.
- Every recent signal (alert, bug report or complaint, open security finding) that no criterion covers becomes a new criterion with a Test Strategy row, or is dispositioned in the report as noise or out of scope with a reason.
- A complaint about something a passing criterion claims works is treated as a missed check: the criterion's row is tightened or a new row added until it fails on the defect the user saw, and the criteria were re-read against the spec's `## Goal` for drift.
- The spec meets the current template after the run: `SpecCheck.ts bar` and `SpecCheck.ts conform` show no finding the run could fix within its scope, and the remaining count is in the report.
- Criteria whose code is wrong (cause `code`) are listed in the report as Modify work, each with its failing evidence; they are fixed in the same run only when the user asked for fixes.
- Checkup's last step, after the verdict and the red counts exist, is `bun "$DEV/Tools/SpecCheck.ts" stamp <spec> --verdict <verdict> --before <n> --after <m>`. It writes the `checkup:` frontmatter key, so the next Checkup and the user can see when the app was last examined, and it earns `spec_format` only when conform is clean. A run that stops early writes no stamp.

## Anti-criteria

- No criterion turns green because its wording or its row was softened; a row change that makes a red criterion pass must still fail on the defect it was written to catch, shown by a negative control (run the repaired row against the broken commit, a mutated copy, or a fixture with the defect).
- Checkup never writes production, deploys, or edits application code unless the user asked for fixes, and then the code changes go through Modify.
- A change to the spec's `## Goal` never lands without the user's yes.
- A signal is never matched to the app on name alone and acted on unread: signals are matched by name, so each matched signal is read before it becomes a criterion.
- "Audit", "review" or "assess" in the user's words means a report with no spec writes.

## Inputs

| The user says | Depth |
|---|---|
| "audit the spec", "review", "assess" | Report only: gather, Test default depth, causes, proposed repairs. No writes. |
| "checkup", "health check", "get everything in sync" (default) | Gather, Test default depth, causes, spec repairs, new criteria from signals. |
| "full checkup", "and run the evals" | As default, with Test's judged rows. |
| "... and fix it" | As default, then the `code` list goes to `Intents/Modify.md` in the same run. |

The signal window defaults to 14 days; the user's own window ("since the launch", "this month") overrides it.

Production signals `Checkup.ts` does not gather, collected by hand for the window, each read before it is used:

- **Live health checks:** the app's monitor or uptime results. When they are in a JSON file (`{ "status": "red", "failing": ["AC-3"] }`, or a map of app name to that shape), pass it as `--monitor <file>` and the bundle carries it.
- **Alerts and incidents:** error tracking, logs, uptime alerts.
- **Bug reports and complaints:** the issue tracker (for example `gh issue list --state all --search "<app>"`), support messages, the user's own reports.
- **Security findings:** open findings from the project's scans, audits or dependency alerts.

When a source cannot be reached (no access, no such tool), it stays listed as unchecked.

## Safety gates

- `SpecCheck.ts write-probes` runs before any row touches production (Test's gate); a row it flags runs against local or staging only.
- The main session is the spec's only writer. Lanes read and return causes and proposed edits; they never write the spec.
- A peer session's uncommitted edits in the spec are left alone and reported.

## Tool contract

```bash
DEV="<development>"   # this skill's folder
bun "$DEV/Tools/Checkup.ts" <repo> [--spec <path>] [--since 14d] [--name <alias>]... [--monitor <file>] [--json]
#   one read-only bundle: spec standard (SpecCheck bar, write-probes, conform), code (git, Inventory sync),
#   production (the --monitor file when given); everything else is listed as unavailable until gathered by hand
#   --name adds an alias when the app is monitored or reported under another name; exit 0 gathered, 2 bad input
bun "$DEV/Tools/SpecCheck.ts" conform <spec> [--json]   # does the spec use the latest template; names what is missing
bun "$DEV/Tools/SpecCheck.ts" stamp <spec> --verdict <verdict> --before <n> --after <m>
#   the last step: writes frontmatter checkup:, and spec_format only when conform is clean; exit 0 written, 2 bad input
```

Criteria results: the commands in `Intents/Test.md` § Tool contract, at the depth above.

Execution follows SKILL.md § Execution. The tier comes from the red criteria and uncovered signals in scope, grouped by Feature, never from the spec's size: a few red criteria in one Feature is tier 1 or 2, red spread across many Features is tier 3 or 4.

## Gotchas

- **Read the live state, not only the last report.** A results history can be empty for an app while its current health-check state holds many failing criteria; read the current state first.
- **Complaints copied with conversation context match far too much.** When a bug report or complaint carries pasted context (a transcript, a log dump), match only the complaint's own text: whole-record matching once pulled 41 unrelated entries for one app where 12 were real.
- **A pass belongs to one revision of the criteria.** Check `git log -- <spec>` for edits since the last run (a peer session may have added criteria) before calling anything open or closed.
- **A generic app name pulls strangers.** Name matching is whole-word, but a common word used as an app name can still match unrelated entries; read before acting.
- **Large specs have more template findings than one run can fix** (one large app: 902 `bar` findings, 519 unnamed surfaces). Red on production comes first, then uncovered signals, then template findings; the rest is counted in the report, not dropped silently.

## Output format

1. **Verdict.** `healthy`, `drifting` (green but the spec misses what the signals show) or `red`, with red criteria before and after.
2. **Evidence.** One line per source with its count, and every unavailable source named as unchecked.
3. **Red criteria.** A table: criterion, cause, the evidence that decided it, what was done.
4. **Signals.** Each matched signal: the criterion it became, the criterion that already covers it, or why it was set aside.
5. **Spec standard.** Findings fixed and findings left, by kind.
6. **Modify work.** The `code` list, or what Modify changed when fixes were asked for.

### Causes

| Cause | What is true | Repair |
|---|---|---|
| `code` | The criterion is right and the app fails it | Listed as Modify work |
| `row` | The probe is wrong: moved file, stale URL, flaky, asserts the old behavior | Fix the row, re-run, prove it still catches the defect |
| `no-check` | Only a `manual` row, or none: it was never measured | Write the cheapest honest row and run it |
| `unrecorded` | It passes now; the spec never ticked it | Tick with an evidence stub |
| `environment` | The verifier could not run: auth expired, rate limit, service down | Skip, name the fix; never a pass or a fail |
| `obsolete` | The behavior was removed or replaced on purpose | Tombstone with a Decisions row |

## Examples

User: "Why are all these criteria red on <app>?" → Checkup → the 24 health-check failures each carry a cause; rows fixed and re-run, `unrecorded` ones ticked, `code` ones listed for Modify, and the verdict shows red before and after.

User: "Audit the <app> spec" → Checkup, report only → the same report with proposed repairs and no spec edits.

User: "Health check <app> and fix it" → Checkup, then Modify on the `code` list in the same run.
