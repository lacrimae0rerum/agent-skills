#!/usr/bin/env python3
"""Deterministic self-test of the flowsint-ontology skill.

  python3 scripts/selftest.py [--flowsint PATH]

Checks: ontology integrity, staleness against the Flowsint checkout, SDL validity, the worked
example (three documents, all validation layers), blocking of invalid drafts, stdlib-fallback
parity, and JSON round trip. Exit 0 when every check passes.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
EMIT = HERE / "emit.py"
BUILD = HERE / "build_ontology.py"
EXAMPLE = SKILL / "examples" / "acme-example.draft.json"

INVALID = {
    "extraction": {"title": "invalid"},
    "sources": [{"id": "S1", "kind": "conversation", "reliability": "C"}],
    "entities": [
        {"ref": "a", "type": "Individual", "properties": {"full_name": "A B"}, "evidence": [{"source": "S1", "method": "stated"}]},
        {"ref": "b", "type": "Email", "properties": {"email": "a@example.com"}, "evidence": [{"source": "S1", "method": "stated"}]},
        {"ref": "c", "type": "Credential", "properties": {"username": "ab", "password_hash": "hunter2"}, "evidence": [{"source": "S1", "method": "stated"}]},
        {"ref": "d", "type": "Vehicle", "properties": {"plate": "X"}, "evidence": [{"source": "S1", "method": "stated"}]},
        {"ref": "e", "type": "Domain", "properties": {"domain": "example.com"}},
        {"ref": "f", "type": "Ip", "properties": {"address": "10.0.0.1"}, "evidence": [{"source": "S9", "method": "stated"}]},
    ],
    "relationships": [
        {"source": "a", "target": "b", "label": "RESOLVES_TO", "evidence": [{"source": "S1", "method": "stated"}]},
        {"source": "a", "target": "b", "label": "IS_RELATED_TO", "evidence": [{"source": "S1", "method": "stated"}]},
        {"source": "a", "target": "b", "label": "POSSIBLY_SAME_AS", "evidence": [{"source": "S1", "method": "stated"}]},
        {"source": "a", "target": "a", "label": "ASSOCIATE_OF", "evidence": [{"source": "S1", "method": "stated"}]},
        {"source": "a", "target": "b", "label": "EMAILS", "evidence": [{"source": "S1", "method": "stated"}]},
        {"source": "a", "target": "zz", "label": "HAS_EMAIL", "evidence": [{"source": "S1", "method": "stated"}]},
    ],
}
EXPECTED_ERRORS = [
    "looks like a plaintext secret", "unknown type 'Vehicle'", "needs at least one evidence item",
    "'S9' is not in the source catalog", "RESOLVES_TO does not allow Individual -> Email",
    "IS_RELATED_TO needs properties.caption", "POSSIBLY_SAME_AS needs two nodes of the same type",
    "self-loop", "unknown label 'EMAILS'", "match no entity ref or id",
]

results: list[tuple[bool, str]] = []


def check(ok: bool, what: str) -> bool:
    results.append((bool(ok), what))
    print(("PASS " if ok else "FAIL ") + what)
    return bool(ok)


def run(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-I", *args], capture_output=True, text=True, cwd=str(cwd))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--flowsint", type=Path, default=Path(os.environ.get("FLOWSINT_HOME", Path.home() / "Tools" / "flowsint")))
    a = ap.parse_args()
    have_fs = (a.flowsint / ".venv").exists()
    tmp = Path(tempfile.mkdtemp(prefix="flowsint-ontology-selftest-"))
    try:
        onto = json.loads((SKILL / "ontology" / "flowsint-ontology.json").read_text())
        ents, rels = onto["entity_types"], onto["relationships"]
        check(len(ents) == 40, f"ontology has 40 entity types ({len(ents)})")
        in_domains = {t for d in onto["domains"] for t in d["types"]}
        check(in_domains == set(ents), "every type belongs to exactly the taxonomy domains")
        check(all(r["status"] in ("native", "native-default", "extension") for r in rels), "relationship statuses valid")
        check(all(r["observed_pairs"] for r in rels if r["status"] == "native"), "every native label has enricher evidence")
        check(onto["generated_from"]["counts"]["calls_unresolved"] == 0, "no unresolved create_relationship call")
        names = {r["label"] for r in rels}
        check(all(v["label"] in names for v in onto["label_lookup"].values()), "label lookup targets exist")

        if have_fs:
            p = run([str(BUILD), "--flowsint", str(a.flowsint), "--check"], tmp)
            check(p.returncode == 0, "generated ontology is current with the Flowsint checkout" + ("" if p.returncode == 0 else f": {p.stderr.strip()[-300:]}"))
        else:
            check(True, "staleness check skipped (no Flowsint checkout)")

        # worked example: all layers
        out1 = tmp / "full"
        p = run([str(EMIT), str(EXAMPLE), "--out", str(out1), "--name", "acme", "--flowsint", str(a.flowsint)], tmp)
        ok = check(p.returncode == 0, "example draft emits with exit 0" + ("" if p.returncode == 0 else f": {p.stderr[-500:]}"))
        if ok:
            rep = json.loads(p.stdout)
            check(all((out1 / f).exists() for f in ("acme.flowsint.json", "acme.graphql", "acme.md")), "three documents written")
            check(rep["nodes"] == 13 and rep["relationships"] == 16, f"example yields 13 nodes / 16 relationships ({rep['nodes']}/{rep['relationships']})")
            want = 3 if have_fs else 2
            check(len(rep["contracts"]) >= want and all(c.endswith("pass") for c in rep["contracts"]),
                  f"contract layers pass: {rep['contracts']}")
            if have_fs:
                check(rep["validated_by"] == "flowsint-pydantic" and rep["canonicalized_by"] == "flowsint", "Flowsint models and canonicalizers used")
            doc = json.loads((out1 / "acme.flowsint.json").read_text())
            ids = {n["id"] for n in doc["nodes"]}
            check("domain:acme-widgets.example" in ids, "domain normalised and merged into one node")
            check(any(r["label"] == "HAS_LEADER" and r["source"].startswith("organization:") for r in doc["relationships"]),
                  "inverse label LEADS flipped to Organization -HAS_LEADER-> Individual")
            check(all("flowsint-ontology.evidence" in n["extensions"] for n in doc["nodes"] + doc["relationships"]), "evidence on every node and edge")
            md = (out1 / "acme.md").read_text()
            check(all(h in md for h in ("## Graph", "## Entities", "## Relationships", "## Evidence log", "## Validation")), "report has the core sections")

            # stdlib fallback parity
            out2 = tmp / "nofs"
            p2 = run([str(EMIT), str(EXAMPLE), "--out", str(out2), "--name", "acme", "--no-flowsint"], tmp)
            if check(p2.returncode == 0, "example emits without Flowsint (stdlib fallback)"):
                d2 = json.loads((out2 / "acme.flowsint.json").read_text())
                check([n["id"] for n in doc["nodes"]] == [n["id"] for n in d2["nodes"]], "fallback node ids equal Flowsint-backed ids")

            # round trip: the JSON is itself an accepted input
            out3 = tmp / "rt"
            p3 = run([str(EMIT), str(out1 / "acme.flowsint.json"), "--out", str(out3), "--name", "acme", "--flowsint", str(a.flowsint)], tmp)
            if check(p3.returncode == 0, "flowsint-graph JSON re-emits (round trip)"):
                d3 = json.loads((out3 / "acme.flowsint.json").read_text())
                key = lambda d: sorted((n["id"], json.dumps(n["properties"], sort_keys=True)) for n in d["nodes"])
                check(key(doc) == key(d3), "round trip preserves nodes and properties")
                ekey = lambda d: sorted((r["source"], r["label"], r["target"]) for r in d["relationships"])
                check(ekey(doc) == ekey(d3), "round trip preserves relationships")

        # invalid draft is blocked with precise errors and writes nothing
        bad = tmp / "invalid.json"
        bad.write_text(json.dumps(INVALID))
        out4 = tmp / "bad"
        p4 = run([str(EMIT), str(bad), "--out", str(out4), "--flowsint", str(a.flowsint)], tmp)
        check(p4.returncode == 1, "invalid draft exits 1")
        check(not any(out4.glob("*")) if out4.exists() else True, "invalid draft writes nothing")
        missing = [e for e in EXPECTED_ERRORS if e not in p4.stderr]
        check(not missing, f"all expected blocking errors reported{'' if not missing else ': missing ' + str(missing)}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    failed = [w for ok, w in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
