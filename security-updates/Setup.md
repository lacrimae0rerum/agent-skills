# security-updates

Status: `bun -e 'console.log(require("./sources.json").sources.length+" sources")'` (from the skill folder) · optional

## What it does

Security Updates builds a ranked, deduplicated security-news digest of at most 32 items from six public sources (tl;dr sec, No Security, Krebs on Security, The Hacker News, Schneier on Security, Risky Business), sorted into Security News, Security Research and Security Ideas. It remembers what it showed you last time, so a second run the same day correctly reports "no new items since last check". It needs no accounts and no keys. It reads the six public sites over the web, and it keeps one small state file of its own.

## Fill in

Nothing is required. One optional file lets you add sources and steer topics.

`$AGENT_SKILLS_HOME/security-updates/PREFERENCES.md` (default `~/.agent-skills/security-updates/`), smallest working version:

```markdown
Extra sources:

- Example Security Blog | https://blog.example.com/security | vendor-neutral incident writeups

Drop:

- vendor product announcements
```

| Label | Meaning |
|---------|---------|
| Extra sources | `name \| url \| what it covers`, one per line. Fetched along with the six defaults. |
| Emphasise | Topics to rank higher. |
| Drop | Topics to leave out. |

The skill creates its own state file, `$AGENT_SKILLS_HOME/security-updates/last-check.json`, on the first run; do not create it by hand. Delete it to make the next run behave like a first run (last 7 days).

## Accounts and secrets

None. There is nothing to put in `$AGENT_SKILLS_HOME/.env`. The tool needs bun 1.2+.

## Prove it works

```bash
# from the skill folder
bun -e 'console.log(require("./sources.json").sources.length+" sources")'
bun Tools/Digest.ts filter --state "${TMPDIR:-/tmp}/secupdates-check.json" <<< '[{"title":"Test","source":"krebsonsecurity","url":"https://example.com/x"}]'
```

Success prints `6 sources`, then a JSON object with `"first_run": true` and the one test item (the throwaway `--state` path keeps your real state untouched). Then ask your agent "what's new in security". A working run returns a digest headed `Security Updates` with News, Research and Ideas sections and a summary table, and afterwards the file `$AGENT_SKILLS_HOME/security-updates/last-check.json` exists. Running it again straight away should report no new items.
