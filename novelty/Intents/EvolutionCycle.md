# EvolutionCycle

An evolved portfolio of hard-to-vary causal explanations of a target phenomenon, not a brainstorm; phase names are defined in SKILL.md § Phase vocabulary.

## Ideal State

- The deliverable is an evolved portfolio of hard-to-vary explanations: each survivor has a traceable lineage, distinct causal hypothesis, explicit relation to the target phenomenon, and clear test status.
- Every survivor includes: target phenomenon; compact causal core; necessary roles; component-ablation and parameter-substitution counterfactuals; a rival comparison; a risky discriminating prediction; cross-context behavior; and remaining residue.
- The phenomenon and its evidence boundary are stated, drawn from the observations, anomalies, mechanisms, constraints, and serious rivals extracted from the input.
- The lineages show real variation reached selection: strange but structured causal hypotheses; candidates from counterfactuals, role reversals, scale changes, and causal leaps; independent disciplinary lenses collided without premature consensus; and recombined causal families with mutated assumptions, dependencies, scale, or time horizon.
- Each cross-domain mechanism transfer is deliberately imperfect and states its useful mismatch.
- Every candidate's test status records its challenge against observations, constraints, evidence, and feasible interventions.
- Explanatory selection under ExplanatorySelection.md and HardToVary.md happened before SELECT, and only constrained causal cores with necessary parts, distinctive counterfactuals, and risky discriminators advanced.
- The next population is seeded from survivors and useful mechanisms preserved from rejected lineages.
- The returned revised selection rule, with updated disciplines, mutations, and tests, reflects what survived and what was falsely attractive.
- The run stops when the cycle budget is exhausted, evidence decisively favors a portfolio, constraints rule out candidates, or marginal explanatory learning collapses, and it states the stopping condition and what would justify resuming.

## Anti-criteria

- Never returns a brainstorm in place of an evolved portfolio.
- Never advances a candidate that merely fits, relabels, or decorates the phenomenon; such candidates are demoted at explanatory selection.
- Never discards the useful mechanisms of rejected lineages.

## Output format

Return the phenomenon and evidence boundary; survivor portfolio with causal core, lineage, necessary components, hard-to-vary tests, and next experiment; wildcards and retired mechanisms; evolution report; and revised selection rule.

## Tool contract

The parts of a cycle that do not depend on each other (for example the DREAM, DAYDREAM and SALON lenses) may run at the same time: if your agent can run subagents, give each one its brief in parallel; otherwise run them one after another. Dependent steps stay in order, and the main session stays the only writer of the deliverable.
