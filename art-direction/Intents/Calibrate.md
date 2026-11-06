# Calibrate

Records the user's own verdict on one artifact as an appended calibration label.

## Ideal State

- An appended label preserves the user's own verdict and note against the exact artifact, with hash, mtime, date, and the adjacent critique median when available (a null median when the adjacent critique JSON is missing or malformed).
- The verdict is an integer 1–10 from the user, and the note keeps the user's own words.
- The label appends to `$AGENT_SKILLS_HOME/art-direction/labels.jsonl` (default `~/.agent-skills/art-direction/`) and existing labels remain intact.
- The label carries `pass` (the verdict is at or above `keeper_verdict` in the user's `Config.md`, default 7) and the `keeperVerdict` it was measured against.

## Anti-criteria

- Never fabricates a numeric verdict: if only qualitative feedback exists, a numeric verdict is requested instead.
- This tool never trains judges or alters the rubric automatically.

## Tool contract

```text
bun Tools/Calibrate.ts --artifact <file> --verdict <1-10> --note "<text>"
```

Label fields: `artifact`, `sha256`, `mtime`, `verdict`, `note`, `date`, `medianAtLabel`, `pass`, `keeperVerdict`. Success prints the label as JSON; errors exit 1.

To turn many labels into a taste profile the judges read (`Taste.json`), use the `calibrate` skill if it is installed; otherwise write the profile by hand in the shape `Tools/lib/taste.ts` validates.
