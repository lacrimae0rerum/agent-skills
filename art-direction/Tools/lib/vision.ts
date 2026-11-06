// Adapted from the upstream MIT-licensed tool (see LICENSE.txt): skills/Assay/Tools/{OpenAIVision,AnthropicVision,Judge}.ts, ASSAY/JudgeCall.ts and TOOLS/Inference.ts.
/**
 * vision: the critique's one image-judge transport. One call per (vendor, image, prompt); the caller owns retries,
 * bounds and verdict parsing.
 *
 *   openai     OPENAI_API_KEY set  -> Responses API (input_image, detail high, reasoning effort low)
 *              else `codex` on PATH -> `codex exec -i <image>` in a read-only sandbox (the CLI's own login)
 *   anthropic  ANTHROPIC_API_KEY set -> Messages API (base64 image block)
 *              else `claude` on PATH -> `claude --print` with the image as an inline stream-json image block
 *   google     GOOGLE_API_KEY set   -> Gemini generateContent (inline_data)
 *
 * Models: OPENAI_VISION_MODEL, ANTHROPIC_VISION_MODEL, GEMINI_VISION_MODEL override the defaults below.
 * Provider error bodies are never echoed: they may carry private request content.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { getEnv } from '../_portable/paths.ts';

export type VisionVendor = 'google' | 'openai' | 'anthropic';
export interface VisionResponse { text: string; executed_model?: string }
/** Test seam: every API transport takes `fetch`, so a test never touches the network. */
export interface VisionDeps { fetch?: typeof fetch; timeoutMs?: number }

export const DEFAULT_OPENAI_VISION_MODEL = 'gpt-6.1-sol';
export const DEFAULT_ANTHROPIC_VISION_MODEL = 'claude-opus-5-5';
export const DEFAULT_GEMINI_VISION_MODEL = 'gemini-3.8-flash';
export function openaiJudgeModel(): string { return getEnv('OPENAI_VISION_MODEL') ?? DEFAULT_OPENAI_VISION_MODEL; }
export function anthropicJudgeModel(): string { return getEnv('ANTHROPIC_VISION_MODEL') ?? DEFAULT_ANTHROPIC_VISION_MODEL; }
export function geminiJudgeModel(): string { return getEnv('GEMINI_VISION_MODEL') ?? DEFAULT_GEMINI_VISION_MODEL; }

/** The Anthropic seat runs the high rung, at low reasoning effort, to mirror the OpenAI seat. Kept for importers. */
export const ANTHROPIC_JUDGE_LEVEL = 'high' as const;
/** Said by the Anthropic judge when the image did not attach, so a blind answer is never scored. */
export const IMAGE_UNAVAILABLE = 'IMAGE_UNAVAILABLE';
/** Calls allowed for one Anthropic vision answer when the model reports it cannot see the attached image. */
export const IMAGE_UNAVAILABLE_ATTEMPTS = 3;
/** One Anthropic call's own ceiling; callers that bound an attempt add the CLI spawn time on top. */
export const ANTHROPIC_CALL_MS = 170_000;
/** A rubric read over a four-frame sheet can run past three minutes at the judge's reasoning level. */
export const OPENAI_VISION_TIMEOUT_MS = 360_000;
export const GEMINI_CALL_MS = 60_000;
/** Raw-byte cap for an inline image: its base64 form must stay under the Messages API's 5 MB image limit. */
export const INLINE_IMAGE_MAX_BYTES = 3_750_000;
const ANTHROPIC_VISION_SYSTEM = `You are a vision judge. The image to judge is attached to the user message. Look at it before answering, then answer exactly as the user message asks. If no image is visible to you, reply with exactly ${IMAGE_UNAVAILABLE} and nothing else.`;

/**
 * Every pixel egress path checks this before credentials, image reads, or network.
 * The identity guard is a filename heuristic (a path containing "headshot"), not face detection: a face photo under
 * another name passes, so identity-bearing images must be kept out of judged sets by their owner.
 */
export function guardVisionRequest(file: string, allowIdentity = false): void {
  if (!allowIdentity && /headshot/i.test(file)) throw new Error('identity guard: identity-bearing image requires explicit clearance (--allow-identity)');
}

/** Pull the last balanced {...} JSON object out of a text blob. Robust to fences + prose. */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  const candidates: string[] = [];
  if (fenced) for (const f of fenced) candidates.push(f.replace(/```(?:json)?/gi, '').trim());
  // Scan complete top-level objects, respecting braces inside JSON strings.
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (start < 0) { if (c === '{') { start = i; depth = 1; } continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { candidates.push(text.slice(start, i + 1)); start = -1; }
  }
  for (const c of candidates.reverse()) {
    try { return JSON.parse(c); } catch { /* try next */ }
  }
  return null;
}

export function mime(file: string): string {
  const e = extname(file).toLowerCase();
  return e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : 'image/jpeg';
}

/** The image format from its magic bytes, or null when it is not one the vision APIs take inline. */
export function sniffImageMediaType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, k) => bytes[i + k] === b);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

function inlineImage(file: string): { media_type: string; data: string } {
  const bytes = readFileSync(file);
  const media = sniffImageMediaType(bytes);
  if (!media) throw new Error(`not a PNG, JPEG, GIF or WebP image: ${file}`);
  if (bytes.length > INLINE_IMAGE_MAX_BYTES) throw new Error(`image over ${INLINE_IMAGE_MAX_BYTES} bytes cannot be sent inline: ${file}`);
  return { media_type: media, data: Buffer.from(bytes).toString('base64') };
}

function onPath(bin: string): string | null {
  if (typeof Bun !== 'undefined') return Bun.which(bin);
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n')[0]!.trim() || null : null;
}

/** The codex CLI and its saved login (CODEX_HOME or ~/.codex). */
function codexReady(): boolean {
  const home = getEnv('CODEX_HOME') ?? join(homedir(), '.codex');
  return onPath('codex') !== null && existsSync(join(home, 'auth.json'));
}

/** Whether this machine can reach a vendor's vision judge (a key, or a signed-in CLI). No call is made. */
export function vendorReachable(vendor: VisionVendor): boolean {
  if (vendor === 'openai') return Boolean(getEnv('OPENAI_API_KEY')) || codexReady();
  if (vendor === 'anthropic') return Boolean(getEnv('ANTHROPIC_API_KEY')) || onPath('claude') !== null;
  return Boolean(getEnv('GOOGLE_API_KEY'));
}

function run(cmd: string, args: string[], stdin: string, timeoutMs: number, env: NodeJS.ProcessEnv = process.env, cwd?: string): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((accept, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); accept({ code, stdout, stderr, timedOut }); });
    child.stdin.end(stdin);
  });
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

/** The Responses API payload for one image judgment. */
export function openAiVisionBody(prompt: string, bytes: Uint8Array, mimeType: string, model = openaiJudgeModel()) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error('unsupported vision image MIME type');
  return {
    model,
    reasoning: { effort: 'low' },
    store: false,
    max_output_tokens: 2048,
    input: [{ role: 'user', content: [
      { type: 'input_text', text: prompt },
      { type: 'input_image', image_url: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`, detail: 'high' },
    ] }],
  };
}

export function openAiVisionResponseOf(value: unknown): VisionResponse {
  const j = value as { status?: unknown; error?: unknown; model?: unknown; output?: { type?: string; content?: { type?: string; text?: unknown }[] }[] } | null;
  if (!j || typeof j !== 'object' || j.error || (j.status !== undefined && j.status !== 'completed')) throw new Error('OpenAI vision response incomplete or failed');
  const text = (Array.isArray(j.output) ? j.output : []).filter((x) => x?.type === 'message')
    .flatMap((m) => Array.isArray(m.content) ? m.content : [])
    .filter((c) => c?.type === 'output_text' && typeof c.text === 'string').map((c) => c.text as string).join('\n').trim();
  if (!text) throw new Error('OpenAI vision response returned no text');
  return { text, ...(typeof j.model === 'string' && j.model.trim() ? { executed_model: j.model } : {}) };
}

export async function openAiVision(file: string, prompt: string, allowIdentity = false, deps: VisionDeps = {}): Promise<VisionResponse> {
  guardVisionRequest(file, allowIdentity);
  const ext = extname(file).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new Error('unsupported OpenAI vision image extension');
  const timeoutMs = deps.timeoutMs ?? OPENAI_VISION_TIMEOUT_MS;
  const key = getEnv('OPENAI_API_KEY');
  if (key) {
    const base = getEnv('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1';
    const res = await (deps.fetch ?? fetch)(`${base}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(openAiVisionBody(prompt, readFileSync(file), mime(file))),
      signal: AbortSignal.timeout(timeoutMs),
    });
    // The status only: a response body can echo private request content.
    if (!res.ok) throw new Error(`OpenAI vision ${res.status}`);
    return openAiVisionResponseOf(await res.json());
  }
  if (!codexReady()) throw new Error('OpenAI vision unreachable: set OPENAI_API_KEY, or install the codex CLI and sign in (codex login)');
  const dir = mkdtempSync(join(tmpdir(), 'art-direction-codex-'));
  const last = join(dir, 'last.txt');
  try {
    const t0 = Date.now();
    const r = await run('codex', ['exec', '--model', openaiJudgeModel(), '-c', 'model_reasoning_effort=low', '--sandbox', 'read-only', '--skip-git-repo-check', '--cd', dir, '-o', last, '-i', resolve(file), '-'], prompt, timeoutMs);
    const output = existsSync(last) ? readFileSync(last, 'utf8').trim() : '';
    if (r.code !== 0 || !output) throw new Error(r.timedOut || Date.now() - t0 >= timeoutMs - 1000 ? `OpenAI vision (codex) timed out after ${timeoutMs / 1000} s` : 'OpenAI vision (codex) failed');
    // codex exec reports no executed model, so none is claimed; callers record the requested model separately.
    return { text: output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

/** The trailing `type:"result"` envelope of a `claude --print` stream-json run. */
export function claudeResultEnvelope(stdout: string): Record<string, unknown> | null {
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (!line.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed && parsed.type === 'result') return parsed;
    } catch { /* not this line */ }
  }
  return null;
}

/** The answering model from a claude envelope's modelUsage: the highest-output non-utility model. */
function executedClaudeModel(modelUsage: unknown): string | undefined {
  if (!modelUsage || typeof modelUsage !== 'object') return undefined;
  const keys = Object.keys(modelUsage as Record<string, unknown>);
  const pool = keys.filter((k) => !k.includes('haiku')).length ? keys.filter((k) => !k.includes('haiku')) : keys;
  let best: string | undefined, bestOut = -1;
  for (const k of pool) {
    const out = Number((modelUsage as Record<string, { outputTokens?: unknown }>)[k]?.outputTokens ?? 0);
    if (out > bestOut) { best = k; bestOut = out; }
  }
  return best;
}

async function anthropicOnce(file: string, prompt: string, deps: VisionDeps): Promise<VisionResponse> {
  const image = inlineImage(file);
  const model = anthropicJudgeModel();
  const timeoutMs = deps.timeoutMs ?? ANTHROPIC_CALL_MS;
  const key = getEnv('ANTHROPIC_API_KEY');
  if (key) {
    const base = getEnv('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com';
    const res = await (deps.fetch ?? fetch)(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21' },
      body: JSON.stringify({ model, max_tokens: 4096, system: ANTHROPIC_VISION_SYSTEM, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
        { type: 'text', text: prompt },
      ] }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Anthropic vision ${res.status}`);
    const data = await res.json() as { model?: unknown; stop_reason?: unknown; content?: { type?: string; text?: string }[] };
    if (data.stop_reason === 'refusal') throw new Error('Anthropic vision: the model declined');
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    return { text, ...(typeof data.model === 'string' && data.model ? { executed_model: data.model } : {}) };
  }
  const claude = onPath('claude');
  if (!claude) throw new Error('Anthropic vision unreachable: set ANTHROPIC_API_KEY, or install the claude CLI and sign in');
  // The image rides inline as a base64 block on every call: an @path mention would depend on the model choosing to read it.
  const message = JSON.stringify({ type: 'user', message: { role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
    { type: 'text', text: /^\s*\//.test(prompt) ? `User message: ${prompt}` : prompt },
  ] } }) + '\n';
  const env = { ...process.env };
  delete env.CLAUDECODE; // a nested claude must not trip the nested-session guard
  const r = await run(claude, ['--print', '--model', model, '--tools', '', '--strict-mcp-config', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--system-prompt', ANTHROPIC_VISION_SYSTEM], message, timeoutMs, env);
  if (r.timedOut) throw new Error(`Anthropic vision (claude CLI) timed out after ${timeoutMs / 1000} s`);
  const envelope = claudeResultEnvelope(r.stdout);
  if (r.code !== 0 || !envelope || envelope.is_error === true || typeof envelope.result !== 'string') throw new Error('Anthropic vision (claude CLI) failed');
  const executed = executedClaudeModel(envelope.modelUsage);
  return { text: envelope.result.trim(), ...(executed ? { executed_model: executed } : {}) };
}

/**
 * Anthropic vision. The user prompt is the caller's exact prompt, the same one the OpenAI seat gets, so the two answers
 * are comparable. Never falls back to another vendor. A blind IMAGE_UNAVAILABLE reply gets fresh calls before it counts
 * as a failure.
 */
export async function anthropicVision(file: string, prompt: string, allowIdentity = false, deps: VisionDeps = {}): Promise<VisionResponse> {
  guardVisionRequest(file, allowIdentity);
  for (let attempt = 1; ; attempt++) {
    const response = await anthropicOnce(file, prompt, deps);
    if (!response.text) throw new Error('Anthropic vision returned no text');
    if (response.text === IMAGE_UNAVAILABLE) {
      if (attempt < IMAGE_UNAVAILABLE_ATTEMPTS) continue;
      throw new Error(`Anthropic vision: the judge could not see the image (${attempt} attempts)`);
    }
    return response;
  }
}

// ── Google ────────────────────────────────────────────────────────────────────

const GEMINI_API = 'https://generativelanguage.googleapis.com';

/** Preserve the provider's model metadata; absence is unknown, never the requested model. */
export function visionResponseOf(j: { modelVersion?: unknown; candidates?: { content?: { parts?: { text?: string }[] } }[] }): VisionResponse {
  return {
    text: j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
    ...(typeof j.modelVersion === 'string' && j.modelVersion.trim() ? { executed_model: j.modelVersion } : {}),
  };
}

/** One fresh, single-turn request: no history, nothing from whichever call generated the image. Pure. */
export function geminiBody(parts: unknown[]): { contents: { parts: unknown[] }[]; generationConfig: { temperature: number } } {
  return { contents: [{ parts }], generationConfig: { temperature: 0.1 } };
}

export function imgPart(file: string): unknown {
  return { inline_data: { mime_type: mime(file), data: Buffer.from(readFileSync(file)).toString('base64') } };
}

export async function gemini(parts: unknown[], observed?: { executed_model?: string }, deps: VisionDeps = {}): Promise<string> {
  const key = getEnv('GOOGLE_API_KEY');
  if (!key) throw new Error('GOOGLE_API_KEY missing');
  const r = await (deps.fetch ?? fetch)(`${GEMINI_API}/v1beta/models/${geminiJudgeModel()}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(geminiBody(parts)),
    signal: AbortSignal.timeout(deps.timeoutMs ?? GEMINI_CALL_MS),
  });
  // The status only: a response body can echo private request content.
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const response = visionResponseOf(await r.json() as Parameters<typeof visionResponseOf>[0]);
  if (observed && response.executed_model) observed.executed_model = response.executed_model;
  return response.text;
}

/** One image judge call by vendor. */
export async function judgeImage(vendor: VisionVendor, file: string, prompt: string, allowIdentity: boolean, deps: VisionDeps = {}): Promise<VisionResponse> {
  if (vendor === 'openai') return openAiVision(file, prompt, allowIdentity, deps);
  if (vendor === 'anthropic') return anthropicVision(file, prompt, allowIdentity, deps);
  guardVisionRequest(file, allowIdentity);
  const observed: { executed_model?: string } = {};
  const text = await gemini([{ text: prompt }, imgPart(file)], observed, deps);
  return { text, ...observed };
}
