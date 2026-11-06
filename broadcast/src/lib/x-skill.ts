/**
 * Broadcast - the x-twitter skill bridge.
 *
 * Broadcast never talks to the X API itself. Every X post, Article and account check is handed to the x-twitter
 * skill's tools, so the X credentials and the single OAuth 2.0 refresh chain live in one place (two refreshers of
 * one grant get it revoked). The x-twitter skill is optional: without it, X is reported as not configured.
 *
 * Where it is: X_TWITTER_SKILL_DIR, the folder of an installed x-twitter skill (the one holding its SKILL.md).
 */

import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { expandHome, getEnv } from '../../Tools/_portable/paths.ts';

export const X_SKILL_ENV = 'X_TWITTER_SKILL_DIR';

/** The x-twitter skill folder, or null when X_TWITTER_SKILL_DIR is unset or does not hold the skill's tools. */
export function xSkillDir(): string | null {
  const dir = getEnv(X_SKILL_ENV);
  if (!dir) return null;
  const abs = resolve(expandHome(dir));
  return existsSync(join(abs, 'Tools', 'post.ts')) ? abs : null;
}

/** One line on how to make X available, for status and error output. */
export function xSkillHint(): string {
  const dir = getEnv(X_SKILL_ENV);
  return dir
    ? `${X_SKILL_ENV}=${dir} does not hold the x-twitter skill (no Tools/post.ts there).`
    : `X posting runs through the x-twitter skill: install it, set it up (its Setup.md), and set ${X_SKILL_ENV} to its folder.`;
}

export interface XRun { code: number; stdout: string; stderr: string }

/** Runs one x-twitter tool (`Tools/<tool>`) with bun; stdin optional. Throws when the skill is not available. */
export async function runXTool(tool: string, args: string[], stdin?: string): Promise<XRun> {
  const dir = xSkillDir();
  if (!dir) throw new Error(xSkillHint());
  const proc = Bun.spawn(['bun', 'run', join(dir, 'Tools', tool), ...args], {
    cwd: dir,
    stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}
