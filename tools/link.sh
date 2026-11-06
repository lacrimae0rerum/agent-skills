#!/usr/bin/env bash
# Turn skills on (or off) for the local agents by symlinking them into their skills folders.
#   tools/link.sh <skill> [<skill> ...]        link
#   tools/link.sh --unlink <skill> [...]       remove our links
# Refuses to replace an existing folder or a link that points somewhere else.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DIRS=("$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.pi/agent/skills")
unlink=0
if [[ "${1:-}" == "--unlink" ]]; then unlink=1; shift; fi
[[ $# -gt 0 ]] || { echo "usage: $0 [--unlink] <skill> ..." >&2; exit 2; }
status=0
for s in "$@"; do
  s="${s%/}"
  [[ -f "$REPO/$s/SKILL.md" ]] || { echo "no skill '$s' in $REPO" >&2; status=1; continue; }
  for d in "${DIRS[@]}"; do
    t="$d/$s"
    if (( unlink )); then
      if [[ -L "$t" && "$(readlink "$t")" == "$REPO/$s" ]]; then rm "$t" && echo "unlinked $t"; fi
      continue
    fi
    mkdir -p "$d"
    if [[ -L "$t" && "$(readlink "$t")" == "$REPO/$s" ]]; then echo "ok       $t"; continue; fi
    if [[ -e "$t" || -L "$t" ]]; then echo "CLASH    $t exists and is not ours; skipped" >&2; status=1; continue; fi
    ln -s "$REPO/$s" "$t" && echo "linked   $t"
  done
done
exit $status
