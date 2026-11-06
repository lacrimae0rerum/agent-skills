/**
 * voicetags: the Fish Audio Drama 3 performance tags a script may carry ([sigh], <emphasis>…</emphasis>).
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt): TOOLS/VoiceTags.ts. Everything that shows or
 * measures text calls stripVoiceTags; only a provider that understands the tags (Fish) receives them.
 */

/** The only paired per-word tags Drama 3 understands. */
export const PAIRED_TAGS = ["emphasis", "stress", "soft", "whisper", "fast", "slow", "forceful"] as const

const PAIRED_RE = new RegExp(`</?(?:${PAIRED_TAGS.join("|")})>`, "g")
// A direction or sound: [words, with commas or hyphens]. Never a markdown link (followed by "(")
// or a checkbox/footnote-ish token with digits or symbols.
const BRACKET_RE = /\[[A-Za-z][A-Za-z ,'\-]{0,60}\](?!\()/g

/** The spoken words only: directions, sounds and paired tags removed, spacing tidied. */
export function stripVoiceTags(s: string): string {
  return s
    .replace(PAIRED_RE, "")
    .replace(BRACKET_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .trim()
}

/** True when the text carries any Drama 3 tag. */
export function hasVoiceTags(s: string): boolean {
  return stripVoiceTags(s) !== s.replace(/[ \t]{2,}/g, " ").trim()
}
