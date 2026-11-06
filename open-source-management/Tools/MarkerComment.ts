#!/usr/bin/env bun
/**
 * MarkerComment.ts — upsert a single bot-authored comment on a GitHub issue or PR.
 *
 * Identity is carried by an HTML-comment marker on the FIRST line of the body:
 *   <!-- agent-marker:<id> -->
 *
 * `upsert` finds the existing comment matching the marker and PATCHes it; if no
 * match, POSTs a new comment. Idempotent: rerunning with the same body produces
 * no new comment, only an in-place edit.
 *
 * All GitHub I/O goes through `gh api` — never raw curl, never custom Bearer
 * headers. Auth comes from the user's existing `gh` CLI session.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { agentName, attribute } from "./lib/AgentComment.ts";

export const MARKER_ID_RE = /^[a-z0-9-]{1,40}$/;
export const MARKER_PREFIX = "agent-marker";
const ANY_MARKER_RE = /<!--\s*(agent-marker):([a-z0-9-]{1,40})\s*-->/;
export const FOOTER = `_Bot-authored by ${agentName()} via the open-source-management agent skill — this comment edits in place._`;
export const BODY_LIMIT = 65000;

/** A body the tool refuses to post: a foreign marker, or over the length budget. */
export class BodyError extends Error {}

type UpsertResult = { action: "created" | "edited" | "would-create" | "would-edit"; commentId: string };

function usage(): string {
  return `MarkerComment.ts — upsert/find a marker-backed bot comment on a GitHub issue or PR.

Subcommands:
  upsert <repo> <number> <marker-id> <body-file> [--dry-run]
      <body-file>: path to a markdown file, or '-' for stdin
      Marker line and footer are added automatically if missing.

  find <repo> <number> <marker-id>
      Print the matching comment id (exit 0) or nothing (exit 1).

  --help
      Print this message.

Marker format: <!-- agent-marker:<id> -->  (id matches /^[a-z0-9-]{1,40}$/)

Posting is public and permanent in the timeline: confirm the exact comment with the
user, run with --dry-run first, then post.

Examples:
  bun run MarkerComment.ts upsert <owner>/<repo> 42 triage-status note.md
  echo "thanks for the report" | bun run MarkerComment.ts upsert <owner>/<repo> 42 triage-status -
  bun run MarkerComment.ts find <owner>/<repo> 42 triage-status
`;
}

function logLine(line: string): void {
  process.stderr.write(line + "\n");
}

/** Reports the action on stderr; this tool keeps no run log of its own. */
function appendExecLog(action: string, status: "ok" | "error", input: string): void {
  logLine(`marker-comment | ${action} | ${status} | ${input}`);
}

function ghApi(args: string[], stdinJson?: unknown): { stdout: string; stderr: string; code: number } {
  const result = spawnSync("gh", ["api", ...args], {
    input: stdinJson === undefined ? undefined : JSON.stringify(stdinJson),
    encoding: "utf8",
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: result.status ?? 1,
  };
}

function readBody(path: string): string {
  if (path === "-") return readFileSync(0, "utf8");
  return readFileSync(path, "utf8");
}

export function markerLine(id: string): string {
  return `<!-- ${MARKER_PREFIX}:${id} -->`;
}

function startsWithLine(body: string, line: string): boolean {
  return body === line || body.startsWith(line + "\n") || body.startsWith(line + "\r\n");
}

/**
 * Pure: adds the marker line and footer when missing; throws BodyError on a foreign marker or
 * an over-long body.
 */
export function buildBody(rawBody: string, markerId: string): string {
  const marker = markerLine(markerId);
  const conflict = rawBody.match(ANY_MARKER_RE);
  if (conflict && conflict[2] !== markerId) {
    throw new BodyError(`marker-conflict | body contains ${conflict[1]}:${conflict[2]} but tool was called with ${markerId}`);
  }
  const hasMarker = startsWithLine(rawBody, marker);
  const hasFooter = rawBody.includes(FOOTER);
  const trimmed = rawBody.replace(/\s+$/, "");
  // The agent attribution sits right after the marker, which must stay the first line (2026-10-26).
  const rest = hasMarker ? trimmed.slice(marker.length).replace(/^\s+/, "") : trimmed;
  const withMarker = `${marker}\n\n${attribute(rest)}`;
  const withFooter = hasFooter ? withMarker : `${withMarker}\n\n---\n${FOOTER}`;
  if (withFooter.length > BODY_LIMIT) {
    throw new BodyError(`body-too-long | ${withFooter.length} chars exceeds ${BODY_LIMIT} budget (GitHub hard cap 65536)`);
  }
  return withFooter;
}

function authoredBy(): string | null {
  const result = spawnSync("gh", ["api", "user", "-q", ".login"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const login = (result.stdout ?? "").trim();
  return login || null;
}

/**
 * Pure: the jq filter that emits the id of each of our own comments whose body starts with the
 * marker. With `--paginate` gh runs the filter once per page, so it must
 * emit nothing for a page with no match (a per-page `first | tostring` printed "null" for every
 * such page and broke the id on busy issues). The caller takes the first emitted line.
 */
export function markerFilter(login: string, markerId: string): string {
  return `.[] | select(.user.login == "${login}") | select(.body | startswith("${markerLine(markerId)}")) | .id | tostring`;
}

/** Pure: the first comment id in (possibly multi-page) filter output, or null when no page matched. */
export function firstId(stdout: string): string | null {
  return stdout.split("\n").map((l) => l.trim()).find((l) => /^\d+$/.test(l)) ?? null;
}

function findExistingId(repo: string, issueNumber: string, markerId: string): string | null {
  const me = authoredBy();
  if (!me) {
    logLine(`marker-comment | auth-failed | gh api user returned no login — check 'gh auth status'`);
    process.exit(1);
  }
  // Author-scoped marker match defeats quote-reply spoofing: a contributor who
  // "Quote replies" our comment will preserve the marker but their comment is
  // authored by them, not us, so it filters out cleanly.
  const result = ghApi([
    `repos/${repo}/issues/${issueNumber}/comments`,
    "--paginate",
    "-q",
    markerFilter(me, markerId),
  ]);
  if (result.code !== 0) {
    logLine(`marker-comment | find-failed | ${repo} | #${issueNumber} | ${markerId} | ${result.stderr.trim()}`);
    process.exit(1);
  }
  return firstId(result.stdout);
}

function upsert(repo: string, issueNumber: string, markerId: string, bodyPath: string, dryRun: boolean): UpsertResult {
  if (!MARKER_ID_RE.test(markerId)) {
    logLine(`marker-comment | bad-marker | ${markerId} | must match /^[a-z0-9-]{1,40}$/`);
    process.exit(2);
  }
  const rawBody = readBody(bodyPath);
  let finalBody: string;
  try {
    finalBody = buildBody(rawBody, markerId);
  } catch (e) {
    if (!(e instanceof BodyError)) throw e;
    logLine(`marker-comment | ${e.message}`);
    process.exit(2);
  }
  const existingId = findExistingId(repo, issueNumber, markerId);

  if (dryRun) {
    const action = existingId ? "would-edit" : "would-create";
    const id = existingId ?? "(new)";
    logLine(`marker-comment | ${action} | ${repo} | #${issueNumber} | ${markerId} | ${id}`);
    process.stdout.write(finalBody + "\n");
    return { action, commentId: id };
  }

  if (existingId) {
    const result = ghApi(
      [`repos/${repo}/issues/comments/${existingId}`, "-X", "PATCH", "--input", "-"],
      { body: finalBody },
    );
    if (result.code !== 0) {
      logLine(`marker-comment | edit-failed | ${repo} | #${issueNumber} | ${markerId} | ${result.stderr.trim()}`);
      appendExecLog("edit-failed", "error", `${repo}#${issueNumber} ${markerId}`);
      process.exit(1);
    }
    logLine(`marker-comment | edited | ${repo} | #${issueNumber} | ${markerId} | ${existingId}`);
    appendExecLog("edited", "ok", `${repo}#${issueNumber} ${markerId}`);
    return { action: "edited", commentId: existingId };
  }

  const result = ghApi(
    [`repos/${repo}/issues/${issueNumber}/comments`, "-X", "POST", "--input", "-"],
    { body: finalBody },
  );
  if (result.code !== 0) {
    logLine(`marker-comment | create-failed | ${repo} | #${issueNumber} | ${markerId} | ${result.stderr.trim()}`);
    appendExecLog("create-failed", "error", `${repo}#${issueNumber} ${markerId}`);
    process.exit(1);
  }
  const created = JSON.parse(result.stdout) as { id: number };
  logLine(`marker-comment | created | ${repo} | #${issueNumber} | ${markerId} | ${created.id}`);
  appendExecLog("created", "ok", `${repo}#${issueNumber} ${markerId}`);
  return { action: "created", commentId: String(created.id) };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(usage());
    process.exit(0);
  }
  const sub = argv[0];

  if (sub === "find") {
    const [, repo, num, markerId] = argv;
    if (!repo || !num || !markerId) {
      process.stderr.write(usage());
      process.exit(2);
    }
    if (!MARKER_ID_RE.test(markerId)) {
      logLine(`marker-comment | bad-marker | ${markerId} | must match /^[a-z0-9-]{1,40}$/`);
      process.exit(2);
    }
    const id = findExistingId(repo, num, markerId);
    if (!id) process.exit(1);
    process.stdout.write(id + "\n");
    process.exit(0);
  }

  if (sub === "upsert") {
    const [, repo, num, markerId, bodyPath, ...rest] = argv;
    if (!repo || !num || !markerId || !bodyPath) {
      process.stderr.write(usage());
      process.exit(2);
    }
    const dryRun = rest.includes("--dry-run");
    upsert(repo, num, markerId, bodyPath, dryRun);
    process.exit(0);
  }

  process.stderr.write(usage());
  process.exit(2);
}

if (import.meta.main) main();
