"""Shared helpers: ontology loading, identity canonicalizers, GraphQL and Markdown rendering.

Standard library only. emit.py and build_ontology.py import this module.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

SKILL = Path(__file__).resolve().parent.parent
ONTOLOGY_DIR = SKILL / "ontology"
ONTOLOGY_JSON = ONTOLOGY_DIR / "flowsint-ontology.json"
ONTOLOGY_GRAPHQL = ONTOLOGY_DIR / "flowsint-ontology.graphql"

GQL_NAME = re.compile(r"^[_A-Za-z][_0-9A-Za-z]*$")
EVIDENCE_EXT = "flowsint-ontology.evidence"
EXTRACTION_EXT = "flowsint-ontology.extraction"

# Typed relationship properties exposed in RelationshipInput; others go to `properties` (JSON).
EDGE_PROP_TYPES = {
    "date": "String", "caption": "String", "type": "String", "weight": "Float",
    "confidence_level": "Float", "role": "String", "start_date": "String", "end_date": "String",
    "share_percent": "Float", "amount": "Float", "currency": "String", "reference": "String",
    "hash": "String", "value": "Long", "timestamp": "String", "block_number": "Long",
    "contract_address": "String",
}


def load_ontology() -> dict:
    return json.loads(ONTOLOGY_JSON.read_text())


# =========================================================================== canonicalizers
# Stdlib mirror of flowsint_core/imports/identity/canonicalizers.py. emit.py prefers the
# Flowsint implementation (exact IDNA2008 and libphonenumber) when a Flowsint venv exists.


class CanonError(ValueError):
    pass


_ETH = re.compile(r"0x[0-9a-fA-F]{40}")
_DEFAULT_PORTS = {"ftp": 21, "http": 80, "https": 443, "ws": 80, "wss": 443}


def _exact(v: Any) -> str:
    if not isinstance(v, str):
        raise CanonError("exact_string")
    return unicodedata.normalize("NFC", v).strip()


def _hash_lower(v: Any) -> str:
    t = _exact(v).lower()
    if not t:
        raise CanonError("hash_lower")
    return t


def _individual_name(v: Any) -> str:
    t = " ".join(_exact(v).split())
    if not t:
        raise CanonError("individual_name")
    return t


def _username(v: Any) -> str:
    t = _exact(v).removeprefix("@")
    if not t:
        raise CanonError("username")
    return t


def _crypto(v: Any) -> str:
    t = _exact(v)
    if not t:
        raise CanonError("crypto_address")
    return t.lower() if _ETH.fullmatch(t) else t


def _eth(v: Any) -> str:
    t = _exact(v)
    if not _ETH.fullmatch(t):
        raise CanonError("ethereum_address")
    return t.lower()


def _exact_int(v: Any) -> str:
    if isinstance(v, bool) or not isinstance(v, int):
        raise CanonError("exact_integer")
    return str(v)


def _asn(v: Any) -> str:
    n = None
    if isinstance(v, int) and not isinstance(v, bool):
        n = v
    elif isinstance(v, str):
        t = v.strip()
        if t[:2].upper() == "AS":
            t = t[2:]
        if t.isascii() and t.isdigit():
            n = int(t)
    if n is None or not 0 <= n <= 2**32 - 1:
        raise CanonError("asn_as_form")
    return f"AS{n}"


def _card(v: Any) -> str:
    if not isinstance(v, str) or any(c.isalnum() and not c.isdigit() for c in v):
        raise CanonError("credit_card_digits")
    d = "".join(c for c in v if c in "0123456789")
    if not d:
        raise CanonError("credit_card_digits")
    return d


def _ip(v: Any) -> str:
    try:
        return ipaddress.ip_address(_exact(v)).compressed
    except ValueError as e:
        raise CanonError("ip_compressed") from e


def _cidr(v: Any) -> str:
    try:
        return ipaddress.ip_network(_exact(v), strict=False).compressed
    except ValueError as e:
        raise CanonError("cidr_network") from e


def _domain(v: Any) -> str:
    t = _exact(v).translate(str.maketrans("\u3002\uff0e\uff61", "...")).removesuffix(".")
    if not t or t.endswith(".") or " " in t:
        raise CanonError("domain_idna")
    try:
        enc = t.lower().encode("idna").decode("ascii")  # IDNA2003 approximation
    except UnicodeError as e:
        raise CanonError("domain_idna") from e
    if "." not in enc and enc != "localhost":
        raise CanonError("domain_idna")
    return enc.lower()


def _email(v: Any) -> str:
    t = _exact(v)
    local, at, dom = t.rpartition("@")
    if not at or not local or " " in local:
        raise CanonError("email_address")
    return f"{local}@{_domain(dom)}"


def _url(v: Any) -> str:
    t = _exact(v)
    p = urlsplit(t)
    if not p.scheme or not p.netloc or " " in t:
        raise CanonError("url_standard")
    userinfo, at, hostport = p.netloc.rpartition("@")
    if hostport.startswith("["):
        raise CanonError("url_standard")
    host = _domain(hostport.partition(":")[0])
    scheme = p.scheme.lower()
    if p.port is not None and p.port != _DEFAULT_PORTS.get(scheme):
        host = f"{host}:{p.port}"
    tail = t[len(p.scheme) + 3 + len(p.netloc):]
    return f"{scheme}://{userinfo}{at}{host}{tail}"


def _phone(v: Any) -> str:
    t = _exact(v)
    if not t.startswith(("+", "00")):
        raise CanonError("phone_e164")
    digits = "".join(c for c in t if c.isdigit())
    if t.startswith("00"):
        digits = digits[2:]
    if not 7 <= len(digits) <= 15:
        raise CanonError("phone_e164")
    return "+" + digits


def _dns_value(v: Any, record_type: str) -> str:
    if record_type in ("A", "AAAA"):
        return _ip(v)
    if record_type in ("CNAME", "NS", "PTR"):
        return _domain(v)
    return _exact(v)


STDLIB_CANONICALIZERS: dict[str, Callable[..., str]] = {
    "asn_as_form": _asn, "cidr_network": _cidr, "credit_card_digits": _card,
    "crypto_address": _crypto, "dns_value": _dns_value, "domain_idna": _domain,
    "email_address": _email, "ethereum_address": _eth, "exact_integer": _exact_int,
    "exact_string": _exact, "hash_lower": _hash_lower, "individual_name": _individual_name,
    "ip_compressed": _ip, "phone_e164": _phone, "url_standard": _url, "username": _username,
}

# Canonicalizers whose rejection means the value is malformed (blocking), not merely unusual.
STRICT_CANONICALIZERS = {"phone_e164", "domain_idna", "url_standard", "email_address", "ip_compressed",
                         "cidr_network", "asn_as_form", "ethereum_address", "exact_integer"}


def _path_get(props: dict, path: str) -> Any:
    cur: Any = props
    parts = path.split(".")
    for i, part in enumerate(parts):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        elif isinstance(cur, str) and i == len(parts) - 1 and i > 0:
            # accepted form: nested entity given as its scalar (username.value / domain.domain)
            return cur
        else:
            return None
    return cur


def canonical_identity(etype: dict, props: dict, canon: dict[str, Callable[..., str]]) -> tuple[list[str], list[str]]:
    """Return (canonical values, warnings) following the type's identity selector."""
    sel = (etype.get("identity") or {}).get("selector") or {}
    fields = sel.get("fields") or [{"path": etype["primary_field"], "canonicalizer": "exact_string"}]
    mode = sel.get("mode", "all")
    values, warnings = [], []
    record_type = None
    for f in fields:
        raw = _path_get(props, f["path"])
        if raw is None:
            if mode == "first_present":
                continue
            raise CanonError(f"identity field {f['path']!r} is missing")
        name = f["canonicalizer"]
        fn = canon[name]
        try:
            val = fn(raw, record_type) if name == "dns_value" else fn(raw)
        except Exception:
            if name in STRICT_CANONICALIZERS:
                raise CanonError(f"{f['path']}: value rejected by {name}")
            val = _exact(raw) if isinstance(raw, str) else str(raw)
            warnings.append(f"{f['path']}: {name} rejected the value; used exact_string")
        if f["path"] == "record_type":
            record_type = val
        values.append(val)
        if mode == "first_present":
            break
    if not values:
        raise CanonError("no identity field present")
    return values, warnings


def make_node_id(key: str, values: list[str], hashed: bool) -> str:
    joined = "|".join(values)
    if hashed or len(joined) > 96 or any((c.isspace() and c != " ") or not c.isprintable() for c in joined):
        return f"{key}:h:{hashlib.sha256(joined.encode()).hexdigest()[:16]}"
    return f"{key}:{joined}"


# =========================================================================== GraphQL helpers


def gql_desc(text: str, indent: str = "") -> str:
    text = (text or "").strip().replace("\\", "\\\\").replace('"""', '\\"""')
    if not text:
        return ""
    if "\n" not in text and len(text) < 100:
        return f'{indent}"""{text}"""\n'
    body = "\n".join(indent + line if line else "" for line in text.splitlines())
    return f'{indent}"""\n{body}\n{indent}"""\n'


def gql_str(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def gql_enum_value(text: str) -> str:
    return re.sub(r"[^0-9A-Za-z_]", "_", text).upper()


def _scalar(dt: dict) -> tuple[str, list[str]]:
    t = dt.get("type", "any")
    directives = []
    if dt.get("format"):
        directives.append(f'@format(name: {gql_str(dt["format"])})')
    return {"string": "String", "integer": "Long", "number": "Float", "boolean": "Boolean", "any": "Any"}.get(t, "JSON"), directives


def gql_field_type(dt: dict, required: bool, as_input: bool) -> tuple[str, list[str]]:
    kind = dt["kind"]
    directives: list[str] = []
    if kind == "entity":
        base = dt["type"] + ("Input" if as_input else "")
    elif kind == "list":
        inner, d = gql_field_type(dt["of"], True, as_input)
        base, directives = f"[{inner}]", d
    elif kind == "enum":
        base = "String"
        vals = ", ".join(gql_str(str(v)) for v in dt["values"])
        directives.append(f"@allowedValues(values: [{vals}])")
    else:
        base, directives = _scalar(dt)
    if required and not dt.get("nullable") and not base.endswith("!"):
        base += "!"
    return base, directives


def gql_literal(value: Any, gtype: str | None = None) -> str:
    """Encode a Python value as a GraphQL input literal.

    JSON-typed positions receive a JSON-encoded String (so keys need not be GraphQL names).
    """
    if gtype is not None and gtype.strip("[]!") == "JSON" and not gtype.lstrip().startswith("["):
        return gql_str(json.dumps(value, ensure_ascii=False, sort_keys=True))
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value) if value == value and value not in (float("inf"), float("-inf")) else "null"
    if isinstance(value, str):
        return gql_str(value)
    if isinstance(value, list):
        inner = gtype.strip()[1:].rstrip("!").rstrip("]") if gtype and gtype.strip().startswith("[") else None
        return "[" + ", ".join(gql_literal(v, inner) for v in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(k, str) and GQL_NAME.match(k) for k in value):
            return gql_str(json.dumps(value, ensure_ascii=False, sort_keys=True))
        return "{" + ", ".join(f"{k}: {gql_literal(v)}" for k, v in value.items()) + "}"
    return gql_str(str(value))


# =========================================================================== ontology -> GraphQL SDL

_COMMON_SDL = '''"""Property bag (extra properties, relationship properties). In literals pass a JSON-encoded String."""
scalar JSON

"""Untyped Pydantic field (typing.Any). In literals pass the value itself: string, number, boolean, list, or object."""
scalar Any

"""Integer that may exceed 32 bits (ASN numbers, byte sizes, block numbers, wei values)."""
scalar Long

"""Marks the Flowsint primary field (json_schema_extra primary=True)."""
directive @primary on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

"""JSON-schema string format reported by Pydantic (email, uri, ipvanynetwork, ...)."""
directive @format(name: String!) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

"""Closed set of values of a Pydantic Literal field."""
directive @allowedValues(values: [String!]!) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

"""Data-protection class of the field. See the evidence and sensitivity policy."""
directive @sensitive(level: SensitivityClass!) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

"""Flowsint registry facts of the entity type."""
directive @flowsint(key: String!, domain: OntologyDomain!, categories: [String!]!, primaryField: String, labelKey: String) on OBJECT

"""Identity selector from identity-config-v1: how two nodes are judged to be the same entity."""
directive @identity(mode: String!, fields: [String!]!, canonicalizers: [String!]!) on OBJECT

"""Ontology facts of a relationship label. domain/range list entity types; "*" means any type."""
directive @relationship(status: RelationshipStatus!, group: String!, domain: [String!]!, range: [String!]!, symmetric: Boolean = false, inverse: String) on ENUM_VALUE

enum RelationshipStatus {
  """Created by Flowsint enrichers (source-verified)."""
  NATIVE
  """Flowsint default label (UI, enricher base, importers)."""
  NATIVE_DEFAULT
  """Skill vocabulary for facts no enricher produces. Flowsint accepts any label string."""
  EXTENSION
}

enum Direction { OUT IN BOTH }

enum EvidenceMethod {
  """The source asserts the fact in words."""
  STATED
  """The fact was seen directly in technical data."""
  OBSERVED
  """The agent concluded the fact from other facts."""
  INFERRED
  """A Flowsint enricher or external tool produced the fact."""
  ENRICHED
  """The fact follows mechanically from another value."""
  DERIVED
}

"""Admiralty / NATO source reliability."""
enum SourceReliability { A B C D E F }

enum ConfidenceBand { CONFIRMED PROBABLE POSSIBLE DOUBTFUL REFUTED }
'''

_TAIL_SDL = '''
"""One relationship (Flowsint GraphEdge). Read source -> target."""
type Relationship {
  id: ID!
  label: RelationshipLabel!
  source: Entity!
  target: Entity!
{edge_fields}  """Other relationship properties."""
  properties: JSON
  evidence: [Evidence!]!
}

"""One piece of support for a node or relationship."""
type Evidence {
  source: Source!
  """Where in the source: URL fragment, page/paragraph, line, timestamp, message id."""
  locator: String
  """Verbatim excerpt, at most 300 characters, secrets redacted."""
  quote: String
  method: EvidenceMethod!
  observedAt: String
  confidence: Float
}

"""An input the agent read: web page, document, conversation, finding, dataset, tool output."""
type Source {
  id: ID!
  kind: SourceKind!
  title: String
  uri: String
  author: String
  publishedAt: String
  retrievedAt: String
  reliability: SourceReliability
  sha256: String
  notes: String
}

"""Something the agent saw and deliberately did not record."""
type Exclusion {
  what: String!
  reason: String!
}

"""Metadata of one extraction run."""
type Extraction {
  id: ID!
  title: String!
  purpose: String
  createdAt: String!
  agent: String
  language: String
  ontologyVersion: String!
  inputSummary: String
  gaps: [String!]
  questions: [String!]
  excluded: [Exclusion!]
}

type Query {
  extraction: Extraction
  sources: [Source!]!
  entity(nodeId: ID!): Entity
  entities(nodeType: EntityType, nodeDomain: OntologyDomain, first: Int = 100): [Entity!]!
  relationships(label: RelationshipLabel, source: ID, target: ID): [Relationship!]!
}

input EvidenceInput {
  source: ID!
  locator: String
  quote: String
  method: EvidenceMethod!
  observedAt: String
  confidence: Float
}

input SourceInput {
  id: ID!
  kind: SourceKind!
  title: String
  uri: String
  author: String
  publishedAt: String
  retrievedAt: String
  reliability: SourceReliability
  sha256: String
  notes: String
}

input ExclusionInput {
  what: String!
  reason: String!
}

input ExtractionInput {
  id: ID!
  title: String!
  purpose: String
  createdAt: String!
  agent: String
  language: String
  ontologyVersion: String!
  inputSummary: String
  gaps: [String!]
  questions: [String!]
  excluded: [ExclusionInput!]
}

input RelationshipInput {
  source: ID!
  target: ID!
  label: RelationshipLabel!
{edge_fields}  """Other relationship properties, JSON-encoded."""
  properties: JSON
  evidence: [EvidenceInput!]!
}
'''


def render_ontology_graphql(onto: dict) -> str:
    out = [
        "# Flowsint ontology - GraphQL SDL",
        f"# ontology version {onto['version']} - flowsint commit {onto['generated_from'].get('flowsint_commit')}",
        "# Generated by scripts/build_ontology.py from the Flowsint source and ontology/curation.json. Do not edit.",
        "# Entity common fields use Flowsint's reserved node* prefix, so they never collide with type properties.",
        "",
        _COMMON_SDL,
    ]
    ents = onto["entity_types"]
    out.append('"""The 40 registered Flowsint entity types (registry class names)."""\nenum EntityType {')
    for name, e in ents.items():
        out.append(gql_desc(e["description"], "  ") + f"  {name}")
    out.append("}\n")
    out.append('"""Skill taxonomy: super-classes that group the Flowsint types."""\nenum OntologyDomain {')
    for d in onto["domains"]:
        out.append(gql_desc(f"{d['label']}. {d['definition']}", "  ") + f"  {gql_enum_value(d['id'])}")
    out.append("}\n")
    out.append("enum SourceKind {")
    out.extend(f"  {gql_enum_value(k)}" for k in onto["evidence_model"]["source_kinds"])
    out.append("}\n")
    out.append("enum SensitivityClass {")
    for k, v in onto["sensitivity_classes"].items():
        out.append(gql_desc(v["rule"], "  ") + f"  {gql_enum_value(k)}")
    out.append("}\n")
    out.append('"""Relationship vocabulary. Read source -> target."""\nenum RelationshipLabel {')
    for r in onto["relationships"]:
        args = [
            f"status: {gql_enum_value(r['status'])}",
            f"group: {gql_str(r['group'])}",
            "domain: [" + ", ".join(gql_str(t) for t in r["domain"]) + "]",
            "range: [" + ", ".join(gql_str(t) for t in r["range"]) + "]",
        ]
        if r["symmetric"]:
            args.append("symmetric: true")
        if r["inverse"]:
            args.append(f"inverse: {gql_str(r['inverse'])}")
        desc = r["definition"] + (f"\n\n{r['notes']}" if r["notes"] else "")
        out.append(gql_desc(desc, "  ") + f"  {r['label']} @relationship({', '.join(args)})")
    out.append("}\n")
    common = [
        "  nodeId: ID!",
        "  nodeType: EntityType!",
        "  nodeLabel: String!",
        "  nodeDomain: OntologyDomain!",
        "  nodeConfidence: Float",
        "  nodeEvidence: [Evidence!]!",
        "  nodeRelationships(direction: Direction = BOTH, label: RelationshipLabel): [Relationship!]!",
    ]
    out.append('"""Any Flowsint node. Type properties follow on each implementing type."""\ninterface Entity {')
    out.extend(common)
    out.append("}\n")

    def field_lines(e: dict, as_input: bool) -> list[str]:
        lines = []
        for f in e["fields"]:
            if not GQL_NAME.match(f["name"]) or f["name"].startswith("__"):
                continue
            gtype, dirs = gql_field_type(f["datatype"], f["required"], as_input)
            if f["primary"]:
                dirs.insert(0, "@primary")
            if f.get("sensitivity"):
                dirs.append(f"@sensitive(level: {gql_enum_value(f['sensitivity'])})")
            lines.append(gql_desc(f["description"], "  ") + f"  {f['name']}: {gtype}" + "".join(" " + d for d in dirs))
        return lines

    for name, e in ents.items():
        sel = e["identity"].get("selector") or {}
        idf = [f["path"] for f in sel.get("fields", [])]
        idc = [f["canonicalizer"] for f in sel.get("fields", [])]
        flowsint_args = [
            f"key: {gql_str(e['key'])}",
            f"domain: {gql_enum_value(e['domain'])}",
            "categories: [" + ", ".join(gql_str(c) for c in e["categories"]) + "]",
        ]
        if e["primary_field"]:
            flowsint_args.append(f"primaryField: {gql_str(e['primary_field'])}")
        if e["label_key"]:
            flowsint_args.append(f"labelKey: {gql_str(e['label_key'])}")
        ident = (
            f" @identity(mode: {gql_str(sel.get('mode', 'all'))}, fields: [{', '.join(gql_str(x) for x in idf)}],"
            f" canonicalizers: [{', '.join(gql_str(x) for x in idc)}])"
            if idf else ""
        )
        out.append(gql_desc(e["description"]) + f"type {name} implements Entity @flowsint({', '.join(flowsint_args)}){ident} {{")
        out.extend(common)
        out.extend(field_lines(e, False))
        out.append("}\n")
    edge_fields = "".join(f"  {k}: {v}\n" for k, v in EDGE_PROP_TYPES.items())
    out.append(_TAIL_SDL.replace("{edge_fields}", edge_fields))
    for name, e in ents.items():
        out.append(f'"""Properties of a {name} node, as Flowsint validates them."""\ninput {name}Input {{')
        out.extend(field_lines(e, True))
        out.append('  """Additional properties (Flowsint types accept extra keys), JSON-encoded."""\n  extra: JSON')
        out.append("}\n")
    out.append("type Mutation {")
    out.append('  """Record the extraction run metadata. Call once, first."""\n  recordExtraction(input: ExtractionInput!): Extraction!')
    out.append('  """Register one source of the source catalog."""\n  registerSource(input: SourceInput!): Source!')
    for name in ents:
        out.append(
            f"  create{name}(nodeId: ID!, nodeLabel: String!, input: {name}Input!, evidence: [EvidenceInput!]!, nodeConfidence: Float): {name}!"
        )
    out.append('  """Create one relationship between two nodes created in the same document."""\n  createRelationship(input: RelationshipInput!): Relationship!')
    out.append("}\n")
    return "\n".join(out).rstrip() + "\n"


# =========================================================================== ontology -> Markdown


def md_cell(text: Any) -> str:
    return str(text if text is not None else "").replace("|", "\\|").replace("\n", " ").strip()


def _dt_str(dt: dict) -> str:
    k = dt["kind"]
    if k == "entity":
        return dt["type"]
    if k == "list":
        return f"[{_dt_str(dt['of'])}]"
    if k == "enum":
        return "enum(" + ", ".join(map(str, dt["values"])) + ")"
    return dt.get("type", "any") + (f"({dt['format']})" if dt.get("format") else "")


def render_ontology_md(onto: dict) -> str:
    g = onto["generated_from"]
    ents = onto["entity_types"]
    rels = onto["relationships"]
    L: list[str] = []
    a = L.append
    a("# Flowsint ontology: taxonomy and relationships\n")
    a(f"Ontology version **{onto['version']}**. Generated from Flowsint commit `{g.get('flowsint_commit')}` by "
      "`scripts/build_ontology.py`. Do not edit: change `ontology/curation.json` or the Flowsint source, then rebuild.\n")
    c = g["counts"]
    a(f"- Entity types: **{c['entity_types']}** (all registered Flowsint types)")
    a(f"- Relationship labels: **{c['relationship_labels']}** "
      f"({sum(r['status'] != 'extension' for r in rels)} native, {sum(r['status'] == 'extension' for r in rels)} extension)")
    a(f"- Enrichers scanned: **{c['enrichers']}**; relationship calls: **{c['create_relationship_calls']}** "
      f"(typed by name hint: {c['calls_typed_by_name_hint']}, unresolved: {c['calls_unresolved']})\n")
    a("Machine-readable twins: `flowsint-ontology.json` (complete data) and `flowsint-ontology.graphql` (SDL).\n")

    a("## 1. Sources of truth\n")
    a("| Fact | Source |\n|---|---|")
    for k, v in g["sources"].items():
        a(f"| {k} | `{v}` |")
    a("")

    a("## 2. Conventions\n")
    for k, v in onto["conventions"].items():
        a(f"- **{k}**: {v}")
    a(f"\nReserved property names (never use as fields): {', '.join('`' + p + '`' for p in onto['reserved_properties'])}.\n")

    a("## 3. Taxonomy\n")
    a("Ten skill-level domains group the 40 Flowsint types. Flowsint's own UI categories follow the tree.\n")
    a("```text\nEntity")
    for i, d in enumerate(onto["domains"]):
        last_d = i == len(onto["domains"]) - 1
        a(f"{'└──' if last_d else '├──'} {d['id']} — {d['label']}")
        for j, t in enumerate(d["types"]):
            e = ents[t]
            pre = "    " if last_d else "│   "
            branch = "└──" if j == len(d["types"]) - 1 else "├──"
            sel = e["identity"].get("selector") or {}
            sep = " > " if sel.get("mode") == "first_present" else " + "
            idf = sep.join(f["path"] for f in sel.get("fields", []))
            if sel.get("mode") == "first_present":
                idf = "first present of " + idf
            a(f"{pre}{branch} {t:<24} identity: {idf}")
    a("```\n")
    a("| Domain | Definition |\n|---|---|")
    for d in onto["domains"]:
        a(f"| `{d['id']}` | {md_cell(d['definition'])} |")
    a("\n**Flowsint UI categories** (`TypeRegistryService._get_category_definitions`):\n")
    a("| Category | Types |\n|---|---|")
    for cat in onto["categories"]:
        a(f"| {md_cell(cat['label'])} | {', '.join(cat['types'])} |")
    a("")

    a("## 4. Relationship catalog\n")
    a("Read every label **source → target**. `native` labels are produced by Flowsint enrichers "
      "(file:line evidence in the JSON). `extension` labels are this skill's vocabulary for facts no enricher "
      "produces; Flowsint stores any label string, so they import unchanged. Domain/range `*` means any type.\n")
    groups: dict[str, list[dict]] = {gname: [] for gname in onto.get("relationship_groups", [])}
    for r in rels:
        groups.setdefault(r["group"], []).append(r)
    for grp, items in groups.items():
        a(f"### {grp}\n")
        a("| Label | Status | Source types → Target types | Definition | Inverse reading |\n|---|---|---|---|---|")
        for r in items:
            sym = " (symmetric)" if r["symmetric"] else ""
            note = f" *{md_cell(r['notes'])}*" if r["notes"] else ""
            props = f" Props: {', '.join(r['properties'])}." if r["properties"] else ""
            a(f"| `{r['label']}` | {r['status']}{sym} | {', '.join(r['domain'])} → {', '.join(r['range'])} | "
              f"{md_cell(r['definition'])}{props}{note} | {r['inverse'] or ''} |")
        a("")
    a("### Accepted spellings\n")
    a("emit.py rewrites these spellings to the canonical label; `inverse` spellings also swap source and target.\n")
    a("| Spelling | Canonical | Kind |\n|---|---|---|")
    for k, v in onto["label_lookup"].items():
        if v["kind"] != "canonical":
            a(f"| `{k}` | `{v['label']}`{' (swap endpoints)' if v['flip'] else ''} | {v['kind']} |")
    a("")

    a("## 5. Outgoing relationships by source type\n")
    a("Use this index to pick a label once the source node type is known.\n")
    a("| Source type | Labels (→ target types) |\n|---|---|")
    any_labels = [r for r in rels if "*" in r["domain"]]
    for t in ents:
        cells = [f"`{r['label']}`→{'/'.join(r['range'])}" for r in rels if t in r["domain"]]
        a(f"| {t} | {'; '.join(cells) or '—'} |")
    any_cells = "; ".join("`" + r["label"] + "`→" + "/".join(r["range"]) for r in any_labels)
    a(f"| *any type* | {any_cells} |")
    a("")

    a("## 6. Native relationship map (observed in Flowsint)\n")
    a("```mermaid\nflowchart LR")
    seen = set()
    for r in rels:
        for p in r["observed_pairs"]:
            if p["anomalous"] or "?" in (p["source"], p["target"]):
                continue
            key = (p["source"], r["label"], p["target"])
            if key in seen:
                continue
            seen.add(key)
            a(f"  {p['source']} -->|{r['label']}| {p['target']}")
    a("```\n")

    anomalies = [(r["label"], p, e) for r in rels for p in r["observed_pairs"] for e in p["evidence"] if "anomaly" in e]
    if anomalies:
        a("### Upstream anomalies\n")
        a("Observed in Flowsint but not to be reproduced:\n")
        for lab, p, e in anomalies:
            raw = f" (raw label `{e['raw_label']}`)" if "raw_label" in e else ""
            a(f"- `{p['source']} -{lab}-> {p['target']}`{raw} at `{e['at']}`: {e['anomaly']}")
        a("")

    a("## 7. Entity catalog\n")
    a("Per type: description, identity rule, label rule, and every field. `!` = required by the Pydantic model; "
      "`★` = Flowsint primary field; sensitivity classes are defined in section 8.\n")
    for name, e in ents.items():
        sel = e["identity"].get("selector") or {}
        ident = ", ".join(f"`{f['path']}` ({f['canonicalizer']})" for f in sel.get("fields", []))
        a(f"### {name}\n")
        a(f"{md_cell(e['description'])}\n")
        a(f"- Key `{e['key']}` · domain `{e['domain']}` · UI categories: {', '.join(e['categories'])}")
        notes = f" — {md_cell(e['identity']['notes'])}" if e["identity"].get("notes") else ""
        a(f"- Identity ({sel.get('mode', 'all')}): {ident}{notes}")
        a(f"- Label key: `{e['label_key']}` · auto-detect from text: {'yes' if e['auto_detect'] else 'no'}")
        h = e.get("extraction_hints") or {}
        for k in ("recognize", "identity_tip", "avoid"):
            if h.get(k):
                a(f"- {k.replace('_', ' ').capitalize()}: {md_cell(h[k])}")
        a("")
        a("| Field | Type | Description |\n|---|---|---|")
        for f in e["fields"]:
            flags = ("★" if f["primary"] else "") + ("!" if f["required"] else "")
            sens = f" **[{f['sensitivity']}]**" if f.get("sensitivity") else ""
            a(f"| `{f['name']}`{flags} | {md_cell(_dt_str(f['datatype']))} | {md_cell(f['description'])}{sens} |")
        a("")

    a("## 8. Evidence, confidence, and sensitivity\n")
    em = onto["evidence_model"]
    a(f"{em['where']}\n")
    a("| Evidence field | Meaning |\n|---|---|")
    for k, v in em["evidence_item"].items():
        a(f"| `{k}` | {md_cell(v)} |")
    a("\n| Method | Use when |\n|---|---|")
    for k, v in em["methods"].items():
        a(f"| `{k}` | {md_cell(v)} |")
    a("\n| Source reliability | Meaning |\n|---|---|")
    for k, v in em["source_reliability"].items():
        if k != "scale":
            a(f"| {k} | {md_cell(v)} |")
    a("\n| Confidence band | Range | Meaning |\n|---|---|---|")
    for k, (lo, hi, desc) in em["confidence_scale"].items():
        a(f"| {k} | {lo}–{hi} | {md_cell(desc)} |")
    a(f"\n{em['combining']}\n")
    a(f"Source kinds: {', '.join('`' + k + '`' for k in em['source_kinds'])}.\n")
    a("| Sensitivity class | Basis | Rule |\n|---|---|---|")
    for k, v in onto["sensitivity_classes"].items():
        a(f"| `{k}` | {md_cell(v['basis'])} | {md_cell(v['rule'])} |")
    a("")

    a("## 9. Identity canonicalizers\n")
    a("| Canonicalizer | Algorithm |\n|---|---|")
    for k, v in onto["canonicalizers"].items():
        a(f"| `{k}` | {md_cell(v['algorithm'])} |")
    a("")
    a("## 10. Enrichers (Flowsint pivots)\n")
    a("| Enricher | Input → Output | File |\n|---|---|---|")
    for e in onto["enrichers"]:
        out_t = e["output"] if e["output"] in ents else "—"
        a(f"| `{e.get('name', e['class'])}` | {e['input'] or '—'} → {out_t} | `{e['file']}` |")
    a("")
    return "\n".join(L).rstrip() + "\n"
