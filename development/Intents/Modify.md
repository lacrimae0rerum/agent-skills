# Modify — change an app that already has a spec

Changes, fixes or removes behavior in an app whose spec already describes it. The spec changes first, then the code follows.

## Ideal State

- The change is in the spec before the code: new behavior has new criteria with rows, changed behavior has its criteria edited, and removed behavior has its criteria removed with a Decisions line saying why. Nothing leaves the spec silently.
- A bug fix leaves a criterion behind: the fix added or tightened the criterion whose check would have caught the bug, and that check was seen failing before the fix made it pass.
- A change asked to behave the way the app already behaves elsewhere ("the same way it works for all other accounts") runs through the path that behavior already uses; a new branch special-cased for one instance is a miss.
- Direction is checked only when it moves: if the change alters the spec's `## Goal`, the user confirmed the new Goal (with a new date) before code; otherwise no re-confirmation runs.
- New and edited criteria are atomic, one row each (`SpecCheck.ts bar` reports no finding on a new or edited criterion), and each carries its check at the cheapest honest tier (SKILL.md purpose paragraph).
- Changed criteria pass and nothing else broke: Test on each affected Feature passes, then the fast tier passes across the whole spec.
- The run ended with the independent code review on each deployable repo it touched, its blockers fixed inside the run (SKILL.md § Safety gates).
- A run whose work ships leaves the repo's release record current before the deploy, when the project keeps one: a version bump and a plain-words CHANGELOG entry naming the criteria that changed with the code.
- Anything new the change adds that the user will see or use has a reference they approved before code (SKILL.md § Acceptance), linked from the spec; when their intent changed, the reference they approved changed first.
- Acceptance (SKILL.md § Acceptance) passed on what the change touches that the user will see or use.
- The spec records the run: criteria ticked with evidence, judgment calls in Decisions.

## Anti-criteria

- No code change to non-trivial behavior before its criteria change in the spec; only a trivial change (a typo, a value, an obvious one-liner) is made with no spec edit.
- Never delete or rewrite criteria, Decisions or the Goal that the user or earlier runs wrote, except as the change requires and with a Decisions line.
- Never ships outside the project's gated deploy command, and never without the user's confirmation of the exact deploy (SKILL.md § Safety gates).
- Never waives, skips or overrides its own review blockers (SKILL.md § Safety gates).

## Tool contract

```bash
DEV="<development>"   # this skill's folder
bun "$DEV/Tools/SpecCheck.ts" bar <repo>/SPEC.md            # edited criteria still atomic, one row each
bun "$DEV/Tools/SpecCheck.ts" acceptance <repo>/SPEC.md --since <run start date>   # before the report, for work the user will see or use
```

Release record, when the project keeps one: bump the version and add a CHANGELOG entry that names the criteria shipped, before the deploy.

Then `Intents/Test.md` for each affected Feature, then the fast pass.
