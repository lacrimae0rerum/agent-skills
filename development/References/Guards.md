# Guards — what is checked behind § Safety gates, and what is not

SKILL.md § Safety gates states the rule: nothing non-trivial is built without criteria in a spec, and in a project that has a spec no change of any size skips it. This file is what code checks today, and where the rule rests on the agent alone.

**What the skill checks with code.**

- **Granularity:** `SpecCheck.ts bar` exits 1 on compound criteria, compound probes, one-word probes and criteria with no row. Build and Modify run it on new and edited criteria.
- **Template:** `SpecCheck.ts conform` exits 1 when a required section, a criterion row or the Goal's confirmation date is missing.
- **Production writes:** `SpecCheck.ts write-probes` exits 1 on rows that would write to a non-local target. Test runs it first.
- **Acceptance is checked at run end, not at deploy.** The session records it as `acceptance:` under the spec's `## Status`. `SpecCheck.ts acceptance <spec> --since <date>` reads that line and exits 1 unless the newest dated verdict is pass or waived and not older than the date; Build and Modify run it before their report. A deploy path does not call it, so a deploy started outside a Development run ships without it.

**What rests on the agent.** No hook refuses an edit here. Start (read the spec before the first edit of governed code), finish (the same change that edits governed code edits the spec) and ship (the release record names the criteria that changed) are steps the agent follows, not checks that refuse.

**Making it enforced, when the user wants that** (ask first; these change the project):

- A CI step that runs `bun <development>/Tools/SpecCheck.ts bar SPEC.md` and `conform`, failing the build on findings.
- A pre-commit or CI check that fails when files the spec governs changed and the spec did not, unless the commit message marks the change trivial.
- A deploy script that runs `SpecCheck.ts acceptance SPEC.md --since <release date>` before it ships.
