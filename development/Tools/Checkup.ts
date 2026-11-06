#!/usr/bin/env bun
/**
 * Checkup — gathers the local evidence about one app into one bundle, so a Checkup run
 * reads evidence instead of re-deriving it: the spec against the current template, the
 * code against the spec, and (when the user has one) a health-check results file from the
 * app's own monitor. Read-only.
 *
 *   bun Checkup.ts <repo> [--spec <path>] [--since 14d] [--name <alias>]... [--monitor <file>] [--json]
 *
 * Each source runs as its own child process with an argument array and a timeout.
 * A source that fails or is not installed is listed under `unavailable` with its
 * reason; it is never reported as clean. Production signals this tool cannot read
 * (alerts, bug reports, user complaints, security findings) are always listed under
 * `unavailable` so the run gathers them by hand (Intents/Checkup.md § Inputs).
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt).
 *
 * Exit codes: 0 gathered (findings or not), 2 bad input.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { frontmatter } from "./lib/Spec.ts";

const TOOLS = dirname(fileURLToPath(import.meta.url));

export interface RunResult { code: number; stdout: string; stderr: string }
export type Runner = (cmd: string[], cwd?: string) => RunResult;

export const spawnRunner: Runner = (cmd, cwd) => {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", timeout: 120_000 });
  return { code: p.exitCode ?? 124, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
};

/** `14d`, `36h`, `2w` → milliseconds. */
export function parseSince(s: string): number {
  const m = s.match(/^(\d+)([hdw])$/);
  if (!m) throw new Error(`--since takes <n>h, <n>d or <n>w, got '${s}'`);
  return Number(m[1]) * { h: 3_600_000, d: 86_400_000, w: 604_800_000 }[m[2] as "h" | "d" | "w"];
}

/** True when the text names the app as a whole word, or names its repo path. */
export function mentions(text: string, names: string[], repo: string): boolean {
  if (text.includes(repo)) return true;
  return names.some((n) => n.length >= 3 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

function json(r: RunResult): unknown {
  try { return JSON.parse(r.stdout); } catch { return undefined; }
}

export interface Bundle {
  repo: string;
  spec: string;
  names: string[];
  window: { since: string; from: string };
  specMeta: Record<string, string>;
  standard: { bar?: unknown; writeProbes?: unknown; conform?: unknown };
  code: { head?: string; dirtyFiles?: number; commitsSince?: string[]; commitsSinceSpecEdit?: number; sync?: unknown };
  production: { monitor?: { app?: string; status?: string; failing?: string[]; [k: string]: unknown } };
  unavailable: { source: string; reason: string }[];
}

/** Sources this tool never reads: the run gathers them by hand, and they are never read as clean. */
export const BY_HAND = [
  { source: "alerts and incidents", reason: "not gathered by this tool: read the app's monitoring, uptime and error-tracking alerts for the window" },
  { source: "bug reports and complaints", reason: "not gathered by this tool: read the issue tracker (e.g. `gh issue list --search <name>`) and user reports for the window" },
  { source: "security findings", reason: "not gathered by this tool: read open findings from the project's security scans or audits" },
];

/**
 * A monitor file is the app's own health-check results, as JSON: either one app
 * (`{ "status": "red", "failing": ["AC-3"] }`) or a map of app name to that shape.
 */
export function readMonitor(file: string, names: string[]): Bundle["production"]["monitor"] | string {
  const all = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  if ("status" in all || "failing" in all) return all as Bundle["production"]["monitor"];
  const app = Object.keys(all).find((k) => names.includes(k.toLowerCase()));
  return app ? { app, ...(all[app] as Record<string, unknown>) } : `no app named ${names.join(" or ")} in ${file} (pass --name)`;
}

export function gather(opts: { repo: string; spec: string; since: string; names: string[]; monitor?: string }, run: Runner = spawnRunner, now = Date.now()): Bundle {
  const { repo, spec } = opts;
  const from = new Date(now - parseSince(opts.since)).toISOString();
  const meta = frontmatter(readFileSync(spec, "utf8"));
  const names = [...new Set([...opts.names, meta.slug, meta.project, basename(repo)].filter(Boolean).map((n) => n!.toLowerCase()))];
  const b: Bundle = { repo, spec, names, window: { since: opts.since, from }, specMeta: meta, standard: {}, code: {}, production: {}, unavailable: [] };
  const miss = (source: string, r: RunResult | string) =>
    b.unavailable.push({ source, reason: typeof r === "string" ? r : `exit ${r.code}: ${(r.stderr || r.stdout).trim().split("\n").slice(-1)[0] ?? ""}`.slice(0, 200) });

  // The spec against the current template. SpecCheck and Inventory exit 1 on findings, a result, not a failure.
  const bar = run(["bun", join(TOOLS, "SpecCheck.ts"), "bar", spec, "--json"]);
  bar.code <= 1 && json(bar) !== undefined ? (b.standard.bar = json(bar)) : miss("SpecCheck bar", bar);
  const wp = run(["bun", join(TOOLS, "SpecCheck.ts"), "write-probes", spec, "--json"]);
  wp.code <= 1 && json(wp) !== undefined ? (b.standard.writeProbes = json(wp)) : miss("SpecCheck write-probes", wp);
  const cf = run(["bun", join(TOOLS, "SpecCheck.ts"), "conform", spec, "--json"]);
  cf.code <= 1 && json(cf) !== undefined ? (b.standard.conform = json(cf)) : miss("SpecCheck conform", cf);

  // The code against the spec.
  const head = run(["git", "-C", repo, "rev-parse", "--short", "HEAD"]);
  if (head.code === 0) {
    b.code.head = head.stdout.trim();
    b.code.dirtyFiles = run(["git", "-C", repo, "status", "--porcelain"]).stdout.split("\n").filter(Boolean).length;
    b.code.commitsSince = run(["git", "-C", repo, "log", `--since=${from}`, "--format=%h %as %s"]).stdout.split("\n").filter(Boolean);
    const specRel = spec.startsWith(repo + "/") ? spec.slice(repo.length + 1) : null;
    const lastSpec = specRel ? run(["git", "-C", repo, "log", "-1", "--format=%H", "--", specRel]).stdout.trim() : "";
    if (lastSpec) b.code.commitsSinceSpecEdit = Number(run(["git", "-C", repo, "rev-list", "--count", `${lastSpec}..HEAD`]).stdout.trim()) || 0;
  } else miss("git", head);
  const sync = run(["bun", join(TOOLS, "Inventory.ts"), "sync", repo, spec, "--json"]);
  sync.code <= 1 && json(sync) !== undefined ? (b.code.sync = json(sync)) : miss("Inventory sync", sync);

  // What the app's own monitor last saw, when the user keeps its results in a file.
  if (opts.monitor) {
    try {
      const m = readMonitor(opts.monitor, names);
      typeof m === "string" ? miss("monitor", m) : (b.production.monitor = m);
    } catch (e) {
      miss("monitor", (e as Error).message.slice(0, 200));
    }
  } else miss("monitor", "no --monitor file given: read the app's live health checks by hand");

  b.unavailable.push(...BY_HAND);
  return b;
}

function count(x: unknown): number | string {
  return Array.isArray(x) ? x.length : x === undefined ? "n/a" : "present";
}

export function summary(b: Bundle): string {
  const sync = b.code.sync as { unreferenced?: unknown[]; missingProbeTargets?: unknown[] } | undefined;
  const conf = b.standard.conform as { latest?: boolean; missing?: unknown[] } | undefined;
  const lines = [
    `Checkup evidence — ${b.repo} (spec ${b.spec})`,
    `names matched: ${b.names.join(", ")} · window: ${b.window.since} (from ${b.window.from.slice(0, 10)})`,
    `spec: status ${b.specMeta.status ?? "?"} · progress ${b.specMeta.progress ?? "?"} · updated ${b.specMeta.updated ?? "?"} · last checkup ${b.specMeta.checkup ?? "never"}`,
    `standard: bar findings ${count(b.standard.bar)} · production-write rows ${count(b.standard.writeProbes)} · template ${conf ? (conf.latest ? "met" : `${count(conf.missing)} missing`) : "n/a"}`,
    `code: HEAD ${b.code.head ?? "n/a"} · ${b.code.dirtyFiles ?? "n/a"} dirty · ${count(b.code.commitsSince)} commits in window · ${b.code.commitsSinceSpecEdit ?? "n/a"} commits since the spec last changed`,
    `sync: ${count(sync?.unreferenced)} surfaces no criterion names · ${count(sync?.missingProbeTargets)} rows pointing at missing files`,
    `production: ${b.production.monitor ? `monitor ${b.production.monitor.status ?? "?"} · ${count(b.production.monitor.failing)} failing criteria` : "n/a"}`,
  ];
  if (b.unavailable.length) lines.push("unavailable (not clean):", ...b.unavailable.map((u) => `  - ${u.source}: ${u.reason}`));
  return lines.join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const names: string[] = [];
  args.forEach((a, i) => a === "--name" && args[i + 1] && names.push(args[i + 1]));
  const flagValues = new Set(["--spec", "--since", "--name", "--monitor"].flatMap((f) => args.flatMap((a, i) => (a === f ? [args[i + 1]] : []))));
  const repoArg = args.find((a) => !a.startsWith("--") && !flagValues.has(a));
  if (!repoArg || args.includes("--help")) {
    console.error("usage: bun Checkup.ts <repo> [--spec <path>] [--since 14d] [--name <alias>]... [--monitor <file>] [--json]");
    process.exit(2);
  }
  const repo = resolve(repoArg);
  const spec = resolve(val("--spec") ?? join(repo, "SPEC.md"));
  if (!existsSync(spec)) { console.error(`no spec at ${spec} (pass --spec <path>)`); process.exit(2); }
  try {
    const monitor = val("--monitor");
    const b = gather({ repo, spec, since: val("--since") ?? "14d", names, ...(monitor ? { monitor: resolve(monitor) } : {}) });
    console.log(args.includes("--json") ? JSON.stringify(b, null, 2) : summary(b));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
}
