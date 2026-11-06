/**
 * invariant: runtime assertion for states that must never happen.
 *
 * Portable agent-skills library. Canonical copy: agent-skills/tools/portable-lib/.
 * Skills carry a vendored copy in Tools/_portable/; edit the canonical copy and run
 * `python3 tools/lint.py --sync-lib`.
 */

export class InvariantViolation extends Error {
  constructor(message: string) {
    super(`INVARIANT VIOLATION: ${message}`);
    this.name = "InvariantViolation";
  }
}

/** Throws InvariantViolation when `condition` is falsy; narrows types when it passes. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvariantViolation(message);
}
