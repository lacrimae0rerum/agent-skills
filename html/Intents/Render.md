# Render Intent

Turn the current session's output into a verified HTML file (and, if the user asks, a published artifact).

## Ideal State

- One self-contained HTML file renders the session's actual output: real content, verbatim quotes kept verbatim, sources preserved, verification flags preserved.
- The file is rendered by `Tools/Render.ts` from a content JSON, with no hand-authored one-off CSS; content that genuinely did not fit the block types led to an extension of Render.ts (new block type or register) so the next run benefits.
- The register fits the content per the Register choice table.
- When multiple candidate outputs existed, the reply names the one rendered (`⚠️ Rendering X, not Y; redirect if wrong.`).
- The rendered file was verified before hand-off: a local serve of the HTML file was opened in the agent's browser tools (if available) and its pixels viewed. If the user asked for publication and the agent has a publishing tool, the exact action was confirmed with the user first, and the publication was checked through the tool's own listing.
- The file path (or the artifact URL, when published) is handed over with a one-line description of what it contains.

## Anti-criteria

- Never invents content: when the session contains no substantive output to render (nothing analyzed, researched, or produced yet), it says so and asks what to render.
- Never hand-styles a one-off: no hand-authored one-off CSS outside `Tools/Render.ts`.
- Never publishes anything without the user's confirmation of the exact action, and never hands over a URL before the render (and, if published, the publication) is verified.

## Tool contract

```bash
bun Tools/Render.ts --schema      # content JSON shape + example
bun Tools/Render.ts --registers   # available registers
bun Tools/Render.ts \
  --json <content.json> \
  --register <dossier|ledger> \
  --out <artifact.html>
```

Verifying and (optionally) publishing the rendered file:

- Render leg: serve the HTML file locally (for example `python3 -m http.server` or `bunx serve`) and open it with the agent's browser tools if available, because a published URL can 404 outside the owner's signed-in session (SKILL.md Gotchas). Without browser tools, ask the user to open the local file.
- Publication leg (only when the user asked, and after confirming the exact action): publish with the agent's artifact or hosting tool; reusing the same file path updates the existing artifact. Check it through that tool's own listing.

Block types: `prose`, `callout`, `quote` (id + badge + quote/text + note + source), `list` (bold lead-ins), `cut` (strikethrough + stamp — for disclosed rejections), `table`, `group` (era/category separators). Badges listed in the register's `badgeSolid` render filled; others outlined.

### Register choice

| Content | Register | Look |
|---------|----------|------|
| Evidence file, red team, investigation, claim testing | `dossier` | dark ink-green / orange, condensed display + typewriter |
| Report, plan, comparison, metrics, finance | `ledger` | dark navy / gold, old-style serif |

Content fit picks the register. For a new look, add a register to Render.ts rather than hand-styling a one-off.
