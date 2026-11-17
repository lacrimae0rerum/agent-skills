/**
 * VisionCall — the one image-judge transport: OpenAI (Responses API, or the codex CLI), Anthropic (Messages API)
 * and Gemini (generateContent), plus the guards every pixel egress path runs first.
 *
 * Keys and models (environment or $AGENT_SKILLS_HOME/.env):
 *   OPENAI_API_KEY      OpenAI seat; without it the `codex` CLI on PATH is used (`codex exec -i <image>`)
 *   ANTHROPIC_API_KEY   Anthropic seat
 *   GOOGLE_API_KEY      Gemini (pairwise, public-material describer, suites whose vision-judge.json entry names Google)
 *   ASSAY_OPENAI_VISION_MODEL, ASSAY_ANTHROPIC_VISION_MODEL, ASSAY_GEMINI_MODEL   model overrides
 *   ASSAY_PRIVATE_VENDORS   vendors allowed to see private images (default "anthropic,openai")
 *   ASSAY_INFERENCE_DISABLED   when set, every vision call refuses (assert-only runs)
 *
 * Adapted from MIT-licensed code (see LICENSE.txt).
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { getEnv, requireEnv } from '../_portable/paths.ts';
import { modelFor } from '../_portable/inference.ts';

export interface VisionResponse { text: string; executed_model?: string }
export type VisionProvider = 'google' | 'openai' | 'anthropic';
export type MaterialClass = 'private' | 'public';

const ANTHROPIC_VERSION = '2026-10-21';

export function inferenceDisabledBy(): string | undefined {
  return getEnv('ASSAY_INFERENCE_DISABLED');
}

/** Vendors that may receive private material. */
export function privateVendors(): string[] {
  return (getEnv('ASSAY_PRIVATE_VENDORS') ?? 'anthropic,openai').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}

/** Throws when private material would go to a vendor the user has not approved. Public material is not restricted here. */
export function assertEvaluatorVendor<T extends string>(vendor: T, caller = 'evaluator', material: MaterialClass = 'private'): T {
  if (material === 'public') return vendor;
  if (!privateVendors().includes(String(vendor).toLowerCase())) {
    throw new Error(`evaluator egress refused: vendor "${vendor}" is not approved for private material (${caller}); approved: ${privateVendors().join(', ')} (ASSAY_PRIVATE_VENDORS)`);
  }
  return vendor;
}

/**
 * Every pixel egress path checks these before credentials, image reads, or network.
 * The identity guard is a filename heuristic (a path containing "headshot"), not face detection: a face photo under
 * another name passes, so identity-bearing images must be kept out of judged suites by their owner.
 */
export function guardVisionRequest(file: string, allowIdentity = false): void {
  if (!allowIdentity && /headshot/i.test(file)) throw new Error('identity guard: identity-bearing image requires explicit clearance (--allow-identity)');
  const disabled = inferenceDisabledBy();
  if (disabled) throw new Error(`inference disabled in this context (ASSAY_INFERENCE_DISABLED=${disabled}); this probe must be deterministic`);
}

export function mime(file: string): string {
  const e = extname(file).toLowerCase();
  return e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : 'image/jpeg';
}

export function openAiVisionModel(): string { return getEnv('ASSAY_OPENAI_VISION_MODEL') ?? modelFor('openai-api', 'medium') ?? 'gpt-5'; }
export function anthropicVisionModel(): string { return getEnv('ASSAY_ANTHROPIC_VISION_MODEL') ?? modelFor('anthropic-api', 'high') ?? 'claude-opus-5-5'; }
export function geminiModel(): string { return getEnv('ASSAY_GEMINI_MODEL') ?? 'gemini-2.5-pro'; }

// ── OpenAI ───────────────────────────────────────────────────────────────────

export function openAiVisionBody(prompt: string, bytes: Uint8Array, mimeType: string, model = openAiVisionModel()) {
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

export const OPENAI_VISION_TIMEOUT_MS = 360_000;

function onPath(bin: string): boolean {
  return spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }).status === 0;
}

function codexVision(file: string, prompt: string, model: string, timeoutMs: number): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'assay-codex-vision-'));
  const last = join(dir, 'last.txt');
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['exec', '--model', model, '--sandbox', 'read-only', '--skip-git-repo-check', '-i', file, '-o', last, '-'], { stdio: ['pipe', 'ignore', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); rmSync(dir, { recursive: true, force: true }); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        // Never include provider error output: it may echo private request content.
        if (code !== 0) return reject(new Error(`OpenAI vision (codex) exited ${code}`));
        resolve(readFileSync(last, 'utf8').trim());
      } catch { reject(new Error('OpenAI vision (codex) wrote no answer')); }
      finally { rmSync(dir, { recursive: true, force: true }); }
    });
    child.stdin.end(prompt);
  });
}

/** OpenAI vision: the Responses API with OPENAI_API_KEY, else the codex CLI. */
export async function openAiVision(file: string, prompt: string, allowIdentity = false, deps: { fetch?: typeof fetch } = {}): Promise<VisionResponse> {
  assertEvaluatorVendor('openai', 'Assay.openAiVision');
  guardVisionRequest(file, allowIdentity);
  const ext = extname(file).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new Error('unsupported OpenAI vision image extension');
  const model = openAiVisionModel();
  const key = getEnv('OPENAI_API_KEY');
  if (!key) {
    if (!onPath('codex')) throw new Error('OpenAI vision unavailable: set OPENAI_API_KEY or install the codex CLI');
    // codex exec reports no executed model, so none is claimed; callers record the requested model separately.
    return { text: await codexVision(file, prompt, model, OPENAI_VISION_TIMEOUT_MS) };
  }
  const base = getEnv('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1';
  const r = await (deps.fetch ?? fetch)(`${base}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(openAiVisionBody(prompt, readFileSync(file), mime(file), model)),
    signal: AbortSignal.timeout(OPENAI_VISION_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`OpenAI vision HTTP ${r.status}`);
  return openAiVisionResponseOf(await r.json());
}

// ── Anthropic ────────────────────────────────────────────────────────────────

/** Said by the Anthropic judge when the image did not attach, so a blind answer is never scored. */
export const IMAGE_UNAVAILABLE = 'IMAGE_UNAVAILABLE';
export const ANTHROPIC_CALL_MS = 170_000;
const ANTHROPIC_VISION_SYSTEM = `You are a vision judge. The image to judge is attached to the user message. Look at it before answering, then answer exactly as the user message asks. If no image is visible to you, reply with exactly ${IMAGE_UNAVAILABLE} and nothing else.`;

/** Anthropic vision through the Messages API. The user prompt is the caller's exact prompt, the same one the OpenAI seat gets. */
export async function anthropicVision(file: string, prompt: string, allowIdentity = false, deps: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<VisionResponse> {
  assertEvaluatorVendor('anthropic', 'Assay.anthropicVision');
  guardVisionRequest(file, allowIdentity);
  const key = requireEnv('ANTHROPIC_API_KEY', 'the Anthropic vision seat');
  const model = anthropicVisionModel();
  const base = getEnv('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com';
  const r = await (deps.fetch ?? fetch)(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify({
      model, max_tokens: 4096, system: ANTHROPIC_VISION_SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime(file), data: Buffer.from(readFileSync(file)).toString('base64') } },
        { type: 'text', text: prompt },
      ] }],
    }),
    signal: AbortSignal.timeout(deps.timeoutMs ?? ANTHROPIC_CALL_MS),
  });
  // Never echo the body on failure: it may carry private request content.
  if (!r.ok) throw new Error(`Anthropic vision HTTP ${r.status}`);
  const j = (await r.json()) as { model?: string; stop_reason?: string; content?: { type?: string; text?: string }[] };
  if (j.stop_reason === 'refusal') throw new Error('Anthropic vision: model declined');
  const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  if (!text) throw new Error('Anthropic vision returned no text');
  if (text === IMAGE_UNAVAILABLE) throw new Error('Anthropic vision: the judge could not see the image');
  return { text, ...(j.model ? { executed_model: j.model } : {}) };
}

// ── Gemini ───────────────────────────────────────────────────────────────────

const GEMINI_API = 'https://generativelanguage.googleapis.com';

/** Preserve the provider's model metadata; absence is unknown, never the requested model. */
export function visionResponseOf(j: { modelVersion?: unknown; candidates?: { content?: { parts?: { text?: string }[] } }[] }): { text: string; executed_model?: string } {
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

/** Every Gemini call is Google egress, checked before any key read or network call. */
export async function gemini(parts: unknown[], observed?: { executed_model?: string }, deps: { publicMaterial?: boolean; fetch?: typeof fetch; caller?: string } = {}): Promise<string> {
  assertEvaluatorVendor('google', deps.caller ?? 'VisionJudge', deps.publicMaterial ? 'public' : 'private');
  const disabled = inferenceDisabledBy();
  if (disabled) throw new Error(`inference disabled in this context (ASSAY_INFERENCE_DISABLED=${disabled}); this probe must be deterministic`);
  const key = requireEnv('GOOGLE_API_KEY', 'Gemini image judging');
  const r = await (deps.fetch ?? fetch)(`${GEMINI_API}/v1beta/models/${geminiModel()}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(geminiBody(parts)),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  const out = visionResponseOf(await r.json() as Parameters<typeof visionResponseOf>[0]);
  if (observed && out.executed_model) observed.executed_model = out.executed_model;
  return out.text;
}

/** One image judge call on the named provider. */
export async function judgeImage(provider: VisionProvider, file: string, prompt: string, allowIdentity: boolean, opts: { publicMaterial?: boolean; caller?: string } = {}): Promise<VisionResponse> {
  if (provider === 'openai') return openAiVision(file, prompt, allowIdentity);
  if (provider === 'anthropic') return anthropicVision(file, prompt, allowIdentity);
  guardVisionRequest(file, allowIdentity);
  const observed: { executed_model?: string } = {};
  const text = await gemini([{ text: prompt }, imgPart(file)], observed, { publicMaterial: opts.publicMaterial, caller: opts.caller ?? 'VisionJudge' });
  return { text, ...observed };
}
