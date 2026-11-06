# Tools — the skill's tool catalog

Every command, flag, output and exit code of the tools in `Tools/`. Each intent's Tool contract carries the commands that intent runs; this is the whole catalog. Run them with `bun <development>/Tools/<Tool>.ts`.

| Tool | What it does |
|---|---|
| `Tools/Inventory.ts <repo> [--json]` | Lists every HTTP route, CLI command, package script, SQL table and test file the repo exposes. Read-only. |
| `Tools/Inventory.ts sync <repo> <spec> [--json]` | Surfaces no criterion names, probes pointing at missing files, and the surface kinds the tool can't see. Exit 1 when it finds gaps. |
| `Tools/SpecCheck.ts bar <spec> [--json]` | Compound criteria, probes that AND two checks, one-word or unfailable probes, criteria with no row. Exit 1 on any finding. |
| `Tools/Checkup.ts <repo> [--spec <path>] [--since 14d] [--name <alias>] [--monitor <file>] [--json]` | One read-only evidence bundle for Checkup: spec standard, code, and the app's health-check file when given. Sources it cannot read (alerts, bug reports, security findings) are listed under `unavailable`, never read as clean. Default spec `<repo>/SPEC.md`. Exit 0 gathered, 2 bad input. |
| `Tools/SpecCheck.ts acceptance <spec> [--since YYYY-MM-DD] [--json]` | Reads every `acceptance:` line and takes the newest by date, wherever it sits in the list. Exit 0 when that date has a pass or waived verdict and is not before `--since`; exit 1 on no dated line, a fail, pending or not-run verdict, or a stale date; exit 2 on bad input. |
| `Tools/SpecCheck.ts conform <spec> [--json]` | Whether the spec meets the current template (`References/SpecFormat.md`), computed from its sections and never from its `spec_format` stamp. Prints `Latest template (1.0.0): yes` or `no`, then one line per missing item as `<code> <detail>`: `section-missing` (Goal or Test Strategy; an empty body counts as missing), `goal-unconfirmed` (no confirmation date under Goal), `no-criteria`, `criterion-no-row` (no valid Test Strategy row), `row-dropped` (a row the parser could not read), `order` (a known section out of the template's order, with `## Features` also allowed in the Criteria slot; unknown headings are ignored), `stamp-unearned`, `stamp-unknown`, `checkup-shape`. `--json` prints `{template, latest, missing, stamp, checkup}`. Read-only. Exit 0 latest, 1 not, 2 bad input. |
| `Tools/SpecCheck.ts stamp <spec> --verdict <word> --before <n> --after <m> [--json]` | Checkup's last step and the only writer of `checkup:` and `spec_format:`. Writes frontmatter `checkup: <local YYYY-MM-DD> <verdict> <n>→<m>`, removes any `checkup:` line under `## Status`, runs conform on the result, and writes `spec_format: 1.0.0` only when it is clean; otherwise `spec_format` stays as it was and the missing items print. `--json` prints `{ok, checkup, wroteFormat, removedStatusLines, conform}`. Exit 0 when the checkup was written, 2 on bad input (missing flag, a verdict that is not one word, a count that is not a whole number, no file, no frontmatter), with nothing written. |
| `Tools/SpecCheck.ts write-probes <spec> [--json]` | Test Strategy rows that would write to a non-local target (local is judged by the URL host only). Test runs this first and stops on any finding. |

## Gotchas

- **`bar` is the deterministic half of the atomicity check.** It catches joiners ("and", semicolons, ", then") and compound probes; whether each criterion is truly one binary statement is still a judgment, so the residue goes to an independent reviewer on large or high-blast work.
