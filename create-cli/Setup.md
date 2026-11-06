# create-cli

Status: `test -f "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/create-cli/Config.md" && echo ok` · optional

## What it does

create-cli generates TypeScript command-line tools on Bun: typed source, help text with real examples, JSON output and fixed exit codes, then proves the result with `Tools/CheckCli.ts`. A CLI for a public-facing app also meets an agent-first contract (device login, a `help --json` catalog, rate limits, a SHA-checked install). It works with no setup.

## Requirements

- bun 1.2+ on PATH (`bun --version`). `Tools/CheckCli.ts` also runs `bunx tsc`, which fetches TypeScript on first use when the CLI directory does not have it installed.

## Fill in

One optional file, `create-cli/Config.md` under `$AGENT_SKILLS_HOME` (default `~/.agent-skills`), with two keys:

| Key | Meaning |
|---|---|
| `Reference CLI:` | an existing CLI of yours that already meets the public-app agent-first contract: where its source lives and which criteria define it. New public-app CLIs copy its command catalog, device login, exit codes and install script. Leave it out and the contract in SKILL.md governs on its own. |
| `Tools folder:` | where personal CLIs are created (for example `~/tools/`). Leave it out and the agent asks each time. |

A made-up example:

```markdown
- **Reference CLI:** the ExampleNet CLI, source at `~/Projects/examplenet/cli/`, contract in `~/Projects/examplenet/SPEC.md` (the CLI acceptance criteria).
- **Tools folder:** `~/tools/`
```

Optionally, `PREFERENCES.md` in the same folder records broader language taste (for example `- **Languages:** TypeScript for scripts and CLIs; Rust when a compiled binary is required.`). It never changes what create-cli generates, which is always TypeScript on Bun.

## Accounts and secrets

None. A generated CLI that calls an API lists its own keys in its `.env.example`; their values go in the environment or in the env file the CLI documents (default `~/.config/<cli-name>/.env`).

## Prove it works

```bash
bun Tools/CheckCli.ts --help    # run from this skill's folder
```

Success: the usage text prints and the command exits 0. Then ask your agent "create a CLI that wraps the httpbin API" and expect a project with `--help`, JSON output and a passing `CheckCli.ts` run.
