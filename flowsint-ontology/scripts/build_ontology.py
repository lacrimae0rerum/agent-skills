#!/usr/bin/env python3
"""Regenerate the Flowsint ontology from a Flowsint checkout.

Reads four authoritative sources and one hand-authored curation file:

  1. Pydantic types        flowsint-types/src/flowsint_types/*.py   (via a venv import)
  2. UI categories         flowsint-core/.../services/type_registry_service.py (AST)
  3. Identity selectors    flowsint-core/.../imports/contracts/identity-config-v1.json
  4. Observed edges        flowsint-enrichers/src/flowsint_enrichers/**.py (AST of create_relationship)
  5. Curation              <skill>/ontology/curation.json (edge semantics, extensions, sensitivity)

Writes <skill>/ontology/flowsint-ontology.{json,graphql,md}.

Usage:
  python3 scripts/build_ontology.py --flowsint /path/to/flowsint [--python /path/to/venv/python]
  python3 scripts/build_ontology.py --check   # exit 1 if regenerated output differs from disk

Only the Python standard library is needed here. Importing the types needs
pydantic: the script uses <flowsint>/.venv/bin/python when present, else
`uv run --with pydantic python`.
"""

from __future__ import annotations

import argparse
import ast
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
sys.path.insert(0, str(HERE))

from _common import ONTOLOGY_DIR, render_ontology_graphql, render_ontology_md  # noqa: E402

DEFAULT_FLOWSINT = Path.home() / "Tools" / "flowsint"

TYPES_SRC = "flowsint-types/src"
CATEGORY_FILE = "flowsint-core/src/flowsint_core/core/services/type_registry_service.py"
IDENTITY_FILE = "flowsint-core/src/flowsint_core/imports/contracts/identity-config-v1.json"
GRAPH_SCHEMA_FILE = "flowsint-core/src/flowsint_core/imports/contracts/flowsint-graph-v1.schema.json"
ENRICHERS_DIR = "flowsint-enrichers/src/flowsint_enrichers"

# Runs inside the Flowsint interpreter. Prints one JSON object on stdout.
_DUMP = r"""
import inspect, json, sys
sys.path.insert(0, sys.argv[1])
from flowsint_types import TYPE_REGISTRY, load_all_types
load_all_types()
out = {}
for name, cls in sorted(TYPE_REGISTRY.all_types().items()):
    label_src = None
    fn = next((v for k, v in cls.__dict__.items() if k.startswith("compute_label")), None)
    if fn is not None:
        try:
            label_src = inspect.getsource(getattr(fn, "wrapped", getattr(fn, "__func__", fn)))
        except Exception:
            label_src = None
    out[name] = {
        "schema": cls.model_json_schema(),
        "module": cls.__module__,
        "detects": callable(getattr(cls, "detect", None)),
        "label_source": label_src,
    }
print(json.dumps(out, default=str))
"""


def _python_cmd(flowsint: Path, python: str | None) -> list[str]:
    if python:
        return [python, "-I"]
    venv = flowsint / ".venv" / "bin" / "python"
    if venv.exists():
        return [str(venv), "-I"]
    return ["uv", "run", "--no-project", "--with", "pydantic", "python", "-I"]


def dump_types(flowsint: Path, python: str | None) -> dict:
    cmd = _python_cmd(flowsint, python) + ["-c", _DUMP, str(flowsint / TYPES_SRC)]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=str(SKILL))
    if proc.returncode != 0:
        sys.exit(f"type dump failed ({' '.join(cmd[:2])}):\n{proc.stderr[-2000:]}")
    return json.loads(proc.stdout)


def parse_categories(flowsint: Path) -> list[dict]:
    """Read the literal list returned by TypeRegistryService._get_category_definitions."""
    tree = ast.parse((flowsint / CATEGORY_FILE).read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_get_category_definitions":
            ret = next(n for n in ast.walk(node) if isinstance(n, ast.Return))
            cats = []
            for d in ret.value.elts:
                item = {}
                for k, v in zip(d.keys, d.values):
                    key = k.value
                    if key == "children":
                        item["children"] = [
                            {
                                "type": c.elts[0].value,
                                "label_key": c.elts[1].value,
                                "icon": c.elts[2].value if isinstance(c.elts[2], ast.Constant) else None,
                            }
                            for c in v.elts
                        ]
                    elif isinstance(v, ast.Constant):
                        item[key] = v.value
                cats.append(item)
            return cats
    sys.exit("category definitions not found")


# --------------------------------------------------------------------------- edges


class _TypeInfo:
    """Field type lookup over the dumped JSON schemas."""

    def __init__(self, types: dict):
        self.names = set(types)
        self.lower = {n.lower(): n for n in types}
        self.fields: dict[str, dict[str, tuple[str, bool]]] = {}
        for name, info in types.items():
            props = info["schema"].get("properties", {})
            self.fields[name] = {k: self._ref(v) for k, v in props.items()}

    def _ref(self, v: dict) -> tuple[str, bool]:
        """Return (TypeName|'', is_list) for a JSON-schema property."""
        if "$ref" in v:
            return v["$ref"].rsplit("/", 1)[-1], False
        if v.get("type") == "array":
            t, _ = self._ref(v.get("items", {}))
            return t, True
        for alt in v.get("anyOf", []):
            t, lst = self._ref(alt)
            if t:
                return t, lst
        return "", False

    def field(self, type_name: str, attr: str) -> tuple[str, bool]:
        return self.fields.get(type_name, {}).get(attr, ("", False))


# Variable-name hints, used only when flow analysis cannot type an argument.
_HINTS = {
    "org": "Organization", "organization": "Organization", "company": "Organization",
    "individual": "Individual", "indiv": "Individual", "person": "Individual", "leader": "Individual",
    "dirigeant": "Individual", "contact": "Individual",
    "ip": "Ip", "email": "Email", "phone": "Phone", "domain": "Domain", "subdomain": "Domain",
    "root": "Domain", "website": "Website", "site": "Website", "url": "Website",
    "asn": "ASN", "cidr": "CIDR", "port": "Port", "wallet": "CryptoWallet",
    "tx": "CryptoWalletTransaction", "transaction": "CryptoWalletTransaction", "nft": "CryptoNFT",
    "cert": "SSLCertificate", "ssl": "SSLCertificate", "tech": "Technology", "technology": "Technology",
    "tracker": "WebTracker", "address": "Location", "location": "Location", "breach": "Breach",
    "leak": "Leak", "credential": "Credential", "username": "Username", "user": "Username",
    "social": "SocialAccount", "account": "SocialAccount", "profile": "SocialAccount",
    "gravatar": "Gravatar", "whois": "Whois", "record": "DNSRecord", "dns": "DNSRecord",
    "risk": "RiskProfile", "phrase": "Phrase", "text": "Phrase",
}


def _hint(name: str, ti: _TypeInfo) -> str:
    base = name.lower().strip("_")
    for suffix in ("_obj", "_node", "_entity", "_item", "_type", "s"):
        if base.endswith(suffix) and base[: -len(suffix)]:
            cand = base[: -len(suffix)]
            if cand in ti.lower:
                return ti.lower[cand]
    if base in ti.lower:
        return ti.lower[base]
    for part in reversed(base.split("_")):
        if part in _HINTS:
            return _HINTS[part]
        if part in ti.lower:
            return ti.lower[part]
    return ""


class _Env:
    """Flow-insensitive variable typing inside one enricher method."""

    def __init__(self, ti: _TypeInfo, io: dict[str, str], self_attrs: dict[str, ast.AST]):
        self.ti, self.io, self.self_attrs = ti, io, self_attrs
        self.vars: dict[str, tuple[str, bool]] = {}
        self.consts: dict[str, str] = {}

    # annotation -> (type, is_list) ; tuples -> ("tuple:A,B", list)
    def ann(self, node: ast.AST | None) -> tuple[str, bool]:
        if node is None:
            return "", False
        if isinstance(node, ast.Name):
            n = self.io.get(node.id, node.id)
            return (n, False) if n in self.ti.names else ("", False)
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return (node.value, False) if node.value in self.ti.names else ("", False)
        if isinstance(node, ast.Subscript):
            outer = getattr(node.value, "id", getattr(node.value, "attr", ""))
            inner = node.slice
            if outer in ("List", "list", "Sequence", "Iterable", "Set", "set"):
                t, _ = self.ann(inner)
                return t, True
            if outer in ("Optional",):
                return self.ann(inner)
            if outer in ("tuple", "Tuple") and isinstance(inner, ast.Tuple):
                parts = [self.ann(e)[0] for e in inner.elts]
                return "tuple:" + ",".join(parts), False
            if outer in ("Dict", "dict") and isinstance(inner, ast.Tuple):
                k, _ = self.ann(inner.elts[0])
                v, vl = self.ann(inner.elts[1])
                return f"dict:{k}|{v}|{int(vl)}", False
        return "", False

    def expr(self, node: ast.AST) -> tuple[str, bool]:
        ti = self.ti
        if isinstance(node, ast.Name):
            return self.vars.get(node.id, ("", False))
        if isinstance(node, ast.Call):
            fn = node.func
            fname = getattr(fn, "id", getattr(fn, "attr", ""))
            if fname in ti.names:
                return fname, False
            if fname in ("model_copy", "copy") and isinstance(fn, ast.Attribute):
                return self.expr(fn.value)
            if fname == "items" and isinstance(fn, ast.Attribute):
                return self.expr(fn.value)
            return "", False
        if isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name) and node.value.id == "self":
                ann = self.self_attrs.get(node.attr)
                return self.ann(ann) if ann is not None else ("", False)
            base, is_list = self.expr(node.value)
            if base and not is_list and base in ti.names:
                return ti.field(base, node.attr)
            return "", False
        if isinstance(node, ast.Subscript):
            t, is_list = self.expr(node.value)
            return (t, False) if is_list else ("", False)
        if isinstance(node, (ast.List, ast.ListComp)):
            elt = node.elts[0] if isinstance(node, ast.List) and node.elts else getattr(node, "elt", None)
            if elt is not None:
                t, _ = self.expr(elt)
                return t, True
        return "", False

    def bind(self, target: ast.AST, typ: tuple[str, bool]) -> None:
        t, is_list = typ
        if isinstance(target, ast.Name):
            if t:
                self.vars[target.id] = typ
        elif isinstance(target, ast.Tuple) and t.startswith("tuple:"):
            for sub, part in zip(target.elts, t[6:].split(",")):
                self.bind(sub, (part, False))
        elif isinstance(target, ast.Tuple) and t.startswith("dict:"):
            k, v, vl = t[5:].split("|")
            if len(target.elts) == 2:
                self.bind(target.elts[0], (k, False))
                self.bind(target.elts[1], (v, vl == "1"))

    def iter_elem(self, it: ast.AST) -> tuple[str, bool]:
        # `for a, b in zip(xs, ys)` / `for i, x in enumerate(xs)`
        if isinstance(it, ast.Call) and getattr(it.func, "id", "") == "zip":
            return "tuple:" + ",".join(self.iter_elem(a)[0] for a in it.args), False
        if isinstance(it, ast.Call) and getattr(it.func, "id", "") == "enumerate" and it.args:
            return "tuple:," + self.iter_elem(it.args[0])[0], False
        # `for x in data` where data: List[InputType]
        t, is_list = self.expr(it)
        if is_list:
            return t, False
        if t.startswith(("tuple:", "dict:")):
            return t, False
        if isinstance(it, ast.Name) and it.id in ("data", "original_input", "inputs", "input_data"):
            return self.io.get("InputType", ""), False
        if isinstance(it, ast.Name) and it.id in ("results", "outputs"):
            return self.io.get("OutputType", ""), False
        return "", False

    def scan(self, fn: ast.FunctionDef) -> None:
        for a in fn.args.args + fn.args.kwonlyargs:
            t = self.ann(a.annotation)
            if t[0]:
                self.vars[a.arg] = t
        for _ in range(2):  # two passes so later-defined names resolve earlier uses
            for node in ast.walk(fn):
                if isinstance(node, ast.Assign):
                    if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                        for tg in node.targets:
                            if isinstance(tg, ast.Name):
                                self.consts[tg.id] = node.value.value
                    t = self.expr(node.value)
                    for tg in node.targets:
                        self.bind(tg, t)
                elif isinstance(node, ast.AnnAssign):
                    t = self.ann(node.annotation)
                    if not t[0] and node.value is not None:
                        t = self.expr(node.value)
                    self.bind(node.target, t)
                elif isinstance(node, (ast.For, ast.comprehension)):
                    self.bind(node.target, self.iter_elem(node.iter))

    def arg_type(self, node: ast.AST) -> tuple[str, str]:
        """Return (TypeName, method) for a create_relationship argument."""
        t, is_list = self.expr(node)
        if t and not is_list and t in self.ti.names:
            return t, "flow"
        name = node.id if isinstance(node, ast.Name) else getattr(node, "attr", "")
        h = _hint(name, self.ti) if name else ""
        return (h, "name-hint") if h else ("", "unresolved")

    def label(self, node: ast.AST | None) -> str:
        if node is None:
            return "IS_RELATED_TO"
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        if isinstance(node, ast.Name):
            return self.consts.get(node.id, "{" + node.id + "}")
        if isinstance(node, ast.JoinedStr):
            out = []
            for v in node.values:
                if isinstance(v, ast.Constant):
                    out.append(str(v.value))
                else:
                    out.append("{" + ast.unparse(v.value) + "}")
            return "".join(out)
        return "{" + ast.unparse(node) + "}"


def _enricher_meta(cls: ast.ClassDef) -> dict:
    meta = {"class": cls.name}
    for item in cls.body:
        if isinstance(item, ast.Assign) and len(item.targets) == 1:
            tg = item.targets[0]
            if isinstance(tg, ast.Name) and tg.id in ("InputType", "OutputType"):
                meta[tg.id] = ast.unparse(item.value)
        if isinstance(item, ast.FunctionDef) and item.name in ("name", "category", "key"):
            for n in ast.walk(item):
                if isinstance(n, ast.Return) and isinstance(n.value, ast.Constant):
                    meta[item.name] = n.value.value
    return meta


def extract_edges(flowsint: Path, ti: _TypeInfo) -> tuple[list[dict], list[dict]]:
    root = flowsint / ENRICHERS_DIR
    calls, enrichers = [], []
    for path in sorted(root.rglob("*.py")):
        tree = ast.parse(path.read_text())
        rel = path.relative_to(flowsint).as_posix()
        for cls in [n for n in tree.body if isinstance(n, ast.ClassDef)]:
            decos = {getattr(d, "id", getattr(d, "attr", "")) for d in cls.decorator_list}
            if "flowsint_enricher" not in decos:
                continue
            meta = _enricher_meta(cls)
            env0 = _Env(ti, {}, {})
            io = {}
            for k in ("InputType", "OutputType"):
                if k in meta:
                    t, _ = env0.ann(ast.parse(meta[k], mode="eval").body)
                    io[k] = t
            meta.update({"file": rel, "input": io.get("InputType", ""), "output": io.get("OutputType", "")})
            enrichers.append(meta)
            self_attrs: dict[str, ast.AST] = {}
            for fn in [n for n in cls.body if isinstance(n, ast.FunctionDef)]:
                for n in ast.walk(fn):
                    if (
                        isinstance(n, ast.AnnAssign)
                        and isinstance(n.target, ast.Attribute)
                        and isinstance(n.target.value, ast.Name)
                        and n.target.value.id == "self"
                    ):
                        self_attrs[n.target.attr] = n.annotation
            for fn in [n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]:
                env = _Env(ti, io, self_attrs)
                env.scan(fn)
                for n in ast.walk(fn):
                    if not (
                        isinstance(n, ast.Call)
                        and isinstance(n.func, ast.Attribute)
                        and n.func.attr == "create_relationship"
                    ):
                        continue
                    args = list(n.args)
                    kw = {k.arg: k.value for k in n.keywords}
                    src = args[0] if args else kw.get("from_obj")
                    dst = args[1] if len(args) > 1 else kw.get("to_obj")
                    lab = args[2] if len(args) > 2 else kw.get("rel_label")
                    s_t, s_m = env.arg_type(src)
                    d_t, d_m = env.arg_type(dst)
                    calls.append(
                        {
                            "label": env.label(lab),
                            "source": s_t,
                            "target": d_t,
                            "resolution": "flow" if s_m == d_m == "flow" else f"{s_m}/{d_m}",
                            "source_expr": ast.unparse(src),
                            "target_expr": ast.unparse(dst),
                            "enricher": meta.get("name", cls.name),
                            "at": f"{rel}:{n.lineno}",
                        }
                    )
    return calls, enrichers


def normalize_calls(calls: list[dict], curation: dict) -> list[dict]:
    """Apply per-call overrides, expand templated labels, map aliases, add curated calls."""
    overrides = curation.get("edge_call_overrides", {})
    templates = curation.get("label_templates", {})
    aliases = curation.get("label_aliases", {})
    out = []
    for c in calls:
        o = overrides.get(c["at"])
        if o:
            c.update({k: v for k, v in o.items() if k in ("label", "source", "target", "anomaly", "note")})
            if any(k in o for k in ("label", "source", "target")):
                c["resolution"] = "curated-override"
        if c["label"] in templates:
            for lab in templates[c["label"]]["labels"]:
                out.append({**c, "label": lab, "label_template": c["label"]})
            continue
        if c["label"] in aliases:
            c = {**c, "raw_label": c["label"], "label": aliases[c["label"]]["canonical"]}
            c["anomaly"] = aliases[c["raw_label"]]["reason"]
        out.append(c)
    seen = {(c["at"], c["label"], c["source"], c["target"]) for c in out}
    for extra in curation.get("extra_observed_calls", []):
        key = (extra["at"], extra["label"], extra["source"], extra["target"])
        if key not in seen:
            out.append(dict(extra))
    return out


def build_label_lookup(relationships: list[dict], curation: dict) -> dict:
    """Map every accepted spelling to (canonical label, flip endpoints?)."""
    canon = {r["label"] for r in relationships}
    lookup: dict[str, dict] = {lab: {"label": lab, "flip": False, "kind": "canonical"} for lab in canon}

    def add(name: str, target: str, flip: bool, kind: str) -> None:
        if name in lookup:
            prev = lookup[name]
            if (prev["label"], prev["flip"]) != (target, flip):
                sys.exit(f"label spelling {name!r} is ambiguous: {prev} vs {target} ({kind})")
            return
        lookup[name] = {"label": target, "flip": flip, "kind": kind}

    for r in relationships:
        for syn in r["use_instead_of"]:
            add(syn, r["label"], False, "synonym")
        if r["inverse"] and not r["symmetric"]:
            add(r["inverse"], r["label"], True, "inverse")
    for raw, a in curation.get("label_aliases", {}).items():
        add(raw, a["canonical"], False, "alias")
    return dict(sorted(lookup.items()))


# --------------------------------------------------------------------------- compose


def _field_entry(name: str, prop: dict, required: set, sensitivity: dict) -> dict:
    def gtype(v: dict) -> dict:
        if "$ref" in v:
            return {"kind": "entity", "type": v["$ref"].rsplit("/", 1)[-1]}
        if v.get("type") == "array":
            return {"kind": "list", "of": gtype(v.get("items", {}))}
        alts = [a for a in v.get("anyOf", []) if a.get("type") != "null"]
        if alts:
            g = gtype(alts[0])
            g["nullable"] = True
            return g
        if "enum" in v:
            return {"kind": "enum", "values": v["enum"]}
        out = {"kind": "scalar", "type": v.get("type", "any")}
        if "format" in v:
            out["format"] = v["format"]
        return out

    entry = {
        "name": name,
        "title": prop.get("title", name),
        "description": prop.get("description", ""),
        "required": name in required,
        "primary": bool(prop.get("primary")),
        "datatype": gtype(prop),
    }
    if "default" in prop and prop["default"] is not None:
        entry["default"] = prop["default"]
    if name in sensitivity:
        entry["sensitivity"] = sensitivity[name]
    return entry


def compose(flowsint: Path, python: str | None) -> dict:
    curation = json.loads((ONTOLOGY_DIR / "curation.json").read_text())
    types = dump_types(flowsint, python)
    ti = _TypeInfo(types)
    cats = parse_categories(flowsint)
    identity_doc = json.loads((flowsint / IDENTITY_FILE).read_text())
    identity = {t["registry_key"]: t for t in identity_doc["types"]}
    calls, enrichers = extract_edges(flowsint, ti)
    calls = normalize_calls(calls, curation)

    # categories ------------------------------------------------------------
    type_cats: dict[str, list[str]] = defaultdict(list)
    categories = []
    for c in cats:
        cid = c["key"]
        categories.append(
            {
                "id": cid,
                "ui_type": c.get("type"),
                "label": c.get("label"),
                "icon": c.get("icon"),
                "native": True,
                "types": [ch["type"] for ch in c["children"]],
                "label_keys": {ch["type"]: ch["label_key"] for ch in c["children"]},
            }
        )
        for ch in c["children"]:
            type_cats[ch["type"]].append(cid)
    uncategorized = sorted(set(types) - set(type_cats))
    categories.append(
        {
            "id": "enrichment_artifacts",
            "ui_type": None,
            "label": "Enrichment artifacts (registered, not in the UI picker)",
            "icon": None,
            "native": False,
            "types": uncategorized,
            "label_keys": {},
        }
    )
    for t in uncategorized:
        type_cats[t].append("enrichment_artifacts")

    # taxonomy (skill-level super-classes) -----------------------------------
    domain_of = {}
    for dom in curation["domains"]:
        for t in dom["types"]:
            domain_of[t] = dom["id"]
    missing = sorted(set(types) - set(domain_of))
    if missing:
        sys.exit(f"curation.json domains miss types: {missing}")

    # entity types ----------------------------------------------------------
    sens = curation.get("sensitivity", {})
    entities = {}
    for name, info in types.items():
        sch = info["schema"]
        req = set(sch.get("required", []))
        props = sch.get("properties", {})
        prim = [k for k, v in props.items() if v.get("primary")]
        ident = identity.get(name, {})
        type_sens = {**sens.get("*", {}), **sens.get(name, {})}
        hints = curation.get("type_hints", {}).get(name, {})
        entities[name] = {
            "name": name,
            "key": name.lower(),
            "description": sch.get("description", ""),
            "domain": domain_of[name],
            "categories": type_cats[name],
            "module": info["module"],
            "primary_field": prim[0] if prim else None,
            "required_fields": sorted(req),
            "label_key": next(
                (c["label_keys"][name] for c in categories if name in c["label_keys"]), prim[0] if prim else None
            ),
            "auto_detect": info["detects"],
            "identity": {
                "selector": ident.get("selector"),
                "selector_override": ident.get("selector_override"),
                "case_rule": ident.get("case_rule"),
                "notes": ident.get("notes"),
            },
            "extraction_hints": hints,
            "fields": [
                _field_entry(k, v, req, type_sens) for k, v in props.items() if k != "nodeLabel"
            ],
            "label_rule_source": info["label_source"],
        }

    # identity-constrained Any fields: identity-config accepts only a JSON string -> type them as string
    for name, e in entities.items():
        sel = e["identity"].get("selector") or {}
        for f in sel.get("fields", []):
            if f.get("accepted_forms") == ["JSON string"] and "." not in f["path"]:
                for fld in e["fields"]:
                    if fld["name"] == f["path"] and fld["datatype"] == {"kind": "scalar", "type": "any"}:
                        fld["datatype"] = {"kind": "scalar", "type": "string", "note": "typed Any upstream; identity-config-v1 accepts only a JSON string"}

    # relationships -----------------------------------------------------------
    observed: dict[str, dict] = defaultdict(lambda: defaultdict(list))
    for c in calls:
        ev = {"enricher": c["enricher"], "at": c["at"], "resolution": c["resolution"]}
        for k in ("raw_label", "label_template", "anomaly", "note"):
            if k in c:
                ev[k] = c[k]
        observed[c["label"]][(c["source"] or "?", c["target"] or "?")].append(ev)
    rel_cur = curation["relationships"]
    relationships, problems = [], []
    for lab in sorted(set(observed) | set(rel_cur)):
        cur = rel_cur.get(lab)
        if cur is None:
            problems.append(f"observed label {lab!r} has no curation entry")
            continue
        if not lab.replace("_", "").isalnum() or lab != lab.upper():
            problems.append(f"label {lab!r} is not UPPER_SNAKE_CASE")
        obs = observed.get(lab, {})
        status = cur["status"]
        if obs and status == "extension":
            problems.append(f"{lab}: observed in Flowsint but curated as extension")
        if not obs and status == "native":
            problems.append(f"{lab}: curated as native but no enricher evidence")
        dom, rng = cur.get("domain", ["*"]), cur.get("range", ["*"])
        for t in dom + rng:
            if t != "*" and t not in entities:
                problems.append(f"{lab}: unknown type {t!r} in domain/range")
        pairs = []
        for (src, dst), ev in sorted(obs.items()):
            anomalous = all("anomaly" in e for e in ev)
            if not anomalous and (("*" not in dom and src not in dom) or ("*" not in rng and dst not in rng)):
                problems.append(f"{lab}: observed {src}->{dst} outside curated domain/range ({ev[0]['at']})")
            pairs.append({"source": src, "target": dst, "anomalous": anomalous, "evidence": ev})
        relationships.append(
            {
                "label": lab,
                "status": status,
                "group": cur["group"],
                "definition": cur["definition"],
                "domain": dom,
                "range": rng,
                "inverse": cur.get("inverse"),
                "symmetric": cur.get("symmetric", False),
                "properties": cur.get("properties", []),
                "use_instead_of": cur.get("use_instead_of", []),
                "notes": cur.get("notes", ""),
                "observed_pairs": pairs,
            }
        )
    if problems:
        sys.exit("curation inconsistencies:\n  " + "\n  ".join(problems))
    label_lookup = build_label_lookup(relationships, curation)

    unresolved = [c for c in calls if not c["source"] or not c["target"]]
    hinted = [c for c in calls if "name-hint" in c["resolution"]]

    commit = subprocess.run(
        ["git", "-C", str(flowsint), "rev-parse", "HEAD"], capture_output=True, text=True
    ).stdout.strip()

    return {
        "$id": "flowsint-ontology",
        "format": "flowsint-ontology",
        "version": curation["version"],
        "generated_from": {
            "flowsint_commit": commit or None,
            "sources": {
                "types": f"{TYPES_SRC}/flowsint_types/*.py",
                "categories": CATEGORY_FILE,
                "identity": IDENTITY_FILE,
                "graph_import_schema": GRAPH_SCHEMA_FILE,
                "enrichers": ENRICHERS_DIR,
                "curation": "ontology/curation.json (skill)",
            },
            "counts": {
                "entity_types": len(entities),
                "relationship_labels": len(relationships),
                "enrichers": len(enrichers),
                "create_relationship_calls": len(calls),
                "calls_typed_by_name_hint": len(hinted),
                "calls_unresolved": len(unresolved),
            },
        },
        "conventions": curation["conventions"],
        "reserved_properties": curation["reserved_properties"],
        "evidence_model": curation["evidence_model"],
        "sensitivity_classes": curation["sensitivity_classes"],
        "domains": curation["domains"],
        "categories": categories,
        "canonicalizers": {
            k: {"algorithm": v["algorithm"], "case_rule": v.get("case_rule")}
            for k, v in identity_doc["canonicalizers"].items()
        },
        "entity_types": entities,
        "relationship_groups": list(dict.fromkeys(r["group"] for r in rel_cur.values())),
        "relationships": relationships,
        "label_lookup": label_lookup,
        "enrichers": sorted(enrichers, key=lambda e: e.get("name", e["class"])),
        "relationship_calls": calls,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--flowsint", type=Path, default=DEFAULT_FLOWSINT)
    ap.add_argument("--python", help="interpreter that can import pydantic (default: <flowsint>/.venv)")
    ap.add_argument("--check", action="store_true", help="fail if outputs on disk are stale")
    ap.add_argument("--report", action="store_true", help="print edge-resolution report")
    a = ap.parse_args()

    onto = compose(a.flowsint.resolve(), a.python)
    outputs = {
        "flowsint-ontology.json": json.dumps(onto, indent=2, ensure_ascii=False) + "\n",
        "flowsint-ontology.graphql": render_ontology_graphql(onto),
        "flowsint-ontology.md": render_ontology_md(onto),
    }
    if a.report:
        for c in onto["relationship_calls"]:
            if c["resolution"] != "flow":
                print(f"{c['resolution']:>22}  {c['at']:<70} {c['source'] or '?'} -[{c['label']}]-> {c['target'] or '?'}"
                      f"   ({c['source_expr']} , {c['target_expr']})")
        print(json.dumps(onto["generated_from"]["counts"]))
    contracts = ONTOLOGY_DIR / "contracts"
    contracts.mkdir(exist_ok=True)
    for src in (GRAPH_SCHEMA_FILE, IDENTITY_FILE):
        outputs[f"contracts/{Path(src).name}"] = (a.flowsint / src).read_text()
    outputs["../references/extraction-draft.schema.json"] = json.dumps(draft_schema(onto), indent=2) + "\n"
    stale = []
    for fname, text in outputs.items():
        path = (ONTOLOGY_DIR / fname).resolve()
        # generated_from.flowsint_commit changes with every upstream commit; compare the rest.
        if a.check:
            if not path.exists() or _strip_volatile(path.read_text(), fname) != _strip_volatile(text, fname):
                stale.append(fname)
        else:
            path.write_text(text)
    if a.check:
        if stale:
            sys.exit(f"stale ontology outputs: {stale} (run build_ontology.py)")
        print("ontology outputs are current")
    else:
        print("wrote", ", ".join(outputs), "->", ONTOLOGY_DIR)


def draft_schema(onto: dict) -> dict:
    """JSON Schema of the emit.py draft; the type enum tracks the Flowsint registry."""
    names = sorted(onto["entity_types"])
    ev = {
        "type": "object", "additionalProperties": False, "required": ["source", "method"],
        "properties": {
            "source": {"type": "string", "description": "Id of a source in sources[]"},
            "locator": {"type": "string"},
            "quote": {"type": "string", "description": "Verbatim excerpt; emit.py truncates to 300 characters"},
            "method": {"enum": sorted(onto["evidence_model"]["methods"])},
            "observed_at": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
    }
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "flowsint-ontology/extraction-draft.schema.json",
        "title": f"flowsint-ontology extraction draft (ontology {onto['version']})",
        "description": "Input of scripts/emit.py. Generated by build_ontology.py.",
        "type": "object",
        "additionalProperties": False,
        "required": ["extraction", "sources", "entities"],
        "properties": {
            "extraction": {
                "type": "object", "required": ["title"],
                "properties": {k: {"type": "string"} for k in ("id", "title", "purpose", "summary", "input_summary", "agent", "language")},
                "additionalProperties": False,
            },
            "sources": {"type": "array", "minItems": 1, "items": {
                "type": "object", "required": ["id", "kind"], "additionalProperties": False,
                "properties": {
                    "id": {"type": "string", "minLength": 1},
                    "kind": {"enum": onto["evidence_model"]["source_kinds"]},
                    "reliability": {"enum": list("ABCDEF")},
                    **{k: {"type": "string"} for k in ("title", "uri", "author", "published_at", "retrieved_at", "sha256", "notes")},
                }}},
            "entities": {"type": "array", "minItems": 1, "items": {
                "type": "object", "required": ["type", "properties", "evidence"], "additionalProperties": False,
                "properties": {
                    "ref": {"type": "string", "minLength": 1},
                    "type": {"enum": names + [n.lower() for n in names]},
                    "properties": {"type": "object"},
                    "evidence": {"type": "array", "minItems": 1, "items": ev},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "flag": {"enum": ["red", "orange", "blue", "green", "yellow"]},
                }}},
            "relationships": {"type": "array", "items": {
                "type": "object", "required": ["source", "target", "label", "evidence"], "additionalProperties": False,
                "properties": {
                    "source": {"type": "string"}, "target": {"type": "string"},
                    "label": {"type": "string", "description": "Catalog label, synonym, alias, or inverse spelling (see ontology label_lookup)"},
                    "properties": {"type": "object"},
                    "evidence": {"type": "array", "minItems": 1, "items": ev},
                }}},
            "gaps": {"type": "array", "items": {"type": "string"}},
            "questions": {"type": "array", "items": {"type": "string"}},
            "excluded": {"type": "array", "items": {"type": "object", "required": ["what", "reason"],
                                                    "properties": {"what": {"type": "string"}, "reason": {"type": "string"}}}},
        },
    }


def _strip_volatile(text: str, fname: str) -> str:
    if fname.endswith(".json"):
        d = json.loads(text)
        d.get("generated_from", {}).pop("flowsint_commit", None)
        return json.dumps(d, sort_keys=True)
    return "\n".join(l for l in text.splitlines() if "flowsint commit" not in l.lower())


if __name__ == "__main__":
    main()
