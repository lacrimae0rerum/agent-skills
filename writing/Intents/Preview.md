# Preview

Show the user a draft article the way a reader will see it: a rendered page with headings, bold, lists and live links, opened in their own browser.

## Ideal State

- An HTML page in `~/Downloads/` rendered from the exact draft file, named `<slug>-draft-vN.html` so versions never overwrite each other.
- The header label names the piece's context (publication, project, draft number).
- File frontmatter does not appear on the page; the first visible heading is the article title.
- Every markdown link in the draft is a clickable link on the page, and the Sources block renders as a list.
- When the agent has browser tools (e.g. a Playwright or Chrome automation tool), the rendered pixels were looked at in a separate test browser profile before the page reached the user; without them, the reply says the page was not checked visually.
- The page is open in the user's own browser profile (the app named by `preview_browser` in the skill config), and the reply names the file path and the draft it came from.

## Anti-criteria

- Raw markdown in a browser tab is never offered as the preview.
- The page is never styled with hand-rolled CSS; it renders through the skill's doc theme (`Tools/DocRender.ts` with `Templates/DocTheme.css`).
- The page is never opened for the user with `--profile-directory` or in the automation tool's test profile.

## Tool contract

Render through the skill's doc theme (run from the skill folder; `bunx marked` is fetched on first use):

```bash
bun Tools/DocRender.ts <draft.md> --label "<Context> · <Project> · draft vN" --output ~/Downloads/<slug>-draft-vN.html
```

Optional, when the agent has browser tools: open `file://$HOME/Downloads/<slug>-draft-vN.html` in the automation tool's own test profile, take a full-page screenshot to a scratch folder (for example `<scratchpad>/<slug>-vN.png`), and look at it before opening the page for the user.

Open for the user in their browser (`preview_browser` in the skill config; on macOS `open -a` reuses the frontmost window; on other systems use the platform's opener, e.g. `xdg-open`):

```bash
open -a "<browser>" "$HOME/Downloads/<slug>-draft-vN.html"
```

## Gotchas

- **Frontmatter must not reach the page.** DocRender strips YAML frontmatter; if metadata shows on the page as a heading, the renderer regressed.
- **The newest draft is not always the highest file number.** Confirm from the project's plan or spec document, or the file mtimes, which draft is current before rendering.
