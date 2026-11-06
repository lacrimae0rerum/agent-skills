---
name: art-direction
description: "Directs visual quality across images, films, slides, documents and site captures through a direction council, two vendors' vision judgments against anchored craft criteria, ranked defects, bounded iteration, gated delivery, and recorded human calibration labels. USE WHEN critique this, art direction, quality loop, rate the visuals, is this pro, iterate until it's great, deliver the render, art council, layout QA on a film. NOT FOR producing the artifact itself (use the appropriate image, motion, story-film, video-essay, web-design, or slide-production capability, e.g. `art`, `hyperframes`, `webdesign`), for text writing audits, or for rating a spec or requirements document."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+. Vision judges: OPENAI_API_KEY or the codex CLI (signed in); ANTHROPIC_API_KEY or the claude CLI; GOOGLE_API_KEY for the optional Google seat. Optional: OPENAI_VISION_MODEL, ANTHROPIC_VISION_MODEL, GEMINI_VISION_MODEL, AGENT_SKILLS_OUTPUT_DIR, CALIBRATE_DIR. ffmpeg/ffprobe for films; sharp (npm) optional for contact strips."
---

# Art Direction

A shared quality loop for artistic deliverables: the Brief defines audience, register, references and bar; a Direction council resolves the visual intent into `Direction.md`; the domain skill produces the artifact against it; Critique yields two vendors' scores and ranked defects; iteration reaches the bar or reports the shortfall at four rounds; only a passing result reaches Deliver; and Calibrate records the user's own verdict as evidence for later judge calibration. The domain skill makes the artifact; this skill supplies the quality evidence.

Paths in this skill are relative to the skill folder.

## Ideal State

- Nothing artistic reaches the user or a public surface without a current passing critique from the judge panel bound to the exact bytes delivered. The panel is cross-vendor whenever two approved vendors are reachable; a one-vendor panel may still pass, and its report carries the `vendor_missing` flag as weaker evidence.
- Every verdict is honest: pass only when the pooled median reaches the bar and each vendor median reaches bar minus 0.5, with no UNKNOWN score or critical defect, a cap hit reported with its shortfall, and an unreachable vendor reported as unavailable rather than as a quality failure.
- Each round names ranked, located defects a producer can fix, judged against the concept-first rubric rather than adjectives.
- A figure's anatomy and mechanics are judged as a defect class: extra or missing limbs, a grip or pose that does not match the object held, or physically impossible motion is a critical defect located by image region or frame, so the critique fails it; the judges read this rule from `References/Rubric.md`.
- The user's own scores are kept verbatim as labels, and judges change only through a deliberate calibration, never automatically.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Loop** | Full quality loop or iterate to the bar | `Intents/Loop.md` |
| **Direction** | Art council or new visual direction | `Intents/Direction.md` |
| **Critique** | Rate the visuals, inspect a render, or layout QA on a film | `Intents/Critique.md` |
| **Deliver** | Hand over a passing artifact | `Intents/Deliver.md` |
| **Calibrate** | Record the user's score and note | `Intents/Calibrate.md` |

| File | Read when |
|------|-----------|
| `References/Rubric.md` | writing a brief or reading a critique: the anchored axes, document and figure rules, defect shape and the `Brief.json` schema (`References/BriefExample.json` is a filled brief); Critique reads it at runtime |
| `Setup.md` | first-time setup: the judge vendors' access, ffmpeg for films, and a no-cost proof |

## Tool contract

Run each tool with `bun` from this skill's folder (or give `bun` the tool's full path).

| Tool | CLI contract |
|---|---|
| Critique | `Tools/Critique.ts --video <mp4> \| --image <png> [--images <glob>] --brief <Brief.json> [--bar 8.5] [--samples 12] [--concurrency N] [--vendors openai,anthropic] [--sample-seed <n>] [--out <dir>] [--json] [--allow-identity]` |
| Deliver | `Tools/Deliver.ts --artifact <file> [--critique <Critique.json>] [--to <dir>]` |
| Calibrate | `Tools/Calibrate.ts --artifact <file> --verdict <1-10> --note "<text>"` |

Each intent file carries its tool's defaults, refusals and exit codes.

## Setup

- Runtime: bun 1.2+. No `bun install` is needed; `sharp` is optional (contact strips for films).
- Judges (two vendors give the strongest evidence): OpenAI through `OPENAI_API_KEY` or the signed-in `codex` CLI; Anthropic through `ANTHROPIC_API_KEY` or the signed-in `claude` CLI; Google through `GOOGLE_API_KEY` (only when `art_judges` names `google`).
- Films: `ffmpeg` and `ffprobe` on PATH.
- Keys may live in the environment or in `$AGENT_SKILLS_HOME/.env`. Full steps and a no-cost proof: [Setup.md](Setup.md).

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/art-direction/PREFERENCES.md` (default `~/.agent-skills/art-direction/`) and override the defaults here; when absent, the defaults stand. First-time setup (accounts, keys, config, a proof it works) is in [Setup.md](Setup.md).

- `PREFERENCES.md` in that folder, when present, is appended to `References/Rubric.md` as install-specific judging rules (everything after its first `---` rule line below the frontmatter).
- `Config.md` in that folder holds two optional keys. `art_judges: openai, anthropic` names the vision vendors allowed to judge (any of `openai`, `anthropic`, `google`); `--vendors` refuses any other, and the default panel is the reachable ones in the list. Absent, the panel defaults to `openai, anthropic` and the critique report says so under `outstanding`. `keeper_verdict: 7` is the lowest 1–10 score the user would still keep; Calibrate records each label's `pass` against it (default 7). Panel selection (`--vendors`) is in `Intents/Critique.md`.
- A brief may name `"calibration": "<target>"`. Critique then adds that target's `Taste.json` (the user's labeled likes and dislikes) to the judge prompt and records its `labels_hash` in the report; a target with no profile yet is noted under `outstanding`. The profile lives at `$CALIBRATE_DIR/Targets/<target>/Taste.json` (default `$AGENT_SKILLS_HOME/calibrate/`), written by the `calibrate` skill if it is installed, or by hand in the same shape. Briefs without the field produce the prompt they always did.
- Calibration labels append to `$AGENT_SKILLS_HOME/art-direction/labels.jsonl` (fields in `Intents/Calibrate.md`).
- Vision transport (`Tools/lib/vision.ts`): OpenAI runs through the Responses API when `OPENAI_API_KEY` is set, else `codex exec -i` on the signed-in codex CLI; Anthropic runs through the Messages API when `ANTHROPIC_API_KEY` is set, else the claude CLI with the image attached inline; Google runs through Gemini. A seat never falls back to another vendor. No credentials belong in briefs or logs.
- Models: `OPENAI_VISION_MODEL` (default `gpt-6.1-sol`), `ANTHROPIC_VISION_MODEL` (default `claude-opus-5-5`), `GEMINI_VISION_MODEL` (default `gemini-3.8-flash`). Use each vendor's most capable vision model available to you.
- Deliver copies to `--to`, else `$AGENT_SKILLS_OUTPUT_DIR`, else `~/Downloads/`.

## Gotchas

- Hand-over is gated by `Tools/Deliver.ts` because a first-draft video reached the user with no critique on 2026-09-17, while the rule lived only in prose; the gate is code, so it holds when the prose is skipped.
- The rubric leads with `concept` (does the artifact carry its idea as one metaphor a stranger reads at a glance), and overall follows concept most. It changed on 2026-09-28, after the first human calibration scores showed the old craft-first rubric ranking the scored artifacts almost at random.
- The panel only means something across vendors: with one reachable vendor the report is flagged `vendor_missing`; say so when presenting a pass.

## Examples

User: "iterate until it's great" on a render → Loop intent → `Brief.json` and `Direction.md` exist, critique rounds run until the artifact passes the bar, or the four-round cap is reported with its shortfall.

User: "rate the visuals" → Critique intent → `Critique.json` with both vendors' scores, ranked defects and a pass, fail or unavailable verdict.

User: "that one's a 6, the type is cramped" → Calibrate intent → one label appended with verdict 6 and the note in the user's words.
