# Story Film setup

Status: bun Tools/Setup.ts --check >/dev/null 2>&1 && echo ok · required

## What it does

The story-film skill turns one story markdown file into a narrated, animated film: one painting per paragraph, a spoken reading with word timings, and a rendered, verified video. The paintings come from Google's image model, the voice from a text-to-speech provider (Fish Audio or ElevenLabs), and the video is rendered and checked on your machine (rendering needs macOS: it runs inside the macOS network sandbox). All of that needs two paid accounts, two keys, a narration voice and a few command-line programs before the first run.

## Fill in

Three small pieces. Only the narration voice has no default: set it in the story file or in Config.json.

**1. The story file.** Any markdown file. Frontmatter is read when present, and a line of `* * *` starts a new scene. A made-up example:

```markdown
---
title: The Lantern Keeper
author: A. Example
audio_voice: fish:EXAMPLEvoiceid000000
---

The keeper climbed the stairs every evening, counting them as he went.

* * *

By morning the lamp had burned down to a thread of blue.
```

| Field | Meaning |
|---|---|
| `title`, `author` | Used on the title cards. |
| `audio_voice` | The narration voice: `fish:<reference id>` from your Fish Audio library, `elevenlabs:<voice id>` from your ElevenLabs voices, or a bare id for the default provider. Leave it out and the skill uses `voice` from Config.json, then `$TTS_VOICE`, then `$FISH_VOICE_ID` (a Fish voice); if none is set, narration stops with "no voice". |

**2. Config.json** at `$AGENT_SKILLS_HOME/story-film/Config.json` (default `~/.agent-skills/story-film/Config.json`):

```json
{
  "runsRoot": "~/StoryFilms",
  "voice": "fish:EXAMPLEvoiceid000000",
  "voiceSpeed": 1.0,
  "ttsProvider": "fish",
  "fonts": { "serif": "~/Fonts/ExampleSerif-Regular.otf", "serifItalic": "~/Fonts/ExampleSerif-Italic.otf" },
  "provingRun": "the-lantern-keeper"
}
```

| Field | Meaning |
|---|---|
| `runsRoot` | Where each film's working folder goes. Default `~/StoryFilms`; `STORY_FILM_DIR` overrides it. It must not sit inside the skill folder, `$AGENT_SKILLS_HOME/story-film/`, or any git repo. |
| `voice` | The default narration voice (same forms as `audio_voice`). No voice is built in. |
| `voiceSpeed` | Prosody speed for the default voice, 0.5 to 2 (default 1). Other voices read at 1. |
| `ttsProvider` | `fish` or `elevenlabs`, for bare voice ids. Default: `$TTS_PROVIDER`, else the first provider whose key is set. |
| `fonts.serif`, `fonts.serifItalic` | Paths to font files you are licensed to embed, for the captions and cards. Without them the default serif is used: Source Serif 4 (SIL Open Font License), installed by `Setup.ts`. Its Latin subset covers English; configure a fuller face for other scripts. |
| `provingRun` | The run slug the skill's proving-run checks target. `Setup.ts --proving-run` prints it and exits 1 naming this file and key when it is unset. Only needed if you run those checks. |

**3. PREFERENCES.md** (optional) beside Config.json: your casting and register taste, read by the Storyboard intent. `## Casting` says how to describe people where the story is silent, `## Register` names one tone for every shot, `## Style precedent` records a style that worked. With no file, the story decides.

## Accounts and secrets

Export two keys, or add them to `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`), one `NAME=value` line each:

- `FISH_API_KEY` or `ELEVENLABS_API_KEY`: open a Fish Audio account at <https://fish.audio> or an ElevenLabs account at <https://elevenlabs.io> and create an API key. Narration calls the provider's text-to-speech endpoint with word timestamps. Pick a voice from that account (or a clone you made of your own voice) and put its id in `voice` or `audio_voice`. Optional: `TTS_PROVIDER` (`fish` or `elevenlabs`), `FISH_TTS_MODEL` (default `drama-3`, which speaks `[sigh]` and `<emphasis>` tags), `ELEVENLABS_TTS_MODEL` (default `eleven_multilingual_v2`; tags are stripped for it).
- `GOOGLE_API_KEY`: open a Google AI (Gemini API) account. Paintings come from its image model at 16:9, 2K (`STORY_FILM_IMAGE_MODEL` overrides the default `gemini-3-pro-image`).

Runtime: bun 1.2+. Run `bun install` in `Tools/` (or `bun Tools/Setup.ts`, which runs it for you). Programs on your PATH: `ffmpeg` and `ffprobe` (required), and `whisper` and `tesseract` (they feed the verification step, which reports a failure if they are missing). Chrome, the HyperFrames renderer and GSAP are fetched on the first render, which is the one step that reaches the network for tooling.

Check that the keys are present without printing them (run from the skill folder):

```bash
bun -e 'import { getEnv } from "./Tools/_portable/paths.ts"; for (const k of ["FISH_API_KEY", "ELEVENLABS_API_KEY", "GOOGLE_API_KEY"]) console.log(k, getEnv(k) ? "yes" : "no")'
```

## Prove it works

Run from the skill folder:

```bash
bun Tools/Setup.ts --check
```

It provisions nothing and fails on anything missing. Success is a list of check marks ending with `ffmpeg ok`, `ffprobe ok`, `whisper ok` and `tesseract ok`, with a `serif:` line saying `(default: Source Serif 4)` or `(configured)`. On a working install it prints:

```
✓ deps ok
✓ serif: normal + italic (default: Source Serif 4)
✓ hyperframes 0.8.71 (provisioned on first render)
✓ ffmpeg ok
✓ ffprobe ok
✓ whisper ok
✓ tesseract ok
```

A line that says `MISSING` names the program to install. To prove the story file reads, run `bun Tools/Intake.ts --story <your-story.md>`: it creates a run folder under `runsRoot` and prints the beat and scene counts, with no paid call. Then ask your agent "film this story".
