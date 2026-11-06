# InjectionSurfaceMap

Map every place someone else's text reaches the agent, what it can borrow once it's there, and what actually stands in the way.

## Ideal State

- `InjectionSurfaceMap.md` exists in the private data dir with every part the Output format names.
- The model has both halves, ingestion surfaces and capabilities, and ranks surfaces by whether something blocks between them and the context or only watches, never by which surface reaches the most; untrusted + persistent + nothing blocking is the top of the list, always.
- The top findings are in the register with `--threat "prompt injection"`, each scored by the capability it can borrow, not the sensitivity of the surface, with likelihood from the three questions under Output format.

## Anti-criteria

- Never treats a detector as a control: pattern scanning and a model instructed to notice manipulation are recorded as advisory, never as coverage.
- Ungoverned surfaces are never reported as a count alone.
- Absence from the census is never reported as absence of exposure.
- A real exposure never leaves the census because a row was removed: the inventory's `surfaces` list may gain or amend a surface, never lose one that still exists.
- A hand-built census (no inventory surfaces) is never presented without saying in the output that it is hand-built.

## Output format

`InjectionSurfaceMap.md` in the private data dir, containing:

1. **Census** — every ingestion surface with trust class, channel, persistence, and its control band (governed / advisory-only / ungoverned).
2. **Ungoverned list** — untrusted surfaces with no control at all between them and context, each named with its next control, not a shrug.
3. **Advisory-only list** — surfaces where the only thing standing there is a model-mediated rule or a fail-open hook, saying plainly that these do not stop anything.
4. **Persistence chains** — for each persistent surface, where the text lands and what later re-reads it. This is where one-shot injection becomes permanent.
5. **Capability gates** — the capabilities with no blocking or human gate on them, sorted irreversible-first.
6. **What the map cannot see** — surfaces not in the inventory.
7. **Risks** — the register IDs and scores of the top findings.

Likelihood is anchored to three things: can anybody author into the surface without an identity check, is the surface read automatically without a human in the loop, and does the content persist. All three yes is likelihood 4+.

## Tool contract

```bash
bun Tools/Inventory.ts validate            # the surfaces, capabilities and controls resolve
bun Tools/Inventory.ts injection           # surfaces + capabilities + control bands
bun Tools/Inventory.ts reach ingest:<id>   # what an injection there could drive
```

The data behind it: the `surfaces`, `capabilities` and `controls` lists in `inventory.json` (`References/Inventory.md`). Before the census, walk the tools and integrations the agent actually uses (web fetch, mail, chat, feeds, repos, MCP servers, memory, files other people can write) and propose any surface missing from the inventory to the user, so the census is not limited to what was written down last time.

Without inventory surfaces, enumerate surfaces by hand from the tools and integrations in use, and say in the output that the census is hand-built.

## Gotchas

The dangerous combination is the *lethal trifecta*: untrusted content, access to private data, and a way to send things out. Almost every surface in a personal AI system has all three, because they all converge on one context that holds every capability, which is why "which surface reaches the most" is a useless ranking.

- **An unauthenticated write path into a file the system later reads is an ingestion surface**, even when no model is anywhere near it at write time. Log files, ledgers, and datasets count.
- **Automatic reads outrank interactive ones.** A surface a human chose to open has a human in the loop. A poller, a cron sweep, or a background grader does not.
- **The narrowing question is the useful one.** For each surface, ask what capability it could be denied without losing the surface's value. A feed reader does not need publish. That is the remediation direction: narrow the deputy, not the text.
