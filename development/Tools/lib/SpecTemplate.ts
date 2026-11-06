/**
 * SpecTemplate — the one spec template version, and a spec's computed standing against it
 * (References/SpecFormat.md).
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt): TOOLS/lib/IsaTemplate.ts.
 * `conform()` reads a spec's own sections and says whether it meets the template, naming what
 * is missing. It never trusts the `spec_format:` stamp: a stamp claiming a version the file does
 * not meet is itself a finding (`stamp-unearned`). Only `SpecCheck.ts stamp` writes
 * `spec_format`, and only when conform is clean. Read-only.
 */
import { frontmatter, h2Sections, idsOf, parseClaimsText, parseTestStrategyText, specBody, TOMBSTONE_RE } from "./Spec.ts";

/** The current spec template. Moves only with References/SpecFormat.md. */
export const SPEC_TEMPLATE_VERSION = "1.0.0";

const SEMVER = /^\d+\.\d+\.\d+$/;

/** The frontmatter `checkup:` value: `YYYY-MM-DD <verdict> <n>→<m>`. */
export const CHECKUP_RE = /^(\d{4}-\d{2}-\d{2}) ([A-Za-z][A-Za-z0-9_-]*) (\d+)→(\d+)$/;

export interface ConformMissing { code: string; detail: string }

export interface ConformResult {
  template: string;
  latest: boolean;
  missing: ConformMissing[];
  /** The `spec_format:` stamp, or null when absent or unreadable. */
  stamp: string | null;
  checkup: string | null;
}

/** The template's section order, each with the headings that count as it. Other headings are ignored. */
const ORDER: { name: string; aliases: string[] }[] = [
  { name: "Goal", aliases: ["goal", "ideal state", "summary", "overview"] },
  { name: "Problem", aliases: ["problem", "context", "background"] },
  { name: "Vision", aliases: ["vision"] },
  { name: "Out of Scope", aliases: ["out of scope", "non-goals"] },
  { name: "Principles", aliases: ["principles"] },
  { name: "Constraints", aliases: ["constraints"] },
  { name: "Dependencies", aliases: ["dependencies"] },
  { name: "Criteria", aliases: ["acceptance criteria", "criteria", "requirements"] },
  { name: "Anti-criteria", aliases: ["anti-criteria"] },
  { name: "Open Questions", aliases: ["open questions", "not yet specified"] },
  { name: "Test Strategy", aliases: ["test strategy", "verification plan"] },
  { name: "Features", aliases: ["features"] },
  { name: "Decisions", aliases: ["decisions"] },
  { name: "Learning", aliases: ["learning"] },
  { name: "Status", aliases: ["status"] },
];

function norm(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

function rankOf(title: string): number {
  const t = norm(title);
  return ORDER.findIndex((s) => s.aliases.includes(t));
}

function substance(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** Does this spec meet the current template? Computed from its sections, never from its stamp. */
export function conform(content: string): ConformResult {
  const fm = frontmatter(content);
  const body = specBody(content);
  const found: ConformMissing[] = [];
  const secs = h2Sections(body);
  const sectionText = (name: string): string | null => {
    const s = secs.find((x) => rankOf(x.title) === ORDER.findIndex((o) => o.name === name));
    return s ? body.slice(s.contentStart, s.end) : null;
  };

  const goal = sectionText("Goal");
  if (goal === null || !substance(goal)) found.push({ code: "section-missing", detail: "## Goal is missing or empty (one sentence of what done looks like, and the date the user confirmed it)" });
  else if (!/\b\d{4}-\d{2}-\d{2}\b/.test(goal)) found.push({ code: "goal-unconfirmed", detail: "## Goal carries no confirmation date (write `Confirmed by the user: YYYY-MM-DD`)" });

  const tombstones = new Set([...content.matchAll(TOMBSTONE_RE)].map((m) => m[1]!));
  const claims = [...new Set(parseClaimsText(content).map((c) => c.id))].filter((id) => !tombstones.has(id));
  if (!claims.length) found.push({ code: "no-criteria", detail: "no criteria under ## Acceptance Criteria, ## Criteria or ## Features" });
  const ts = sectionText("Test Strategy");
  if (ts === null || !substance(ts)) found.push({ code: "section-missing", detail: "## Test Strategy is missing or empty" });
  const parsed = parseTestStrategyText(content);
  const probed = idsOf(parsed.probes);
  for (const id of claims) if (!probed.has(id)) found.push({ code: "criterion-no-row", detail: `${id} has no valid Test Strategy row` });
  for (const d of parsed.dropped) found.push({ code: "row-dropped", detail: `${d.reason}: ${d.raw.slice(0, 120)}` });

  // `## Features` holds the criteria in feature mode, so it may also stand in the Criteria slot.
  const FEATURES = ORDER.findIndex((o) => o.name === "Features");
  const CRITERIA = ORDER.findIndex((o) => o.name === "Criteria");
  const TEST_STRATEGY = ORDER.findIndex((o) => o.name === "Test Strategy");
  let maxRank = -1, maxName = "";
  for (const s of secs) {
    let r = rankOf(s.title);
    if (r < 0) continue;
    if (r === FEATURES && maxRank < TEST_STRATEGY) r = Math.max(CRITERIA, maxRank);
    if (r < maxRank) found.push({ code: "order", detail: `## ${ORDER[r]!.name} comes after ## ${maxName}; the template puts it before` });
    else { maxRank = r; maxName = ORDER[r]!.name; }
  }

  const raw = fm.spec_format;
  let stamp: string | null = null;
  if (raw !== undefined) {
    if (!SEMVER.test(raw)) found.push({ code: "stamp-unknown", detail: `spec_format: ${raw} is not a version (want x.y.z)` });
    else {
      stamp = raw;
      if (found.length) found.push({ code: "stamp-unearned", detail: `spec_format claims ${raw} but the spec does not meet template ${SPEC_TEMPLATE_VERSION}` });
    }
  }
  const checkup = fm.checkup ?? null;
  if (checkup !== null && !CHECKUP_RE.test(checkup)) found.push({ code: "checkup-shape", detail: `checkup: "${checkup}" is not YYYY-MM-DD <verdict> <n>→<m>` });

  return { template: SPEC_TEMPLATE_VERSION, latest: found.length === 0, missing: found, stamp, checkup };
}
