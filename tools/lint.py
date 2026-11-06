#!/usr/bin/env python3
"""Portability linter for agent-skills (see PORTABILITY.md).

  python3 tools/lint.py [SKILL ...] [--root DIR] [--no-build] [--sync-lib] [--quiet]

Checks every folder under --root (default: this repo) that holds a SKILL.md, or only the
named ones. Exit 0 when no skill has errors. --sync-lib rewrites vendored Tools/_portable/
copies from tools/portable-lib/ before checking.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LIB = REPO / "tools" / "portable-lib"
TEXT_EXT = {".md", ".ts", ".tsx", ".mjs", ".js", ".cjs", ".sh", ".json", ".yaml", ".yml", ".hbs",
            ".html", ".css", ".txt", ".py", ".toml"}
CODE_EXT = {".ts", ".tsx", ".mjs", ".js", ".cjs"}
SKIP_DIRS = {"node_modules", ".git", "__pycache__", ".venv"}
ALLOWED_KEYS = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
LAYOUT_DIRS = {"Intents", "References", "Tools", "Templates", "Workflows", "Data", "Examples", "Prompts",
               "Assets", "Scripts", "Tests", "Lib", "Docs", "Patterns", "Suites", "Config",
               "intents", "references", "tools", "templates", "workflows", "data", "examples", "prompts",
               "assets", "scripts", "tests", "lib", "docs", "patterns", "ontology"}

# (regex, message, applies to: "all" text files or "md" only)
FORBIDDEN: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"\bSkill\("), "harness-specific skill call Skill(...): say 'use the `<name>` skill'", "all"),
    (re.compile(r"\b(subagent_type|AskUserQuestion|TodoWrite|TaskCreate|TaskUpdate|ExitPlanMode|SlashCommand|NotebookEdit)\b"),
     "harness tool name: describe the capability instead", "all"),
    (re.compile(r"\b(WebSearch|WebFetch)\b"), "harness tool name: say 'search the web' / 'fetch the page'", "all"),
    (re.compile(r"~/\.claude\b|\$HOME/\.claude|\$\{HOME\}/\.claude|\.claude/|[\"']\.claude[\"']|CLAUDE_PLUGIN_ROOT|CLAUDE_CONFIG_DIR"),
     "Claude Code home path: use skill-relative paths or $AGENT_SKILLS_HOME", "all"),
    (re.compile(r"\bthe principal\b|\bprincipal's\b|\bPrincipal's\b|\bThe principal\b"), "term 'principal': say 'the user'", "all"),
    (re.compile(r"\bDA\b|\bDA's\b"), "term 'DA' (digital assistant): say 'the agent'", "all"),
    (re.compile(r"localhost:8888"), "local voice/notification server: drop it or make it an optional step (PORTABILITY.md §4)", "all"),
    (re.compile(r"/Users/[A-Za-z]|/home/[a-z][a-z0-9_-]*/"), "absolute home path", "all"),
    (re.compile(r"\b(HillClimb|CreateSkill|RichFormat|StateLog|SuggestSkills|Interceptor|ComputerUse|StudioLights|CardBenefits|Headshot|ReadIt)\b"),
     "reference to a skill that is not in this repo", "all"),
    (re.compile(r"\b(ApertureOscillation|BeCreative|BiasCheck|BitterLessonEngineering|BrightData|CreateCLI|CrimeStats|DataRefresh|DetectAI|ExtractWisdom|FirstPrinciples|IterativeDepth|OpenSourceManagement|RedTeam|RootCauseAnalysis|SecurityMarketData|SecurityUpdates|StoryExplanation|StoryFilm|SystemsThinking|ThreatModel|USStats|VideoEssay|WastewaterCA|WriteStory|AnnualReports|ArtDirection|AudioEditor)\b"),
     "skill referenced by its CamelCase name: use the kebab-case name (e.g. `first-principles`)", "md"),
]
SECRET_RE = re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}|\bghp_[A-Za-z0-9]{30,}|\bAKIA[0-9A-Z]{16}\b|\bxox[abps]-[A-Za-z0-9-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----")
PATH_TOKEN = re.compile(r"(?<![\w./~$-])((?:\./)?(?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]+\.(?:md|ts|tsx|mjs|js|sh|json|ya?ml|hbs|html|css|txt|py))\b")
IMPORT_RE = re.compile(r"""(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'](\.{1,2}/[^"']+)["']""")


def parse_frontmatter(text: str):
    """Simple frontmatter: `key: value` lines, quoted or plain, plus one-level `metadata:` map."""
    if not text.startswith("---\n"):
        return None, ["SKILL.md must start with '---' frontmatter"], 0
    end = text.find("\n---", 4)
    if end < 0:
        return None, ["frontmatter is not closed with '---'"], 0
    block = text[4:end]
    fm: dict = {}
    errs: list[str] = []
    meta_line_numbers: set[int] = set()
    current_map = None
    for i, raw in enumerate(block.split("\n"), start=2):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        m = re.match(r"^( *)([A-Za-z0-9_-]+):(?:\s+(.*))?$", raw)
        if not m:
            errs.append(f"SKILL.md:{i}: frontmatter line is not simple 'key: value' (multi-line values are not portable)")
            continue
        indent, key, value = len(m.group(1)), m.group(2), (m.group(3) or "").strip()
        if value.startswith('"'):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                errs.append(f"SKILL.md:{i}: bad double-quoted value for '{key}'")
                continue
        elif value.startswith("'") and value.endswith("'") and len(value) >= 2:
            value = value[1:-1].replace("''", "'")
        if indent == 0:
            current_map = None
            if value == "":
                fm[key] = {}
                current_map = fm[key]
            else:
                fm[key] = value
        elif current_map is not None:
            current_map[key] = value
            meta_line_numbers.add(i)
        else:
            errs.append(f"SKILL.md:{i}: unexpected indentation")
    fm["__meta_lines__"] = meta_line_numbers
    body_start = text[: end + 4].count("\n") + 1
    return fm, errs, body_start


def text_files(skill: Path):
    for p in sorted(skill.rglob("*")):
        if p.is_file() and not (set(p.relative_to(skill).parts) & SKIP_DIRS) and p.suffix in TEXT_EXT:
            yield p


def resolve_import(src: Path, spec: str) -> Path | None:
    base = (src.parent / spec)
    cands = [base] + [base.with_name(base.name + e) for e in (".ts", ".tsx", ".js", ".mjs", ".json")] + \
            [base / f"index{e}" for e in (".ts", ".tsx", ".js", ".mjs")]
    if base.suffix == ".js":
        cands.append(base.with_suffix(".ts"))
    for c in cands:
        if c.is_file():
            return c
    return None


def sync_lib(skill: Path) -> list[str]:
    changed = []
    vend = skill / "Tools" / "_portable"
    if vend.is_dir():
        for f in vend.glob("*.ts"):
            canon = LIB / f.name
            if canon.is_file() and f.read_bytes() != canon.read_bytes():
                shutil.copyfile(canon, f)
                changed.append(str(f.relative_to(skill)))
    return changed


def build_check(skill: Path, files: list[Path]) -> list[str]:
    bun = shutil.which("bun")
    if not bun or not files:
        return [] if files == [] else ["bun not found: build check skipped (install bun to verify code)"]
    errs = []
    with tempfile.TemporaryDirectory(prefix="skill-build-") as out:
        def build(batch):
            return subprocess.run([bun, "build", *map(str, batch), "--target=bun", "--packages=external",
                                   "--outdir", out], capture_output=True, text=True, cwd=str(skill))
        r = build(files)
        if r.returncode == 0:
            return []
        for f in files:
            r1 = build([f])
            if r1.returncode != 0:
                msg = (r1.stderr or r1.stdout).strip().splitlines()
                detail = " | ".join(l.strip() for l in msg if l.strip() and not l.startswith("Bun v"))[:400]
                errs.append(f"{f.relative_to(skill)}: bun build failed: {detail}")
    return errs


def lint_skill(skill: Path, root: Path, do_build: bool) -> tuple[list[str], list[str]]:
    errs: list[str] = []
    warns: list[str] = []
    sk = skill / "SKILL.md"
    text = sk.read_text(errors="replace")
    fm, fm_errs, body_start = parse_frontmatter(text)
    errs += fm_errs
    meta_lines: set[int] = set()
    has_code = any(p.suffix in CODE_EXT | {".py", ".sh"} for p in skill.rglob("*")
                   if p.is_file() and not (set(p.relative_to(skill).parts) & SKIP_DIRS))
    if fm is not None:
        meta_lines = fm.pop("__meta_lines__")
        for k in fm:
            if k not in ALLOWED_KEYS:
                errs.append(f"SKILL.md: frontmatter key '{k}' is not in the Agent Skills spec ({', '.join(sorted(ALLOWED_KEYS))})")
        name = fm.get("name")
        if not isinstance(name, str) or not NAME_RE.match(name) or len(name) > 64:
            errs.append(f"SKILL.md: name '{name}' must be lowercase kebab-case, max 64 chars")
        elif name != skill.name:
            errs.append(f"SKILL.md: name '{name}' must equal the folder name '{skill.name}'")
        desc = fm.get("description")
        if not isinstance(desc, str) or not desc.strip():
            errs.append("SKILL.md: description is required")
        elif len(desc) > 1024:
            errs.append(f"SKILL.md: description is {len(desc)} chars (max 1024)")
        comp = fm.get("compatibility")
        if comp is not None and (not isinstance(comp, str) or len(comp) > 500):
            errs.append("SKILL.md: compatibility must be a string of at most 500 chars")
        if has_code and not comp:
            errs.append("SKILL.md: skill ships code, so 'compatibility' must state the runtime (e.g. 'Requires bun 1.2+') and env vars")
        meta = fm.get("metadata")
        if meta is not None and not (isinstance(meta, dict) and all(isinstance(v, str) for v in meta.values())):
            errs.append("SKILL.md: metadata must be a map of string values")
        if "LICENSE.txt" in str(fm.get("license", "")):
            lic = skill / "LICENSE.txt"
            if not lic.is_file():
                errs.append("SKILL.md: license points to LICENSE.txt, which is missing")
            elif "Copyright" not in lic.read_text(errors="replace"):
                errs.append("LICENSE.txt: the copyright notice is required (MIT)")
    body_lines = text.count("\n") - body_start
    if body_lines > 500:
        warns.append(f"SKILL.md body is {body_lines} lines (spec recommends < 500; move detail to References/)")

    code_files: list[Path] = []
    for p in text_files(skill):
        rel = p.relative_to(skill)
        if p.name == "LICENSE.txt":
            continue
        is_md = p.suffix == ".md"
        try:
            content = p.read_text(errors="replace")
        except OSError as e:
            errs.append(f"{rel}: unreadable: {e}")
            continue
        for ln, line in enumerate(content.split("\n"), start=1):
            if p == sk and ln in meta_lines:
                continue
            for rx, msg, scope in FORBIDDEN:
                if scope == "md" and not is_md:
                    continue
                m = rx.search(line)
                if m:
                    errs.append(f"{rel}:{ln}: {msg} [{m.group(0)}]")
            if SECRET_RE.search(line):
                errs.append(f"{rel}:{ln}: looks like a hard-coded secret")
        if is_md:
            for ln, line in enumerate(content.split("\n"), start=1):
                for m in PATH_TOKEN.finditer(line):
                    tok = m.group(1)
                    first = tok.lstrip("./").split("/")[0]
                    if first not in LAYOUT_DIRS and not (skill / first).exists():
                        continue
                    if not ((skill / tok).exists() or (p.parent / tok).exists()):
                        errs.append(f"{rel}:{ln}: referenced file does not exist: {tok}")
        if p.suffix in CODE_EXT:
            code_files.append(p)
            for ln, line in enumerate(content.split("\n"), start=1):
                for m in IMPORT_RE.finditer(line):
                    spec = m.group(1)
                    target = (p.parent / spec).resolve()
                    try:
                        target.relative_to(skill.resolve())
                    except ValueError:
                        errs.append(f"{rel}:{ln}: import leaves the skill folder: {spec}")
                        continue
                    if resolve_import(p, spec) is None:
                        errs.append(f"{rel}:{ln}: import target not found: {spec}")
    vend = skill / "Tools" / "_portable"
    if vend.is_dir():
        for f in vend.glob("*.ts"):
            canon = LIB / f.name
            if not canon.is_file():
                errs.append(f"{f.relative_to(skill)}: not a portable-lib file (keep skill-specific code outside _portable/)")
            elif f.read_bytes() != canon.read_bytes():
                errs.append(f"{f.relative_to(skill)}: differs from tools/portable-lib/{f.name} (run --sync-lib; edit the canonical copy)")
    if do_build:
        errs += build_check(skill, code_files)
    return errs, warns


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("skills", nargs="*")
    ap.add_argument("--root", type=Path, default=REPO)
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--sync-lib", action="store_true")
    ap.add_argument("--quiet", action="store_true", help="print only failing skills")
    a = ap.parse_args()
    root = a.root.resolve()
    if a.skills:
        skills = [root / s.rstrip("/") for s in a.skills]
        missing = [s.name for s in skills if not (s / "SKILL.md").is_file()]
        if missing:
            print(f"no SKILL.md in: {', '.join(missing)}", file=sys.stderr)
            return 2
    else:
        skills = sorted(p.parent for p in root.glob("*/SKILL.md"))
    failed = 0
    for s in skills:
        if a.sync_lib:
            for c in sync_lib(s):
                print(f"synced {s.name}/{c}")
        errs, warns = lint_skill(s, root, not a.no_build)
        if errs:
            failed += 1
            print(f"FAIL {s.name} ({len(errs)} errors)")
            for e in errs:
                print(f"  E {e}")
        elif not a.quiet:
            print(f"PASS {s.name}")
        if warns and (errs or not a.quiet):
            for w in warns:
                print(f"  W {w}")
    print(f"\n{len(skills) - failed}/{len(skills)} skills pass")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
