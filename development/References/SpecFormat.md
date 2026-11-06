# SpecFormat — the spec the development skill builds against

The spec is a plain Markdown file in the user's project that holds the rigor: what done means, every acceptance criterion, and how each criterion is verified. The default location is `SPEC.md` at the repo root. When the project already has a spec, PRD, design doc or acceptance-criteria document, use it in place and add the missing sections below to it rather than starting a second file. Every tool in `Tools/` takes the spec's path, so any filename works.

Template version: **1.0.0** (`Tools/lib/SpecTemplate.ts` holds the same number; the two move together).

## Frontmatter

Optional, but `SpecCheck.ts stamp` needs a frontmatter block to write into.

```yaml
---
slug: recipes-cli          # the app's name; Checkup matches signals by it
project: recipes           # optional second name
status: building           # one word: drafting | building | shipped | paused
progress: 4/12             # criteria passing / criteria in scope
updated: 2026-11-06
probe_cwd: .               # optional: folder, relative to the spec, the Test Strategy commands run from
checkup: 2026-11-06 healthy 3→0   # written only by SpecCheck.ts stamp
spec_format: 1.0.0                 # written only by SpecCheck.ts stamp, when conform is clean
---
```

## Sections, in this order

| Section | Required | What it holds |
|---|---|---|
| `## Goal` | yes | One sentence of what done looks like, a short summary under it, and `Confirmed by the user: YYYY-MM-DD`. The date the user confirmed the goal precedes the code. |
| `## Problem`, `## Vision`, `## Out of Scope`, `## Principles`, `## Constraints`, `## Dependencies` | no | Prose. No class, never fails, never a criterion. |
| `## Acceptance Criteria` (or `## Criteria`, `## Requirements`) | yes, unless `## Features` holds them | One atomic, binary criterion per bullet: `- [ ] AC-1: <statement>`. `[x]` = passing with evidence, `[~]` = partial. Anti-criteria are written `- [ ] AC-9: Anti: <what must never happen>` or listed under `## Anti-criteria`. |
| `## Open Questions` | no | What is not specified yet. Never a criterion. |
| `## Test Strategy` | yes | One table row (or more) per criterion: how it is verified (below). |
| `## Features` | no | Feature mode: `### F1 <name>` blocks, each with its own criteria bullets. May stand in the criteria slot. |
| `## Decisions` | no (yes once a judgment call is made) | Dated judgment calls, criteria dropped and why, waivers. |
| `## Learning` | no | What a failure taught: `conjectured` / `refuted by` / `learned` / `criterion now`. |
| `## Status` | no (yes once acceptance runs) | `acceptance: <pass\|fail\|waived> <YYYY-MM-DD> <capture paths or the user's words>` lines, newest by date wins. |

IDs: any `AC-1`, `F2.3`, `H-AUTH`, `ISC-4` style id works; keep ids stable. A dropped criterion keeps its id as a tombstone: `- [ ] AC-7: [DROPPED — see Decisions]`. A criterion split in two keeps its parent as `- [ ] AC-2: [container] <text>` with nested `AC-2.1`, `AC-2.2`.

## The Test Strategy table

```markdown
| criterion | type   | check                         | threshold | command                                              | anchors_to | severity |
|-----------|--------|-------------------------------|-----------|------------------------------------------------------|------------|----------|
| AC-1      | test   | list prints every recipe      | exit 0    | bun test ./test/list.test.ts                         | literal    |          |
| AC-2      | curl   | health endpoint answers       | 200       | curl -fsS https://recipes.example.com/health         | literal    | critical |
| AC-3      | eval   | the summary reads as plain    | pass      | bun <assay>/Tools/EvalRunner.ts --suite recipes-tone | literal    |          |
| AC-4      | manual | the user likes the layout     | yes       | the user looks at the home page at phone width       | literal    |          |
```

- Column identity comes from the header row, so columns may be reordered; `command` and `tool` are the same column. Escape a shell pipe inside a cell as `\|`.
- **Types.** Deterministic: `bash`, `test` (the project's test runner; `bun-test` is accepted), `property` (a property-based test, see the `hardening` skill; `bun-property` is accepted), `curl`, `screenshot`. Judged: `eval` and `pairwise`, run through the `assay` skill when it is installed. Attested: `manual`, a person's recorded verdict, the rare and visible exception.
- **Cheapest honest tier.** A code assert when the criterion is literal, a judged row only when no assert can answer, `manual` for taste. A row checks something: a one-word command (`bun`, `true`) checks nothing and is a finding.
- `severity: critical` marks a row whose failure means the app is down even when everything else passes (it asserts the app does its job, not just that it answers).
- `anchors_to` is `literal`, `derived: <criterion>` or a criterion id: a row that verifies a parent criterion through its leaves.
- Rows run from the spec's folder unless `probe_cwd:` says otherwise.
- A row never deploys and never writes to production; `SpecCheck.ts write-probes` flags rows that would.

## A minimal spec

```markdown
---
slug: recipes
status: building
progress: 0/2
---

# Recipes CLI

## Goal

A CLI that lists and adds recipes from the terminal, with JSON output.
Confirmed by the user: 2026-11-06

## Acceptance Criteria

- [ ] AC-1: `recipes list` prints every stored recipe as a JSON array
- [ ] AC-2: `recipes add <file>` stores the recipe so `recipes list` includes it

## Test Strategy

| criterion | type | check | threshold | command |
|---|---|---|---|---|
| AC-1 | test | list prints JSON | exit 0 | bun test ./test/list.test.ts |
| AC-2 | test | add then list | exit 0 | bun test ./test/add.test.ts |

## Decisions

## Status
```
