# Fabric

Status: command -v fabric >/dev/null && command -v yt-dlp >/dev/null && echo ok · optional

## What it does

The Fabric skill runs any of the 200-plus ready-made prompt patterns (extract wisdom, summarize, threat model, analyze claims and so on) that ship in its `Patterns/` folder. The agent reads the pattern and applies it directly, so everything works with no setup. The separate `fabric` program is needed for only two cases: pulling a YouTube transcript, and fetching a web page that blocks the normal fetch. Set it up if you want those.

## Fill in

Nothing is required. The `fabric` program keeps its own settings in `~/.config/fabric/`. Run its setup once to pick a model provider:

```bash
fabric --setup
```

Optional customizations live in `$AGENT_SKILLS_HOME/fabric/` (default `~/.agent-skills/fabric/`):

| Path | What it holds |
|---|---|
| `PREFERENCES.md` | Optional preferences that override the skill's defaults. |
| `Config.md` | Optional. A `scan_tool: <full path>` line names a content scanner (a bun script that takes a folder and `--json` and prints `{findings: [{file, class, ruleSource}]}`) that UpdatePatterns runs before and after a sync, failing the sync on any new finding. `FABRIC_SCAN_TOOL` (a full path) overrides it. Without either, the sync skips the scan. |
| `Patterns/<name>/system.md` | Your own patterns, in the same layout as the skill's `Patterns/`. One is used only when the skill's library has no pattern of that name, so an upstream pattern always wins. Example: `$AGENT_SKILLS_HOME/fabric/Patterns/rate_example_topics/system.md`. |

The skill's own `Patterns/` folder is the shipped library; it takes nothing from `~/.config/fabric/patterns/`, so your own fabric patterns never leak into it. Put a pattern you want the agent to run in the `Patterns/` folder above instead.

## Accounts and secrets

- Code checks (`Tools/*Check.ts`, `Tools/CheckPatterns.ts`): install [bun](https://bun.sh) 1.2 or newer. They need no keys and make no network calls. Some checks go further when a validator is on PATH: `bash` (shell syntax), `mmdc` from `@mermaid-js/mermaid-cli` (Mermaid diagrams), `yr` or `yara` (YARA rules), `semgrep`, `nuclei`. Without its validator a check skips that step and reports it skipped, except `DesignDocumentCheck.ts`, which exits 2 without `mmdc` unless given `--no-render`.
- Install the program: `go install github.com/danielmiessler/fabric/cmd/fabric@latest` (needs Go; put the Go bin folder on your PATH).
- Install `yt-dlp` and keep it on your PATH. Fabric stops with "yt-dlp not found in PATH" for YouTube transcripts without it. On a Mac, `brew install yt-dlp`.
- An account with whichever model provider you pick in `fabric --setup`. Fabric stores that provider's key in its own folder, not in `$AGENT_SKILLS_HOME/.env`, and a `fabric -y URL -p <pattern>` run sends the transcript to that provider.
- Fetching a page the native fetch cannot extract with `fabric -u` uses Jina AI's reader, per `fabric --help`; it is for pages that allow automated access, never for getting past a block. No key of this skill is involved.
- Updating the pattern library (the UpdatePatterns intent) needs `git` and network access to clone the upstream repo; it does not use the `fabric` program.
- `Tools/PortDuel.ts` (maintainers only: judging a port against its upstream pattern) makes LLM calls through `Tools/_portable/inference.ts`. It needs one provider: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (exported, or written as `KEY=value` lines in `$AGENT_SKILLS_HOME/.env`), the `claude` or `codex` CLI on PATH, or `AGENT_SKILLS_LLM_CMD` (a command that reads a prompt on stdin and prints the answer). By default the generator runs on an Anthropic provider and the judge on an OpenAI provider, so the judge is outside the generator's model family; `--generator-vendor` and `--judge-vendor` change that.

## Prove it works

Run from the skill's folder:

```bash
fabric --version
fabric --listpatterns | wc -l
command -v yt-dlp
bun Tools/CheckPatterns.ts
```

Success: the first command prints a version such as `v1.4.479`, the second prints a count of 200 or more patterns, the third prints the path to `yt-dlp`, and the last prints `Patterns: <count>` followed by a check mark for `extract_wisdom`, `summarize`, `create_threat_model` and `analyze_claims`, exiting 0. If you skip the program, only the last command applies and the skill still runs patterns natively. To try a transcript, `fabric -y "<a public YouTube URL>" -p summarize` should print a summary.
