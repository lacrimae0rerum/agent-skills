# Visualize

Status: bun Tools/Visualize.ts --schema >/dev/null && echo ok · optional

## What it does

Turns anything you want to see (a codebase, a physical setup, a timeline, a process, a concept) into a short console summary plus one self-contained HTML page, with every fact labelled by where it came from. It works out of the box with no configuration; the files below only change taste and keep your saved plans.

## Fill in

Everything lives under `$AGENT_SKILLS_HOME/visualize/` (default `~/.agent-skills/visualize/`). All of it is optional; with none of it the skill uses its defaults.

**1. `PREFERENCES.md`**, read by the intents at run time. No tool parses it.

| Section → key | Meaning | Default when absent |
|---|---|---|
| `## Concept pages` → `Ground:` | The page ground every Concept page uses, e.g. "dark or saturated" or "off-white paper". | Each page picks the ground that suits its subject. |

A made-up example:

```markdown
## Concept pages
Ground: off-white paper
```

**2. `Plans/<slug>.plan.json`**, written by the Plan intent, one per physical plan (a desk, a rack, a kit). Each piece, order line, cost and decision quotes the source document it came from, so the plan can be re-rendered when that document changes. `bun Tools/VisualizePlan.ts --schema` prints the shape.

## Accounts and secrets

None. Baking a page into a script-free copy (`Tools/Bake.ts`) drives a local headless Chrome or Chromium. It finds the usual installs (macOS app bundles; `google-chrome`, `chromium`, `chromium-browser` on PATH); set `CHROME_PATH` to choose one and `CHROME_FLAGS` for extra launch flags (e.g. `--no-sandbox` inside a container). Everything else runs on Bun alone.

Looking at a page before delivery uses the agent's browser tools (e.g. a Playwright or Chrome automation tool) if available; otherwise the user opens the page and checks.

## Prove it works

Run from the skill folder:

```bash
bun Tools/Visualize.ts --schema       # prints the system-model shape, exit 0
bun Tools/VisualizePlan.ts --schema   # prints the plan-model shape, exit 0
```

To check a saved plan still matches its source document: `bun Tools/VisualizePlan.ts --check --model <your Plans/<slug>.plan.json> --root <folder holding the document>` prints `plan ok`, or names each quote that no longer appears.

To check the baker: write a small page with one inline script, then `bun Tools/Bake.ts --check <page.html>` prints `✓ 1 inline scripts parse`, and `bun Tools/Bake.ts <page.html> --out <baked.html>` prints `0 scripts` (exit 3 means no browser could be started).
