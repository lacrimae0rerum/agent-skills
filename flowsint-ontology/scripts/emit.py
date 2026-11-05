#!/usr/bin/env python3
"""Turn an extraction draft into the three deliverables: JSON, GraphQL, Markdown.

  python3 scripts/emit.py DRAFT.json --out DIR [--name SLUG]

Input: an extraction draft (see references/output-contract.md) or a flowsint-graph v1 document.
Output, all in DIR:
  <slug>.flowsint.json   flowsint-graph v1 document, importable by Flowsint, with evidence extensions
  <slug>.graphql         typed GraphQL mutation document, valid against ontology/flowsint-ontology.graphql
  <slug>.md              analyst report: summary, graph, entities, relationships, evidence, gaps, validation

Validation layers (all run by default when available):
  1. Ontology rules     types, fields, identity, labels, domain/range, evidence, sensitivity (stdlib).
  2. Flowsint models    every node instantiated with the real Pydantic type; labels and identity from
                        Flowsint code (needs a Flowsint checkout with .venv; --flowsint PATH).
  3. Contracts          JSON Schema of flowsint-graph v1 and GraphQL validation of the mutation document
                        (needs jsonschema + graphql-core, or `uv` to fetch them).

Exit status: 0 = written and valid; 1 = blocking errors (nothing written unless --force); 2 = usage error.
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from _common import (  # noqa: E402
    EDGE_PROP_TYPES, EVIDENCE_EXT, EXTRACTION_EXT, GQL_NAME, ONTOLOGY_DIR, ONTOLOGY_GRAPHQL,
    STDLIB_CANONICALIZERS, CanonError, canonical_identity, gql_enum_value, gql_field_type,
    gql_literal, gql_str, load_ontology, make_node_id, md_cell,
)

DEFAULT_FLOWSINT = Path(os.environ.get("FLOWSINT_HOME", Path.home() / "Tools" / "flowsint"))
MAX_NODES, MAX_EDGES, MAX_DEPTH, MAX_QUOTE = 500, 1000, 8, 300
METHODS = {"stated", "observed", "inferred", "enriched", "derived"}
RELIABILITY_DEFAULT = {"A": 0.9, "B": 0.8, "C": 0.6, "D": 0.4, "E": 0.2, "F": 0.5}
SECRET_KEY = re.compile(r"(pass(word|wd)?|pwd|secret|token|api[_-]?key|private[_-]?key|seed|mnemonic|cvv|cvc)", re.I)
HASHLIKE = re.compile(r"^(sha(1|256|512)|md5|bcrypt|argon2|ntlm|h):|^\$\w+\$|^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{40}$|^[0-9a-fA-F]{64}$|^[0-9a-fA-F]{128}$")


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.notices: list[str] = []

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append(f"{where}: {msg}")

    def note(self, where: str, msg: str) -> None:
        self.notices.append(f"{where}: {msg}")


# =========================================================================== input


def from_flowsint_graph(doc: dict) -> dict:
    """Convert a flowsint-graph v1 document (e.g. a Flowsint export) into draft form."""
    ext = (doc.get("extensions") or {}).get(EXTRACTION_EXT, {}).get("data", {})
    sources = ext.get("sources") or [{"id": "S1", "kind": "tool_output", "title": "Flowsint graph export", "reliability": "B"}]
    default_ev = [{"source": sources[0]["id"], "method": "enriched", "locator": "flowsint-graph import"}]

    def ev_of(obj: dict) -> list:
        data = (obj.get("extensions") or {}).get(EVIDENCE_EXT, {}).get("data", {})
        return data.get("evidence") or default_ev

    return {
        "extraction": {k: ext.get(k) for k in ("id", "title", "purpose", "agent", "language", "summary", "input_summary") if ext.get(k)}
        or {"title": "Flowsint graph"},
        "sources": sources,
        "entities": [
            {"ref": n["id"], "type": n.get("type", "phrase"), "properties": n.get("properties", {}), "evidence": ev_of(n)}
            for n in doc["nodes"]
        ],
        "relationships": [
            {"source": r["source"], "target": r["target"], "label": r["label"], "properties": r.get("properties", {}), "evidence": ev_of(r)}
            for r in doc.get("relationships", [])
        ],
        "gaps": ext.get("gaps", []), "questions": ext.get("questions", []), "excluded": ext.get("excluded", []),
    }


def depth(v, d=0) -> int:
    if isinstance(v, dict):
        return max([depth(x, d + 1) for x in v.values()] or [d + 1])
    if isinstance(v, list):
        return max([depth(x, d + 1) for x in v] or [d + 1])
    return d


# =========================================================================== Flowsint worker

_WORKER = r"""
import importlib.util, json, sys
types_src, canon_path, scripts_dir = sys.argv[1:4]
sys.path.insert(0, types_src); sys.path.insert(0, scripts_dir)
from flowsint_types import TYPE_REGISTRY, load_all_types
from _common import canonical_identity, CanonError
load_all_types()
try:
    spec = importlib.util.spec_from_file_location("fs_canon", canon_path)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    canon = mod.CANONICALIZERS
except Exception:
    canon = None
req = json.load(sys.stdin)
out = []
for item in req:
    cls = TYPE_REGISTRY.get(item["type"])
    res = {}
    try:
        obj = cls(**item["properties"])
        dump = obj.model_dump(mode="json", exclude_none=True)
        res = {"ok": True, "label": dump.pop("nodeLabel", None), "properties": dump}
    except Exception as e:
        if hasattr(e, "errors"):
            msg = "; ".join(".".join(map(str, x["loc"])) + ": " + x["msg"] for x in e.errors())
        else:
            msg = str(e)
        res = {"ok": False, "error": msg}
    if res["ok"] and canon is not None:
        try:
            vals, warns = canonical_identity(item["etype"], res["properties"], canon)
            res["identity"] = {"values": vals, "warnings": warns}
        except CanonError as e:
            res["identity_error"] = str(e)
    out.append(res)
print(json.dumps({"canon": canon is not None, "results": out}))
"""


def flowsint_worker(flowsint: Path | None, items: list[dict]) -> dict | None:
    if flowsint is None:
        return None
    py = flowsint / ".venv" / "bin" / "python"
    if not py.exists():
        return None
    proc = subprocess.run(
        [str(py), "-I", "-c", _WORKER, str(flowsint / "flowsint-types" / "src"),
         str(flowsint / "flowsint-core/src/flowsint_core/imports/identity/canonicalizers.py"), str(HERE)],
        input=json.dumps(items), capture_output=True, text=True, cwd=tempfile.gettempdir(),
    )
    if proc.returncode != 0:
        sys.stderr.write(f"warning: Flowsint validation worker failed; using ontology checks only\n{proc.stderr[-1500:]}\n")
        return None
    return json.loads(proc.stdout)


# =========================================================================== local checks


def check_value(dt: dict, v, onto: dict, where: str, rep: Report) -> None:
    if v is None:
        return
    k = dt["kind"]
    if k == "list":
        if not isinstance(v, list):
            rep.err(where, "expected a list")
            return
        for i, x in enumerate(v):
            check_value(dt["of"], x, onto, f"{where}[{i}]", rep)
    elif k == "enum":
        if v not in dt["values"]:
            rep.err(where, f"{v!r} not in {dt['values']}")
    elif k == "entity":
        if isinstance(v, dict):
            check_props(onto["entity_types"][dt["type"]], v, onto, where, rep, nested=True)
        elif not isinstance(v, str):
            rep.err(where, f"expected a {dt['type']} object")
    else:
        t = dt.get("type")
        ok = {
            "string": isinstance(v, str),
            "integer": isinstance(v, int) and not isinstance(v, bool),
            "number": isinstance(v, (int, float)) and not isinstance(v, bool),
            "boolean": isinstance(v, bool),
            "object": isinstance(v, dict),
        }.get(t, True)
        if not ok:
            rep.err(where, f"expected {t}, got {type(v).__name__}")
        elif t == "string" and dt.get("format") == "uri" and not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", v):
            rep.err(where, "expected an absolute URI with scheme")
        elif t == "string" and dt.get("format") == "email" and "@" not in v:
            rep.err(where, "expected an e-mail address")


def check_props(etype: dict, props: dict, onto: dict, where: str, rep: Report, nested: bool = False) -> None:
    fields = {f["name"]: f for f in etype["fields"]}
    for name in etype["required_fields"]:
        if name != "nodeLabel" and props.get(name) in (None, ""):
            rep.err(where, f"{etype['name']} requires {name!r}")
    for k, v in props.items():
        if k in fields:
            check_value(fields[k]["datatype"], v, onto, f"{where}.{k}", rep)
        elif not nested:
            rep.warn(where, f"property {k!r} is not a {etype['name']} field; kept as an extra property")


def check_secrets(etype: dict, props: dict, where: str, rep: Report) -> None:
    fields = {f["name"]: f for f in etype["fields"]}
    for k, v in props.items():
        sens = fields.get(k, {}).get("sensitivity")
        secretish = sens == "secret" or (k not in fields and SECRET_KEY.search(k))
        if not secretish or v in (None, ""):
            continue
        s = str(v)
        if "*" in s or "REDACTED" in s.upper() or HASHLIKE.match(s):
            continue
        rep.err(f"{where}.{k}", "looks like a plaintext secret; store sha256:<hex> or a masked form (****1234)")


# =========================================================================== core


def evidence_conf(evs: list[dict], sources: dict) -> float:
    per_source: dict[str, float] = {}
    for e in evs:
        c = e.get("confidence")
        if c is None:
            c = RELIABILITY_DEFAULT.get((sources.get(e["source"]) or {}).get("reliability", "F"), 0.5)
            c = {"observed": max(c, 0.9), "derived": max(c, 0.85), "inferred": min(c, 0.7)}.get(e.get("method"), c)
        per_source[e["source"]] = max(per_source.get(e["source"], 0.0), float(c))
    prod = 1.0
    for c in per_source.values():
        prod *= 1.0 - c
    return round(min(0.99, 1.0 - prod), 3) if per_source else 0.0


def band(c: float, onto: dict) -> str:
    for name, (lo, hi, _) in onto["evidence_model"]["confidence_scale"].items():
        if lo <= c <= hi:
            return name
    return "doubtful"


def check_evidence(evs, sources: dict, where: str, rep: Report) -> list[dict]:
    if not isinstance(evs, list) or not evs:
        rep.err(where, "needs at least one evidence item (no evidence, no claim)")
        return []
    out = []
    for i, e in enumerate(evs):
        w = f"{where}.evidence[{i}]"
        if not isinstance(e, dict) or e.get("source") not in sources:
            rep.err(w, f"source {e.get('source') if isinstance(e, dict) else e!r} is not in the source catalog")
            continue
        e = dict(e)
        if e.get("method") not in METHODS:
            rep.err(w, f"method must be one of {sorted(METHODS)}")
        c = e.get("confidence")
        if c is not None and not (isinstance(c, (int, float)) and 0 <= c <= 1):
            rep.err(w, "confidence must be a number in 0..1")
        if isinstance(e.get("quote"), str) and len(e["quote"]) > MAX_QUOTE:
            e["quote"] = e["quote"][: MAX_QUOTE - 1] + "…"
            rep.warn(w, f"quote truncated to {MAX_QUOTE} characters")
        out.append({k: v for k, v in e.items() if v is not None})
    return out


PRENORMALIZE = {"domain_idna", "email_address", "ip_compressed", "cidr_network", "asn_as_form", "url_standard", "username"}


def prenormalize(et: dict, props: dict, where: str, rep: Report) -> None:
    """Rewrite top-level identity values to their canonical form before model validation.

    Agents copy values verbatim (\"EXAMPLE.com.\", \"@handle\", \"AS0015169\"); Flowsint validators
    reject or diverge on such forms, and the canonical form is what identity matching uses.
    """
    sel = (et.get("identity") or {}).get("selector") or {}
    for f in sel.get("fields", []):
        path, name = f["path"], f["canonicalizer"]
        if "." in path or name not in PRENORMALIZE or not isinstance(props.get(path), str):
            continue
        try:
            new = STDLIB_CANONICALIZERS[name](props[path])
        except Exception:
            continue  # the model or identity step reports the malformed value
        if new != props[path]:
            rep.note(where, f"{path} normalised {props[path]!r} -> {new!r} ({name})")
            props[path] = new


def resolve_type(name: str, onto: dict) -> dict | None:
    ents = onto["entity_types"]
    if name in ents:
        return ents[name]
    low = {e["key"]: e for e in ents.values()}
    return low.get(str(name).lower())


def process(draft: dict, onto: dict, flowsint: Path | None, rep: Report, allow_new_labels: bool, lenient: bool) -> dict:
    ents_def = onto["entity_types"]
    reserved = set(onto["reserved_properties"]) - {"type"}  # `type` is a real field of several types
    ext = dict(draft.get("extraction") or {})
    if not ext.get("title"):
        rep.err("extraction", "title is required")
    sources = {}
    for i, s in enumerate(draft.get("sources") or []):
        if not s.get("id"):
            rep.err(f"sources[{i}]", "id is required")
            continue
        if s.get("kind") not in onto["evidence_model"]["source_kinds"]:
            rep.err(f"sources[{i}]", f"kind must be one of {onto['evidence_model']['source_kinds']}")
        if s.get("reliability") and s["reliability"] not in "ABCDEF":
            rep.err(f"sources[{i}]", "reliability must be A..F")
        sources[s["id"]] = s
    if not sources:
        rep.err("sources", "at least one source is required")
    raw_entities = draft.get("entities") or []
    if not raw_entities:
        rep.err("entities", "at least one entity is required")

    # -- entities: type, local checks -------------------------------------------------
    staged = []
    for i, e in enumerate(raw_entities):
        where = f"entities[{i}]" + (f" ({e.get('ref')})" if e.get("ref") else "")
        et = resolve_type(e.get("type", ""), onto)
        if et is None:
            close = difflib.get_close_matches(str(e.get("type")), list(ents_def), n=3)
            rep.err(where, f"unknown type {e.get('type')!r}; closest: {close}. Use Phrase only if nothing fits.")
            continue
        props = {k: v for k, v in (e.get("properties") or {}).items() if v is not None}
        own = {f["name"] for f in et["fields"]}
        for k in list(props):
            if k in reserved and k not in own:
                rep.err(where, f"property {k!r} is reserved by Flowsint")
                props.pop(k)
        if depth(props) > MAX_DEPTH:
            rep.err(where, f"properties nest deeper than {MAX_DEPTH}")
        prenormalize(et, props, where, rep)
        check_secrets(et, props, where, rep)
        evs = check_evidence(e.get("evidence"), sources, where, rep)
        staged.append({"where": where, "ref": e.get("ref"), "etype": et, "props": props, "evidence": evs,
                       "confidence": e.get("confidence"), "flag": e.get("flag")})

    # -- Flowsint model validation (preferred) or local schema checks ------------------
    worker = flowsint_worker(flowsint, [{"type": s["etype"]["name"], "properties": s["props"], "etype": s["etype"]} for s in staged])
    validated_by = "flowsint-pydantic" if worker else "ontology-schema"
    canon_by = "flowsint" if worker and worker["canon"] else "stdlib-mirror"
    for idx, s in enumerate(staged):
        et = s["etype"]
        if worker:
            res = worker["results"][idx]
            if not res["ok"]:
                rep.err(s["where"], f"Flowsint {et['name']} rejected the properties: {res['error']}")
                s["bad"] = True
                continue
            extras = {k: v for k, v in s["props"].items() if k not in {f["name"] for f in et["fields"]}}
            for k in extras:
                rep.warn(s["where"], f"property {k!r} is not a {et['name']} field; kept as an extra property")
            s["props"] = res["properties"]
            s["label"] = res["label"]
            ident = res.get("identity")
            if res.get("identity_error"):
                rep.err(s["where"], f"identity: {res['identity_error']}")
                s["bad"] = True
                continue
        else:
            n_err = len(rep.errors)
            check_props(et, s["props"], onto, s["where"], rep)
            if len(rep.errors) > n_err:
                s["bad"] = True
                continue
            s["label"] = None
            for lk in (et["label_key"], et["primary_field"]):
                lv = s["props"].get(lk) if lk else None
                if lv not in (None, ""):
                    s["label"] = str(lv.get("value", lv) if isinstance(lv, dict) else lv)
                    break
            ident = None
        if ident is None:
            try:
                vals, warns = canonical_identity(et, s["props"], STDLIB_CANONICALIZERS)
                ident = {"values": vals, "warnings": warns}
            except CanonError as ce:
                rep.err(s["where"], f"identity: {ce}")
                s["bad"] = True
                continue
        for w in ident["warnings"]:
            rep.warn(s["where"], w)
        sens_fields = {f["name"]: f.get("sensitivity") for f in et["fields"]}
        id_paths = [f["path"].split(".")[0] for f in ((et["identity"] or {}).get("selector") or {}).get("fields", [])]
        hashed = any(sens_fields.get(p) in ("secret", "financial", "government_id") for p in id_paths)
        s["id"] = make_node_id(et["key"], ident["values"], hashed)
        if not s.get("label"):
            s["label"] = " | ".join(ident["values"]) if not s["id"].split(":")[1] == "h" else s["id"]

    # -- merge duplicates by canonical id ----------------------------------------------
    nodes: dict[str, dict] = {}
    ref_map: dict[str, str] = {}
    for s in staged:
        if s.get("bad"):
            if s["ref"]:
                ref_map[s["ref"]] = "__invalid__"
            continue
        nid = s["id"]
        if s["ref"]:
            if s["ref"] in ref_map and ref_map[s["ref"]] != nid:
                rep.err(s["where"], f"ref {s['ref']!r} is used by two different entities")
            ref_map[s["ref"]] = nid
        ref_map.setdefault(nid, nid)
        if nid in nodes:
            n = nodes[nid]
            for k, v in s["props"].items():
                if k not in n["props"]:
                    n["props"][k] = v
                elif n["props"][k] != v:
                    rep.warn(s["where"], f"merged into {nid}; conflicting {k!r}: kept {n['props'][k]!r}, dropped {v!r}")
            n["evidence"] += s["evidence"]
            n["merged"] += 1
            if s.get("confidence") is not None:
                n["confidence"] = max(n.get("confidence") or 0, s["confidence"])
        else:
            nodes[nid] = {**s, "merged": 0}
    for n in nodes.values():
        if n["merged"]:
            rep.note(n["id"], f"{n['merged'] + 1} mentions merged (same canonical identity)")
        if n.get("confidence") is None:
            n["confidence"] = evidence_conf(n["evidence"], sources)

    # -- relationships -------------------------------------------------------------------
    rel_def = {r["label"]: r for r in onto["relationships"]}
    lookup = onto["label_lookup"]
    edges: dict[tuple, dict] = {}
    for i, r in enumerate(draft.get("relationships") or []):
        where = f"relationships[{i}]"
        raw_label = str(r.get("label", "")).strip()
        props = {k: v for k, v in (r.get("properties") or {}).items() if v is not None}
        src_ref, dst_ref = r.get("source"), r.get("target")
        spell = lookup.get(raw_label) or lookup.get(raw_label.upper().replace(" ", "_").replace("-", "_"))
        if spell:
            label = spell["label"]
            if spell["kind"] != "canonical" or label != raw_label:
                rep.note(where, f"label {raw_label!r} -> {label}" + (" (endpoints swapped)" if spell["flip"] else ""))
            if spell["flip"]:
                src_ref, dst_ref = dst_ref, src_ref
        elif allow_new_labels and re.fullmatch(r"[A-Z][A-Z0-9]*(_[A-Z0-9]+)*", raw_label):
            label = raw_label
            rep.warn(where, f"ad-hoc label {label} is outside the ontology (--allow-new-labels)")
        else:
            close = difflib.get_close_matches(raw_label.upper(), list(rel_def), n=4)
            rep.err(where, f"unknown label {raw_label!r}; closest: {close}")
            continue
        src, dst = ref_map.get(src_ref), ref_map.get(dst_ref)
        if src is None or dst is None:
            missing = [x for x, y in ((src_ref, src), (dst_ref, dst)) if y is None]
            rep.err(where, f"endpoint(s) {missing} match no entity ref or id")
            continue
        if "__invalid__" in (src, dst):
            rep.err(where, "an endpoint entity is invalid")
            continue
        if src == dst:
            rep.err(where, f"self-loop on {src} is not allowed")
            continue
        d = rel_def.get(label)
        st, tt = nodes[src]["etype"]["name"], nodes[dst]["etype"]["name"]
        if d:
            bad_dom = "*" not in d["domain"] and st not in d["domain"]
            bad_rng = "*" not in d["range"] and tt not in d["range"]
            if bad_dom or bad_rng:
                alts = [x["label"] for x in onto["relationships"]
                        if ("*" in x["domain"] or st in x["domain"]) and ("*" in x["range"] or tt in x["range"])
                        and not (x["label"] == "POSSIBLY_SAME_AS" and st != tt)]
                msg = f"{label} does not allow {st} -> {tt}; labels that do: {alts[:8]}"
                (rep.warn if lenient else rep.err)(where, msg)
                if not lenient:
                    continue
            if label == "IS_RELATED_TO" and not props.get("caption"):
                rep.err(where, "IS_RELATED_TO needs properties.caption stating the nature of the link")
                continue
            if label == "POSSIBLY_SAME_AS" and st != tt:
                rep.err(where, "POSSIBLY_SAME_AS needs two nodes of the same type")
                continue
            if d["symmetric"] and dst < src:
                src, dst = dst, src
        if depth(props) > MAX_DEPTH:
            rep.err(where, f"properties nest deeper than {MAX_DEPTH}")
        evs = check_evidence(r.get("evidence"), sources, where, rep)
        if not evs:
            continue
        key = (src, dst, label)
        if key in edges:
            e = edges[key]
            for k, v in props.items():
                if k in e["props"] and e["props"][k] != v:
                    rep.warn(where, f"duplicate {label} edge merged; conflicting {k!r}: kept {e['props'][k]!r}")
                e["props"].setdefault(k, v)
            e["evidence"] += evs
            rep.note(where, f"duplicate {src} -{label}-> {dst} merged")
            continue
        edges[key] = {"where": where, "source": src, "target": dst, "label": label, "props": props, "evidence": evs,
                      "status": d["status"] if d else "ad-hoc"}
    for e in edges.values():
        if "confidence_level" not in e["props"]:
            e["props"]["confidence_level"] = evidence_conf(e["evidence"], sources)

    # -- sensitivity inventory -------------------------------------------------------------
    sensitive = []
    for n in nodes.values():
        sf = {f["name"]: f.get("sensitivity") for f in n["etype"]["fields"]}
        for k, v in n["props"].items():
            if sf.get(k):
                sensitive.append({"node": n["id"], "field": k, "class": sf[k], "value": v})
    for s in sensitive:
        if s["class"] in ("special_category", "government_id"):
            rep.note(s["node"], f"{s['class']} field {s['field']!r} recorded; confirm it is stated in the input and needed")
    if len(nodes) > MAX_NODES or len(edges) > MAX_EDGES:
        rep.warn("graph", f"{len(nodes)} nodes / {len(edges)} relationships exceed Flowsint's import limits "
                          f"({MAX_NODES}/{MAX_EDGES}); split the extraction before importing")
    return {"extraction": ext, "sources": sources, "nodes": nodes, "edges": list(edges.values()),
            "gaps": draft.get("gaps") or [], "questions": draft.get("questions") or [],
            "excluded": draft.get("excluded") or [], "sensitive": sensitive,
            "validated_by": validated_by, "canonicalized_by": canon_by}


# =========================================================================== writers


def build_json(g: dict, onto: dict, ext_id: str, created: str) -> dict:
    nodes_out = []
    for n in g["nodes"].values():
        c = n["confidence"]
        node = {
            "id": n["id"],
            "type": n["etype"]["key"],
            "label": n["label"],
            "properties": n["props"],
            "metadata": {
                "extraction_id": ext_id,
                "ontology_domain": n["etype"]["domain"],
                "confidence": c,
                "confidence_band": band(c, onto),
                "sources": sorted({e["source"] for e in n["evidence"]}),
            },
            "extensions": {EVIDENCE_EXT: {"version": 1, "data": {"confidence": c, "band": band(c, onto), "evidence": n["evidence"]}}},
        }
        if n.get("flag"):
            node["display"] = {"node_size": None, "node_color": None, "node_icon": None, "node_image": None,
                               "node_flag": n["flag"], "node_shape": None, "x": None, "y": None}
        nodes_out.append(node)
    rels_out = []
    for e in g["edges"]:
        c = e["props"]["confidence_level"]
        rels_out.append({
            "source": e["source"], "target": e["target"], "label": e["label"], "properties": e["props"],
            "extensions": {EVIDENCE_EXT: {"version": 1, "data": {"confidence": c, "band": band(c, onto),
                                                                  "status": e["status"], "evidence": e["evidence"]}}},
        })
    x = g["extraction"]
    data = {
        "id": ext_id, "title": x.get("title"), "purpose": x.get("purpose"), "summary": x.get("summary"),
        "created_at": created, "agent": x.get("agent"), "language": x.get("language"),
        "input_summary": x.get("input_summary"),
        "ontology_version": onto["version"], "flowsint_commit": onto["generated_from"].get("flowsint_commit"),
        "sources": list(g["sources"].values()), "gaps": g["gaps"], "questions": g["questions"], "excluded": g["excluded"],
        "validated_by": g["validated_by"], "canonicalized_by": g["canonicalized_by"],
    }
    return {
        "format": "flowsint-graph", "schema_version": 1, "nodes": nodes_out, "relationships": rels_out,
        "extensions": {EXTRACTION_EXT: {"version": 1, "data": {k: v for k, v in data.items() if v not in (None, [], "")}}},
    }


def _input_types(onto: dict) -> dict[str, dict[str, str]]:
    out = {}
    for name, e in onto["entity_types"].items():
        out[name] = {f["name"]: gql_field_type(f["datatype"], f["required"], True)[0] for f in e["fields"] if GQL_NAME.match(f["name"])}
    return out


def _entity_literal(type_name: str, props: dict, itypes: dict) -> str:
    fields = itypes[type_name]
    parts, extra = [], {}
    for k, v in props.items():
        if k == "nodeLabel":
            continue  # computed by Flowsint compute_label(), not an input
        if k not in fields:
            extra[k] = v
            continue
        gt = fields[k]
        base = gt.strip("[]!")
        if base.endswith("Input") and base[:-5] in itypes:
            nested = base[:-5]
            if isinstance(v, list):
                lit = "[" + ", ".join(_entity_literal(nested, x if isinstance(x, dict) else _scalar_to_entity(nested, x), itypes) for x in v) + "]"
            else:
                lit = _entity_literal(nested, v if isinstance(v, dict) else _scalar_to_entity(nested, v), itypes)
        else:
            lit = gql_literal(v, gt)
        parts.append(f"{k}: {lit}")
    if extra:
        parts.append(f"extra: {gql_literal(extra, 'JSON')}")
    return "{" + ", ".join(parts) + "}"


_SCALAR_FIELD = {"Username": "value", "Domain": "domain", "Email": "email", "Phone": "number", "Ip": "address", "CryptoWallet": "address"}


def _scalar_to_entity(type_name: str, v) -> dict:
    return {_SCALAR_FIELD.get(type_name, "value"): v}


def _evidence_literal(evs: list[dict]) -> str:
    items = []
    for e in evs:
        parts = [f"source: {gql_str(e['source'])}", f"method: {gql_enum_value(e['method'])}"]
        for k, gk in (("locator", "locator"), ("quote", "quote"), ("observed_at", "observedAt")):
            if e.get(k) is not None:
                parts.append(f"{gk}: {gql_str(str(e[k]))}")
        if e.get("confidence") is not None:
            parts.append(f"confidence: {float(e['confidence'])}")
        items.append("{" + ", ".join(parts) + "}")
    return "[" + ", ".join(items) + "]"


def build_graphql(g: dict, onto: dict, ext_id: str, created: str, slug: str) -> str:
    itypes = _input_types(onto)
    x = g["extraction"]
    op = "Import_" + re.sub(r"[^0-9A-Za-z_]", "_", slug)
    L = [
        f"# Flowsint extraction {ext_id} - GraphQL mutation document",
        f"# Valid against flowsint-ontology.graphql (ontology {onto['version']}). Generated by emit.py; edit the draft, not this file.",
        f"# Nodes: {len(g['nodes'])} - relationships: {len(g['edges'])} - sources: {len(g['sources'])}",
        "",
        f"mutation {op} {{",
    ]
    ex_parts = [f"id: {gql_str(ext_id)}", f"title: {gql_str(x.get('title') or slug)}", f"createdAt: {gql_str(created)}",
                f"ontologyVersion: {gql_str(onto['version'])}"]
    for k, gk in (("purpose", "purpose"), ("agent", "agent"), ("language", "language"), ("input_summary", "inputSummary")):
        if x.get(k):
            ex_parts.append(f"{gk}: {gql_str(str(x[k]))}")
    if g["gaps"]:
        ex_parts.append("gaps: " + gql_literal([str(v) for v in g["gaps"]]))
    if g["questions"]:
        ex_parts.append("questions: " + gql_literal([str(v) for v in g["questions"]]))
    if g["excluded"]:
        ex_parts.append("excluded: [" + ", ".join(
            "{what: " + gql_str(str(v.get("what", v))) + ", reason: " + gql_str(str(v.get("reason", "not recorded"))) + "}"
            if isinstance(v, dict) else "{what: " + gql_str(str(v)) + ", reason: \"not recorded\"}"
            for v in g["excluded"]) + "]")
    L.append(f"  extraction: recordExtraction(input: {{{', '.join(ex_parts)}}}) {{ id }}")
    for i, s in enumerate(g["sources"].values(), 1):
        parts = [f"id: {gql_str(s['id'])}", f"kind: {gql_enum_value(s['kind'])}"]
        for k, gk in (("title", "title"), ("uri", "uri"), ("author", "author"), ("published_at", "publishedAt"),
                      ("retrieved_at", "retrievedAt"), ("sha256", "sha256"), ("notes", "notes")):
            if s.get(k):
                parts.append(f"{gk}: {gql_str(str(s[k]))}")
        if s.get("reliability"):
            parts.append(f"reliability: {s['reliability']}")
        L.append(f"  s{i}: registerSource(input: {{{', '.join(parts)}}}) {{ id }}")
    for i, n in enumerate(g["nodes"].values(), 1):
        t = n["etype"]["name"]
        L.append(f"  # {n['id']}")
        L.append(
            f"  n{i}: create{t}(nodeId: {gql_str(n['id'])}, nodeLabel: {gql_str(n['label'])}, "
            f"input: {_entity_literal(t, n['props'], itypes)}, evidence: {_evidence_literal(n['evidence'])}, "
            f"nodeConfidence: {float(n['confidence'])}) {{ nodeId }}"
        )
    for i, e in enumerate(g["edges"], 1):
        parts = [f"source: {gql_str(e['source'])}", f"target: {gql_str(e['target'])}", f"label: {e['label']}"]
        rest = {}
        for k, v in e["props"].items():
            if k in EDGE_PROP_TYPES and not isinstance(v, (dict, list)):
                gt = EDGE_PROP_TYPES[k]
                if gt == "Float" and isinstance(v, (int, float)) and not isinstance(v, bool):
                    parts.append(f"{k}: {float(v)}")
                elif gt == "Long" and isinstance(v, int) and not isinstance(v, bool):
                    parts.append(f"{k}: {v}")
                elif gt == "String":
                    parts.append(f"{k}: {gql_str(str(v))}")
                else:
                    rest[k] = v
            else:
                rest[k] = v
        if rest:
            parts.append(f"properties: {gql_literal(rest, 'JSON')}")
        parts.append(f"evidence: {_evidence_literal(e['evidence'])}")
        L.append(f"  r{i}: createRelationship(input: {{{', '.join(parts)}}}) {{ id }}")
    L.append("}")
    return "\n".join(L) + "\n"


def _mask(v, cls: str) -> str:
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    if cls == "special_category":
        return "(recorded; see JSON)"
    if cls == "secret":
        return "(hashed/masked)"
    return "****" + s[-4:] if len(s) > 4 else "****"


def build_md(g: dict, onto: dict, ext_id: str, created: str, files: dict, rep: Report, contract_results: list[str]) -> str:
    x = g["extraction"]
    nodes, edges = g["nodes"], g["edges"]
    sens_index = {(s["node"], s["field"]): s["class"] for s in g["sensitive"]}
    L: list[str] = []
    a = L.append
    a(f"# {x.get('title') or ext_id}\n")
    status = "valid" if not rep.errors else f"INVALID ({len(rep.errors)} errors)"
    a("| Field | Value |\n|---|---|")
    for k, v in (("Extraction id", ext_id), ("Created", created), ("Agent", x.get("agent")), ("Purpose", x.get("purpose")),
                 ("Language", x.get("language")), ("Ontology", f"flowsint-ontology {onto['version']} (Flowsint {str(onto['generated_from'].get('flowsint_commit'))[:12]})"),
                 ("Validation", f"{status}; nodes checked by {g['validated_by']}, identity by {g['canonicalized_by']}"),
                 ("Files", ", ".join(f"`{p.name}`" for p in files.values()))):
        if v:
            a(f"| {k} | {md_cell(v)} |")
    a("")
    if x.get("summary"):
        a("## Summary\n")
        a(f"{x['summary']}\n")
    if x.get("input_summary"):
        a(f"**Input:** {x['input_summary']}\n")

    by_dom: dict[str, list[dict]] = {}
    for n in nodes.values():
        by_dom.setdefault(n["etype"]["domain"], []).append(n)
    a("## At a glance\n")
    a(f"- **{len(nodes)}** entities, **{len(edges)}** relationships, **{len(g['sources'])}** sources.")
    a("- Entities by domain: " + ", ".join(f"{d['id']} {len(by_dom[d['id']])}" for d in onto["domains"] if d["id"] in by_dom))
    lab_count: dict[str, int] = {}
    for e in edges:
        lab_count[e["label"]] = lab_count.get(e["label"], 0) + 1
    if lab_count:
        a("- Relationships by label: " + ", ".join(f"`{k}` {v}" for k, v in sorted(lab_count.items())))
    a("")

    idx = {nid: f"n{i}" for i, nid in enumerate(nodes, 1)}
    if nodes and len(nodes) <= 150:
        a("## Graph\n")
        a("```mermaid\nflowchart LR")
        for nid, n in nodes.items():
            lab = f"{n['etype']['name']}: {n['label']}".replace('"', "'")
            if any((nid, f) in sens_index for f in n["props"]):
                lab += " 🔒"
            a(f'  {idx[nid]}["{lab[:60]}"]')
        for e in edges:
            style = "-.->" if e["props"]["confidence_level"] < 0.7 else "-->"
            a(f"  {idx[e['source']]} {style}|{e['label']}| {idx[e['target']]}")
        a("```\n")
        a("Dashed arrow: confidence below 0.7. 🔒: node holds sensitive fields.\n")

    a("## Entities\n")
    for dom in [d["id"] for d in onto["domains"]]:
        items = by_dom.get(dom)
        if not items:
            continue
        a(f"### {dom}\n")
        a("| Node | Type | Properties | Confidence | Sources |\n|---|---|---|---|---|")
        for n in items:
            shown = []
            for k, v in n["props"].items():
                cls = sens_index.get((n["id"], k))
                val = _mask(v, cls) if cls else (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
                shown.append(f"{k}={str(val)[:80]}")
            srcs = ", ".join(sorted({e["source"] for e in n["evidence"]}))
            a(f"| **{md_cell(n['label'])}**<br>`{md_cell(n['id'])}` | {n['etype']['name']} | {md_cell('; '.join(shown))} | "
              f"{n['confidence']} ({band(n['confidence'], onto)}) | {srcs} |")
        a("")

    a("## Relationships\n")
    if edges:
        a("| Source | Relationship | Target | Properties | Confidence | Evidence |\n|---|---|---|---|---|---|")
        for e in edges:
            pr = "; ".join(f"{k}={v}" for k, v in e["props"].items() if k != "confidence_level")
            ev = "; ".join(f"{v['source']}" + (f" ({v['locator']})" if v.get("locator") else "") for v in e["evidence"])
            st = "" if e["status"] != "extension" else " *(ext)*"
            a(f"| {md_cell(nodes[e['source']]['label'])} | `{e['label']}`{st} | {md_cell(nodes[e['target']]['label'])} | "
              f"{md_cell(pr)} | {e['props']['confidence_level']} ({band(e['props']['confidence_level'], onto)}) | {md_cell(ev)} |")
        a("\n*(ext)*: skill extension label (valid in Flowsint, not produced by its enrichers).\n")
    else:
        a("No relationships.\n")

    a("## Evidence log\n")
    a("| Claim | Source | Locator | Method | Quote |\n|---|---|---|---|---|")
    for n in nodes.values():
        for v in n["evidence"]:
            a(f"| node {md_cell(n['label'])} | {v['source']} | {md_cell(v.get('locator'))} | {v.get('method')} | {md_cell(v.get('quote'))} |")
    for e in edges:
        claim = f"{nodes[e['source']]['label']} {e['label']} {nodes[e['target']]['label']}"
        for v in e["evidence"]:
            a(f"| edge {md_cell(claim)} | {v['source']} | {md_cell(v.get('locator'))} | {v.get('method')} | {md_cell(v.get('quote'))} |")
    a("")

    a("## Sources\n")
    a("| Id | Kind | Title | URI / reference | Reliability | Retrieved |\n|---|---|---|---|---|---|")
    for s in g["sources"].values():
        a(f"| {s['id']} | {s.get('kind')} | {md_cell(s.get('title'))} | {md_cell(s.get('uri'))} | {s.get('reliability', '')} | {s.get('retrieved_at', '')} |")
    a("")

    if g["sensitive"]:
        a("## Sensitive data\n")
        a("Values are masked in this report; the JSON keeps them for import. Each must be stated in the input and needed by the purpose.\n")
        a("| Node | Field | Class | Value (masked) |\n|---|---|---|---|")
        for s in g["sensitive"]:
            a(f"| `{md_cell(s['node'])}` | {s['field']} | {s['class']} | {md_cell(_mask(s['value'], s['class']))} |")
        a("")

    for title, items in (("Gaps", g["gaps"]), ("Open questions", g["questions"])):
        if items:
            a(f"## {title}\n")
            for it in items:
                a(f"- {it}")
            a("")
    if g["excluded"]:
        a("## Deliberately not recorded\n")
        for it in g["excluded"]:
            a(f"- {it.get('what')}: {it.get('reason')}" if isinstance(it, dict) else f"- {it}")
        a("")

    a("## Validation\n")
    a(f"- Status: **{status}**")
    a(f"- Node models: {g['validated_by']}; identity canonicalizers: {g['canonicalized_by']}")
    for c in contract_results:
        a(f"- {c}")
    for title, items in (("Errors", rep.errors), ("Warnings", rep.warnings), ("Normalisations and notices", rep.notices)):
        if items:
            a(f"\n**{title}**\n")
            for it in items:
                a(f"- {md_cell(it)}")
    a("\n## Import into Flowsint\n")
    a(f"The `{files['json'].name}` file follows the frozen `flowsint-graph` v1 contract (Flowsint import, planned "
      "`IMPORT-001`). Evidence travels as inert extensions. Limits: 500 nodes, 1,000 relationships, 5 MiB.\n")
    return "\n".join(L).rstrip() + "\n"


# =========================================================================== contract validation

_CONTRACT_CHECK = r"""
import json, sys
import jsonschema, graphql
doc_p, gql_p, schema_p, sdl_p = sys.argv[1:5]
out = []
errs = sorted(jsonschema.Draft202012Validator(json.load(open(schema_p))).iter_errors(json.load(open(doc_p))), key=lambda e: list(e.path))
out.append({"check": "flowsint-graph v1 JSON Schema", "ok": not errs, "errors": [f"{list(e.path)}: {e.message[:200]}" for e in errs[:20]]})
schema = graphql.build_schema(open(sdl_p).read())
try:
    gerrs = graphql.validate(schema, graphql.parse(open(gql_p).read()))
    out.append({"check": "GraphQL mutation vs ontology SDL", "ok": not gerrs, "errors": [e.message[:200] for e in gerrs[:20]]})
except graphql.GraphQLError as e:
    out.append({"check": "GraphQL mutation vs ontology SDL", "ok": False, "errors": [str(e)[:300]]})
print(json.dumps(out))
"""


_FS_PARSE = r"""
import importlib, importlib.machinery, importlib.util, json, sys
from pathlib import Path
root = Path(sys.argv[2]) / "flowsint-core/src/flowsint_core"
# Namespace stubs: load the parser without executing flowsint_core/__init__ (which needs app config).
for name, sub in (("flowsint_core", ""), ("flowsint_core.imports", "imports"),
                  ("flowsint_core.imports.json", "imports/json"), ("flowsint_core.imports.session", "imports/session")):
    path = [str(root / sub)]
    spec = importlib.machinery.ModuleSpec(name, importlib.machinery.NamespaceLoader(name, path, importlib.machinery.PathFinder.find_spec), is_package=True)
    spec.submodule_search_locations = path
    sys.modules[name] = importlib.util.module_from_spec(spec)
gd = importlib.import_module("flowsint_core.imports.json.graph_document")
try:
    r = gd.parse_graph_document(open(sys.argv[1], "rb").read())
    print(json.dumps({"ok": True, "errors": [], "notices": [str(getattr(d, "code", d)) for d in r.diagnostics]}))
except gd.GraphDocumentError as e:
    print(json.dumps({"ok": False, "errors": [f"{getattr(d, 'code', d)} at {getattr(d, 'path', '')}" for d in e.diagnostics[:20]]}))
"""


def flowsint_parse_check(flowsint: Path | None, json_path: Path) -> dict | None:
    if flowsint is None:
        return None
    proc = subprocess.run([str(flowsint / ".venv/bin/python"), "-I", "-c", _FS_PARSE, str(json_path), str(flowsint)],
                          capture_output=True, text=True, cwd=tempfile.gettempdir())
    if proc.returncode != 0:
        sys.stderr.write(f"warning: Flowsint parser check could not run\n{proc.stderr[-1500:]}\n")
        return None
    return json.loads(proc.stdout)


def contract_check(json_path: Path, gql_path: Path) -> list[dict] | None:
    schema = ONTOLOGY_DIR / "contracts" / "flowsint-graph-v1.schema.json"
    args = [str(json_path), str(gql_path), str(schema), str(ONTOLOGY_GRAPHQL)]
    try:
        import graphql  # noqa: F401
        import jsonschema  # noqa: F401
        cmd = [sys.executable, "-I", "-c", _CONTRACT_CHECK, *args]
    except ImportError:
        if not shutil.which("uv"):
            return None
        cmd = ["uv", "run", "--no-project", "--quiet", "--with", "jsonschema", "--with", "graphql-core",
               "python", "-I", "-c", _CONTRACT_CHECK, *args]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=tempfile.gettempdir())
    if proc.returncode != 0:
        sys.stderr.write(f"warning: contract validation could not run\n{proc.stderr[-1500:]}\n")
        return None
    return json.loads(proc.stdout)


# =========================================================================== main


def slugify(text: str) -> str:
    s = re.sub(r"[^0-9A-Za-z]+", "-", text.lower()).strip("-")
    return s[:60] or "extraction"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("draft", type=Path, help="extraction draft JSON or flowsint-graph v1 JSON ('-' for stdin)")
    ap.add_argument("--out", type=Path, default=Path.cwd(), help="output directory (default: current directory)")
    ap.add_argument("--name", help="file name stem (default: slug of the extraction title)")
    ap.add_argument("--flowsint", type=Path, default=DEFAULT_FLOWSINT, help="Flowsint checkout with .venv (default: $FLOWSINT_HOME or ~/Tools/flowsint)")
    ap.add_argument("--no-flowsint", action="store_true", help="skip Flowsint model validation")
    ap.add_argument("--no-contracts", action="store_true", help="skip JSON Schema / GraphQL contract validation")
    ap.add_argument("--allow-new-labels", action="store_true", help="accept UPPER_SNAKE labels outside the ontology (warning)")
    ap.add_argument("--lenient", action="store_true", help="downgrade domain/range violations to warnings")
    ap.add_argument("--force", action="store_true", help="write outputs even when there are blocking errors")
    a = ap.parse_args()

    try:
        raw = sys.stdin.read() if str(a.draft) == "-" else a.draft.read_text()
        draft = json.loads(raw)
    except (OSError, json.JSONDecodeError) as e:
        print(f"error: cannot read draft: {e}", file=sys.stderr)
        return 2
    if draft.get("format") == "flowsint-graph":
        draft = from_flowsint_graph(draft)
    onto = load_ontology()
    rep = Report()
    flowsint = None if a.no_flowsint else (a.flowsint if (a.flowsint / ".venv").exists() else None)
    if not a.no_flowsint and flowsint is None:
        rep.warn("environment", f"no Flowsint checkout at {a.flowsint}; node models checked against the ontology only")
    g = process(draft, onto, flowsint, rep, a.allow_new_labels, a.lenient)

    created = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    title = g["extraction"].get("title") or "extraction"
    slug = a.name or slugify(title)
    ext_id = g["extraction"].get("id") or f"{slug}-{created[:10]}"
    a.out = a.out.resolve()
    a.out.mkdir(parents=True, exist_ok=True)
    files = {"json": a.out / f"{slug}.flowsint.json", "graphql": a.out / f"{slug}.graphql", "md": a.out / f"{slug}.md"}

    if rep.errors and not a.force:
        print(f"BLOCKED: {len(rep.errors)} error(s); nothing written. Fix the draft and run again.", file=sys.stderr)
        for e in rep.errors:
            print(f"  error   {e}", file=sys.stderr)
        for w in rep.warnings:
            print(f"  warning {w}", file=sys.stderr)
        return 1

    doc = build_json(g, onto, ext_id, created)
    files["json"].write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    files["graphql"].write_text(build_graphql(g, onto, ext_id, created, slug))
    contract_lines: list[str] = []
    if not a.no_contracts:
        res = contract_check(files["json"], files["graphql"])
        if res is None:
            rep.warn("contracts", "contract validation skipped: jsonschema/graphql-core not importable and uv unavailable or failed (see stderr)")
        else:
            for r in res:
                contract_lines.append(f"{r['check']}: {'pass' if r['ok'] else 'FAIL'}")
                for e in r["errors"]:
                    rep.err(r["check"], e)
    if not a.no_contracts:
        fp = flowsint_parse_check(flowsint, files["json"])
        if fp is not None:
            contract_lines.append(f"Flowsint parse_graph_document (importer): {'pass' if fp['ok'] else 'FAIL'}")
            for e in fp["errors"]:
                rep.err("Flowsint parse_graph_document", e)
    files["md"].write_text(build_md(g, onto, ext_id, created, files, rep, contract_lines))

    print(json.dumps({
        "status": "valid" if not rep.errors else "invalid",
        "files": {k: str(v) for k, v in files.items()},
        "nodes": len(g["nodes"]), "relationships": len(g["edges"]),
        "validated_by": g["validated_by"], "canonicalized_by": g["canonicalized_by"],
        "contracts": contract_lines, "errors": rep.errors, "warnings": rep.warnings, "notices": len(rep.notices),
    }, indent=2, ensure_ascii=False))
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
