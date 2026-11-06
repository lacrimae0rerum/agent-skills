---
name: development
description: "Builds, tests, modifies and checks up on software against a plain spec (acceptance criteria plus a Test Strategy table) in the user's repo, from a one-file change to a large system. Build turns intent into criteria and makes them pass; Test proves the spec is well formed, matches the code, and every criterion's check passes; Modify changes criteria first, then code; Checkup joins the spec with git, the code inventory and production signals, says why each red criterion is red, and repairs the spec. Each run is sized to the ask. USE WHEN build an app, site, game, tool, CLI or pipeline, start a new project, implement or change a feature, fix a bug in an app, test the app, is the code in sync with the spec, run the app evals, write a spec for an old repo, health check, checkup, why are these criteria red, audit the spec. NOT FOR eval or judge design (use `assay`), property-test depth (use `hardening`), CLI scaffolding alone (use `create-cli`), slides, images, or deploying (the project's deploy command ships)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ for Tools/*.ts and git for Checkup. No env vars. Judged rows use the optional assay skill."
---

# Development

**Contents:** Ideal State · Intent Routing · Data & Config · Acceptance (output contract) · Safety gates · Execution · Tools · Gotchas · Examples

The thin actor between a spec and its code. The spec (`References/SpecFormat.md`; default `SPEC.md` at the repo root, or the project's existing spec, PRD or acceptance-criteria document) holds the rigor: what done means, every criterion, and every criterion's check. Each criterion is verified at the cheapest honest tier: a code assert when the criterion is literal, a judged check (the `assay` skill, when it is installed) only when no assert can answer, the user for taste. Development builds, tests and modifies until the code and the spec agree.

## Ideal State

- At the end of every run the code and its spec agree: every criterion in scope carries a check at the cheapest honest tier, and its result is recorded in the spec.
- Criteria change before the code they govern; only a trivial change (a typo, a value, an obvious one-liner) skips the spec.
- Nothing the user will see or use is called done until acceptance against a reference they approved has passed (§ Acceptance); passing tests are the builder's signal, not the done signal.
- The report on such work opens with the acceptance verdict and its capture paths. The captures show the whole thing working the way the user meets it: a page renders top to bottom at desktop and phone widths and looks like the reference. A report without a passing verdict, and without the user's waiver, does not call the work done, fixed or shipped.
- The criteria are the only artifact written before the code.
- Nothing here deploys or writes production data; the project's own gated deploy command ships, and only after the user confirms the exact deploy.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Build** | new app, new feature, "build this", an existing repo with no spec | `Intents/Build.md` |
| **Test** | "test the app", "is it in sync", "run the evals", a check before deploy | `Intents/Test.md` |
| **Modify** | change, fix or remove behavior in an app that has a spec | `Intents/Modify.md` |
| **Checkup** | "health check", "checkup", "why are these criteria red", "get everything in sync", "audit the spec" | `Intents/Checkup.md` |

| File | Read when |
|------|-----------|
| `References/SpecFormat.md` | writing or reading a spec: sections, criteria ids, the Test Strategy table and its row types |
| `References/Guards.md` | you need to know what is checked mechanically and what rests on the agent following the rule |
| `References/Inventory.md` | reading `Inventory.ts` or `sync` output, or the code section of a `Checkup.ts` bundle |
| `References/Tools.md` | a run needs a tool's full flags, output or exit codes |
| `References/Sizing.md` | questioning a run's tier |

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/development/PREFERENCES.md` (default `~/.agent-skills/development/`) and override the defaults here; when absent, the defaults stand. Useful keys: the default spec filename, the project's deploy command, the reviewer to use for the independent review, and the browser tool for acceptance captures.

## Acceptance (output contract)

- **Done means acceptance passed:** the work was met the way the user will meet it, compared to the reference and their words, and passed, with the captures. Criteria and tests are the builder's tools, not the done signal. Only the user waives acceptance. (A product page once reached production broken while its whole test suite passed. `SpecCheck.ts acceptance` checks the recorded verdict at run end; a deploy path does not check it, `References/Guards.md`.)
- The reference is the existing thing the work should be like (looked for in the project and the user's other work first), or a rough mock or sample output when nothing exists. The user approves it before code is written, and the spec links it.

- **How deep acceptance goes follows what the user will meet** (speed is part of the experience). A rendered page, app UI or user-facing flow, anything deployed, and anything on a `high-risk-path` get the fresh agent below. A CLI, hook, internal tool or doctrine change is accepted by the builder's recorded run of the real command the user would run, its output captured and compared with their words; that run is the verdict recorded under `## Status`.

For the first kind: a fresh agent, not a fork of this session and ideally from a different model family than the builder, when one is available. If your agent can run subagents, start one; otherwise ask the user to run the brief in a fresh session, or run it yourself in a clean context and say so. Its brief carries exactly four things and nothing else, no criteria, diff, test results or builder notes:

1. The user's words, verbatim.
2. The reference: a path, URL or screenshot.
3. Where the running thing is (preview or live URL, sign-in path) and that it must be opened in a real browser through the agent's browser tools (e.g. a Playwright or Chrome automation tool) at desktop and phone widths, or run the way the user runs it.
4. The return shape: `verdict: pass|fail`, one line why, every capture it viewed, and each difference from the reference.

It never fixes what it finds. The main session records `acceptance: <verdict> <date> <capture paths>` under the spec's `## Status` and leads the report with it; a waiver is recorded as `acceptance: waived <date> <the user's words>`. Before a Build or Modify report calls such work done, `SpecCheck.ts acceptance <spec> --since <the run's start date>` exits 0.

## Safety gates

- Nothing non-trivial is built without criteria in a spec. In a project that has a spec, every change, a one-liner included, starts and finishes with it: read the spec before the first edit of the code it governs, and update it in the same change (`References/Guards.md` says what checks this and what does not).
- Deploying is part of no intent. Build and Modify end with an independent code review of the committed HEAD of each deployable repo the run touched, scoped to the deploy directory (or the repo root when that directory is git-ignored build output). The reviewer is not the builder: a different model or a human when available (your agent's code-review command, a second model, or the reviewer named in PREFERENCES.md). Its blockers are fixed inside the run before it reports done. A run never waives, skips or overrides its own review blockers; those calls are the user's. A span the review has blocked four times hits the round cap: the run stops patching, rethinks the approach, and brings it to the user. A blocker the run did not cause, such as an inherited problem in untouched code, is reported to the user as that, not treated as the run's own failure. The project's own gated deploy command ships, after the user confirms the exact deploy.

## Execution

Every Build, Modify, Test and Checkup run is sized to the work asked for (five tiers to choose from; small work stays fast). Tiers 1 and 2 run inline in this session: build, rerun the criteria's checks, report. Tiers 3 to 5 split the work into lanes. If your agent can run subagents, run independent lanes in parallel, never one after another in a loop, each with the brief below; otherwise run the lanes one after another in this session and say so in the tier line. The tier comes from the work asked for: the criteria this request adds, changes or tests. A large spec with a small request is a small tier.

In a Development run a part is one Feature, or a group of criteria inside one Feature that can be built and checked on its own. So one criterion or one file is tier 1, a few criteria in one Feature tier 2, one Feature end to end or two small ones tier 3, several independent Features tier 4, and a new project or a large slice tier 5.

A separate checker agent is not part of any tier from 1 to 4 (fewer separate checker runs when the work already checks itself properly). The run's own check rerun, acceptance, and the independent review at the end of the run are the independent looks. One checker runs per run, over the merged diff and never per lane, only when a trigger fires:

- a criterion in scope has no code assert and can only be judged (trigger `judged`);
- the diff touches auth, payments, migrations, secrets or deploy config (`high-risk-path`);
- the work is in no deployable repo, so the end-of-run review never runs on it, such as local scripts, agent configuration and other code committed without a deploy (`no-review`);
- a lane needed a fix round, or edited the test or eval files its own criteria point at (`fix-round`).

A checker the user asks for outside these triggers is `manual`. The checker should be a capable model from a different family than the builder when one is available; its brief is the diff, the criteria and their Test Strategy rows, and one question: do these tests prove these criteria. When no checker ran, the report names the reason ("checks rerun by the run, independent review at run end").

At every tier:

- Each agent's brief carries the spec path, the user's words for this request, and the spec Decisions that bear on it, so no agent works blind.
- Verification runs at each criterion's cheapest honest tier, never as fixed stages.
- The full-spec fast pass runs once, as one step; it never sets the width.
- The main session stays the spec's only writer and ticks criteria from the lanes' returned evidence.
- Acceptance (§ Acceptance) runs after the build, at the depth § Acceptance sets.

The tier is the agent's to pick from the request and is named in one line before the work starts. If a run's tier turns out wrong, the next step resizes.

### Lane brief

- Each lane gets: the spec path, the tier, its Feature and name, and the criteria ids it owns (`{ spec: "<path>", tier: <1-5>, lane: { feature: "F<n>", name: "<lane>", criteria: ["AC-4", …] } }`), and a label in the `build:F<n> <name>` form (`verify:F<n> <name>`, `fix<round>:F<n> <name>`), so its results map back to the spec.
- The run report lists each lane: label, criteria, result, and evidence.

## Tools

Three tools in `Tools/`: `Inventory.ts` (the repo's surface list, and `sync` against a spec), `SpecCheck.ts` (`bar`, `write-probes`, `acceptance`, `conform` and `stamp`, the one writer of a spec's `checkup:` and `spec_format:` keys) and `Checkup.ts` (Checkup's evidence bundle). Run them as `bun <development>/Tools/<Tool>.ts …`, where `<development>` is this skill's folder. Each intent's Tool contract carries the commands it runs; every flag, output and exit code is in `References/Tools.md`.

## Gotchas

- **Parallel lanes cost more than inline work.** Tiers 3 to 5 run lanes in parallel only when the agent can run subagents and the user is fine with the cost (they asked for parallel work, or agreed when asked). Otherwise the run stays inline at tier 2 or runs the lanes in sequence, and says so in the tier line.
- **Heavy process is not rigor; the rigor lives in the criteria and their checks.** A fixed heavy shape on every run was slow to reach first code. Sizing each run to the requested work (§ Execution) is the guard; the history is in `References/Sizing.md`.
- **Subagents hand results back; the main session writes.** Lanes return evidence and proposed edits; only the main session edits the spec, commits and ships, so parallel lanes never race on the spec or the git index.
- **Test Strategy commands run from the spec's folder** unless the spec's frontmatter sets `probe_cwd:`. Relative paths in rows resolve against that folder.
- **The inventory sees only some surface kinds, and sync catches missing criteria, not weak ones.** Its uncovered list needs criteria found by hand (`case` labels in an unrelated switch once read as fake commands); what it sees and how sync counts coverage are in `References/Inventory.md`.

## Examples

User: "Build a CLI for my recipes" → Build intent → the repo's spec holds atomic criteria with checks at the cheapest honest tier, they pass under Test, and acceptance passed against the reference the user approved.

User: "Is the code in sync with the spec?" → Test intent → a four-part report: well formed, sync with the surface kinds the inventory cannot see, every criterion's result at its tier, and the read.

User: "Why are so many criteria red on <app>?" → Checkup intent → every red criterion has a cause (code, row, no-check, unrecorded, environment, obsolete) and its repair, uncovered complaints became criteria, and the spec status shows red before and after.

User: "Fix the login bug in the app" → Modify intent → the spec gained the criterion whose check would have caught the bug, that check was seen failing then passing, and the fast tier passed across the spec.
