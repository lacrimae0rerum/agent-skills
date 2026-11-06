#!/usr/bin/env bun
// CfEnv: single-purpose helper used by the cloudflare skill's Deploy, Query and Troubleshoot intents.
// Adapted from the upstream MIT-licensed tool (see LICENSE.txt).
//
// Spawns ONE cf CLI invocation with Cloudflare credentials scoped to the child process only. The
// credentials come from the environment or from $AGENT_SKILLS_HOME/.env (default ~/.agent-skills/.env;
// real env vars win), and only CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are read from that file,
// so no other secret in it reaches cf. The parent shell environment is never touched, and the helper
// refuses any verb outside the allowlist below: this is not a generic credential injector that
// arbitrary callers can use to exfiltrate via cf.
//
// cf is the only Cloudflare CLI this tool runs (no Wrangler). A leading `cf` argument is accepted and ignored, so
// `CfEnv.ts cf deploy` and `CfEnv.ts deploy` are the same call.
//
// Usage (only from the skill's intents, run from the project directory):
//   bun <skill>/Tools/CfEnv.ts deploy
//   bun <skill>/Tools/CfEnv.ts d1 migrations apply <database-id> --dir migrations
//   printf '%s' "$VALUE" | bun <skill>/Tools/CfEnv.ts secret put NAME --name <worker>
//   bun <skill>/Tools/CfEnv.ts secret put NAME --name <worker> --from-env [ENV_KEY]
//
// `secret put` is the one translated verb. cf's `workers secrets update` takes the
// value as a flag, which would put it in the process list. CfEnv instead builds the
// request body and hands it to cf on stdin (`--body @/dev/stdin`), so the value is
// never an argument, never printed, and never returned to the calling session.
// --from-env reads the value from the environment or $AGENT_SKILLS_HOME/.env; without it
// the value comes from CfEnv's own stdin.
//
// Exit code mirrors cf's; 2 is a refusal before anything ran; 10 means the deploy went live but a
// check after it failed (DEPLOYED_BUT_CHECK_FAILED). stdio inherited.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { agentSkillsHome } from "./_portable/paths.ts";
import { cfCommand } from "./CfBin.ts";
import { cfExitForCaller, configWorkerName, declaredSecretNames, DEPLOYED_BUT_CHECK_FAILED, retryReason, THROTTLED } from "./CfEnvChecks.ts";

/** The one cf this tool runs, pinned so a scheduled job and a terminal run the same commands. A bare `bunx cf` uses whatever `cf` is on PATH, and under a scheduler with no ~/.bun/bin fetches the newest release, and a later beta dropped `observability telemetry query`, which a scheduled reader depended on, so every read failed until someone noticed. Move the pin on purpose, after checking the commands callers use. */
export const CF_PACKAGE = "cf@1.0.0-beta.5";
/** Runs the pin's installed bin by full path, never `bunx`, which re-links a shared temp dir per call and broke overlapping calls (CfBin.ts). */
const cfBin = (): string[] => cfCommand(CF_PACKAGE);

const ENV_PATH = join(agentSkillsHome(), ".env");

// Verbs the Deploy, Query and Troubleshoot intents are contracted to invoke.
// Anything else is a bug in the caller (or an exfiltration attempt).
const ALLOWED_VERBS = new Set([
  "deploy", "build", "auth", "workers", "d1", "kv", "r2", "queues", "pages",
  "dns", "zones", "observability", "vectorize", "analytics", "cache", "secret",
  "zero-trust", // Access only; narrowed to access/organizations-list below
]);

// Only these env keys cross into the subprocess from the env file. Adding more here means
// expanding the trust surface: keep this tight.
const NEEDED_KEYS = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];

function parseEnvFile(path: string, required: boolean): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    if (required) {
      console.error(`CfEnv: cannot read ${path}`);
      process.exit(2);
    }
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim().replace(/^export\s+/, "");
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** A value from the real environment first, then from the env file; undefined when neither has it. */
function credential(envFile: Record<string, string>, key: string): string | undefined {
  const fromEnv = process.env[key];
  if (fromEnv) return fromEnv;
  return envFile[key] || undefined;
}

function fail(message: string): never {
  console.error(`CfEnv: ${message}`);
  process.exit(2);
}

/** A check after a successful upload failed: the new version is live, so exit with its own code (CfEnvChecks). */
function failLive(message: string): never {
  console.error(`CfEnv: ${message}`);
  process.exit(DEPLOYED_BUT_CHECK_FAILED);
}

const rawArgs = process.argv.slice(2);
// `--drop-secret NAME` (repeatable) names a live secret the deploy may delete on purpose because
// nothing reads it any more. Only the names given are released; every other undeclared secret
// still stops the deploy. Never reaches cf.
const dropSecrets = new Set<string>();
const withoutDrops: string[] = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] !== "--drop-secret") { withoutDrops.push(rawArgs[i]); continue; }
  const name = rawArgs[++i];
  if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) fail("--drop-secret needs a secret NAME.");
  dropSecrets.add(name);
}
const args = withoutDrops[0] === "cf" ? withoutDrops.slice(1) : withoutDrops;
const verb = args[0];

if (!verb || !ALLOWED_VERBS.has(verb)) {
  console.error(`CfEnv: verb "${verb ?? ""}" not in allowlist.`);
  console.error("Allowed verbs:", Array.from(ALLOWED_VERBS).sort().join(", "));
  console.error("If you need a new verb, update the cloudflare skill's Intents/Deploy.md AND this allowlist.");
  process.exit(2);
}

// A secret never has a dry run. cf's --dry-run prints the request body, and the body is the
// secret value, from stdin or from the env file alike, so a preview would put the value into the
// calling session's output. Refused here, before any stdin or credential is read.
if (verb === "secret" && args.includes("--dry-run")) {
  fail("--dry-run is refused for `secret put`: cf's dry run prints the request body, which is the secret value. Check the name and worker with `workers secrets list --worker <worker>` instead.");
}

// zero-trust is admitted for Access only (applications, policies, identity providers) plus a
// read of the organization, so sign-in gates can be managed. Gateway, tunnels, devices and the
// rest stay out.
if (verb === "zero-trust") {
  const sub = args[1];
  const read = (sub === "organizations" || sub === "identity-providers") && args[2] === "list";
  if (sub !== "access" && !read) {
    fail(`zero-trust is limited to "access …", "organizations list" and "identity-providers list" (got "${args.slice(1, 3).join(" ")}").`);
  }
}

const isDeploy = verb === "deploy" || (verb === "pages" && args[1] === "deploy");

const envFile = parseEnvFile(ENV_PATH, false);
const childEnv: Record<string, string> = { ...(process.env as Record<string, string>) };
for (const key of NEEDED_KEYS) {
  const v = credential(envFile, key);
  if (v) childEnv[key] = v;
}
if (!childEnv.CLOUDFLARE_API_TOKEN) fail(`no CLOUDFLARE_API_TOKEN in the environment or in ${ENV_PATH}`);

// Throttle signal shared by the secrets check and the cf run (see the retry note below).
const MAX_ATTEMPTS = 5;

// Secrets check (a deploy that drops undeclared secrets takes a live app down). cf deploy
// keeps only the secrets cloudflare.config.ts declares as bindings.secret(), and each
// kept value comes from the newest uploaded version, which a rollback does not change.
// Before a deploy: every secret on the live version must be declared, and every declared
// secret needs a value, either on the newest version or in --secrets-file. After it: the
// new version must carry every declared secret. Either failure stops with the names.
const CONFIG_PATH = resolve(process.cwd(), "cloudflare.config.ts");

function cfJson(cfCall: string[]): unknown {
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync(cfBin()[0]!, [...cfBin().slice(1), ...cfCall, "-q"], { env: childEnv, encoding: "utf8" });
    const text = `${r.stdout}${r.stderr}`;
    if (r.status === 0) {
      const start = r.stdout.search(/[[{]/);
      if (start === -1) fail(`secrets check: no JSON from cf ${cfCall.slice(0, 3).join(" ")}.`);
      return JSON.parse(r.stdout.slice(start));
    }
    if (THROTTLED.test(text) && attempt < MAX_ATTEMPTS) {
      Bun.sleepSync(35_000);
      continue;
    }
    if (/not found|10007/i.test(text)) return null;
    fail(`secrets check: cf ${cfCall.slice(0, 3).join(" ")} failed; deploy not attempted.\n${text.slice(0, 400)}`);
  }
}

type NamedBinding = { name: string; type: string };
const SECRET_TYPES = new Set(["secret_text", "secret_key"]);

function latestSecretNames(worker: string): Set<string> {
  const list = (cfJson(["workers", "secrets", "list", "--worker", worker]) ?? []) as NamedBinding[];
  return new Set(list.map((s) => s.name));
}

function liveSecretNames(worker: string): Set<string> {
  const deployments = cfJson(["workers", "deployments", "list", "--worker", worker]) as
    | { deployments?: { versions: { version_id: string }[] }[] }
    | null;
  const live = deployments?.deployments?.[0]?.versions ?? [];
  const names = new Set<string>();
  for (const { version_id } of live) {
    const version = cfJson(["workers", "versions", "get", version_id, "--worker-id", worker]) as { bindings?: NamedBinding[] } | null;
    for (const b of version?.bindings ?? []) if (SECRET_TYPES.has(b.type)) names.add(b.name);
  }
  return names;
}

function secretsFileNames(path: string): Set<string> {
  const text = readFileSync(resolve(process.cwd(), path), "utf8");
  if (text.trimStart().startsWith("{")) return new Set(Object.keys(JSON.parse(text)));
  return new Set(Object.keys(parseEnvFile(resolve(process.cwd(), path), true)));
}

let secretsGate: { worker: string; declared: string[] } | undefined;
// A dry run runs the check too (it reads Cloudflare, writes nothing); only the after-check needs a real deploy.
if (verb === "deploy") {
  let config = "";
  try {
    config = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, "utf8") : "";
  } catch {
    // No cf config here (unconverted or Pages-style project): nothing to check.
  }
  // Both reads skip comments: cf compiles the config, so a commented-out name or secret declares nothing.
  const worker = configWorkerName(config);
  // A config the check cannot read is refused, never skipped: a computed worker name would
  // otherwise let a deploy past this check with no warning.
  if (config && !worker) fail("secrets check: cloudflare.config.ts has no literal worker name (name: \"<worker>\"), so its secrets cannot be checked. Write the name as a string literal.");
  if (worker) {
    const declared = declaredSecretNames(config);
    const fileIndex = args.indexOf("--secrets-file");
    const fromFile = fileIndex === -1 ? new Set<string>() : secretsFileNames(args[fileIndex + 1]);
    const live = liveSecretNames(worker);
    const latest = latestSecretNames(worker);
    const undeclared = [...live].filter((n) => !declared.includes(n) && !dropSecrets.has(n));
    const dropping = [...live].filter((n) => dropSecrets.has(n));
    if (dropping.length) console.error(`CfEnv: ${worker} will drop ${dropping.join(", ")} on purpose (--drop-secret).`);
    if (undeclared.length) {
      fail(`${worker} has live secrets that cloudflare.config.ts does not declare, and cf deploy would delete them: ${undeclared.join(", ")}.\nAdd each as NAME: bindings.secret() under env, then deploy again.`);
    }
    const noValue = declared.filter((n) => !latest.has(n) && !fromFile.has(n));
    if (noValue.length) {
      fail(`${worker}: these declared secrets have no value on the newest version, so the deploy would ship without them: ${noValue.join(", ")}.\nPass --secrets-file <file> with their values (JSON or .env; names beyond the declared set are refused).`);
    }
    const extra = [...fromFile].filter((n) => !declared.includes(n));
    if (extra.length) fail(`--secrets-file holds names the config does not declare: ${extra.join(", ")}. Keep only declared secrets in it.`);
    secretsGate = { worker, declared };
    console.error(`CfEnv: secrets check passed for ${worker} (${declared.length} declared, ${live.size} live).`);
  }
}

let cfArgs = args;
let stdinValue: string | undefined;

if (verb === "secret") {
  // secret put <NAME> --name <worker> [--from-env [ENV_KEY]]
  if (args[1] !== "put") fail("only `secret put` is supported; list with `workers secrets list`.");
  const secretName = args[2];
  if (!secretName || secretName.startsWith("-")) fail("`secret put` needs the secret name.");
  const nameIndex = args.indexOf("--name");
  const worker = nameIndex === -1 ? undefined : args[nameIndex + 1];
  if (!worker || worker.startsWith("-")) fail("`secret put` needs --name <worker>.");

  let value: string;
  const fromEnvIndex = args.indexOf("--from-env");
  if (fromEnvIndex !== -1) {
    const explicitKey = args[fromEnvIndex + 1];
    const sourceKey = explicitKey && !explicitKey.startsWith("-") ? explicitKey : secretName;
    const found = credential(envFile, sourceKey);
    if (!found) fail(`no ${sourceKey} in the environment or in ${ENV_PATH}`);
    console.error(`CfEnv: ${sourceKey} → secret ${secretName} on ${worker}`);
    value = found;
  } else {
    value = readFileSync(0, "utf8").replace(/\r?\n$/, "");
    if (!value) fail("`secret put` read an empty value on stdin.");
  }

  stdinValue = JSON.stringify({ name: secretName, text: value, type: "secret_text" });
  // No --dry-run reaches here: it is refused for `secret` before the value is read (see above).
  cfArgs = ["workers", "secrets", "update", secretName, "--worker", worker, "--type", "secret_text", "--body", "@/dev/stdin", "-q"];
}

// Cloudflare rate-limits the whole account (API error 971 / HTTP 429) and says how long
// to wait. A throttled call is retried after that wait, up to MAX_ATTEMPTS, so a busy
// account never turns a deploy into a manual rerun. Output streams live and is also scanned for the signal.

async function pump(stream: ReadableStream<Uint8Array>, sink: NodeJS.WriteStream): Promise<string> {
  let seen = "";
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    sink.write(chunk);
    seen += decoder.decode(chunk, { stream: true });
  }
  return seen;
}

async function runCf(): Promise<{ code: number; output: string }> {
  const child = Bun.spawn([...cfBin(), ...cfArgs], {
    stdin: stdinValue === undefined ? "inherit" : new TextEncoder().encode(stdinValue),
    stdout: "pipe",
    stderr: "pipe",
    env: childEnv,
  });
  const [out, err] = await Promise.all([pump(child.stdout, process.stdout), pump(child.stderr, process.stderr)]);
  return { code: await child.exited, output: out + err };
}

// A throttle waits what Cloudflare asks; a dropped connection on a deploy waits 10s, then 30s (retryReason).
const NETWORK_WAITS_S = [10, 30];
let attempt = 1;
let networkRetries = 0;
let run = await runCf();
while (run.code !== 0 && attempt < MAX_ATTEMPTS) {
  const reason = retryReason(run.output, isDeploy);
  let waitS: number;
  if (reason === "throttled") {
    const retryAfter = Number(run.output.match(/wait (\d+) second/)?.[1] ?? 30);
    waitS = Math.min(Math.max(retryAfter, 5), 120) + 2;
    console.error(`CfEnv: Cloudflare throttled the account; retrying in ${waitS}s (attempt ${attempt + 1} of ${MAX_ATTEMPTS}).`);
  } else if (reason === "network" && networkRetries < NETWORK_WAITS_S.length) {
    waitS = NETWORK_WAITS_S[networkRetries++]!;
    console.error(`CfEnv: the connection to Cloudflare dropped mid-deploy; retrying the deploy in ${waitS}s (attempt ${attempt + 1}).`);
  } else break;
  await Bun.sleep(waitS * 1000);
  attempt += 1;
  run = await runCf();
}

const realDeploy = isDeploy && !args.includes("--dry-run");
let secretsLost: string[] = [];
if (run.code === 0 && secretsGate && realDeploy) {
  const kept = latestSecretNames(secretsGate.worker);
  secretsLost = secretsGate.declared.filter((n) => !kept.has(n));
  if (!secretsLost.length) console.error(`CfEnv: ${secretsGate.worker} carries all ${secretsGate.declared.length} declared secrets after the deploy.`);
}

// After a real Worker deploy: the version that went live and the one before it, so the report
// carries the version ID and a rollback is one command.
let previous: string | null = null;
if (realDeploy && run.code === 0 && secretsGate) {
  // Not cfJson: its fail() would report a deploy that already succeeded as a failure.
  const r = spawnSync(cfBin()[0]!, [...cfBin().slice(1), "workers", "deployments", "list", "--worker", secretsGate.worker, "-q"], { env: childEnv, encoding: "utf8" });
  try {
    const d = JSON.parse((r.stdout ?? "").slice((r.stdout ?? "").search(/[[{]/))) as { deployments?: { versions: { version_id: string }[] }[] };
    const versionId = d.deployments?.[0]?.versions?.[0]?.version_id ?? null;
    previous = d.deployments?.[1]?.versions?.[0]?.version_id ?? null;
    console.error(`CfEnv: ${secretsGate.worker} live version ${versionId ?? "unknown"} (previous ${previous ?? "none"}).`);
  } catch {
    console.error("CfEnv: could not read the new version id; the deploy itself succeeded. Read it with `workers deployments list`.");
  }
}

const rollback = secretsGate ? ` Roll back: CfEnv.ts workers deployments create --worker ${secretsGate.worker} with ${previous ?? "the previous version (workers deployments list)"}.` : "";
if (secretsLost.length) failLive(`DEPLOYED WITHOUT SECRETS: ${secretsGate!.worker} is live missing ${secretsLost.join(", ")}.${rollback}`);

process.exit(cfExitForCaller(run.code));
