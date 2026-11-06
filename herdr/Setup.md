# Herdr

Status: `bun Tools/Freshness.ts --offline` (run from the skill folder) · optional

## What it does

Herdr is a terminal workspace manager for coding agents. This skill operates a running herdr session through its CLI (panes, tabs, workspaces, worktrees, other agents), explains and edits your local herdr setup, and checks that the install, your `config.toml` and your knowledge of herdr's own agent instructions are current.

It holds no command syntax of its own. The installed binary documents itself (`herdr --skill`, `herdr --help`), and the skill reads that at use time. It needs the `herdr` binary on your PATH and nothing else. The control commands only work from an agent running inside a herdr pane, where herdr sets `HERDR_ENV=1`.

## Fill in

Nothing is required before first use. Two files in the skill's data folder, `$AGENT_SKILLS_HOME/herdr/` (default `~/.agent-skills/herdr/`), are created for you, and one more you may write:

| File | Created by | What it holds |
|---|---|---|
| `$AGENT_SKILLS_HOME/herdr/freshness.json` | `Freshness.ts --accept` | The accepted baseline: a hash of herdr's own skill text, the herdr version it came from, and the date you accepted it. |
| `$AGENT_SKILLS_HOME/herdr/upstream-skill.md` | `Freshness.ts --accept` | A copy of the herdr skill text at that baseline, kept only so a later change can be diffed. It is never the instruction source. |

Do not write either by hand. A baseline looks like this (made-up values):

```json
{
  "skill_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "herdr_version": "1.0.0",
  "accepted": "2026-01-01T00:00:00.000Z"
}
```

| Field | Meaning |
|---|---|
| `skill_sha256` | SHA-256 of the output of `herdr --skill` when you last read and accepted it. |
| `herdr_version` | The herdr version that produced it. |
| `accepted` | When you accepted it. |

Your herdr settings live in `~/.config/herdr/config.toml` (or under `$XDG_CONFIG_HOME`), outside the skill's data folder. An optional note, `$AGENT_SKILLS_HOME/herdr/ThisInstall.md`, can list the local pieces around herdr (a key mirror, a shell wrapper, hooks); the skill reads it when it exists and works without it.

`ThisInstall.md` is free Markdown. The skill looks for these headings; leave out any that do not apply:

```markdown
# herdr on this machine

## Terminal
kitty, with passthrough maps in ~/.config/kitty/kitty.conf (`--when-focus-on "not var:in_herdr=1"`).
Chords passed to herdr: cmd+t, cmd+n, cmd+w, cmd+k, cmd+h.

## Wrapper
`herdr` zsh function in ~/.zshrc: sets the kitty user var `in_herdr=1` while a herdr client runs.

## Key mirror
`prefix` = ctrl+b. The `[keys]` table in config.toml mirrors the chords above. Change both together.

## Sidebar naming
A hook renames workspaces with `herdr workspace rename`; tabs with `herdr tab rename`.

## Hooks
Agent-state integrations installed with `herdr integration install`: claude, codex.

## Other machines
Clients that attach over SSH: laptop (its own config.toml holds theme and sidebar keys).
```

## Accounts and secrets

No account and no secret. Install the `herdr` binary unmodified from https://herdr.dev (it is AGPL; never vendor or fork its source into this skill). Confirm with the user before running any installer. These environment variables are set by herdr itself inside its panes. Do not put them in `$AGENT_SKILLS_HOME/.env`:

| Name | Where it comes from |
|---|---|
| `HERDR_ENV` | Set to `1` by herdr inside a pane. The skill refuses control commands without it. |
| `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, `HERDR_PANE_ID` | Set by herdr; they say where the current agent sits. |
| `XDG_CONFIG_HOME` | Optional; it moves the herdr config directory the tool reads. |
| `AGENT_SKILLS_HOME` | Optional; it moves the skill's data folder (default `~/.agent-skills`). |

## Prove it works

```bash
herdr --version
bun Tools/Freshness.ts --accept     # from the skill folder
bun Tools/Freshness.ts --offline
```

The first prints `herdr <version>`. The second records the baseline (`ok   skill_hash    baseline accepted at <version>`) after you have read `herdr --skill` once. The third prints one `ok` or `skip` line per check (`version` shows `skip` because of `--offline`) and exits 0. Without a baseline the third run exits 1 with `skill_hash` stale; if herdr is not installed the tool exits 2 with `herdr is not runnable`.
