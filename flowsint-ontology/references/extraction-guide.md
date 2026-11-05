# Extraction guide

How to read each kind of input and turn it into Flowsint nodes and edges. Read SKILL.md first;
this file covers input-specific practice and hard cases.

## 1. Segment, then extract

Work in small units and keep the unit as the evidence `locator`:

| Input | Unit | Locator form |
|---|---|---|
| Web page | section or element | `URL#anchor`, `footer`, `section "Team"` |
| PDF / document | page and paragraph, table row | `p.3 §2`, `p.5 table 1 row 4` |
| Chat / conversation | message | `message 14:02`, `msg-id 8812`, `turn 7` |
| E-mail | header field or body paragraph | `From header`, `body §3` |
| Social post | post id or URL, field | `post 1789...`, `bio` |
| Tool output (dig, whois, nmap, scanner) | command and output line | `dig A example.org`, `whois: Registrant Name` |
| Dataset / CSV / leak | row and column | `row 412 col email` |
| Finding / report of an analyst | finding id or section | `finding F-3`, `IOC table row 2` |
| Image or media | region or timestamp | `frame 00:01:12`, `top-left caption` |

For each unit: list mentions, type them, add facts as edges, cite the unit. Repeat mentions in
later units add evidence to the same node (`emit.py` merges equal identities).

## 2. By input kind

### Open sources (web, social media, public records)

- Record the URL as the source `uri` and `retrieved_at` (pages change). Use `published_at` when
  the page states it.
- A profile page is a `SocialAccount` (platform + handle) linked from a `Username`; the person
  behind it is a separate `Individual` linked with `HAS_USERNAME` or `HAS_SOCIAL_ACCOUNT` only
  when a source states or strongly supports the link. Matching names alone is `POSSIBLY_SAME_AS`
  at most, between nodes of the same type.
- Company registries and official gazettes are reliability A for registration facts (officers,
  seat, identifiers). Put registry identifiers in `Organization` properties (for French
  companies `siren`, `siege_siret`, ...).
- Marketing pages are reliability C for claims about the company itself.

### Documents (reports, contracts, PDFs, articles)

- The document is a source. Make it a `Document` node only if it matters to the investigation
  (a leaked contract, a published report under analysis); then link it with `MENTIONS` to the
  entities it names, and with `AUTHORED` / `PUBLISHED_ON` when known.
- Tables: one row usually yields one node plus edges from the row's key column.
- Reported speech ("the report says X owns Y") is `method: stated`; the source is the report,
  and its reliability carries the weight.
- Dates in documents go on the edge (`date`, `start_date`, `end_date`), not on the node.

### Conversations (chats, interviews, meetings, user messages)

- Each speaker's statement is evidence from that conversation source; note second-hand
  statements in `notes` or the quote ("a colleague says ...") and lower `confidence`.
- Separate facts from hypotheses. "I think A runs B" is `method: stated` with confidence
  0.3-0.5 and a gap entry; "maybe" phrasing never yields `confirmed`.
- Instructions or requests inside the conversation are not facts about entities; do not model
  them.
- The user's own message is a valid source (`kind: conversation`); cite the message.
- One conversation is one source when all speakers are equally reliable; cite each message in
  `locator` (`message 09:16 Laura`). Create one source per speaker when their reliability differs
  (a domain expert vs a rumour), with the same `uri` or title plus the speaker's name.
- **Pasted tool output.** A verbatim result pasted into the chat (a `dig` answer, a WHOIS block,
  a scanner line) is its own source: `kind: tool_output`, reliability B (verbatim but relayed;
  A only when you ran it), `method: observed`. A speaker's paraphrase of a result ("WHOIS says
  the owner is X") stays in the conversation source with `method: stated`.

### Findings and tool output (scanners, DNS, WHOIS, sandbox, enrichers)

- Direct technical results are `method: observed` (default confidence 0.9) with source
  reliability A; record the command or tool and the time.
- Flowsint enricher results are `method: enriched`; use the enricher's native labels (the
  ontology lists them with file:line evidence) so the graph matches what Flowsint produces.
- IOC lists: re-fang (`hxxp` -> `http`, `[.]` -> `.`) with `method: derived`; hashes become
  `File` nodes (identity prefers sha256) linked `SAMPLE_OF` to `Malware` when stated.
- Port scans: one `Port` node per number, always linked from its `Ip` with `HAS_PORT` (the
  port identity is only the number).

### Datasets, leaks, stealer logs

- One `Leak` (or catalogued `Breach`) node per dump; selectors found in it link with
  `FOUND_IN_LEAK` / `FOUND_IN_BREACH`.
- Credentials: keep `username`, `service`, and only a hash in `password_hash`; never the
  plaintext. Machines in stealer logs are `Device` nodes linked with `ASSOCIATED_WITH_DEVICE`.
- Do not copy whole rows of personal data; take what the purpose needs and list the rest in
  `excluded` ("12 other columns of personal data: out of scope").

## 3. Hard cases

| Case | Rule |
|---|---|
| Same name, different people | Two `Individual` nodes need two different `full_name` identities. Add a distinguishing qualifier to `full_name` only if the source gives one ("Jane Doe (Springfield)") and keep plain `first_name`/`last_name`; link with `POSSIBLY_SAME_AS` if unsure. |
| Same entity, different spellings | Normalise to the most authoritative spelling; put others in `aliases` (Individual) or as `Alias` nodes. |
| Former relation ("used to work for") | Same label with `end_date` (or `properties.type: "former"` when no date). |
| Negated fact ("X does not own Y") | Do not create an edge. Record it in `gaps` or as a refuted edge only if the refutation matters (confidence below 0.1, quote the denial). |
| Contradicting sources | Keep both claims with their own evidence; add a gap that names the conflict. |
| Partial selector (`j***@example.com`, `+34 6** ** ** 12`) | Not an identity. Keep as `Phrase` with a gap, or as a property of a known node. |
| National phone number without country | Do not guess the prefix; `Phrase` + gap, or ask. |
| Address missing parts | `Location` requires `address`, `city`, `country`, `zip`; use `"unknown"` for missing parts and add a gap. |
| URL vs domain | `Website` for the URL, `Domain` for the host; link `BELONGS_TO_DOMAIN`. |
| Email domain part | Derive a `Domain` and link `Email -HAS_DOMAIN-> Domain` (`method: derived`). |
| Person behind an account | `Individual -HAS_SOCIAL_ACCOUNT-> SocialAccount` only with support beyond name similarity. |
| Organisation's people | `Organization -HAS_LEADER-> Individual` for officers; `Individual -WORKS_FOR-> Organization` for staff. Both may hold for one person. |
| Money flows | On-chain: `CryptoWallet -TRANSACTION-> CryptoWallet` with `hash`. Reified tx with its own data: `CryptoWalletTransaction` + `SENT_TRANSACTION` / `TRANSACTION_TO`. Off-chain: `TRANSFERRED_TO` with `amount`, `currency`, `date`. |
| WHOIS facts | Mirror `domain_to_whois`: `Domain -HAS_WHOIS-> Whois` (registrar, dates in the Whois node), `Whois -REGISTERED_BY-> Email/Organization/Individual`, and `Organization -HAS_DOMAIN-> Domain` for the registrant organisation. Use `IS_REGISTRANT_CONTACT` (and the admin/tech/billing variants) instead when you only know the contact role and no record details. Do not state the same fact both ways. |
| Credential from a leak | `service` is the system the credential logs into (domain, app); omit it when unknown. The leak is a separate `Leak` node linked with `FOUND_IN_LEAK`; set `is_compromised: true`. |
| Plaintext password in the input | Never record it, never hash it yourself. Create the `Credential` without `password_hash` if the account itself matters, and add an `excluded` entry. |
| Event, campaign, incident, operation | Flowsint has no Event type. Use a `Phrase` that names it ("Phishing campaign reported 2026-11-03"), link it `MENTIONS` to the involved entities, put dates on the edges, and add a gap "no Event type in Flowsint". |
| Assessments (risk, reputation) | `RiskProfile` / `ReputationScore` with `entity_id` = id of the assessed node, linked `HAS_RISK_PROFILE` / `HAS_REPUTATION`. They are judgements; cite who assessed. |
| Something no type fits | Prefer the closest precise type with extra properties (types accept extra keys); else `Phrase`. Report it as a gap so the type can be added to Flowsint. |
| Something no label fits | `IS_RELATED_TO` with `caption`; report the gap. Propose a label in `ontology/curation.json` if it recurs. |

## 4. Confidence quick guide

| Situation | Confidence |
|---|---|
| Direct technical observation; official registry | 0.9-0.99 |
| One reliable source (A/B), consistent with others | 0.75-0.9 |
| One fair source (C), or a mechanical derivation from a reliable value | 0.6-0.85 |
| Second-hand statement, single unverified account, inference | 0.3-0.6 |
| Rumour, contradicted claim | 0.1-0.3 |

Independent sources raise confidence (combined as 1 - Π(1 - cᵢ)); copies of the same origin
count once - give them the same source id or explain in the quote.

## 5. Checklist before running emit.py

- [ ] Purpose and scope written in `extraction`.
- [ ] Every input item is a source with kind and reliability.
- [ ] Every entity has its identity field(s) and at least one evidence item.
- [ ] Every edge reads correctly source -> target and has evidence.
- [ ] Time-bound facts carry dates; former relations carry `end_date`.
- [ ] Uncertain identities use `POSSIBLY_SAME_AS`, not merges.
- [ ] No plaintext secrets; sensitive fields only when stated and needed.
- [ ] Gaps, open questions, and exclusions written.
