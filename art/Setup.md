# Art

Status: `bun Tools/Generate.ts --help` prints the usage and `GOOGLE_API_KEY` is set (in the environment or `$AGENT_SKILLS_HOME/.env`) · required

## What it does

Art makes static images (blog headers, diagrams, infographics, comics, icons, wallpapers) by sending a prompt built from one of its named intents to an image model. The default model is Nano Banana Pro on the Google Gemini API; `flux` and `nano-banana` run on Replicate. The animated-diagram and animated-essay tools draw strokes from a spec and render them through this skill's own copy of the HyperFrames seam (`Tools/lib/hyperframes/`), with no image model and no key; they need ffmpeg and a one-time seam install (step 4). Finished images are checked and handed over through the optional `art-direction` skill, which has its own setup guide; without it the agent runs the self-critique in SKILL.md § Quality loop and copies the file itself.

## Fill in

Up to four things on your machine, then the optional config files under `$AGENT_SKILLS_HOME/art/` (default `~/.agent-skills/art/`). No file there is required; create only the ones you want.

1. Install bun 1.3+ and the tool's dependencies, declared in `Tools/package.json` (image generation uses `@google/genai` and `replicate`). From this skill's folder:

```bash
cd Tools && bun install
```

2. For blog headers (`--thumbnail`) and background removal (`--remove-bg`), install `rembg`. `Generate.ts` looks for it at `~/.local/bin/rembg`, or at the path in the `REMBG_BIN` environment variable:

```bash
pipx install rembg
```

3. For the signature stamp on essay headers, thumbnails and `CutHero.ts`, install ImageMagick so the `magick` command exists (`CutHero.ts` uses `MAGICK_BIN`, else `/opt/homebrew/bin/magick` when present, else `magick` on your PATH). The default signature font, SignPainter, ships with macOS; on other systems set `signature.fontFile` in `ArtConfig.json`.

4. For animated GIFs (`Tools/AnimatedDiagram.ts`, `Tools/AnimatedEssay.ts`), install ffmpeg and ffprobe, then fetch the pinned HyperFrames CLI and its headless Chrome once (the only network step; later renders run offline in a macOS network sandbox, so GIF rendering is macOS only):

```bash
bun Tools/lib/hyperframes/HyperFrames.ts install
```

The seam caches what it downloads in `$HYPERFRAMES_CACHE` (default `~/.cache/agent-skills/hyperframes`); projects go in `$HYPERFRAMES_PROJECTS_DIR` (default `~/HyperFrames/`), outside every git repo. `Tools/lib/hyperframes/README.md` documents the seam.

Optional skills: `art-direction` (critique, `Deliver.ts` hand-off, calibration) and `assay` (the judges `Tools/EvalRound.ts` runs). Install them beside this skill, or set `ART_DIRECTION_SKILL_DIR` / `ASSAY_SKILL_DIR` to their folders. Film rounds (`EvalRound.ts --video`) also use the `hyperframes` skill (`HYPERFRAMES_SKILL_DIR`).

Optional: a `PREFERENCES.md` at `$AGENT_SKILLS_HOME/art/` sets your house style. Its sections, all optional:

- **Default model** and **Output location**: the model an intent uses when it names none, and where images are staged.
- **Core aesthetic** and **Color palette**: your look, influences, primary and secondary accent hex values and paper ground; they replace the intents' default palette.
- **Typography**: your font for each type role the intents name (wedge-serif title and subtitle, geometric-sans labels, condensed-italic insights, hand-lettered display); prompts name these faces. Font files for the animated-diagram tool go in `DiagramFonts.json` (below).
- **Character design**: how people in images are drawn; replaces the skill's default figure treatment (a varied cast whose appearance each prompt names). Optional keys: recurring characters, a figure treatment sentence every prompt with people carries verbatim, casting rules, and figure-study references with a stroke density for the Essay round fixes.
- **Figure style**: how figures in comics, comparisons and frameworks are built (construction, influences, an illustrator reference for diagrams that look corporate); replaces those intents' default of simplified, stylized editorial figures.
- **Scene composition**: staging rules (camera height, depth layers, where the subject sits, what a background may hold); move them into `SceneConstruction.md` when they grow.
- **Signature**: the signature face and any faces you reject for it.
- **Wallpaper**: the LogoWallpaper and EmbossedLogoWallpaper look: aesthetic, bright and muted palettes, off-palette hues to forbid, taste references for the atmosphere, a description of your mark, your terminal background tint, and the command that applies a wallpaper (`<command> <output-name>`; without one the intents report the saved path).
- **Vendors**: which image vendors this install allows.
- **Reference images**: where your style references live.
- **Brand assets**: your logo, wordmark, favicon and social image, kept in a `brand/` folder beside the file; the wallpaper intents and any brand-bearing run load them from there.

Without it the skill uses a production-quality editorial look.

Optional: `DiagramFonts.json`, read by `Tools/AnimatedDiagram.ts`. One entry per type role, every role optional: `title` (the diagram title, usually a serif italic), `subtitle` (the line under it), `label` (node and edge labels), `insight` (the 1-3 callouts) and `signature` (the signature stamp). Each role takes `path` (a font file; `~` expands; a `.ttc` collection must be extracted to one face first), `weight` (default 400) and `style` (`normal` or `italic`, default `normal`). A missing role uses a generic family; a configured file that does not exist fails the build by name. The template points at macOS system faces (Georgia, Verdana, Arial Narrow); replace them with yours.

```json
{ "title": { "path": "~/Library/Fonts/ExampleSerif-Italic.otf", "style": "italic" }, "label": { "path": "~/Library/Fonts/ExampleSans-Bold.otf", "weight": 700 } }
```

Optional: `DiagramTheme.json`, read by `Tools/AnimatedDiagram.ts`: the animated-diagram palette, any of `ground`, `ink`, `charcoal`, `purple` (primary accent tone), `teal` (secondary accent tone), `paper` (box fill), `purpleFill`, `tealFill`, `signature`, each `#rrggbb` or `rgb()`/`rgba()`, with `ground` opaque (alpha 1 or none). Without it the shipped neutral palette applies; an unknown key or a non-colour fails the build naming the file and key.

Optional: `ArtConfig.json`, read by `Tools/Generate.ts` and `Tools/EvalRound.ts`:

- `thumbnailGround`: the `#RRGGBB` page ground that `--thumbnail` listing thumbnails and transparent eval candidates are flattened onto (default `#F5F5F0`).
- `signature`: `text` (the name to stamp; the `ART_SIGNATURE` environment variable wins; with neither set, the stamp is skipped with a notice), `fontFile`, `fontName` and `fill` (default the macOS SignPainter face in semi-transparent charcoal).
- `contractOverrides`: per intent, `mandates` (regexes a prompt must match, replacing the intent's) and `bans` (regexes added to its bans), e.g. your own palette words for Essay.
- `variants`: named `contractOverrides` sets layered on top with `--variant <name>`.

Without it the shipped defaults apply; with it, a missing key uses the default and prints a warning naming the file and key.

## Accounts and secrets

Set these in your environment or add them to `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`, `KEY=value` lines; variables already set in the shell win):

| Name | Needed for | Account to open |
|---|---|---|
| `GOOGLE_API_KEY` | `nano-banana-pro`, the default model | A Google AI Studio account (aistudio.google.com), with an API key |
| `REPLICATE_API_TOKEN` | the `flux` and `nano-banana` models only | A Replicate account (replicate.com), with an API token |

`REPLICATE_API_TOKEN` is optional if you only use the default model. Keep the `.env` file private (`chmod 600`).

Optional settings: `GEMINI_IMAGE_MODEL` (default `gemini-3-pro-image`), `REPLICATE_FLUX_MODEL` (default `black-forest-labs/flux-1.1-pro`), `REPLICATE_NANO_BANANA_MODEL` (default `google/nano-banana`), `AGENT_SKILLS_OUTPUT_DIR` (where `Generate.ts` writes when `--output` is omitted, default `~/Downloads`), `ART_SIGNATURE`, `REMBG_BIN`, `MAGICK_BIN`.

## Prove it works

```bash
for k in GOOGLE_API_KEY REPLICATE_API_TOKEN; do if [ -n "${!k}" ] || grep -q "^$k=" "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/.env" 2>/dev/null; then echo "$k yes"; else echo "$k no"; fi; done
bun Tools/Generate.ts --help
bun Tools/Generate.ts --intent=Visualize --dry-run --model nano-banana-pro --prompt "Three boxes joined by arrows" --size 2K --aspect-ratio 16:9 --output "$TMPDIR/art-check.png"
command -v rembg magick ffmpeg
```

Success: the first command prints `yes` for `GOOGLE_API_KEY` (and for `REPLICATE_API_TOKEN` if you use flux), without printing any value (run it in bash; `${!k}` is bash syntax). The second prints the usage text. The third prints `DRY RUN: argument/intent validation passed` and exits 0 without loading a key or calling an API. The last prints a path for each binary you installed in steps 2 to 4; a missing line means that feature will fail with an install message.
