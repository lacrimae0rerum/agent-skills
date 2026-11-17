/**
 * DenyList — the deny-list scan PublicReady runs before a repo goes public: HEAD, every local branch and tag tip,
 * and full history. Built-in credential signatures are matched case-sensitively, the user's own patterns
 * case-insensitively. A hit is reported as `ref:path` locations and opaque rule ids only, never the matched line
 * or the pattern.
 * Adapted from MIT-licensed code (see LICENSE.txt).
 *
 * User patterns: $AGENT_SKILLS_HOME/open-source-management/deny-list.txt, one POSIX extended regex
 * (`git grep -E`) per line, `#` comments and blank lines ignored. Put there what must never be public:
 * your real name and emails, hostnames, internal domains, account ids, private project names.
 * A missing file means "no private patterns yet"; a file that exists but yields no pattern is an error,
 * so a truncated list never passes silently.
 */

import { existsSync, readFileSync } from "node:fs";
import { denyListPath } from "./Config.ts";

/** Public, non-personal credential signatures as git ERE (case-sensitive). */
export const GENERIC_PATTERNS = [
  "sk-ant-[A-Za-z0-9_-]{10}",
  "ghp_[A-Za-z0-9]{20}",
  "github_pat_[A-Za-z0-9_]{20}",
  "AKIA[0-9A-Z]{16}",
  "xox[bpars]-[A-Za-z0-9-]{10}",
  "-----BEGIN [A-Z ]*PRIVATE KEY-----",
  "npm_[A-Za-z0-9]{36}",
  "[sr]k_live_[A-Za-z0-9]{24,}",
  "AIza[0-9A-Za-z_-]{30,}",
  "glpat-[A-Za-z0-9_-]{16,}",
  "csk-[A-Za-z0-9]{16,}",
  "sk-or-v1-[A-Za-z0-9]{16,}",
  "[0-9]{8,10}:[A-Za-z0-9_-]{35}",
  "xoxe(\\.xox[bp])?-[A-Za-z0-9-]{10,}",
  "[aA][wW][sS][_ -]?[sS][eE][cC][rR][eE][tT][_ -]?([aA][cC][cC][eE][sS][sS][_ -]?)?[kK][eE][yY][\"']?[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9/+=]{40}",
];

/** The built-in signatures plus the user's patterns. Throws when the user file exists but yields nothing. */
export function loadPublicDenyList(path = denyListPath()): { generic: string[]; user: string[] } {
  let user: string[] = [];
  if (existsSync(path)) {
    user = readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
    if (user.length === 0) throw new Error(`deny list ${path} exists but yields no patterns — refusing to scan without it`);
  }
  return { generic: [...GENERIC_PATTERNS], user: Array.from(new Set(user)) };
}

// Replacement refs and grafts rewrite ancestry, so every scan command reads the real object graph.
const REAL_GRAPH = { GIT_NO_REPLACE_OBJECTS: "1", GIT_GRAFT_FILE: "/dev/null" };
const HISTORY_SCAN_BATCH_SIZE = 400;
// Per git-grep call. A call that still runs over fails closed (INCOMPLETE blocks READY).
const GREP_TIMEOUT_MS = 120_000;
/** Locations shown in a hit, and the budget for naming which rules matched them. */
const MAX_SHOWN_LOCATIONS = 20;
const RULE_ID_BUDGET_MS = 20_000;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function sh(cmd: string[], cwd: string, timeout: number): { ok: boolean; out: string } {
  try {
    const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", timeout, env: { ...process.env, ...REAL_GRAPH } });
    return { ok: r.exitCode === 0 && !r.signalCode, out: new TextDecoder().decode(r.stdout).trim() };
  } catch {
    return { ok: false, out: "" };
  }
}

/** `ref:path` locations and opaque rule ids (`generic-N`, `private-N`: the Nth pattern of that set). */
interface GrepHit { locations: string[]; total: number; rules: string[] }

/** A location safe to print: control characters replaced, length capped, an object id shortened. */
function showLocation(loc: string): string {
  const at = loc.indexOf(":");
  const ref = at < 0 ? loc : loc.slice(0, at);
  const path = at < 0 ? "" : loc.slice(at + 1);
  const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, "?").slice(0, 200);
  return `${OID.test(ref) ? ref.slice(0, 12) : clean(ref)}:${clean(path)}`;
}

function formatHit(h: GrepHit): string {
  const more = h.total > h.locations.length ? ` (+${h.total - h.locations.length} more)` : "";
  return `  files: ${h.locations.map(showLocation).join(", ")}${more}\n  rules: ${h.rules.join(", ")}`;
}

/** One `git grep -E` over `refs`: hit locations and rule ids, or null; throws on scan failure. An empty set is a no-op. */
function grepRefs(dir: string, patterns: string[], caseInsensitive: boolean, refs: string[], label: string, ruleSet: string): GrepHit | null {
  if (patterns.length === 0) return null;
  const flags = ["-I", ...(caseInsensitive ? ["-i"] : []), "-E"];
  const env = { ...process.env, ...REAL_GRAPH };
  // `-l -z`: names only, NUL-separated. The matching line never leaves git.
  const r = Bun.spawnSync(["git", "grep", ...flags, "-l", "-z", ...patterns.flatMap((p) => ["-e", p]), ...refs], { cwd: dir, stdout: "pipe", stderr: "pipe", timeout: GREP_TIMEOUT_MS, env });
  // git grep: 0 = matches, 1 = clean, >1 = error
  if (r.signalCode || (r.exitCode !== 0 && r.exitCode !== 1)) throw new Error(`${label} scan failed (${r.signalCode ?? `exit ${r.exitCode}`})`);
  if (r.exitCode !== 0) return null;
  const all = Array.from(new Set(new TextDecoder().decode(r.stdout).split("\0").filter(Boolean)));
  if (!all.length) return null;
  const locations = all.slice(0, MAX_SHOWN_LOCATIONS);
  // Which rules matched: each pattern alone, over just the shown refs and paths. Bounded; a rule the budget
  // did not reach is reported as unidentified, never guessed.
  const hitRefs = Array.from(new Set(locations.map((l) => l.slice(0, Math.max(0, l.indexOf(":"))) || l)));
  const paths = Array.from(new Set(locations.map((l) => l.slice(l.indexOf(":") + 1)).filter(Boolean))).map((p) => `:(literal)${p}`);
  const rules: string[] = [];
  const started = Date.now();
  for (const [i, p] of patterns.entries()) {
    if (Date.now() - started > RULE_ID_BUDGET_MS) { rules.push(`${ruleSet}-unidentified`); break; }
    const one = Bun.spawnSync(["git", "grep", ...flags, "-q", "-e", p, ...hitRefs, "--", ...paths], { cwd: dir, stdout: "ignore", stderr: "ignore", timeout: GREP_TIMEOUT_MS, env });
    if (one.exitCode === 0) rules.push(`${ruleSet}-${i + 1}`);
  }
  if (!rules.length) rules.push(`${ruleSet}-unidentified`);
  return { locations, total: all.length, rules };
}

/**
 * Deny-scan HEAD, every local branch and tag tip, and full history. Returns null when clean, a report of
 * locations and rule ids on a hit, or an `INCOMPLETE:` line when the scan could not finish (a blocking result).
 */
export function scan(dir: string, patterns: { generic: string[]; user: string[] }): string | null {
  try {
    const hits = (refs: string[], label: string): string | null => {
      for (let offset = 0; offset < refs.length; offset += HISTORY_SCAN_BATCH_SIZE) {
        const batch = refs.slice(offset, offset + HISTORY_SCAN_BATCH_SIZE);
        const hit = grepRefs(dir, patterns.generic, false, batch, label, "generic") ?? grepRefs(dir, patterns.user, true, batch, label, "private");
        if (hit) return formatHit(hit);
      }
      return null;
    };
    const head = hits(["HEAD"], "HEAD");
    if (head) return head;
    // Every local branch and tag tip, always: any of them can be pushed or published.
    const tipRefs = sh(["git", "for-each-ref", "--format=%(objectname)", "refs/heads", "refs/tags"], dir, 30_000);
    if (!tipRefs.ok) throw new Error("for-each-ref failed");
    const tipList = Array.from(new Set(tipRefs.out.split("\n").filter(Boolean)));
    if (tipList.length > 0) {
      const tips = hits(tipList, "branch/tag tips");
      if (tips) return "IN A BRANCH OR TAG TIP:\n" + tips;
    }
    const shallow = sh(["git", "rev-parse", "--is-shallow-repository"], dir, 30_000);
    if (!shallow.ok || shallow.out !== "false") throw new Error("history unavailable: shallow repository or failed shallow check");
    const revs = sh(["git", "rev-list", "HEAD", "--branches", "--tags"], dir, 30_000);
    if (!revs.ok || !revs.out || !revs.out.split("\n").filter(Boolean).every((rev) => OID.test(rev))) {
      throw new Error("history revision enumeration failed or returned invalid output");
    }
    const hist = hits(revs.out.split("\n").filter(Boolean), "history");
    if (hist) return "IN HISTORY (older commit blobs):\n" + hist;
    return null;
  } catch (err) {
    return `INCOMPLETE: ${err instanceof Error ? err.message : String(err)}. Repair the scan and retry; public publication is blocked.`;
  }
}
