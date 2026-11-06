# Estate inventory (`inventory.json`)

The inventory is the user's own description of the estate: the assets, the data they hold, the credentials they carry, how they depend on each other, where outside text reaches the agent, and the user's top-level risks. The intents read it through `Tools/Inventory.ts`, which never writes it. The user (or the agent, at the user's request and with each entry confirmed) keeps it current.

- **Location:** `$AGENT_SKILLS_HOME/threat-model/inventory.json` (default `~/.agent-skills/threat-model/inventory.json`). `THREATMODEL_DATA_DIR` moves the whole data dir; `THREATMODEL_INVENTORY` points at an inventory file somewhere else.
- **No inventory:** every intent still runs. It enumerates what the user names plus repo and config inspection, and the output says the coverage is hand-built, not inventory-complete. Never invent an inventory.
- **No secrets:** credentials appear by name only (env-var name, vault item title). Never a value, token, key or cookie.
- **Derived evidence:** the queries show what the inventory knows. It can lag the real estate or miss edges; before a high-stakes decision, confirm critical edges against the provider's own console or API.

## Shape

```json
{
  "version": 1,
  "updated": "2026-11-01",
  "assets": [
    {
      "key": "worker:analytics",
      "kind": "worker",
      "name": "Analytics ingest worker",
      "data_classes": [],
      "credentials": [
        { "name": "STRIPE_SECRET_KEY", "priority": "CRITICAL", "vendor": "Stripe" },
        { "name": "SENTRY_DSN", "priority": "LOW" }
      ],
      "exposure": "public-url",
      "depends_on": ["db:events"],
      "owns": ["kv:cache"],
      "notes": "Deployed from repo:acme/analytics"
    },
    { "key": "db:events", "kind": "database", "data_classes": ["pii", "customer-data"] },
    { "key": "kv:cache", "kind": "kv", "credentials": [{ "name": "CF_API_TOKEN", "priority": "HIGH" }] }
  ],
  "surfaces": [
    { "id": "github-issues", "name": "Issues and comments on public repos", "trust": "untrusted", "channel": "repo",
      "persists": true, "authenticated": false, "controls": [], "notes": "Read by the triage routine" }
  ],
  "capabilities": [
    { "id": "publish", "name": "Push to public repos", "blast": "public", "reversible": false, "controls": ["perm-ask"] }
  ],
  "controls": [
    { "id": "perm-ask", "name": "Agent permission prompt before push", "mode": "human-gate", "fail_open": false },
    { "id": "data-not-instructions", "name": "Rule: fetched text is data", "mode": "advisory", "fail_open": true }
  ],
  "top_risks": [
    { "id": "R0", "title": "A prompt injection borrows the agent's authority" }
  ]
}
```

## Fields

### `assets[]`

| Field | Required | Meaning |
|---|---|---|
| `key` | yes | Stable id, `<kind>:<name>` by convention (`worker:analytics`, `db:customers`, `repo:acme/site`, `host:nas`). Register rows and scenario docs cite it. |
| `kind` | yes | `worker`, `domain`, `database`, `bucket`, `kv`, `repo`, `project`, `host`, `saas`, ... Kinds `database`, `db`, `bucket`, `kv`, `d1`, `r2`, `store`, `queue`, `vault` count as data stores. |
| `store` | no | `true` marks a data store whose kind is not in that list. |
| `data_classes` | no | Classes the asset holds (see `Intents/SensitiveDataMap.md`). Empty or absent means **unclassified**, never clean. |
| `credentials[]` | no | `name` (required), `priority` (`CRITICAL` = compromise tier, then `HIGH`, `MEDIUM`, `LOW`, `DEFER`, `ORPHAN`, `UNKNOWN`), `vendor`, `reaches` (free-text systems it unlocks), `notes`. |
| `exposure` | no | Free text that anchors likelihood: `public-url`, `auth-boundary`, `internal`, `local`, ... |
| `depends_on` | no | Keys this asset operationally relies on (the data stores it reads or writes, the services it calls). |
| `owns` | no | Keys that are orphaned when this asset is deleted or lost. Credentials of owned assets count as exposed by the owner. |
| `name`, `notes` | no | Free text. |

### `surfaces[]` (ingestion surfaces: where someone else's text reaches the agent)

| Field | Meaning |
|---|---|
| `id` | Stable slug; queries accept `<id>` or `ingest:<id>`. |
| `trust` | `user` (the user's own channel, the only source of commands), `semi` (a known human or vetted party, still not an authority for actions), `untrusted` (anybody on the internet can author it). |
| `channel` | `web`, `mail`, `chat`, `feed`, `repo`, `mcp`, `sensor`, `file`, `memory`, `voice`, ... |
| `persists` | Does content from here survive the session (memory, archive, ledger, database, log)? The class that matters most. |
| `authenticated` | Is there an identity barrier on the sender, or can anyone author into it? |
| `controls` | Control ids standing between this surface and the agent's context. |
| `reaches` | Optional capability ids. Absent means every capability: one agent context holds them all. |

### `capabilities[]` (what the agent can do once text is in its context)

`id`, `name`, `blast` (`self`, `local`, `estate`, `public`, `money`, `physical`), `reversible` (can the user undo it without outside help?), `controls` (control ids that gate it).

### `controls[]`

`id`, `name`, `mode` (`blocking`, `advisory`, `human-gate`), `fail_open` (does it degrade to nothing on error?), `impl` (where it lives, optional). A surface or capability is **governed** when at least one of its controls is `blocking` or `human-gate` and not fail-open, **advisory-only** when its only controls watch or fail open, and **UNGOVERNED** when it has none.

### `top_risks[]`

The user's top-level risk list, the parent tier above the estate register (`References/Continuous.md` § Two tiers). `id` is `R0`, `R1`, ... (zero-indexed, no dash, never renumbered); `title` is one line. `RiskRegister.ts --parent-ref Rn` is validated against this list when it is present.

## Queries

```bash
T="bun Tools/Inventory.ts"     # run from the skill folder; every command takes --json
$T validate                    # duplicate keys, dangling references, bad enums (exit 1 on any)
$T list [--kind K] [--stores]  # assets; --stores = data stores only
$T unclassified                # assets with no data classes
$T blast <key>                 # what relies on this asset
$T owns <key>                  # what deleting or losing it orphans
$T exposed <key>               # which credentials it would leak, compromise tier first
$T stores <key>                # data stores it can reach (depends_on closure)
$T injection                   # ingestion surfaces by trust class + control band, and the capabilities
$T reach <surface-id>          # what an injection at that surface could ultimately drive
$T top-risks                   # the parent risk list
```

`exposed` makes the "one hop of trust" step deterministic instead of a judgment call. Pair it with `stores <key>` for the data stores an asset can reach.

## What the inventory cannot see

Vendor-only OAuth grants, SSH keys, browser sessions, password managers, and any asset nobody wrote down. Name them in each scenario and data map as gaps, not as absence of exposure.
