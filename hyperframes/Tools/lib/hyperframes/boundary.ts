// Adapted from the upstream MIT-licensed tool (see LICENSE.txt): TOOLS/lib/Boundary.ts.
/**
 * The two path and write primitives the seam needs, copied from the upstream Boundary module:
 *
 *   confinedPath(root, p)      the real path of `p` when it stays inside `root`, else null. Every
 *                              existing component is resolved physically (symlinks followed, `..`
 *                              taken from the real parent), never folded lexically first.
 *   atomicWrite(path, data)    owner-only by default (0600 file, 0700 for directories it creates):
 *                              temp file in the same directory, fsync, rename over the target, so a
 *                              symlink at the target is replaced, never written through.
 */

import {
  closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, chmodSync, fchmodSync,
  openSync, realpathSync, renameSync, statSync, unlinkSync, writeSync,
} from "node:fs"
import { randomUUID } from "node:crypto"
import { basename, dirname, isAbsolute, join, sep } from "node:path"
import { invariant, InvariantViolation } from "../../_portable/invariant.ts"

// ── confinedPath ─────────────────────────────────────────────────────────────

function within(real: string, realRoot: string): boolean {
  if (real === realRoot) return true
  const prefix = realRoot.endsWith(sep) ? realRoot : realRoot + sep
  return real.startsWith(prefix)
}

function errCode(e: unknown): string | undefined {
  return (e as NodeJS.ErrnoException | undefined)?.code
}

/**
 * The real path `p` names when it stays inside `root`, or null. A relative `p` is walked from the
 * real root and refused the moment it leaves it; an absolute `p` is walked from `/` and judged by
 * where it lands. Each existing component is resolved through the filesystem, so `link/../x` with
 * `link` pointing outside goes where the kernel would go. After the first missing component the
 * rest is appended as written. Refused (null): a missing root, `..` after a missing component, a
 * dangling or looping symlink, a component under a file, and any result outside the root.
 */
export function confinedPath(root: string, p: string): string | null {
  if (typeof root !== "string" || root === "" || typeof p !== "string") return null
  let realRoot: string
  try { realRoot = realpathSync(root) } catch { return null }

  const relative = !isAbsolute(p)
  let cur = relative ? realRoot : sep
  let curIsDir = true
  let missing = false
  const tail: string[] = []

  for (const comp of p.split(sep)) {
    if (comp === "" || comp === ".") continue
    if (missing) {
      if (comp === "..") return null
      tail.push(comp)
      continue
    }
    if (!curIsDir) return null
    if (comp === "..") {
      cur = dirname(cur)
    } else {
      const next = cur === sep ? sep + comp : cur + sep + comp
      let st
      try { st = lstatSync(next) } catch (e) {
        if (errCode(e) === "ENOENT") { missing = true; tail.push(comp); continue }
        return null
      }
      if (st.isSymbolicLink()) {
        try { cur = realpathSync(next) } catch { return null }
        try { curIsDir = statSync(cur).isDirectory() } catch { return null }
      } else {
        cur = next
        curIsDir = st.isDirectory()
      }
    }
    if (relative && !within(cur, realRoot)) return null
  }

  const result = tail.length ? join(cur, ...tail) : cur
  return within(result, realRoot) ? result : null
}

// ── atomicWrite ──────────────────────────────────────────────────────────────

export interface AtomicWriteOptions {
  /** File mode, 0..0o777. Default 0o600. */
  mode?: number
  /** Mode for parent directories this call creates, 0o700..0o777. Default 0o700. Existing ones keep theirs. */
  dirMode?: number
}

/** Create the missing ancestors of `dir`, each with `dirMode` whatever the umask. Existing directories are untouched. */
function ensureDir(dir: string, dirMode: number): void {
  const missing: string[] = []
  let d = dir
  for (;;) {
    try {
      const st = statSync(d)
      invariant(st.isDirectory(), `atomicWrite: parent ${d} exists and is not a directory`)
      break
    } catch (e) {
      if (e instanceof InvariantViolation) throw e
      if (errCode(e) !== "ENOENT") throw e
      missing.push(d)
      const up = dirname(d)
      invariant(up !== d, `atomicWrite: no existing ancestor for ${dir}`)
      d = up
    }
  }
  for (const m of missing.reverse()) {
    try {
      mkdirSync(m, { mode: dirMode })
    } catch (e) {
      if (errCode(e) === "EEXIST") continue // a peer made it; it keeps its own mode
      throw e
    }
    chmodSync(m, dirMode)
  }
}

/**
 * Write `data` to `path` atomically: a same-directory temp file created exclusively with `mode`,
 * fsynced, then renamed over `path`. Readers see the old file or the new one, never a partial one.
 */
export function atomicWrite(path: string, data: string | Uint8Array, opts: AtomicWriteOptions = {}): void {
  const mode = opts.mode ?? 0o600
  const dirMode = opts.dirMode ?? 0o700
  invariant(typeof path === "string" && path.length > 0, "atomicWrite: path must be a non-empty string")
  invariant(isAbsolute(path), `atomicWrite: path must be absolute, got ${JSON.stringify(path)}`)
  invariant(Number.isInteger(mode) && mode >= 0 && mode <= 0o777, `atomicWrite: file mode must be within 0..0o777, got 0o${mode.toString(8)}`)
  invariant(Number.isInteger(dirMode) && dirMode >= 0o700 && dirMode <= 0o777, `atomicWrite: dirMode must be within 0o700..0o777, got 0o${dirMode.toString(8)}`)
  invariant(typeof data === "string" || data instanceof Uint8Array, "atomicWrite: data must be a string or bytes")

  const dir = dirname(path)
  ensureDir(dir, dirMode)

  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data
  const tmp = join(dir, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  const fd = openSync(tmp, "wx", mode)
  let renamed = false
  try {
    try {
      fchmodSync(fd, mode)
      let off = 0
      while (off < bytes.length) off += writeSync(fd, bytes, off, bytes.length - off)
      fsyncSync(fd)
      invariant((fstatSync(fd).mode & 0o777) === mode, `atomicWrite: temp file mode is not 0o${mode.toString(8)}`)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, path)
    renamed = true
  } finally {
    if (!renamed) { try { unlinkSync(tmp) } catch { /* already gone */ } }
  }
}
