/**
 * JudgeCall — the one judge transport. Every text model call a judge makes goes through here
 * (`judgeText`), on the portable inference helper (Tools/_portable/inference.ts), so a new
 * provider is added once, in that helper. Vendor comes from the model id, never a lane name.
 *
 * Which vendor judges: ASSAY_JUDGE_VENDOR (anthropic | openai), else whatever provider the
 * inference helper resolves. A judge from a different vendor than the model under test is the
 * cross-vendor default the method asks for; set the variable to get it.
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt): JudgeCall.ts.
 */
import { inference, type InferenceOptions, type InferenceResult, type InferenceVendor } from '../_portable/inference.ts';
import { getEnv } from '../_portable/paths.ts';

export type JudgeVendor = 'anthropic' | 'openai' | 'google' | 'meta' | 'xai' | string;

/** Vendor of a model id. Unknown ids are their own vendor, so they never pass as another's. */
export function vendorOf(model: string): JudgeVendor {
  const id = model.toLowerCase();
  if (/^(claude|anthropic|opus|sonnet|haiku)/.test(id)) return 'anthropic';
  if (/^(gpt|o\d|chatgpt|codex)/.test(id)) return 'openai';
  if (/^gemini|^gemma/.test(id)) return 'google';
  if (/^(muse|llama)/.test(id)) return 'meta';
  if (/^grok/.test(id)) return 'xai';
  return id.match(/^[a-z]+/)?.[0] ?? id;
}

/** The vendor judges run on, or undefined to let the inference helper choose. */
export function evalJudgeVendor(): InferenceVendor | undefined {
  const v = getEnv('ASSAY_JUDGE_VENDOR');
  return v === 'anthropic' || v === 'openai' ? v : undefined;
}

/** One text judge call, with the inference helper's option and result shapes. */
export async function judgeText(o: InferenceOptions): Promise<InferenceResult> {
  const vendor = o.vendor ?? evalJudgeVendor();
  return inference({ ...o, ...(vendor ? { vendor } : {}) });
}

/** A judge pinned to one model id, as a plain ask. Used where a run measures one model on purpose (calibration, comparison). */
export function namedJudge(model: string, system = 'You are a careful, impartial judge. Reply with JSON only.'): { name: string; ask: (prompt: string) => Promise<{ ok: boolean; text: string; model: string; error?: string }> } {
  const vendor = vendorOf(model);
  const pinned: Partial<InferenceOptions> = vendor === 'anthropic' || vendor === 'openai' ? { vendor, model } : { model };
  return {
    name: model,
    async ask(prompt) {
      const r = await inference({ systemPrompt: system, userPrompt: prompt, level: 'high', timeout: 1_200_000, ...pinned });
      return { ok: r.success, text: r.output, model: r.executedModel ?? `${model} (unverified)`, error: r.error };
    },
  };
}
