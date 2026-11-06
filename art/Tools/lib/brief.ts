// Adapted from the upstream MIT-licensed tool (see LICENSE.txt): skills/ArtDirection/Tools/Critique.ts (Brief, parseBrief).
/**
 * The Brief.json shape the `art-direction` critique reads. EvalRound checks a brief with parseBrief before it starts
 * a round, so a malformed brief fails in one second instead of after every judge has run.
 */
export interface Brief {
  title: string;
  kind: 'video' | 'image' | 'slides' | 'site' | 'document';
  audience: string;
  register: string;
  references: string[];
  bar: number;
  mustNot: string[];
  calibration?: string;
}

export function isRecord(x: unknown): x is Record<string, unknown> { return typeof x === 'object' && x !== null && !Array.isArray(x); }
export function isScore(x: unknown): x is number { return typeof x === 'number' && Number.isFinite(x) && x >= 1 && x <= 10; }
const nonempty = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

export function parseBrief(x: unknown): Brief {
  if (!isRecord(x) || !nonempty(x.title) || !['video', 'image', 'slides', 'site', 'document'].includes(String(x.kind)) || !nonempty(x.audience) || !nonempty(x.register) || !isScore(x.bar) || !Array.isArray(x.references) || !x.references.every(nonempty) || !Array.isArray(x.mustNot) || !x.mustNot.every(nonempty)) throw new Error('Invalid Brief.json shape');
  return x as unknown as Brief;
}
