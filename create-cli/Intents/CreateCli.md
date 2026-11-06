# CreateCli

**Contents:** Ideal State · Anti-criteria · Inputs · Tool contract · Output format · Examples · References

A complete, immediately usable, production-quality TypeScript CLI generated from requirements at the right tier, following CLI-First Architecture.

## Ideal State

- The CLI matches the request: a kebab-case name (`ghcli`, `md2html`), a one-sentence purpose, the commands and arguments asked for, the wrapped API or service, its authentication method (usually an API key, a Bearer token or OAuth), its environment variables and its configuration flags. Nothing in it is guessed: where the request left the API, the commands, the authentication or the install location open, the CLI reflects the user's answer.
- The tier follows the Tier 2 indicators listed in SKILL.md: Tier 2 (Commander.js) only when one holds, Tier 1 otherwise and whenever the choice is uncertain, since UpgradeTier moves a CLI up later.
- The CLI directory (`<tools-folder>/[cli-name]/` for a personal CLI, where `<tools-folder>` is Config.md's `Tools folder:` or the user's answer; `~/Projects/[project-name]/` or another path inside the project repo for a project CLI) holds the executable `[cli-name].ts` (`chmod +x`), a Bun `package.json`, a strict-mode `tsconfig.json`, an `.env.example` listing every required variable, `README.md` and `QUICKSTART.md`.
- The source is type-safe throughout: interfaces for the API responses, data structures and config, strict mode, no `any` types, and one function per command with input validation and error handling, in the Tier 1 structure (configuration, command functions, help documentation, main entry point).
- Configuration loads from the expected location (for a CLI that reads secrets, the process environment first and then the one env file the CLI documents, default `~/.config/[cli-name]/.env`, through the `loadConfig()` under Output format), and a missing required variable exits 1 with a message naming the variable and where to set it.
- Behavior is exposed through configuration flags, not hardcoded values: output flags (`--format json`, `--quiet`, `--verbose`; a `--format` flag defaulting to json is standard Tier 1 output control, and only multiple output format engines make a CLI Tier 2), mode flags (`--fast`, `--thorough`, `--dry-run`) where applicable and resource flags such as `--model` if applicable; sensible defaults work without any flag, and every flag is documented in `--help`.
- Output is deterministic and composable: valid JSON to stdout (`| jq empty` passes), errors and messages to stderr, exit code 0 on success and 1 on error, and every error message says what failed and how to fix it.
- `bun run <cli> --help` prints every command with real usage examples, not just flag descriptions, plus the output contract, configuration and philosophy; `--version` shows the version; every command listed in help is implemented and works with test inputs.
- README.md explains why the CLI exists, not just how to use it, and has a philosophy section; QUICKSTART.md has the common examples.
- A CLI reported created compiles under strict `tsc` (`bunx tsc --noEmit` exits 0 in the CLI directory; the other validation commands do not prove it compiles), and its `--help` and `--version` print.
- A CLI for a public-facing app (SKILL.md § Ideal State, the agent-first contract) also meets each item of that contract, and these govern where they differ from the output bullets above:
  - `login` runs a browser device-authorization flow: the CLI shows a short user code and an authorize URL, the signed-in user approves it, and the CLI receives a named, scoped (`read`, `write`), expiring API key that it stores in a per-user config file and never echoes.
  - The device flow resists phishing and grinding: user codes are single-use and expire within minutes, only a hash of the device code and of every key is stored, polling faster than the stated interval is slowed, and start, poll and failed authentication are rate-limited per IP.
  - Piped or with `--json`, stdout carries only stable JSON and errors go to stderr as JSON, with fixed exit codes per failure class (usage, auth, rate limited, server or network) listed in the help and the docs.
  - `help --json` emits the full command catalog, `/docs/cli` renders its command list from that catalog, and a test fails when a command has no docs entry.
  - Every API response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`, every 429 carries `Retry-After`, and limits apply per key and per IP.
  - Install is self-hosted: the install script checks the bundle against its published SHA-256 before installing, and `update` replaces the CLI the same way.
- When the CLI will be called by intents, the intent-to-flag mapping pattern is documented and the flag names match the standard conventions in `References/CliFirstArchitecture.md`.

## Anti-criteria

- No Tier 2 (Commander.js) CLI when the user doesn't explicitly need Tier 2 features.
- A public-app CLI never stores or logs a raw API key or device code, in the CLI, the audit log, console output or error bodies.
- Never reads secrets from a guessed or undocumented env-file path (a path the user never set up fails silently on other machines), and never parses an env value with `.split('=')[1]`, which truncates values that contain '='.
- No `any` types, and no error message that just says "Error" without explaining what failed and how to fix it.

## Inputs

When the request leaves them open, ask what API or service the CLI wraps, its main commands, how it should authenticate, where it should be installed (personal or project-specific), and for the API documentation or a typical response, which shapes the interfaces.

## Tool contract

Validation, run in the CLI directory before reporting (`<create-cli>` is this skill's folder):

```bash
cd <tools-folder>/{{CLI_NAME}}/   # or the project CLI directory
chmod +x {{CLI_NAME}}.ts
bunx tsc --noEmit    # must exit 0; this is what "compiles without errors" means
./{{CLI_NAME}}.ts --help
./{{CLI_NAME}}.ts --version
bun <create-cli>/Tools/CheckCli.ts . --json-args "{{EXAMPLE_COMMAND}}"   # exit 0 = tsc, help, version, unknown-command and JSON checks pass
```

## Output format

The generated `[cli-name].ts` has four sections: configuration, command functions, help documentation, main entry point. `{{PLACEHOLDERS}}` below are filled from the requirements.

### loadConfig()

The one correct env-loading shape (SKILL.md § Gotchas). It needs `existsSync` and `readFileSync` from `node:fs`, `homedir` from `node:os` and `join` from `node:path`; `{{ENV_FILE}}` is the env-file path the CLI documents in its README and `--help`, and `{{CLI_ENV_PREFIX}}_ENV_FILE` lets the user point it elsewhere:

```typescript
// ============================================================================
// Configuration
// ============================================================================

const DEFAULTS = {
  baseUrl: '{{API_BASE_URL}}',
  limit: 20,
  {{ADDITIONAL_DEFAULTS}}
} as const;

/**
 * Load configuration from environment
 */
function loadConfig(): Config {
  // The process environment wins; then the one documented env file
  // ({{ENV_FILE}}, default ~/.config/{{CLI_NAME}}/.env). Never guess other paths.
  const envPath = process.env.{{CLI_ENV_PREFIX}}_ENV_FILE ?? join(homedir(), '.config', '{{CLI_NAME}}', '.env');

  let apiKey = process.env.{{ENV_VAR_NAME}};
  if (!apiKey && existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    // slice past the first '=' only — .split('=')[1] truncates values that
    // themselves contain '=' (e.g. base64 keys with padding).
    apiKey = envContent
      .split('\n')
      .find(line => line.startsWith('{{ENV_VAR_NAME}}='))
      ?.slice('{{ENV_VAR_NAME}}='.length)
      ?.trim()
      ?.replace(/^["']|["']$/g, '');
  }

  if (!apiKey) {
    console.error(`Error: {{ENV_VAR_NAME}} is not set`);
    console.error(`Export {{ENV_VAR_NAME}} or add {{ENV_VAR_NAME}}=... to ${envPath}`);
    process.exit(1);
  }

  return {
    apiKey,
    baseUrl: DEFAULTS.baseUrl,
    {{ADDITIONAL_CONFIG}}
  };
}
```

### Report

```
✅ CLI Created: {{CLI_DIR}}/

Files generated:
- {{CLI_NAME}}.ts ({{LINE_COUNT}} lines)
- package.json
- tsconfig.json
- .env.example
- README.md
- QUICKSTART.md

Commands available:
- {{CLI_NAME}} {{COMMAND}}               # {{COMMAND_DESCRIPTION}}
- {{CLI_NAME}} --help                    # Show full help

Next steps:
1. Configure: export {{ENV_VAR_NAME}} or add it to {{ENV_FILE}}
2. Test: ./{{CLI_NAME}}.ts --help
3. Use: ./{{CLI_NAME}}.ts {{EXAMPLE_COMMAND}}

Documentation: {{CLI_DIR}}/README.md
```

## Examples

```
User: "CLI for GitHub API with repos, issues, search commands"
→ 3 commands (< 10), no subcommands, simple arguments, API wrapper
= TIER 1

User: "CLI to convert markdown to various formats" (md-convert html | pdf | extract-links | stats)
= TIER 1 (file I/O, simple transformations)

User: "Create a CLI for the Notion API to list databases and create pages"
= TIER 1; reported as notioncli with notioncli databases, notioncli create-page <db-id>, notioncli search <query>, and NOTION_API_KEY in .env.example
```

## References

- `Intents/AddCommand.md` adds more commands to an existing CLI; `Intents/UpgradeTier.md` migrates Tier 1 → Tier 2 when the CLI grows complex.
- No test-suite or distribution intent exists yet; add tests by hand with `bun test ./<path>`.
- The tier rule is SKILL.md § Tiers; framework trade-offs are in `FrameworkComparison.md`.
- The reference implementation of the public-app agent-first contract is the CLI named by `Reference CLI:` in `$AGENT_SKILLS_HOME/create-cli/Config.md` (default `~/.agent-skills/create-cli/`). When it is set, match its command catalog, device login, exit codes and install script rather than inventing new shapes; when it is unset, build to the contract as written in SKILL.md § Ideal State.
- Flag conventions: `References/CliFirstArchitecture.md` (Configuration Flags section).
