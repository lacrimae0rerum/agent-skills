# Build — intent in, spec criteria, then code that passes them

Turns what the user wants into criteria in a spec, then builds until they pass. Covers a new project, a new feature, and an existing repo that has no spec yet.

## Ideal State

- Anything the user will see or use has a reference they approved before code was written (SKILL.md § Acceptance), and the spec links it.
- The spec points at the right thing: for a new project or a changed direction, `## Goal` records the date the user confirmed its one sentence and summary (show them the Goal and ask), and that date precedes the code; an existing spec whose direction is unchanged needs no re-confirmation.
- Criteria exist in the spec before the code that satisfies them. A new project's spec is written from the user's request in the shape of `References/SpecFormat.md` at `<repo>/SPEC.md` (or the filename in PREFERENCES.md); an existing spec is extended in place.
- An existing repo with no spec ends with every surface the inventory lists as a criterion, an open question, out of scope, or dropped with a reason, in a first spec drafted from the inventory and the code. Criteria read off the code are tagged `observed` until the user ratifies them, and that first spec's inferred Goal is confirmed by the user as a new project's would be.
- The spec lives in the repo it governs (default `<repo>/SPEC.md`); a draft written anywhere else is moved there before builders start, so every lane reads the same file.
- Every criterion is atomic and carries its check at the cheapest honest tier (SKILL.md purpose paragraph). `SpecCheck.ts bar` exits 0, and checking the spec takes seconds for asserts.
- Heard and inferred intent stay apart: anything filled in rather than heard is tagged `inferred` and listed for ratification.
- The code passes: every criterion in scope passes under Test (`Intents/Test.md`), and every new test was seen failing before the change made it pass.
- Where a second look was warranted (the spec names one for a Feature, or the change touches auth, payments, migrations, secrets or deploy), a model that did not build it checked it.
- The run ended with the independent code review on each deployable repo it touched, its blockers fixed inside the run (SKILL.md § Safety gates).
- A run whose work ships leaves the repo's release record current before the deploy, when the project keeps one: a version bump and a plain-words CHANGELOG entry naming the criteria that changed with the code, written in the same change as the spec edit.
- On large or high-blast work, a model that did not write the spec read its criteria for compound criteria, Features with no end-to-end criterion, and judged rows that would pass the wrong thing.
- Acceptance (SKILL.md § Acceptance) passed before deploy and again on the live thing after it.
- The spec records the run: criteria ticked with one-line evidence, judgment calls in Decisions, `status:` and `progress:` current.

## Anti-criteria

- No application code before its criteria exist, except a trivial change (a typo, a value, an obvious one-liner), which needs no spec edit.
- Never asks the user for a fact the repo, deploy state or earlier specs could answer.
- Behavior that looks wrong in an existing repo never becomes a criterion; it goes on a suspected-defects list.
- Never starts a second spec, or deletes a thin existing one, when one already exists for the project.
- Parallel builders never write the same files: each gets disjoint files or its own git worktree, and each shared registry (package manifest, lockfile, route index, migrations) has exactly one writer.
- Build never deploys (SKILL.md § Safety gates), and no row that writes data targets production.
- Build never waives, skips or overrides its own review blockers (SKILL.md § Safety gates).

## Tool contract

```bash
DEV="<development>"   # this skill's folder
bun "$DEV/Tools/Inventory.ts" <repo> --json                 # existing repo: surface list
bun "$DEV/Tools/SpecCheck.ts" bar <repo>/SPEC.md            # atomic criteria, one row each
bun "$DEV/Tools/SpecCheck.ts" conform <repo>/SPEC.md        # the spec has every required section
bun "$DEV/Tools/SpecCheck.ts" acceptance <repo>/SPEC.md --since <run start date>   # before the report, for work the user will see or use
```

Drift check, by reading: the criteria still serve the spec's `## Goal`; a criterion that no longer does is changed or dropped with a Decisions line.

Release record, when the project keeps one: bump the version and add a CHANGELOG entry that names the criteria shipped, in plain words, before the deploy.

Then `Intents/Test.md` proves the result.

## Gotchas

- **Never delete a thin spec to start a fresh one.** A repo with a thin spec, PRD or acceptance-criteria document gets that file extended in place; the history in it (Decisions, dropped criteria) is part of the rigor.
