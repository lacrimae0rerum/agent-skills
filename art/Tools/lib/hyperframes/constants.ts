// Adapted from MIT-licensed code (see LICENSE.txt).
/**
 * HyperFrames seam — pinned versions and the fixed locations everything else reads.
 *
 * One version constant for the seam. Every skill that vendors a copy of this folder (hyperframes, art,
 * and any other video skill) pins the same versions, so a bump happens in every copy at once,
 * after the render tests pass on the new version.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { expandHome, getEnv } from "../../_portable/paths.ts";

/** The HyperFrames CLI version every invocation runs (`bun x hyperframes@<this>`). */
export const HYPERFRAMES_VERSION = "0.8.71";

/**
 * GSAP, served to compositions from a local file so the compiler never inlines it from a CDN.
 * The hash pins the exact bytes of `gsap/dist/gsap.min.js` from the npm tarball.
 */
export const GSAP_VERSION = "3.14.2";
export const GSAP_SHA256 = "c174bfce53a729418d57a8ad8625e7247c793a22fef8e2851e3cfa3de9cd8280";

/**
 * Where the seam keeps what it provisions (GSAP, extracted fonts). Outside every skill folder: GSAP ships under its
 * own licence. `HYPERFRAMES_CACHE` overrides it; every vendored copy of the seam shares the default, so one install serves all.
 */
export function seamCacheDir(): string {
  const env = getEnv("HYPERFRAMES_CACHE");
  return env ? expandHome(env) : join(homedir(), ".cache", "agent-skills", "hyperframes");
}

/** Project-relative path a composition loads GSAP from after `stageGsap()`. */
export const GSAP_PROJECT_PATH = "vendor/gsap.min.js";

/** Subcommands the seam may run. Everything else (publish, cloud, lambda, feedback, auth, skills, capture, tts…) is refused. */
export const ALLOWED_SUBCOMMANDS = new Set(["lint", "check", "render", "snapshot", "doctor", "compositions", "info", "browser", "--version"]);
