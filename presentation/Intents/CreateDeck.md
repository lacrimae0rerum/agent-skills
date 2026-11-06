# CreateDeck

Idea in, presentable deck out (built on the user's template): a self-contained deck directory the user can present from tonight, in their voice, with presenter notes on every slide, served locally with Keynote-style speaker view.

## Ideal State

- A directory `<talks folder>/<slug>/deck/` (the talks folder from `PREFERENCES.md`, else one the user names) containing `deck.html`, `theme.css`, `fonts/`, `vendor/`, and `images/` (deck-specific art only), fully offline-capable, with slides in the user's voice on the active design system (`../DesignSystem.md`, or the user's `DesignSystem.md` in `$AGENT_SKILLS_HOME/presentation/` when that exists), presenter notes on every slide, served locally with Keynote-style speaker view.
- The copy reuses the user's actual prior lines and framing on the topic wherever they exist (found through a content-search skill, if one is installed); fresh invention fills only the gaps.
- The deck reads as one argument, not a stack of slides, with a CSE-style arc: a hook that earns attention → escalation → the turn, the one crafted one-liner where the idea flips → a close that lands. If the hook, the turn and the close cannot be named, the arc is not there yet.
- One claim per slide: every slide carries one idea a listener could repeat back an hour later. Two claims means two slides.
- Every slide is one of the active design system's nine archetypes (`../DesignSystem.md`, overridden by the user's `DesignSystem.md` in `$AGENT_SKILLS_HOME/presentation/` when that exists), built on its tokens and `.v` wrapper contract, and chosen by its selection judgment: the content picked the shape (a real dichotomy gets Two-column, one sentence worth pausing on gets Statement), and no slide breaks its copy rules.
- Slides carry punchlines, notes carry glanceable cues: every `<section>` ships `<aside class="notes">` with what to say, pacing beats ("land it, then pause"), and story prompts, as cues, not a script; each slide's notes read at speaking distance in one glance.
- It makes its case with the speaker muted: read cover to close with no narration, the deck still argues its point.
- Art appears only where it earns a beat of quiet and carries something words cannot. The default is sparingly (1-2 slides in a 10-slide deck, zero is legitimate). Existing blog art is reused when the topic already has it (the `BLOG.ART_DIR` assets from the user's Config.md via a search of their own published corpus, when they have one); otherwise the `art` skill's Essay-intent charcoal technique if that skill is installed, transparent PNG on the white content ground (without it, leave the slide as text and say so).
- Charts are inline SVG in the active design system's chart register, with the `dataviz` skill loaded before writing chart code: the register's accent color as the series on white, thin marks, recessive grid, selective labels, single axis. Chart data is session-verified or the source line visibly says "illustrative".
- Copy passed the writing gates before the user sees it: the `writing` skill's audit and the `detect-ai` skill's check on the assembled slide copy and notes, where those skills are installed, reported as a `✍️ WRITING-AUDIT:` line (a deck counts as authored, publishable prose). When neither is installed, the line says the copy was self-reviewed only.
- Real things are on screen as themselves (cover, screenshot, footage, photo), per `../SKILL.md` § Ideal State; in an HTML deck the 12 px corners are CSS `border-radius:12px` on the `<img>`/`<video>`.
- Every slide is balanced and nothing waits for a click. Pictures fill the space they were given, nothing overlaps or runs off, no slide has a large empty band, and a slide moves on with one press: videos carry `data-autoplay muted loop playsinline`, GIFs loop. `Tools/DeckCheck.ts --measured` exits 0 on the served deck's measurements.
- Every slide has been looked at in a real browser: a pixel screenshot of every slide (the agent's browser tools, e.g. a Playwright or Chrome automation tool) judged as a design whole, and each slide's note confirmed rendering with `?showNotes=true`.
- Every slide was captured into `<dir>/deck-png/` and passed a `slides` critique with `--out <dir>` (`../References/QualityLoop.md`) before the deck was handed back.

## Anti-criteria

- No decorative filler images: an image that merely restates the header is AI-slop.
- No fabricated-but-plausible chart numbers: that is the one unforgivable failure, and a fake chart in a presented deck cannot be taken back.
- No generated art stands in for a real thing: generated art is for abstract ideas only, and a picture's credit is never in the subtitle.
- No `fragment` builds, and nothing on a slide waits for a click.
- Bullet creep is the failure, not the baseline.
- Never claim the speaker view verified without a real human S keypress, and never downgrade the verification to curl.

## Output format

After the slides critique, hand back: the local URL, the keys (F fullscreen on external display, S
speaker view on laptop, `?print-pdf` for PDF export), the WRITING-AUDIT
line, and one line on what art/chart decisions were made and why. Optional
Claude Design leg: `Intents/ExportToClaudeDesign.md`.

## Inputs

Before building, the idea, the audience and the occasion are known. A workable gap gets a one-line ambiguity flag
(`⚠️ Picking X over Y because R; redirect if wrong.`) and a best-effort deck.
A structural gap (no idea what the talk is for) gets ≤3 questions with a
`proceed` override. Deck length defaults to 8-12 slides unless told otherwise.

## Tool contract

- Start from the user's `Template/` (`$AGENT_SKILLS_HOME/presentation/Template/`): copy `theme.css`, `fonts/`, `vendor/` and `images/`
  into the deck dir verbatim (the template's `<img>` tags expect its brand
  images there). Its `deck.html` is the canonical markup for all
  nine archetypes — author the new `deck.html` against its patterns
  (reveal.js init block included: 1280×720, fade, `c/t` slide numbers,
  notes plugin, folio div).
- Art assets: rasterize into `images/` inside the deck dir; `<img>` paths
  relative.
- Serve: `bun Tools/Present.ts --dir <deck-dir>`
  (port 7345 default; pick another if taken).

- Live layout, with the deck served: print the measure script with
  `bun Tools/DeckCheck.ts --measure-js`, run it in the served deck
  (`http://127.0.0.1:<port>/`) with the agent's browser tools (an
  evaluate/JavaScript call in a Playwright or Chrome automation tool), and
  save what it returns to `<deck-dir>/measured.json`. Use a separate test
  browser profile, never the user's own browser session.
- `bun Tools/DeckCheck.ts <deck-dir> --measured <deck-dir>/measured.json`:
  real things, extra presses, video autoplay, missing images, and every
  slide's measured layout. Without a browser tool, run it without
  `--measured` (static checks only) and say the layout was not measured.
  Exit 4 names each slide to fix.
