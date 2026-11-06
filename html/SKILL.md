---
name: html
description: "Renders the current session output as a self-contained, designed HTML artifact (one self-contained .html file) via a deterministic renderer that owns all layout from typed JSON. USE WHEN /HTML, HTML artifact, render this as HTML, make this an HTML page, artifact of this analysis, designed HTML output. NOT FOR deployed sites or web apps, web UI design systems (use `webdesign`), static images or diagrams (use `art`), or writing the analysis itself."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ for Tools/Render.ts (offline, no env vars). Optional: local font files to embed; an artifact or hosting tool to publish."
---

# HTML

Turns whatever the session just produced into one self-contained, designed HTML file and, if the agent has a publishing or artifact tool, publishes it (only after the user confirms). Deterministic split: the model's only job is distilling the session output into a typed content JSON and picking a design register; `Tools/Render.ts` owns every layout, typography, and color decision. Output is safe for sandboxed viewers: inline CSS, fonts embedded as data URIs from local font files, zero external requests. The renderer command, block types and register table live in `Intents/Render.md`.

## Ideal State

- Any session output becomes one self-contained, sandbox-safe HTML file that makes zero external requests and renders for its owner.
- Layout, typography and color come entirely from `Tools/Render.ts` registers; the model supplies only typed content JSON, so no hand-styled one-off ships.
- The HTML is verified before hand-off: opened in the agent's browser tools if available (otherwise the user is asked to open the local file), and published only if the user asked for that.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Render** | `/HTML`, "HTML artifact", "render this as HTML" | `Intents/Render.md` |

## Data & Config

No user configuration: registers are defined in `Tools/Render.ts`, which embeds fonts found in `$AGENT_SKILLS_HOME/html/fonts` (default `~/.agent-skills/html/fonts`), the macOS font folders (`~/Library/Fonts`, `/Library/Fonts`, `/System/Library/Fonts/Supplemental`) or common Linux font folders; with none present it falls back to system font stacks. Publishing needs an artifact or hosting tool in your agent and is optional; without one `Render.ts` still writes the local HTML file. User preferences, when present, live in `$AGENT_SKILLS_HOME/html/PREFERENCES.md` and override the defaults here; when absent, the defaults stand.

## Setup

Nothing to install. Run `bun Tools/Render.ts` from the skill folder.

## Gotchas

- **DOM-render screenshot pipelines drop CSS pseudo-element generated content** (counters, `::before` labels render in the browser but vanish from DOM-render captures, and they're invisible to text extraction). Render.ts therefore emits all numbering and labels as real DOM text. Never add CSS counters to a register. (Discovered 2026-07-11.)
- **Sandboxed artifact viewers block all external requests** — a Google Fonts `<link>` fails silently and you get the fallback stack. Embed via data-URI `@font-face` (Render.ts does this when the register's font file exists locally) or design on system stacks.
- **Some artifact viewers wrap your file in their own document skeleton.** Render.ts emits a complete HTML document; if your publishing tool wants a fragment, pass it `<title>` + `<style>` + body content only.
- **A published artifact is usually private to its owner's account**, so verifying it in a browser signed into a different account can 404. Verify the render by serving the HTML file locally and capturing that; verify publication through the publishing tool's own listing.
- **Numbered section markers must mean something.** Render.ts numbers sections (document order — legitimate). Don't number list items unless the content is a true sequence; use `list` blocks with bold lead-ins instead.

## Examples

**Example 1: After a research or red-team session**
```
User: "/HTML"
→ Render intent
→ The session's findings, quotes and sources are rendered as a `dossier` HTML file, its local render checked in a browser, and the file path (or URL, if the user asked to publish) handed over with a one-line description
```

**Example 2: Different subject, different register**
```
User: "render the quarterly cost analysis as HTML"
→ Render intent
→ A `ledger` artifact with tables and callouts, the register that fits a cost report
```
