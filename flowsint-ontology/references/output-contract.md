# Output contract

Every extraction produces three documents with one stem: `<slug>.flowsint.json`,
`<slug>.graphql`, `<slug>.md`. `scripts/emit.py` writes all three from one draft. This file
defines the draft, the three outputs, and how to write them by hand when Python is not
available.

## 1. Draft (emit.py input)

JSON Schema: `extraction-draft.schema.json` (same directory). `emit.py` also accepts a
`flowsint-graph` v1 document (for example a Flowsint export) and converts it.

| Field | Required | Content |
|---|---|---|
| `extraction.title` | yes | Short title; the default file stem is its slug. |
| `extraction.purpose` | recommended | Question or decision the graph serves. |
| `extraction.summary` | recommended | Key findings in 2-6 sentences, user's language. |
| `extraction.input_summary` | recommended | What material was read. |
| `extraction.agent`, `.language`, `.id` | no | Agent name, ISO language code, explicit extraction id. |
| `sources[]` | yes, ≥1 | `{id, kind, title?, uri?, author?, published_at?, retrieved_at?, reliability? (A-F), sha256?, notes?}` |
| `entities[]` | yes, ≥1 | `{ref?, type, properties, evidence[], confidence?, flag?}` |
| `relationships[]` | no | `{source, target, label, properties?, evidence[]}`; `source`/`target` are refs or node ids |
| `gaps[]`, `questions[]` | no | Strings. |
| `excluded[]` | no | `{what, reason}`: seen but deliberately not recorded. |

Evidence item: `{source, locator?, quote? (≤300 chars), method, observed_at?, confidence? (0..1)}`
with `method` in `stated | observed | inferred | enriched | derived`.

`flag` (optional) is a Flowsint node flag colour: `red | orange | blue | green | yellow`.

What `emit.py` does to the draft:

1. Resolves types (`Domain` or `domain`), rejects unknown types with suggestions.
2. Normalises identity values (domain, e-mail, IP, CIDR, ASN, URL, handle) and logs each change.
3. Validates properties with the Flowsint Pydantic model (or ontology rules without Flowsint);
   uses Flowsint's normalised values and computed `nodeLabel`.
4. Builds node ids `<key>:<canonical identity>`; hashed form `<key>:h:<16 hex>` for long,
   control-character, secret, financial, or government-id identities.
5. Merges entities with the same id (union of properties, all evidence; conflicts reported).
6. Resolves labels: canonical, synonyms (`EMPLOYED_BY` -> `WORKS_FOR`), aliases
   (`RELATED_TO` -> `IS_RELATED_TO`), inverses with endpoint swap (`EMPLOYS`, `LEADS`, `OWNED_BY`).
7. Checks domain/range, self-loops, `IS_RELATED_TO` caption, `POSSIBLY_SAME_AS` same type,
   symmetric ordering, duplicate edges (merged), evidence presence and source references.
8. Blocks plaintext secrets; inventories sensitive fields for the report.
9. Computes missing confidences from evidence and source reliability.

## 2. `<slug>.flowsint.json` - flowsint-graph v1

Valid against `ontology/contracts/flowsint-graph-v1.schema.json` (frozen Flowsint contract)
and accepted by Flowsint's `parse_graph_document`.

```json
{
  "format": "flowsint-graph",
  "schema_version": 1,
  "nodes": [{
    "id": "domain:acme-widgets.example",
    "type": "domain",
    "label": "acme-widgets.example",
    "properties": {"domain": "acme-widgets.example", "root": true},
    "metadata": {"extraction_id": "...", "ontology_domain": "infrastructure", "confidence": 0.99,
                 "confidence_band": "confirmed", "sources": ["S1", "S4"]},
    "extensions": {"flowsint-ontology.evidence": {"version": 1, "data": {
      "confidence": 0.99, "band": "confirmed",
      "evidence": [{"source": "S4", "locator": "whois query", "method": "observed"}]}}}
  }],
  "relationships": [{
    "source": "domain:acme-widgets.example", "target": "ip:192.0.2.10", "label": "RESOLVES_TO",
    "properties": {"date": "2026-11-04", "confidence_level": 0.9},
    "extensions": {"flowsint-ontology.evidence": {"version": 1, "data": {
      "confidence": 0.9, "band": "confirmed", "status": "native", "evidence": [ ... ]}}}
  }],
  "extensions": {"flowsint-ontology.extraction": {"version": 1, "data": {
    "id": "...", "title": "...", "purpose": "...", "summary": "...", "created_at": "...",
    "ontology_version": "1.0.0", "flowsint_commit": "...", "sources": [ ... ],
    "gaps": [ ... ], "questions": [ ... ], "excluded": [ ... ],
    "validated_by": "flowsint-pydantic", "canonicalized_by": "flowsint"}}}
}
```

Rules: `type` is the lowercase registry key; `properties` holds only Flowsint fields (plus
extras the type accepts); evidence and run metadata live in inert extensions; `display` is
present only when a flag is set and then carries all eight keys. Limits: 500 nodes,
1,000 relationships, 5 MiB, nesting depth 8.

## 3. `<slug>.graphql` - typed mutation document

Valid against `ontology/flowsint-ontology.graphql`. One operation; aliases `s<i>` (sources),
`n<i>` (nodes, each preceded by a `# <node id>` comment), `r<i>` (relationships).

```graphql
mutation Import_acme_example {
  extraction: recordExtraction(input: {id: "...", title: "...", createdAt: "...", ontologyVersion: "1.0.0"}) { id }
  s1: registerSource(input: {id: "S1", kind: WEB, title: "...", reliability: C}) { id }
  # domain:acme-widgets.example
  n1: createDomain(nodeId: "domain:acme-widgets.example", nodeLabel: "acme-widgets.example",
      input: {domain: "acme-widgets.example", root: true},
      evidence: [{source: "S4", method: OBSERVED, locator: "whois query"}], nodeConfidence: 0.99) { nodeId }
  r1: createRelationship(input: {source: "domain:acme-widgets.example", target: "ip:192.0.2.10",
      label: RESOLVES_TO, date: "2026-11-04", confidence_level: 0.9,
      evidence: [{source: "S4", method: OBSERVED, locator: "dig A"}]}) { id }
}
```

Encoding: enum values in UPPER_SNAKE (`STATED`, `PUBLIC_RECORD`, `WORKS_FOR`); typed fields as
literals; untyped Pydantic fields (`Any`) as literals; property bags (`extra`, relationship
`properties`) as a JSON-encoded string; integers that may exceed 32 bits use the `Long` scalar.

## 4. `<slug>.md` - analyst report

Sections, in order (empty ones are omitted): metadata table (id, created, agent, purpose,
ontology version, validation status, files) · Summary · At a glance (counts) · Graph (Mermaid,
≤150 nodes; dashed = confidence < 0.7; 🔒 = sensitive fields) · Entities by taxonomy domain ·
Relationships · Evidence log · Sources · Sensitive data (masked) · Gaps · Open questions ·
Deliberately not recorded · Validation (layers, errors, warnings, normalisations) · Import note.

The report masks financial and government-id values to the last 4 characters and never shows
special-category or secret values; the JSON keeps importable values.

## 5. Manual fallback (no Python)

If `emit.py` cannot run, still deliver the three files:

1. Write the JSON exactly as in §2: compute ids by hand with the identity rules
   (`ontology/flowsint-ontology.md` §7 and §9), one node per id, evidence in extensions,
   `confidence_level` on every relationship.
2. Write the GraphQL as in §3, one `create<Type>` per node and one `createRelationship` per edge,
   using only fields listed in the SDL input type of that entity.
3. Write the Markdown with the §4 sections, including a Validation section that states
   "not machine-validated".
4. Tell the user the files are unvalidated and how to validate them later:
   `python3 <skill>/scripts/emit.py <slug>.flowsint.json --out <dir>` (the JSON is accepted as input).

## 6. Exit status and flags

| Exit | Meaning |
|---|---|
| 0 | Three files written; all layers that ran passed. |
| 1 | Blocking errors. Nothing written (unless `--force`); errors listed on stderr. |
| 2 | Usage error (unreadable draft). |

Flags: `--out DIR`, `--name STEM`, `--flowsint PATH` (default `$FLOWSINT_HOME` or
`~/Tools/flowsint`), `--no-flowsint`, `--no-contracts`, `--allow-new-labels`, `--lenient`
(domain/range violations become warnings), `--force`.
