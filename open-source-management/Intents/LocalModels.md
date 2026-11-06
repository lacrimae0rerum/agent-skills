# LocalModels

Answers "what new open-source models should we pull onto the local box?" with evidence: what the Ollama library shipped recently, what the host already has, and what actually fits its VRAM.

## Ideal State

- The user reads one table and knows, for every recent library release: is it already on the box (exact or a variant build), does it fit on one card / across cards / not at all, and the exact `ollama pull` line for each one worth adding.
- The "latest and greatest" claim is backed by a live library read this session, never recall.
- Judgment (which candidates suit what the box is used for, what the model is known for, whether a fine-tuned or quantised variant exists yet) is added on top of the tool's table, which is the evidence, never in place of it.
- Web context on a release (what it is, license, notable benchmarks) is welcome, cited, and secondary to the live library read.

## Anti-criteria

- Nothing is recommended that is already present, cloud-only, or larger than the GPUs.
- No model is pulled without the user saying to pull it.

## Output format

Lead with the answer: which of the newest models are already on the box, then the short list worth pulling with one line each on why, then the pull commands and the disk total. The full table goes below that.

## Safety gates

- A pull is the user's decision: present the candidates and the exact commands, confirm the exact `ollama pull` lines with the user first, and pull only when told to. Pulls are tens of GB each; state the total against free disk.

## Tool contract

```bash
bun Tools/LocalModels.ts            # markdown table + candidates
bun Tools/LocalModels.ts --json     # for further processing
bun Tools/LocalModels.ts --limit 40 # deeper into the library
```

The host comes from `$AGENT_SKILLS_HOME/open-source-management/Config.md` (`## Local Model Host`). Full flags and column semantics: `Tools/LocalModels.help.md`.

## Gotchas

- Spoken or typed model names are often loose (a misheard family name, a missing size tag). Resolve the name against the library table before saying whether it exists or is present.
