# Checkup.ts

Gathers the local evidence about one app into one read-only bundle for the Checkup intent.

```
bun Checkup.ts <repo> [--spec <path>] [--since 14d] [--name <alias>]... [--monitor <file>] [--json]
```

| Flag | Meaning |
|---|---|
| `<repo>` | The app's repo root. |
| `--spec <path>` | The spec, when it is not `<repo>/SPEC.md`. |
| `--since <n>h\|d\|w` | Signal window for git. Default `14d`. |
| `--name <alias>` | Another name the app is monitored or reported under; repeatable. The spec's `slug`, `project` and the repo folder name are always used. |
| `--monitor <file>` | The app's own health-check results as JSON: `{ "status": "red", "failing": ["AC-3"] }`, or a map of app name to that shape. |
| `--json` | The full bundle instead of the one-screen summary. |

Sources: `SpecCheck.ts bar`, `write-probes` and `conform`, git, `Inventory.ts sync`, and the `--monitor` file. Each runs as its own process with a two-minute timeout. A source that fails is listed under `unavailable` and never read as clean. Alerts, bug reports and security findings are always listed under `unavailable`: the Checkup run gathers them by hand (`Intents/Checkup.md` § Inputs).

Monitor entries are matched by whole-word name, so read each one before acting on it.

Exit codes: 0 gathered, 2 bad input.
