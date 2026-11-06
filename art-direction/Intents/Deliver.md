# Deliver

Hands a passing artifact over to the requested directory behind the critique gate.

## Ideal State

- The intended artifact is copied to the requested directory only with a current passing critique and completed applicable domain checks.
- An MP4's adjacent `review/` tree accompanies it.
- The critique counts as current only with literal `pass`, an exact `artifactMtime` match, and an `artifactSha256` that matches the artifact's bytes.
- The destination is the one the user agreed to: `--to`, else `$AGENT_SKILLS_OUTPUT_DIR`, else `~/Downloads/`. Before copying anywhere else, or over files that already exist there, confirm the exact destination with the user.

## Anti-criteria

- A cap-hit or unavailable critique is never handed over as done.
- A hand-written `Critique.json` (no `artifactSha256`) never stands in for a real critique.
- Never delivers anywhere but the intended hand-over location, since existing destination files can be overwritten.

## Tool contract

```text
bun Tools/Deliver.ts --artifact <file> [--critique <Critique.json>] [--to <dir>]
bun Tools/Deliver.ts --deck-digest <deck.key>
```

The critique defaults to `Critique.json` beside the artifact. A Keynote `.key` deck is delivered on a critique of its exported slide frame: the slides brief carries `deckSha256` from `--deck-digest`, taken when the frames were exported. A critique of other bytes is stale even if the mtime matches. Deliver canonicalizes destinations to reject source replacement aliases (hard links included), and rejects review-source symlinks or copying review into itself. It does not recompute quality scores; keep report and artifact paired and re-critique any revision. Refusals exit 1 with the reason; success reports copied paths and byte counts.
