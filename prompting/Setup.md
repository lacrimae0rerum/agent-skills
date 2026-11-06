# Prompting

Status: `bun Tools/RenderTemplate.ts --help >/dev/null && echo ok` (from the skill folder) · optional

## What it does

The prompting skill is a library for writing, tightening and composing prompts. The standards (`Standards.md`) need nothing but reading. Two tools turn a Handlebars template plus a data file into a finished prompt: `RenderTemplate.ts` renders one, and `ValidateTemplate.ts` checks that a template is well formed and that its data covers its variables. Those two tools import the `handlebars` and `yaml` packages, so they are the only part that needs setup. The output is always a prompt to use elsewhere, never the final content.

## Fill in

Nothing to write in a file. Both packages, `handlebars` and `yaml`, are declared in the skill's own `package.json`; run `bun install` once in the skill folder. To keep your own presets, put them under `$AGENT_SKILLS_HOME/prompting/` (default `~/.agent-skills/prompting/`) with a `PREFERENCES.md`, which overrides the skill's defaults. Example data for the shipped templates is in `Templates/Data/` (`Agents.yaml`, `ValidationGates.yaml`, `VoicePresets.yaml`), and the building blocks are `Templates/Primitives/` (`Briefing.hbs`, `Gate.hbs`, `Roster.hbs`, `Structure.hbs`, `Voice.hbs`).

## Accounts and secrets

None. The skill calls no service and reads no env var or key. If a run stops with `Cannot find package 'handlebars'`, `bun install` has not run in the skill folder yet.

## Prove it works

```bash
cd <skill folder> && bun Tools/RenderTemplate.ts --help
bun Tools/ValidateTemplate.ts -t Templates/Primitives/Roster.hbs
```

The first prints the renderer's usage (`Prompting Template Renderer`) and exits 0. The second is read-only and prints `Status: ✓ Valid` followed by the template's variable list. Both only work once `handlebars` resolves; a missing package stops them at the import. Then render one of the shipped templates, for example `bun Tools/RenderTemplate.ts -t Templates/Primitives/Roster.hbs -d Templates/Data/Agents.yaml`, and expect a Markdown agent roster on stdout.
