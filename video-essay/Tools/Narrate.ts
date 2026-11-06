#!/usr/bin/env bun
/**
 * Narrate.ts — per-beat narration in the configured voice, with word timings.
 *
 *   bun Narrate.ts --run <slug|dir> [--force] [--verify] [--voice <provider:id>]
 *
 * For every beat in Script.json: apply pronunciation overrides to the spoken text
 * (display narration untouched), synthesize through the configured TTS provider with timestamps
 * (lib/tts.ts: Fish Audio or ElevenLabs), cache the chunk by content hash, then concatenate chunks with a fixed gap,
 * loudness-normalize the track, and write Narration/timeline.json with beat offsets measured
 * from the real chunk durations (never from the alignment's last word).
 *
 * Voice: `--voice`, else Config.json `voice` ("fish:<reference id>", "elevenlabs:<voice id>", or a bare id for the
 * default provider) at Config.json `voiceSpeed` (default 1). No voice is built in. Keys: FISH_API_KEY or
 * ELEVENLABS_API_KEY. Drama 3 tags in the text ([sigh], <emphasis>…</emphasis>) pass through to Fish and are stripped
 * for other providers; either way they are left out when the returned words are matched back to the script.
 * Pace: the voice's speed goes to the provider on every request, so a chunk comes back at its pace and
 * its timings need no stretch.
 * Length: one request carries at most TTS_CHUNK_LIMIT characters; longer text splits on sentence boundaries and
 * each chunk's word times are offset by the audio already produced (speakScript).
 * Timings: the provider returns word-level spans; speakScript matches them to the script's own tokens (punctuation kept on
 * the token), and wordsToAlignment spreads each word's span across its characters where a consumer reads character
 * timings (the cached `.align.json`, Ingest.ts).
 * Pure pieces (pronunciations, word matching, cache planning, timeline) are exported for tests.
 */
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { invariant } from "./_portable/invariant.ts";
import { resolveTtsVoice, speakWithTimestamps, ttsEngine, type TimedWord, type TtsVoice } from "./lib/tts.ts";
import { pronounce, pronunciationMap } from "./lib/pronounce.ts";
import { PAIRED_TAGS, stripVoiceTags } from "./lib/voicetags.ts";
import { BEAT_GAP_SECONDS, FPS, TARGET_LUFS, argValue, ensureDir, hasFlag, loadScript, loadSkillConfig, readJson, resolveRunDir, runPaths, sha256, writeJson, type Script, type SkillConfig, type Timeline, type TimelineBeat, type Word } from "./Lib.ts";

/** Characters one TTS request carries. Longer text splits on sentence boundaries (ttsChunks). */
export const TTS_CHUNK_LIMIT = 2_500;

export interface Alignment { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }
/**
 * The voice as sent. `voice_id` is the voice value ("fish:<id>", "elevenlabs:<id>" or a bare id for `provider` or the
 * default provider); `speed` is the prosody speed; `seed` rides here so the chunk hash covers it (best-of-N takes).
 */
export interface VoiceSettings { voice_id: string; provider?: string; speed?: number; seed?: number }
export interface SynthRequest { text: string; voice: VoiceSettings }
/** `alignment` is character-level, spread from the provider's word spans. */
export type Synthesizer = (req: SynthRequest) => Promise<{ audio: Buffer; alignment: Alignment }>;

// ---------- pronunciations ----------

// The one pronunciation pass (lib/pronounce.ts). Narration runs it itself, before hashing, because the spoken text
// is the alignment and cache key.
/** The user's rules ($AGENT_SKILLS_HOME/video-essay/PRONUNCIATIONS.json) with this run's pronunciations.json on top. */
export function loadPronunciations(runDir: string): Record<string, string> {
  return pronunciationMap("video-essay", runPaths(runDir).pronunciations);
}

/** What the narrator says for this text: homographs, then the overrides. */
export const applyPronunciations = pronounce;

// ---------- alignment → words ----------

export function alignmentToWords(a: Alignment): Word[] {
  const words: Word[] = [];
  let cur = "";
  let start = 0;
  let end = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (/\s/.test(ch)) {
      if (cur) words.push({ w: cur, s: start, e: end });
      cur = "";
      continue;
    }
    if (!cur) start = a.character_start_times_seconds[i];
    cur += ch;
    end = a.character_end_times_seconds[i];
  }
  if (cur) words.push({ w: cur, s: start, e: end });
  // The final character's end time absorbs the chunk's trailing silence; clamp the last word to a spoken length.
  const last = words[words.length - 1];
  if (last && last.e - last.s > 1.2) last.e = last.s + 0.6;
  return words;
}

// ---------- provider words matched to the script, chunks, voices ----------

/** Character-level alignment from word spans: each word's span is spread evenly across its characters, a space spans the gap to the next word. */
export function wordsToAlignment(words: Word[]): Alignment {
  const a: Alignment = { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
  words.forEach((w, i) => {
    if (i > 0) {
      a.characters.push(" ");
      a.character_start_times_seconds.push(words[i - 1].e);
      a.character_end_times_seconds.push(Math.max(words[i - 1].e, w.s));
    }
    const chars = Array.from(w.w);
    chars.forEach((c, k) => {
      a.characters.push(c);
      a.character_start_times_seconds.push(w.s + ((w.e - w.s) * k) / chars.length);
      a.character_end_times_seconds.push(w.s + ((w.e - w.s) * (k + 1)) / chars.length);
    });
  });
  return a;
}

/** What a word sounds like once punctuation, case and spacing are gone: a provider may return "well","known" for "well-known". */
const sounds = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const TAG_NAMES: ReadonlySet<string> = new Set(PAIRED_TAGS);
const PAIRED_TAG_RE = new RegExp(`</?(${PAIRED_TAGS.join("|")})>`, "g");
const MARK = "\u0001";

type ScriptUnit = { tag: string } | { word: string };

/**
 * The script as the provider speaks it: whitespace tokens with [directions] removed (no word is timed for them) and each
 * paired tag kept as its own unit, because Fish times the tag's name as a word (`<emphasis>Every</emphasis>` comes back
 * as "emphasis", "Every", "emphasis"); a provider that never saw the tag simply has no word for it. Punctuation stays on
 * the token it touches.
 */
export function scriptUnits(text: string): ScriptUnit[] {
  const units: ScriptUnit[] = [];
  for (const raw of stripVoiceTags(text.replace(PAIRED_TAG_RE, (_m, name: string) => `${MARK}${name}${MARK}`)).split(/\s+/).filter(Boolean)) {
    const before: ScriptUnit[] = [], after: ScriptUnit[] = [];
    let word = "";
    raw.split(new RegExp(`${MARK}(\\w+)${MARK}`)).forEach((part, i) => {
      if (i % 2 === 1) (word ? after : before).push({ tag: part });
      else word += part;
    });
    units.push(...before, ...(word ? [{ word }] : []), ...after);
  }
  return units;
}

/**
 * Match the provider's word spans to the script's tokens, one {w, s, e} per token. The token keeps its punctuation; its span runs
 * from its first piece's start to its last piece's end. A token with no sound ("—") gets a zero-width span where the last
 * word ended. Throws when the words the provider returned do not spell the script, naming the token.
 */
export function reconcileWords(script: string, fish: TimedWord[]): Word[] {
  const out: Word[] = [];
  let j = 0;
  let cursor = fish[0]?.start ?? 0;
  for (const unit of scriptUnits(script)) {
    if ("tag" in unit) {
      if (j < fish.length && sounds(fish[j].text) === unit.tag) { cursor = fish[j].end; j++; }
      continue;
    }
    const want = sounds(unit.word);
    if (!want) { out.push({ w: unit.word, s: cursor, e: cursor }); continue; }
    let got = "", s = -1, e = 0;
    while (got.length < want.length) {
      if (j >= fish.length) throw new Error(`the TTS provider returned no timing for "${unit.word}" and the words after it`);
      const p = sounds(fish[j].text);
      if (!got && TAG_NAMES.has(p) && !want.startsWith(p)) { j++; continue; } // a tag name the provider timed that the script does not carry
      if (!want.startsWith(got + p)) throw new Error(`TTS word "${fish[j].text}" does not match the script token "${unit.word}"`);
      if (p) { if (s < 0) s = fish[j].start; e = fish[j].end; got += p; }
      j++;
    }
    out.push({ w: unit.word, s, e });
    cursor = e;
  }
  return out;
}

/** Sentences, each with the whitespace after it; a stop only ends a sentence when whitespace or the end follows ("3.5" stays whole). */
const SENTENCE_RE = /.+?(?:[.!?…]+["'”’)\]]*(?=\s|$)\s*|$)/gs;

/** Split text into requests of at most `limit` characters on sentence boundaries; a sentence over the limit splits at a space. */
export function ttsChunks(text: string, limit = TTS_CHUNK_LIMIT): string[] {
  invariant(Number.isInteger(limit) && limit > 0, "the chunk limit must be a positive integer");
  const pieces: string[] = [];
  for (const sentence of text.match(SENTENCE_RE) ?? []) {
    let rest = sentence;
    while (rest.length > limit) {
      const space = rest.lastIndexOf(" ", limit);
      const at = space > 0 ? space : limit;
      pieces.push(rest.slice(0, at));
      rest = rest.slice(at);
    }
    pieces.push(rest);
  }
  const chunks: string[] = [];
  let cur = "";
  for (const p of pieces) {
    if (cur && cur.length + p.length > limit) { if (cur.trim()) chunks.push(cur.trim()); cur = ""; }
    cur += p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

export interface SpeakScriptOptions { limit?: number; fetch?: typeof fetch }

/**
 * Speak text in a voice and return the audio with one timed word per script token. Text over the chunk limit is spoken
 * as several requests; each chunk's word times are offset by the audio duration already produced, so the words sit on
 * the concatenated audio's timeline.
 */
export async function speakScript(text: string, voice: TtsVoice, o: SpeakScriptOptions = {}): Promise<{ audio: Buffer; words: Word[]; durationSec: number }> {
  const chunks = ttsChunks(text, o.limit);
  invariant(chunks.length > 0, "speakScript needs text to speak");
  const audio: Uint8Array[] = [];
  const words: Word[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    const r = await speakWithTimestamps(chunk, voice, { fetch: o.fetch, timeoutMs: 120_000 + 50 * chunk.length });
    for (const w of reconcileWords(chunk, r.words)) words.push({ w: w.w, s: w.s + offset, e: w.e + offset });
    audio.push(r.audio);
    offset += r.durationSec;
  }
  return { audio: Buffer.concat(audio), words, durationSec: offset };
}

/** The full TTS voice (provider, id, model, speed) a voice profile resolves to. */
export function ttsVoiceFor(voice: VoiceSettings): TtsVoice {
  return resolveTtsVoice(voice.voice_id, { provider: voice.provider, speed: voice.speed ?? 1 });
}

/** The configured provider as a Synthesizer: the profile's speed is the prosody speed (1.0 when unset). */
export const ttsSynthesizer: Synthesizer = async (req) => {
  const { audio, words } = await speakScript(req.text, ttsVoiceFor(req.voice));
  return { audio, alignment: wordsToAlignment(words) };
};

// ---------- cache planning ----------

/** `<provider>:<model>` for a voice: part of every chunk hash, so a chunk made by another engine is never reused. */
export function voiceModel(voice: VoiceSettings): string { return ttsEngine(ttsVoiceFor(voice)); }

/** The engine and pace are in the hash: a chunk made by another engine, or at another speed, is never reused. */
export function chunkHash(spoken: string, voice: VoiceSettings, engine = voiceModel(voice)): string {
  return sha256(JSON.stringify({ spoken, voice, engine, speed: voice.speed ?? 1 })).slice(0, 12);
}

export interface ChunkPlan { id: string; spoken: string; hash: string; base: string; cached: boolean }

export function planChunks(script: Script, pron: Record<string, string>, voice: VoiceSettings, narrationDir: string, force = false): ChunkPlan[] {
  return script.beats.map((b) => {
    const spoken = applyPronunciations(b.tts ?? b.narration, pron);
    const hash = chunkHash(spoken, voice);
    const base = join(narrationDir, `${b.id}.${hash}`);
    const cached = !force && existsSync(`${base}.mp3`) && existsSync(`${base}.align.json`);
    return { id: b.id, spoken, hash, base, cached };
  });
}

/** Given measured chunk durations (seconds), lay beats out with the gap between them. */
export function buildTimeline(plans: { id: string; base: string; words: Word[]; duration: number }[], gap = BEAT_GAP_SECONDS): Timeline {
  let t = 0;
  const beats: TimelineBeat[] = [];
  for (const p of plans) {
    const start = t;
    const end = t + p.duration;
    beats.push({ id: p.id, start, end, chunk: `${p.base}.wav`, words: p.words.map((w) => ({ w: w.w, s: w.s + start, e: w.e + start })) });
    t = end + gap;
  }
  const total = beats.length ? beats[beats.length - 1].end + gap : 0;
  return { fps: FPS, gap, total, narration: "narration.wav", beats };
}

// ---------- live pieces ----------

/**
 * The narration voice: `--voice` (or `override`), else Config.json `voice`, at Config.json `voiceSpeed` (1.0 when unset).
 * No voice is built in: a config without one stops here, naming the key.
 */
export function configuredVoice(override?: string, cfg: SkillConfig = loadSkillConfig()): VoiceSettings {
  const id = override?.trim() || cfg.voice?.trim();
  invariant(id, "no narration voice: set Config.json \"voice\" (e.g. \"fish:<reference id>\" or \"elevenlabs:<voice id>\") or pass --voice");
  const speed = cfg.voiceSpeed ?? 1;
  invariant(typeof speed === "number" && speed >= 0.5 && speed <= 2, `Config.json voiceSpeed must be a number in [0.5, 2], got ${JSON.stringify(speed)}`);
  return { voice_id: id, ...(cfg.ttsProvider ? { provider: cfg.ttsProvider } : {}), speed };
}

/**
 * What a chunk was spoken with, written beside it (`<chunk>.voice.json`) at the moment it is synthesized, so a later
 * check reads the voice as a recorded fact, never re-derives it from today's config. A chunk with no record predates
 * the record and reads as unknown, never as a match.
 */
export interface VoiceRecord { engine: string; model: string; voiceId: string; speed: number; at: string }
export const VOICE_RECORD_SUFFIX = ".voice.json";

/** The record for a chunk spoken in `voice`: the provider, model and voice id it resolves to, and the speed sent. */
export function voiceRecordFor(voice: VoiceSettings, at = new Date().toISOString()): VoiceRecord {
  const v = ttsVoiceFor(voice);
  return { engine: v.provider, model: v.model, voiceId: v.voiceId, speed: v.speed, at };
}

/**
 * The author's own cloned voice for a voice-mode read (run.json narrator "clone"): Config.json `narrators.clone`
 * { "voice": "<provider:id>", "speed"?, "seed"?, "takes"? }. The clone is the user's own voice, set up with their TTS
 * provider; nothing here names one.
 */
export function cloneVoice(cfg: SkillConfig = loadSkillConfig()): { voice: VoiceSettings; takes: number } {
  const c = cfg.narrators?.clone;
  invariant(c?.voice?.trim(), "no clone voice: set Config.json narrators.clone.voice to the author's cloned voice (e.g. \"elevenlabs:<voice id>\")");
  const speed = c.speed ?? 1;
  invariant(typeof speed === "number" && speed >= 0.5 && speed <= 2, `Config.json narrators.clone.speed must be a number in [0.5, 2], got ${JSON.stringify(speed)}`);
  const seed = c.seed ?? 1;
  invariant(Number.isInteger(seed) && seed >= 0 && seed <= 4294967295, `Config.json narrators.clone.seed must be an integer in [0, 4294967295], got ${JSON.stringify(seed)}`);
  const takes = c.takes ?? VOICE_DEFAULT_TAKES;
  invariant(Number.isInteger(takes) && takes >= 1 && takes <= VOICE_MAX_TAKES, `Config.json narrators.clone.takes must be an integer in [1, ${VOICE_MAX_TAKES}], got ${JSON.stringify(takes)}`);
  return { voice: { voice_id: c.voice.trim(), ...(cfg.ttsProvider ? { provider: cfg.ttsProvider } : {}), speed, seed }, takes };
}

/** Candidate takes per synthesized voice-mode read: each on its own seed, the steadiest kept. */
export const VOICE_DEFAULT_TAKES = 3;
/** Ten takes of a 10,000-character post is 100,000 characters; anything past that is a typo, not a choice. */
export const VOICE_MAX_TAKES = 10;

/** Characters Ingest.ts packs into one take. The synthesizer splits any take over TTS_CHUNK_LIMIT itself, so this only sizes Ingest's takes. */
export const REQUEST_CHAR_LIMIT = 5_000;

async function sh(cmd: string[]): Promise<string> {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`${cmd[0]} failed (${code}): ${err.slice(-400)}`);
  return out;
}

export async function probeDuration(path: string): Promise<number> {
  const out = await sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  const d = Number(out.trim());
  invariant(Number.isFinite(d) && d > 0, `ffprobe duration unreadable for ${path}`);
  return d;
}

/** Decode a chunk to 44.1 kHz stereo wav. */
export async function toWav(mp3: string, wav: string): Promise<void> {
  await sh(["ffmpeg", "-y", "-v", "error", "-i", mp3, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", wav]);
}

export async function concatWithGaps(chunks: string[], gap: number, outWav: string, narrationDir: string): Promise<void> {
  const gapWav = join(narrationDir, `gap.${gap}.wav`);
  if (!existsSync(gapWav)) await sh(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`, "-t", String(gap), "-c:a", "pcm_s16le", gapWav]);
  const list = join(narrationDir, "concat.txt");
  const lines: string[] = [];
  chunks.forEach((c, i) => { lines.push(`file '${c}'`); if (i < chunks.length - 1 || true) lines.push(`file '${gapWav}'`); });
  writeFileSync(list, lines.join("\n") + "\n");
  const raw = join(narrationDir, "narration.raw.wav");
  await sh(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "pcm_s16le", raw]);
  // Two-pass loudnorm to the delivery target; keep sample rate (loudnorm upsamples to 192k otherwise).
  // ffmpeg prints the measurement JSON on stderr with exit 0, so capture stderr directly.
  const measureProc = Bun.spawn(["ffmpeg", "-v", "info", "-i", raw, "-af", `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], { stderr: "pipe", stdout: "pipe" });
  await measureProc.exited;
  const stderrJson = await new Response(measureProc.stderr).text();
  const m = stderrJson.match(/\{[\s\S]*"input_i"[\s\S]*?\}/);
  invariant(m, "loudnorm measurement pass produced no JSON");
  const s = JSON.parse(m[0]) as Record<string, string>;
  const af = `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11:measured_I=${s.input_i}:measured_TP=${s.input_tp}:measured_LRA=${s.input_lra}:measured_thresh=${s.input_thresh}:offset=${s.target_offset}:linear=true:print_format=summary`;
  await sh(["ffmpeg", "-y", "-v", "error", "-i", raw, "-af", af, "-ar", "44100", "-c:a", "pcm_s16le", outWav]);
}

export async function narrate(runDir: string, opts: { force?: boolean; voice?: string; synthesizer?: Synthesizer; log?: (s: string) => void } = {}): Promise<Timeline> {
  const log = opts.log ?? ((s) => console.log(s));
  const synth = opts.synthesizer ?? ttsSynthesizer;
  const paths = runPaths(runDir);
  const script = loadScript(runDir);
  const voice = configuredVoice(opts.voice);
  const pron = loadPronunciations(runDir);
  ensureDir(paths.narration);
  const plans = planChunks(script, pron, voice, paths.narration, opts.force);
  let synthesized = 0;
  const retaken = new Set<string>();
  for (const p of plans) {
    if (p.cached) continue;
    // Drop stale chunks for this beat (older hashes).
    for (const f of readdirSync(paths.narration)) if (f.startsWith(`${p.id}.`) && !f.startsWith(`${p.id}.${p.hash}`)) rmSync(join(paths.narration, f));
    log(`🎙 ${p.id} (${p.spoken.split(/\s+/).length} words)`);
    const { audio, alignment } = await synth({ text: p.spoken, voice });
    writeFileSync(`${p.base}.mp3`, audio);
    writeJson(`${p.base}.align.json`, alignment);
    const record = voiceRecordFor(voice);
    invariant(record.voiceId && record.speed > 0, `${p.id}: malformed voice record`);
    writeJson(`${p.base}${VOICE_RECORD_SUFFIX}`, record);
    retaken.add(p.id);
    synthesized++;
  }
  const laid: { id: string; base: string; wav: string; words: Word[]; duration: number }[] = [];
  for (const p of plans) {
    const wav = `${p.base}.wav`;
    // A fresh take re-decodes the wav: the hash keys text and voice only, so a forced re-take of the same text would
    // otherwise leave the old audio beside the new word timings.
    if (retaken.has(p.id) || !existsSync(wav)) await toWav(`${p.base}.mp3`, wav);
    const duration = await probeDuration(wav);
    const words = alignmentToWords(readJson<Alignment>(`${p.base}.align.json`));
    invariant(!words.length || words[words.length - 1].e <= duration + 0.25, `${p.id}: last word ends ${words[words.length - 1].e.toFixed(2)}s past the ${duration.toFixed(2)}s chunk`);
    laid.push({ id: p.id, base: p.base, wav, words, duration });
  }
  const timeline = buildTimeline(laid.map((l) => ({ id: l.id, base: l.wav.replace(/\.wav$/, ""), words: l.words, duration: l.duration })));
  await concatWithGaps(laid.map((l) => l.wav), timeline.gap, paths.narrationWav, paths.narration);
  const total = await probeDuration(paths.narrationWav);
  invariant(Math.abs(total - timeline.total) < 0.05, `concatenated narration ${total}s does not match timeline ${timeline.total}s`);
  writeJson(paths.timeline, timeline);
  log(`✓ ${plans.length} beats (${synthesized} synthesized, ${plans.length - synthesized} cached) · ${timeline.total.toFixed(1)}s · ${voiceModel(voice)}`);
  return timeline;
}

export async function verifyNarration(runDir: string): Promise<{ ok: boolean; problems: string[] }> {
  const paths = runPaths(runDir);
  const problems: string[] = [];
  if (!existsSync(paths.timeline)) return { ok: false, problems: ["timeline.json missing"] };
  const tl = readJson<Timeline>(paths.timeline);
  let t = 0;
  for (const b of tl.beats) {
    if (!existsSync(b.chunk)) { problems.push(`${b.id}: chunk missing`); continue; }
    const d = await probeDuration(b.chunk);
    if (Math.abs(b.start - t) > 0.02) problems.push(`${b.id}: start ${b.start} ≠ measured ${t.toFixed(3)}`);
    if (Math.abs(b.end - b.start - d) > 0.02) problems.push(`${b.id}: length ${(b.end - b.start).toFixed(3)} ≠ chunk ${d.toFixed(3)}`);
    if (!b.words.length) problems.push(`${b.id}: no word timings`);
    t = b.start + d + tl.gap;
  }
  const total = await probeDuration(paths.narrationWav);
  if (Math.abs(total - tl.total) > 0.05) problems.push(`narration.wav ${total.toFixed(2)}s ≠ timeline ${tl.total.toFixed(2)}s`);
  return { ok: problems.length === 0, problems };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const run = argValue(argv, "--run");
  if (!run) { console.error("usage: Narrate.ts --run <slug|dir> [--force] [--verify] [--voice <provider:id>]"); process.exit(2); }
  const dir = resolveRunDir(run);
  if (hasFlag(argv, "--verify")) {
    const r = await verifyNarration(dir);
    for (const p of r.problems) console.log(`✗ ${p}`);
    console.log(r.ok ? "✓ narration verified" : "✗ narration failed");
    process.exit(r.ok ? 0 : 1);
  }
  await narrate(dir, { force: hasFlag(argv, "--force"), voice: argValue(argv, "--voice") });
}
