---
name: flowsint-ontology
description: Extract entities (nodes) and their relationships (edges) from any input - open sources (OSINT), documents, conversations, findings, tool output, datasets - and model them with the Flowsint taxonomy and ontology (40 entity types, 81 relationship labels, identity rules, evidence and confidence). Always delivers three documents per extraction - a Flowsint-importable JSON graph, a typed GraphQL mutation document, and a Markdown report. Use when the user asks to collect, map, extract, or structure entities, actors, selectors, infrastructure, or "nodes and edges" from material, to build or extend a Flowsint graph or sketch, to turn findings into a knowledge graph, or to check which Flowsint type or relationship label fits something.
---

# Flowsint ontology: entity and relationship extraction

You turn input material into a graph that Flowsint understands: typed entities, labelled
relationships, and the evidence for each claim. The ontology comes from the Flowsint source
(`~/Tools/flowsint`) plus a curated layer. You never invent types or labels; you pick them
from the catalog.

`<skill>` below means the directory that contains this file.

## Contract (non-negotiable)

1. **Three documents, always.** Every extraction ends with exactly these files, side by side:
   - `<slug>.flowsint.json` - `flowsint-graph` v1 document, importable by Flowsint.
   - `<slug>.graphql` - GraphQL mutation document, valid against `<skill>/ontology/flowsint-ontology.graphql`.
   - `<slug>.md` - analyst report (summary, graph, entities, relationships, evidence, gaps, validation).
   Produce them with `scripts/emit.py`. If you cannot run Python, write them by hand from
   `references/output-contract.md` and say that they are unvalidated.
2. **Only catalogued types and labels.** 40 Flowsint types; relationship labels from the catalog.
   If nothing fits, use the fallback (`Phrase` for text, `IS_RELATED_TO` with a caption) and
   record the gap. Never create ad-hoc labels unless the user asks (`--allow-new-labels`).
3. **No evidence, no claim.** Every node and every relationship cites at least one source
   (`S1`, `S2`, ...) with locator, method, and - when possible - a verbatim quote.
4. **One fact, one edge; one entity, one node.** Merge only on equal canonical identity.
   When two mentions may be the same entity, keep two nodes and link them with
   `POSSIBLY_SAME_AS`. Never merge on a guess.
5. **Protect people.** Do not infer special-category data (ethnicity, religion, health,
   politics, biometrics, criminal records). Record such data and government IDs only when the
   input states them and the purpose needs them. Never record plaintext passwords, CVV,
   session tokens, keys, or seed phrases. Keep a password hash only when the source gives one;
   never hash a plaintext password yourself (weak passwords are reversible): omit it and list it
   in `excluded`. High-entropy tokens and keys may be stored as `sha256:<hex>` or masked.
6. **Stay inside the input.** Extraction is not enrichment. Do not look things up, resolve
   domains, or query services unless the user asks; when you do, the new facts get their own
   source entry with `kind: tool_output` and `method: enriched` or `observed`.

## Workflow

```text
frame -> catalog sources -> extract mentions -> type -> identify -> relate -> evidence
      -> protect -> gaps -> draft -> emit.py (fix until valid) -> deliver 3 files + summary
```

1. **Frame.** State the purpose (what decision or question the graph serves) and the scope.
   Purpose decides what is relevant; irrelevant personal data stays out.
2. **Catalog sources.** One entry per input item: `id` (S1...), `kind`
   (`web | social_media | document | conversation | finding | dataset | public_record | leak |
   tool_output | image_media | other`), title, uri or reference, dates, and Admiralty
   `reliability` A-F (A authoritative registry or direct observation ... E unreliable, F unknown).
   Split one input into several sources when its parts differ in reliability: verbatim tool
   output pasted into a chat is its own `tool_output` source; a speaker whose reliability differs
   from the others gets a separate source (`references/extraction-guide.md` §2).
3. **Extract mentions.** Go segment by segment (paragraph, message, table row, log line).
   Collect every selector and named thing: people, organisations, handles, accounts, e-mails,
   phones, addresses, domains, URLs, IPs, ASNs, hashes, wallets, documents, messages.
   Re-fang defanged indicators (`hxxp`, `[.]`) and de-obfuscate (`[at]`) with `method: derived`.
4. **Type each mention** with the typing guide below. Use `references/extraction-guide.md`
   for edge cases.
5. **Identify.** Fill the identity field(s) of the type (table below). `emit.py` canonicalises
   them (lowercase IDNA domains, compressed IPs, `AS<n>`, E.164 phones, handles without `@`)
   and builds the node id `<key>:<canonical identity>`.
6. **Relate.** For each stated or observed link, choose the label (see "Choosing a label"),
   orient it source -> target, and add qualifiers: `role`, `date`, `start_date`, `end_date`,
   `amount`, `currency`. A sentence with three facts becomes three edges.
7. **Evidence and confidence.** Each claim gets evidence items `{source, locator, quote,
   method, confidence?}`. Methods: `stated`, `observed`, `inferred` (cap 0.7 unless confirmed),
   `enriched`, `derived`. If you omit confidence, `emit.py` derives it from source reliability
   and combines independent sources.
8. **Protect.** Apply contract rule 5. Put anything you saw and chose not to record in
   `excluded` with the reason.
9. **Gaps and questions.** Write what is unconfirmed, contradictory, or missing, and the
   questions that would close it. Contradictions: keep both claims with their evidence.
10. **Draft and emit.** Write the draft (format below) and run:

    ```bash
    python3 <skill>/scripts/emit.py draft.json --out <dir> [--name <slug>]
    ```

    Exit 0 = three valid files written. Exit 1 = blocking errors listed; fix the draft and run
    again. Do not hand-edit the generated files. `--force` writes despite errors (only for
    debugging; never deliver such files as valid).
11. **Deliver.** Give the three paths and a short summary: counts, key findings with
    confidence, main gaps. Write narrative fields (`summary`, gaps, questions) in the user's
    language; types and labels stay in canonical English.

## Draft format (input to emit.py)

```json
{
  "extraction": {"title": "...", "purpose": "...", "agent": "...", "language": "es",
                 "input_summary": "...", "summary": "key findings, 2-6 sentences"},
  "sources": [{"id": "S1", "kind": "document", "title": "...", "uri": "...",
               "published_at": "...", "retrieved_at": "...", "reliability": "B"}],
  "entities": [{"ref": "e1", "type": "Individual",
                "properties": {"full_name": "Jane Doe", "job_title": "CFO"},
                "evidence": [{"source": "S1", "locator": "p.2", "quote": "...", "method": "stated"}]}],
  "relationships": [{"source": "e1", "target": "e2", "label": "WORKS_FOR",
                     "properties": {"role": "CFO", "start_date": "2021-03-01"},
                     "evidence": [{"source": "S1", "locator": "p.2", "method": "stated"}]}],
  "gaps": ["..."], "questions": ["..."],
  "excluded": [{"what": "plaintext password", "reason": "secret"}]
}
```

`ref` is any local name; relationships point at refs. `type` accepts `Domain` or `domain`.
Properties use the exact Flowsint field names (`<skill>/ontology/flowsint-ontology.md` §7).
Fields typed as another entity take an object with that entity's fields; dotted identity paths
in §7 show the nesting:

```json
{"ref": "w1", "type": "Whois", "properties": {"domain": {"domain": "example.org"}, "registrar": "..."}}
{"ref": "a1", "type": "SocialAccount", "properties": {"platform": "github", "username": {"value": "jdoe"}}}
{"ref": "t1", "type": "CryptoWalletTransaction", "properties": {"hash": "0x...", "source": {"address": "0x..."}}}
```
Full contract and a JSON Schema: `references/output-contract.md`,
`references/extraction-draft.schema.json`. Worked example: `examples/`.

## Typing guide

| You see | Type | Identity field(s) |
|---|---|---|
| Named person | `Individual` | `full_name` |
| Company, agency, group, party, NGO | `Organization` | `name` |
| Role in an org needing its own dates/evidence | `Affiliation` (else a `WORKS_FOR`/`MEMBER_OF` edge) | `organization` |
| Handle with no confirmed account (`@jdoe`) | `Username` | `value` |
| Account on a platform (profile URL, platform + handle) | `SocialAccount` (+ `Username`) | `platform` + `username.value` |
| Nickname, nom de guerre, trade name | `Alias` | `alias` |
| E-mail address | `Email` | `email` |
| Phone number (E.164; no guessing of country code) | `Phone` | `number` |
| Postal address or place (`address`, `city`, `country`, `zip` required) | `Location` | `address` |
| Domain or hostname | `Domain` | `domain` |
| URL, web page | `Website` (+ `Domain` via `BELONGS_TO_DOMAIN`) | `url` |
| IPv4/IPv6 / prefix / AS number | `Ip` / `CIDR` / `ASN` | `address` / `network` / `asn_str` |
| Open port on a host | `Port` (always linked from its `Ip`) | `number` |
| DNS record / certificate / WHOIS record | `DNSRecord` / `SSLCertificate` / `Whois` | `record_type`+`value` / `subject` / `domain` |
| Analytics or ad tracker id (UA-, G-, GTM-) | `WebTracker` | `tracker_id` |
| Software, framework, product in use | `Technology` | `name` |
| Script or code snippet | `Script` | `script_id` |
| Login material | `Credential` (hash only) | `username` |
| Session or session token | `Session` (`sha256:<hex>`) | `session_id` |
| Phone, computer, IoT, stealer-log machine | `Device` | `device_id` |
| Malware family or sample name | `Malware` | `name` |
| Catalogued breach / other leak or dump | `Breach` / `Leak` | `name` |
| Report, article, contract, PDF | `Document` | `title` |
| File seen on disk or in transit | `File` | sha256 > sha1 > md5 > filename |
| E-mail, chat, SMS, post with sender/recipients | `Message` | `message_id` |
| Bank account / payment card | `BankAccount` / `CreditCard` | `account_number` / `card_number` |
| Blockchain address / transaction / NFT | `CryptoWallet` / `CryptoWalletTransaction` / `CryptoNFT` | `address` / `hash` / `contract_address`+`token_id` |
| Risk assessment / reputation score of another node | `RiskProfile` / `ReputationScore` | `entity_id` |
| Weapon | `Weapon` | `name` |
| Text worth keeping that fits nothing else | `Phrase` (fallback) | `text` |

Taxonomy (ten domains): `actor`, `persona`, `contact`, `infrastructure`, `web`, `security`,
`content`, `financial`, `assessment`, `physical`. Tree and full field lists:
`ontology/flowsint-ontology.md` §3 and §7.

## Choosing a label

1. Find the source node's type in `ontology/flowsint-ontology.md` §5 (outgoing labels by type).
2. Prefer a **native** label (produced by Flowsint enrichers) whose definition fits; use an
   **extension** label only when no native one fits. Both import unchanged.
3. Read the label as a sentence, source -> target. Inverse wording is accepted and flipped by
   `emit.py` (`EMPLOYS` -> `WORKS_FOR` reversed; `LEADS` -> `HAS_LEADER` reversed).
4. `IS_RELATED_TO` is last resort and requires `properties.caption`.

Frequent cases:

| Fact | Edge |
|---|---|
| Person works for / is employed by org | `Individual -WORKS_FOR-> Organization` (role, dates) |
| Person is director, officer, legal representative | `Organization -HAS_LEADER-> Individual` |
| Member of a group, party, board | `-MEMBER_OF-> Organization` |
| Owns (legal/beneficial) / operates without proven ownership | `-OWNS->` / `-CONTROLS->` |
| Subsidiary, branch, front company | `Organization -SUBSIDIARY_OF-> Organization` |
| Family / business or social associate | `RELATIVE_OF` / `ASSOCIATE_OF` (symmetric) |
| Uses e-mail / phone | `-HAS_EMAIL-> Email` / `-HAS_PHONE-> Phone` |
| Uses a handle / has a platform account | `-HAS_USERNAME-> Username`; `Username -HAS_SOCIAL_ACCOUNT-> SocialAccount` |
| Also known as | `-HAS_ALIAS-> Alias` |
| Maybe the same entity | `POSSIBLY_SAME_AS` (same type, symmetric) |
| Lives at / org registered seat / physically at | `LIVES_AT` / `HAS_ADDRESS` / `LOCATED_AT` (date) |
| Domain resolves to IP / PTR / IP hosts domain | `RESOLVES_TO` / `REVERSE_RESOLVES_TO` / `HOSTS` |
| Subdomain / URL host / org or e-mail domain | `HAS_SUBDOMAIN` / `Website -BELONGS_TO_DOMAIN->` / `HAS_DOMAIN` |
| WHOIS registrant, admin, tech, billing contact | `IS_REGISTRANT_CONTACT` ... `IS_BILLING_CONTACT` (`-> Domain`) |
| IP or prefix in AS / AS announces prefix / prefix contains IP | `BELONGS_TO` / `ANNOUNCES` / `CONTAINS` |
| Site runs technology / embeds tracker / links to | `USES_TECHNOLOGY` / `HAS_TRACKER` / `LINKS_TO` |
| Selector in breach / in leak | `FOUND_IN_BREACH` / `FOUND_IN_LEAK` |
| Selector has credential / found on device | `HAS_CREDENTIAL` / `ASSOCIATED_WITH_DEVICE` |
| Malware C2, drops, infects, used by actor | `COMMUNICATES_WITH`, `DROPS`, `INFECTED`, `USES_MALWARE` |
| Sent / addressed to / replies / attachment | `SENT`, `SENT_TO` (type to/cc/bcc), `REPLY_TO`, `HAS_ATTACHMENT` |
| Wrote / published on / mentions | `AUTHORED`, `PUBLISHED_ON`, `MENTIONS` |
| On-chain transfer / off-chain transfer | `CryptoWallet -TRANSACTION-> CryptoWallet` (hash) / `TRANSFERRED_TO` (amount, currency, date) |
| Account held at bank | `-HELD_AT-> Organization` |

## Files

| Path | Read when |
|---|---|
| `ontology/flowsint-ontology.md` | Choosing types, fields, labels; human reference (generated) |
| `ontology/flowsint-ontology.json` | Machine use: full types, fields, identity, labels with file:line evidence (generated) |
| `ontology/flowsint-ontology.graphql` | GraphQL SDL of the ontology; validates every `.graphql` output (generated) |
| `ontology/curation.json` | Hand-authored semantics: domains, label definitions, sensitivity, evidence model |
| `ontology/contracts/` | Vendored Flowsint contracts: `flowsint-graph-v1.schema.json`, `identity-config-v1.json` |
| `references/extraction-guide.md` | Input-specific guidance: OSINT, documents, conversations, findings; hard cases |
| `references/output-contract.md` | Draft fields, output structures, manual fallback, validation layers |
| `references/extraction-draft.schema.json` | JSON Schema of the draft |
| `examples/` | Worked example: draft plus its three generated documents |
| `scripts/emit.py` | Draft -> three validated documents |
| `scripts/build_ontology.py` | Regenerate the ontology from a Flowsint checkout |
| `scripts/selftest.py` | Deterministic self-test of the whole skill |

## Validation layers in emit.py

1. Ontology rules (stdlib, always): types, fields, required values, enums, identity,
   label catalog, domain/range, evidence, secrets, self-loops, duplicates, nesting depth.
2. Flowsint models (when `~/Tools/flowsint/.venv` or `--flowsint PATH` exists): each node is
   built with the real Pydantic type; labels and canonical identity come from Flowsint code.
3. Contracts (jsonschema + graphql-core, fetched by `uv` if missing): JSON vs the frozen
   `flowsint-graph` v1 schema; GraphQL document vs the ontology SDL; and Flowsint's own
   `parse_graph_document` importer when the checkout exists.

The Markdown report records which layers ran. Without layers 2-3 say so to the user.

## Maintenance

When Flowsint changes (new type, field, enricher, or label):

```bash
python3 <skill>/scripts/build_ontology.py --flowsint ~/Tools/flowsint   # regenerate
python3 <skill>/scripts/build_ontology.py --check                         # CI-style staleness check
python3 <skill>/scripts/selftest.py                                       # full self-test
```

The build fails when an enricher emits a label that `ontology/curation.json` does not define,
or an observed edge falls outside the curated domain/range. Add the definition there, rebuild,
and run the self-test.
