# Test — is the spec sound, does the code match it, does every criterion pass?

Reads an application and its spec and reports, criterion by criterion.

## Ideal State

- The report has the four parts in Output format, in order: well formed, sync, criteria, the read.
- `SpecCheck.ts write-probes` ran before any criteria row; when it found a production write row, no criteria row ran and the report lists those rows with the local or staging target each should use.
- The sync part names the surface kinds the inventory cannot see, so a clean sync is never read as full coverage.
- Every criterion appears with its result at its tier, and provisional passes (a judged answer whose judge has not been calibrated against human labels, see the `assay` and `calibrate` skills) are listed apart from real passes.
- The read says in plain words which failures matter and whether the code, the spec, the row or the environment is what's wrong, one Feature at a time.
- The run depth matches the Tool contract table row for the user's words, and model judges ran only on a full test ("full test", "run the evals") or for a judged criterion about to ship.

## Anti-criteria

- Test never edits the spec or the code; fixing is Build's or Modify's job.
- No row that writes data runs against production.
- An unavailable verifier (exit 2 from a judged row: the judge could not run) is never reported as a fail; it is a skip.

## Safety gates

`SpecCheck.ts write-probes` flags rows that POST, PUT, PATCH, DELETE, insert, update or drop against a non-local target. Nothing else calls it, so this intent is the caller. Read-only rows against production are fine. Local means the URL host (localhost, a `.local` or `.test` name, or a host labelled staging or preview), not a word in the path or query. The check matches patterns, so a custom script that writes is not caught: read an unfamiliar row before it runs against production.

## Tool contract

| The user says | Run |
|---|---|
| "quick check", "is it in sync" | well formed, sync, fast asserts |
| (default), "test it" | every deterministic row, slow ones included; no model calls |
| "full test", "run the evals" | everything, judged rows included |

```bash
DEV="<development>"   # this skill's folder
bun "$DEV/Tools/SpecCheck.ts" write-probes <repo>/SPEC.md   # exit 1 = production write rows; see Safety gates
bun "$DEV/Tools/SpecCheck.ts" bar <repo>/SPEC.md
bun "$DEV/Tools/SpecCheck.ts" conform <repo>/SPEC.md
bun "$DEV/Tools/Inventory.ts" sync <repo> <repo>/SPEC.md     # exit 1 = gaps found, a result
```

Criteria: run each `## Test Strategy` row's command from the spec's folder (or `probe_cwd:`), one Feature at a time when asked for one Feature. Exit 0 is a pass, any other exit a fail, with the last lines of output as evidence. Independent rows may run in parallel (for example with `xargs -P 8` over the commands, or one background job per row). Judged rows (`eval`, `pairwise`) go to the `assay` skill's runner when it is installed (`bun <assay>/Tools/EvalRunner.ts --suite <suite>`: exit 0 pass, 1 regressed, 2 no verdict, which is a skip); without it they are reported as skips with that reason. `manual` rows report the newest recorded attestation, or `awaiting attestation`.

Each row resolves at the cheapest honest tier: code asserts first, then judged rows. A default Test typically runs in seconds; slow deterministic rows take longer.

## Output format

A report with four parts, in this order:

1. **Well formed.** The spec passes `SpecCheck.ts bar` (atomic criteria, one row each) and `conform` (every required section). Findings beyond those are listed, not blocking.
2. **Sync.** Surfaces the code exposes that no criterion names, and rows whose command points at a file that doesn't exist, from `Inventory.ts sync`, plus the surface kinds the inventory cannot see, so a clean sync is never read as full coverage.
3. **Criteria.** Every criterion with its result at its tier: pass, fail, skip (with reason), awaiting attestation, or provisional (a judged answer whose judge is not calibrated). Provisional passes are listed apart from real passes.
4. **The read.** Which failures matter, in plain words, and whether the code, the spec, the row or the environment is what's wrong, one Feature at a time.
