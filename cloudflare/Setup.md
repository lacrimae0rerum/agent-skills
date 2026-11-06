# Cloudflare

**Contents:** What it does · Fill in · Accounts and secrets · Prove it works

Status: `bun <skill>/Tools/CfEnv.ts auth whoami` · optional (`<skill>` is the absolute path of this skill's folder)

## What it does

Cloudflare deploys and manages Workers, Pages, KV, R2, D1, DNS and Queues with Cloudflare's `cf` CLI, and builds MCP servers as Workers. Every call that touches your account goes through the skill's `Tools/CfEnv.ts`, which reads your API token from the environment or `$AGENT_SKILLS_HOME/.env`, hands it to one `cf` process, and refuses any command outside a short allowlist. Before a real deploy the agent runs an independent code review and asks you to confirm the exact deploy (§ Deploy review below), and CfEnv checks that no live secret would be dropped. Afterwards CfEnv checks that every declared secret survived (a lost one makes it exit 10 even though the deploy is already live) and prints the live and previous version IDs.

It needs bun 1.2+, git, a Cloudflare account, the `cf` CLI (`bun add -g cf@latest`, used for discovery and local work; CfEnv installs and runs its own pinned cf for every account call, under `$AGENT_SKILLS_HOME/cloudflare/cf/`, the first time it runs), a project you deploy from that is a git repository with at least one commit, and a reviewer for the deploy review. Wrangler is needed only while converting an old Wrangler project, and the conversion removes it.

## Fill in

Both files below are optional and no code parses them: the skill reads them when a step needs them. Neither ever holds a secret value.

### `$AGENT_SKILLS_HOME/cloudflare/Config.md`

Default location `~/.agent-skills/cloudflare/Config.md`.

Notes about your own account. A complete example on made-up values:

```markdown
# Cloudflare — Config

## Master token

- Dashboard name: example-deployer
- Permissions granted: Workers Scripts edit, Workers Routes edit, D1 edit, Zone DNS edit
- Last checked: 2030-01-15, a 200 from an endpoint of each product the token covers

## Workers that read the token at runtime

| Worker | Secret name |
|--------|-------------|
| example-stats | CLOUDFLARE_API_TOKEN |

## Optional commands

new_zone_sweep: bun ~/tools/apply-zone-baseline.ts
dev_url_check: the nightly result in ~/tools/check-dev-urls.log
scanner_registration: add the hostname to ~/tools/scan-targets.json, then run bun ~/tools/scan-targets.ts --reload
```

| Entry | Meaning |
|-------|---------|
| Master token | The token's dashboard name and permission set, so a refused call can be checked against what it was granted. |
| Workers that read the token | Every Worker that holds the token as a secret; each needs the new value after a rotation. |
| `new_zone_sweep:` | A command that applies your zone baseline (for example HTTPS redirects, HSTS, response security headers) to a newly added zone. Without it, the skill reports a new zone as bare. |
| `dev_url_check:` | Where to read the latest result of a scheduled check that flags workers still answering on `*.workers.dev` after they got a custom domain. Without it, the skill does not claim the account is clean. |
| `scanner_registration:` | The step that adds a newly public app to your external scanner. Without it, the skill reports that the app has no external scan. |

Each optional command is your own tool. A minimal worked example of each, on made-up paths:

- **Zone baseline.** `~/tools/apply-zone-baseline.ts` lists your zones through `bun <skill>/Tools/CfEnv.ts zones list`, and for each one missing the baseline sets Always Use HTTPS and HSTS through the zone settings API. It is safe to run twice.
- **Dev-URL check.** A scheduled job (cron, launchd or your agent's scheduler) runs nightly, requests `https://<worker>.<subdomain>.workers.dev/` for each worker that has a custom domain, and writes one line per worker to `~/tools/check-dev-urls.log`; anything other than 404 or 410 is a finding.
- **Scanner registration.** `~/tools/scan-targets.json` holds `[{"host": "app.example.com", "protectedPaths": ["/admin"]}]`; registering a new app appends one entry and reloads the scanner.

### `$AGENT_SKILLS_HOME/cloudflare/PREFERENCES.md`

Short standing preferences that override the skill's defaults, one paragraph each. Example:

```markdown
# Cloudflare — Preferences

## New sites

Prefer static Workers with assets over Pages for every new site.

## Telemetry

Keep `cf` CLI telemetry Disabled on this machine.
```

## Accounts and secrets

Open a Cloudflare account, then export two keys or add them to `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`):

| Env key | Where to get the value |
|---------|------------------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → Manage Account → Account API Tokens → Create Token. Grant only the scopes your deploys use. A Workers site with a D1 database on its own domain needs Workers Scripts edit, Workers Routes edit, D1 edit and Zone DNS edit; add KV, R2, Pages or Queues only when you deploy them. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account details, or any zone's Overview page. |

CfEnv takes only these two keys from the env file, stops with exit 2 when `CLOUDFLARE_API_TOKEN` is missing, and a real env var wins over the file. Never source `.env` into your shell and never rely on `cf auth login`; the configured token is the credential of record.

For package scripts that deploy through CfEnv (`Intents/Deploy.md` § Converting a Wrangler project), set `CFENV_PATH` in your shell profile to the absolute path of this skill's `Tools/CfEnv.ts`.

To prove the token's scope without trusting `/user/tokens/verify` (an Account API Token usually lacks the `User Details: Read` it needs, so it fails on a valid token), use the scope-matching probe in `Intents/Troubleshoot.md` § Auth errors during deploy.

### Deploy review

Every real deploy (anything but `--dry-run`) is preceded by an independent code review of the changes since the last reviewed deploy, then by your confirmation of the exact deploy (`Intents/Deploy.md` § Safety gates). The agent runs the review as a step; CfEnv does not run it. Prefer a reviewer that did not write the code:

| Reviewer | What it needs |
|----------|---------------|
| A model from another vendor than the one that wrote the code (the usual case) | That vendor's CLI on your PATH and signed in (for example the `codex` CLI with `codex login`, or the `claude` CLI), or its API key, so the agent can hand it the diff. |
| A subagent of the same agent | An agent that can run subagents; give it the diff and the review brief, not the author's conclusions. |
| You | Read the diff yourself when no second reviewer is available, and say so in the deploy report. |

The review also needs the deploy directory inside a git repository with at least one commit, and every file in it committed: a deploy ships committed code only.

The review fails closed. No reviewer, uncommitted files, or a directory that is not a git repository stops the deploy before anything uploads. Two waivers exist, each with a reason that goes into the deploy report. The reason is your own words for this deploy, never a stock string:

- "ship uncommitted files" (allow dirty) ships uncommitted files; the model review still runs.
- "ship past the blockers" (waive blockers) ships past model blockers, a reviewer outage or a missing repository, unreviewed. The next deploy reviews the waived span again.

## Prove it works

Needs no Cloudflare account and writes nothing:

```bash
bun <skill>/Tools/CfEnv.ts tail
```

Success is exit 2 and the line `CfEnv: verb "tail" not in allowlist.` followed by the allowed verbs. That proves the allowlist guard is in place before any credential is read.

With the token in place, these two read-only calls prove the credential path:

```bash
bun <skill>/Tools/CfEnv.ts auth whoami
bun <skill>/Tools/CfEnv.ts workers list
```

`auth whoami` prints JSON with `"authenticated": true`, `"authSource": "CLOUDFLARE_API_TOKEN environment variable"` and `"tokenValid": true`, and `workers list` returns your account's Workers (an empty list on a new account).
