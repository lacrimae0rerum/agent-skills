# Research

Status: optional keys PERPLEXITY_API_KEY GOOGLE_API_KEY XAI_API_KEY, optional `codex` CLI; bun 1.2+ for the tools

## What it does

The research skill answers a question with several independent researchers, checks every URL before delivering it, and tags each finding `[HIGH]`, `[MED]`, `[LOW]` or `[CONFLICT]`. The depth sets how many research vendors run: Quick uses one (Perplexity), Standard uses Claude, Gemini, Perplexity and OpenAI's Codex (plus Grok when X is a likely source), and Extensive and Deep use all five. Each vendor is a separate account, and a missing one narrows the roster instead of stopping the run, but the answer must say which slot was swapped. The `ClaudeResearch` intent uses the agent's own web search and needs no key at all; with no vendor set up, every tier runs on the agent's own web search and the answer names the swapped slots.

## Fill in

Nothing to write in a config file. Optionally add `PREFERENCES.md` in `$AGENT_SKILLS_HOME/research/` (default `~/.agent-skills/research/`) to change defaults. It is free-form bullets, no required keys. Two optional sections are read by name:

- `## ExtractAlpha`: `Count` (how many insights) and `Bullet style` (voice and words per bullet). Default: up to 30 insights, each one plain-language sentence.
- `## InterviewResearch`: `Question style` (whose or what interviewing style the 10 questions follow) and `Interview context` (the usual kind of interview). Default: the Question principles in `Intents/InterviewResearch.md`.

A made-up example:

```markdown
# Research preferences

- Default depth: Standard.
- Always keep a link to the primary source next to every claim.

## ExtractAlpha

- Count: 15-20 insights.
- Bullet style: plain conversational sentences, 10-15 words each.

## InterviewResearch

- Question style: oblique, story-eliciting questions that challenge the guest's assumptions.
- Interview context: podcast interviews with ExampleNet founders.
```

Research artifacts are saved to `$AGENT_SKILLS_HOME/research/history/YYYY-MM/YYYY-MM-DD_<topic>/` and working files to `$AGENT_SKILLS_HOME/research/work/<slug>/`, unless you name another folder.

## Accounts and secrets

Keys go in your environment or in `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`) as `NAME=value` lines, never in a skill file. A variable already set in the environment wins over the file.

| Vendor slot | Account to open | Env var name or tool |
|---|---|---|
| Perplexity (Quick, and part of Standard and up) | A Perplexity API account with credits | `PERPLEXITY_API_KEY`, read by `Tools/PerplexitySearch.ts` (`PERPLEXITY_MODEL` optional) |
| Gemini | A Google AI Studio account with an API key | `GOOGLE_API_KEY`, read by `Tools/GeminiSearch.ts` (`GEMINI_MODEL`, `GEMINI_PRO_MODEL` optional) |
| OpenAI Codex | An OpenAI account | The `codex` command-line tool: `bun install -g @openai/codex`, then `codex login` (`CODEX_RESEARCH_MODEL` optional) |
| Grok | An xAI API account | `XAI_API_KEY`, read by `Tools/GrokQuery.ts` (`GROK_MODEL` optional) |
| Claude (native) | Your agent's own web search | Nothing extra |

Optional extras for community and sentiment questions, each tried before any scraper:

| Source | Env var name or tool |
|---|---|
| YouTube Data API v3 | `YOUTUBE_API_KEY` |
| X API v2 recent search | `X_BEARER_TOKEN` (and `TWITTER_API_KEY` where the `x-twitter` skill uses it) |
| YouTube transcripts | the `fabric` command-line tool, used as `fabric -y <url>` |
| Pages that need rendering | the agent's browser tools (e.g. a Playwright or Chrome automation tool), if available; a page that refuses automated access is reported, and vendor data products (the `bright-data` skill, or a platform-scraping skill if installed) are used only with your yes and within the site's terms |

## Prove it works

Run from the skill folder:

```bash
for k in PERPLEXITY_API_KEY GOOGLE_API_KEY XAI_API_KEY; do
  if [ -n "$(printenv "$k")" ] || grep -q "^$k=." "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/.env" 2>/dev/null; then echo "$k yes"; else echo "$k no"; fi
done
codex --version
bun Tools/PerplexitySearch.ts --help && bun Tools/GeminiSearch.ts --help && bun Tools/GrokQuery.ts --help
echo 'https://example.com/|Example Domain' > "${TMPDIR:-/tmp}/research-check.txt" && bun Tools/VerifyUrls.ts "${TMPDIR:-/tmp}/research-check.txt"
```

The first command prints one `NAME yes` or `NAME no` line per key, never a value. Each `no` is one vendor you will not have; Quick needs only the Perplexity line. The second prints the Codex version, or fails if the tool is not installed. The third prints each tool's usage and sends no request. The fourth runs the URL verifier on one made-up pair and prints `SUPPORTED 200 https://example.com/ ... phrase found` with exit 0 (it needs network access). Then ask your agent a quick research question. Success is an answer where every link was fetched and confidence-tagged.
