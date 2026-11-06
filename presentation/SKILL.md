---
name: presentation
description: "Makes talks, slide decks and sales pitches: a read-aloud lecture in Keynote or HTML, a cue-card HTML deck, or a pitch from product docs (value story, talking points, charcoal sketch). USE WHEN presentation, make me a deck, slides, slide deck, present on, give a talk on, keynote, speaker notes, present this, serve the deck, presenter mode, lecture, read-aloud talk, script for a talk, turn this essay or dictation into a talk, move this slide, reprocess the talk file, make that slide a diagram, find footage of the films I mention, make the animations autoplay, real book cover, real screenshot, too much white space, export to PPTX, sales pitch, sales narrative, sales deck, pitch deck, sales package, sales script, product pitch, elevator pitch, value proposition, turn this into a pitch. NOT FOR images (use `art`), video (use `hyperframes` or `video-essay`), web design (use `webdesign`), or reading text aloud."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+. Keynote lane is macOS-only (Keynote app, osascript); ImageMagick (magick) for decks with pictures; ffmpeg for media clips. Slide design needs an LLM: ANTHROPIC_API_KEY, OPENAI_API_KEY, the claude or codex CLI, or AGENT_SKILLS_LLM_CMD. Generated art needs the art and art-direction skills."
license: MIT (see LICENSE.txt)
---

# presentation

**Contents:** Ideal State · Intent Routing · Data & Config · Setup · Gotchas · Examples

Talks, the slides behind them, and sales pitches, in three modes.

- **Lecture mode** is a talk the speaker reads aloud from start to finish. The text is the content and the slides are there for pacing: a new slide every 15 to 30 seconds keeps the room watching, and each visual either supports the sentence being read or stays quiet. The source is a talk file (READ.md or SCRIPT.md); the deck is Keynote or HTML and is regenerated from it.
- **Deck mode** is a deck where the slides carry the argument and the speaker glances at short cues. One claim per slide, the archetype chosen from the content, built as an HTML deck on the user's template and served with speaker view.

- **Pitch mode** turns product documentation into a sales pitch: a first-person value story a buyer can retell, talking points, an elevator pitch, and for a full package a charcoal sketch (`Intents/Pitch.md`).

Pick lecture mode when the speaker says they will read it, or hands over a talk file or dictation to turn into a talk. Pick deck mode for "make me a deck on X". Pick pitch mode for a sales pitch, narrative or package. When it is unclear, ask once.

## Ideal State

- Every talk has a short spec before its slides do (2026-10-21): a plain acceptance-criteria document in the talk folder. Its goal line names what the audience believes or does by the end, its criteria hold the time budget (spoken words at about 135 per minute, slide count) and the arc, and every cut, move or added slide traces to that goal. A change of thesis updates the spec first, then the order and the script.
- The speaker gets a deck they can present from: in lecture mode the notes are the talk file word for word, in deck mode every slide carries one claim and glanceable notes, and the talk file or script stays the one source the deck is rebuilt from.
- Everything real the talk names is on screen as itself: the speaker's registered things (`RealThings.json`) with their registered picture, everything else sourced through `Intents/MediaSourcing.md`. Every outside picture and clip has rounded corners (12 pt in Keynote, 12 px in an HTML deck) and its credit (film and year, site, publisher) in the small bottom-left source line, never the subtitle.
- Generated art appears only where it carries something words cannot, and every number on a chart was verified this session or its source line says "illustrative". In lecture mode, on-slide text is a few words that echo the line being read, and where a visual adds nothing a plain text slide is right.
- Every slide passes the layout and playback checks in code (balanced, pictures filling the space they were given and never crowding the title, nothing overlapping, no large empty band, nothing waiting for a click) and was looked at as rendered pixels.
- A pitch tells one value story a buyer can retell, every product claim traced to a line in the source docs, with no feature-list sentence, and its sketch carries the same register and idea (`Intents/Pitch.md`).
- No deck reaches the speaker as a first draft: its slides passed a `slides` critique (`References/QualityLoop.md`) and it arrives through the hand-over step in `References/QualityLoop.md` (the `art-direction` skill's Deliver when installed) or as a served URL with the human-only keys stated.

## Intent Routing

| Mode | Intent | Trigger | File |
|------|----------|---------|------|
| Lecture | **Write** | "write a lecture on X", "turn this dictation/essay/talk into a lecture", "convert my deck to a lecture" | `Intents/Write.md` |
| Lecture | **Build** | "sync the lecture", "rebuild the deck", "I edited the script", "present the lecture" | `Intents/Build.md` |
| Lecture | **Keynote** (create) | "make the Keynote", "Keynote version of my talk", a talk file with no deck yet | `Intents/Keynote.md` |
| Lecture | **KeynoteUpdate** | "move this slide up here", "reprocess this, I changed the file", "change the title on slide N", "make slide N a diagram", "redo the slides for section N" | `Intents/KeynoteUpdate.md` |
| Both | **KeynoteArt** | "make the art for the deck", "draw the diagrams", "redo the art on slide N", slides showing ART NEEDED or DIAGRAM NEEDED | `Intents/KeynoteArt.md` |
| Both | **MediaSourcing** | "find footage of X", "show the real film", "get the book cover", "screenshot the site", `>` visual direction lines, slides showing MEDIA NEEDED | `Intents/MediaSourcing.md` |
| Deck | **CreateDeck** | "make me a deck on X", "slides for my talk" | `Intents/CreateDeck.md` |
| Both | **Present** | "serve the deck", "present it", "presenter mode" | `Intents/Present.md` |
| Deck | **ExportToClaudeDesign** | "push to Claude Design", "export to PPTX" | `Intents/ExportToClaudeDesign.md` |
| Pitch | **Pitch** | "sales pitch", "sales narrative", "elevator pitch", "value proposition", "turn this into a pitch", "create a sales package", "a visual for this sales story", "sales script", "sales materials", "product pitch", "create a sales story", "sales deck" or "pitch deck" (the pitch first, then CreateDeck when slides are wanted) | `Intents/Pitch.md` |

| File | Read when |
|------|-----------|
| `References/TalkFiles.md` | reading, writing or rebuilding from a talk file (READ.md, SCRIPT.md, a speaker's Markdown): how its lines become talking points, titles and notes |
| `References/QualityLoop.md` | before any deck goes to the speaker: the `slides` critique and the hand-over |
| `References/KeynoteGotchas.md` | every Keynote, KeynoteUpdate, KeynoteArt or MediaSourcing run: dated Keynote, layout and autoplay failures |
| `References/HtmlDecks.md` | building, capturing or serving an HTML deck (Build, CreateDeck, Present, ExportToClaudeDesign) |
| `References/Tools.md` | which tool checks what, or a tool no intent shows |
| `ScriptFormat.md` | writing or validating a lecture SCRIPT.md: its fields and slide types |
| `DesignSystem.md` | authoring a deck-mode slide: the default tokens and type, the nine archetypes and how to choose; the user's own `DesignSystem.md` in the data folder overrides its brand sections |
| `Tools/` | a tool's flags beyond what an intent shows: `Keynote.help.md`, `KeynoteArt.help.md` |
| `Setup.md` | first-time setup: the deck template, the real-things registry, and what the Keynote, media and layout-check lanes need installed |


## Data & Config

User preferences and assets, when present, live in `$AGENT_SKILLS_HOME/presentation/` (default `~/.agent-skills/presentation/`) and override the defaults here; when absent, the defaults stand. Check that folder before running. What can live there:

- `PREFERENCES.md`: template, theme, Keynote style file, where talks live, where the speaker's own material is, and the quality gates the user requires. It overrides the defaults here.
- `DesignSystem.md`: the user's own slide register (tokens, type roles, footer band, signature elements), read in place of those sections of the skill's default `DesignSystem.md`.
- `Config.md`: the presenter's byline, site, handle and organisation for deck credits, and paths to their published writing.
- `Template/`: the HTML deck template (`deck.html` exemplar, `theme.css`, fonts, a vendored reveal.js with the notes plugin and `editor.js`, brand images). Fonts in a template are often licensed for one person, which is why the template lives in the data folder and never in the skill.
- `RealThings.json`: the speaker's own real things (a book, a product, a site) with the one true picture of each; see `Tools/RealThings.ts`.
- `History.md`: which of the user's own deck builds each dated gotcha came from. Provenance only; no run reads it.

First-time setup for these files and the tools each lane needs is in [Setup.md](Setup.md).

## Setup

- Runtime: bun 1.2+. Run tool commands from the skill folder (`bun Tools/<Tool>.ts`).
- Keynote lane (macOS only): the Keynote app, driven through `osascript`. ImageMagick (`magick`) for any deck with a picture; `ffmpeg` for film clips and stills.
- The slide designer and the art composer call an LLM through `Tools/_portable/inference.ts`: set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, log in to the `claude` or `codex` CLI, or set `AGENT_SKILLS_LLM_CMD`. Keys can live in `$AGENT_SKILLS_HOME/.env`.
- Generated slide art (KeynoteArt) needs the `art` and `art-direction` skills installed next to this one (or under `$AGENT_SKILLS_DIR`), with their own image-provider keys.
- Deck-mode layout checks and slide captures use the agent's browser tools (e.g. a Playwright or Chrome automation tool) if available.

Details and a proof it works: [Setup.md](Setup.md).

## Gotchas

- **Keynote AppleScript cannot delete through a live `repeat with im in images of slide N` reference** (2026-10-21): it fails with "Can't get item 1 of every image of slide N" even when the slide holds that image. Take the list first (`set imgs to every image of slide N of d`, then `item i of imgs`) and delete from it. The same failure was first misread as "Keynote cannot work while the screen is locked"; Keynote answers AppleScript and edits decks with the screen locked.
- **A sentence that names a real film, character, product or person is a media ask even without a `>` direction.**
- **A reference deck put a drawn book where the real cover belonged** (2026-10-02): the slide naming the speaker's own book carried an essay illustration of an open book. Real things are `media` now, and registered ones are enforced in code on every build.
- Mode-specific gotchas: Keynote builds in `References/KeynoteGotchas.md`, HTML decks in `References/HtmlDecks.md`, lecture writing in `Intents/Write.md` § Gotchas.

## Examples

**Example 1: Dictation to lecture**
```
User: "Turn yesterday's two recordings about the harness idea into a 30-minute lecture"
→ Write: pulls the recordings, drafts SCRIPT.md in the speaker's own words,
  ~100 slides, each with READ lines, visuals chosen where they help
→ Build.ts --check passes; deck built; every slide checked in the browser
→ Returns the deck URL, word count and minutes, and which slides have art
```

**Example 2: A cue-card deck from an idea**
```
User: "Make me a deck on why prompt injection is the new SQL injection"
→ CreateDeck: pulls the speaker's prior lines, drafts the arc, picks an archetype
  per slide, writes glance notes, assembles from the user's Template/, checks every
  slide in a pixel capture, serves it with Present
→ Returns the URL and the keys (F fullscreen, S speaker view, ?print-pdf)
```
