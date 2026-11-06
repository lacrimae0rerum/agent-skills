# Direction

Resolves a run's visual intent into `Direction.md` through a council of four art-director briefs.

## Ideal State

- `Direction.md` exists beside the run's `Brief.json`, a concrete visual argument that production can execute and critique can challenge.
- Four distinct art-director briefs, tailored to the artifact, existed before the synthesis, each naming a role, expertise, stance, and the outcome it defends, so their disagreement is productive.
- The synthesis names the selected direction, references, visual system, concrete professional standard, and rejected alternatives with reasons, and resolves disagreement into testable choices about composition, light, typography, art/diagram relationships, and motion appropriate to the medium.

## Anti-criteria

- The four briefs are never four copies of one prompt.

## Inputs

Constraints come from the brief and the anchored rubric (`../References/Rubric.md`).

## Tool contract

No dedicated direction CLI exists. Write the four briefs inline. If your agent can run subagents, run the four in parallel, each as a general-purpose subagent given only its own brief, the `Brief.json` and `../References/Rubric.md`; otherwise run them one after another in this session, finishing each brief's answer before reading the next brief. Use the most capable model available for the synthesis. The `council` skill, if installed, offers a fuller council method.

## Examples

Useful lenses are an editorial art director defending meaningful imagery, an information designer demanding structural diagrams and hierarchy, a motion director defending progression and rhythm, and a craft skeptic attacking template tells.
