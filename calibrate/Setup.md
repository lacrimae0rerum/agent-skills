# calibrate

Status: `bun Tools/Calibrate.ts targets` (from this skill's folder) · optional

## What it does

Calibrate shows you real outputs from an eval or a configured target on a local review page, collects your 0–10 scores and notes, measures how well the judge agrees with you, and distills a taste profile the judge reads from then on. Every eval suite of the `assay` skill works with no setup once it has stored outputs; image intents join through a target you add with the AddTarget intent.

## Requirements

- bun 1.2.21+ (`bun --version`). No `bun install`: YAML is parsed with Bun's built-in parser.
- A browser for the review page.
- For `rescore`: a model provider for the judge, through `Tools/_portable/inference.ts`. Any one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, the `claude` CLI, the `codex` CLI, or `AGENT_SKILLS_LLM_CMD` (a command that reads a prompt on stdin and prints the answer). Put keys in the environment or in `$AGENT_SKILLS_HOME/.env`.

## Fill in

Both files are optional and live in `$AGENT_SKILLS_HOME/calibrate/` (default `~/.agent-skills/calibrate/`).

| File | Key | Meaning |
|---|---|---|
| `Config.md` | `browser` (frontmatter) | The app `session --open` opens the review page in, for example `Google Chrome` or `Firefox`; `default` for the system default browser. With no `Config.md` the page opens in the system default browser and the tool warns; a `Config.md` without the key stops the open with an error naming the file and key. |
| `Config.md` | `critique` (frontmatter) | The image critique command rescore runs for image targets, for example `bun ~/skills/art-direction/Tools/Critique.ts`. It gets `--image <file> --brief <Brief.json> --out <dir>` and must write `<dir>/Critique.json`. `CALIBRATE_CRITIQUE_CMD` overrides it. |
| `PREFERENCES.md` | free text | What you score first. AddTarget follows it when it writes a target's page question and judge brief. |

A made-up `Config.md`:

```markdown
---
browser: default
critique: bun ~/skills/art-direction/Tools/Critique.ts
---
```

Targets, labels, sessions and taste profiles are written by the tool under `Targets/<target>/`; you never edit them by hand (`SKILL.md` § Data & Config).

## Environment

| Variable | Meaning |
|---|---|
| `CALIBRATE_DIR` | Root for targets, labels and taste (default `$AGENT_SKILLS_HOME/calibrate`). |
| `CALIBRATE_CRITIQUE_CMD` | Image critique command (see `critique` above). |
| `ASSAY_RESULTS_DIR` | Where the `assay` skill stores run outputs (default `$AGENT_SKILLS_HOME/assay/Results`). |
| `ASSAY_SUITE_DIRS` | Extra suite folders, path-list (for example the `assay` skill's bundled `Suites/`). |
| `ASSAY_JUDGE_VENDOR` | `anthropic` or `openai`: pins the judge's vendor. |
| `ASSAY_FLOOR_AGREEMENT`, `ASSAY_FLOOR_KAPPA` | Override the calibration floors (0.85, 0.40). |

## Accounts and secrets

None of its own. Rescoring calls the judges the eval already uses: the model judge for text suites, and the configured critique command for image targets, each on the keys those need.

## Prove it works

```bash
bun Tools/Calibrate.ts targets
bun Tools/Calibrate.ts discover "example task" --json
```

`targets` lists your configured targets (`[]` on a fresh install). `discover` ranks the targets and eval suites that match a task in plain words. Both run offline.
