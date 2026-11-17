#!/usr/bin/env bun
/**
 * PortDuel — a Fabric port against the upstream pattern it replaces, head to head.
 *
 * For each held-out case in Evals/HeldOut/<Intent>.json, the same generator answers the
 * case twice: once with the port intent as its system prompt, once with the upstream
 * pattern's system.md. A pairwise judge on a vendor outside the generator's family
 * (OpenAI by default) compares the pair in both orders; a winner that flips with the
 * order is a tie. The port passes when it wins more than half the cases.
 *
 *   bun Tools/PortDuel.ts <Intent> [--heldout <file>] [--concurrency N]
 *       [--generator-vendor anthropic|openai|any] [--judge-vendor anthropic|openai|any] [--out <dir>] [--json]
 *   exit 0 port wins · 1 port does not win · 2 generator or judge unavailable
 *
 * Adapted from MIT-licensed code (see LICENSE.txt). It carries its own two-order pairwise
 * judge, so it runs without the assay skill's Tournament.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { inference, resolveProvider, type InferenceVendor } from "./_portable/inference.ts";
import { skillDataDir, skillRoot } from "./_portable/paths.ts";

const SKILL = skillRoot(import.meta.url);
const QUESTION =
  "Which output better delivers what the request asks for? Judge fidelity to the deliverable the request names (the right kind of output, nothing missing that the request implies), accuracy to the input, specificity to this input rather than generic filler, and usefulness to an expert reader. Length and formatting count only as far as they serve the reader.";

// Pairwise judge prompt, adapted from MIT-licensed judge prompts (see LICENSE.txt).
const PAIRWISE_SYSTEM = `You are comparing two candidate OUTPUTS, A (first) and B (second), on ONE question.
Before choosing, quote the deciding phrases from EACH candidate verbatim (one or two per side). Judge only the question asked; ignore length and polish unless the question is about them. If the candidates are equally good on the question, say tie: a tie is a real answer, not a failure. Output exactly one JSON object and nothing after it: {"quotes": {"A": ["<verbatim>"], "B": ["<verbatim>"]}, "winner": "A"|"B"|"tie", "reason": "<one sentence>"}`;

type Vendor = "anthropic" | "openai" | "any";
interface HeldOutCase { id: string; pattern: string; input: string; /** what the requester wants, stated from the user and the upstream deliverable, never from the port */ expects?: string }
interface HeldOut { intent: string; cases: HeldOutCase[] }
export interface CaseResult { id: string; pattern: string; winner: "port" | "upstream" | "tie"; stable: boolean; summary: string; dir: string }
export interface DuelResult { intent: string; generator: string; judge_vendor: string; wins: number; losses: number; ties: number; pass: boolean; unavailable: boolean; cases: CaseResult[] }

const vendorOf = (v: Vendor): InferenceVendor | undefined => (v === "any" ? undefined : v);

async function generate(systemFile: string, input: string, vendor: Vendor): Promise<{ text: string; model: string } | null> {
  const r = await inference({ systemPrompt: readFileSync(systemFile, "utf8"), userPrompt: input, level: "medium", vendor: vendorOf(vendor), timeout: 300_000 });
  return r.success && r.output.trim() ? { text: r.output.trim(), model: r.executedModel ?? r.provider ?? "unknown" } : null;
}

/** One ordering of one pair; three attempts so one malformed reply does not void a case. */
async function judgeOnce(a: string, b: string, vendor: Vendor): Promise<{ winner: "A" | "B" | "tie"; reason: string } | null> {
  const userPrompt = `## QUESTION\n${QUESTION}\n\n## CANDIDATE A\n${a}\n\n## CANDIDATE B\n${b}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await inference({ systemPrompt: PAIRWISE_SYSTEM, userPrompt, level: "high", vendor: vendorOf(vendor), expectJson: true, timeout: 120_000 });
    const j = r.parsed as { winner?: unknown; reason?: unknown } | undefined;
    const w = typeof j?.winner === "string" ? j.winner.toUpperCase() : "";
    if (r.success && (w === "A" || w === "B" || w === "TIE") && typeof j?.reason === "string" && j.reason.trim()) {
      return { winner: w === "TIE" ? "tie" : (w as "A" | "B"), reason: j.reason.trim() };
    }
  }
  return null;
}

async function duelCase(intent: string, c: HeldOutCase, outDir: string, genVendor: Vendor, judgeVendor: Vendor, models: Set<string>): Promise<CaseResult | null> {
  const upstreamFile = join(SKILL, "Patterns", c.pattern, "system.md");
  if (!existsSync(upstreamFile)) throw new Error(`no upstream pattern ${c.pattern}`);
  const [port, upstream] = await Promise.all([
    generate(join(SKILL, "Intents", `${intent}.md`), c.input, genVendor),
    generate(upstreamFile, c.input, genVendor),
  ]);
  if (!port || !upstream) return null;
  models.add(port.model).add(upstream.model);
  const dir = join(outDir, c.id);
  mkdirSync(dir, { recursive: true });
  const req = `# Request\n\n${c.input}\n\n${c.expects ? `# What the requester wants\n\n${c.expects}\n\n` : ""}# Output\n\n`;
  const portDoc = req + port.text, upDoc = req + upstream.text;
  writeFileSync(join(dir, "port.md"), portDoc);
  writeFileSync(join(dir, "upstream.md"), upDoc);
  // Both orders: upstream first, then port first. A winner that flips with the order is a tie.
  const [first, second] = await Promise.all([judgeOnce(upDoc, portDoc, judgeVendor), judgeOnce(portDoc, upDoc, judgeVendor)]);
  if (!first || !second) return null;
  const pick1 = first.winner === "A" ? "upstream" : first.winner === "B" ? "port" : "tie";
  const pick2 = second.winner === "A" ? "port" : second.winner === "B" ? "upstream" : "tie";
  const stable = pick1 === pick2;
  const winner = stable ? pick1 : "tie";
  const summary = `upstream-first: ${pick1} (${first.reason}) · port-first: ${pick2} (${second.reason})`;
  writeFileSync(join(dir, "verdict.json"), JSON.stringify({ winner, stable, orders: [{ order: "upstream,port", ...first }, { order: "port,upstream", ...second }] }, null, 2));
  return { id: c.id, pattern: c.pattern, winner, stable, summary, dir };
}

export async function duel(intent: string, heldoutFile: string, concurrency: number, opts: { generatorVendor?: Vendor; judgeVendor?: Vendor; outRoot?: string } = {}): Promise<DuelResult> {
  const genVendor = opts.generatorVendor ?? "anthropic";
  const judgeVendor = opts.judgeVendor ?? "openai";
  const h = JSON.parse(readFileSync(heldoutFile, "utf8")) as HeldOut;
  if (!Array.isArray(h.cases) || h.cases.length < 3) throw new Error(`${heldoutFile}: needs at least three cases`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(opts.outRoot ?? join(skillDataDir("fabric"), "duels"), intent, stamp);
  const models = new Set<string>();
  const results: (CaseResult | null)[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (i < h.cases.length) { const c = h.cases[i++]; results.push(await duelCase(intent, c, outDir, genVendor, judgeVendor, models)); }
  }));
  const done = results.filter((r): r is CaseResult => r !== null);
  const wins = done.filter((r) => r.winner === "port").length;
  const losses = done.filter((r) => r.winner === "upstream").length;
  const unavailable = done.length < h.cases.length;
  const r: DuelResult = { intent, generator: [...models].join(", ") || "unavailable", judge_vendor: judgeVendor, wins, losses, ties: done.length - wins - losses, pass: !unavailable && wins > h.cases.length / 2, unavailable, cases: done };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "duel.json"), JSON.stringify(r, null, 2));
  return r;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      heldout: { type: "string" },
      concurrency: { type: "string", default: "3" },
      "generator-vendor": { type: "string", default: "anthropic" },
      "judge-vendor": { type: "string", default: "openai" },
      out: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const intent = positionals[0];
  if (values.help || !intent) { console.log(readFileSync(join(SKILL, "Tools", "PortDuel.help.md"), "utf8")); process.exit(values.help ? 0 : 2); }
  const vendors = ["anthropic", "openai", "any"];
  const gen = values["generator-vendor"] as Vendor, judge = values["judge-vendor"] as Vendor;
  if (!vendors.includes(gen) || !vendors.includes(judge)) { console.error(`--generator-vendor and --judge-vendor take ${vendors.join(" | ")}`); process.exit(2); }
  for (const [role, v] of [["generator", gen], ["judge", judge]] as const) {
    if (!resolveProvider({ vendor: vendorOf(v) })) {
      console.error(`no LLM provider for the ${role} (${v}): see Setup.md (ANTHROPIC_API_KEY, OPENAI_API_KEY, the claude or codex CLI, or AGENT_SKILLS_LLM_CMD)`);
      process.exit(2);
    }
  }
  if (gen === judge && gen !== "any") console.error(`warning: generator and judge share the ${gen} family; the verdict may favor its own style`);
  const file = values.heldout ?? join(SKILL, "Evals", "HeldOut", `${intent}.json`);
  const r = await duel(intent, file, Number(values.concurrency), { generatorVendor: gen, judgeVendor: judge, outRoot: values.out });
  if (values.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`${intent}: port ${r.wins} · upstream ${r.losses} · tie ${r.ties}${r.unavailable ? " · some cases unavailable" : ""} → ${r.pass ? "PASS" : r.unavailable ? "DEFER" : "FAIL"}`);
    for (const c of r.cases) console.log(`  ${c.id} (${c.pattern}): ${c.winner}${c.stable ? "" : " (unstable)"}`);
  }
  process.exit(r.unavailable ? 2 : r.pass ? 0 : 1);
}
