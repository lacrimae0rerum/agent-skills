# UpdatePatterns

Brings the skill's local Patterns/ directory up to date with the upstream fabric repository and reports what changed.

## Ideal State

- This skill's `Patterns/` folder holds every pattern in the latest upstream fabric repository's `data/patterns/`, at its upstream content, copied from a fresh clone of that repository and never from `~/.config/fabric/patterns/`.
- Local-only patterns (present in Patterns/ but absent upstream) are kept and listed in the report; removing one is the user's call.
- The local edits survive the sync: every file the sync changed that carried a local edit (SKILL.md § Gotchas: content-scan fixes and portability fixes) has that edit re-applied on top of the new upstream text before the sync is reported complete, and where a content scanner is configured, its findings after the sync are a subset of its findings before.
- The report gives the previous count (captured before the update), the new count, the number of patterns added (if any), the files the sync changed, and confirmation that the sync completed successfully.
- The report marks each key pattern `extract_wisdom`, `summarize`, `create_threat_model` and `analyze_claims` present or MISSING, as checked after the sync.

## Anti-criteria

- A missing key pattern is never left unreported.
- A failed clone or copy is never reported as a completed sync.
- No pattern from `~/.config/fabric/patterns/` or any other non-upstream source enters Patterns/; the skill ships publicly.
- The upstream clone is never left behind after the sync.

## Inputs

The upstream repository is `https://github.com/danielmiessler/fabric.git`; its patterns live under `data/patterns/` (a top-level `patterns/` existed only in old releases, last seen in v1.4.195). The fabric CLI is not needed for this intent.

## Safety gates

- `fabric -U` and `~/.config/fabric/patterns/` are never the source: that directory mixes upstream with the user's local patterns.
- No `--delete` on the copy: Patterns/ keeps patterns upstream has dropped, including the key pattern `create_threat_model` (SKILL.md § Gotchas).
- The sync rewrites files inside the installed skill. When the skill folder is shared or under version control, tell the user which folder will change before running it.

## Tool contract

Run from this skill's folder (the one holding its SKILL.md). The steps run in this order and stop at the first failure: count, snapshot and scan before, clone upstream, copy `data/patterns/`, scan after, check, clean up.

```bash
set -euo pipefail
P="$PWD/Patterns"
CHECK="$PWD/Tools/CheckPatterns.ts"
[ -f "$CHECK" ] || { echo "Run this from the fabric skill's folder"; exit 1; }
CFG="${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/fabric/Config.md"   # optional; scan_tool: <full path>
T=$(sed -n "s/^scan_tool: *//p" "$CFG" 2>/dev/null || true)
SCAN="${FABRIC_SCAN_TOOL:-${T/#\~/$HOME}}"      # optional content scanner; unset skips the scan
WORK=$(mktemp -d)                               # snapshots; kept when a check fails
echo "Snapshots: $WORK"
trap 'rm -rf "$WORK/fabric"' EXIT               # the clone never outlives the run

CURRENT_COUNT=$(ls -1 "$P" | wc -l | tr -d ' ')
cp -R "$P" "$WORK/before-patterns"
if [ -n "$SCAN" ] && [ -f "$SCAN" ]; then bun "$SCAN" "$P" --json > "$WORK/before.json" || true; fi

git clone --depth 1 https://github.com/danielmiessler/fabric.git "$WORK/fabric"
[ -d "$WORK/fabric/data/patterns" ] || { echo "Upstream has no data/patterns/: sync NOT done"; exit 1; }
rsync -a "$WORK/fabric/data/patterns/" "$P/"

NEW_COUNT=$(ls -1 "$P" | wc -l | tr -d ' ')
echo "Previous count: $CURRENT_COUNT"
echo "New count: $NEW_COUNT"
if [ "$NEW_COUNT" -gt "$CURRENT_COUNT" ]; then echo "Added: $((NEW_COUNT - CURRENT_COUNT)) new patterns"; fi
echo "Files the sync changed:"
diff -rq "$WORK/before-patterns" "$P" | sed -e "s|$WORK/before-patterns|(before) Patterns|g" -e "s|$P|Patterns|g" || true

if [ -n "$SCAN" ] && [ -f "$SCAN" ]; then
  bun "$SCAN" "$P" --json > "$WORK/after.json" || true
  bun "$CHECK" --upstream "$WORK/fabric/data/patterns" --scan-before "$WORK/before.json" --scan-after "$WORK/after.json"
else
  bun "$CHECK" --upstream "$WORK/fabric/data/patterns"
fi
echo "Pattern update complete: re-apply local edits to the changed files listed above, then delete $WORK"
```

`CheckPatterns.ts` prints the ✓ / ✗ MISSING line for each key pattern, the upstream patterns still missing locally, the local-only patterns, and any new content-scan finding; it exits 1 when a key pattern or an upstream pattern is missing or a new finding appeared.

Then re-apply the local edits. For each changed file that carried one (compare it with `$WORK/before-patterns/<path>`; in a git checkout of the skill, `git diff -- Patterns` shows the same), put the edit back on top of the new upstream text: the `t_*` patterns name a "personal context file" (step 1 also lists what it holds), the author credits read "the Fabric author", `judge_ultimate_law` names its external verifier as "that repo's mech_logic.py tool", the `create_coding_project` README's example paths start at the example project's root folder, and `create_show_intro` spells out "digital assistant". A new content-scan finding means the sync overwrote a file the scan had cleared: re-apply that edit too, then re-run the scan and the check against the kept snapshot before reporting. Shell state may not carry between commands, so the recovery redefines its paths; set `WORK` to the `Snapshots:` path the script printed:

```bash
set -euo pipefail
P="$PWD/Patterns"
CHECK="$PWD/Tools/CheckPatterns.ts"
CFG="${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/fabric/Config.md"
T=$(sed -n "s/^scan_tool: *//p" "$CFG" 2>/dev/null || true)
SCAN="${FABRIC_SCAN_TOOL:-${T/#\~/$HOME}}"      # the same optional scanner as above
WORK=<the Snapshots: path printed above>
[ -d "$WORK/before-patterns" ] || { echo "No snapshot at $WORK: set WORK first"; exit 1; }
diff -rq "$WORK/before-patterns" "$P" | sed -e "s|$WORK/before-patterns|(before) Patterns|g" -e "s|$P|Patterns|g" || true
if [ -f "$WORK/before.json" ] && [ -n "$SCAN" ] && [ -f "$SCAN" ]; then
  bun "$SCAN" "$P" --json > "$WORK/after.json" || true
  bun "$CHECK" --scan-before "$WORK/before.json" --scan-after "$WORK/after.json"
else
  bun "$CHECK"
fi
rm -rf "$WORK"
```

## Output format

The report is the count block the update script prints (previous, new, added), the list of changed files with the local edits re-applied to them, then the CheckPatterns output: the ✓ / ✗ MISSING key-pattern lines, the local-only list, and the content-scan result when a scanner is configured.
