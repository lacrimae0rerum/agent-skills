# Art Direction setup

Status: (test -n "$OPENAI_API_KEY" || command -v codex >/dev/null) && (test -n "$ANTHROPIC_API_KEY" || command -v claude >/dev/null) && echo ok · required

## What it does

Art Direction is the quality gate for artistic work: images, films, slides, documents and site captures. It scores an artifact against a written rubric with two vision judges from different vendors (OpenAI and Anthropic by default), lists the defects in rank order, and refuses to hand the file over until the scores clear the bar. It also records your own scores as calibration labels. Which vendors may judge comes from one config key, `art_judges`.

## Fill in

Nothing in the skill needs editing. Your settings are optional and live in `$AGENT_SKILLS_HOME/art-direction/` (default `~/.agent-skills/art-direction/`):

| File | Key or section | What it does |
|---|---|---|
| `Config.md` | `art_judges: openai, anthropic` | The vendors allowed to judge art, comma-separated, from `openai`, `anthropic` and `google`. `--vendors` refuses any other, and the default panel is the reachable ones in this list. When the file or key is missing, the panel defaults to `openai, anthropic` and each critique report says so. A name that is not one of the three stops the critique with an error naming the file. |
| `Config.md` | `keeper_verdict: 7` | The lowest 1-10 human calibration score you would still keep. `Tools/Calibrate.ts` records a verdict at or above it as `"pass": true` in the label, and below it as `false`. Default 7 when missing; a value that is not an integer 1-10 stops with an error naming the file and key. The critique panel's 8.5 delivery bar is separate. |
| `PREFERENCES.md` | everything after the first `---` rule line below the frontmatter | Install-specific judging rules (who may appear and how, house taste). `Tools/Critique.ts` appends them to `References/Rubric.md` in every judge prompt. Optional. |

A made-up `Config.md`:

```markdown
art_judges: openai, anthropic
keeper_verdict: 7
```

Each critique reads a `Brief.json` that you write per artifact; `References/BriefExample.json` is a filled example and `References/Rubric.md` is the schema.

Your calibration labels are appended to `labels.jsonl` in that same folder; the tool creates it on first use.

For films, `Tools/Critique.ts` samples frames with `ffmpeg` and `ffprobe` (install them with your package manager, e.g. `brew install ffmpeg` or `apt install ffmpeg`). Still images need neither. Contact strips for motion review need the optional `sharp` package; without it the report lists motion review as outstanding.

## Accounts and secrets

Each judge seat takes an API key or a signed-in CLI. Keys go in the environment or in `$AGENT_SKILLS_HOME/.env` (`KEY=value` lines).

| Name | Needed for | Account to open |
|---|---|---|
| `OPENAI_API_KEY`, or the `codex` CLI signed in (`codex login`) | the OpenAI vision judge (Responses API with the key, else `codex exec -i`) | An OpenAI API account, or a ChatGPT plan for codex |
| `ANTHROPIC_API_KEY`, or the `claude` CLI signed in | the Anthropic vision judge (Messages API with the key, else the claude CLI with the image attached inline) | An Anthropic API account, or a Claude plan for the CLI |
| `GOOGLE_API_KEY` | the Google vision judge, only when `art_judges` names `google` | A Google AI Studio account |

Optional model overrides: `OPENAI_VISION_MODEL`, `ANTHROPIC_VISION_MODEL`, `GEMINI_VISION_MODEL`. Optional hand-over folder: `AGENT_SKILLS_OUTPUT_DIR` (default `~/Downloads/`).

If you leave `--vendors` off, the panel is every approved vendor this machine can reach. One reachable vendor still runs, but the report is flagged `vendor_missing` and a pass is weaker evidence. A vendor left out of `art_judges` is never seated.

## Prove it works

Run from this skill's folder:

```bash
command -v codex claude ffmpeg ffprobe
bun Tools/Critique.ts
bun Tools/Deliver.ts
```

Success: the first command prints a path for each CLI you rely on (or you have the matching API keys set), plus `ffmpeg` and `ffprobe` if you will critique films. The last two run with no arguments, so they judge nothing and cost nothing: each prints its one-line usage (`Critique: Use --video <mp4> ... OR --image <png> ... --brief <Brief.json>` and `Use --artifact <file|deck.key> ...`). To see a real verdict, run `bun Tools/Critique.ts --image <png> --brief <Brief.json>` on an image you made; that makes paid judge calls to each vendor on the panel.
