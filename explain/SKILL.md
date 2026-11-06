---
name: explain
description: "Keeps the user current on the fundamentals of what is going on in the user's projects, work and technical infrastructure: interactive lessons (optionally spoken) on the conversation topic, deep explanations of an area's fundamentals read fresh from live sources, and quizzes that remember what the user missed. USE WHEN teach me, /tm, /teach-me, tutorial, teach me this, walk me through this interactively, learn mode, quiz me, help me actually understand what we just did, explain fundamentals, /ef, what are the fundamentals of, how does this project actually work, catch me up on, refresh me on, quiz fundamentals, /qf, quiz me on the fundamentals, test what I know about, am I still current on. NOT FOR elaborating the last answer (just re-explain it), story explanations of content (use `story-explanation`), designed visual maps (use `visualize`), discovery interviews on a half-formed idea."
license: MIT (see LICENSE.txt)
---

# Explain

Keeps the user up on the fundamentals of what is going on across the user's projects, work and technical infrastructure, deeply and thoroughly. The user lives inside many systems at once and cannot hold all of them in mind, so this skill teaches the topic in front of them, explains the parts of any area that it cannot lose, and quizzes the user so gaps show up before they cost anything. It folds in a standalone teaching skill, so there is one place for teach, explain and quiz.

## Ideal State

- The user leaves each session able to explain or apply the material, shown by the user's own answers, not by how much was printed.
- What the user is told about a project, area or piece of infra is true of it today: read this session from the live source, never recalled.
- Over time the skill knows where the user's understanding is thin, because every quiz answer is on the record, and each new quiz goes after the misses and whatever changed since the user was last tested.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Teach** | "teach me", "/tm", "/teach-me", "tutorial", "quiz me" on what we just covered | `Intents/Teach.md` |
| **ExplainFundamentals** | "/ef", "explain the fundamentals of", "catch me up on", "how does X actually work" | `Intents/ExplainFundamentals.md` |
| **QuizFundamentals** | "/qf", "quiz me on the fundamentals of", "test what I know about", "am I still current on" | `Intents/QuizFundamentals.md` |

| File | Read when |
|------|-----------|
| `Setup.md` | optional setup: the area list, the learning record, and spoken narration |

Teach works on the conversation topic as a spoken dialogue. ExplainFundamentals and QuizFundamentals work on a standing area (a project, a work stream, a system) whether or not we touched it this session, and share one set of fundamentals per area so the quiz tests what the explanation taught.

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/explain/PREFERENCES.md` (default `~/.agent-skills/explain/`) and override the defaults here; when absent, the defaults stand. Optional files in the same folder: `Areas.md` (the user's own list of areas: name, path, docs, deploy command, so area names resolve without guessing) and `learning.jsonl` (the learning record that quizzes read and write). Without `Areas.md`, work from the project in front of you or ask where an area lives.

## Gotchas

- **"Quiz me" means two things.** Right after a lesson or a piece of work, it is Teach's quiz protocol on that material. Naming an area ("quiz me on the billing service", "/qf the network") is QuizFundamentals, which reads the live source and the record of past answers.
- **"Explain that again, simpler" is not this skill.** That just re-explains the last answer; `/ef` explains an area's fundamentals.

## Examples

**Example 1: Teach the thing we just built**
```
User: "teach me" (after a session debugging DNS records)
→ Teach intent
→ Spoken intro, a concept map of 3-5 ideas, one beat and one question per turn
→ Ends with a 2-3 question quiz and a recap diagram
```

**Example 2: Explain an area's fundamentals**
```
User: "/ef billing service"
→ ExplainFundamentals intent
→ Reads its row in the area list, the project spec and its code layout this session
→ The fundamentals by the "without X it can no longer ___" test, each with what it connects to, one flow diagram, what changed lately
```

**Example 3: Quiz on fundamentals**
```
User: "/qf home network"
→ QuizFundamentals intent
→ Reads the live sources and the learning record, asks 5 application questions one per turn, weighted to past misses
→ Each answer gets a verdict against the source and is appended to the learning record
```
