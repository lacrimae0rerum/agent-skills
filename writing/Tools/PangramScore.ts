#!/usr/bin/env bun
/**
 * PangramScore.ts — score text for AI-detectability via the Pangram API.
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt)
 * The upstream run-record file is dropped; every other behaviour is kept.
 *
 * Use it as a voice-eval probe: feed in anyone's writing and get back how much of
 * it reads as AI-generated. Lower fraction_ai = sounds more human.
 *
 * Two-step async flow (from the official docs, June 2026):
 *   1. POST https://text.external-api.pangram.com/task  -> { task_id }
 *      headers: Content-Type: application/json, x-api-key: <key>
 *      body:    { "text": "...", "public_dashboard_link": false }
 *   2. GET  https://text.external-api.pangram.com/task/<task_id>  (poll)
 *      done when stage === "STAGE_SUCCESS" | "STAGE_FAILED"
 * Docs: https://docs.pangram.com/quickstart-rest
 *
 * Key: PANGRAM_API_KEY in the environment or in $AGENT_SKILLS_HOME/.env.
 * Override the endpoint with PANGRAM_API_URL if Pangram moves it; the override must still be an https
 * URL on an approved Pangram host (resolvePangramUrl), because that URL receives the key and the text.
 * Each call is billed by Pangram (roughly $0.05 per 1,000 words).
 */

import { readFileSync } from "node:fs";
import { getEnv } from "./_portable/paths.ts";

const DEFAULT_URL = "https://text.external-api.pangram.com/task";

/** Hosts that may receive the Pangram key and the submitted text. HTTPS only. */
export const APPROVED_PANGRAM_HOSTS: readonly string[] = ["text.external-api.pangram.com"];

/**
 * The endpoint the key and the text are sent to, or an Error. An override (PANGRAM_API_URL) is honoured only
 * when it is an https URL on an approved host, with no embedded credentials and no non-default port: a
 * caller-controlled URL must never receive the credential. Redirects are refused at the fetch sites.
 */
export function resolvePangramUrl(override: string | undefined = getEnv("PANGRAM_API_URL")): string {
  const raw = override && override.length > 0 ? override : DEFAULT_URL;
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`PANGRAM_API_URL is not a valid URL: refusing to send the key or text`); }
  if (u.protocol !== "https:") throw new Error(`PANGRAM_API_URL must be https (got ${u.protocol.replace(":", "")}): refusing to send the key or text`);
  if (u.username || u.password) throw new Error("PANGRAM_API_URL must not embed credentials");
  if (u.port) throw new Error("PANGRAM_API_URL must use the default https port");
  if (!APPROVED_PANGRAM_HOSTS.includes(u.hostname.toLowerCase())) throw new Error(`PANGRAM_API_URL host ${u.hostname} is not an approved Pangram origin: refusing to send the key or text`);
  return u.toString().replace(/\/+$/, "");
}

function loadKey(): string {
  const key = getEnv("PANGRAM_API_KEY");
  if (key) return key;
  console.error("No PANGRAM_API_KEY found. Export it or add it to $AGENT_SKILLS_HOME/.env (default ~/.agent-skills/.env), then re-run.");
  process.exit(1);
}

function usage(): never {
  console.error(`Usage:
  bun PangramScore.ts "text to score"
  bun PangramScore.ts --file path/to/sample.md
  echo "text" | bun PangramScore.ts
  ... add --json for the raw response`);
  process.exit(1);
}

async function readInput(args: string[]): Promise<string> {
  const fileFlag = args.indexOf("--file");
  if (fileFlag !== -1) {
    const p = args[fileFlag + 1];
    if (!p) usage();
    return readFileSync(p, "utf8");
  }
  const positional = args.filter((a) => a !== "--json");
  if (positional.length) return positional.join(" ");
  if (!process.stdin.isTTY) return await Bun.stdin.text();
  usage();
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const text = (await readInput(args)).trim();
  if (!text) usage();

  const url = resolvePangramUrl();
  const key = loadKey();

  // Step 1: submit the task.
  const submit = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ text, public_dashboard_link: false }),
    signal: AbortSignal.timeout(30_000),
    redirect: "manual", // a redirect would carry the key to another origin
  });
  if (submit.status >= 300 && submit.status < 400) {
    console.error(`Pangram submit redirected (${submit.status}): refusing to follow, the key stays on the approved origin.`);
    process.exit(1);
  }
  if (!submit.ok) {
    console.error(`Pangram submit ${submit.status}: ${await submit.text()}`);
    process.exit(1);
  }
  const { task_id } = (await submit.json()) as { task_id?: string };
  if (!task_id) {
    console.error("No task_id returned from submit.");
    process.exit(1);
  }

  // Step 2: poll until terminal stage (STAGE_SUCCESS | STAGE_FAILED).
  let data: any = {};
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const poll = await fetch(`${url}/${encodeURIComponent(task_id)}`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(15_000), redirect: "manual" });
    if (poll.status >= 300 && poll.status < 400) {
      console.error(`Pangram poll redirected (${poll.status}): refusing to follow, the key stays on the approved origin.`);
      process.exit(1);
    }
    if (!poll.ok) {
      console.error(`Pangram poll ${poll.status}: ${await poll.text()}`);
      process.exit(1);
    }
    data = await poll.json();
    if (data.stage === "STAGE_SUCCESS" || data.stage === "STAGE_FAILED") break;
    await Bun.sleep(1000);
  }
  if (data.stage === "STAGE_FAILED") {
    console.error(`Pangram task failed: ${data.error ?? JSON.stringify(data)}`);
    process.exit(1);
  }
  // Anything that is not STAGE_SUCCESS is NOT a measurement. The poll loop can fall out on the
  // 60s deadline while the task is still running; fail closed: no score block, non-zero exit.
  if (data.stage !== "STAGE_SUCCESS") {
    console.error(
      `Pangram task did not complete: stage="${data.stage ?? "unknown"}" (no score). ` +
      `The task may still be running — re-run, or inspect with --json.`,
    );
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const pct = (n: unknown) => (typeof n === "number" ? `${(n * 100).toFixed(1)}%` : "—");
  console.log(`Headline:   ${data.headline ?? data.prediction_short ?? "—"}`);
  console.log(`Verdict:    ${data.prediction ?? "—"}`);
  console.log(`AI:         ${pct(data.fraction_ai)}`);
  console.log(`AI-assisted:${pct(data.fraction_ai_assisted)}`);
  console.log(`Human:      ${pct(data.fraction_human)}`);
  console.log(`Segments:   ${data.num_ai_segments ?? 0} AI / ${data.num_ai_assisted_segments ?? 0} assisted / ${data.num_human_segments ?? 0} human`);
  console.log(`\n→ Lower AI% = reads more human.`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
