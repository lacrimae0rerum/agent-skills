---
name: writing
description: "Authors and assembles prose from the user's material, writes in the user's own voice against a measured corpus model, audits and fixes AI-writing patterns, scores text with the Pangram AI detector, and previews drafts as rendered pages. Use when asked to assemble a transcript, shape dictated notes, organize rough spoken material, write as me, write in my voice, sound like me, this does not sound like me, fix the voice, remove AI-isms, deai this, audit writing, clean up AI writing, check for AI patterns, sound less like AI, score AI, pangram, show me the draft, preview the article, open the draft properly. Not for detection only (use `detect-ai`), fiction (use `write-story`), placing a finished blog post, or writing social posts."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ for Tools/. Pattern audit and assembly need no setup. VoiceJudge needs an LLM provider (ANTHROPIC_API_KEY, OPENAI_API_KEY, claude/codex CLI, or AGENT_SKILLS_LLM_CMD). ScoreAI needs PANGRAM_API_KEY (billed per word). Preview runs `bunx marked` (fetched on first use); its open step uses macOS `open -a`."
---

# Writing

Author and revise prose in the user's voice, audit confirmed AI-writing patterns, and report Pangram scores. The voice itself is data the user supplies: a measured corpus model under the configured voice directory, plus the user's style guide at `$AGENT_SKILLS_HOME/writing/WRITINGSTYLE.md` (template: `Templates/WritingStyle.md`). The skill holds the tools that measure, gate and judge against it.

## Ideal State

- Every change to someone's text traces to a confirmed finding or a source span: facts, numbers, quotes, links and the writer's meaning survive, and nothing is added that the source or brief did not supply.
- Prose in the user's voice aims at the measured corpus model and the anchor piece and clears `VoiceGate.ts` and `VoiceJudge.ts` without being degraded to pass; stripping AI-isms alone never counts as done.
- Every Pangram number comes from a real `Tools/PangramScore.ts` run and is reported as a signal with its caveats, never as a pass/fail gate.
- A check that could not run (no config, no key, no LLM provider, no browser tools) is reported as not run, never as passed.

## Intent Routing

| Intent | Trigger | File | Bundle |
|--------|---------|------|--------|
| **Rewrite** (default) | "deai this", "remove AI-isms", "clean up AI writing", "make this sound less like AI", "sound more human", "writing check" | `Intents/Rewrite.md` | `rewrite` |
| **Detect** | "detect", "flag only", "audit only", "just flag", "scan for AI", "detect AI tells", "detect mode" | `Intents/Detect.md` | `detect` |
| **ScoreAI** | "score AI", "test for AI writing", "how AI does this read", "AI detection score", "pangram", "is this AI-detectable" | `Intents/ScoreAI.md` | `score` |
| **WriteAsUser** | "write as me", "write this in my voice", "sound like me", "make it sound like I wrote it", "this doesn't sound like me", "fix the voice", long-form authoring or repair in the user's voice | `Intents/WriteAsUser.md` | `voice` |
| **Assemble** | "assemble this transcript", "shape these dictated notes", "organize this rough spoken material", "turn this stream of consciousness into prose" | `Intents/Assemble.md` | `assemble` |
| **Preview** | "show me the draft", "preview the article", "open the draft properly", let me see it properly | `Intents/Preview.md` | `preview` |

Uncertain routing, or a request that needs every instruction, loads the `full` bundle (the complete guide and every intent file). Standalone detection with no rewrite intent routes to the `detect-ai` skill instead, if it is installed; ScoreAI stays here because the publication audit runs it inline.

| File | Read when |
|------|-----------|
| `References/CompleteGuide.md` | the patterns and voice references Rewrite and Detect audit against, the voice config and tool tables, the hard formatting rules, and the skill's gotchas and examples (the bundles load its sections) |
| `References/AIWritingPatterns.md` | every audit and every rewrite: word tables, pattern categories, severity tiers, context profiles, the minimal-diff rewrite contract |
| `Setup.md` | configuring the voice model: config keys, `voice_dir` files, secrets, a proof run |
| `Tools/` | `WritingConfig.ts` flags (`Tools/WritingConfig.help.md`); the voice tools are described in `References/CompleteGuide.md` § Tools |

### Loading a bundle

Before executing, load the matching bundle. `Context.json` maps each bundle to its sections: a section is a whole file (`file`) or one `## heading` of a file (`file` + `heading`), and the `required` sections (Hard Formatting Rules, Gotchas) load with every bundle. Read every section the bundle lists, plus the required ones, and follow every requirement they contain. Skill-local paths resolve from the skill folder; user data paths from `$AGENT_SKILLS_HOME/writing/` (default `~/.agent-skills/writing/`).

An unchanged section already in context needs no second read; after context compaction or a source change, reload the relevant bundle. A truncated read does not count as loaded: re-read the missing part. When unsure which sections apply, read `References/CompleteGuide.md` and every relevant intent file directly. Never proceed on a partial load.

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/writing/PREFERENCES.md` (default `~/.agent-skills/writing/`) and override the defaults here; when absent, the defaults stand.

The skill config is `$AGENT_SKILLS_HOME/writing/Config.md` (set `WRITING_CONFIG` to use another path). It names the voice directory (`voice_dir`, holding `Corpus.md`, `Exemplars.md`, `PostExemplars.md`, `VoiceProfile.md`, `VoiceProfile.json`), an optional published-content index (`corpus_cli`), the preview browser, and the few example phrases the gate and judge quote. With no config, `VoiceGate.ts` and `VoiceJudge.ts` stop with exit 2 and point at the guide. First-time set-up, field tables and a proof run: [`Setup.md`](Setup.md). The full key and file tables are in `References/CompleteGuide.md` § Data & Config, loaded by the `voice` bundle. `bun Tools/WritingConfig.ts status` reports what is configured.

## Setup

- Runtime: bun 1.2+ for everything in `Tools/`. No `bun install` is needed.
- `PANGRAM_API_KEY` (ScoreAI only): export it or put it in `$AGENT_SKILLS_HOME/.env`. Pangram bills per word.
- `VoiceJudge.ts` grades through `Tools/_portable/inference.ts`: set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, or have the `claude` or `codex` CLI on PATH, or set `AGENT_SKILLS_LLM_CMD` to any command that reads a prompt on stdin. `AGENT_SKILLS_LLM` forces one provider; `AGENT_SKILLS_MODEL_HIGH` picks the judge model.
- The voice model and config: `Setup.md`.

## Gotchas

The skill's gotchas live in `References/CompleteGuide.md` § Gotchas, a `required` section in `Context.json` that every bundle loads.

## Examples

```
User: "deai this draft"
→ Rewrite (rewrite bundle)
→ Profile named, findings listed, a minimal-diff rewrite and a clean second-pass audit
```

```
User: "write the intro to this post as me"
→ WriteAsUser (voice bundle)
→ A draft anchored in the user's published position, with VoiceGate and VoiceJudge exit codes and a reported Pangram score
```

More worked examples live in `References/CompleteGuide.md` § Examples, loaded by the `full` bundle.
