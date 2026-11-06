---
name: council
description: "Multi-agent collaborative debate producing visible round-by-round transcripts with real intellectual friction — members are topic-briefed personas (parallel subagents when the agent has them, otherwise played in sequence), run as a 3-round DEBATE or a 1-round QUICK check, to find the best path. USE WHEN council, debate, multiple perspectives, weigh options, deliberate, get different views, what would experts say, pros and cons. NOT FOR pure adversarial attack (use `red-team`)."
license: MIT (see LICENSE.txt)
---

# Council

Runs a multi-agent debate. Topic-briefed members discuss a topic over rounds, respond to each other's actual points, and surface insights through real intellectual friction. You get a visible round-by-round transcript plus a synthesis. DEBATE runs three rounds; QUICK runs one for a fast perspective check.

One model gives one frame and one set of blind spots, and "pros and cons" gives a flat list with no one pushing back; distinct experts who disagree on the merits expose the weak parts of an idea before you commit.

## Ideal State

- Every council is four different topic-specific member briefs, written before the first round runs, each giving a name, the member's role/expertise, the stance they hold, and what they'll push on; no member is a bare built-in agent type with no persona.
- Members run as independent parallel subagents when the agent can run them, each seeing only its own brief and the prior transcript; when the agent cannot, they are played one after another in this session, each fully in character. If different models or vendors are available, split the members across them so the debate does not share one lineage's blind spots. A member that failed or did not run as requested is named in the transcript, never silently dropped or kept.
- Every member argues from the full context the request supplied (the measured facts, files, quotes and constraints), so positions engage the actual decision rather than a generic version of it.
- Members answer each other's actual points by name, and the transcript shows that friction round by round.
- The output ends in a usable verdict (a recommended path for DEBATE, proceed / reconsider / escalate for QUICK) that states remaining disagreement instead of forcing consensus.
- The answer delivered is the finished debate; no member's work is still running when it is handed over.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Debate** | "council", "debate", full structured debate (3 rounds, transcript + synthesis) | `Intents/Debate.md` |
| **Quick** | "quick council check", fast perspective check (1 round, initial positions only) | `Intents/Quick.md` |

| File | Read when |
|------|-----------|
| `CouncilMembers.md` | writing member briefs, default perspective slots, and how to run the members (subagents or in sequence) |
| `OutputFormat.md` | length, tone and naming rules for every member answer, in both intents |

Council is collaborative-adversarial (debate to find the best path) and produces visible transcripts; pure adversarial attack is not a Council intent — redirect to the `red-team` skill (if installed).

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/council/PREFERENCES.md` (default `~/.agent-skills/council/`) and override the defaults here; when absent, the defaults stand.

No keys or installs are needed.

## Integration

**Works well with:**
- **`red-team`** (optional) - Pure adversarial attack after collaborative discussion
- **`research`** (optional) - Gather context before convening the council

## Gotchas

- There is no composition tool and no trait matrix. Members are inline briefs (`CouncilMembers.md` § The brief). Give a subagent the brief as its whole task, and tell it to answer in character and to give the answer only, not a report about itself; subagents inherit a lot of context, so keep them to the brief plus the round prompt (`CouncilMembers.md` § Launch).
- More agents ≠ better debate. 4-6 well-briefed agents outperform 12 generic ones.

## Examples

```
User: "Council: Should we use WebSockets or SSE?"
→ Debate intent: a real-time architect, a frontend-DX advocate, an ops skeptic and a researcher
→ A 3-round transcript ending in a recommended path, the strongest objection still standing, and what would flip it

User: "Quick council check: Is this API design reasonable?"
→ Quick intent: four API-relevant members
→ One round of 30-50 word takes and a Proceed / Reconsider / Need full debate call

User: "Council: Is AI overhyped?"
→ Debate intent: an AI builder, a security skeptic, a pragmatic engineer and an evidence analyst
→ A 3-round transcript where at least one stance sharpens under challenge, with disagreements left standing
```
