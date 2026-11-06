---
name: hyperframes
description: "One-off semantic animations and animated explainers authored as HTML + GSAP on HyperFrames, directed by a meaning layer (MeaningMap then Direction, reviewed by two vendors before anything animates) and rendered to MP4 through a sandboxed, version-pinned HyperFrames seam, with a critique loop before delivery. USE WHEN animation, animate this, motion graphics, animated explainer, content to video, make a short, generate a video about, launch video, product launch video, launch film, capability video, feature video, make a video of what we just added, promo video, ad creative video, landing-page hero video, AI video, video overlay, render video, programmatic video, system film, hyperframes, remotion (retired). NOT FOR static images or diagrams, or animated technical diagram GIFs (`art`), editing or tight-cutting recorded footage, narrated essays or explainers of a post, idea or feature (`video-essay`), or audio-only cleaning (`audio-editor`)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+, macOS (the render sandbox is sandbox-exec), ffmpeg and ffprobe, and a one-time `bun Tools/lib/hyperframes/HyperFrames.ts install`. Plan review needs Anthropic and OpenAI access (ANTHROPIC_API_KEY or the claude CLI; OPENAI_API_KEY or the codex CLI). Optional: FISH_API_KEY and FISH_VOICE_ID (narration), GOOGLE_API_KEY (WatchFilm), HYPERFRAMES_CACHE, HYPERFRAMES_PROJECTS_DIR, AGENT_SKILLS_OUTPUT_DIR."
---

# HyperFrames

Makes short animations the way the `art` skill makes images: from code, reproducibly, from what the content means. A composition is an HTML page with one paused GSAP timeline; HyperFrames seeks it frame by frame and encodes it. Every render goes through the seam in `Tools/lib/hyperframes/`, which pins the version, turns telemetry off, sandboxes the network, checks the timeline is registered and moving, and remuxes the output without container metadata so the renderer's own name and version stamp does not travel with the file. It adds no AI-content label of its own; label AI-generated shorts wherever they are published.

Order is fixed: meaning, then direction, then motion. `Tools/lib/video-meaning/VideoMeaning.ts` decomposes the source into a MeaningMap, directs every beat as a Direction with a written rationale, and a two-vendor review passes that plan before a single scene is authored. A launch film is directed instead by the user's pick between animatics.

Paths in this skill are relative to the skill folder; run the commands from there.

**Contents:** Ideal State · Intent Routing · Tools · Proof · Quality loop · Data & Config · Setup · Gotchas · Examples

## Ideal State

- Every piece was directed before it was animated: each scene carries a stated reason (a Direction beat that passed review, or the launch film's picked direction), and a plan that never passed is reported with its defects, not animated around.
- Proof passed three times, and each result was handed back (§ Proof): on the plan before building (no brief fact dropped), on the first stills before the full render, and on the final encode. "I looked at the stills" is not evidence; each check names the facts and frames it held.
- Every render went through the seam `Tools/lib/hyperframes/` with every stage green; nothing ran the bare `hyperframes` CLI, and a failing stage was fixed in the composition, never bypassed.
- It reads as authored, not templated (`References/MotionDesignPhilosophy.md`): settling eases where a physical thing would ease, one focal movement per beat, text still while it is read, timing with texture, and only the transitions the content motivates. Watched once with sound off, it could not have come from a template; a piece a template could have produced got another pass.
- A piece about real things shows them (2026-10-16). While the narration names something that exists (a system, product, screen or place), the viewer sees it as itself, its real surface or a motion study of how it works, and the piece returns to its anchor graphic between them, so the whole and its parts stay in one argument. A narrated piece that tours several subjects changes scene at the pace of its argument; one diagram held under all of it is a template.
- Explainers and generated shorts are one system: palette, type scale, spacing and eases come from `Tools/Theme.ts`. A launch film takes them from its chosen reference instead (`Intents/LaunchVideo.md`).
- Nothing this skill produces reaches the user as a first draft. Every artifact went through the quality loop (§ Quality loop): a direction council before new or large work, then a cross-vendor critique, iterated on its named defects until it passes the bar or reported with the shortfall. A passing `Critique.json` sits beside the render when the `art-direction` skill ran it.
- A project can be rendered again from its folder: one paused GSAP timeline, every asset local, the project outside every git repo.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **ContentToAnimation** | "animate this", "create animations for", "video overlay", "animated explainer" | `Intents/ContentToAnimation.md` |
| **GeneratedContentVideo** | "generate a video about", "AI video", "content to video", "make a short" | `Intents/GeneratedContentVideo.md` |
| **LaunchVideo** | "launch video", "product launch film", "promo video", "ad video", "hero video for the landing page" | `Intents/LaunchVideo.md` |
| **CapabilityVideo** | "capability video", "make a video of what we just added", "announce this feature" | `Intents/CapabilityVideo.md` |
| **SystemFilm** | "system film", "live dashboard video", "show this system running", "animate this workflow run" | `Intents/SystemFilm.md` |

| File | Read when |
|------|-----------|
| `References/MotionDesignPhilosophy.md` | before building any piece: the taste doctrine behind the "reads as authored" bar above |
| `References/LaunchFilmCraft.md` | LaunchVideo, before anything is directed: what praised code-built launch films share (length, pace, type, sound, techniques) |
| `References/MusicScore.md` | adding music: a score as data, standalone pieces only |
| `References/VoiceoverCleaning.md` | LaunchVideo built on a script the user recorded, before any word timing: the ordered cleaning recipe and the voiceover gotchas |
| `Tools/lib/hyperframes/README.md` | authoring or debugging a composition: the seam contract, network controls, capture modes and composition gotchas |
| `Tools/lib/video-meaning/README.md` | the MeaningMap, Direction and review files, the validator's refusals and the verdict rule |
| https://hyperframes.heygen.com | HyperFrames' own authoring docs (source: https://github.com/heygen-com/hyperframes, Apache-2.0) |
| `Setup.md` | first-time setup: ffmpeg, the one-time tool install, and the optional narration and film-review keys |

## Tools

| Tool | Purpose |
|------|---------|
| `Tools/Scaffold.ts` | `--dir <project> --title "<text>" [--subtitle] [--width --height --fps --duration --id] [--force]`: writes a contract-complete `index.html` (theme, local GSAP, registered timeline, a title card that renders) and stages GSAP |
| `Tools/SystemFilm.ts` | `--script <script.json> --dir <project> [--force]`: builds a SystemFilm composition and its `STORYBOARD.md` from a system-run script in the house theme; schema in `Tools/SystemFilm.help.md` |
| `Tools/Theme.ts` | `HOUSE_THEME` (colours, type, spacing, GSAP eases and durations: a neutral default merged with the user's `Theme.json`), `loadTheme()`, and `themeCss()` for the page |
| `Tools/lib/hyperframes/HyperFrames.ts` | the render seam: `install`, `check`, `snapshot --at … --out-dir …`, `render --out <file.mp4> [--audio]`, `bands`, `stage-gsap` |
| `Tools/lib/video-meaning/VideoMeaning.ts` | `map`, `direct --mode essay`, `review`, `revise`, `validate` |
| `Tools/lib/fish-tts.ts` | `--text-file script.txt --out narration.mp3 --alignment alignment.json [--voice <id>] [--speed]`: Fish Audio narration with word timestamps (also `fishSpeakWithTimestamps()` as a library) |
| `Tools/FilmStats.ts` | `<film.mp4…> [--json] [--sheet]`: length, beats per 10 s, motion, ink, brightness range and loudness per film, plus a 30-frame contact sheet; compares a cut against its reference films |
| `Tools/TextFit.ts` | `--project <dir> [--times 1.2,3.4 | --hits hits.md | --every 0.5] [--settle 0.5] [--json]`: seeks the timeline in the seam's sandboxed Chrome and fails (exit 1) on text at rest that is outside the 5% title-safe frame, clipped by a mask, truncated, or partly covered |
| `Tools/WatchFilm.ts` | `<film.mp4…> [--out-dir]`: a Gemini watch-and-listen pass writing a shot list, beat sync, type, sound and craft notes to `<film>-watch.md`; public films unless the user's `PREFERENCES.md` trusts the vendor with private cuts, a check the caller makes because the tool uploads every path it is given |

## Proof

Three checks, each written to `<project>/proof.md` with what it held and what failed. With the `assay` skill installed, its proof intent can run them; otherwise the agent runs them as written here.

1. **Plan check, before building.** List every fact in `BRIEF.md` (the one point, numbers, names, the price, the offer, the call to action) beside the storyboard or shot-list beat that keeps it (`STORYBOARD.md`, or `SHOTLIST.md` for a release film). A fact with no beat fails the check: fix the storyboard, then build.
2. **Stills check, before the full render.** Take the first stills with `snapshot` at the hit times and look at each one (read the images, or ask the user to look): every brief fact on screen where the storyboard put it, every highlight, ring or box enclosing what it marks, the brief's focal thing the most prominent thing in the frame, and `Tools/TextFit.ts` passing at those times.
3. **Final check, on the encode.** Decode frames at the same hit times from the final MP4 (`ffmpeg -ss <t> -i <film.mp4> -frames:v 1 <frame.png>`) and repeat the stills check on them; compare each with its still, so a film whose pixels left its stills (a font swapped on the render path, a scene that moved) fails.

## Quality loop

- **With the `art-direction` skill installed:** run its direction council before new or large work. After the render, write `<project>/Brief.json` from that skill's brief example and run its critique tool on the film; iterate on the named defects until it passes the bar that skill sets, or report the shortfall. Hand over with its delivery tool to `${AGENT_SKILLS_OUTPUT_DIR:-$HOME/Downloads}`; it refuses without a passing critique whose artifact matches. Record the user's verdict with its calibration tool.
- **Without it:** critique the film yourself against `References/MotionDesignPhilosophy.md`, this Ideal State and the intent's Ideal State, at least two passes on the stills and one full watch with sound off; if your agent can run subagents, have one with no other context critique it too. Fix every named defect, then copy the final file to `${AGENT_SKILLS_OUTPUT_DIR:-$HOME/Downloads}` and report what the critique found.
- Uploading, sharing or posting a film is a separate external action: confirm the exact action (service, file, audience) with the user first.

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/hyperframes/PREFERENCES.md` (default `~/.agent-skills/hyperframes/`) and override the defaults here; when absent, the defaults stand. The same folder holds `Theme.json` (a partial theme merged over the neutral default key by key; `Tools/Theme.ts` reads it at import and fails loud on an unknown key, a wrong type or a named font family), `LaunchFilmReferences.md` (LaunchVideo's reference pack) and `TypeRoles.json` (house type roles the seam's `roleFaces()` reads). `PREFERENCES.md` holds the user's video taste (presets, music placement, capture rules, whether `Tools/WatchFilm.ts` may send private cuts). The `art` skill's preferences (`$AGENT_SKILLS_HOME/art/PREFERENCES.md`) set the house aesthetic when present; load them before composing.

## Setup

- bun 1.2+, macOS, and ffmpeg/ffprobe on PATH (`brew install ffmpeg`).
- Once: `bun Tools/lib/hyperframes/HyperFrames.ts install` fetches the pinned HyperFrames CLI, its headless Chrome and GSAP (the only unsandboxed network step).
- Plan review: Anthropic access (`ANTHROPIC_API_KEY` or the `claude` CLI) and OpenAI access (`OPENAI_API_KEY` or the `codex` CLI); without both, every review fails with the missing judge named.
- Optional keys, in the environment or `$AGENT_SKILLS_HOME/.env`: `FISH_API_KEY` and `FISH_VOICE_ID` for narration, `GOOGLE_API_KEY` for `Tools/WatchFilm.ts`.
- Full guide and a working check: `Setup.md`.

## Gotchas

- **Never call `hyperframes` or `bunx hyperframes` directly.** The bare CLI phones home, fetches Google Fonts with the page text for any unembedded family, inlines CDN scripts, and ships an unregistered timeline as a still video with exit 0 (seam H2 findings, 2026-09-24). The seam blocks each of these.
- **Named font families need `embedFonts()`, and a stack must never start generic (2026-10-24).** A family without an `@font-face` fails preflight `font-not-embedded`. The pinned compiler puts Inter first in any stack whose first family is generic, on the MP4 only, so stills and every check see the generic face while the film ships in Inter: the proof-loop film was specified monospace and shipped in sans past five checks. Name a real face first through the seam's `roleFaces(role)` (the house TypeRoles.json, or the compiler's bundled OFL face); preflight `font-generic-primary` refuses a mono or serif generic first and warns on a sans one, and the final proof check (§ Proof) compares an encode frame with its still to catch a film whose pixels left its stills.
- **Frames are seeked, not played.** CSS `transition`, `Date.now`, `performance.now`, `requestAnimationFrame`, unseeded `Math.random` and `setInterval` all break a render; preflight refuses them. All motion lives on the one GSAP timeline.
- **Measure layout only after the embedded fonts load (2026-09-28, two launch-film segments).** With `font-display: swap`, a timeline built at script load measures fallback-font heights (0 of 10 faces loaded when measured; rows came out 21 px taller), so FLIP reorders overlap and positioned panels land low. Build the timeline after `document.fonts` has loaded every face (`registerAfterFonts`, or await each face's `load()`), and never read `getBoundingClientRect` before that.
- **Screenshot capture is the seam default** because draw-element capture shipped stale frames under load with exit 0 (2026-09-24). Leave it on.
- **Music is for standalone pieces only**, never under recorded footage of someone speaking or an overlay placed over them talking: a bed under a voice competes with it (`References/MusicScore.md`). The user's `PREFERENCES.md` may narrow this further.
- **Rendering is CPU-heavy.** Run long renders in the background; take stills with `snapshot` before committing to a full render.
- **Projects live outside every git repo** (`${HYPERFRAMES_PROJECTS_DIR:-$HOME/HyperFrames}/<slug>/`); output reaches `${AGENT_SKILLS_OUTPUT_DIR:-$HOME/Downloads}` only through the quality loop's hand-over (§ Quality loop).
- **The seam is macOS only.** Every render-time process runs under `sandbox-exec` with outbound network denied; on another OS the seam refuses to render rather than run unguarded (`Tools/lib/hyperframes/README.md` § Network).

## Examples

**Example 1: animated explainer from a post**
```
User: "animate the key argument of this post"
→ ContentToAnimation intent
→ A themed typography-and-diagram MP4 whose every scene traces to a reviewed Direction beat, delivered to Downloads with its passing Critique.json
```

**Example 2: a generated short**
```
User: "make a 60-second vertical short about this idea"
→ GeneratedContentVideo intent
→ A 1080x1920 narrated short with generated scene images and captions timed from the TTS alignment, rendered with --audio and delivered after a passing critique
```

**Example 3: a product launch film**
```
User: "make a launch video for the new app"
→ LaunchVideo intent
→ Two or three animatics to pick from, then a 15–45 s master cut to music on the real product, plus an ad cut and a hero loop, each measured against the chosen reference film
```
