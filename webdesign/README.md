# Webdesign

An agent skill for designing and integrating web interfaces — inline aesthetic design that works in any agent, plus the first-party **Claude Design** surface (claude.ai/design, `/design`, `/design-sync`) when the agent is Claude Code with Claude Design access.

## What It Does

Two paths, one skill:

- **DirectDesign** — writes the design inline with Anthropic's open-source frontend-design philosophy loaded as doctrine. No Claude Design auth or round-trip; the rendered page is checked in a real (headless) Chrome and critiqued before you see it. The default workhorse.

- **NativeDesign** — drives the native `/design` artboard workflow (research preview: editable artboard variants built on artifacts — pick one, tweak, implement) and `/design-sync` design-system sync between a codebase and a Claude Design project.

## Key Capability: Integration-Aware

Most design tools assume greenfield. Webdesign assumes the opposite: you already have an app and need to land a new page or component into it cleanly. Both paths produce diffs on top of existing code, respecting existing tokens and component patterns.

## Prerequisites

- **DirectDesign:** no Claude Design access or auth. For the rendered check, bun 1.2+ and a local Chrome or Chromium (`Tools/VerifyDesign.ts`), or the agent's own browser tools; optionally the `art-direction` skill for the critique loop.
- **NativeDesign:** a Claude subscription with Claude Design access, a harness build carrying the `/design` skill, and (for sync) a claude.ai login with design scopes.
- For integration: the target project's framework, token file, and component directory.

## Quick Start

With the skill installed, ask:

```
"Design a settings panel for this app"                  → DirectDesign
"Give me three directions for the pricing page"         → NativeDesign (artboards)
"Pull this repo's design system into Claude Design"     → NativeDesign (sync)
```

The skill routes your request to the right intent automatically.

## Intents

| Intent | Purpose |
|----------|---------|
| DirectDesign | Brief → inline design as code, aesthetic doctrine loaded |
| NativeDesign | Artboard variants → pick → implement; design-system sync |

## Relationship to Other Tools

- **`frontend-design` philosophy** (Anthropic, MIT): mirrored into `References/FrontendDesignPhilosophy.md` — the aesthetic doctrine for DirectDesign.
- **`Tools/VerifyDesign.ts`** (headless Chrome) and the agent's browser tools: verification of rendered output (real-browser screenshots).
- **`art-direction` skill** (optional): the critique loop every design passes before it reaches you.
- **`art` skill** (optional): for illustrations, diagrams, header images — not overlapping scope.

## License

See LICENSE.txt.
