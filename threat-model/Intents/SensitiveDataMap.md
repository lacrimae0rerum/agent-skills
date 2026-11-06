# SensitiveDataMap

Produce a classified map of which assets in the estate hold sensitive data, written to the private data dir.

## Ideal State

- An `EstateDataMap.md` exists in the data dir where every data-bearing asset is tagged with the data classes it holds and why.
- Every asset that cannot be classified from evidence is listed explicitly as `unclassified` and surfaced for follow-up — never omitted, never assumed clean.
- Every data store (database, bucket, KV) and every asset holding credentials is in the map, classified or on the unclassified list, because they anchor impact scoring in scenarios and the register.
- Without an inventory, the output states that coverage is user-enumerated, not inventory-complete.
- The close reports the count by data class, the highest-sensitivity assets, and the unclassified list, and offers CompromiseScenario on the top data-bearing assets and to land standing risks in the register.

## Anti-criteria

- Credential stores are referenced by name/key only.
- The map is always named `EstateDataMap.md` in the data dir, so the `new-stores` review question and later scenarios find it; never a generic name such as `DataClassification` that may collide with the user's own policy documents.

## Output format

An `EstateDataMap.md` in the data dir: one entry per data-bearing asset with its data classes and why, and every unclassified asset listed as unclassified. The map is the input to scoring impact in scenarios and the register.

Data classes (extend per `PREFERENCES.md`): `credentials` · `pii` · `financial` · `health` · `customer-data` · `source-private` · `internal-only` · `public`.

## Inputs

If the estate scope is unclear (whole estate vs one app vs one provider) and the choice changes the output, emit one ambiguity flag and proceed with "whole estate via the inventory." `proceed` accepts.

## Tool contract

Prefer the inventory if present:

```bash
bun Tools/Inventory.ts list --stores --json   # data stores first
bun Tools/Inventory.ts list --json            # every asset, with its data classes
bun Tools/Inventory.ts unclassified           # assets with no data classes: list them, never drop them
```

Classes the map establishes from evidence can be proposed to the user as `data_classes` updates to `inventory.json`; the user confirms each before the inventory changes.

Without an inventory: enumerate from what the user names plus repo/config inspection, and state in the output that coverage is user-enumerated, not inventory-complete.
