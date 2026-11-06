/**
 * inference: one LLM call from a skill's tool, whatever agent or provider the user has.
 *
 * Portable agent-skills library. Canonical copy: agent-skills/tools/portable-lib/.
 * Skills carry a vendored copy in Tools/_portable/; edit the canonical copy and run
 * `python3 tools/lint.py --sync-lib`.
 *
 * Provider choice (first match wins):
 *   1. options.provider, or AGENT_SKILLS_LLM = anthropic-api | openai-api | claude-cli | codex-cli | command
 *   2. AGENT_SKILLS_LLM_CMD set        -> command (prompt on stdin, answer on stdout;
 *                                         e.g. "llm -m gpt-5", "gemini -p", "ollama run qwen3")
 *   3. ANTHROPIC_API_KEY set           -> anthropic-api (Messages API)
 *   4. OPENAI_API_KEY set              -> openai-api (Chat Completions)
 *   5. `claude` on PATH                -> claude-cli (claude -p)
 *   6. `codex` on PATH                 -> codex-cli (codex exec)
 *
 * Models per level: AGENT_SKILLS_MODEL_<LOW|MEDIUM|HIGH|MAX> overrides; otherwise the
 * provider defaults below. `vendor` ("anthropic" | "openai") restricts the choice to that
 * vendor's API or CLI, for tools that need answers from a named vendor.
 *
 * The option and result shapes are a compatible subset of the upstream Inference tool,
 * so ported tools keep their call sites.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getEnv } from "./paths.ts";

export type InferenceLevel = "low" | "medium" | "high" | "max";
export type InferenceProvider = "anthropic-api" | "openai-api" | "claude-cli" | "codex-cli" | "command";
export type InferenceVendor = "anthropic" | "openai" | "anthropic-api";

export interface InferenceOptions {
  systemPrompt?: string;
  userPrompt: string;
  level?: InferenceLevel;
  /** Ask for JSON and parse it into `parsed`. */
  expectJson?: boolean;
  /** Timeout in ms (default by level). */
  timeout?: number;
  /** Restrict to one vendor's API or CLI. */
  vendor?: InferenceVendor;
  /** Force one provider. */
  provider?: InferenceProvider;
  /** Exact model id; overrides the level mapping. */
  model?: string;
  /** Kept for call-site compatibility; providers are not chained. */
  allowVendorFallback?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface InferenceResult {
  success: boolean;
  output: string;
  parsed?: unknown;
  error?: string;
  latencyMs: number;
  level: InferenceLevel;
  provider?: InferenceProvider;
  executedModel?: string;
}

const LEVEL_TIMEOUT: Record<InferenceLevel, number> = { low: 30_000, medium: 60_000, high: 180_000, max: 300_000 };

const DEFAULT_MODELS: Record<"anthropic" | "openai", Record<InferenceLevel, string>> = {
  anthropic: { low: "claude-haiku-5-5", medium: "claude-sonnet-5-5", high: "claude-opus-5-5", max: "claude-fable-5-1" },
  openai: { low: "gpt-5-mini", medium: "gpt-5", high: "gpt-5", max: "gpt-5" },
};

function onPath(bin: string): boolean {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "ignore" });
  return r.status === 0;
}

export function resolveProvider(opts: Pick<InferenceOptions, "provider" | "vendor">): InferenceProvider | undefined {
  const forced = opts.provider ?? (getEnv("AGENT_SKILLS_LLM") as InferenceProvider | undefined);
  if (forced) return forced;
  const anthropic: InferenceProvider[] = [];
  const openai: InferenceProvider[] = [];
  if (getEnv("ANTHROPIC_API_KEY")) anthropic.push("anthropic-api");
  if (getEnv("OPENAI_API_KEY")) openai.push("openai-api");
  if (opts.vendor === "anthropic-api") return anthropic[0];
  if (onPath("claude")) anthropic.push("claude-cli");
  if (onPath("codex")) openai.push("codex-cli");
  if (opts.vendor === "anthropic") return anthropic[0];
  if (opts.vendor === "openai") return openai[0];
  if (getEnv("AGENT_SKILLS_LLM_CMD")) return "command";
  return [...anthropic.filter((p) => p.endsWith("-api")), ...openai.filter((p) => p.endsWith("-api")),
    ...anthropic.filter((p) => p.endsWith("-cli")), ...openai.filter((p) => p.endsWith("-cli"))][0];
}

export function modelFor(provider: InferenceProvider, level: InferenceLevel, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const override = getEnv(`AGENT_SKILLS_MODEL_${level.toUpperCase()}`);
  if (override) return override;
  if (provider === "anthropic-api" || provider === "claude-cli") return DEFAULT_MODELS.anthropic[level];
  if (provider === "openai-api" || provider === "codex-cli") return DEFAULT_MODELS.openai[level];
  return undefined;
}

/** Extracts the first JSON value from a reply (handles ``` fences and leading prose). */
export function parseJsonReply(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[[{]/);
    if (start < 0) throw new Error("no JSON in reply");
    const open = body[start];
    const close = open === "{" ? "}" : "]";
    const end = body.lastIndexOf(close);
    if (end <= start) throw new Error("no complete JSON in reply");
    return JSON.parse(body.slice(start, end + 1));
  }
}

function run(cmd: string, args: string[], stdin: string, timeoutMs: number, signal?: AbortSignal, shell = false):
  Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], shell, signal });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer); resolveRun({ code, stdout, stderr }); });
    child.stdin.end(stdin);
  });
}

async function callAnthropic(model: string, system: string | undefined, user: string, maxTokens: number, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const base = getEnv("ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com";
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": getEnv("ANTHROPIC_API_KEY") ?? "",
      "anthropic-version": "2026-10-21",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: [{ role: "user", content: user }] }),
    signal: signal ?? AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${data?.error?.message ?? JSON.stringify(data)}`);
  if (data.stop_reason === "refusal") throw new Error(`model declined (${data.stop_details?.category ?? "refusal"})`);
  return (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

async function callOpenAi(model: string, system: string | undefined, user: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const base = getEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const messages = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: user }];
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${getEnv("OPENAI_API_KEY") ?? ""}` },
    body: JSON.stringify({ model, messages }),
    signal: signal ?? AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${data?.error?.message ?? JSON.stringify(data)}`);
  return data.choices?.[0]?.message?.content ?? "";
}

export async function inference(options: InferenceOptions): Promise<InferenceResult> {
  const level = options.level ?? "medium";
  const started = Date.now();
  const done = (r: Partial<InferenceResult>): InferenceResult =>
    ({ success: false, output: "", latencyMs: Date.now() - started, level, ...r });
  const provider = resolveProvider(options);
  if (!provider) {
    return done({ error: "no LLM provider: set ANTHROPIC_API_KEY or OPENAI_API_KEY, install the claude or codex CLI, or set AGENT_SKILLS_LLM_CMD" });
  }
  const model = modelFor(provider, level, options.model);
  const timeoutMs = options.timeout ?? LEVEL_TIMEOUT[level];
  const system = options.expectJson
    ? `${options.systemPrompt ?? ""}\n\nReply with one JSON value only, no prose and no code fences.`.trim()
    : options.systemPrompt;
  const joined = system ? `${system}\n\n---\n\n${options.userPrompt}` : options.userPrompt;
  try {
    let output: string;
    if (provider === "anthropic-api") {
      output = await callAnthropic(model!, system, options.userPrompt, options.maxTokens ?? 16_000, timeoutMs, options.signal);
    } else if (provider === "openai-api") {
      output = await callOpenAi(model!, system, options.userPrompt, timeoutMs, options.signal);
    } else if (provider === "claude-cli") {
      const r = await run("claude", ["-p", "--output-format", "text", ...(model ? ["--model", model] : [])], joined, timeoutMs, options.signal);
      if (r.code !== 0) throw new Error(`claude -p exited ${r.code}: ${r.stderr.trim().slice(-400)}`);
      output = r.stdout;
    } else if (provider === "codex-cli") {
      const dir = mkdtempSync(join(tmpdir(), "agent-skills-codex-"));
      const last = join(dir, "last.txt");
      try {
        const r = await run("codex", ["exec", ...(model ? ["--model", model] : []), "--sandbox", "read-only", "--skip-git-repo-check", "-o", last, "-"], joined, timeoutMs, options.signal);
        if (r.code !== 0) throw new Error(`codex exec exited ${r.code}: ${r.stderr.trim().slice(-400)}`);
        output = readFileSync(last, "utf8");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    } else {
      const cmd = getEnv("AGENT_SKILLS_LLM_CMD");
      if (!cmd) throw new Error("AGENT_SKILLS_LLM=command needs AGENT_SKILLS_LLM_CMD");
      const r = await run(cmd, [], joined, timeoutMs, options.signal, true);
      if (r.code !== 0) throw new Error(`${cmd} exited ${r.code}: ${r.stderr.trim().slice(-400)}`);
      output = r.stdout;
    }
    output = output.trim();
    const result = done({ success: true, output, provider, executedModel: model });
    if (options.expectJson) {
      try {
        result.parsed = parseJsonReply(output);
      } catch (e) {
        return done({ output, provider, executedModel: model, error: `JSON parse failed: ${(e as Error).message}` });
      }
    }
    return result;
  } catch (e) {
    return done({ provider, executedModel: model, error: (e as Error).message });
  }
}

/** CLI: bun inference.ts [--level L] [--json] <system> <user> */
if (import.meta.main) {
  const args = process.argv.slice(2);
  let level: InferenceLevel = "medium";
  let json = false;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--level") level = args[++i] as InferenceLevel;
    else if (args[i] === "--json") json = true;
    else rest.push(args[i]);
  }
  const [systemPrompt, userPrompt] = rest.length > 1 ? rest : [undefined, rest[0] ?? ""];
  const r = await inference({ systemPrompt, userPrompt, level, expectJson: json });
  if (!r.success) {
    console.error(r.error);
    process.exit(1);
  }
  console.log(json ? JSON.stringify(r.parsed, null, 2) : r.output);
}
