# Concept

Visualize a subject that is neither a codebase nor a physical plan (an idea, a scientific question, a comparison, a dataset, a timeline, a process) as one hand-built, designed HTML page plus a short console summary.

## Ideal State

- One page on exactly the asked subject. It answers the question the user was asking, usually the one from the conversation it came out of, with no side topics.
- The central idea is drawn, not just described. The main figure shows the mechanism, a map, a vector sum or a scale comparison, whichever makes the point visible. The prose around it is short and plain.
- Every fact carries a source tag naming where it came from: a file or tool output read this session, a URL fetched this session, arithmetic done for the page (`computed`), the user's words, or `general knowledge` (not checked this session). A footer explains the tags and lists the sources.
- Numbers are real. Every figure comes from a tool, a source, or arithmetic shown on the page. Computed values are computed in code, never estimated in prose.
- Designed, per the user's design rules when they keep any. The ground follows `$AGENT_SKILLS_HOME/visualize/PREFERENCES.md` § Concept pages when that file sets one, otherwise whatever ground suits the subject; a type pairing and composition that differ from recent pages, no half-empty bands, `prefers-reduced-motion` honored, and a layout that works at phone width with no horizontal scroll.
- The page works with scripts blocked whenever it leaves the machine, because it was baked first.
- Every inline script parsed under `Bake.ts --check` before any screenshot, and the page was looked at in a real renderer at desktop and phone width before delivery.
- The page in the user's review folder (`$AGENT_SKILLS_OUTPUT_DIR`, default `~/Downloads/`) is a copy of scratch bytes that passed the proof check against the ask.

## Anti-criteria

- The page is never drafted in the delivery folder.
- A `Bake.ts` refusal is never shipped around; the page is fixed.
- No external load other than Google Fonts stylesheets. Everything else is inline: data, SVG, canvas drawing, images as `data:` URIs.
- Nothing personal goes on a page that will be shared unless the subject needs it.

## Output format

Give the page's path and a few lines of console summary: what the page shows and the one non-obvious thing it makes visible. When it went to a share host (only after the user confirmed the exact file and host), give the link that renders the page itself (for a host that previews HTML as source, the raw link), checked with a full-page screenshot of that link.

## Tool contract

```bash
# 1. Before any screenshot: every inline script parses (catches errors that blank the page, such as `-(x)**2`)
bun Tools/Bake.ts --check <scratch>/<page>.html

# 2. Look at it in a real renderer at desktop and phone width (serve the scratch dir over a local HTTP server; file:// does not load)
python3 -m http.server 8765 --bind 127.0.0.1 --directory <scratch>
#    then take full-page screenshots of http://127.0.0.1:8765/<page>.html at width 1440 and at width 390
#    with the agent's browser tools (e.g. a Playwright or Chrome automation tool); with none, ask the user to look at both widths

# 3. Proof the scratch bytes against the ask, then copy them into place
#    (the `assay` skill's Proof intent, if installed; otherwise check the page against the ask point by point and list what you checked)
cp <scratch>/<page>.html <review folder>/<page>.html    # review folder: $AGENT_SKILLS_OUTPUT_DIR, default ~/Downloads

# 4. Only when the page goes to a host that blocks scripts (a share link, an email, a CSP-sandboxed file server): bake it, proof the baked file,
#    confirm the exact file and host with the user, then upload that
bun Tools/Bake.ts <scratch>/<page>.html --out <scratch>/<page>-baked.html
```

`Bake.ts` exits 1 on a syntax error or an error the page throws while rendering, 3 when no headless Chrome or Chromium could be started (set `CHROME_PATH`).

## Gotchas

- **A concept page drafted straight into the delivery folder skips the gate.** Upstream, a write guard refused such drafts and forced a full rewrite to scratch; here nothing enforces it, so draft in a scratch folder from the start and copy only bytes that passed the checks. (2026-10-06)
- **One syntax error blanks every drawing, silently.** `-(x)**2` is a JS syntax error (a unary minus before `**` needs parentheses), and it took the whole script down, leaving every canvas and SVG empty while the static text rendered. `Bake.ts --check` before any screenshot catches it. (2026-10-06)
- **`Bake.ts` starts a fresh headless browser for every bake** and kills it afterwards, so no verifier is left over between runs. If it exits 3, no Chrome or Chromium could be started: install one, point `CHROME_PATH` at it, or add `CHROME_FLAGS=--no-sandbox` inside a container.
- The share-host gotcha (scripts blocked under `Content-Security-Policy: sandbox`) is in SKILL.md § Gotchas.
