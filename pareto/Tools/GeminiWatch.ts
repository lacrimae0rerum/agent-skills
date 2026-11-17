#!/usr/bin/env bun
/**
 * GeminiWatch — watch and listen to a PUBLIC YouTube video with Gemini and return
 * a near-verbatim transcript plus what is on screen and what the framing leaves out.
 * Adapted from MIT-licensed code (see LICENSE.txt).
 *
 * Gemini reads the public URL directly: nothing is downloaded or uploaded, and only the
 * URL leaves. Pareto's synthesis step uses it to read the videos that carry the argument.
 *
 * Usage (from the skill folder):  bun Tools/GeminiWatch.ts <youtube-url> [--out <file>]
 * Env:    GOOGLE_API_KEY (environment or $AGENT_SKILLS_HOME/.env); the key rides the
 *         x-goog-api-key header only. GEMINI_WATCH_MODEL overrides the model.
 */
import { writeFileSync } from "node:fs";
import { getEnv } from "./_portable/paths.ts";

const API = "https://generativelanguage.googleapis.com";
const MODEL = getEnv("GEMINI_WATCH_MODEL") ?? "gemini-3.8-flash";
// A 94-minute talk measured 516k video tokens at low resolution; default resolution
// would not fit a long video in the context window.
const TIMEOUT_MS = 30 * 60_000;
// Measured on that talk: 516,071 video tokens for 5,671 seconds at low resolution.
const LOW_RES_VIDEO_TOKENS_PER_SEC = 91;
// Speech runs about 900 characters a minute; a pass under a third of that for the video's
// length summarized instead of transcribing. Same URL, same prompt, temperature 0: 116k
// characters on one call and 10k on the next (2026-09-29), so one retry is worth its cost.
const MIN_CHARS_PER_MINUTE = 300;

const PROMPT = `Watch and listen to this entire video. Produce:

1. A near-verbatim transcript of the whole video, with speaker labels and [mm:ss] timestamps every paragraph. Do not summarize or skip sections; cover start to finish.
2. A VISUALS section: anything shown on screen (demos, slides, code, UIs) that the speech does not capture, with timestamps.
3. A CONTENT BEYOND THE FRAMING section: concrete claims, product details, techniques, numbers, and opinions stated in the video that a title or description would not reveal.

Plain text output.`;

export function isYoutubeUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\.|^m\./, "");
    return h === "youtube.com" || h === "youtu.be";
  } catch {
    return false;
  }
}

export type WatchResult = { text: string; model: string; videoTokens: number | null; finishReason: string | null };

/** True when a pass is too short to be a transcript of a video this long (unknown length never counts as short). */
export function looksSummarized(res: Pick<WatchResult, "text" | "videoTokens">): boolean {
  if (!res.videoTokens) return false;
  const minutes = res.videoTokens / LOW_RES_VIDEO_TOKENS_PER_SEC / 60;
  return res.text.length < minutes * MIN_CHARS_PER_MINUTE;
}

/**
 * Watch one public YouTube video, retrying once when the first pass summarized, and
 * return the longer pass. Throws on a missing key, an API error, or an empty answer.
 */
export async function watchYoutube(url: string): Promise<WatchResult> {
  if (!isYoutubeUrl(url)) throw new Error(`not a YouTube URL: ${url}`);
  const key = getEnv("GOOGLE_API_KEY");
  if (!key) throw new Error("GOOGLE_API_KEY is not set (export it or add it to $AGENT_SKILLS_HOME/.env)");
  const first = await watchOnce(url, key);
  if (!looksSummarized(first)) return first;
  console.error(`GeminiWatch: ${first.text.length} chars looks summarized for ${first.videoTokens} video tokens, retrying once`);
  const second = await watchOnce(url, key);
  return second.text.length > first.text.length ? second : first;
}

async function watchOnce(fileUri: string, key: string): Promise<WatchResult> {
  const r = await fetch(`${API}/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ fileData: { fileUri } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0, mediaResolution: "MEDIA_RESOLUTION_LOW", maxOutputTokens: 65536 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // Bun's fetch aborts on its own at about five minutes unless told not to, and a
    // long video's watch pass takes longer than that; the signal above is the real bound.
    timeout: false,
  } as RequestInit);
  const data = (await r.json()) as any;
  if (!r.ok || data.error) throw new Error(`Gemini watch failed: ${data.error?.message ?? `HTTP ${r.status}`}`);
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
  if (!text) throw new Error(`Gemini watch returned no text (finish: ${cand?.finishReason ?? "none"})`);
  const video = (data.usageMetadata?.promptTokensDetails ?? []).find((d: any) => d.modality === "VIDEO");
  return { text, model: MODEL, videoTokens: video?.tokenCount ?? null, finishReason: cand?.finishReason ?? null };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  if (!url || args.includes("--help") || args.includes("-h")) {
    console.error("usage: bun Tools/GeminiWatch.ts <youtube-url> [--out <file>]   (sends nothing without a URL)");
    process.exit(url || args.includes("--help") || args.includes("-h") ? 0 : 2);
  }
  try {
    const res = await watchYoutube(url);
    if (out) writeFileSync(out, res.text);
    else process.stdout.write(res.text + "\n");
    console.error(JSON.stringify({ model: res.model, chars: res.text.length, videoTokens: res.videoTokens, finish: res.finishReason }));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
