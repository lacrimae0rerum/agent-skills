/**
 * inventory: the user's estate inventory, read-only, plus the graph queries the intents use.
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt)
 *
 * The asset-graph queries (blast, owns, exposed, injection, reach) and the parent risk
 * list come from one hand-kept JSON file instead of a collector-fed asset graph.
 * Format: References/Inventory.md.
 *
 * Data dir: $THREATMODEL_DATA_DIR, else $AGENT_SKILLS_HOME/threat-model (default
 * ~/.agent-skills/threat-model). Inventory: $THREATMODEL_INVENTORY, else <data dir>/inventory.json.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { expandHome, skillDataDir, skillRoot } from "../_portable/paths.ts";

export const SKILL = "threat-model";

/** The private data dir. Refuses (exit 2) any dir inside a skills/ path or inside this skill's folder. */
export function resolveDataDir(): string {
  const env = process.env.THREATMODEL_DATA_DIR;
  const dir = env ? resolve(expandHome(env)) : skillDataDir(SKILL, false);
  const probe = existsSync(dir) ? realpathSync(dir) : dir;
  const root = realpathSync(skillRoot(import.meta.url));
  const rel = relative(root, probe);
  const insideSkill = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (insideSkill || probe.split(sep).includes("skills")) {
    console.error(`ERROR: data dir ${probe} is inside a skill folder or a skills/ path; code and data stay separate. Set THREATMODEL_DATA_DIR outside it.`);
    process.exit(2);
  }
  return dir;
}

export function inventoryPath(): string {
  const env = process.env.THREATMODEL_INVENTORY;
  return env ? resolve(expandHome(env)) : join(resolveDataDir(), "inventory.json");
}

export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "DEFER" | "ORPHAN" | "UNKNOWN";
export const PRIORITY_ORDER: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "DEFER", "ORPHAN", "UNKNOWN"];

/** A credential an asset holds, by name only (env-var name, vault item title). Never a value. */
export interface Credential { name: string; priority?: Priority; vendor?: string; reaches?: string[]; notes?: string }

export interface Asset {
  key: string; // e.g. "worker:analytics", "db:customers", "repo:acme/site"
  kind: string; // worker, domain, database, bucket, kv, repo, project, host, saas, ...
  name?: string;
  data_classes?: string[]; // empty or absent = unclassified
  credentials?: Credential[];
  exposure?: string; // public-url, auth-boundary, internal, local ...
  depends_on?: string[]; // keys this asset relies on (data stores it reads or writes)
  owns?: string[]; // keys that are orphaned if this asset is deleted or lost
  store?: boolean; // true for data stores whose kind is not in STORE_KINDS
  notes?: string;
}

export type Trust = "user" | "semi" | "untrusted";
export type ControlMode = "blocking" | "advisory" | "human-gate";
export interface Surface { id: string; name: string; trust: Trust; channel: string; persists: boolean; authenticated: boolean; controls: string[]; reaches?: string[]; notes?: string }
export interface Capability { id: string; name: string; blast: string; reversible: boolean; controls: string[] }
export interface Control { id: string; name: string; mode: ControlMode; fail_open?: boolean; impl?: string }
export interface TopRisk { id: string; title: string }

export interface Inventory {
  version: 1;
  updated?: string;
  assets: Asset[];
  surfaces: Surface[];
  capabilities: Capability[];
  controls: Control[];
  top_risks: TopRisk[];
}

export const STORE_KINDS = new Set(["database", "db", "bucket", "kv", "d1", "r2", "store", "queue", "vault"]);
export const isStore = (a: Asset): boolean => a.store === true || STORE_KINDS.has(a.kind);

/** Loads the inventory; null when the file does not exist. Throws on a malformed file. */
export function loadInventory(path = inventoryPath()): Inventory | null {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Inventory>;
  if (raw.version !== 1) throw new Error(`${path}: "version" must be 1`);
  return {
    version: 1,
    updated: raw.updated,
    assets: raw.assets ?? [],
    surfaces: raw.surfaces ?? [],
    capabilities: raw.capabilities ?? [],
    controls: raw.controls ?? [],
    top_risks: raw.top_risks ?? [],
  };
}

/** Problems that make query answers wrong: duplicate keys, dangling references, bad enums. */
export function validate(inv: Inventory): string[] {
  const errs: string[] = [];
  const keys = new Set<string>();
  for (const a of inv.assets) {
    if (!a.key || !a.kind) errs.push(`asset ${JSON.stringify(a.key ?? a)}: key and kind are required`);
    if (keys.has(a.key)) errs.push(`asset ${a.key}: duplicate key`);
    keys.add(a.key);
    for (const c of a.credentials ?? []) if (c.priority && !PRIORITY_ORDER.includes(c.priority)) errs.push(`asset ${a.key}: credential ${c.name} priority ${c.priority} not in ${PRIORITY_ORDER.join("|")}`);
  }
  for (const a of inv.assets) for (const k of [...(a.depends_on ?? []), ...(a.owns ?? [])]) if (!keys.has(k)) errs.push(`asset ${a.key}: references unknown asset ${k}`);
  const ctl = new Set(inv.controls.map((c) => c.id));
  for (const c of inv.controls) if (!["blocking", "advisory", "human-gate"].includes(c.mode)) errs.push(`control ${c.id}: mode must be blocking|advisory|human-gate`);
  const caps = new Set(inv.capabilities.map((c) => c.id));
  for (const s of inv.surfaces) {
    if (!["user", "semi", "untrusted"].includes(s.trust)) errs.push(`surface ${s.id}: trust must be user|semi|untrusted`);
    for (const c of s.controls ?? []) if (!ctl.has(c)) errs.push(`surface ${s.id}: unknown control ${c}`);
    for (const c of s.reaches ?? []) if (!caps.has(c)) errs.push(`surface ${s.id}: unknown capability ${c}`);
  }
  for (const c of inv.capabilities) for (const x of c.controls ?? []) if (!ctl.has(x)) errs.push(`capability ${c.id}: unknown control ${x}`);
  for (const r of inv.top_risks) if (!/^R\d+$/.test(r.id)) errs.push(`top risk ${r.id}: id must look like R0, R1, ...`);
  return errs;
}

const byKey = (inv: Inventory) => new Map(inv.assets.map((a) => [a.key, a]));

/** Transitive closure from `start` along `next`, excluding `start`. */
function closure(start: string, next: (k: string) => string[]): string[] {
  const seen = new Set<string>([start]);
  const out: string[] = [];
  const queue = [start];
  while (queue.length) {
    for (const n of next(queue.shift()!)) {
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
      queue.push(n);
    }
  }
  return out;
}

/** What operationally relies on `key`: assets whose depends_on reaches it, transitively. */
export function blast(inv: Inventory, key: string): Asset[] {
  const m = byKey(inv);
  return closure(key, (k) => inv.assets.filter((a) => a.depends_on?.includes(k)).map((a) => a.key)).map((k) => m.get(k)!);
}

/** What deleting or losing `key` orphans: its owns closure. */
export function owns(inv: Inventory, key: string): Asset[] {
  const m = byKey(inv);
  return closure(key, (k) => m.get(k)?.owns ?? []).filter((k) => m.has(k)).map((k) => m.get(k)!);
}

/** Data stores `key` can reach through depends_on, transitively. */
export function dataStores(inv: Inventory, key: string): Asset[] {
  const m = byKey(inv);
  return closure(key, (k) => m.get(k)?.depends_on ?? []).map((k) => m.get(k)).filter((a): a is Asset => !!a && isStore(a));
}

/** Credentials `key` would leak if compromised: its own plus those of everything it owns, compromise tier first. */
export function exposed(inv: Inventory, key: string): (Credential & { holder: string })[] {
  const m = byKey(inv);
  const holders = [key, ...owns(inv, key).map((a) => a.key)];
  const rows = holders.flatMap((h) => (m.get(h)?.credentials ?? []).map((c) => ({ ...c, priority: c.priority ?? "UNKNOWN", holder: h })));
  return rows.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority!) - PRIORITY_ORDER.indexOf(b.priority!) || a.name.localeCompare(b.name));
}

export type Band = "governed" | "advisory-only" | "UNGOVERNED";

/** governed: a blocking or human-gate control that does not fail open; advisory-only: something watches; UNGOVERNED: nothing. */
export function band(inv: Inventory, controlIds: string[]): Band {
  const cs = controlIds.map((id) => inv.controls.find((c) => c.id === id)).filter((c): c is Control => !!c);
  if (cs.some((c) => c.mode !== "advisory" && !c.fail_open)) return "governed";
  return cs.length ? "advisory-only" : "UNGOVERNED";
}

/** Capabilities an injection at surface `id` could drive, irreversible first. Without `reaches`, every capability: one context holds them all. */
export function reach(inv: Inventory, id: string): (Capability & { band: Band })[] {
  const s = inv.surfaces.find((x) => x.id === id || `ingest:${x.id}` === id);
  const caps = s?.reaches?.length ? inv.capabilities.filter((c) => s.reaches!.includes(c.id)) : inv.capabilities;
  return caps
    .map((c) => ({ ...c, band: band(inv, c.controls ?? []) }))
    .sort((a, b) => Number(a.reversible) - Number(b.reversible) || a.id.localeCompare(b.id));
}
