# Webdesign

Status: bun Tools/VerifyDesign.ts 2>&1 | grep -q '^usage:' && echo ok · optional

## What it does

Webdesign designs and builds web interfaces in two ways. DirectDesign writes the design as code straight into your project and needs nothing beyond the model, in any agent. NativeDesign drives Claude Design (the `/design` artboards and `/design-sync`) so you can compare several looks side by side or sync a design system; it needs Claude Code with Claude Design access. Both paths expect the result to be looked at in a real browser before you see it: `Tools/VerifyDesign.ts` does that in a local headless Chrome, and the agent's own browser tools (for example a Playwright or Chrome automation tool), when it has them, cover interactive checks. Without any browser the design still gets written, and the result is reported as unverified.

## Fill in

Nothing is required. The rendered check needs a Chrome-family browser on this machine:

- It looks for the usual installs on its own: the Google Chrome, Chromium, Chrome for Testing or Microsoft Edge app on macOS, and `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser` or `chrome` on your PATH elsewhere.
- To pick a specific one, set `CHROME_PATH` to its executable. Inside a container or as root, add `CHROME_FLAGS="--no-sandbox"`. Both can also go in `$AGENT_SKILLS_HOME/.env`.

Each check starts a fresh headless browser with a throwaway profile, so it never touches your own browser windows, cookies or logins, and it can capture a `file://` page as well as a served local build.

Optionally, design taste goes in `$AGENT_SKILLS_HOME/webdesign/PREFERENCES.md` (default `~/.agent-skills/webdesign/`): preferred register, palette, typography, spacing, animation timing, framework defaults, brand assets, `## Overrides of upstream` for a standing motion policy or default page ground, `## Deployment` and `## Registration` for public-site launches, and `## Shipped sites`, a newest-first list of the sites you have shipped (URL plus register, typeface and ground) that the variety check reads so a new design does not repeat the last two or three. Every section is optional; with no file, upstream defaults stand, and with no shipped-sites list the variety check falls back to the most recent sites in your projects list, or asks you. A made-up example:

```markdown
## Overrides of upstream
Motion: keep entrance motion even under reduced motion, but no parallax.

## Shipped sites
- https://example.com — editorial, Fraunces + Inter Tight, warm off-white ground
```

| Variable | Meaning |
|---|---|
| `CHROME_PATH` | Executable of the Chrome or Chromium to use for `Tools/VerifyDesign.ts`. Optional; auto-detected when unset. |
| `CHROME_FLAGS` | Extra launch flags, space-separated, e.g. `--no-sandbox`. Optional. |
| `AGENT_SKILLS_OUTPUT_DIR` | Folder finished files are handed over in. Optional; default `~/Downloads/`. |

## Accounts and secrets

No keys for DirectDesign. For NativeDesign you need Claude Code with a paid Claude subscription that includes Claude Design access (the free tier has none), a Claude Code build that carries the `/design` skill (update Claude Code if the command is missing), and, for design-system sync, a claude.ai login with design scopes (`/design-login`). The skill stops with the missing step named instead of falling back; in other agents it offers DirectDesign.

The critique, delivery and calibration loop uses the `art-direction` skill when it is installed (it has its own setup); without it, the skill critiques its own capture against the doctrine and says so.

## Prove it works

Run from the skill folder:

```bash
bun Tools/VerifyDesign.ts
```

Success is the usage line `usage: VerifyDesign.ts <url-or-path> <out-dir> ...`, which shows the check script loads. To run the real check, start your local build (or point at a local `.html` file) and run `bun Tools/VerifyDesign.ts http://localhost:5173 ~/design-check`; it saves a screenshot in that folder and prints a JSON verdict with `pass`, `errors` and what it did not verify. Exit 3 means no headless browser could be started: install Chrome or Chromium, or set `CHROME_PATH`. Then ask your assistant "design a settings panel for this app".
