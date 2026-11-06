# Council Members

Council members are personas you write inline, tailored to the topic, then run as independent calls, subagents in parallel when available (§ Launch).

## Why inline briefs

A model called with no persona has no stake in the topic and produces bland agreement. Council needs members who disagree on the merits. The friction comes from each member having a distinct role, expertise, and stance — which you supply in the brief.

## How to Create Council Members

### Choosing perspectives

Design the roles around the perspectives that create the most productive friction for this specific debate, not from a generic list.

**Example — "Should we use WebSockets or SSE?"**
- Real-time systems architect who defends push-first bidirectional transport
- Frontend-DX advocate who wants the simplest thing that ships
- Ops/reliability skeptic who distrusts long-lived connections
- Industry researcher who weighs precedent and adoption data

**Example — "Is AI overhyped?"**
- AI infrastructure builder who ships with these tools daily
- Security practitioner skeptic who has seen the failure modes
- Pragmatic engineer focused on real-world trade-offs
- Evidence-based researcher who wants the numbers

### The brief

Each member gets 2–4 sentences: a name, their role/expertise, the stance they hold, and what they'll push on and attack. That paragraph is the whole persona.

Example brief:
> **Mara — real-time systems architect.** Believes push-first. Will defend WebSocket bidirectionality and attack SSE's connection-count limits and reconnection story. Speaks precisely, cites protocol behavior.

### Launch: one independent call per member

A council member is text in, text out: it needs no tools, and every round already carries the prior transcript in its prompt.

- **If your agent can run subagents:** run all members of a round in parallel, one subagent per member. Each subagent's task is the member brief plus the round prompt (topic context, round instructions, prior transcript). Tell it to reply in character with the answer only. Do not pin a model unless the user asked; if several models or vendors are available, alternate members between them so the council does not share one lineage's blind spots.
- **If it cannot:** play the members one after another in this session. For each member, re-read its brief, write its answer fully in character, and do not let a later member see anything the earlier ones would not have seen in this round (in Round 1 each member gives a position before reading any other). Say once at the top of the transcript that the members were played in sequence by one model, so the reader knows the diversity is role-based.
- **Effort:** a short answer for Quick, a considered one for Debate, and the most capable model available when the user asked for depth or the decision is expensive to get wrong.
- **Lookups:** a member who must fetch something live (a current number, a doc) needs a subagent with web or file access, or you fetch the fact first and put it in the shared context.
- **Failures:** a member that failed or did not run as requested is named in the transcript, never silently dropped or kept; re-run it or proceed without it.

Observed on a paired probe (2026-09-18): four member briefs run as full-context subagents versus single direct calls. The direct calls held persona, length and structure on all four; one subagent member wrapped its answer in a report about itself, and each cost about 100k tokens of injected context. Prefer lean prompts.

## Default Perspective Slots

When the user doesn't specify members, cover these four perspectives — but write each one tailored to the topic, not as a generic role:

| Slot | Purpose |
|------|---------|
| **Builder** | Has built things in this domain; argues from what actually ships |
| **Skeptic** | Challenges assumptions, finds the flaws and failure modes |
| **Pragmatist** | Implementation reality, cost, and trade-offs |
| **Analyst** | Data, precedent, and external evidence |

The slots are a starting guide. Adjust the mix to the topic — a pure design question may want two builders and a user advocate instead.
