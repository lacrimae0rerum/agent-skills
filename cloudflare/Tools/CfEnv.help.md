# CfEnv — Cloudflare credential-scoped cf runner

**Single purpose.** Run one cf CLI command with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` injected into that child process only. They come from the environment or from `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`; a real env var wins), and only those two keys are taken from the file. The parent shell is untouched. The verb allowlist is hard-coded; anything outside it exits 2 and points back to the Deploy intent.

**Not a generic wrapper.** If you want to call it from outside the Deploy, Query or Troubleshoot intents, the intent needs a new branch, not a bigger allowlist.

## Usage

Run from the project directory, with `<skill>` the folder of the cloudflare skill:

```bash
bun <skill>/Tools/CfEnv.ts <cf args>        # a leading "cf" is accepted and ignored
bun <skill>/Tools/CfEnv.ts deploy [--dry-run] [--message <why>] [--secrets-file <file>] [--drop-secret NAME]
bun <skill>/Tools/CfEnv.ts secret put NAME --name <worker> [--from-env [ENV_KEY]]
```

## Allowed verbs

`analytics`, `auth`, `build`, `cache`, `d1`, `deploy`, `dns`, `kv`, `observability`, `pages`, `queues`, `r2`, `secret`, `vectorize`, `workers`, `zero-trust` (Access and the two org/identity-provider list reads only), `zones`

## Behavior worth knowing

- `secret put` becomes `cf workers secrets update`, with the value sent in the request body on stdin (`--body @/dev/stdin`). The value is never an argument, never printed, and never returned. `--from-env` reads it from the environment or the env file; otherwise it comes from CfEnv's stdin. `--dry-run` is refused for every `secret put`, before stdin or any credential is read, because cf's dry-run prints the body.
- A `deploy` (dry run included) in a directory with `cloudflare.config.ts` first checks secrets: every live secret must be declared as `NAME: bindings.secret()` (or released with `--drop-secret NAME`), and every declared secret needs a value on the newest version or in `--secrets-file`. A real deploy re-checks after the upload and exits 10 when a declared secret was lost, with the rollback command.
- After a real Worker deploy it prints the live version ID and the previous one.
- Throttling (API 971 / HTTP 429) is waited out and retried up to five times; a dropped connection retries only a deploy.
- Every cf call runs the pinned `CF_PACKAGE` from its installed bin under `$AGENT_SKILLS_HOME/cloudflare/cf/` (`Tools/CfBin.ts`; the first call for a pin installs it with `bun add`), never through `bunx` and never the global `cf`.
- CfEnv does not review code and does not ask for confirmation: the Deploy intent's review and confirmation steps run before you call it.
- Exit code mirrors cf's; 2 is a refusal before anything ran; 10 is "live, but a check after the deploy failed".

## Why this shape

1. **Raw `cf` from the agent shell** runs on whatever token the shell exports (for example a shell profile that exports `.env`) or on a stale OAuth login, outside CfEnv's allowlist and secrets check.
2. **Sourcing the env file in the shell** leaks every secret into every later child process.
3. **A generic credential wrapper** gives prompt injection a one-call path to the whole Cloudflare API.

Discovery commands (`cf cli search`, `cf schema`, `--help`) need no credentials and run as plain `cf`.
