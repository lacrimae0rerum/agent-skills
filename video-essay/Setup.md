# Video Essay setup

**Contents:** What it does · Fill in · Accounts and secrets · Prove it works

Status: `bun Tools/Setup.ts --check` (from the skill folder) · optional

## What it does

The video-essay skill turns a piece of content and a stance into a narrated video essay, or turns an author's own blog post plus a reading of it (a recording, a voice clone, or the agent reading the exact words) into a finished video of that post. It writes the argument first, scripts the visuals, synthesizes or aligns the narration, renders on HyperFrames, and reads its own render back before anyone sees it. Nothing is uploaded; every run stops in review.

It needs bun 1.2+ on macOS (renders run inside the macOS network sandbox), a set of licensed font files (the design system embeds them and never falls back to a system face), a portrait for the agent and optionally one for the author, a text-to-speech account for narration (Fish Audio or ElevenLabs) with a voice you choose, the pinned HyperFrames CLI and its Chrome (installed by `Setup.ts`, which also drives page captures headless on a throwaway profile), `ffmpeg`, ImageMagick and `whisper`. `rembg` is optional; without it the thumbnail uses the opaque portrait.

## Fill in

### `$AGENT_SKILLS_HOME/video-essay/Config.json`

The file lives in the skill's data folder (default `~/.agent-skills/video-essay/Config.json`).

Smallest working file. Every face id in `Tools/Theme.ts` `FACES` must be present; `Setup.ts --check` names any that are missing.

```json
{
  "fonts": {
    "serif": "~/Fonts/ExampleSerif-Regular.otf",
    "serifBold": "~/Fonts/ExampleSerif-Bold.otf",
    "serifItalic": "~/Fonts/ExampleSerif-Italic.otf",
    "serifTabBold": "~/Fonts/ExampleSerif-TabBold.otf",
    "figures": "~/Fonts/ExampleFigures-Semibold.otf",
    "sans": "~/Fonts/ExampleSans-Regular.otf",
    "sansTab": "~/Fonts/ExampleSans-Tab.otf",
    "caps": "~/Fonts/ExampleSans-Caps.otf",
    "kicker": "~/Fonts/ExampleCaps-Tab.otf",
    "kickerBold": "~/Fonts/ExampleCaps-Bold.otf",
    "display": "~/Fonts/ExampleCaps-Narrow.otf",
    "cite": "~/Fonts/ExampleCaps-Condensed.otf",
    "quote": "~/Fonts/ExampleQuote-Regular.otf",
    "mono": "~/Fonts/ExampleMono-Regular.otf"
  },
  "avatar": "agent-portrait.png",
  "author": "Alex Example",
  "agentName": "Nova",
  "voice": "fish:EXAMPLEvoiceid000000",
  "voiceSpeed": 1.0,
  "runsRoot": "~/Videos/essay-runs",
  "blogBaseUrl": "https://blog.example.com/posts/",
  "possessive": "their",
  "presenter": { "avatar": "author.png", "label": "ALEX", "badge": "a" },
  "narrators": {
    "clone": { "voice": "elevenlabs:EXAMPLEclonevoice0000", "takes": 3 },
    "da": { "reader": "NOVA", "badge": "b", "seed": 100, "takes": 2 }
  },
  "styleFile": "EssayStyle.md"
}
```

Put the two portraits beside `Config.json`: `agent-portrait.png` (the agent's square portrait, read for every run) and `author.png` (the author's square portrait, read for voice-mode runs). Square PNGs of at least 512 px work best. A relative `avatar` resolves against this folder like the others; without `avatar`, the skill looks for `avatar.png` beside `Config.json`.

`styleFile` is optional: a Markdown list of the writing rules the Argue intent holds every essay to, for example:

```markdown
# Essay style
- Paragraphs of at most three sentences, each ending on a fact.
- No em-dashes.
- Quote the source verbatim; paraphrase only in your own sentences.
```

| Field | Required | Meaning |
|-------|----------|---------|
| `fonts.<face id>` | yes | Path to the font file for that face: absolute, `~/`, or relative to this config's directory. Which cut belongs in each id is in § Faces and colours. |
| `avatar` | no | The agent's portrait. Default `avatar.png` beside `Config.json`. |
| `author` | voice mode, descriptions | The user's name: the default badge label (its first word, uppercased) and the author when a post names none. |
| `agentName` | essay mode, agent reads | The agent's display name, on the essay corner, the thumbnail and an agent-read badge. |
| `voice` | synthesized narration | The narration voice: `fish:<reference id>`, `elevenlabs:<voice id>`, or a bare id for `ttsProvider`. No voice is built in; `Narrate.ts --voice` overrides it. |
| `voiceSpeed` | no | Prosody speed sent with every request, 0.5 to 2. Default 1. |
| `ttsProvider` | no | `fish` or `elevenlabs`, for a bare voice id. Default `$TTS_PROVIDER`, else the provider whose key is set. |
| `runsRoot` | no | Where run directories live. Must sit outside every git repo. Default `~/VideoEssays`; env `VIDEO_ESSAY_DIR` overrides. |
| `blogBaseUrl` | voice mode | Base URL that turns a local markdown post's slug into its live https URL. |
| `possessive` | no | The author's possessive for the badge's read-by line on an agent-read run: `his`, `her` or `their` (case ignored, one short word). The badge reads `READ BY <READER> · THEIR AI` by default; set `his` for `· HIS AI`. A reader name too long for the badge band drops the tail. |
| `presenter.avatar` | voice mode | The author's portrait for the corner badge, absolute or relative to this config's directory. Without it voice mode is unavailable. |
| `presenter.label` | no | The author name on the badge. Default: the first word of `author`, uppercased. |
| `presenter.badge` | no | Badge design: `a`, `b`, `c`, `d`, `e` or `d-dark`. Default `a`. |
| `narrators.da.avatar` / `label` / `reader` / `badge` | no | The corner of a run the agent reads aloud. `reader` defaults to `agentName`. |
| `narrators.da.seed` / `takes` | no | Base seed (integer, default 1) and number of takes (default 3) for the best-of-N agent read. |
| `narrators.clone.voice` | clone runs | The author's own cloned voice (`fish:<id>` or `elevenlabs:<id>`), made with their TTS provider. |
| `narrators.clone.speed` / `seed` / `takes` | no | Pace (default 1), base seed (default 1) and number of takes (default 3) for a clone read. |
| `fontFamilies.<face id>` | no | The family name that face's file must report (a prefix, or a list of them); `DesignAudit.ts --check config` fails a file that reports another family. Unset ids are only checked for being readable fonts. |
| `colors` | no | Colour overrides, every key optional (§ Faces and colours). Each value is `#rrggbb`. |
| `badge` | no | The words a voice badge prints: `header`, `andNot`, `struck`, `wordsLine` (must contain `{LABEL}`), each 1 to 24 characters. Defaults `VIDEO ESSAY`, `AND NOT`, `A SUMMARY`, `{LABEL}'S OWN WORDS`. |
| `skipParagraphs` | no | JavaScript regular expressions (strings, case-sensitive) for post paragraphs that are page metadata and never read aloud (§ Supported post format). |
| `styleFile` | no | The essay writing rules file, beside this config. |

### Faces and colours

Each face id is a role, and the file you map to it should be that kind of cut:

| Face id | What belongs there |
|---|---|
| `serif`, `serifBold`, `serifItalic` | the body serif: regular, bold, italic |
| `serifTabBold` | the body serif with tabular lining figures, bold (chapter numerals) |
| `figures` | a display face for big numbers, semibold |
| `sans`, `sansTab` | a sans, and its tabular-figure cut |
| `caps` | a small-caps sans: lowercase source renders as small caps |
| `kicker`, `kickerBold` | a condensed all-caps face, tabular and bold (kickers, the badge, the thumbnail title) |
| `display` | a narrow all-caps face for headings |
| `cite` | a condensed all-caps face for attributions |
| `quote` | a serif for quotations |
| `mono` | a monospace for code |

The caps roles are set in a forced case (`caps`, `display`, `cite` lowercase; `kicker` uppercase). An ordinary face there still renders, in that case. One family may fill several roles: map the same file to more than one id.

`colors` keys: `accent` (the brand colour: badge signal, essay ring, progress line, thumbnail border), `highlight` (the reading highlight), `paper` (voice-mode ground when a run has no capture), and the token sets `paperInk` and `darkInk` (`ink`, `secondary`, `muted`, `rule`, `connector`, `accent`; `darkInk` also `ground` and `codeGround`). Defaults and roles are in `References/Style.md` § Colour. A worked example with made-up values, a navy brand on warm paper:

```json
"fontFamilies": { "serif": "Example Serif", "mono": "Example Mono" },
"colors": {
  "accent": "#1E3A8A",
  "highlight": "#FDE68A",
  "paper": "#F5F0E6",
  "paperInk": { "accent": "#1E40AF" },
  "darkInk": { "ground": "#0A0F1E", "accent": "#93C5FD" }
},
"badge": { "header": "READ ALOUD", "struck": "A SUMMARY" }
```

`Setup.ts --check` refuses a malformed colour, an unknown key or an over-long badge line, naming it.

### Supported post format

Voice mode reads a post from a local Markdown file (with `blogBaseUrl` set, or a `url:` you pass) or from its live https page. Frontmatter `title`, `slug` and `author` are read when present. Narrated: body paragraphs, list items, and block quotes with no attribution (the author's own words set off). Never narrated: headings, fenced code, tables, `<aside>`, `<callout>`, `<notes>` and `<footnotes>` blocks, attributed quotes (a trailing `— Name` line, a `<cite>`, or an author attribute), captions, images, and any capitalized component carrying a `url` attribute (a link card or embed such as `<LinkCard url="…" />`, whose link is kept for the description). On a live page the body is found by paragraph density, page chrome (`nav`, `header`, `footer`, `aside`) is dropped, and elements whose class ends in `loading`, `skeleton` or `spinner` are waited out during capture. A site-specific metadata line goes in `skipParagraphs`; for example, a footer line like `📁 Filed under: Garden notes` is skipped with:

```json
"skipParagraphs": ["^[^A-Za-z0-9]*Filed under:"]
```

A wrong decision for one block is overridden per run in `Source/narration-overrides.json` (see `Intents/Voice.md`).

### The voice-clone credit

Clone runs carry a voice-clone credit on the badge: the vendor-neutral label `AI VOICE CLONE` from `Tools/Theme.ts` `VOICE_CREDIT`. It names no company and needs no logo files, because narration runs on whichever TTS provider is configured and a credit to a vendor that did not make the voice would be wrong. The rest of `public/` is created by `Setup.ts`.

### Narration voices

Narration is synthesized by a text-to-speech provider through `Tools/lib/tts.ts`: Fish Audio or ElevenLabs. The agent's voice is Config.json `voice`; a clone read uses `narrators.clone.voice`. A value names its provider (`fish:<reference id>` from the voice's page on fish.audio, `elevenlabs:<voice id>` from your ElevenLabs voice library) or is a bare id for `ttsProvider` (else `$TTS_PROVIDER`, else whichever key is set). The provider applies `voiceSpeed` itself, so nothing is stretched afterward. Fish's default model, `drama-3` (`FISH_TTS_MODEL` overrides), speaks `[sigh]` and `<emphasis>` tags; for ElevenLabs (`ELEVENLABS_TTS_MODEL`, default `eleven_multilingual_v2`) the tags are stripped before the request. The voice, its speed and the provider model are part of every chunk's cache key, so a change re-takes the audio.

## Accounts and secrets

Keys go in the environment or in `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`), one `NAME=value` line each.

- **Text to speech**: a Fish Audio account (fish.audio, API keys page) as `FISH_API_KEY`, or an ElevenLabs account (elevenlabs.io, API keys) as `ELEVENLABS_API_KEY`. Narration calls the provider's text-to-speech with word timestamps; without a key the first narration stops naming both variables. Pick the voice in Config.json `voice` (§ Narration voices).
- **Voice clone** (only for `--narrator clone`): make a voice clone of the author with your TTS provider (with the author's consent) and put its id in Config.json `narrators.clone.voice`. Clone runs stop naming that key when it is missing.
- **Font licenses**: buy or obtain the font files you list under `fonts`. They are embedded into renders straight from the paths you give and are never copied into a repo.
- **Capture browser**: nothing to set up. `Capture.ts` runs a headless copy of the render seam's pinned Chrome on a throwaway profile, never your everyday browser profile, so no signed-in account or open tab shows in a frame.
- **Model access for the meaning review**: the meaning map and its review (`Tools/lib/videomeaning/VideoMeaning.ts`, whose output `Tools/Meaning.ts` reads) ask models through `Tools/_portable/inference.ts`. Map and direct use the default provider at level `high`; the review uses two judges pinned to two vendors, Anthropic and OpenAI, each reached by API key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) or a logged-in CLI (`claude`, `codex`). With only one vendor, the review cannot pass; `Run.ts --accept-review-shortfall` goes on with the best round, and the report says so.
- **PII scan** (optional): set `VIDEO_ESSAY_PII_GATE` to a scanner command that takes `<video> --json --out <report.json>` and exits 0 clean, 1 findings, 2 error. A cloud scanner uploads the video; configure one only if you accept that. Without it the verify stage reports the scan as skipped.
- **Recorded readings** (optional): cleaning a recording needs a tight-cut engine, a sibling skill that ships a `TightCut.ts` tool or `VIDEO_ESSAY_TIGHTCUT_ENGINE` naming one, and the `audio-editor` skill for the final loudness lock. Clone and agent reads need neither engine.
- **AI-detection score** (optional, Argue gate 3): the `detect-ai` skill and a Pangram Labs API key as `PANGRAM_API_KEY` (pangram.com → dashboard → API keys). Without them, that gate is skipped and the essay says so.

## Prove it works

From the skill folder, run `bun Tools/Setup.ts` once without `--check` first: that is the install step (dependencies, the pinned HyperFrames CLI, the avatar cut-out, the `public/` link). Everything below leaves your files alone. (`--check` only creates the empty `public/` store folder and its link if they are missing.)

```bash
bun Tools/Setup.ts --check
```

Success prints one line starting `✓ composition ready · fonts: 14 faces`, followed by the avatar, voice, presenter and agent narrator states. With no config file it fails with `video essay config not found` and names this guide.

### A worked example: your first essay file

The argument is the one piece you write by hand before any narration or render. Make a run folder under your `runsRoot` and put this made-up `Essay.md` in it (`~/Videos/essay-runs/example-run/Essay.md` with the config above):

```markdown
---
title: Gardens Do Not Scale Like Factories
thesis: A community garden grows by adding gardeners, not by adding rows, so the plan that doubles the plots without doubling the volunteers will fail by midsummer.
source: https://video.example.com/watch/garden-talk
stance: disagree with the expansion plan
attribution_unsure: []
---

## Their Claims

> If we double the plots this spring, we double the harvest by fall.
> — Pat Example

## Where We Agree

More plots would feed more people if every plot were tended.

## The Disagreement

The talk treats a plot as the unit of output. The plot is only land; the unit of output is a tended plot, and tending is the scarce part.

## The Argument

Every garden I have seen fail did not run out of soil. It ran out of people willing to weed in July. Doubling the rows without a plan for the people who tend them doubles the weeds first.
```

Then lint it:

```bash
bun Tools/EssayLint.ts --run example-run
```

Success prints `91 words (quotes excluded) · 1 quotes` and `✓ essay ok`, and exits 0. Delete the `## Where We Agree` section and run it again: it prints `✗ section missing: ## Where We Agree` and exits 1. The linter reads the file and writes nothing.
