---
name: threat-model
description: "Defensive threat modeling of your own estate from a user-provided inventory: sensitive-data map, trust boundaries and prompt-injection surfaces, compromise scenarios with blast radius, STRIDE threat models, and a scored risk register kept by a CLI. Use when the user asks to run a security audit, how exposed am I, threat model X, risk register, risk assessment, what if X got hacked, compromise scenario, blast radius, sensitive data map, data classification, add or accept a risk, risk review, injection surfaces, trust boundaries, or the lethal trifecta. Not for pentesting or any active testing, not for stress-testing an idea (use `red-team` or `research`), not for running incident response."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ for Tools/RiskRegister.ts and Tools/Inventory.ts. No API keys. Optional env: AGENT_SKILLS_HOME, THREATMODEL_DATA_DIR, THREATMODEL_INVENTORY. Offline; any OS bun supports."
---

# threat-model

**Contents:** Setup · Ideal State · Intent Routing · Data & Config (safety gate) · Risk Scoring · Estate Inventory · Continuous review and the parent-risk link · Gotchas · Examples

Threat modeling for the estate you actually run. Three moves: classify where sensitive data lives, simulate compromise of the assets that hold it, and keep the resulting risks in a register that gets reviewed instead of forgotten.

## Setup

- `bun` 1.2+ runs the two CLIs. No account, API key or install step beyond bun.
- Run `bun Tools/RiskRegister.ts init` from the skill folder once to create the private data dir and an empty register.
- Optional but recommended: write `inventory.json` in the data dir (format and example: `References/Inventory.md`), then check it with `bun Tools/Inventory.ts validate`. Without it the intents work from what the user names and say so.
- Optional: `scopes.json` in the data dir (`{ "scopes": ["personal", "acme"] }`), `finders.json` for the audit's read-only checks (`Intents/SecurityAudit.md` § Inputs), and `PREFERENCES.md` (see Data & Config).

## Ideal State

- Every artifact a run produces (data map, scenario, injection map, target model, register entry) sits in the private data dir with no secret value in it, and the skill tree holds code only.
- Impact and likelihood rest on evidence: data classes and what an asset can reach for impact, exposure for likelihood, `Tools/Inventory.ts` output where the user keeps an inventory and a stated hand-built enumeration where they do not.
- Every real risk a run surfaces lands in the register through the CLI with a score, a scope and a review date, so the standing review questions (`References/Continuous.md`) review it instead of it being forgotten.
- The estate is modeled, never touched: no run exploits, scans or changes an asset, and the audit writes none of the registers or inventories it reads.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **SensitiveDataMap** | "where is our sensitive data", "data classification", "which assets hold sensitive data" | `Intents/SensitiveDataMap.md` |
| **CompromiseScenario** | "what if X got hacked", "compromise scenario", "blast radius of X" | `Intents/CompromiseScenario.md` |
| **ThreatModelTarget** | "threat model X", "threat model the estate", "risk assessment of X" | `Intents/ThreatModelTarget.md` |
| **InjectionSurfaceMap** | "prompt injection", "injection surfaces", "where can untrusted content get in", "trust boundaries", "what can inject into the agent", "lethal trifecta" | `Intents/InjectionSurfaceMap.md` |
| **RiskRegister** | "risk register", "add a risk", "risk review", "accept risk", "close risk" | `Intents/RiskRegister.md` |
| **SecurityAudit** | "run a full security audit", "security audit", "how exposed am I", "audit our security", "latest audit" | `Intents/SecurityAudit.md` |

| File | Read when |
|------|-----------|
| `References/Inventory.md` | Writing or reading `inventory.json`, or running any `Tools/Inventory.ts` query |
| `References/Continuous.md` | Setting `--parent-ref` or `scope` on a row, exporting one scope, or running the standing review questions |

## Data & Config (safety gate)

This skill directory is public code, so it never holds data.

- Data dir: `$AGENT_SKILLS_HOME/threat-model/` (default `~/.agent-skills/threat-model/`); `THREATMODEL_DATA_DIR` overrides it. It holds `inventory.json`, `risk-register.json`, the generated `RiskRegister.md`, `scopes.json`, `finders.json`, `EstateDataMap.md`, `InjectionSurfaceMap.md`, threat models, `Scenarios/` and `Audits/`. Both CLIs structurally refuse any data dir that resolves inside this skill's folder or a `skills/` path.
- Register entries reference credentials by env-var name only, never by value. No tokens, keys, or cookies anywhere in threat-model output.
- User preferences, when present, live in `$AGENT_SKILLS_HOME/threat-model/PREFERENCES.md` (default `~/.agent-skills/threat-model/`) and override the defaults here; when absent, the defaults stand. Load and apply it before executing (data locations, sensitive-data class priorities, the user's incident-response runbook location, the audit finders).

## Risk Scoring

`score = likelihood (1-5) × impact (1-5)` → **Low** 1-4 · **Medium** 5-9 · **High** 10-14 · **Critical** 15-25. The CLI computes score and level from the two inputs.

Impact is anchored to data classes and blast radius: an asset whose compromise exposes credentials or customer data starts at impact 4+. A worker with no data of its own routinely inherits a 5 through its bindings.

- 5: credentials to many systems, customer data at scale, or financial/health PII
- 4: credentials to one data-bearing system, or a private data store
- 3: internal-only data, or write access to a public surface
- 2: limited internal exposure
- 1: public-only data, no pivot

Likelihood is anchored to exposure (public URL, auth boundary, patch state, credential hygiene).

## Estate Inventory

When the user keeps `inventory.json` (format: `References/Inventory.md`), intents use it as the current-state source of truth, through read-only queries run from the skill folder:

```bash
bun Tools/Inventory.ts blast <key>     # what relies on this asset
bun Tools/Inventory.ts owns <key>      # what deleting/losing it orphans
bun Tools/Inventory.ts exposed <key>   # which credentials it would leak, priority-ordered
bun Tools/Inventory.ts stores <key>    # which data stores it can reach (depends_on closure)
bun Tools/Inventory.ts injection       # ingestion surfaces by trust class + control coverage
bun Tools/Inventory.ts reach <id>      # what an injection at a surface could ultimately drive
bun Tools/Inventory.ts list [--stores] # census; add --json to any command
```

`exposed` makes the "one hop of trust" step deterministic instead of a judgment call: it returns the credentials an asset holds, transitively through what it owns, compromise-tier first. Pair it with `stores <key>` for the data stores an asset can reach.

If the user has a richer asset graph or CMDB of their own, prefer it and cite it the same way. Without any inventory, intents fall back to what the user enumerates plus repo/config inspection, and say so in the output. Never invent an inventory.

## Continuous review and the parent-risk link

The register is checked by standing review questions at every risk review (or on a schedule the user sets up), and every row can point up to one of the user's top-level risks with `--parent-ref Rn` and carries a `scope`. The questions, the two tiers and the scope export: `References/Continuous.md`.

## Gotchas

- **Unclassified ≠ safe.** An asset with no sensitive-data tag is *unclassified*, never *clean*. Absence of classification is not evidence of absence of data (the absence-metric rule). SensitiveDataMap output must list unclassified assets explicitly.
- **Inventory blast radius is derived evidence.** Inventory queries show what the inventory knows; before treating a blast radius as complete for a high-stakes decision, confirm against the provider's authority API (the inventory can lag or under-model edges).
- **An ingestion surface is an asset.** A place where somebody else's text reaches the agent belongs in the model next to the servers, because the agent holds the user's authority and injected text borrows it. Threat modeling that covers only infrastructure misses the surface class that needs no credential at all.
- **For injection, score the capability, not the surface.** A stranger's comment is worthless text; the risk is the session reading it while holding publish, deploy, and repo-write. Rank by what the deputy can do, and by whether anything blocks rather than merely watches.
- **Persistent beats loud.** A poisoned page ruins a turn. A poisoned memory entry, archive note, ledger row, or log line re-enters context on every later recall with its provenance gone. Untrusted plus persistent plus nothing blocking is the top of every injection list.
- **A concrete, actionable weakness surfaced by a review is also tracked as a finding** in the user's issue tracker or findings list, citing the register id (`R-xxx`): the register keeps the standing risk, the finding tracks the instance to closure with evidence. Opening an issue in a shared tracker is an outside action: confirm the exact text and destination with the user first.

## Examples

**Example 1: Sensitive data sweep**
```
User: "Which of our assets have sensitive data?"
→ SensitiveDataMap: census the inventory, classify each data-bearing asset
→ Writes EstateDataMap.md to the private data dir
→ Returns the classified map + explicit unclassified list
```

**Example 2: Compromise scenario**
```
User: "What happens if our analytics worker gets popped?"
→ CompromiseScenario: blast radius via the inventory, data exposed, attacker next-steps,
  detection signals, response plan
→ Scenario doc to private data dir; risks added to register with scores
```

**Example 3: Risk review**
```
User: "Run a risk review"
→ RiskRegister: lists overdue + open risks by score, walks disposition
  (mitigate / accept / close), updates review dates
```
