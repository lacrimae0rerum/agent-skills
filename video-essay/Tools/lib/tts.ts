/**
 * tts: narration audio with word timings, from a configurable text-to-speech provider.
 *
 * The Fish Audio client is adapted from MIT-licensed code (see LICENSE.txt); the
 * provider choice and the ElevenLabs client are new. No voice is built in: the voice id always comes from the
 * caller (the skill's config, the run, or a flag).
 *
 * Providers (TtsProvider):
 *   fish        Fish Audio. Key FISH_API_KEY. Model header FISH_TTS_MODEL (default "drama-3", which honours
 *               [directions] and paired tags such as <emphasis>…</emphasis>). Voice: a Fish reference (model) id.
 *   elevenlabs  ElevenLabs. Key ELEVENLABS_API_KEY. Model ELEVENLABS_TTS_MODEL (default "eleven_multilingual_v2").
 *               Voice: an ElevenLabs voice id. Voice tags are stripped before the request.
 *
 * Choice (first match wins): a "fish:<id>" or "elevenlabs:<id>" voice value; the caller's provider; $TTS_PROVIDER;
 * the first provider whose key is set (fish, then elevenlabs).
 *
 *   resolveTtsVoice(spec, { provider, speed })   → { provider, voiceId, speed, model }
 *   speakWithTimestamps(text, voice)            → { audio (mp3 bytes), words: [{ text, start, end }], durationSec }
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getEnv, requireEnv } from "../_portable/paths.ts";
import { invariant } from "../_portable/invariant.ts";
import { stripVoiceTags } from "./voicetags.ts";

export const TTS_PROVIDERS = ["fish", "elevenlabs"] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];
export interface TimedWord { text: string; start: number; end: number }
export interface TtsVoice { provider: TtsProvider; voiceId: string; speed: number; model: string }
export interface SpeakOptions { timeoutMs?: number; fetch?: typeof fetch }
export interface Spoken { audio: Uint8Array; words: TimedWord[]; durationSec: number }

const KEY: Record<TtsProvider, string> = { fish: "FISH_API_KEY", elevenlabs: "ELEVENLABS_API_KEY" };

function isProvider(p: string | undefined): p is TtsProvider {
  return !!p && (TTS_PROVIDERS as readonly string[]).includes(p);
}

/** The provider to use when the voice value does not name one. */
export function ttsProvider(explicit?: string): TtsProvider {
  const want = explicit ?? getEnv("TTS_PROVIDER");
  if (want !== undefined) {
    invariant(isProvider(want), `unknown TTS provider "${want}" (${TTS_PROVIDERS.join(", ")})`);
    return want;
  }
  const found = TTS_PROVIDERS.find((p) => getEnv(KEY[p]));
  if (!found) throw new Error(`no TTS provider: set FISH_API_KEY or ELEVENLABS_API_KEY (or TTS_PROVIDER), in the environment or $AGENT_SKILLS_HOME/.env`);
  return found;
}

/** The model a provider speaks with; part of every cache key, so a model change re-takes the audio. */
export function ttsModel(provider: TtsProvider): string {
  return provider === "fish" ? getEnv("FISH_TTS_MODEL") ?? "drama-3" : getEnv("ELEVENLABS_TTS_MODEL") ?? "eleven_multilingual_v2";
}

/** A voice value ("fish:<id>", "elevenlabs:<id>", or a bare id for the default provider) as a full voice. */
export function resolveTtsVoice(spec: string | undefined, o: { provider?: string; speed?: number } = {}): TtsVoice {
  invariant(spec && spec.trim(), "no narration voice: set one in the skill's Config.json (voice), the run, or --voice");
  const m = /^(fish|elevenlabs):(.+)$/.exec(spec.trim());
  const provider = m ? (m[1] as TtsProvider) : ttsProvider(o.provider);
  const voiceId = (m ? m[2]! : spec).trim();
  const speed = o.speed ?? 1;
  invariant(speed >= 0.5 && speed <= 2, `TTS speed must be 0.5..2, got ${speed}`);
  return { provider, voiceId, speed, model: ttsModel(provider) };
}

/** `<provider>:<model>`, the engine id cache keys and records carry. */
export function ttsEngine(v: TtsVoice): string {
  return `${v.provider}:${v.model}`;
}

/** Whether the provider speaks Drama 3 tags; any other provider gets the text with them stripped. */
export function speaksVoiceTags(v: TtsVoice): boolean {
  return v.provider === "fish";
}

// ── Fish Audio ──────────────────────────────────────────────────────────────

const FISH = "https://api.fish.audio";

export function fishRequestBody(text: string, v: TtsVoice): Record<string, unknown> {
  return { text, reference_id: v.voiceId, format: "mp3", latency: "normal", ...(v.speed !== 1 ? { prosody: { speed: v.speed } } : {}) };
}

/** Parse Fish's with-timestamp SSE stream: concatenate audio chunks, keep the latest alignment per chunk_seq. */
export function parseFishTimestampStream(sse: string): Spoken {
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

async function fishSpeak(text: string, v: TtsVoice, o: SpeakOptions): Promise<Spoken> {
  const res = await (o.fetch ?? fetch)(`${FISH}/v1/tts/stream/with-timestamp`, {
    method: "POST",
    // A missing or misspelled model header silently falls back to a model without per-word tags.
    headers: { Authorization: `Bearer ${requireEnv("FISH_API_KEY")}`, "Content-Type": "application/json", model: v.model },
    body: JSON.stringify(fishRequestBody(text, v)),
    signal: AbortSignal.timeout(o.timeoutMs ?? 300_000),
  });
  if (!res.ok) throw new Error(`Fish API error: ${res.status} - ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return parseFishTimestampStream(await res.text());
}

// ── ElevenLabs ──────────────────────────────────────────────────────────────

const ELEVEN = "https://api.elevenlabs.io";

export interface CharAlignment { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }

/** Words from a character alignment: runs of non-space characters, each spanning its first start to its last end. */
export function charsToWords(a: CharAlignment): TimedWord[] {
  const words: TimedWord[] = [];
  let cur = "", start = 0, end = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i]!;
    if (/\s/.test(ch)) { if (cur) words.push({ text: cur, start, end }); cur = ""; continue; }
    if (!cur) start = a.character_start_times_seconds[i]!;
    cur += ch;
    end = a.character_end_times_seconds[i]!;
  }
  if (cur) words.push({ text: cur, start, end });
  return words;
}

/** Duration of an mp3 by ffprobe; the alignment's last character ends before the audio's trailing silence. */
async function mp3Seconds(audio: Uint8Array): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "agent-skills-tts-"));
  try {
    const f = join(dir, "a.mp3");
    writeFileSync(f, audio);
    const p = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    const d = Number(out.trim());
    invariant(Number.isFinite(d) && d > 0, `ffprobe could not read the TTS audio duration: ${out.trim()}`);
    return d;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function elevenSpeak(text: string, v: TtsVoice, o: SpeakOptions): Promise<Spoken> {
  const res = await (o.fetch ?? fetch)(`${ELEVEN}/v1/text-to-speech/${encodeURIComponent(v.voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": requireEnv("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ text: stripVoiceTags(text), model_id: v.model, ...(v.speed !== 1 ? { voice_settings: { speed: v.speed } } : {}) }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 300_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs API error: ${res.status} - ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json()) as { audio_base64?: string; alignment?: CharAlignment };
  invariant(j.audio_base64 && j.alignment, "ElevenLabs returned no audio or no alignment");
  const audio = Uint8Array.from(Buffer.from(j.audio_base64, "base64"));
  return { audio, words: charsToWords(j.alignment), durationSec: await mp3Seconds(audio) };
}

// ── one call for every provider ─────────────────────────────────────────────

/** Speak text in a voice and return mp3 bytes with word-level timings. */
export async function speakWithTimestamps(text: string, v: TtsVoice, o: SpeakOptions = {}): Promise<Spoken> {
  invariant(text.trim().length > 0, "speakWithTimestamps needs non-empty text");
  const out = v.provider === "fish" ? await fishSpeak(text, v, o) : await elevenSpeak(text, v, o);
  if (out.audio.byteLength === 0) throw new Error(`${v.provider} returned no audio`);
  return out;
}
