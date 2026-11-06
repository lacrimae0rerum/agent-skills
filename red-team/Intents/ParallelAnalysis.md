# ParallelAnalysis

**Contents:** Ideal State · Anti-criteria · Output format · Tool contract · Examples · References

Attacks an argument from many diverse perspectives and returns its strongest objections, ranked by severity; a full pass adds the strongest steelman and the strongest surviving counter-argument against it.

## Ideal State

- Depth matches the request. A quick pass ("quick", "4-6 strongest objections", a time budget) returns the 4-6 strongest objections, severity-ranked, each naming the claim it breaks, why it breaks, and a remediation that fits the stated constraints; a steelman of the opposite is added only when asked. A full pass returns the steelman and counter-argument below.
- An inline pass (the caller says inline or no subagents, or cannot spawn) is done in the caller's own context with no subagent and no extra model call, and its output says the attack came from one model, so the cross-model signal is absent.
- On a full pass, the output is the strongest steelman of the argument and the strongest surviving counter-argument against it, each an 8-point story explanation, 12-16 words per point, attacking real weaknesses (never strawmen), ranked by severity.
- The counter-argument defeats the steelman, not a weaker version of it: a proponent reads the steelman and says "yes, that's my argument," and reads the counter-argument and cannot say "that's not what I meant."
- The critique names the fundamental flaw as a specific assumption and states how the whole structure collapses if that assumption falls.
- The output shows the claim decomposition the attack worked from, produced with the `first-principles` skill's Deconstruct intent on a full pass (if it is not installed, decompose the argument yourself): it separates fundamental truths from assumed ones, surfaces the gap between stated and actual components, and breaks the argument into atomic, independently-attackable claims, each self-contained, specific, and challengeable by a competent critic.
- On a full pass the findings come from attackers on distinct angles, split across models or vendors where available; each attacker's findings answer the full argument and the claim decomposition, and name the real strengths and the real weaknesses from its angle.
- Critical findings are the weaknesses that many personas (and, where several models were used, several models) independently land on; a lone sharp insight still counts.
- Findings are ranked by severity, with noise discarded.
- The verdict says whether the argument is fundamentally sound with fixable execution, or fundamentally flawed despite good intentions.
- Every stated constraint carries a HARD/SOFT/ASSUMPTION classification, produced with the `first-principles` skill's Challenge intent on a full pass (if it is not installed, classify the constraints yourself): HARD (physics/reality, cannot attack), SOFT (policy/choice, can be challenged), or ASSUMPTION (unvalidated, prime target).
- The most devastating critiques target "constraints" treated as HARD that are actually SOFT.

## Anti-criteria

- No nitpicking or contrarianism.
- No strawman: never a steelman the proponent would not recognize as their argument, and never a counter-argument that defeats a weaker version of the steelman.
- No noise carried into the ranked findings.
- No subagent or multi-model dispatch when the caller asked for inline or no agents, and no full 8+8 fan-out when the caller asked for a quick pass.

## Output format

### Quick pass

```
# RED TEAM: [what was attacked]

**Claims attacked:** [numbered atomic claims]

1. [Severity: critical | high | medium | low] [The objection, one or two sentences]
   Breaks: [claim #N: the claim or rule it attacks]
   Fix: [remediation within the stated constraints]

**Verdict:** [One sentence: sound with fixable execution, or fundamentally flawed]
```

### Claims (full pass)

```
# CLAIMS

1-N. [atomic claim, marked fundamental or assumed]
```

### Steelman (8 points, 12-16 words each)

```
# STEELMAN

**The Position (Best Version):** [One sentence - the strongest formulation]

**The Strongest Case FOR This Argument:**

1-8. [12-16 words each, strongest last]

**Validity Assessment:** [One sentence on the legitimate core concern]
```

### Counter-Argument (8 points, 12-16 words each)

```
# RED TEAM VERDICT

**The Position:** [One sentence summary of what was red-teamed]

**The Counter-Argument:**

1-8. [12-16 words each, opening on the fundamental flaw]

**Assessment:** [One sentence on the argument's fundamental soundness after analysis]
```

Each point is self-contained, uses plain language, attacks a real weakness, and builds toward the strongest possible objection. The sequence should escalate in impact and make the reader say "I hadn't thought of that."

## Tool contract

**Dispatch parallel adversarial personas** (full or quick pass, never inline). An attacker is text in, text out, so each persona is one independent call. If your agent can run subagents, launch all personas in parallel, each with its persona brief and the full argument plus claim decomposition and attack instructions. If it cannot, play the personas one after another in this session, each fully in its own angle, and say in the output that they were played in sequence by one model. The call carries:

```
Persona brief: <who the attacker is and which angle they hold>
Task: <full argument + claim decomposition + attack instructions>
```

When the agent can reach more than one model or vendor, alternate personas between them: attackers that share one model share its blind spots, and a finding two models reach independently is the strongest signal this intent produces. Give the two or three personas aimed at the load-bearing claims the most capable model and the rest a faster one. A persona that needs live evidence (a precedent, a current number) needs a subagent with web or file access, or you fetch the fact first and include it in its task.

Pick personas whose angles differ and fit the argument: engineers (technical and logical rigor), architects (structural and systemic issues), pentesters (adversarial and security thinking), and interns (fresh eyes and unconventional angles). Each persona returns its strongest point for the argument and its strongest point against it, each tied to a claim number, plus a one-sentence verdict.

## Examples

### Example: First Principles Pattern Recognition

**Argument:** "We should delay this product launch by six months to add more features."

**First Principles Analysis:**
- **Claim type:** Normative ("we should do X")
- **Hidden assumptions:** More features = more success; competitors won't act; market timing is flexible
- **Historical precedent:** Many products failed by over-engineering; many succeeded by shipping MVP fast
- **Logical validity:** Doesn't follow that delay improves outcome without evidence on feature-value tradeoff

The steelman and counter-argument, rendered as the deliverable in the Output format templates:

```
**Steelman (8 points, 12-16 words each):**

1. Shipping incomplete products damages brand reputation in ways that take years to recover from.
2. Customer acquisition cost is wasted if users churn due to missing core functionality they expected.
3. Apple's delayed product releases consistently outperform rushed competitors on customer satisfaction metrics.
4. The features we're adding directly address the top three complaints from our beta user research.
5. Critics ignore that our competitors have those features—parity is table stakes, not gold-plating.
6. Six months of development costs less than one year of customer support for a broken product.
7. Engineering teams lose motivation when forced to ship work they know is incomplete and buggy.
8. The real risk isn't delay—it's launching something we'll have to apologize for publicly later.

**Counter-Argument (8 points, 12-16 words each):**

1. This assumes we know which features matter—but only real users reveal what actually drives value.
2. Every month of delay is a month competitors can capture market share we'll never recover.
3. Amazon, Google, and Facebook all shipped embarrassingly incomplete v1 products that dominated their markets.
4. The argument conflates "more features" with "better product"—complexity often destroys rather than creates value.
5. Six months assumes accurate estimation—software projects routinely take 2-3x longer than predicted anyway.
6. We can add features after launch; we cannot add back the time lost to a delayed launch.
7. Customer feedback on a live product is worth more than six months of internal speculation.
8. The fundamental error: treating product development as a single bet rather than an iterative learning process.
```

## References

**This intent works best with:**
- Subagents (or several models) for the parallel persona calls; without them, personas are played in sequence.
- The `first-principles` skill (optional) for Deconstruct (decomposition) and Challenge (constraint classification).

`research` and `extract-wisdom` pairings are in `Integration.md`.
