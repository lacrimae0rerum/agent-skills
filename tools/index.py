#!/usr/bin/env python3
"""Rewrite the skill table in README.md from each SKILL.md frontmatter.

  python3 tools/index.py          # update README.md in place
  python3 tools/index.py --check  # exit 1 if README.md is out of date

The table sits between `<!-- skills:start -->` and `<!-- skills:end -->`.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lint import parse_frontmatter  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
README = REPO / "README.md"
START, END = "<!-- skills:start -->", "<!-- skills:end -->"


def summary(desc: str) -> str:
    first = re.split(r"(?<=[.!?])\s+|\s+USE WHEN\b|\s+Use when\b", desc.strip(), maxsplit=1)[0]
    first = first.strip().strip('"').rstrip(".")
    return (first[:157] + "...") if len(first) > 160 else first


def table() -> str:
    rows = ["| Skill | What it does |", "|---|---|"]
    for sk in sorted(REPO.glob("*/SKILL.md")):
        fm, _, _ = parse_frontmatter(sk.read_text())
        if not fm:
            continue
        desc = summary(fm.get("description", "")).replace("|", "\\|")
        rows.append(f"| [{sk.parent.name}]({sk.parent.name}/SKILL.md) | {desc} |")
    return "\n".join(rows)


def main() -> int:
    text = README.read_text()
    if START not in text or END not in text:
        print("README.md has no skills markers", file=sys.stderr)
        return 2
    new = re.sub(re.escape(START) + r".*?" + re.escape(END), f"{START}\n{table()}\n{END}", text, flags=re.S)
    if "--check" in sys.argv:
        return 0 if new == text else 1
    README.write_text(new)
    print(f"README.md: {new.count(chr(10) + '| [')} skills listed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
