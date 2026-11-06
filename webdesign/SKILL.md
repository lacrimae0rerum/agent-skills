---
name: webdesign
description: "Designs and integrates web interfaces via DirectDesign (inline, Anthropic frontend-design philosophy, the default) or NativeDesign (/design artboards plus /design-sync design-system sync). USE WHEN web design, UI design, artboards, design variants, create prototype, design system, design sync, redesign site, mockup, landing page, dashboard design, design-to-code, frontend design, polish UI, design audit, brutalist/editorial/retro UI. NOT FOR illustrations/logos (use `art`), video (use `hyperframes`)."
compatibility: "DirectDesign works in any agent. Tools/VerifyDesign.ts needs bun 1.2+ and a local Chrome or Chromium (auto-detected; CHROME_PATH, CHROME_FLAGS). NativeDesign needs Claude Code with Claude Design access (paid Claude plan; /design, /design-sync). Optional: the art-direction skill for the critique loop; AGENT_SKILLS_HOME, AGENT_SKILLS_OUTPUT_DIR (default ~/Downloads). No API keys."
license: MIT (see LICENSE.txt)
---

# Webdesign

Design interfaces using DirectDesign for in-code work, or NativeDesign for artboard variants and design-system sync. Respect existing app tokens and components; redesign only when requested. Both paths share the aesthetic doctrine in `References/FrontendDesignPhilosophy.md` and the same quality loop. Paths in this skill are relative to the skill folder.

## Ideal State

- Every design lands as working code (or a picked artboard implemented) in the host app's framework, diffed against its existing tokens and components; a full redesign happens only when the user asked for one, and replacing existing UI otherwise is flagged and confirmed first.
- The result looks made for its subject and its host app, never like a generic AI page: a named register, none of the forbidden defaults in `References/FrontendDesignPhilosophy.md`.
- The path fits the ask: DirectDesign for in-code work, NativeDesign for comparing looks or design-system sync, and an ambiguous ask gets both paths offered by name, never routed silently.
- Nothing reaches the user as a first draft (upstream directive, 2026-09-17): before it is shown, the rendered result has a real-browser capture (`Tools/VerifyDesign.ts`, or the agent's browser tools) and a critique that passed the bar (the `art-direction` skill's panel when installed, else the self-critique in § Tool contract), or a reported shortfall.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **DirectDesign** (default, bundle `direct`) | in-code UI design or a self-contained page; short ad-hoc design asks, "make a nice design", "do the design yourself", frontend aesthetics, brutalist/editorial/retro/maximalist UI | `Intents/DirectDesign.md` |
| **NativeDesign** (bundle `native`) | artboards, "show me variants", "give me a few directions", "pick a design", mockup, prototype, "claude design", `/design`, `/design-sync`, design-system sync | `Intents/NativeDesign.md` |

DirectDesign fits one pass that lands as code in an existing codebase or as a self-contained page, including when claude.ai access is unavailable or the agent is not Claude Code. NativeDesign fits when the user should compare genuinely divergent looks side by side, review visually before implementation, or the job is design-system sync. Illustrations and logos go to the `art` skill (if installed): brand assets are authored SVG, never generated UI output.

Uncertain routing or the full reference reads bundle `full` (§ Tool contract). The direct bundle includes the full aesthetic reference and the DirectDesign intent, so its doctrine read is already satisfied; do not read the same bytes again. NativeDesign retains its original prerequisites and approvals.

| File | Read when |
|------|-----------|
| `References/CompleteGuide.md` | the required sections of every bundle, or the `full` bundle: integration-aware operation, preflight, the dated gotchas |
| `References/FrontendDesignPhilosophy.md` | any DirectDesign run or NativeDesign brief: the aesthetic doctrine, registers, type pairs, forbidden defaults |
| `References/InputFormats.md` | writing a design brief, importing a design system, choosing iterate vs restart |
| `References/ClaudeDesignCapabilities.md` | what Claude Design and `/design` can and cannot do, access, known limits |
| `References/SiteLaunch.md` | public-site builds and launch completion |
| `README.md` | the public-facing intro to the skill |
| `Setup.md` | first-time setup: the headless browser for the rendered check, and Claude Design access for NativeDesign |
| `Context.json` | the bundle manifest: sections, their files and headings, and which bundle reads what |

## Tool contract

Load context before executing an intent by reading its bundle in full (`Context.json` is the same map in machine-readable form):

| Bundle | Read |
|--------|------|
| `direct` | `Intents/DirectDesign.md` and `References/FrontendDesignPhilosophy.md` |
| `native` | `Intents/NativeDesign.md`, `References/InputFormats.md` and `References/ClaudeDesignCapabilities.md` |
| `full` | `References/CompleteGuide.md` plus both bundles above |

Every bundle also requires `References/SiteLaunch.md` and these sections of `References/CompleteGuide.md`: Integration-Aware Operation, Customization, Intent Routing, Prerequisites (PREFLIGHT), Gotchas. Follow every requirement they state. When unsure whether a section matters, search the files for the term; a failed search does not establish absence, so broaden it or read `full`. Do not proceed with a partial read.

Verification and the quality loop:

- Browser evidence: `bun Tools/VerifyDesign.ts <url-or-path> <out-dir> [--viewport WIDTHxHEIGHT] [--full]` opens the page in a fresh local headless Chrome (throwaway profile, never the user's own windows), refuses a failed load or a blank frame, saves the screenshot and runs the a11y heuristics; then read the screenshot. Checks that need interaction (hover, motion, clicks, several widths) use the agent's browser tools (e.g. a Playwright or Chrome automation tool) if available; otherwise ask the user to check. With no browser available (exit 3 and no browser tools), the result is reported explicitly as unverified.
- Use the `art-direction` skill, if installed: its direction council runs before new or large work; then its cross-vendor critique panel scores the capture against its rubric and names defects, and this skill iterates on those defects until the bar or reports the shortfall. Without it, critique the capture yourself against `References/FrontendDesignPhilosophy.md` (Forbidden Defaults, the calibration tells, the done checklist), fix what it names, and report the result as self-critiqued rather than panel-passed.
- A file handed over through the user's downloads folder (`$AGENT_SKILLS_OUTPUT_DIR`, default `~/Downloads/`) goes through the `art-direction` skill's delivery tool when installed, which refuses without a passing, fresh critique; without it, copy the file there only after the critique passed.
- Record the user's verdict with the `art-direction` skill's calibration tool when installed; otherwise, if your agent keeps persistent memory, record it there.
- Public-site builds and launch completion also read `References/SiteLaunch.md`; component edits and standalone mockups do not require registration.
- Deploying, publishing or syncing to a remote design-system project is an outside action: confirm the exact action and target with the user first.

## Setup

- DirectDesign needs nothing beyond the agent. The rendered check, `Tools/VerifyDesign.ts`, needs bun 1.2+ and a local Chrome or Chromium; it finds the usual installs, `CHROME_PATH` picks one and `CHROME_FLAGS` adds launch flags (e.g. `--no-sandbox` in a container).
- NativeDesign needs Claude Code with Claude Design access: a paid Claude plan that includes Claude Design, a build that carries `/design` and `/design-sync`, and for sync a claude.ai login with design scopes. In any other agent, use DirectDesign.
- Optional: the `art-direction` skill for the critique, delivery and calibration loop.
- No API keys. Details and a self-check: [Setup.md](Setup.md).

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/webdesign/PREFERENCES.md` (default `~/.agent-skills/webdesign/`) and override the defaults here; when absent, the defaults stand.

Those design preferences (color palette, typography, spacing grid, animation timing, framework defaults, the last shipped sites) feed every brief, DirectDesign inline, or the NativeDesign artboard brief and design-system project, and bias the register choice without binding it. Never substitute generic defaults for configured preferences. Without preferences, choose freshly each session and rotate registers across runs.

## Gotchas


## Examples

```
User: "Redesign the Example App page /app/reports/weekly inside the existing app shell — it looks like trash"
→ DirectDesign, framework-matched-diff
→ The page uses the app's own components and tokens, reads as designed rather than a plain table, and ships with its screenshot and a passing critique
```

```
User: "Design and build example.com, a public content site for the course. Deploy only after I look."
→ DirectDesign plus References/SiteLaunch.md
→ A rendered site with a committed register, launch criteria in the project's spec, and the deploy held for the user's yes
```

```
User: "Pull this repo's design system into Claude Design"
→ NativeDesign, sync leg
→ The design-system project holds the repo's real tokens and components, so later artboards start from the brand
```
