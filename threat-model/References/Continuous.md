# Continuous review and the two register tiers

How the estate register is watched after a run, and how it sits under the user's top-level risk list.

## Continuous (the register is watched, not remembered)

The register is checked by three standing questions. Ask them at every risk review (`Intents/RiskRegister.md`) and at every security audit. If the user wants them watched between reviews, they can run the same commands on a schedule of their own (cron, CI, a calendar reminder); this skill does not install one. Each question fails loudly, and a question that keeps failing becomes a tracked item in the user's own issue tracker or task list (confirm the exact item with the user before you create it in a shared tracker):

| Ref | Question | Fails when | How to answer it |
|---|---|---|---|
| `overdue-review` | Is any open risk past its review date, or missing one? | any open row has `review_by` empty or ≤ today | `bun Tools/RiskRegister.ts review` prints a non-empty list |
| `unowned-high` | Is any open High/Critical without an owner or a mitigation? | any such row has no owner or an empty mitigations list | `bun Tools/RiskRegister.ts list --json`: an open row with `level` High or Critical and an empty `owner` or `mitigations` |
| `new-stores` | Has a data store appeared since the sensitive data map was generated? | a data store in the inventory is not named in `EstateDataMap.md`, or was added after the map's generated date | `bun Tools/Inventory.ts list --stores --json`, compared with the keys in `EstateDataMap.md`; a hit is the trigger for re-running SensitiveDataMap and scoring the new store |

`bun Tools/Inventory.ts injection` watches the InjectionSurfaceMap the same way (`injection-ungoverned`: untrusted ingest surfaces with no active control). The questions only make sure a human reviews, rescores, and classifies. A per-risk falsifier that needs evidence nobody collects yet stays an `unanswerable` row in the review, never a fake probe.

## Two tiers: the top-level risk list above, the estate register below

The estate register is the operational layer under the user's top-level risk list: the few scenarios most likely to knock the user or their business off course, across every domain (security, money, health, reputation, ...). It lives in `inventory.json` as `top_risks` (ids `R0`, `R1`, … — zero-indexed, no dash, never renumbered; format in `References/Inventory.md`). `bun Tools/Inventory.ts top-risks` lists it. If the user keeps that list elsewhere (a risk document, a GRC tool), mirror the ids and titles into `top_risks` so the CLI can validate links.

- An estate row points up with `--parent-ref Rn` (`add`/`update`); the CLI checks the id exists in `top_risks` when the inventory lists any. Estate ids are `R-NNN`, so the two shapes never collide.
- A review here that changes a row's level or mitigation state is also a prompt to re-read the parent `Rn` entry with the user.

**Scope.** Every row carries `scope` (values and the assignment rule in `Intents/RiskRegister.md` § Tool contract; legacy rows read as `personal`). One register serves the user's own life and their business; `render --scope <s>` prints one scope's rows as a standalone markdown register for export into that entity's own governance surface. This skill never performs that export itself: the user takes the rendered markdown where it belongs, and only for non-personal scopes.
