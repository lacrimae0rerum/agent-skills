# Assay

Status: `bun Tools/SuiteManager.ts list` (from this skill's folder) · optional

## What it does

Assay checks AI output against what was asked. Code assertions run first and cost nothing. Fuzzy checks go to a calibrated model judge, or to you. Suites run each case several times and report pass^k, pass@k and confidence intervals. Code assertions work on a bare install; text suites, A/B comparisons and tournaments need one model provider; image judging needs the vision keys below.

## Requirements

- bun 1.2.21+ (`bun --version`). No `bun install` is needed to run the tools: YAML is parsed with Bun's built-in parser.
- For the deterministic image asserts: ImageMagick (`magick`) and `tesseract` on PATH, and a word list for `ocr-word-ratio` (`/usr/share/dict/words`, or `ASSAY_OCR_DICTIONARY`).

## Accounts and secrets

Set these in the environment or in `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`).

| Name | Needed for |
|---|---|
| any one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, the `claude` CLI, the `codex` CLI, or `AGENT_SKILLS_LLM_CMD` | the model under test and the text judges (`Tools/_portable/inference.ts` picks the first that is set; `AGENT_SKILLS_LLM` forces one) |
| `OPENAI_API_KEY`, or the `codex` CLI logged in | the OpenAI seat of the image judge panel |
| `ANTHROPIC_API_KEY` | the Anthropic seat of the image judge panel |
| `GOOGLE_API_KEY` | Gemini: image pairwise and tournaments, suites whose `vision-judge.json` entry names Google, and the public-material describer |

## Environment

| Variable | Meaning |
|---|---|
| `ASSAY_HOME` | Root of your assay data (default `$AGENT_SKILLS_HOME/assay`). |
| `ASSAY_RESULTS_DIR`, `ASSAY_CALIBRATION_DIR` | Override `Results/` and `Calibration/` inside it. |
| `ASSAY_SUITE_DIRS` | Extra suite folders, path-list (`:` on macOS/Linux): another skill's `Suites/`, a project's `evals/`. |
| `ASSAY_SYSTEM_PROMPT_FILE` | The agent instructions a suite runs under when it names none (your AGENTS.md or CLAUDE.md). |
| `ASSAY_SUBJECT_MODEL`, `ASSAY_SUBJECT_VENDOR` | Pin the model under test (a trial served by another model is voided). |
| `ASSAY_JUDGE_VENDOR` | `anthropic` or `openai`: the judge's vendor; pick the other one than the subject. |
| `AGENT_SKILLS_MODEL_LOW` … `_MAX` | Model per judge level (otherwise the inference helper's defaults). |
| `ASSAY_FLOOR_AGREEMENT`, `ASSAY_FLOOR_KAPPA` | Calibration floors (0.85, 0.40). The `calibrate` skill reads the same two. |
| `ASSAY_OPENAI_VISION_MODEL`, `ASSAY_ANTHROPIC_VISION_MODEL`, `ASSAY_GEMINI_MODEL` | Vision model overrides. |
| `ASSAY_PRIVATE_VENDORS` | Vendors allowed to see private images (default `anthropic,openai`). |
| `ASSAY_VISION_JUDGE_CONFIG` | Path of `vision-judge.json` (default `$ASSAY_HOME/vision-judge.json`). |
| `ASSAY_INFERENCE_DISABLED` | When set, vision and agentic calls refuse: assert-only runs. |
| `<SKILL_NAME>_SKILL_DIR` | Where an installed skill lives, for suites that name `skill:<skill-name>/…` (for example `DETECT_AI_SKILL_DIR`). Unset: the sibling folder next to this skill. |

## Fill in

Mostly nothing. Generic eval suites ship under `Suites/`; a skill's own suites ship in that skill's `Suites/` folder (the `fabric` skill's suites live in `fabric/Suites/` and point at `../Intents/<Name>.md`, so they run from any folder: `bun Tools/EvalRunner.ts -s <path to fabric>/Suites/fabric-summarize.yaml`, or add that folder to `ASSAY_SUITE_DIRS`). Your own suites live in `$AGENT_SKILLS_HOME/assay/Suites/`. Optional files in `$AGENT_SKILLS_HOME/assay/`:

- `PREFERENCES.md`: your standing preferences, including your judge-provider rulings (which vendors may see private images, and since when) under `## Judge providers`.
- `config.json`, with keys `config_change_suite` (the suite to run after the agent's instructions change, default `core-dispositions`) and `ocr_signature_mask` (required by the `ocr-word-ratio` image assert, which errors naming the file and key when it is missing: `false` for no mask, or `{"x0": 0.8, "y0": 0.85}` to blank the bottom-right corner from those fractions of width and height so a signature stamp on your images is not read as garbled text).
- `vision-judge.json`, which chooses the image judge per suite. Made-up example:

```json
{
  "version": 1,
  "suites": {
    "my-hero-images": { "provider": "openai", "level": "medium" },
    "my-layout-check": { "provider": "panel" }
  }
}
```

A suite with no entry uses the default panel: OpenAI and Anthropic both judge each image, and it passes only when both pass.

## Prove it works

```bash
bun Tools/Assertions.ts            # 20 deterministic cases, offline
bun Tools/Stats.ts                 # 6 stats cases, offline
bun Tools/SuiteManager.ts list     # your suites and the shipped ones, offline
bun Tools/SuiteManager.ts validate # every judged suite keeps an adversarial fixture, offline
```

Success: the first two print `20/20` and `6/6`, the third lists the suites with their case counts and last result (`SUITES (N)`), and the fourth marks each suite ✅. The first live check is `bun Tools/Judge.ts` (a few judge calls on the configured provider); run it only when you are ready to spend them.
