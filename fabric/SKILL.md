---
name: fabric
description: "Runs Fabric prompt patterns natively from Patterns/ (240+), plus our ideal-state ports of the most-used ones: each port is an intent with its own code checker that beat the upstream prompt head to head (security, reasoning, reading, engineering, writing). USE WHEN word summary, ws, N levels, fabric, fabric pattern, run fabric, update patterns, any Fabric pattern name, threat report, threat scenarios, security finding, analyze logs, malware, incident, semgrep rule, sigma rules, nuclei template, email headers, terraform plan, analyze claims, logical fallacies, falsifiable, compare and contrast, analyze paper, summarize, meeting summary, extract insights, extract ideas, extract references, design document, explain code, review design, pull request description, commit message, code rules, analyze prose, threat model, mermaid, STRIDE. NOT FOR multi-agent investigation (use `research`) or content-adaptive extraction (use `extract-wisdom`)."
license: MIT (see LICENSE.txt)
compatibility: "Patterns and intents need no code. Code checks: bun 1.2+; bash, mmdc, yr or yara, semgrep and nuclei sharpen some checks when on PATH. Optional: the fabric CLI and yt-dlp for YouTube transcripts and blocked URLs, git for UpdatePatterns. PortDuel needs an LLM provider: ANTHROPIC_API_KEY, OPENAI_API_KEY, the claude or codex CLI, or AGENT_SKILLS_LLM_CMD."
---

# Fabric

**Contents:** Ideal State · Intent Routing · Setup · Data & Config · Gotchas · Examples

Runs any of 240+ specialized prompt patterns across extraction, summarization, analysis, creation, improvement, security, and rating. Common ones: extract_wisdom, create_threat_model, analyze_claims, improve_writing, review_code, mermaid, youtube_summary. Patterns run natively: the agent reads the pattern's system.md and applies it directly, with no CLI round-trip. The fabric CLI is used only for YouTube transcripts (-y) and URL fallback (-u).

The skill also holds our own modernized versions of the patterns that rank highest on value, public use and our own use, written as ideal-state intents, each with its own code checker (`Tools/<Intent>Check.ts`) and an optional eval suite that runs when the `assay` skill is installed. A port routes only after it beats its upstream prompt head to head on held-out inputs (`Tools/PortDuel.ts`): 51 intents covering 57 patterns, WordSummary included, run instead of the upstream prompt. Seven more are still behind upstream and listed separately; their patterns run upstream until a revision wins.

## Ideal State

- The pattern that runs is the one the request named, or the one its wording maps to, and its output keeps the format the pattern's OUTPUT INSTRUCTIONS define.
- A request for a pattern we have ported runs its intent, never the upstream prompt: `create_5_sentence_summary` and `ws` run WordSummary, and every pattern in `Intents/ExecutePattern.md` § Ported patterns runs the intent it names.
- Patterns run natively from `Patterns/`; the fabric CLI is touched only for YouTube transcripts and blocked URLs.
- The local `Patterns/` library carries every pattern in upstream fabric's `data/patterns/`, takes nothing from the local fabric config, keeps its local edits (Gotchas), and every update reports its before and after counts.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **ExecutePattern** | "use fabric", "run pattern", "apply pattern", "fabric extract wisdom" or the `extract_wisdom` pattern by name, "summarize", "analyze with fabric" | `Intents/ExecutePattern.md` |
| **UpdatePatterns** | "update fabric", "update patterns", "sync fabric", "pull patterns" | `Intents/UpdatePatterns.md` |
| **WordSummary** | `ws` or `ws 3`, "word summary", "N levels from N words to one", "5 levels", `create_5_sentence_summary` | `Intents/WordSummary.md` |

### Ported patterns

One intent per ported upstream pattern, close siblings sharing one. Each runs instead of the upstream prompt; `Intents/ExecutePattern.md` § Ported patterns maps every pattern name to its intent.

### Security

| Intent | Trigger | File |
|--------|---------|------|
| **AnalyzeThreatReport** | "analyze this threat report", "just the trends from this report", "extract the commands from this pentest writeup", `analyze_threat_report`, `analyze_threat_report_cmds`, `analyze_threat_report_trends` | `Intents/AnalyzeThreatReport.md` |
| **ThreatScenarios** | "threat scenarios", "worried about", `create_threat_scenarios` | `Intents/ThreatScenarios.md` |
| **ReportFinding** | "write a pentest finding for this", "turn this scan output into a report finding", "improve this security finding", `create_report_finding`, `improve_report_finding` | `Intents/ReportFinding.md` |
| **AnalyzeLogs** | "analyze logs", "analyze these logs", "why did the deploy fail", `analyze_logs` | `Intents/AnalyzeLogs.md` |
| **AnalyzeMalware** | "analyze this malware sample", "triage this sandbox report", "write a YARA rule and IOCs for this", `analyze_malware` | `Intents/AnalyzeMalware.md` |
| **AnalyzeIncident** | "analyze incident", "incident record from an article", "how did the X breach happen", `analyze_incident` | `Intents/AnalyzeIncident.md` |
| **CyberSummary** | "cyber summary", "summarize this week's security news", "security news briefing", `create_cyber_summary` | `Intents/CyberSummary.md` |
| **SemgrepRule** | "write a semgrep rule", "semgrep rule for", "semgrep rule from this fix", `write_semgrep_rule` | `Intents/SemgrepRule.md` |
| **SecureByDesignQuestions** | "secure by design questions", "what security questions should I ask about this design", "security design review questions for", `ask_secure_by_design_questions` | `Intents/SecureByDesignQuestions.md` |
| **SigmaRules** | "sigma rules", `create_sigma_rules` | `Intents/SigmaRules.md` |
| **EmailHeaders** | "analyze email headers", "is this legit (headers)", "why did DMARC fail", `analyze_email_headers` | `Intents/EmailHeaders.md` |
| **NucleiTemplate** | "write a nuclei template", `write_nuclei_template_rule` | `Intents/NucleiTemplate.md` |
| **NetworkThreatLandscape** | "network threat landscape from this scan", "threat report on these open ports", "analyze this nmap scan for risk", `create_network_threat_landscape` | `Intents/NetworkThreatLandscape.md` |
| **ExtractPoc** | "extract the proof of concept", "pull the PoC from this bug bounty report", "what command validates this vulnerability", `extract_poc` | `Intents/ExtractPoc.md` |
| **TerraformPlan** | "terraform plan review", "is this plan safe to apply", "review this plan before I apply it", `analyze_terraform_plan` | `Intents/TerraformPlan.md` |

### Reasoning and claims

| Intent | Trigger | File |
|--------|---------|------|
| **AnalyzeClaims** | "analyze claims", "truth claims", "fact-check claims", `analyze_claims` | `Intents/AnalyzeClaims.md` |
| **LogicalFallacies** | "find the logical fallacies in this", "what fallacies does this argument commit", "is this a fallacy", `find_logical_fallacies` | `Intents/LogicalFallacies.md` |
| **CheckFalsifiability** | "check falsifiability of this", "is this claim falsifiable", "can this be proven wrong", `check_falsifiability` | `Intents/CheckFalsifiability.md` |
| **EthicalFramework** | "extract the ethical framework of this policy", "what ethics does this terms of service assume", "does this policy create unwilling victims", `extract_ethical_framework` | `Intents/EthicalFramework.md` |
| **CheckAgreement** | "check this agreement before I sign", "review this contract for gotchas", "what should I watch for in this terms of service", `check_agreement` | `Intents/CheckAgreement.md` |
| **AuditTransparency** | "audit transparency of this policy", "is this system transparent", "how opaque is this algorithm", `audit_transparency` | `Intents/AuditTransparency.md` |
| **AuditConsent** | "audit consent", "did I really consent to this", "is this consent genuine or manufactured", `audit_consent` | `Intents/AuditConsent.md` |
| **MindVirus** | "mind virus", "detect mind virus", "mind virus check", `detect_mind_virus` | `Intents/MindVirus.md` |
| **AnalyzeBill** | "analyze this bill", "what is this bill really trying to do", "hidden agenda in this legislation", `analyze_bill` | `Intents/AnalyzeBill.md` |
| **CompareAndContrast** | "compare and contrast X and Y", "compare these options in a table", "X vs Y comparison table", `compare_and_contrast` | `Intents/CompareAndContrast.md` |
| **AnalyzeRisk** | "vendor risk assessment", "is this vendor safe to use", "third-party risk review of this SaaS", `analyze_risk` | `Intents/AnalyzeRisk.md` |
| **RhetoricalLens** | "rhetorical lens on this", "how does this text persuade", "ethos pathos logos analysis", `lens_rhetorical` | `Intents/RhetoricalLens.md` |
| **StoicLens** | "stoic lens", "philosophical lineage", "is this just repackaged Stoicism", `lens_stoic` | `Intents/StoicLens.md` |
| **ExtractPredictions** | "extract predictions from this", "what predictions does this make", "list the forecasts in this transcript", `extract_predictions` | `Intents/ExtractPredictions.md` |

### Reading and summarizing

| Intent | Trigger | File |
|--------|---------|------|
| **AnalyzePaper** | "analyze this paper", "summarize this paper", "quick take on this paper", `analyze_paper`, `summarize_paper`, `analyze_paper_simple` | `Intents/AnalyzePaper.md` |
| **ExtractInsights** | "extract insights", "extract 5 insights from this", "what are the most surprising insights in this", `extract_insights` | `Intents/ExtractInsights.md` |
| **ExtractPatterns** | "extract patterns from these interviews", "what patterns keep coming up in this", "find the recurring themes across these reviews", `extract_patterns` | `Intents/ExtractPatterns.md` |
| **Summarize** | "summarize this", "give me a summary of", "main points and takeaways", `summarize` | `Intents/Summarize.md` |
| **ExtractIdeas** | "extract ideas from this", "what are all the ideas in this", "list every idea in this talk", `extract_ideas` | `Intents/ExtractIdeas.md` |
| **UlTags** | "tag this post", "tag this article", "which tags fit this", `apply_ul_tags` | `Intents/UlTags.md` |
| **SummarizeMeeting** | "summarize this meeting", "meeting summary from this transcript", "action items from this meeting", `summarize_meeting` | `Intents/SummarizeMeeting.md` |
| **BusinessIdeas** | "extract business ideas from this", "business ideas in elder care", "what businesses could you build from this", `extract_business_ideas` | `Intents/BusinessIdeas.md` |
| **ExtractRecommendations** | "extract recommendations", "what does this recommend", "pull the recommendations out of this", `extract_recommendations` | `Intents/ExtractRecommendations.md` |
| **SummarizeDebate** | "summarize the debate", `summarize_debate` | `Intents/SummarizeDebate.md` |
| **AnalyzeComments** | "analyze comments", "what did commenters think", "comment sentiment", `analyze_comments` | `Intents/AnalyzeComments.md` |

### Engineering

| Intent | Trigger | File |
|--------|---------|------|
| **DesignDocument** | "design document", "design doc", "C4 design document", `create_design_document` | `Intents/DesignDocument.md` |
| **ExplainCode** | "explain code", "explain this code", "what does this config do", `explain_code` | `Intents/ExplainCode.md` |
| **ReviewDesign** | "review this design", `review_design` | `Intents/ReviewDesign.md` |
| **PullRequest** | "write a pull request description", "PR description for this diff", "write up this branch as a PR", `write_pull-request` | `Intents/PullRequest.md` |
| **ExplainDocs** | "explain these docs", "explain this man page", "how do I use this tool", `explain_docs` | `Intents/ExplainDocs.md` |
| **ExplainTerms** | "explain the terms", "glossary of terms", `explain_terms` | `Intents/ExplainTerms.md` |
| **CodeRules** | "code rules", "rules for my CLAUDE.md", "AGENTS.md rules", `generate_code_rules` | `Intents/CodeRules.md` |

### Writing

| Intent | Trigger | File |
|--------|---------|------|
| **AnalyzeProse** | "rate this writing", "grade my prose", "Sense of Style critique of this", `analyze_prose`, `analyze_prose_pinker` | `Intents/AnalyzeProse.md` |
| **ShowIntro** | "show intro", "write a podcast intro for this episode", "intro to read before the interview", `create_show_intro` | `Intents/ShowIntro.md` |
| **GoldenRules** | "golden rules for this codebase", "golden rules from this postmortem", "what are the non-negotiable rules for", `create_golden_rules` | `Intents/GoldenRules.md` |

### Ports still behind upstream

These intents did not beat their upstream prompt on held-out cases (record: wins-losses-ties), so the upstream pattern still runs for them through ExecutePattern. Each stays here until a revision wins its duel.

| Intent | Patterns | Duel | File |
|--------|----------|------|------|
| **SecurePrompt** | `greybeard_secure_prompt_engineer` | 1-1-1 | `Intents/SecurePrompt.md` |
| **SilentVictims** | `detect_silent_victims` | 1-0-2 | `Intents/SilentVictims.md` |
| **ExtractReferences** | `extract_references` | 1-1-1 | `Intents/ExtractReferences.md` |
| **CodingProject** | `create_coding_project` | 1-1-1 | `Intents/CodingProject.md` |
| **GitDiffSummary** | `summarize_git_diff` | 0-2-1 | `Intents/GitDiffSummary.md` |
| **CreateCommand** | `create_command` | 1-0-2 | `Intents/CreateCommand.md` |
| **ExtractInstructions** | `extract_instructions` | 1-0-2 | `Intents/ExtractInstructions.md` |

A bare "extract wisdom" with no mention of Fabric or the pattern goes to the `extract-wisdom` skill if it is installed, which does content-adaptive extraction; otherwise ExecutePattern runs the `extract_wisdom` pattern.

All paths here are relative to this skill's folder; run the tools from it.

| File | Read when |
|------|-----------|
| `Patterns/` | running a pattern: one `<name>/system.md` per pattern: upstream data synced by UpdatePatterns, plus the scrub edits and a few older patterns upstream has since dropped (Gotchas); `pattern_explanations.md` lists them all |
| `Tools/CheckPatterns.ts` | checking the library: key patterns present, upstream coverage (`--upstream`), and new content-scan findings after a sync (`--scan-before`/`--scan-after`) |
| `Tools/<Intent>Check.ts` | checking a port's output before delivery; each intent's Tool contract gives the exact command, and each has a `.help.md` beside it |
| `Tools/PortDuel.ts` | judging a port against its upstream pattern on its held-out cases (`--help`) |
| `Evals/HeldOut/` | the held-out cases each port is duelled on, written before the port; builders never read them |
| `Setup.md` | first-time setup: bun for the checks, the optional fabric program and yt-dlp for YouTube transcripts, an LLM provider for PortDuel |

## Setup

Running patterns and intents needs nothing installed. The code checks need bun 1.2+. The fabric CLI and `yt-dlp` are needed only for YouTube transcripts and pages the native fetch cannot read; `git` only for UpdatePatterns. `Tools/PortDuel.ts` calls an LLM through `Tools/_portable/inference.ts`: set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (in the environment or `$AGENT_SKILLS_HOME/.env`), or have the `claude` or `codex` CLI on PATH, or set `AGENT_SKILLS_LLM_CMD`. Details and a proof it works: [Setup.md](Setup.md).

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/fabric/PREFERENCES.md` (default `~/.agent-skills/fabric/`) and override the defaults here; when absent, the defaults stand. The same folder may hold the user's own local-only patterns as `Patterns/<name>/system.md`, which never ship in the skill tree; ExecutePattern reads one only when `Patterns/` here has no pattern of that name (`Intents/ExecutePattern.md` § Tool contract). An optional `Config.md` there names a content scanner for UpdatePatterns (`Setup.md`).

## Gotchas

- **`fabric -y URL` for YouTube extraction — don't scrape YouTube pages.** fabric handles transcript extraction natively.
- **Pattern names are exact.** `extract_wisdom` not `extractwisdom`. Check `ls Patterns/` (or `Patterns/pattern_explanations.md`) if unsure, since patterns run from that directory, not from the CLI.
- **Patterns/ is not a byte mirror of upstream, and syncing from `~/.config/fabric/patterns/` leaks local patterns.** Some pattern files carry local edits: content-scan fixes (author-name headings in the threat-model essays, author URLs, author credits written as "the Fabric author") and portability fixes (the `t_*` patterns name a "personal context file" where upstream names its own framework's file; `judge_ultimate_law` names its external verifier without a path, the `create_coding_project` README's example paths start at the example project's root, `create_show_intro` spells out "digital assistant"). A plain upstream copy reverts the upstream-present ones. The fabric config directory also holds local-only patterns that are not upstream, and Patterns/ keeps older patterns upstream has since dropped, the key pattern `create_threat_model` among them, so an `rsync --delete` from upstream would remove it. UpdatePatterns therefore syncs from upstream `data/patterns/` only, re-applies the local edits, and fails on any new content-scan finding.
- **The pattern-category catalog at the end of `Intents/ExecutePattern.md` is load-bearing, not duplication.** It names more than 20 shipped patterns by category so a request can be mapped to one without reading the whole library; a simplification pass must not trim it.
- **The `t_*` patterns read a personal context file** (the person's mission, goals, challenges, strategies, projects and history) as part of their input. When the user gives none, ask for it, or for the parts the pattern needs, before running one.
- **Long content may exceed pattern context limits.** For very long inputs, chunk the content or use a summarize pattern first.

## Examples

**Example 1: Extract wisdom from content**
```
User: "Use fabric to extract wisdom from this article"
-> ExecutePattern intent, extract_wisdom pattern
-> The article's IDEAS, INSIGHTS, QUOTES and the other sections extract_wisdom defines, in its format
```

**Example 2: Update patterns**
```
User: "Update fabric patterns"
-> UpdatePatterns intent
-> Patterns/ matches upstream; the report gives the before and after pattern counts and marks each key pattern present or MISSING
```

**Example 3: Create threat model**
```
User: "Use fabric to create a threat model for this API"
-> ExecutePattern intent, create_threat_model pattern
-> A structured threat analysis of the API in the format the pattern defines
```
