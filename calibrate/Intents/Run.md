# Run

One calibration round, end to end: the user scores N blind outputs from 0 to 10, with optional notes, and they get back how the judge compares and what the taste profile learned.

## Ideal State

- The target is the one `discover` resolved from the user's words: the one clear match, used and named in one line, or the one they picked from the targets that cover the task. A task with nothing usable gets the two ways in (AddTarget or an eval suite from the `assay` skill) and no session.
- A page with N outputs opens in the user's browser within seconds of `calibrate N <task>`.
- The page shows the outputs blind (no judge scores on the page), text outputs with the prompt that produced them, and a 0–10 slider and a notes box on every item. The outputs are the user's real, shipped work, newest first: for an image target, the images of their most recent published documents, each captioned with the document title.
- Each session's labels were rescored with the taste that existed before they were given, before Distill ran, so agreement is reported on held-out labels and never on the data the taste was built from.
- After they submit, they get one short answer: agreement and kappa against the shared calibration floors, the cut-off that would match them best, which vendor tracks them better where there are two, the disagreements quoted with their own notes, and what changed in the taste profile.
- The round ends with a held-out measurement and an updated `Taste.json`.

## Anti-criteria

- The round never ends with the page still open or the server still running.
- Never a guessed target: the task is resolved through discovery.
- Never candidates, rejected rounds, or renders from other pipelines on the page, and never like/dislike alone as the interface.
- Never a label written on the user's behalf, including from something they said in chat.
- Never a rescore after Distill, which measures the taste on its own training labels.

## Output format

Lead with the held-out number: "the judge agreed with you on X of Y (kappa K)". Then the best cut-off vs the current bar, which vendor tracked better, the two or three sharpest disagreements quoted with the user's own note, and what Distill added or changed in the taste. Say plainly when the set is too small to earn calibration (fewer than two likes or two dislikes scored).

## Safety gates

- A target whose pool is not the user's real published work is fixed (`target.json` pools + `"selection": "newest"`) before any session opens.
- Opening the page is the requested action; `--open` uses the browser named by `browser` in `$AGENT_SKILLS_HOME/calibrate/Config.md` (the user's own browser profile), never a browser-automation profile. Without `--open`, give the user the URL from the ready line.
- The session process is the only server. Do not start a second one while one is open for the same target, and do not leave one running after submit or once the user says they are done (stop the background process).

## Tool contract

The user names the task in plain words ("calibrate social posts", "calibrate 24 story explanations"). With no task named, use the conversation's current work. Resolve it through discovery:

```bash
bun Tools/Calibrate.ts discover "<task in their words>" --json
```

- One candidate clearly matches and has outputs: use it and name it in one line.
- Several plausible: ask the user to pick, up to four options. Each option is labeled with the target name and describes what it covers and how many stored outputs it has. Put the recommended one first.
- Nothing usable (no match, or the match has no stored outputs): say so and offer the two ways in. One is a new target over existing files (AddTarget). The other is an eval suite for the task (the `assay` skill's CreateSuite, then one run to produce outputs).

```bash
# 1. Serve and open the page. Run it in the background if your agent can, and wait for it to exit;
#    otherwise run it in a second terminal and wait for the user to say they submitted.
bun Tools/Calibrate.ts session --target <t> --count <N> --open
#    stdout line 1: {"event":"ready","session":"S…","url":"http://127.0.0.1:…/"}
#    exit 0 + {"event":"submitted",…} when the user submits; exit 3 on timeout (their draft stays in the browser).

# 2. Held-out judge scores for the new labels, with the taste as it stood BEFORE them.
#    A labels-only target (no "brief", no "judge": "evals") prints {"event":"skipped"} and exits 0; say so in the answer.
bun Tools/Calibrate.ts rescore --target <t> --session <id>

# 3. Measure: this session (held out) and the whole label set.
bun Tools/Calibrate.ts report --target <t> --session <id> --rescored
bun Tools/Calibrate.ts report --target <t>
```

Then run `Intents/Distill.md` so the new notes reach the judge.

### Intent-to-Flag Mapping

| The user says | Flag |
|---|---|
| "calibrate" (no number) | none: the target's `count` (16 when the target sets none) |
| "calibrate 24", "the last 64", "show me 10" | `--count <N>` |
| "only ones the judge has scored" | `--scored-only` |
| "same set again" | `--seed <earlier session id>` (labeled images are still excluded) |
| anything else | defaults: 90-minute timeout, random loopback port |

The pool caps the count. A suite with 9 stored outputs gives a 9-item session, and the answer says so.
