/**
 * Spec — parses the project spec the development skill builds against: frontmatter,
 * criteria, and the `## Test Strategy` table (References/SpecFormat.md).
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt): the criteria and Test Strategy
 * parsers in TOOLS/lib/IsaClaims.ts, TOOLS/lib/IsaTestStrategy.ts and hooks/lib/isa-utils.ts, cut down to
 * what a plain spec in any repo needs: no evals blocks, lanes, cadences or monitor rules.
 * Read-only except `writeFrontmatterField`, which returns new text and writes nothing.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ── Frontmatter and body ─────────────────────────────────────────────────────

export function specBody(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/, "");
}

/** Frontmatter scalars (`key: value`), quotes stripped. */
export function frontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: Record<string, string> = {};
  for (const line of (m?.[1] ?? "").split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (kv && kv[2]) out[kv[1]!] = kv[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

/** Sets (or adds) one frontmatter key and returns the new text; text with no frontmatter is returned unchanged. */
export function writeFrontmatterField(content: string, field: string, value: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) return content;
  const lines = fmMatch[2]!.split("\n");
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith(`${field}:`)) {
      lines[i] = `${field}: ${value}`;
      found = true;
      break;
    }
  }
  if (!found) lines.push(`${field}: ${value}`);
  return fmMatch[1] + lines.join("\n") + fmMatch[3] + content.slice(fmMatch[0].length);
}

/** H2 sections of a body: title, where its content starts, where it ends. Fenced blocks are skipped. */
export function h2Sections(body: string): { title: string; contentStart: number; end: number }[] {
  const out: { title: string; contentStart: number; end: number }[] = [];
  let offset = 0;
  let fence: string | null = null;
  for (const line of body.split("\n")) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) fence = fence === null ? f[1]!.slice(0, 3) : (line.trim().startsWith(fence) ? null : fence);
    const h = fence === null ? line.match(/^##\s+(.+?)\s*$/) : null;
    if (h) {
      if (out.length) out[out.length - 1]!.end = offset;
      out.push({ title: h[1]!, contentStart: offset + line.length + 1, end: body.length });
    }
    offset += line.length + 1;
  }
  return out;
}

// ── Criteria ─────────────────────────────────────────────────────────────────

export interface Claim {
  id: string;
  checked: boolean;
  status: "completed" | "open" | "partial";
  anti: boolean;
  /** 1-based line in the body (frontmatter removed). */
  line: number;
  source: "checkbox" | "prose" | "table";
}

/** Headings whose bullets are criteria. `## Anti-criteria` is its own heading (every bullet is an anti-criterion). */
export const CRITERIA_HEADING_RE =
  /^(?:##\s+(?:Acceptance\s+)?Criteria\b[^\n]*|##\s+Requirements\b[^\n]*|###\s+(?:Acceptance\s+)?Criteria\b[^\n]*|##\s+Features\b[^\n]*)$/im;
export const ANTI_HEADING_RE = /^##\s+Anti-criteria\b/i;

const ID = /^(ISC-[\w-]+(?:\.[\w-]+)*|[A-Z]{1,6}-[A-Z0-9][\w-]*(?:\.[\w-]+)*|[A-Z]{1,4}\d+[a-z]?(?:\.\d+)*)(?=$|\s|[:.—–])/;
const BULLET_MARKER = "(?:[-*+]|\\d+[.)])";
const CHECKBOX = new RegExp(`^(\\s*)${BULLET_MARKER}\\s+\\[([ xX~-])\\]\\s*`);
const BULLET = new RegExp(`^\\s*${BULLET_MARKER}\\s+(.*)$`);

export function stripBulletPrefix(line: string): string {
  return line.replace(new RegExp(`^\\s*${BULLET_MARKER}\\s+(?:\\[[^\\]]*\\]\\s*)?`), "");
}

export interface ClaimText { id: string; body: string; anti: boolean }

/** Recognizes `AC-3: text`, `**AC-3.** text`, `Anti: AC-4: text`, `F1.2 — text`. */
export function claimText(value: string): ClaimText | null {
  let text = value.trim();
  const anti = /^(?:\*\*)?(?:Anti-criterion\s+|Anti:\s*)/i.test(text);
  text = text.replace(/^\*\*/, "").replace(/^(?:Anti-criterion\s+|Anti:\s*)/i, "").replace(/^`([^`]+)`/, "$1");
  text = text.replace(/^([A-Za-z]+-?\d+[a-z]?(?:\.\d+)*)([.:]?)\*\*(?=\s)/, (_m, id: string, sep: string) => id + sep);
  const match = text.match(ID);
  if (!match) return null;
  const id = match[1]!;
  const rest = text.slice(match[0].length);
  if (rest && !/^(?:\s|[:—–]|\.\s)/.test(rest)) return null;
  const body = rest.replace(/^\s*(?:(?:`[^`]*`|(?:\*\*)?\([^)]*\)(?:\*\*)?)\s*)?(?::|[—–]|\.\s)\s*/, "").trim();
  return { id, body, anti: anti || /^Anti:/i.test(body) || /^\s*\(anti\)\s*:/i.test(rest) };
}

/** Every criterion under a criteria heading. A checkbox parent whose next line is a deeper checkbox is a container, not a criterion. */
export function parseClaimsText(text: string): Claim[] {
  const claims: Claim[] = [];
  const lines = specBody(text).split(/\r?\n/);
  let active = false;
  let antiSection = false;
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const f = raw.match(/^\s*(`{3,}|~{3,})/);
    if (fence) { if (f && raw.trim().startsWith(fence)) fence = null; continue; }
    if (f) { fence = f[1]!.slice(0, 3); continue; }
    if (CRITERIA_HEADING_RE.test(raw) || ANTI_HEADING_RE.test(raw)) { active = true; antiSection = ANTI_HEADING_RE.test(raw); continue; }
    if (/^#{1,2}\s|^---\s*$/.test(raw)) { active = false; continue; }
    if (!active) continue;
    const checkbox = raw.match(CHECKBOX);
    const bullet = raw.match(BULLET);
    const table = /^\s*\|/.test(raw);
    if (!bullet && !table) continue;
    if (checkbox) {
      let next = i + 1;
      while (next < lines.length && !lines[next]!.trim()) next++;
      const child = lines[next]?.match(CHECKBOX);
      if (child && child[1]!.length > checkbox[1]!.length) continue;
    }
    const cells = table ? raw.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim()) : [];
    const parsed = table ? cells.map(claimText).find(Boolean) : claimText(checkbox ? raw.slice(checkbox[0].length) : bullet![1]!);
    if (!parsed) continue;
    const status = table
      ? (cells.some((c) => /^(?:\[x\]|passed|closed|complete|done|✅)$/i.test(c)) ? "completed" : "open")
      : checkbox?.[2] === "~" ? "partial" : checkbox?.[2]?.toLowerCase() === "x" ? "completed" : "open";
    claims.push({ id: parsed.id, checked: status === "completed", status, anti: antiSection || parsed.anti, line: i + 1, source: table ? "table" : checkbox ? "checkbox" : "prose" });
  }
  return claims;
}

// A dropped criterion keeps its id for history (`- [ ] AC-7: [DROPPED — see Decisions]`) but is no longer a criterion.
export const TOMBSTONE_RE = /^\s*[-*]\s+\[[ xX~-]\]\s+([A-Za-z][\w.-]*)\s*:\s*\[DROPPED\b/gm;

// ── Test Strategy ────────────────────────────────────────────────────────────

/** Row types. `test` and `property` run the project's test runner; `eval` and `pairwise` are judged (the `assay` skill); `manual` is a person's attestation. */
export const PROBE_TYPES = ["bash", "test", "bun-test", "property", "bun-property", "curl", "screenshot", "eval", "pairwise", "manual"] as const;
export type ProbeType = (typeof PROBE_TYPES)[number];
export const PROBE_SEVERITIES = ["normal", "critical"] as const;
export type ProbeSeverity = (typeof PROBE_SEVERITIES)[number];

export function isProbeType(x: string): x is ProbeType {
  return (PROBE_TYPES as readonly string[]).includes(x);
}
export function isJudgedType(type: string): boolean {
  return type === "eval" || type === "pairwise";
}

export interface Probe {
  /** The criterion id the row verifies. */
  isc: string;
  type: ProbeType;
  check: string;
  threshold: string;
  /** The command the row runs (the `command` or `tool` column). */
  tool: string;
  anchors_to: string;
  severity: ProbeSeverity;
}

export interface DroppedRow { raw: string; reason: string }
export interface RepairedRow { isc: string; reason: string }
export interface TestStrategy { probes: Probe[]; dropped: DroppedRow[]; repaired: RepairedRow[] }

// A probe that cannot fail is worse than no probe: it reports green forever.
// Bun 1.3.6 runs a `bun -e` script containing require() and no await as CommonJS,
// and an uncaught throw there exits 0.
export const UNFAILABLE_BUN_E = (tool: string): boolean =>
  /\bbun\s+-e\b/.test(tool) && /\brequire\(/.test(tool) && /\bthrow\b/.test(tool) && !/\bawait\b/.test(tool);

// A command cell that is one bare word (`bash`, `bun`, `jq`) runs as `bash -c "<word>"` and checks nothing.
export const BARE_WORD_TOOL = (tool: string, type: string): boolean =>
  !isJudgedType(type) && type !== "manual" && /^[A-Za-z][A-Za-z0-9_.+-]*$/.test(tool.trim());

// Single-quoted text is a pattern, never a call, except the body of a shell wrapper (`bash -c '…'`).
const SHELL_WRAPPER_BODY = /(?:\b(?:ba|z|da|k)?sh\b[^'|;&\n]*?\s-[A-Za-z]*c[A-Za-z]*\s+|\beval\s+)'([^']*)'/g;
export function callableText(tool: string): string {
  const bodies = [...tool.matchAll(SHELL_WRAPPER_BODY)].map((m) => m[1]!);
  return [tool.replace(/'[^']*'/g, "''"), ...bodies].join(" ; ");
}

// A probe observes; it never ships. A row that deploys is dropped on every read.
export const DEPLOY_CALL_TOOL = (tool: string): boolean =>
  /(?:^|[;&|(]\s*|\b(?:bash|sh)\s+)(?:\.\/)?(?:scripts\/)?deploy\.sh\b|\bwrangler\s+(?:deploy|publish)\b|\b(?:vercel|netlify|fly)\s+(?:deploy|--prod)\b|\b(?:bun|npm|pnpm|yarn)\s+run\s+deploy\b/.test(callableText(tool));

/** Where a row's command runs: the spec's folder, or `probe_cwd:` (a path relative to the spec) from its frontmatter. */
export function probeCwdOf(specPath: string): string {
  const abs = resolve(specPath);
  const value = frontmatter(readFileSync(abs, "utf8")).probe_cwd;
  return value ? resolve(dirname(abs), value) : dirname(abs);
}

type Field = "isc" | "type" | "check" | "threshold" | "tool" | "anchors_to" | "severity";
const HEADER_ALIASES: Readonly<Record<string, Field>> = {
  isc: "isc", criterion: "isc", criteria: "isc", id: "isc", ac: "isc", claim: "isc",
  type: "type", verifier: "type", kind: "type", class: "type", method: "type",
  check: "check", evidence: "check",
  threshold: "threshold", expected: "threshold", pass: "threshold",
  tool: "tool", command: "tool", cmd: "tool", assert: "tool", "tool / command": "tool",
  anchors_to: "anchors_to", "anchors to": "anchors_to", anchor: "anchors_to",
  severity: "severity",
};
const ID_HEADER_WORDS: ReadonlySet<string> = new Set(["isc", "id", "claim", "criterion", "criteria", "ac"]);
const EXTRA_HEADER_WORDS: ReadonlySet<string> = new Set(["probe", "notes", "note", "status", "result", "why", "owner", "tier", "lane", "stage", "runs", "generator", "property"]);
const LEGACY_INDEX: Readonly<Record<Field, number>> = { isc: 0, type: 1, check: 2, threshold: 3, tool: 4, anchors_to: 5, severity: 6 };
const MIN_CELLS = 5;
const SEPARATOR = /^:?-{3,}:?$/;

function isHeaderWord(cell: string): boolean {
  const c = cell.trim().toLowerCase();
  return c in HEADER_ALIASES || EXTRA_HEADER_WORDS.has(c);
}

export function isTestStrategyHeader(cells: string[]): boolean {
  const first = cells[0]?.trim().toLowerCase() ?? "";
  return ID_HEADER_WORDS.has(first) && cells.length >= 2 && cells.slice(1).every(isHeaderWord);
}

/** Column identity comes from the table's own header; an unnamed field falls back to its default position unless a named column owns it. */
function resolveColumns(header: string[] | null): Record<Field, number> {
  const idx: Partial<Record<Field, number>> = {};
  const claimed = new Set<number>();
  if (header) {
    const words = header.map((c) => c.trim().toLowerCase());
    const namesCommand = words.some((w) => HEADER_ALIASES[w] === "tool");
    words.forEach((word, i) => {
      const key = word === "probe" ? (namesCommand ? "check" : "tool") : HEADER_ALIASES[word];
      if (key && idx[key] === undefined) { idx[key] = i; claimed.add(i); }
    });
  }
  for (const key of Object.keys(LEGACY_INDEX) as Field[]) {
    if (idx[key] !== undefined || claimed.has(LEGACY_INDEX[key])) continue;
    idx[key] = LEGACY_INDEX[key];
  }
  return idx as Record<Field, number>;
}

/** A fully backticked cell is formatting, not part of the command. */
export function unwrapCode(cell: string): string {
  const t = cell.trim();
  return t.length > 1 && t.startsWith("`") && t.endsWith("`") ? t.slice(1, -1).trim() : cell;
}

/** Splits a table row on unescaped pipes; `\|` stays a literal pipe in the cell. */
export function splitRow(line: string): string[] {
  return line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const COMMAND_WORDS: ReadonlySet<string> = new Set([
  "rg", "grep", "test", "[", "[[", "bash", "sh", "zsh", "bun", "bunx", "npx", "npm", "pnpm", "yarn", "node", "deno",
  "python", "python3", "pytest", "go", "cargo", "git", "jq", "wc", "diff", "cmp", "ls", "fd", "find", "cat", "head",
  "tail", "sed", "awk", "sqlite3", "gh", "stat", "shasum", "sha256sum", "printf", "echo", "curl", "cd", "!", "make",
]);
const SHELL_EVIDENCE = /(^|\s)-{1,2}[A-Za-z]|[\/~]|\.[A-Za-z]{1,5}\b|["']|&&|\|\||\||;|>|\$[\w{(]/;
const FUNCTION_WORDS: ReadonlySet<string> = new Set(["the", "a", "an", "for", "that", "with", "and", "is", "are", "of", "to", "in", "on", "it", "its", "was", "has", "each", "every", "all", "new", "shows", "exists"]);

function looksLikeProse(command: string): boolean {
  const tokens = command.replace(/"[^"]*"|'[^']*'/g, " ").split(/\s+/).filter(Boolean);
  let run: string[] = [];
  for (const tok of tokens) {
    if (/^[a-z]+[,.]?$/.test(tok)) {
      run.push(tok.replace(/[,.]$/, ""));
      if (run.length >= 3 && run.some((w) => FUNCTION_WORDS.has(w))) return true;
    } else run = [];
  }
  return false;
}

/** The row type a command cell implies, or null when the cell is not a runnable command. Never infers a judged or writing row. */
export function inferTypeFromTool(toolCell: string): "bash" | "test" | "curl" | null {
  let t = unwrapCode(toolCell).trim();
  while (/^[A-Z_][A-Z0-9_]*=\S*\s/.test(t)) t = t.replace(/^[A-Z_][A-Z0-9_]*=\S*\s+/, "");
  const first = t.split(/\s+/)[0] ?? "";
  const isScriptPath = /^(\.{1,2}\/|~\/|\/)\S+/.test(first);
  if (!COMMAND_WORDS.has(first) && !isScriptPath) return null;
  if (!isScriptPath && !SHELL_EVIDENCE.test(t.slice(first.length))) return null;
  if (looksLikeProse(t)) return null;
  if (/^(?:bun|deno|go|cargo)\s+test\b|^(?:npx\s+)?(?:vitest|jest)\b|^(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b|^pytest\b/.test(t)) return "test";
  if (first === "curl") return /(^|\s)(-X\s*(?!GET\b|HEAD\b)\w+|--request\s+(?!GET\b|HEAD\b)\w+|-d\b|--data\S*|-F\b|--form\b|-T\b|--upload-file\b)/i.test(t) ? null : "curl";
  return "bash";
}

/** Every data row under `## Test Strategy` becomes a probe or a dropped row with its reason; nothing is skipped silently. */
export function parseTestStrategyText(text: string): TestStrategy {
  const probes: Probe[] = [];
  const dropped: DroppedRow[] = [];
  const repaired: RepairedRow[] = [];
  let inSection = false;
  let header: string[] | null = null;
  let col = resolveColumns(null);
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      inSection = /^##\s+(?:Test Strategy|Verification Plan)\b/i.test(line);
      if (!inSection) { header = null; col = resolveColumns(null); }
      continue;
    }
    if (!inSection || !line.startsWith("|")) continue;
    let cells = splitRow(line);
    if (isTestStrategyHeader(cells)) { header = cells; col = resolveColumns(header); continue; }
    if (cells.every((c) => c === "" || SEPARATOR.test(c))) continue;

    // An unescaped shell pipe in the command splits the row into more cells than the header names; fold them back.
    const expected = header ? header.length : LEGACY_INDEX.severity + 1;
    const positional = (c: string) => c === "" || /^[a-z]+$/i.test(c) || /^\d+$/.test(c);
    if (cells.length > expected && col.tool < cells.length && cells.slice(expected).some((c) => !positional(c))) {
      const extra = cells.length - expected;
      const folded = cells.slice(col.tool, col.tool + extra + 1).join(" | ");
      cells = [...cells.slice(0, col.tool), folded, ...cells.slice(col.tool + extra + 1)];
      repaired.push({ isc: cells[col.isc] ?? "", reason: `unescaped pipe in the command split the row; folded ${extra} cell(s) back — escape it as \\| in the spec` });
    }
    const shortOk = header !== null && (cells[col.isc] ?? "").trim() !== ""
      && ((cells[col.tool] ?? "").trim() !== "" || (cells[col.check] ?? "").trim() !== "");
    if (cells.length < MIN_CELLS && !shortOk) {
      dropped.push({ raw: line, reason: header ? "no criterion id or nothing to check under this header" : `too few columns (${cells.length} < ${MIN_CELLS}; expected criterion | type | check | threshold | command)` });
      continue;
    }

    const rawType = (cells[col.type] ?? "").trim();
    let toolCell = cells[col.tool] ?? "";
    const word = unwrapCode(rawType).trim().toLowerCase().replace(/\s+/g, "-");
    let type: ProbeType;
    if (isProbeType(word)) {
      type = word;
      if (word !== rawType) repaired.push({ isc: cells[col.isc] ?? "", reason: `type "${rawType}" read as ${word}; write it as \`${word}\`` });
    } else {
      const runnable = toolCell.trim() || (cells[col.check] ?? "");
      const read = inferTypeFromTool(runnable);
      if (read === null) {
        dropped.push({ raw: line, reason: `type "${rawType || "(none)"}" is not a row type and the command cell is not a command; write a row type (\`manual\` when a person checks it)` });
        continue;
      }
      type = read;
      if (!toolCell.trim()) toolCell = runnable;
      repaired.push({ isc: cells[col.isc] ?? "", reason: `type "${rawType || "(none)"}" is not a row type; read as ${type} from the command — write \`${type}\`` });
    }

    // A single bare word that is not a severity is a typo and drops loudly: a "criticl" row must never page as normal.
    const sevCell = (cells[col.severity] ?? "").toLowerCase();
    const looksLikeSeverity = /^[a-z]+$/.test(sevCell);
    if (looksLikeSeverity && !(PROBE_SEVERITIES as readonly string[]).includes(sevCell)) {
      dropped.push({ raw: line, reason: `unknown severity "${cells[col.severity]}" (valid: ${PROBE_SEVERITIES.join(", ")}, or blank)` });
      continue;
    }
    const tool = unwrapCode(toolCell);
    if (type !== "manual" && DEPLOY_CALL_TOOL(tool)) {
      dropped.push({ raw: line, reason: "probe deploys: a check never ships; check the deployed state instead" });
      continue;
    }
    if (UNFAILABLE_BUN_E(tool)) {
      dropped.push({ raw: line, reason: "unfailable bun -e: a require() script with no await that fails by throw exits 0; fail with process.exit(1)" });
      continue;
    }
    probes.push({
      isc: cells[col.isc] ?? "",
      type,
      check: cells[col.check] ?? "",
      threshold: cells[col.threshold] ?? "",
      tool,
      anchors_to: cells[col.anchors_to] ?? "",
      severity: looksLikeSeverity ? (sevCell as ProbeSeverity) : "normal",
    });
  }
  return { probes, dropped, repaired };
}

export function parseTestStrategy(specPath: string): Probe[] {
  return parseTestStrategyText(readFileSync(specPath, "utf8")).probes;
}

function stripAnchorPrefix(a: string): string {
  const m = a.match(/^(?:derived|cross)\s*:\s*(.+)$/i);
  return (m ? m[1]! : a).trim();
}

/** Ids a set of rows verifies: the row's own id and the criterion it anchors to. */
export function idsOf(probes: Probe[]): Set<string> {
  const ids = new Set<string>();
  for (const p of probes) {
    if (p.isc) ids.add(p.isc);
    if (p.anchors_to) ids.add(stripAnchorPrefix(p.anchors_to));
  }
  return ids;
}

export interface Coverage {
  totalClaims: number;
  /** Criterion ids with no Test Strategy row at all. */
  unprobed: string[];
  /** Criterion ids whose only rows are `manual`. */
  manualOnly: string[];
  droppedRows: number;
}

export function coverageText(text: string): Coverage {
  const tombstones = new Set([...text.matchAll(TOMBSTONE_RE)].map((m) => m[1]!));
  const claims = [...new Set(parseClaimsText(text).map((c) => c.id))].filter((id) => !tombstones.has(id));
  const { probes, dropped } = parseTestStrategyText(text);
  const probed = idsOf(probes);
  const asserted = idsOf(probes.filter((p) => p.type !== "manual"));
  return {
    totalClaims: claims.length,
    unprobed: claims.filter((id) => !probed.has(id)),
    manualOnly: claims.filter((id) => probed.has(id) && !asserted.has(id)),
    droppedRows: dropped.length,
  };
}

export function coverageOf(specPath: string): Coverage {
  return coverageText(readFileSync(specPath, "utf8"));
}
