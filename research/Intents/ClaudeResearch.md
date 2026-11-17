# ClaudeResearch

Web research on one question through the agent's own built-in web search (Claude's, when the agent runs on Claude), decomposed into parallel targeted sub-queries.

## Ideal State

- The answer rests on 4-8 targeted sub-queries, the original question among them, that together cover the angles this question needs (often background, current-year developments, technical detail, alternatives, expert analysis and implications).
- The answer includes findings from the sub-queries run through the agent's own web search and from follow-up searches on what those initial findings turned up.
- The answer is one comprehensive synthesis of all findings, from the first round and the follow-ups alike.

## Anti-criteria

- No more than 8 sub-queries are run from one decomposition.
- No API keys or paid research vendors are used: this intent is the agent's own web search only.
- No research runs without a research question; a missing question gets the usage line instead.

## Tool contract

Reached through this skill when the user asks for "claude research <question>" or for research with no API keys. Decompose the question into the sub-queries and run them with the agent's own web search: as parallel tool calls, or as parallel subagents if your agent can run them, otherwise one after another. No API keys are needed and usage is free. The follow-up searches run before the answer is written.

## Gotchas

- There is no standalone command file for this intent: the command path an older header named never existed in the payload. The only way in is this skill's intent routing.
