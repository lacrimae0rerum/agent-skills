---
name: video-essay
description: "Turns content plus a stance into a video essay narrated by the agent, any post, idea or feature plus a length into a short agent-narrated explainer video, or the author's own audio reading of their blog post (a recording or their voice clone) into a finished video of that post, with scripted visuals rendered on HyperFrames, a presence layer, rendered and read back. USE WHEN video essay, explainer video, short video about this post, N-minute video of my blog post, make a video about this, respond to this video, argue against this in a video, debate this, video response, narrated video, turn this essay into a video, react to this interview, make a video from my audio, I recorded myself reading the post, turn this post into a video, video from my voice clone, audio to video. NOT FOR the user's camera footage or clips, audio-only cleanup (use `audio-editor`), one-off animation (use `hyperframes`), story films (use `story-film`)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ (bun install in Tools/), ffmpeg/ffprobe, ImageMagick, whisper; rembg optional. Renders run the pinned HyperFrames CLI in the macOS network sandbox (sandbox-exec): macOS only. Narration: FISH_API_KEY or ELEVENLABS_API_KEY, voice in Config.json. Meaning review: Anthropic and OpenAI providers (API key or claude/codex CLI). Optional skills: art-direction, audio-editor, detect-ai, writing."
---

# Video Essay

**Contents:** Ideal State · Intent Routing · Tools · Data & Config · Setup · Quality loop · Gotchas · Examples

The agent's own video format, in two modes, each a fully automated production that proves itself before the user sees it. Essay mode argues first, then renders. Voice mode (`run.json` `mode: "voice"`) turns the author's post, read by their recording, their voice clone or the agent reading their exact words (`run.json` `narrator` `recorded` | `clone` | `da`), into a video of the real post page scrolling with the spoken sentence highlighted, inserts directed from what the post argues (`Tools/lib/videomeaning`: MeaningMap, Direction, a two-vendor plan review), and the reader's portrait in the corner badge (the author's, or the agent's on an agent-read run).

## Ideal State

- An essay run argues before it renders: a linted, steelmanned `Essay.md` with verbatim, correctly attributed quotes reaches the user at the checkpoint (unless the ask skips it), and only then becomes `Script.json` and a render.
- A voice run narrates only the author's own words, its page reads like the live post, and every page highlight and insert is timed to the paragraph being spoken.
- Every render reads itself back before anyone sees it: `Out/verify.json` all green, and the frames and the `Out/review/` studio pass read.
- The mp4 and thumbnail reach `~/Downloads/<slug>/` only through the hand-over (§ Quality loop), after a passing `art-direction` critique on those exact bytes.
- Every run stops in review state; nothing uploads from this skill. Publishing is the user's separate call, with their own upload tool, after they confirm the exact action.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **Argue** | "write the argument", "essay first", "what's our take on this", the first step of every new run | `Intents/Argue.md` |
| **Script** | "script it", "turn the essay into beats", "plan the visuals" | `Intents/Script.md` |
| **Produce** | "produce it", "render the essay", "make the video from the script", re-renders after an edit | `Intents/Produce.md` |
| **Full** | "respond to this video", "video essay on this", "argue X in a video", raw content plus a stance to argue | `Intents/Full.md` |
| **Voice** | "make a video from my audio", "I recorded the post", "use my clone to read the post", a post plus a recording | `Intents/Voice.md` |
| **Explainer** | "make an explainer video", "a short video about this post / idea / feature", "a 2-minute video of my latest post", any source plus a length with no stance to argue | `Intents/Explainer.md` |

`Full` is `Argue` → review checkpoint → `Script` → `Produce`. The checkpoint after the essay is the default: text is cheap to change and a render is not. The user skips it by saying so in the ask ("straight through", "no review, just make it"). `Voice` has no essay and no agent-written narration; its narration rule, stages and inserts are in `Intents/Voice.md`. `Explainer` writes an `Essay.md` with `kind: explainer` (narration only, no opposing quotes) at the length asked for, then runs `Script` and `Produce` straight through; its optional YouTube leg (thumbnail on the post's header image, full description, private upload) is prepared here and uploaded only with the user's own tool after their explicit confirmation; this skill never uploads.

| File | Read when |
|------|-----------|
| `References/ScriptSchema.md` | writing or linting `Script.json` |
| `References/Style.md` | composing frames, the thumbnail, or running DesignAudit (the house design system) |
| `References/Tools.md` | running or debugging one stage tool directly, choosing a flag, or finding a run's files |
| `Setup.md` | first run on a machine, any tool stops naming Setup.md, or a Config.json field's meaning or default |

## Tools

`Tools/Run.ts` drives every run; the other stage tools, the run layout and the composition files are in `References/Tools.md`.

| Tool | Contract |
|------|----------|
| `Tools/Run.ts --run <slug> [--from stage] [--to stage] [--force] [--music ambient\|pulse] [--accept-review-shortfall] [--polish]` | essay: lint, then narrate → score beside capture, then build, then verify beside thumbnail, then describe once verify passes (other stages wait only for what they read); after any failure no stage starts; voice: clean → align → plan → meaning → lint → capture → build → verify → describe |

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/video-essay/PREFERENCES.md` (default `~/.agent-skills/video-essay/`) and override the defaults here; when absent, the defaults stand. Everything personal lives in that data folder. First-time setup is [Setup.md](Setup.md), and `bun Tools/Setup.ts --check` (from the skill folder) reports what is still missing. With no config file every tool stops and names Setup.md.

- `$AGENT_SKILLS_HOME/video-essay/Config.json`: `fonts` (a missing face is an error, never a fallback), `fontFamilies`, `avatar`, `runsRoot`, `blogBaseUrl`, `possessive`, `presenter`, `author`, `agentName`, `voice`, `voiceSpeed`, `ttsProvider`, `narrators.clone`, `narrators.da`, `colors`, `badge`, `skipParagraphs` and `styleFile`; each field's meaning and default is in the Setup.md field table, the face roles and colour keys in Setup.md § Faces and colours. Relative paths resolve against the config dir. Never change `narrators.da.label` for one run; pass `--label` at ingest instead.
- `$AGENT_SKILLS_HOME/video-essay/public/`: created by `Setup.ts` and linked from `Tools/public`. It holds the avatar cut-out and staged runs, never the skill tree.
- Voices: narration is synthesized by a configurable TTS provider (`Tools/lib/tts.ts`): Fish Audio (`FISH_API_KEY`) or ElevenLabs (`ELEVENLABS_API_KEY`). The agent reads with Config.json `voice` (`fish:<reference id>`, `elevenlabs:<voice id>`, or a bare id for `ttsProvider` / `$TTS_PROVIDER`) at `voiceSpeed` (default 1); the provider applies the pace itself, so no chunk is stretched afterward. The author's clone is Config.json `narrators.clone.voice` (a clone the user made with their provider). No voice is built in. Setup.md § Narration voices and § Accounts and secrets have the details.
- Names: the badge label defaults to the first word of Config.json `author` and the reader to Config.json `agentName`. An agent-read badge shows `READ BY <READER> · <POSSESSIVE> AI` (`THEIR AI` unless Config.json `possessive` says otherwise); a post the agent wrote itself (`--label <AGENT NAME>` at ingest) reads `WRITTEN AND READ BY <READER>`. Neither ever carries a voice-vendor logo or a clone credit.
- Pronunciations (optional): `$AGENT_SKILLS_HOME/video-essay/PRONUNCIATIONS.json` when present, plus a per-run `pronunciations.json`, applied to spoken text only.
- Capture (voice runs and capture inserts) drives a headless copy of the render seam's pinned Chrome on a throwaway profile, never the user's own browser or profile; nothing to configure.
- `Run.ts` refuses a run dir under the skill folder, `$AGENT_SKILLS_HOME`, or any git repo.

## Setup

- Runtime: bun 1.2+; `bun Tools/Setup.ts` once (dependencies, the pinned HyperFrames CLI and its Chrome, the avatar cut-out, the `public/` link; it reaches the network only to provision them).
- Programs: `ffmpeg` and `ffprobe`, ImageMagick (`magick`), `whisper`; `rembg` optional (thumbnail cut-out).
- Rendering runs inside the macOS network sandbox (`sandbox-exec`), so renders and snapshots are macOS-only.
- Keys in the environment or `$AGENT_SKILLS_HOME/.env`: `FISH_API_KEY` or `ELEVENLABS_API_KEY` for narration. The meaning stage's two-vendor review needs an Anthropic and an OpenAI provider for `Tools/_portable/inference.ts` (`ANTHROPIC_API_KEY` or the `claude` CLI, and `OPENAI_API_KEY` or the `codex` CLI); with one vendor, pass `--accept-review-shortfall` and say so.
- Optional: `VIDEO_ESSAY_PII_GATE` (a PII scanner command for the verify stage), `VIDEO_ESSAY_TIGHTCUT_ENGINE` (recorded readings), and the `art-direction`, `audio-editor`, `detect-ai` and `writing` skills installed next to this one (or under `$AGENT_SKILLS_DIR`).
- Licensed font files and portraits: Setup.md § Fill in.

## Quality loop

Before the critique, every render passes its own read-back: `Out/verify.json` all green and the `Out/review/` studio pass read.

Nothing this skill produces reaches the user as a first draft. The artifact goes through the `art-direction` skill when it is installed: a direction council before new or large work, then its cross-vendor critique panel (`Critique.ts`) scores it against the rubric and names defects (for a run with a `Meaning/Direction.rendered.json`, pass `--direction <run>/Meaning/Direction.rendered.json` so each beat is also judged against its own rationale), then this skill iterates on those defects until the bar or reports the shortfall. Record the user's verdict with that skill's `Calibrate.ts`. Without the `art-direction` skill, read every frame and the studio pass against the brief yourself, list and fix the defects, and tell the user no critique panel scored the render.

Hand-over is the `art-direction` skill's `Deliver.ts`. It refuses without a passing critique of those exact bytes. Critique `Out/essay.mp4` with `--out <run>` so `Critique.json` sits one level above it, then run `Deliver.ts --artifact <run>/Out/essay.mp4 --critique <run>/Critique.json --to ~/Downloads/<slug>/`. The thumbnail ships as the ≤ 2 MB q85 JPEG (`Intents/Produce.md`), critiqued and delivered the same way. Without that skill, leave the files in `<run>/Out/` and give the user the paths; nothing is copied to `~/Downloads/` unchecked.

## Gotchas

These change what a run does. Failures the tools already handle are documented at their fix sites in `Tools/` (the `Capture.ts` header, `Ingest.ts`, `Clean.ts`, `Narrate.ts`, `Build.ts`, `Page.ts`, `Verify.ts`); read those when debugging that tool.

- **`Tools/public` must be the symlink into the data folder's store (`$AGENT_SKILLS_HOME/video-essay/public`), never a real directory.** A stray empty `public/` dir (left behind by moving the store, for one) makes every Build and Setup fail on the `publicDir` invariant; delete it and let `Setup.ts` recreate the link.
- **HyperFrames `check` fails on text layered under a chapter card (`content_overlap`) unless both card text blocks carry `data-layout-allow-overlap`; the attribute is not inherited.**
- **Narration's word timings come from the provider's timestamped speech (`Tools/lib/tts.ts`) on the model `FISH_TTS_MODEL` or `ELEVENLABS_TTS_MODEL` names.** Do not switch the model without re-probing that it still returns word timings; captions and beat timing depend on them.
- **A DOM-render screenshot draws every web font in Times.** `Capture.ts` takes real pixel screenshots in the headless capture browser and replaces `post.png` only once a marker pass proves the web fonts drew. DOM-to-image renders also miss `::before`/`::after` content and mask-image icons (a nav's arrow glyphs, say), and a lossy JPEG capture breaks the exact-colour marker pass, so captures stay lossless PNG.
- **HyperFrames' own pre-render `check` measures text contrast (WCAG AA 4.5:1) and text overlap at sampled times, and refuses the render (white text on a mid-tone coloured header can fall under 4.5:1; a result wider than the space past its stop can overlap a lane label mid-build).** Text colours come through `readableOn()` against the run's own ground, and DesignAudit measures at settle only, so run the seam check on the staged project when a render is refused; its raw JSON (`hyperframes check <dir> --json`) names the element, colours and time.
- **The rendered mp4 comes out quieter than the staged narration.wav, inside the HyperFrames render seam.** `Build.ts` replaces the mp4's audio with exactly what the composition plays; voice renders fail Verify's −14 ± 1 LUFS if that replacement is skipped.
- **Embedded frames (tweets, videos, widgets) never draw in the DOM-render capture, and never lay out in a hidden tab (they read "LOADING TWEET…" for the whole video).** `Capture.ts` shoots each embed in a headless copy of the pinned browser and pastes the pixels in; loading markers must clear within 30 s or the capture fails, and it never writes a loading state. A link card taller than the reading band is never whole at reading zoom; show it with a `screenshot` insert of the post itself, selected by the card's own link.

## Examples

**Example 1: respond to an interview**
```
User: "Make a video essay answering this interview — I disagree with most of it: <youtube url>"
→ Full: Intake pulls the transcript; Argue writes Essay.md (quotes lint-verified, steelman, disagreement, argument), adversarial read, plus the optional writing audits when installed
→ checkpoint: the essay is shown; on "go", Script.json is written and linted
→ Produce: verify.json green, frames read; mp4 and thumbnail critiqued and delivered through Deliver.ts and the description copied, all in ~/Downloads/<slug>/
```

**Example 2: the agent reads a new post**
```
User: "Have the agent read my new post on composting as a video"
→ Voice: Ingest --narrator da; the post's own words narrated, its page scrolling with the spoken sentence highlighted, embeds and link cards as on the live page
→ meaning-directed inserts on the paragraphs they illustrate; verify.json green; critiqued and delivered to ~/Downloads/<slug>/
```

**Example 3: edit one paragraph after review**
```
User: "Change the ending — softer on the delete-everything advice"
→ Edit Essay.md and the affected beats in Script.json
→ Run.ts --from narrate: only the changed beats re-synthesize; captures stay cached; re-render, re-verify
```
