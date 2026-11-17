/**
 * The signature name stamped on essay headers and animated diagrams: ART_SIGNATURE, else "signature.text" in
 * $AGENT_SKILLS_HOME/art/ArtConfig.json. Empty when neither is set. The user picks the
 * name, and an unconfigured signature is skipped with a notice.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getEnv, skillDataDir } from '../_portable/paths.ts';

export function artConfigPath(): string {
  return join(skillDataDir('art', false), 'ArtConfig.json');
}

export function signatureName(): string {
  const fromEnv = getEnv('ART_SIGNATURE');
  if (fromEnv) return fromEnv.trim();
  const file = artConfigPath();
  if (!existsSync(file)) return '';
  let cfg: unknown;
  try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} is not valid JSON: ${(e as Error).message}`); }
  const text = (cfg as { signature?: { text?: unknown } } | null)?.signature?.text;
  return typeof text === 'string' ? text.trim() : '';
}
