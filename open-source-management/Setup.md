# Open Source Management

Status: grep -q '^OSS_REPOS:' "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/open-source-management/Config.md" && echo ok · optional

## What it does

This skill is a maintainer's triage desk for your own open-source repos on GitHub. It reads open issues, pull requests and Discussions through the `gh` CLI, ranks what needs attention across every repo you list, rates community mood, and drafts copy-paste replies. It never posts, closes, merges or publishes on its own: it shows you the exact action and waits for your confirmation; when you ask, it leaves one bot comment per issue that edits in place instead of stacking. Optionally it compares the newest models in the Ollama library against what is installed on a model box you name.

## Requirements

- bun 1.2+ and git.
- The GitHub CLI `gh` (https://cli.github.com), logged in (see Accounts below).
- Optional, for GoPublic: `trufflehog` and `gitleaks` on PATH (an audit without them reads NOT READY, never a silent pass), and `cargo` for Rust dependency licenses.
- Optional, for LocalModels: `ssh` to the model box, or Ollama on this machine.

## Fill in

Create `$AGENT_SKILLS_HOME/open-source-management/Config.md` (default `~/.agent-skills/open-source-management/Config.md`) with the shape below, using the invented `acme-labs` organization as a starter, and replace every value with your own. Every value below is made up.

```markdown
# Open source config

## GitHub

OSS_OWNER: acme-labs
OSS_REPOS: widget, gadget
OSS_PRIORITY: widget

## Attribution

AGENT_NAME: Robin
MAINTAINER_NAME: Alex Example

## Source of truth

- gadget: the public repo is rebuilt from the private `acme-labs/gadget-src` repo by a release
  script; port accepted changes into `gadget-src`, credit the contributor, close the PR.

## Out of scope

- acme-labs/website: triaged by the web team in their own tracker.

## Local Model Host

| Key | Value |
|-----|-------|
| ssh_host | modelbox |
| ollama_bin | ollama |
```

| Key or section | Meaning |
|---|---|
| `OSS_OWNER` | The GitHub user or organization that owns the repos |
| `OSS_REPOS` | Comma-separated repo names under that owner, in the order reports list them. Every intent loops over this list; `--repo <name>` narrows to one of them |
| `OSS_PRIORITY` | Optional. The repo batch triage starts with, usually the busiest one |
| `AGENT_NAME` | Optional. The agent's name in the note at the top of every marker comment ("🤖 **Robin (AI assistant) responding on behalf of Alex Example**"). Default: "An AI assistant". The env var `OSM_AGENT_NAME` wins over it |
| `MAINTAINER_NAME` | Optional. Whose behalf the agent comments on. Default: `OSS_OWNER`. The env var `OSM_MAINTAINER_NAME` wins over it |
| `## Source of truth` | Optional. Any listed repo whose public copy is generated from another tree. The skill ports an accepted change into that tree before anyone says "fixed" in public, and never merges it on the generated repo. A repo not named here is its own source of truth |
| `## Out of scope` | Optional. Repos the skill must not triage, and where they go instead |
| `## Local Model Host` | Optional, for the LocalModels intent only. `ssh_host` is an alias from `~/.ssh/config` for the machine with Ollama; `ollama_bin` is the binary name or full path there. Pass `--local` instead when Ollama is on this machine |

Keep `OSS_*`, `AGENT_NAME` and `MAINTAINER_NAME` as `KEY: value` lines, outside any table. The `## Local Model Host` table must stay the only table whose first column holds one-word keys, because the model-host reader takes every such row as a setting.

### Public deny list (optional, for GoPublic)

`$AGENT_SKILLS_HOME/open-source-management/deny-list.txt` lists what must never reach a public repo. One POSIX extended regex (`git grep -E`) per line, matched case-insensitively against HEAD, every branch and tag tip, and full history; `#` lines and blank lines are ignored. Built-in credential signatures (GitHub, Anthropic, AWS, Slack, Stripe, npm, Google, GitLab and private keys) are always scanned on top. A hit is reported as `ref:path` and a rule id, never the matched text.

```text
# names and emails
Alex Example
alex@example\.com
# hosts and internal domains
modelbox\.lan
corp\.example\.internal
```

A missing file means "no private patterns yet" (the audit says so); a file that exists but holds no pattern stops the audit, so a truncated list never passes silently.

## Accounts and secrets

- The `gh` CLI, logged in as the maintainer account: `gh auth login`, then `gh auth status` to confirm. The default login scopes are enough to read public repos, including Discussions through the GraphQL API. Posting marker comments needs write access to the repo.
- Optional, for LocalModels: ssh access to the model box (key-based, so a non-interactive `ssh <alias> ollama list` works), or `--local` when Ollama runs on this machine. GPU memory comes from `nvidia-smi` on an NVIDIA box, or from unified memory on a Mac (an estimate: three-quarters of RAM). Any other GPU shows "no GPU info", and then nothing is recommended because fit is unknown. Free disk is read with POSIX `df -Pk`, which works on Linux and macOS.

No API key is needed: all GitHub I/O goes through the `gh` session. `OSM_AGENT_NAME` and `OSM_MAINTAINER_NAME` are optional and may also be set in `$AGENT_SKILLS_HOME/.env`.

## Prove it works

From this skill's folder:

```bash
bun Tools/Fetch.ts --help && bun Tools/Fetch.ts stats --brief
```

Both commands only read. Success: the usage text, then one JSON object `{owner, fetchedAt, repos}`. `repos` holds one key per name in `OSS_REPOS`, and each of those holds a `stats` entry that is itself `{ok, stats}`, so the numbers sit one level deeper:

```json
{"owner":"acme-labs","fetchedAt":"…","repos":{"widget":{"stats":{"ok":true,"stats":{"stars":120,"forks":14,"open_issues_and_prs":9,"pushed_at":"…","commits_30d":31}}}}}
```

An `ERROR:` line (exit 1) means `OSS_OWNER` or `OSS_REPOS` is missing from Config.md. An entry like `{"stats":{"ok":false,"error":"could not fetch (gh auth/scope/network) — NOT zero results: gh: Not Found (HTTP 404)"}}` is a hole: a `gh` login problem, or a repo name that does not exist. Holes on every `acme-labs` repo mean the starter values were never replaced. Then ask the agent: "What needs attention in our open source?" Success is a report with one section per listed repo and a ranked top-ten list with suggested replies.
