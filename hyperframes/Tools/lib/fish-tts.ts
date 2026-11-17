#!/usr/bin/env bun
// Adapted from MIT-licensed code (see LICENSE.txt).
/**
 * Fish Audio text-to-speech for narrated pieces: audio plus word-level timings, so captions and
 * beat spans are timed from the synthesis itself and no second speech-to-text pass is needed.
 *
 *   fishSpeak(text, { voice })                 → audio bytes (mp3 by default)
 *   fishSpeakWithTimestamps(text, { voice })   → { audio, words: [{ text, start, end }], durationSec }
 *
 * The voice is a Fish reference id: `voice` when given, else FISH_VOICE_ID. The key is FISH_API_KEY.
 * The model header is FISH_TTS_MODEL (default "drama-3"; a missing or misspelled header silently
 * falls back to a model with no per-word tags). Keys load from the environment or $AGENT_SKILLS_HOME/.env.
 *
 * CLI (writes the audio and an alignment.json of the words):
 *   bun Tools/lib/fish-tts.ts --text-file script.txt --out <project>/narration.mp3 --alignment <project>/alignment.json
 *                             [--voice <reference id>] [--speed 1.0] [--format mp3|wav]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { invariant } from "../_portable/invariant.ts";
import { getEnv, requireEnv } from "../_portable/paths.ts";

export interface FishOptions {
  /** Fish reference id; default FISH_VOICE_ID. */
  voice?: string;
  /** Prosody speed multiplier 0.5–2.0; unset is 1.0. */
  speed?: number;
  format?: "mp3" | "wav" | "pcm";
  sampleRate?: number;
  mp3Bitrate?: 64 | 128 | 192;
  latency?: "normal" | "balanced" | "low";
  /** Per-request timeout. Long narration needs longer than a closer. */
  timeoutMs?: number;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface TimedWord { text: string; start: number; end: number }

const BASE = "https://api.fish.audio";

/** The Fish reference id for a call: the explicit voice, else FISH_VOICE_ID. */
export function resolveFishVoice(voice?: string): string {
  return voice ?? requireEnv("FISH_VOICE_ID", "the Fish Audio reference id of the narration voice, or pass --voice");
}

export function fishRequestBody(text: string, referenceId: string, o: FishOptions): Record<string, unknown> {
  return {
    text,
    reference_id: referenceId,
    format: o.format ?? "mp3",
    ...(o.sampleRate ? { sample_rate: o.sampleRate } : {}),
    ...(o.mp3Bitrate ? { mp3_bitrate: o.mp3Bitrate } : {}),
    latency: o.latency ?? "normal",
    ...(o.speed && o.speed !== 1 ? { prosody: { speed: o.speed } } : {}),
  };
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // A missing or misspelled model header silently falls back to a model with no per-word tags.
    model: getEnv("FISH_TTS_MODEL") ?? "drama-3",
  };
}

function apiKey(explicit?: string): string {
  return explicit ?? requireEnv("FISH_API_KEY", "from a Fish Audio account");
}

/** Speak text in a Fish voice. Returns the audio bytes. */
export async function fishSpeak(text: string, o: FishOptions = {}): Promise<Uint8Array> {
  invariant(text.trim().length > 0, "fishSpeak needs non-empty text");
  const res = await (o.fetch ?? fetch)(`${BASE}/v1/tts`, {
    method: "POST",
    headers: headers(apiKey(o.apiKey)),
    body: JSON.stringify(fishRequestBody(text, resolveFishVoice(o.voice), o)),
    signal: AbortSignal.timeout(o.timeoutMs ?? 120_000),
  });
  if (!res.ok) throw new Error(`Fish API error: ${res.status} - ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const audio = new Uint8Array(await res.arrayBuffer());
  if (audio.byteLength === 0) throw new Error("Fish API returned no audio");
  return audio;
}

/** Parse the with-timestamp SSE stream: concatenate audio chunks, keep the latest alignment per chunk_seq. */
export function parseTimestampStream(sse: string): { audio: Uint8Array; words: TimedWord[]; durationSec: number } {
  const chunks: Uint8Array[] = [];
  const byChunk = new Map<number, { offset: number; words: TimedWord[]; duration: number }>();
  for (const block of sse.split(/\n\n+/)) {
    const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    if (!data || data === "[DONE]") continue;
    const ev = JSON.parse(data);
    if (ev.audio_base64) chunks.push(Uint8Array.from(Buffer.from(ev.audio_base64, "base64")));
    if (ev.alignment) {
      byChunk.set(Number(ev.chunk_seq ?? 0), {
        offset: Number(ev.chunk_audio_offset_sec ?? 0),
        duration: Number(ev.alignment.audio_duration ?? 0),
        words: (ev.alignment.segments ?? []).map((s: { text: unknown; start: unknown; end: unknown }) => ({ text: String(s.text), start: Number(s.start), end: Number(s.end) })),
      });
    }
  }
  const audio = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let at = 0;
  for (const c of chunks) { audio.set(c, at); at += c.byteLength; }
  const words: TimedWord[] = [];
  let durationSec = 0;
  for (const seq of [...byChunk.keys()].sort((a, b) => a - b)) {
    const c = byChunk.get(seq)!;
    for (const w of c.words) words.push({ text: w.text, start: w.start + c.offset, end: w.end + c.offset });
    durationSec = Math.max(durationSec, c.offset + c.duration);
  }
  return { audio, words, durationSec };
}

/** Speak text and return the audio with word-level timings (for narration that cuts to words). */
export async function fishSpeakWithTimestamps(text: string, o: FishOptions = {}): Promise<{ audio: Uint8Array; words: TimedWord[]; durationSec: number }> {
  invariant(text.trim().length > 0, "fishSpeakWithTimestamps needs non-empty text");
  const res = await (o.fetch ?? fetch)(`${BASE}/v1/tts/stream/with-timestamp`, {
    method: "POST",
    headers: headers(apiKey(o.apiKey)),
    body: JSON.stringify(fishRequestBody(text, resolveFishVoice(o.voice), o)),
    signal: AbortSignal.timeout(o.timeoutMs ?? 300_000),
  });
  if (!res.ok) throw new Error(`Fish API error: ${res.status} - ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const out = parseTimestampStream(await res.text());
  if (out.audio.byteLength === 0) throw new Error("Fish API returned no audio");
  return out;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const textFile = flag("text-file"), out = flag("out"), alignment = flag("alignment");
  if (!textFile || !out || !alignment) {
    console.error("usage: bun Tools/lib/fish-tts.ts --text-file script.txt --out narration.mp3 --alignment alignment.json [--voice <id>] [--speed 1.0] [--format mp3|wav]");
    process.exit(2);
  }
  try {
    const speed = flag("speed") ? Number(flag("speed")) : undefined;
    const format = (flag("format") as FishOptions["format"]) ?? (out.endsWith(".wav") ? "wav" : "mp3");
    const r = await fishSpeakWithTimestamps(readFileSync(textFile, "utf8").trim(), { voice: flag("voice"), speed, format });
    for (const p of [out, alignment]) mkdirSync(dirname(resolve(p)), { recursive: true });
    writeFileSync(out, r.audio);
    writeFileSync(alignment, JSON.stringify({ durationSec: r.durationSec, words: r.words }, null, 2) + "\n");
    console.log(JSON.stringify({ ok: true, out: resolve(out), alignment: resolve(alignment), words: r.words.length, durationSec: r.durationSec }));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
