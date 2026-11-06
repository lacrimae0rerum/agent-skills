---
name: visualize
description: "Visualizes anything at all and never declines — a codebase, a physical setup, a timeline, a process, finances, a comparison, a concept, a URL, a dataset — as a short console summary plus a designed HTML page, every fact labelled with where it came from (a file quote, a URL, the user's words, or general knowledge). USE WHEN visualize, visualize this, visualize my <anything>, visualize <project>, show me this visually, draw it, map it, lay it out, how does X work, explain this architecture, map this system, system map, architecture map, what are the moving parts, draw my setup, show me my plan, walk me through this codebase, diagram this project or spec. NOT FOR a standalone generated illustration or header image with no visualize ask (use `art`), turning session output into an artifact (use `html`), or hand-drawn sketches (use `excalidraw`)."
compatibility: "Requires bun 1.2+. Tools/Bake.ts needs a local Chrome or Chromium (auto-detected; CHROME_PATH picks one, CHROME_FLAGS adds launch flags). No API keys. Optional: AGENT_SKILLS_HOME for preferences and saved plans; AGENT_SKILLS_OUTPUT_DIR for the review folder (default ~/Downloads)."
license: MIT (see LICENSE.txt)
---

# Visualize

**Contents:** Ideal State · Intent Routing · Setup · Data & Config · Split of work · Gotchas · Examples

Paths in this skill are relative to the skill folder.

Points at a project, repo, directory or spec document (an ideal-state or acceptance-criteria file) and leaves the user understanding how it works: a concise ASCII map in the console and a designed HTML explanation saved next to the code. The purpose is that nothing runs in production that nobody understands.

Points at a physical plan (a gear setup, a rig, a room, a purchase list) and leaves the user seeing it: a to-scale top-down drawing with the cost split, the full order and the open decisions, every fact quoted from the plan document.

Anything else (an idea, a comparison, a dataset, a timeline, a process) becomes one hand-built concept page with a short console summary. The skill never declines.

## Ideal State

- Whatever is named gets visualized through the route that fits it (system map, physical plan or concept page), never declined and never squeezed into the wrong route.
- Every fact on a page says where it came from (a `file` or `file:line`, a verbatim plan quote, a URL, `computed`, the user's words or `general knowledge`), and anything unconfirmed is labelled as such rather than stated.
- The console summary alone tells the user what the thing is and the one thing worth acting on, and the page holds the full picture, looked at in a real renderer before delivery.
- The subject is only read: the page (and a plan's model in the skill's data folder) are the only writes, and no secret value lands on any page.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Visualize** | "visualize" on code, "how does X work", "map this system", "explain this architecture" | `Intents/Visualize.md` |
| **Plan** | "visualize" on a physical thing: "visualize my drum/studio/desk plan", "lay out my setup", "draw my rig", "show me my order" | `Intents/Plan.md` |
| **Concept** | "visualize" on anything that is neither code nor a physical plan: an idea, a scientific question, a comparison, a dataset, a timeline, a process | `Intents/Concept.md` |

| File | Read when |
|------|-----------|
| `Setup.md` | first-time setup: the optional `PREFERENCES.md` keys and where saved plans live |

## Setup

- Runtime: bun 1.2+. The system-map and plan renderers need nothing else.
- `Tools/Bake.ts` (baking a Concept page for script-blocking hosts) launches a local Chrome or Chromium headless. It finds the usual installs on its own; set `CHROME_PATH` to choose one and `CHROME_FLAGS` for extra launch flags (e.g. `--no-sandbox` in a container). Exit 3 means no browser could be started.
- Visual checks before delivery use the agent's browser tools (e.g. a Playwright or Chrome automation tool) if available; otherwise ask the user to open the page and check.
- No API keys. Details and a self-check: [Setup.md](Setup.md).

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/visualize/PREFERENCES.md` (default `~/.agent-skills/visualize/`) and override the defaults here; when absent, the defaults stand. PREFERENCES.md keys: `## Concept pages` → `Ground:` (the page ground Concept uses; default is whatever suits the subject). Plan models live in `$AGENT_SKILLS_HOME/visualize/Plans/`. Setup: [Setup.md](Setup.md).

## Split of work

The model reads the target and writes one typed system-model JSON. `Tools/Visualize.ts` owns everything after that: it refuses models whose citations do not resolve, prints the ASCII, lays out the SVG, and writes the page. The model never hand-writes ASCII art or HTML, which keeps every map consistent and the grounding check in code.

- `bun Tools/Visualize.ts --schema` prints the model shape with an example.
- Physical plans use `Tools/VisualizePlan.ts` with the same flags and the same split: the model writes a plan-model JSON (`--schema` shows it), and the tool checks every `{ file, quote }` against the plan document before drawing the page.
- Concept pages are the exception: the model hand-builds the page, because a fresh composition per subject is what makes them good. `Tools/Bake.ts` owns the mechanical parts: `--check` parses every inline script before any screenshot, and a bake writes a script-free copy for hosts that block scripts.
- Every browser check serves the page over a local HTTP server (for example `python3 -m http.server --bind 127.0.0.1` in the page's folder), because automated browser profiles often cannot read `file://`.

Flags shared by both renderers (`--check` validates without writing):

| User says | Flag | Effect |
|-----------|------|--------|
| (default) | — | Console output + page in the `--root` directory |
| "just show me", "console only", "no HTML" | `--no-html` | Console output only |
| "put it in Downloads", "save it to X" | `--out-dir <dir>` | Page lands in that directory instead |
| "wider", "narrow terminal" | `--width <n>` | Console width (default 100) |

## Gotchas

- **"Visualize" on a physical plan is still this skill.** A request to visualize a drum-kit order was once built as a hand-written one-off page because the description only named code. The Plan route and renderer exist so that doesn't happen again. (2026-09-24)
- **Share hosts serve HTML under `Content-Security-Policy: sandbox`**, which blocks every script, and their preview page shows HTML as source. A scripted page uploaded raw renders blank; upload the baked copy and give the raw link. Uploading is an outside action: confirm the exact file and host with the user first. (2026-10-06) The same sandbox blocks new tabs, so a `target="_blank"` link does nothing on a plain click; `Bake.ts` strips those targets, so link rows only work in the baked copy. (2026-10-12)

## Examples

**Example 1: A half-forgotten service**
```
User: "visualize the monitoring layer"
→ Visualize intent
→ A console map naming its parts, main flow and top risk, and <dir>/Visualize-<slug>-<timestamp>.html where every part, link and risk cites its file
```

**Example 2: From a spec**
```
User: "visualize path/to/project/SPEC.md"
→ Visualize intent
→ The spec supplies intent and names, every component is grounded in the code the spec points at, and the page lands next to the spec
```

**Example 3: A gear plan**
```
User: "visualize my drum kit plan"
→ Plan intent
→ A to-scale top-down drawing with the cost split, the full order and the open decisions, every fact quoted from the order sheet; a cost that misses the stated total is flagged first
```

**Example 4: A comparison from the conversation**
```
User: "visualize the three options we just compared"
→ Concept intent
→ One designed page whose main figure draws the comparison, every fact source-tagged, and a console line naming the one non-obvious difference
```
