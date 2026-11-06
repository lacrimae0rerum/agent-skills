# ExtensiveResearch

**Contents:** Ideal State · Anti-criteria · Inputs · Tool contract · Output format

A verified, confidence-tagged research report from 7 explorers and 2 blind verifiers across all five vendors, plus community voices when lived experience matters.

## Ideal State

- The report draws on all five vendors (Claude, Gemini, OpenAI/Codex, Grok, Perplexity), each contributing at least one of the 7 explorers + 2 verifiers; a roster missing OpenAI or Grok is incomplete unless the response names why (the vendor's key or tool is not set up, or Grok was swapped out because the question carried private or restricted data).
- The verifiers worked blind to the explorers: their prompts are topic-level, and they had no access to explorer reasoning, only the topic and their own research (in a sequential run, the verifier passes ran before any explorer pass).
- Seven unique explorer angles, each a diverse research direction, and the two verification angles existed before any agent launched.
- When the request carries a sentiment or lived-experience signal, the report also quotes real people's experiences from Reddit and X with URLs, alongside the nine researchers' findings.
- Every explorer finding is cross-referenced against the verifier results, its confidence set by the synthesis rules in the Tool contract, and every conflict between explorers or with verifiers shows both sides.
- Every delivered URL passed the verifier in `../UrlVerificationProtocol.md` (the page body checked against the key phrase its citation depends on, not only by status), and a URL that does not support its claim was dropped.
- The report arrives within the 120-second hard timeout (per pass in a sequential run) with non-responsive researchers named, and both the saved report and the returned answer carry what Output format names, research metrics included.

## Anti-criteria

- Community slots never replace the vendor roster; both verifiers stay when they run.
- Grok's brief never carries anything but public material; when the question carries private or restricted data (personal, customer, financial or private-file content) its slot becomes a Claude slot and the response says so.
- No finding is promoted to `[HIGH]` when the verifiers timed out.
- No URL is delivered when its page does not support the claim it is cited for.

## Inputs

- User says "extensive research" or "do extensive research"
- Deep-dive analysis needed
- Comprehensive multi-domain coverage required

## Tool contract

**Mode:** 7 explorers + 2 verifiers across all five vendors (Claude, Gemini, OpenAI/Codex, Grok, Perplexity) | + community slot on lived-experience questions | **Timeout:** 120 seconds

The explorer-verifier split follows Nomad (arXiv:2603.29353): **7 explorers** for breadth, **2 verifiers** for trustworthiness.

```
All 9 researchers launch at once: subagents in one message when your agent can run them,
otherwise sequential passes in this session, the 2 verifiers first (SKILL.md § Vendor roster).
Verifier prompts are topic-level (not claim-level) so they work without explorer results.
Synthesis cross-references explorer findings against verifier findings with confidence tags.
```

Researchers pre-filter their URLs before returning (the common brief ending in SKILL.md § Vendor roster). That pre-filter verifies nothing: every URL that reaches the synthesis goes through `../UrlVerificationProtocol.md` (`Tools/VerifyUrls.ts`) before delivery.

**Source routing check** (`../SourceRoutingProtocol.md`): scan the user's request for sentiment or lived-experience signals: "fans thought", "ratings of", "best | worst | favorite", "reactions to", "consensus on", event + recent date, or any question whose answer depends on what people who tried it experienced (patients, users, owners, customers choosing between providers or products).

- **Signal fires → add community slots (never replace the vendor roster).** Walk the API-first cascade in `../SourceRoutingProtocol.md`:
  - **Slot A (Reddit, Tier-1 API):** a general-purpose subagent (or pass) calls the Reddit JSON API with `curl -A "agent-skills-research/1.0"` against 2-4 relevant subreddits (`search.json?q=…&restrict_sr=1&sort=top&t=all` for evergreen questions, `top.json?t=week` for events). If the API rate-limits or returns 403, report it. Returns verbatim quotes with thread URLs and scores. Persist raw JSON to the run's research folder (`$AGENT_SKILLS_HOME/research/history/YYYY-MM/YYYY-MM-DD_<slug>/`, SKILL.md § Output format).
  - **Slot B (X / Twitter):** use the `x-twitter` skill, or another installed X reader/search skill, if one exists; otherwise X API v2 recent-search with `X_BEARER_TOKEN` in an `Authorization` header. Slots A and B may share one subagent.
  - **Slot C (YouTube, optional):** Data API v3 if `YOUTUBE_API_KEY` is set; otherwise `fabric -y` on the top 3 videos, with comments reported as a gap.
- **No signal → the nine-researcher roster below, unchanged.**

Verification angles: "verify the most important claims about [topic]" and "find contradictory evidence about [topic]". When the source routing signal fired, the community slot(s) launch together with the nine researchers below.

**One launch with all nine researchers.** Each line is one researcher: its slot (the vendor command from SKILL.md § Vendor roster), a short label, and its brief. Every brief ends with the common ending in SKILL.md § Vendor roster. A slot whose vendor is not set up becomes a Claude slot with the same brief, and the response names the swap.

```text
=== EXPLORERS (7 researchers, five vendors) ===

Claude - 2 threads (academic depth, strategic analysis)
1. [Claude]  "[topic] angle 1": Search for: [angle 1]. Tag each finding with confidence: [HIGH], [MED], or [LOW]. Return findings.
2. [Claude]  "[topic] angle 2": Search for: [angle 2]. Tag each finding with confidence: [HIGH], [MED], or [LOW]. Return findings.

Gemini - 2 threads (multi-perspective, cross-domain)
3. [Gemini]  "[topic] angle 3": Search for: [angle 3]. Tag each finding with confidence: [HIGH], [MED], or [LOW]. Return findings.
4. [Gemini]  "[topic] angle 4": Search for: [angle 4]. Tag each finding with confidence: [HIGH], [MED], or [LOW]. Return findings.

OpenAI - 1 thread (primary sources: studies, official data, docs)
5. [Codex]   "[topic] angle 5": Search for: [angle 5 — primary-source angle]. Tag each finding [HIGH]/[MED]/[LOW] with a verified URL. Return findings.

Grok - 1 thread (what's being said on X). PUBLIC material only in the brief;
if the question carries private or restricted data, make this a Claude slot and say so in the response.
6. [Grok]    "[topic] angle 6": Research this PUBLIC question: [angle 6 — current discourse and practitioner chatter on X]. Cross-check with web search and page fetches, verify every URL, tag each finding [HIGH]/[MED]/[LOW]. Return findings.

Contrarian - 1 thread (counter-consensus, fact-based)
7. [Claude]  "[topic] angle 7": Search for: [angle 7 — contrarian/counter-consensus framing]. Prefer durable facts over trending narrative. Tag each finding with confidence: [HIGH], [MED], or [LOW]. Return findings.

=== VERIFIERS (2 researchers) ===
These independently check the most important claims about the topic.
They have no access to explorer reasoning — only the topic and their own research.

8. [Perplexity] "verify [topic] claims": Independently verify the most commonly cited facts, statistics, and claims about [topic]. For each claim you find, check if it's supported by primary sources. Tag each as [HIGH] (confirmed), [MED] (plausible), or [LOW] (unconfirmed). Focus on quantitative claims and dates — these are most likely to be wrong.
9. [Claude]  "find contradictions about [topic]": Search for contradictory evidence, debunked claims, and common misconceptions about [topic]. What do people get wrong? What's the contrarian view with evidence? Tag each finding with confidence: [HIGH], [MED], or [LOW].
```

Each researcher gets one focused angle and returns as soon as it has findings. **Hard timeout: 120 seconds** (per pass in a sequential run), then proceed with whatever has returned.

**Synthesis rules:**

- **Upgrade/downgrade confidence** (tags as defined in `Verify.md` § Output format): Explorer claim `[MED]` + verifier confirmed → `[HIGH]`. Explorer claim `[HIGH]` + verifier contradicted → `[CONFLICT]`
- **URL check:** every remaining URL goes through the verifier in `../UrlVerificationProtocol.md`; an UNSUPPORTED result is unverified until the page itself has been read, and a URL that does not support its claim is dropped.

Results take ~60-90 seconds; the verifiers run in parallel with the explorers.

When researchers or checks fail:

- If verifier researchers time out → follow the timeout rule in `Verify.md` § Graceful Degradation, and report the findings as not verifier-checked
- If only 1 explorer returns → skip cross-check; the URL check still runs
- If the parallel URL check fails → the sequential fallback in `../UrlVerificationProtocol.md`

## Output format

**Saved report** (the research artifact in the research history folder, SKILL.md § Output format):
```markdown
## Executive Summary
[2-3 sentence overview]

## Verified Findings
### [Theme 1]
- [HIGH] Finding (confirmed by: explorer + verifier)
- [MED] Finding (single source, not independently verified)

### [Theme 2]
- [HIGH] Finding (multiple explorers agree)
- [CONFLICT] Finding A vs Finding B (see Conflicts section)

## Unique Insights by Source
- **Claude**: [analytical depth + contrarian perspectives]
- **Gemini**: [cross-domain connections]
- **OpenAI/Codex**: [primary-source findings]
- **Grok**: [X discourse, LOW until confirmed]
- **Community**: [verbatim experiences from Reddit/X, when the slot ran]
- **Verifiers**: [what was confirmed/refuted]

## Conflicts & Low-Confidence Items
⚠️ CONFLICT on [topic]:
  Explorer (Claude): [claim] — [source]
  Verifier (Perplexity): [contradicting claim] — [source]
  Status: Unresolved

📉 LOW CONFIDENCE:
- [claim] — could not independently verify
```

**The returned answer.** The response shape is the agent's usual answer format; the content carries:

- The synthesized answer first, by theme, with confidence tags.
- Each conflict and each low-confidence item, with both sides and their sources.
- Verbatim community experiences with URLs, when the community slot ran.
- The path to the saved report.
- Research metrics:

```markdown
📈 RESEARCH METRICS:
- Total Researchers: 9 (7 explorers + 2 verifiers) + N community, parallel or sequential
- Explorer Types: Claude(3), Gemini(2), Codex(1), Grok(1)
- Verifier Types: Perplexity(1), Claude(1)
- Findings: N HIGH | N MED | N LOW | N CONFLICT
- URLs verified: N/N
```
