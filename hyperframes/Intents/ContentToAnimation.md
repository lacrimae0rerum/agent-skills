# ContentToAnimation Intent

Turn a piece of content into a short, themed motion-graphics animation: typography, diagrams, data and quotes animated on HyperFrames. No AI imagery (that is `GeneratedContentVideo.md`).

## Ideal State

- A `MeaningMap.json` and a `Direction.json` exist for the source, the Direction's review passed (both judges, median ≥ 8.5, no critical defect), and every scene in the composition traces to one Direction beat whose rationale names the claim it carries. No scene is decorative or keyword-matched.
- Every on-screen line is held still long enough to read, at ≤ ~4 words per second on screen.
- The final encode rendered through the seam with every stage green (check, probe, validation, blank-frame and motion checks), and the agent watched it once against this Ideal State and the Anti-criteria and fixed every miss in the composition before hand-over.

## Anti-criteria

- No AI imagery: scene images and narration are `GeneratedContentVideo.md`.


## Output format

Scene timing comes from the content, not a formula: hold each on-screen line for its read (about 3.5 words per second plus a beat per point), give data and quotes more room, and keep every beat between about 2 and 10 seconds.

| Format | Size | Use |
|---|---|---|
| Landscape | 1920x1080 | default, blog and YouTube |
| Vertical | 1080x1920 | Shorts, Reels |
| Square | 1080x1080 | social feeds |

## Inputs

Confirm the source is in hand and the target shape is known (landscape 1920x1080 by default; vertical 1080x1920 for Shorts; square 1080x1080). If either is ambiguous but workable, state the pick in one line (`⚠️ Picking 16:9 because …; redirect if wrong.`) and proceed.

| Input | Extraction |
|---|---|
| YouTube URL | `fabric -y <url>` → transcript (the `fabric` skill's CLI, if installed; otherwise ask the user for the transcript) |
| Article URL | fetch the page (the `research` skill, if installed, when the page resists) |
| `.md` / `.txt` file | read directly |
| PDF | read the file (a PDF text extractor such as `pdftotext`, or the agent's file reader) |
| X/Twitter URL | X blocks plain fetches; use the `x-twitter` skill if installed, or ask for the text |
| Raw text | use directly |

Save it in the project as `Source/source.md` (markdown), or as a transcript JSON (`[{start,end,text,speaker?}]`) when timing matters.

## Tool contract

```bash
VM=Tools/lib/video-meaning/VideoMeaning.ts   # paths are relative to the skill folder
bun $VM map    --source Source/source.md --out MeaningMap.json
bun $VM direct --map MeaningMap.json --mode essay --out Direction.json --revise 2 --polish
bun $VM validate --map MeaningMap.json --direction Direction.json
```

`essay` mode is the standalone-piece mode: every beat is an `insert` or `none`. `direct --revise N` runs the two-vendor review (an Anthropic and an OpenAI judge, each through its API key or CLI) after each round and keeps revising until it passes; exit 1 means no round passed, and `rounds/revisions.json` names the shortfall. Read the Direction before authoring: its `treatment` is the visual through-line, and each insert's `visual` spec and `text` list are what goes on screen, verbatim.

```bash
bun Tools/Scaffold.ts --dir <project> --title "<thesis line>" [--subtitle "<…>"] [--width 1920 --height 1080 --fps 30 --duration <s>]
```

The scaffold writes an `index.html` that already meets the seam contract (root data attributes, local GSAP, theme CSS variables, one registered paused timeline) and a title card that renders. Replace and extend its scenes, one per Direction beat:

- One paused GSAP timeline, registered as `window.__timelines[<composition id>]`; timed elements carry `class="clip"` with `data-start`, `data-duration`, `data-track-index`.
- Colours, type scale, spacing and eases come from the theme variables and `HOUSE_THEME.motion` (`Tools/Theme.ts`).
- Everything local: images, fonts (through the seam's `embedFonts()`/`injectFonts()` + `registerAfterFonts()`), audio. Generic font families need no embedding; any named family does.
- The composition rules that bite are in the seam README § Gotchas (no CSS transitions, no wall-clock or random APIs, no negative z-index clips). HyperFrames' own authoring docs: https://hyperframes.heygen.com.

```bash
HF=Tools/lib/hyperframes/HyperFrames.ts
bun $HF check    --project <project>
bun $HF snapshot --project <project> --at 1,4,8 --out-dir <project>/Stills     # look at these before a full render
bun $HF render   --project <project> --out <project>/Out/<slug>.mp4 [--audio]   # exit 1 on any failed stage
```

A render that fails a seam stage throws with the stage and findings.

Then the quality loop (SKILL.md § Quality loop): with the `art-direction` skill installed, write `<project>/Brief.json` from that skill's brief example with the Direction's treatment as the intent, run its critique tool on `<project>/Out/<slug>.mp4` (it writes `Out/Critique.json`), iterate on the named defects until it passes, and hand over with its delivery tool to `${AGENT_SKILLS_OUTPUT_DIR:-$HOME/Downloads}`; that tool refuses without a passing critique whose artifact mtime matches. Without it, critique the film yourself and copy it there.
