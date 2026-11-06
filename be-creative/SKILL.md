---
name: be-creative
description: "Single-pass divergent ideation via Verbalized Sampling: surfaces the strongest of several diverse candidates, or expands a seed corpus into an eval dataset. USE WHEN be creative, brainstorm, divergent ideas, creative solutions, maximum creativity, tree of thoughts, radically different, name this, creative angle, technical creativity, novel ideas, expand this corpus, synthetic data, generate diverse examples, create test set. NOT FOR evolving ideas over several rounds or multi-cycle ideation (use `novelty` for multi-cycle exploration), new causal explanations of a phenomenon (use `novelty`), or adversarial critique (use `red-team`)."
license: MIT (see LICENSE.txt)
compatibility: "Single-pass intents need nothing. Tools/Diversity.ts (SyntheticDataExpansion) requires bun 1.2+, runs offline, no env vars. TechnicalCreativity works best with a second model or vendor, optional."
---

# Be Creative

Ask a model for "a creative idea" and you get the most probable one: the safe, already-seen answer. This skill pushes past that. Single-pass intents use Verbalized Sampling (generate several low-probability candidates, surface the strongest; see `ResearchFoundation.md`). SyntheticDataExpansion grows a small seed set into a diverse corpus. Ideas evolved over several rounds (a population of proposers, recombination with lineage, measured fitness) are not a single pass: use the `novelty` skill's cycle intents if it is installed, otherwise run this skill repeatedly and feed the strongest survivors into the next round.

## Ideal State

- Each run surfaces several genuinely distinct candidates, compared against each other rather than by self-reported probability, and names the strongest for the brief.
- The candidates differ in kind (different assumptions, framings, formats or domains), never one idea in five outfits.
- When diversity is load-bearing, candidates are generated or judged by a second model or vendor when the agent has one available (the lane chosen by whether the brief is taste-judged or correctness-judged), or else by a separate pass with a deliberately different framing.
- SyntheticDataExpansion returns a corpus measurably more diverse than its seed set: a higher diversity index from `Tools/Diversity.ts index` than the seed.
- A request to evolve ideas over several rounds is run as separate rounds (see the `novelty` skill), never as a single pass here.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| StandardCreativity | "be creative", "think creatively", default creative tasks | `Intents/StandardCreativity.md` |
| MaximumCreativity | "maximum creativity", "most creative", "radically different" | `Intents/MaximumCreativity.md` |
| IdeaGeneration | "brainstorm", "ideas for", "solve this problem" | `Intents/IdeaGeneration.md` |
| TreeOfThoughts | "complex problem", "multi-factor", "explore paths" | `Intents/TreeOfThoughts.md` |
| DomainSpecific | "artistic", "business innovation", domain-specific | `Intents/DomainSpecific.md` |
| TechnicalCreativity | "technical creativity", algorithm or architecture ideas | `Intents/TechnicalCreativity.md` |
| SyntheticDataExpansion | "expand corpus", "synthetic data", "generate diverse examples", "create test set from these" | `Intents/SyntheticDataExpansion.md` |

"ideate", "evolve ideas", "breakthrough ideas", "multi-cycle ideation" and any request for several rounds are multi-round work: use `novelty` if installed, otherwise repeat this skill round by round.

| File | Read when |
|------|-----------|
| `ResearchFoundation.md` | the Verbalized Sampling evidence base behind the single-pass intents |

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/be-creative/PREFERENCES.md` (default `~/.agent-skills/be-creative/`) and override the defaults here; when absent, the defaults stand.

## Setup

Nothing to set up for the six single-pass intents. `Tools/Diversity.ts` (used by SyntheticDataExpansion) needs bun 1.2+ and runs offline, with no keys. TechnicalCreativity is better with a second model or vendor when the agent can reach one, but works without.

## Gotchas

- **Verbalized Sampling adds nothing on tasks with one correct answer.** Use it where many answers are valid. A hill climb (iterative improvement against one metric) has one metric but many valid changes, so VS applies to its proposals (the idea generator), never to its keep decision (2026-10-11 analysis).
- **The model's self-reported probabilities are not evidence of novelty.** Compare the candidates to each other.
- **A single model's "diverse" set shares that model's defaults.** When diversity really matters (TechnicalCreativity, and any multi-round ideation), generate or judge on a second model or vendor if the agent can reach one (a second subagent model, another CLI), and say which model produced which candidate.
- **Taste-judged briefs (voice, naming, visual concepts) and correctness-judged ones (algorithms, architectures) favor different models.** When a second model is available, give the majority of candidates to the model you trust more for that kind of judgment.

## Examples

```
User: "Brainstorm products we could build from a patent portfolio"
→ IdeaGeneration
→ The most breakthrough of five approaches that rest on different assumptions, with why it beats the conventional answer
```

```
User: "Divergent scene concepts for a blog header illustration"
→ DomainSpecific
→ A scene concept that breaks a real editorial-illustration convention, chosen on that domain's criteria and justified against them
```

```
User: "Evolve ideas for a new featured content collection over a few rounds"
→ Multi-round work (not a single pass): the `novelty` skill, or this skill run once per round
→ Generations of candidates across different framings, judge-scored with spread since there is no metric, the stopping condition named, each generation kept
```
