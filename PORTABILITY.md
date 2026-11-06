# Portability standard

Every skill in this repo works in any agent that can read files and run shell commands
(Claude Code, Codex, pi, Gemini CLI, Cursor, OpenCode, ...). `tools/lint.py` checks the
mechanical rules; a skill is done when the linter passes and the skill still does its job.

## 1. Folder and frontmatter

- One folder per skill, named in lowercase kebab-case. `SKILL.md` sits at its root.
- Frontmatter uses only Agent Skills spec keys, one `key: value` per line (no multi-line values):

  ```yaml
  ---
  name: first-principles            # = folder name, [a-z0-9-], max 64 chars
  description: "What it does. Use when ... Not for ... (use `systems-thinking`)."   # max 1024 chars
  license: MIT (see LICENSE.txt)
  compatibility: "Requires bun 1.2+; PERPLEXITY_API_KEY for Quick mode."   # required when the skill ships code
  ---
  ```
- The description says what the skill does and when to use it, in words an agent matches
  against a request. Trigger phrases are fine; keep the most useful ones within 1024 chars.
- `SKILL.md` body under 500 lines; detail goes to `References/`, `Intents/`, `Templates/`.
- A skill that includes third-party MIT code keeps its `LICENSE.txt` (copyright and permission
  notice) and says `license: MIT (see LICENSE.txt)`.

## 2. Instructions name capabilities, not harness tools

| Harness-specific | Write instead |
|---|---|
| `Skill("X")`, "invoke the X skill" | "use the `x` skill if it is installed; otherwise <what to do>" |
| Task / Agent tool, `subagent_type`, "spawn N agents" | "If your agent can run subagents, run these N in parallel, each with <brief>; otherwise run them one after another in this session." |
| `AskUserQuestion` | "Ask the user ..." |
| `WebSearch` / `WebFetch` | "search the web" / "fetch the page" (with the agent's web tools, or `curl`) |
| `TodoWrite` | "keep a checklist" |
| Read / Write / Edit / Bash / Grep tools | "read the file", "edit", "run `<command>`", "search the files" |
| hooks, statusline, banners, slash commands | explicit steps in the skill; "when the user asks to ..." |
| model aliases (opus, sonnet, fable), "/model" | effort words ("a fast model", "the most capable model available") or the `level` of the inference helper |

## 3. Paths, data, secrets

- Files shipped with the skill: paths relative to the skill folder (`Intents/Challenge.md`,
  `Tools/Search.ts`). In code, locate them with `skillRoot(import.meta.url)`.
- Per-user data and config: `$AGENT_SKILLS_HOME/<skill>/` (default `~/.agent-skills/<skill>/`).
  In code: `skillDataDir("<skill>")`. Optional user preferences: `$AGENT_SKILLS_HOME/<skill>/PREFERENCES.md`,
  read when present.
- Secrets: environment variables, optionally loaded from `$AGENT_SKILLS_HOME/.env`
  (`getEnv`, `requireEnv`). Never hard-code a key. List every variable in `compatibility`
  and in a `## Setup` section.
- No absolute home paths, no `~/.claude`, no imports from another skill's folder.
- Optional integration with another skill (running its tools, reading its suites) finds it at
  run time through `<SKILL>_SKILL_DIR` (e.g. `ASSAY_SKILL_DIR`), then `$AGENT_SKILLS_DIR/<skill>`,
  then the sibling folder `../<skill>`, and fails with a clear message when it is absent. The skill still works
  without it. Shared download caches may live in the owning skill's data folder.

## 4. Personal-assistant infrastructure

Skills written for one person's assistant lean on services that do not exist elsewhere. Replace or drop them:

| Assistant-specific | Portable form |
|---|---|
| "the principal", "DA" (digital assistant) | "the user", "the agent" |
| identity, goals or `USER/` files | optional user context in `$AGENT_SKILLS_HOME/<skill>/`, or ask the user |
| a private memory system, `MEMORY/`, learning capture | "if your agent keeps persistent memory, record ...", or a file in the skill's data folder; else drop |
| a private spec format | a plain spec or acceptance-criteria document in the user's project; "ideal state" as a concept may stay |
| status pages, run ledgers, private slash commands | drop (no equivalent needed) |
| local voice or notification server, voice providers, banners | drop, or make an explicit optional step |
| imports from a shared library outside the skill | `Tools/_portable/` (invariant, paths, inference) or a small copy of the needed code inside the skill |
| an inference helper tied to one CLI or subscription | `Tools/_portable/inference.ts`: same option names, any provider |
| eval suites, `evals:` frontmatter | keep only inside the `assay` skill or as optional `Suites/`; never required to use a skill |
| skills that are not in this repo | only skills present in this repo, by kebab name, always optional |

Keep the value of the skill: method, ideal state, rules, gotchas, examples and templates.
Change what portability needs; do not rewrite or shorten the rest.

## 5. Code

- Runtime: bun (TypeScript). State it in `compatibility`. npm dependencies go in the skill's
  own `package.json`; say `bun install` in Setup.
- Every relative import resolves inside the skill folder. `tools/lint.py` runs
  `bun build --packages=external` on every code file.
- `Tools/_portable/` holds byte-identical copies of `tools/portable-lib/`; change the canonical
  copy and run `python3 tools/lint.py --sync-lib`.
- Tests stay only when they run offline and without keys (`bun test`).
- macOS-only commands are allowed when the skill is about that platform; say so in `compatibility`.

## 6. Safety

Actions with outside effect (post, publish, send, pay, order, delete, deploy) need the user's
explicit confirmation of the exact action first. Keep upstream gates, written as steps.

## 7. Verify

```bash
python3 tools/lint.py <skill>          # mechanical rules + bun build
python3 tools/lint.py                  # whole repo
```
