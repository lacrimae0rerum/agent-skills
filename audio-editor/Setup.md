# Audio Editor setup

Status: command -v ffmpeg ffprobe insanely-fast-whisper · required

## What it does

The audio-editor skill cleans spoken recordings. Whisper transcribes the audio with word-level timestamps, an LLM marks each segment to keep or cut (filler words, false starts, stutters, dead air), and `ffmpeg` makes the cuts with crossfades. Separate tools find and repair noise-gate ticks, soften loud breaths, and lock loudness to -14 LUFS. An optional cloud pass (Cleanvoice) removes mouth sounds. The edit pipeline runs on your machine plus whichever LLM provider you configure; the cloud pass uploads your audio.

## Fill in

No config file. Install the local tools (macOS shown; on Linux use your package manager for ffmpeg and `pipx install openai-whisper`):

```bash
brew install ffmpeg
pipx install insanely-fast-whisper
```

`ffmpeg` and `ffprobe` (installed together) run every cut and measurement. `Transcribe.ts` uses `insanely-fast-whisper` when it is on your PATH and falls back to the standard `whisper` command (`pip install openai-whisper`). If neither exists it stops with `No whisper variant found`. `insanely-fast-whisper` runs with `--device-id mps` (Apple Silicon); elsewhere it fails over to `whisper`. Analyze calls an LLM through `Tools/_portable/inference.ts`, which uses the first provider it finds: `AGENT_SKILLS_LLM` (forced), `AGENT_SKILLS_LLM_CMD`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, then a logged-in `claude` or `codex` CLI.

Optional: a `PREFERENCES.md` at `$AGENT_SKILLS_HOME/audio-editor/PREFERENCES.md` (default `~/.agent-skills/audio-editor/`) overrides the defaults. Its keys, each optional:

- `Default cleaning mode`: standard or aggressive for a plain "clean this" request (default standard).
- `Polish`: whether the Cleanvoice pass runs unasked (default only when requested).
- `Delivery loudness`: the LoudnessLock target when none is named (default -14 LUFS / -1 dBTP).
- `Output format`: the file type cleaned audio is written as (default the tool's own).

## Accounts and secrets

Only the optional cloud polish step (`Polish.ts`, or `--polish` on the pipeline) needs an account. Open a Cleanvoice account (cleanvoice.ai), copy the API key from the dashboard settings, and export it or add one line to `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`):

```
CLEANVOICE_API_KEY=<your Cleanvoice API key>
```

Without it, `Polish.ts` prints `CLEANVOICE_API_KEY not found` and exits; everything else still works.

## Prove it works

Run from the skill folder:

```bash
command -v ffmpeg ffprobe insanely-fast-whisper whisper
D=$(mktemp -d) && ffmpeg -hide_banner -loglevel error -f lavfi -i "sine=frequency=440:duration=2" "$D/tone.wav" && bun Tools/GateScan.ts "$D/tone.wav"; rm -rf "$D"
bun -e 'import { getEnv } from "./Tools/_portable/paths.ts"; console.log(getEnv("CLEANVOICE_API_KEY") ? "yes" : "no")'
```

Success: the first command prints a path for ffmpeg, ffprobe and at least one Whisper variant. The second builds a two-second test tone, scans it, and prints `STEPS (audible gate ticks): 0` with exit code 0 (a scan that finds ticks exits 1). The third prints `yes` only if you set up the optional cloud polish.
