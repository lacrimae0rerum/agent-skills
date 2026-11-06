# HyperFrames

Status: command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null && test -d "${HYPERFRAMES_CACHE:-$HOME/.cache/agent-skills/hyperframes}" && echo ok · required

## What it does

HyperFrames makes short animated videos from code: an HTML page with one GSAP timeline is stepped frame by frame and encoded to MP4. The agent plans the scenes first, builds the page, checks stills, then renders. Every render goes through a local wrapper (`Tools/lib/hyperframes/`) that pins the HyperFrames version and blocks its network calls. A fresh machine needs macOS, bun, ffmpeg, a one-time download of the pinned HyperFrames tools, access to two model vendors for the plan review, and, only for the narrated and film-review features, a key or two.

Run every command below from the skill folder.

## Fill in

Nothing to write by hand for a basic animation. Optional files, in `$AGENT_SKILLS_HOME/hyperframes/` (default `~/.agent-skills/hyperframes/`):

- `LaunchFilmReferences.md`: only for launch films. One line per reference film you want the new film measured against. A made-up example:

```markdown
- Example Launch Film (https://example.com/launch-film): fast kinetic type, 4 picture changes per 10 s.
```

- `Theme.json`: only if you want a house look. A partial theme merged over the neutral default in `Tools/Theme.ts`; its keys mirror `DEFAULT_THEME` (`colors`, `typography`, `motion`, `spacing`, `effects`, `borderRadius`). An unknown key, a wrong type or a named font family stops with the file and key. A made-up example:

```json
{ "colors": { "accent": "#e11d48", "accentLight": "#fb7185", "accentDark": "#be123c" } }
```

- `TypeRoles.json`: only for house fonts. Type roles the seam's `roleFaces()` reads (`{ "<role>": { "case": "upper|title|sentence", "faces": [{ "family": "...", "file": "<path or name in ~/Library/Fonts>", "weight": 400 }] } }`); without it, compositions use the compiler's bundled Inter and JetBrains Mono.
- `PREFERENCES.md`: prose taste the skill reads before composing: presets, music placement (the skill already keeps music out from under anyone talking), capture rules, writing-style notes for narration, and whether `Tools/WatchFilm.ts` may send private cuts to its vendor (public films only when this says nothing).
- `$AGENT_SKILLS_HOME/art/PREFERENCES.md`: the `art` skill's aesthetic notes, loaded before composing when present. Load-bearing only if you want a house look.

Projects live outside every git repo, in `$HYPERFRAMES_PROJECTS_DIR` (default `~/HyperFrames/<slug>/`). Finished videos reach `$AGENT_SKILLS_OUTPUT_DIR` (default `~/Downloads/`) through the quality loop's hand-over (SKILL.md § Quality loop). The download cache for the pinned tools is `$HYPERFRAMES_CACHE` (default `~/.cache/agent-skills/hyperframes`), shared with every other skill that carries a copy of the seam.

## Accounts and secrets

Basic animations need no account, but the plan review needs two vendors. Keys go in the environment or in `$AGENT_SKILLS_HOME/.env` (`KEY=value` lines; real environment variables win).

- Install bun 1.2+ and ffmpeg with ffprobe: `brew install ffmpeg`. The render checks stop with "install it (brew install ffmpeg)" when either is missing from your PATH.
- Run `bun Tools/lib/hyperframes/HyperFrames.ts install` once. It fetches the pinned HyperFrames CLI and its headless Chrome from npm and Chrome for Testing, then prints a JSON line with `"ok":true`. This is the only unsandboxed network step besides the GSAP download on first use; later renders run offline.
- Plan review (`Tools/lib/video-meaning/VideoMeaning.ts`): an Anthropic judge (`ANTHROPIC_API_KEY`, or a signed-in `claude` CLI) and an OpenAI judge (`OPENAI_API_KEY`, or a signed-in `codex` CLI). Models per level follow the portable inference helper (`AGENT_SKILLS_MODEL_<LOW|MEDIUM|HIGH|MAX>` overrides).
- `FISH_API_KEY` and `FISH_VOICE_ID`, from a Fish Audio account (the key, and the reference id of the voice to narrate with): only for narrated pieces (GeneratedContentVideo, CapabilityVideo, a narrated LaunchVideo). `FISH_TTS_MODEL` overrides the model header (default `drama-3`). Image scenes in GeneratedContentVideo use the `art` skill, which has its own setup.
- `GOOGLE_API_KEY`, from a Google AI Studio account: only for `Tools/WatchFilm.ts`, which has Gemini watch a public film and write notes (`GEMINI_VISION_MODEL` overrides the model).
- The tools never print a key; a missing one stops the tool with the variable's name and where to set it.

## Prove it works

```bash
command -v ffmpeg ffprobe
bun Tools/Scaffold.ts --dir ~/HyperFrames/setup-check --title "Setup check"
bun Tools/lib/hyperframes/HyperFrames.ts check --project ~/HyperFrames/setup-check
```

Success: the first line prints two paths, the scaffold prints a check mark for `index.html` and `vendor/gsap.min.js`, and the check prints `{"ok":true,"errors":0,"warnings":0}`. If the check reports the pinned tools are not runnable, run the `install` command above and try again. Delete `~/HyperFrames/setup-check` afterward. To see a picture, take one still with `bun Tools/lib/hyperframes/HyperFrames.ts snapshot --project ~/HyperFrames/setup-check --at 1 --out-dir ~/HyperFrames/setup-check/stills`, which prints a JSON line with `"ok":true` and writes `frame-00-at-1s.png` there.
