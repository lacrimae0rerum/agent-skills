---
name: write-story
description: "Scaffolds a story the writer already wants to tell, deriving structure, wound, theme, and prose from their own notes across seven narrative layers, short story to series: interview, story bible, chapter drafts gated against a published-fiction voice model, revision. Use when asked to write a story, fiction, novel, chapter, story bible, character arc, plot outline, creative writing, worldbuilding, draft story, help me write my story, develop my novel, layer my story, build out my book, I have notes for a story. Not for narrative summaries of real content (use `story-explanation`), or voice audits and AI-pattern cleanup (use `writing`)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ for Tools/. Planning intents need no setup. Drafting needs a fiction voice model built once (Setup.md); building it downloads Project Gutenberg texts. StoryJudge needs an LLM provider: ANTHROPIC_API_KEY, OPENAI_API_KEY, the claude or codex CLI, or AGENT_SKILLS_LLM_CMD."
---

# Write Story

**Contents:** Ideal State · Intent Routing · The Stance · Tools · Data & Config · Setup · Gotchas · Examples

This skill (`write-story`) is scaffolding for writing fiction. It takes what you already have — a sentence, a folder of notes, a half-drafted chapter — and helps you build the rest of the story one layer at a time, using the systems professional storytellers use on purpose. You bring the creativity; it fills in the pieces you're missing. WriteChapter drafts revisable scenes from your confirmed bible; it never invents the story's spine.

## Ideal State

- Every story element the skill hands back starts from the writer's own material, says whether it was inferred from their seed or offered as a new option, and stands only once the writer ratified or redirected it.
- All seven layers are the destination for every story; the derivation lens the writer's material calls for sets only the order they are reached.
- Each book is a resumable project: its `interview.md` and Story Bible `bible.md` are read before new work on it and carry what each session confirmed, drafted or changed, so continuity holds across sessions and books.
- Prose comes only from WriteChapter off the confirmed bible, or from Revise on the writer's own draft; either way it was written with the fiction voice model loaded and leaves with its `StoryGate.ts` axes and `StoryJudge.ts` voice line-up shortfall rate attached. The aim is the voice and quality of published fiction, never prose that passes as human.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **Interview** | "interview me", "I have notes/an idea for a story", "help me plan a story", "layer my story" | `Intents/Interview.md` |
| **BuildBible** | "build story bible", "create story plan", "map the story" | `Intents/BuildBible.md` |
| **Explore** | "explore ideas", "brainstorm", "I'm stuck", "what if" | `Intents/Explore.md` |
| **WriteChapter** | "write chapter", "write scene", "draft this" | `Intents/WriteChapter.md` |
| **Revise** | "revise", "edit", "improve", "polish" | `Intents/Revise.md` |

The usual path: **Interview** reads what you have and builds the spine with you → **BuildBible** turns it into a Story Bible (`bible.md`, from `Templates/StoryBible.md`) → **WriteChapter** drafts off that bible → **Revise** layers and polishes. **Explore** is the idea engine you reach for when a layer is genuinely blank.

| File | Read when |
|------|-----------|
| `StoryLayers.md` | defining or checking any of the seven layers: meaning, character change, plot, mystery, world, relationships, prose (BuildBible) |
| `StorrFramework.md` | building character: sacred flaw, theory of control, the dramatic question, status games (Interview, BuildBible) |
| `PressfieldFramework.md` | concept, hook, theme, villain design and the Foolscap one-page method (Interview, BuildBible) |
| `DerivationLenses.md` | choosing the lens that derives the spine: Storr, Cron, Pressfield/Truby, Egri (Interview) |
| `PhasesAndEvents.md` | mapping three-act structure, beats and mandatory events (BuildBible) |
| `StoryStructures.md` | another framework view: Dramatica, Story Grid, Sanderson, Hero's Journey (BuildBible) |
| `AestheticProfiles.md` | setting genre and style (BuildBible, WriteChapter) |
| `AntiCliche.md` | freshness checks and the mechanisms of machine prose (Explore, WriteChapter, Revise) |
| `RhetoricalFigures.md` | the rare moment that wants a figure, from the Forsyth-based catalogue (WriteChapter, Revise) |
| `Critics.md` | the multi-pass prose review (WriteChapter) |
| `Templates/StoryBible.md` | starting a book's Story Bible: the plan document with its Ideal State ladder, criteria, body sections and log (BuildBible) |
| `Setup.md` | first-time setup: building the fiction voice model (corpus, bands, exemplars) the drafting gate needs |

## The Stance

This skill augments a creator and never substitutes for one. The Ideal State's first bullet (start from the writer's material, label it, let them ratify) is the core of it; these rules carry the rest:

- Every derived element is a proposal the writer ratifies, not a fact the system asserts. Label where each one came from: "inferred from your seed" vs. "a new option I'm offering."
- Offer options, not answers: a few directions to choose among, not one rewrite to approve.
- Suggest at the sentence or beat level. Never take over a chapter.
- Anchor to the writer's own voice: their favorites, their samples, their cadence.
- The writer's word always wins. If they redirect, the redirect is the truth.
- Only WriteChapter emits new prose, and only off the writer's confirmed bible, framed as a revisable draft they own; Revise works only on the writer's own draft.

## Tools

| Tool | Purpose |
|------|---------|
| `Tools/BuildFictionCorpus.ts` | Splits Project Gutenberg plain-text story collections into per-story `.md` files plus `Corpus.md` manifest. |
| `Tools/BuildVoiceProfile.ts` | Measures every corpus piece and records p10/p50/p90 bands per metric in `VoiceProfile.json`; `--compare <file>` checks a draft against them. |
| `Tools/StoryGate.ts` | Measures draft prose against a human-fiction corpus (dialogue, beat rate, universals) and flags machine-prose drift. |
| `Tools/StoryJudge.ts` | Blind voice line-up against corpus paragraphs (the verdict: does the draft hold up in voice and craft) plus a six-mechanism diagnosis against `Exemplars.md` (advisory); `--detect` adds a which-was-model rate as a diagnostic only. |
| `Tools/VoiceMetrics.ts` | The deterministic metric vector the other tools share; `bun Tools/VoiceMetrics.ts <file> --pretty` prints it for one text. |

## Data & Config

First-time setup (accounts, keys, files to fill in): [Setup.md](Setup.md).

User preferences, when present, live in `$AGENT_SKILLS_HOME/write-story/PREFERENCES.md` (default `~/.agent-skills/write-story/`) and override the defaults here; when absent, the defaults stand.

The fiction voice model and every book project are user data the skill reads at run time, all under `$AGENT_SKILLS_HOME/write-story/`; the skill body holds none of it.

| What | Where |
|---|---|
| Corpus config (Gutenberg ids, authors, anchor) | `$AGENT_SKILLS_HOME/write-story/Corpus/Corpus.json` |
| Per-story corpus files + manifest | `…/write-story/Corpus/<slug>.md`, `…/write-story/Corpus/Corpus.md` |
| Bands | `…/write-story/Corpus/VoiceProfile.json` (from `Tools/BuildVoiceProfile.ts`) and `…/write-story/Corpus/StoryProfile.json` (fiction axes, from `StoryGate.ts --build`) |
| Exemplars | `…/write-story/Corpus/Exemplars.md` — verbatim passages, loaded before drafting and by the judge |
| History (optional) | `…/write-story/History.md` — the user's own incident specifics behind generic lessons here, read on demand |

Build order on a fresh install (paths to `Tools/` are relative to this skill folder):

```bash
bun Tools/BuildFictionCorpus.ts --config <Corpus.json> --fetch
bun Tools/BuildVoiceProfile.ts --manifest <Corpus.md> --out <VoiceProfile.json>
bun Tools/StoryGate.ts --build --manifest <Corpus.md> --voice <VoiceProfile.json> --out <StoryProfile.json>
```

Then, per draft: `StoryGate.ts <draft>` (deterministic bands plus the narrator's aside) and `StoryJudge.ts <draft>` (the verdict is a blind voice line-up of the draft's narrative paragraphs against corpus paragraphs, a judge asked which carries the stronger voice and craft, shortfall rate at or under 0.6 to pass; the six-mechanism diagnosis it prints is advisory, and the `--detect` model-detection rate is a diagnostic that never decides a pass). Every tool exits 2 with the build instruction when the model is absent.

Everything above lives under `$AGENT_SKILLS_HOME/write-story/` (`AGENT_SKILLS_HOME` defaults to `~/.agent-skills`). When that directory holds `PREFERENCES.md`, its default genre, aesthetic and voice apply.

Each book is a project under `$AGENT_SKILLS_HOME/write-story/projects/<book-slug>/`:

- `interview.md` — the saved interview results (the spine, the layers, what's confirmed)
- `bible.md` — the Story Bible, from `Templates/StoryBible.md`: the living plan that tracks what's done and what's left, growing across sessions

## Setup

- Runtime: bun 1.2+ for everything in `Tools/`; no `bun install` is needed.
- `StoryJudge.ts` grades through `Tools/lib/Judge.ts` and `Tools/_portable/inference.ts`: set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, or have the `claude` or `codex` CLI on PATH, or set `AGENT_SKILLS_LLM_CMD` to any command that reads a prompt on stdin. `AGENT_SKILLS_LLM` forces one provider; `AGENT_SKILLS_MODEL_HIGH` picks the judge model.
- Keys may be exported or put in `$AGENT_SKILLS_HOME/.env`.
- The fiction voice model: `Setup.md` (built once; the corpus build downloads public-domain texts from Project Gutenberg).

## Gotchas

- **The words that fail are ordinary.** A story that passes every banned-word table can still read as machine prose through narrator's asides ('the way everyone reads agreements', 'as anyone would') and rhythm tells; `AntiCliche.md` category 7 is the pass that catches them, and it is a read, never a grep.

## Examples

**Example 1: A writer who already has a lot**
```
User: "I've got a folder of notes for a novel — a few character sketches,
       a rough world, and two draft scenes. Help me build it out."
→ Interview intent
→ interview.md saved: a spine derived from their own notes, every element labeled and ratified, all seven layers marked confirmed / partial / open, the next step left to them
```

**Example 2: Building the full story plan**
```
User: "Build the story bible for my novel"
→ BuildBible intent
→ The Story Bible (`bible.md`) maps all seven layers start to finish, its criteria track done versus remaining, and the gaps still needing a decision are named
```

**Example 3: Writing actual prose**
```
User: "Write chapter 3 based on the story bible"
→ WriteChapter intent
→ A draft of chapter 3's beats the writer owns and revises, reported with its gate axes and a voice line-up shortfall rate at or under 0.6
```
