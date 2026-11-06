# WritingConfig.ts

Reads the skill config at `$AGENT_SKILLS_HOME/writing/Config.md` (default `~/.agent-skills/writing/Config.md`; `WRITING_CONFIG` overrides the path) and reports whether the voice model is set up. `VoiceGate.ts` and `VoiceJudge.ts` import it; with no config they exit 2 and name `Setup.md`.

```bash
bun Tools/WritingConfig.ts status [--json]   # exit 0 configured, 1 not
bun Tools/WritingConfig.ts voice-dir         # print voice_dir; exit 2 when not configured
bun Tools/WritingConfig.ts path              # print the config path
```

| Request | Command |
|---|---|
| "is writing set up", "check the voice model" | `status` |
| "where is my voice model" | `voice-dir` |
| "where does the config go" | `path` |

`status` is configured when the config names a `voice_dir` holding `Corpus.md`, `Exemplars.md` and `VoiceProfile.json`. It also reports `PostExemplars.md` (needed only for short-form judging) and whether `corpus_cli` points at a file that exists. Keys and sections are documented in `Setup.md`.
