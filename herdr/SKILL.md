---
name: herdr
description: "Operates herdr, the third-party terminal workspace manager for coding agents, through its CLI and socket API; explains and edits the local herdr setup (config.toml keys, shell wrapper, terminal passthrough maps, sidebar naming, agent-state integrations); and checks the install against upstream. Use when the user mentions herdr, herder, herd, a herdr command, pane, tab, workspace or worktree, wants to start an agent in a pane, prompt or read the agent in the other pane, asks what their other agents are doing, or asks about herdr config, keybindings, sidebar, integrations, docs, remote machines, updating herdr or whether herdr is up to date. Not for the agent's own in-session subagents, and not for the terminal emulator itself outside herdr."
license: MIT (see LICENSE.txt)
compatibility: "Requires the herdr CLI on PATH (unmodified binary from herdr.dev) and bun 1.2+ for Tools/Freshness.ts; control commands only inside a herdr pane (HERDR_ENV=1). Freshness online checks fetch herdr.dev; --offline skips them. macOS or Linux."
---

# Herdr

**Contents:** Setup · Ideal State · Intent Routing · Sources of Truth · This Install · Data & Config · Gotchas · Examples

Herdr documents itself for agents, so this skill holds no command syntax. It names where the syntax lives, what is custom about this install, and how to tell when either has drifted.

## Setup

- Install the `herdr` CLI, unmodified, from https://herdr.dev and put it on `PATH`. Installing or updating software changes the user's system: confirm with the user before you run any installer.
- `bun` 1.2+ runs `Tools/Freshness.ts`. No account, API key or other environment variable is needed; herdr sets `HERDR_ENV` and the pane IDs itself.
- Control commands work only from an agent that runs inside a herdr pane (`HERDR_ENV=1`). Read-only status and docs work runs anywhere.
- Baseline, optional install note and the commands that prove the install works: [Setup.md](Setup.md).

## Ideal State

- Every herdr command takes its syntax from the installed binary (`herdr --skill`, the command group's own help, `herdr api schema`), never from memory or this skill.
- Control commands run only from inside a herdr pane, against an explicit target, without moving the user's focus; anything that would stop the server, close what I did not open or answer another agent's dialog waits for an explicit yes.
- A question about local behaviour is answered from the live file that causes it, and a change lands in the file that owns it.
- Drift between the install, our config and herdr's own agent instructions is caught by `Tools/Freshness.ts`, not by editing this skill on every release.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **Operate** | control panes, tabs, workspaces, worktrees; start, prompt, read or wait on an agent; "what are my other agents doing" | `Intents/Operate.md` |
| **Delegate** | "have codex / another claude do X in a pane", "get a second opinion in a pane", spin up an agent next to me | `Intents/Delegate.md` |
| **Configure** | keybindings, theme, sidebar, toasts, integrations, the wrapper or passthrough maps, "why does this key do that in herdr" | `Intents/Configure.md` |
| **Freshness** | "is herdr up to date", docs drift, after any herdr update | `Intents/Freshness.md` |
| **Update** | "update herdr", "upgrade herdr", a stale `version` or `server` check | `Intents/Update.md` |

| File | Read when |
|------|-----------|
| `Setup.md` | first-time setup: the freshness baseline files, environment variables, and the commands that prove the install works |

## Sources of Truth

Read these at use time. The installed binary outranks the website when they disagree, because the site describes the newest release.

| Need | Source |
|------|--------|
| How an agent should drive herdr, with safety rules | `herdr --skill` |
| Exact syntax for a command group | the group with no subcommand: `herdr agent`, `herdr pane`, `herdr tab`, `herdr workspace`, `herdr worktree`, `herdr terminal`, `herdr notification`, `herdr integration`, `herdr session`, `herdr machine` |
| Socket API methods and shapes | `herdr api schema --json` |
| Live state of the session | `herdr api snapshot`, `herdr agent list`, `herdr status` |
| Every config key, its type and default | `herdr --default-config` for this binary; the config reference JSON linked from the docs index for prose |
| Any doc page (plugins, remote, session restore, troubleshooting) | the index at `https://herdr.dev/llms.txt`, then only the page the task needs |
| What changed in the newest release | `release-notes.json` beside `config.toml` |

The config reference is one large JSON file. Filter it by key:

```bash
curl -fsSL "<config reference URL from the index>" | jq --arg key 'ui.sidebar_width' '.sections[].keys[] | select(.key == $key)'
```

## This Install

Optional: if `$AGENT_SKILLS_HOME/herdr/ThisInstall.md` exists, read it for the local pieces around herdr (config key mirror, shell wrapper, terminal passthrough maps, sidebar naming, hooks); without it, rely on the sources above. Its format is in [Setup.md](Setup.md).

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/herdr/PREFERENCES.md` (default `~/.agent-skills/herdr/`) and override the defaults here; when absent, the defaults stand.

Freshness baseline and the last accepted copy of herdr's skill text: `$AGENT_SKILLS_HOME/herdr/` (`freshness.json`, `upstream-skill.md`). The snapshot exists only so a changed skill can be diffed; it is never the instruction source. Both files are created by `Tools/Freshness.ts --accept`; with no baseline the `skill_hash` check reports stale and says to run it. First-time setup and the commands that prove the install: [Setup.md](Setup.md).

## Gotchas

- Bare `herdr` launches or attaches the TUI. Never run it for discovery. A mutating subcommand with its arguments omitted still executes with defaults (`herdr workspace create` creates one). (upstream skill text)
- Control commands need `HERDR_ENV=1`. Outside a herdr pane the CLI still reaches the socket, and it would act on whichever pane the user has focused. Status, config and docs work is fine from anywhere.
- `herdr update`, `herdr server stop` and a server restart take down every pane the server owns, this session included when it runs inside herdr. Check `herdr agent list` first and get a yes.
- The upstream repo has moved owners more than once. Take URLs from the docs index, never from memory or an old note.
- The docs index describes the newest stable release. When it names a command the installed binary lacks, the binary is behind; do not guess the syntax.
- `cmd` chords only reach herdr through the kitty keyboard protocol (herdr 0.8+), and a chord left unbound because another tool claims it system-wide. A "broken" key is usually one of those two.
- Workspace rows are named after the launch directory, so sessions started from home all read `~` until something renames them.
- A second agent started in a pane works in the same checkout unless a worktree was asked for.
- `herdr --default-config` is an incomplete key list: it shows only example `theme.custom` colour tokens, and it lists `ui.accent` after the commented `[ui.sidebar.spaces]` header. The exact list is the config reference JSON at the installed version tag, which `Tools/Freshness.ts` uses when online. `herdr server reload-config` can return zero diagnostics for a config the default-config check flagged.
- Theme and sidebar-layout keys are read from the client's `config.toml`, never from the server's. When a client attaches from another machine (a `herdr remote-client-bridge` process whose parent is an `sshd-session`), edits on this machine and `herdr server reload-config` change nothing on that client's screen, even though the reload reports `applied`. Identify the client machine before changing a colour.
- No key or mouse gesture resizes the sidebar; `toggle_sidebar` only collapses it (per the config reference). Width is `ui.sidebar_width` and `ui.sidebar_max_width` plus `herdr server reload-config`.
- The terminal-layer rows in the Configure and Update intents (kitty passthrough maps and a `herdr` shell wrapper) apply only when the user runs such a layer and lists it in `ThisInstall.md`; without it, skip them.
- Herdr is AGPL. Use it as an unmodified installed binary; never vendor or fork its source into this skill or the user's repos.

## Examples

**Example 1: Hand a review to a second agent**
```
User: "spin up codex next to me and have it review the diff"
→ Delegate
→ Codex's review, read from its settled pane and checked, is in my reply; the user's focus never moved and the pane is closed
```

**Example 2: A key does the wrong thing inside herdr**
```
User: "cmd+t opens a kitty tab instead of a herdr workspace"
→ Configure
→ The answer names the cause (a missing empty kitty map or a missing user var, see Intents/Configure.md § Terminal passthrough) and the fix lands in that file; `herdr server reload-config` ran only if config.toml changed
```

**Example 3: After an update**
```
User: "is herdr current?"
→ Freshness
→ Each stale check from `bun Tools/Freshness.ts` is reported with its meaning and response; a changed `herdr --skill` was diffed against the snapshot before --accept
```
