#!/usr/bin/env bun
/**
 * Inventory.ts — read-only queries over the user's estate inventory (inventory.json).
 *
 * The inventory is hand-kept by the user (format: References/Inventory.md); this tool
 * never writes it. Answers are derived evidence: they show what the inventory knows.
 *
 *   validate                    dangling references, duplicate keys, bad enums (exit 1 on any)
 *   list [--kind K] [--stores]  assets, optionally only one kind or only data stores
 *   unclassified                assets with no data classes (never "clean")
 *   blast <key>                 what relies on <key> (reverse depends_on closure)
 *   owns <key>                  what deleting or losing <key> orphans (owns closure)
 *   stores <key>                data stores <key> can reach (depends_on closure)
 *   exposed <key>               credentials <key> would leak, compromise tier first
 *   injection                   ingestion surfaces + capabilities with their control bands
 *   reach <surface-id>          capabilities an injection at that surface could drive
 *   top-risks                   the user's top-level risk list (parents for --parent-ref)
 *
 * Every command takes --json.
 */

import { blast, band, dataStores, exposed, inventoryPath, isStore, loadInventory, owns, reach, validate, type Asset, type Inventory } from "./lib/inventory.ts";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const args = argv.filter((a) => a !== "--json");
const [cmd, ...rest] = args;
const flag = (name: string): string | undefined => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

function print(data: unknown, text: string): void {
  console.log(asJson ? JSON.stringify(data, null, 2) : text);
}

const assetLine = (a: Asset) => `${a.key.padEnd(32)} ${a.kind.padEnd(10)} ${(a.data_classes?.length ? a.data_classes.join(",") : "UNCLASSIFIED").padEnd(28)} ${a.exposure ?? "—"}`;

function need(inv: Inventory, key: string | undefined): string {
  if (!key) {
    console.error(`usage: Inventory.ts ${cmd} <key>`);
    process.exit(2);
  }
  if (!inv.assets.some((a) => a.key === key) && !inv.surfaces.some((s) => s.id === key || `ingest:${s.id}` === key))
    console.error(`warning: ${key} is not in the inventory; check the key`);
  return key;
}

function main(): number {
  const path = inventoryPath();
  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(`Inventory: read-only queries over ${path}\n  validate | list [--kind K] [--stores] | unclassified | blast <key> | owns <key> | stores <key> | exposed <key> | injection | reach <surface-id> | top-risks   (all take --json)`);
    return 0;
  }
  let inv: Inventory | null;
  try {
    inv = loadInventory(path);
  } catch (e) {
    console.error(`ERROR: cannot read ${path}: ${(e as Error).message}`);
    return 2;
  }
  if (!inv) {
    console.error(`no inventory at ${path}. Write one (References/Inventory.md), or enumerate the estate by hand and say so in the output.`);
    return 2;
  }

  switch (cmd) {
    case "validate": {
      const errs = validate(inv);
      print({ ok: errs.length === 0, errors: errs, path }, errs.length ? errs.join("\n") : `ok: ${inv.assets.length} assets, ${inv.surfaces.length} surfaces, ${inv.capabilities.length} capabilities, ${inv.controls.length} controls, ${inv.top_risks.length} top risks`);
      return errs.length ? 1 : 0;
    }
    case "list": {
      const kind = flag("kind");
      const rows = inv.assets.filter((a) => (!kind || a.kind === kind) && (!rest.includes("--stores") || isStore(a)));
      print(rows, rows.map(assetLine).join("\n") || "(no assets)");
      return 0;
    }
    case "unclassified": {
      const rows = inv.assets.filter((a) => !a.data_classes?.length);
      print(rows, rows.length ? `${rows.map(assetLine).join("\n")}\n${rows.length} unclassified asset(s): unclassified is not clean.` : "(every asset carries data classes)");
      return 0;
    }
    case "blast":
    case "owns":
    case "stores": {
      const key = need(inv, rest[0]);
      const rows = cmd === "blast" ? blast(inv, key) : cmd === "owns" ? owns(inv, key) : dataStores(inv, key);
      const what = { blast: "rely on", owns: "are orphaned by losing", stores: "are data stores reachable from" }[cmd];
      print(rows, `${rows.map(assetLine).join("\n")}\n${rows.length} asset(s) ${what} ${key}. Derived from the inventory; confirm critical edges with the provider before treating this as complete.`);
      return 0;
    }
    case "exposed": {
      const key = need(inv, rest[0]);
      const rows = exposed(inv, key);
      const crit = rows.filter((r) => r.priority === "CRITICAL").length;
      print(rows, `${rows.map((r) => `${r.priority!.padEnd(9)} ${r.name.padEnd(28)} held by ${r.holder}${r.vendor ? `  (${r.vendor})` : ""}`).join("\n")}\n${rows.length} credential(s) exposed, ${crit} compromise-tier. Rotation order is this list, top down.\nContain the asset BEFORE rotating: rotating into a live foothold just hands over the new value.`);
      return 0;
    }
    case "injection": {
      if (!inv.surfaces.length) {
        console.error("no ingestion surfaces in the inventory: add them (References/Inventory.md) or enumerate by hand");
        return 1;
      }
      const surfaces = inv.surfaces.map((s) => ({ surface: `ingest:${s.id}`, name: s.name, trust: s.trust, channel: s.channel, persists: s.persists, authenticated: s.authenticated, band: band(inv!, s.controls ?? []), controls: s.controls, notes: s.notes ?? "" }));
      const capabilities = inv.capabilities.map((c) => ({ ...c, band: band(inv!, c.controls ?? []) })).sort((a, b) => Number(a.reversible) - Number(b.reversible));
      const untrusted = surfaces.filter((r) => r.trust === "untrusted");
      const ungoverned = untrusted.filter((r) => r.band === "UNGOVERNED");
      const durable = untrusted.filter((r) => r.persists && r.band !== "governed");
      const text = [
        ...surfaces.map((r) => `${r.surface.padEnd(30)} ${r.trust.padEnd(9)} ${r.channel.padEnd(8)} ${r.persists ? "persists" : "        "} ${r.band}`),
        "",
        ...capabilities.map((c) => `capability:${c.id.padEnd(20)} blast:${c.blast.padEnd(9)} ${c.reversible ? "reversible  " : "IRREVERSIBLE"} ${c.band}`),
        "",
        `${surfaces.length} surface(s), ${untrusted.length} untrusted, ${ungoverned.length} ungoverned.`,
        `${durable.length} untrusted+persistent surface(s) with nothing blocking: injected text there outlives the session.`,
        "Every surface reaches every capability unless its `reaches` list says otherwise; the control column is what varies. Rank remediation by it.",
      ].join("\n");
      print({ surfaces, capabilities }, text);
      return 0;
    }
    case "reach": {
      const id = need(inv, rest[0]);
      const rows = reach(inv, id);
      const irrev = rows.filter((r) => !r.reversible).length;
      print(rows, `${rows.map((c) => `${c.id.padEnd(24)} blast:${c.blast.padEnd(9)} ${c.reversible ? "reversible  " : "IRREVERSIBLE"} ${c.band}`).join("\n")}\n${rows.length} capability/ies reachable, ${irrev} of them irreversible.`);
      return 0;
    }
    case "top-risks": {
      print(inv.top_risks, inv.top_risks.map((r) => `${r.id.padEnd(5)} ${r.title}`).join("\n") || "(no top_risks in the inventory)");
      return 0;
    }
    default:
      console.error(`unknown command ${cmd}; run with --help`);
      return 2;
  }
}

if (import.meta.main) process.exit(main());
