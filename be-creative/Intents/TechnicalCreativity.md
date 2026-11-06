# TechnicalCreativity

Diverse, non-obvious engineering solutions from two independent generators (two models or vendors when available), each with trade-offs and difficulty, and one justified recommendation.

## Ideal State

- The solution set merges 5 solutions from each of two independent generators (two different models or vendors when the agent can reach them, the strongest correctness-oriented model first), with duplicates dropped and each solution labelled with the generator that produced it.
- Solutions are mutually distinct approaches, not variations on one design.
- Every solution carries the five fields: core approach, the key non-obvious insight or cross-domain connection, trade-offs (performance, complexity, cost, maintainability), implementation difficulty 1-10 with the reason, and why it is not the default answer.
- The recommendation names one approach and justifies it against the stated constraints.
- The response follows the Output format.
- The recommended approach is one the user would not have written on the first pass and still fully answers the brief.

## Anti-criteria

- Generation never runs as a single pass of one model alone: a single model's "diverse" set shares that model's defaults. When only one model is reachable, run two separate passes with deliberately different framings (for example "minimise cost" and "minimise change to the existing system"), label the set as single-model, and say so in the response.
- Not used for writing, naming, or marketing angles; those go to the other intents.

## Tool contract

Technical ideas are judged by whether they work, so generation goes to the strongest correctness-oriented model, with a second model or vendor for contrast. If your agent can run subagents (optionally on different models), run the two generations in parallel; otherwise run them one after another. Each asks for 5 solutions with the five fields from the Ideal State:

```
System/role: You generate diverse, non-obvious technical solutions and state their trade-offs honestly.
Task: <problem + hard/soft constraints + measurable success criteria + the five fields from the Ideal State>
Run once per generator (generator A: strongest correctness-oriented model; generator B: a different model or vendor, or a differently framed pass).
```

## Output format

```markdown
## Creative Technical Solutions for: [Problem Name]

### Solution 1: [Descriptive Name] ([vendor])
**Core Approach:** [algorithm/architecture]
**Key Innovation:** [the insight or cross-domain connection]
**Trade-offs:** Performance / Complexity / Cost / Maintainability
**Implementation Difficulty:** [1-10 with explanation]
**Why Creative:** [non-obvious thinking or novel combination]

### Solution 2 … [repeat per solution]

## Recommendation
**Selected Approach:** [Name]
**Justification:** [why it best balances constraints and goals]
**Next Steps:** [1-3 action items]
```
