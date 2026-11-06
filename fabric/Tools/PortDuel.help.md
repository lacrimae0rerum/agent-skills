# PortDuel.ts

Puts a Fabric port intent head to head with the upstream pattern it replaces, on held-out inputs written before the port.

```
bun Tools/PortDuel.ts <Intent> [--heldout <file>] [--concurrency N] [--generator-vendor anthropic|openai|any] [--judge-vendor anthropic|openai|any] [--out <dir>] [--json]
```

- Cases come from `Evals/HeldOut/<Intent>.json`: `{ "intent": "<Intent>", "cases": [{ "id", "pattern", "input" }] }`, at least three. `pattern` names the upstream pattern the case is compared against (a merged intent names a different sibling per case). An optional `expects` states what the requester wants, written from the user's stated preferences and the upstream deliverable, never from the port; the judge sees it beside the request.
- The same generator (a mid-level model, Anthropic by default: `--generator-vendor`) answers each case twice: with `Intents/<Intent>.md` as the system prompt and with `Patterns/<pattern>/system.md`.
- A pairwise judge (a high-level model, OpenAI by default: `--judge-vendor`) compares each pair in both orders, so the judge sits outside the generator's family. A winner that flips with the order is a tie and the case is marked unstable. Choosing the same vendor for both prints a warning; `any` takes whichever provider `Tools/_portable/inference.ts` finds first.
- Calls go through `Tools/_portable/inference.ts`: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (environment or `$AGENT_SKILLS_HOME/.env`), the `claude` / `codex` CLI, or `AGENT_SKILLS_LLM_CMD`. `AGENT_SKILLS_MODEL_MEDIUM` and `AGENT_SKILLS_MODEL_HIGH` pick the exact models. Every case sends its held-out input to those providers.
- Candidates and verdicts are kept under `$AGENT_SKILLS_HOME/fabric/duels/<Intent>/<timestamp>/` (default `~/.agent-skills/fabric/`), or under `--out <dir>`: per case `port.md`, `upstream.md` and `verdict.json`, plus `duel.json` for the run.

| Exit | Meaning |
|------|---------|
| 0 | the port won more than half the cases |
| 1 | it did not |
| 2 | no provider for the generator or judge, or a generation or verdict was unavailable for some case (no verdict) |
