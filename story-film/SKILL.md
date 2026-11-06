---
name: story-film
description: "Turns a story markdown file into a narrated animated film, a reading format where the listener is read to and sees the story as it is told: beats from paragraphs, a bible so every character and place looks the same in every shot, one painting per beat in one style, text-to-speech narration (Fish Audio or ElevenLabs) in the story's voice with word timings, a HyperFrames film with camera moves, dissolves, scene breaks, a caption line and title cards, read back and verified. USE WHEN animated reading, story film, film this story, animate this story, illustrated audiobook, narrated story video, turn this story into a movie, storyboard this story, paint the shots, render the story film. NOT FOR the user's own recordings, argument-first video essays (use `video-essay`), one-off motion graphics (use `hyperframes`), single illustrations (use `art`), writing the story itself (use `write-story`)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ (bun install in Tools/), ffmpeg and ffprobe; whisper and tesseract for the verify checks. Renders run the pinned HyperFrames CLI in the macOS network sandbox (sandbox-exec), so rendering is macOS-only. Env: GOOGLE_API_KEY (paintings); FISH_API_KEY or ELEVENLABS_API_KEY (narration), voice id from Config.json or --voice. Network on first render to provision HyperFrames, Chrome and GSAP."
---

# Story Film

A story goes in; a verified film of it comes out. One creative stage (the storyboard) and a deterministic tail (bible, shots, narration, render, verification, critique, delivery).

## Ideal State

- A story file becomes a film a viewer accepts as one made thing: the same faces first frame to last, each painting fitting its beat, the caption in step with the voice.
- Every film is read back before anyone sees it: `Out/verify.json` green and complete, the review sheets looked at, and the `art-direction` critique passed on the exact bytes delivered.
- Nothing reaches the user as a first draft: the film and its sheets land in the downloads folder only through `Run.ts --deliver` (the `art-direction` skill's Deliver), after a passing critique.
- Expensive stages run once per change: the storyboard is reviewed and linted before any painting, and every later stage is hash-cached so an edit redoes only what it touched.
- Nothing leaves review: the skill has no upload or publish path.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **Full** | "film this story", "animated reading of X", "turn this story into a movie", anything that starts from a story file | `Intents/Full.md` |
| **Storyboard** | "storyboard this", "write the bible", "plan the shots", a redo of the creative stage after intake | `Intents/Storyboard.md` |
| **Produce** | "paint the shots", "render it", "re-render after an edit", "verify the film" | `Intents/Produce.md` |

| File | Read when |
|------|-----------|
| `References/StoryboardSchema.md` | writing or editing `Storyboard.json` |
| `Setup.md` | first-time setup: TTS and Google keys, the narration voice, ffmpeg and the other programs, Config.json |

`Full` is Intake → Storyboard → Produce. The storyboard is the review checkpoint when the user wants one: it is cheap to change and forty paintings are not. Skip it by saying so ("straight through").

## Run Layout

```
<run>/
  run.json  Beats.json  Storyboard.json  pronunciations.json (optional)
  Bible/<id>.<hash>.png        style plate + reference sheets
  Shots/<beat>.<hash>.png      one painting per beat · contact-sheet.png
  Narration/<beat>.<hash>.{mp3,align.json,wav}  narration.wav  timeline.json
  Out/composition/             the HyperFrames project Build.ts writes (index.html, plan.js, film.js, shots/, narration.wav)
  Out/film.mp4  render.json  render.log  verify.json  Critique.json  frames/  caption-check/  review/{contact-sheet,motion-strip}.png
```

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/story-film/PREFERENCES.md` (default `~/.agent-skills/story-film/`) and override the defaults here; when absent, the defaults stand. First-time setup (accounts, keys, files to fill in): [Setup.md](Setup.md).

- Voice: `--voice`, else the story's `audio_voice` frontmatter, else `voice` in `$AGENT_SKILLS_HOME/story-film/Config.json`, else `$TTS_VOICE`, else `fish:$FISH_VOICE_ID`. The value is `fish:<reference id>`, `elevenlabs:<voice id>`, or a bare id for the default provider (`ttsProvider` in Config.json or `$TTS_PROVIDER`, else the first provider whose key is set). No voice is built in. Narration takes no model flag (`FISH_TTS_MODEL`, default `drama-3`; `ELEVENLABS_TTS_MODEL`, default `eleven_multilingual_v2`). The configured default voice reads at Config.json `voiceSpeed` (default 1), any other voice at natural pace. Keys: `FISH_API_KEY` or `ELEVENLABS_API_KEY`.
- Images: Gemini image generation (`STORY_FILM_IMAGE_MODEL`, default `gemini-3-pro-image`) on `GOOGLE_API_KEY`, 16:9 at 2K, reference images attached per shot.
- `$AGENT_SKILLS_HOME/story-film/Config.json`: `runsRoot` (default `~/StoryFilms`; `STORY_FILM_DIR` overrides), `voice`, `voiceSpeed`, `ttsProvider`, `fonts.serif` / `fonts.serifItalic` (paths to licensed faces; `path.ttc#<index>` names one face of a collection), embedded into each composition as @font-face data. No font configured means the default serif, Source Serif 4 roman and italic (SIL Open Font License), installed by `Setup.ts` as the pinned `@fontsource/source-serif-4` dependency.
- `$AGENT_SKILLS_HOME/story-film/PREFERENCES.md`: the user's casting and register taste for the Storyboard intent. `Config.json` `provingRun` names the run slug the proving-run checks use (`Setup.ts --proving-run` prints it).
- Pronunciations: `$AGENT_SKILLS_HOME/story-film/PRONUNCIATIONS.json` plus a per-run `pronunciations.json`, applied to spoken text only; the caption shows the story's words.
- `Run.ts` refuses a run dir under the skill folder, the user's data folder, or any git repo (symlinks dereferenced first).
- Delivery (`--deliver`) needs the `art-direction` skill installed next to this one (or under `$AGENT_SKILLS_DIR`); it copies to `~/Downloads/<slug>/` (`STORY_FILM_DOWNLOADS_DIR` overrides).

## Setup

- Runtime: bun 1.2+; run `bun install` in `Tools/` once (the image client and the default serif), or `bun Tools/Setup.ts`, which also provisions the HyperFrames CLI, its Chrome and GSAP on first use (network).
- Programs: `ffmpeg` and `ffprobe`; `whisper` and `tesseract` for the verify stage's speech and caption checks.
- Rendering runs inside the macOS network sandbox (`sandbox-exec`), so the render step is macOS-only.
- Keys in the environment or `$AGENT_SKILLS_HOME/.env`: `GOOGLE_API_KEY`, and `FISH_API_KEY` or `ELEVENLABS_API_KEY`. Set the narration voice (`voice` in Config.json).
- Details and a proof it works: [Setup.md](Setup.md).

## Gotchas

- **The image model copies whatever is in the style plate, including things that are not style (2026-09-17, first run).** A violet dot in the plate put a stray bead on a character sheet. Keep the plate's subject empty (the prompt asks for an empty interior) and say in each bible desc what the character must NOT carry.
- **The story file can change under a run.** Intake reads the frontmatter once; a voice or prose edit in the source after intake is invisible until `Intake.ts` runs again (2026-09-17: the narrator was re-cast in the story file after the first intake, and the first film went out in the old voice). Re-run Intake before any re-narration and diff the beat count.
- **`bun test <bare path>` drops child-process output (Bun 1.3.6).** Always `bun test ./Tools` from the skill folder.

## Examples

**Example 1: a story file to a film**
```
User: "Turn the story at stories/the-lighthouse.md into an animated reading"
→ Full: Intake writes Beats.json; the Storyboard intent writes the bible and one shot per beat; lint exits 0
→ Run.ts: bible painted, shots painted (4 at a time, cached by hash), narration synthesized, film rendered, verify.json green, review sheets written
→ art-direction critique of Out/film.mp4 passes into Out/Critique.json; Run.ts --from sheet --deliver lands the film and sheets in the downloads folder
```

**Example 2: one painting is wrong**
```
User: "The kitchen in beat 12 looks like a restaurant — fix it"
→ Edit that shot's prompt in Storyboard.json (and the place's bible desc if the sheet is the problem)
→ Run.ts --from lint --to shots repaints that one beat (everything else is cached); Run.ts --from build re-renders and re-verifies
```

**Example 3: a character drifts**
```
User: "Ana looks forty in half the shots"
→ Tighten her bible desc (age, face), Characters.ts --only ana repaints her sheet, Shots.ts --force repaints the shots that carry her ref (their hash changed with the sheet)
```
