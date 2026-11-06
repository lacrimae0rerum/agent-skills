# Explain

Status: nothing required · optional area list, learning record and spoken narration

## What it does

Explain teaches the topic in front of you, explains the fundamentals of any project or system you name, and quizzes you on them. Its Teach intent turns the topic your conversation has been working on into a live tutorial. Each beat is drawn as an ASCII diagram in the terminal and ends with one question for you; after the beats it quizzes you until the idea lands. The diagrams, the questions, the quizzes and the fundamentals explanations are text and need nothing. Spoken narration is an optional extra: it works only when your agent has a text-to-speech tool or you run a local voice service your agent can send text to. Without one, the lesson carries on as text.

## Fill in

All files are optional and live in `$AGENT_SKILLS_HOME/explain/` (default `~/.agent-skills/explain/`).

- `Areas.md`: your own list of areas, so names like "billing service" resolve without guessing. One row per area, for example:

  ```
  | area | path | docs | deploy command |
  |------|------|------|----------------|
  | billing-service | ~/code/billing | architecture notes in the repo | make deploy |
  ```

- `PREFERENCES.md`: tone, depth, quiz length, anything that overrides the defaults in the skill.
- `learning.jsonl`: created by the skill on the first run. It is the learning record: every explained set and every graded quiz answer, one JSON object per line. Delete it to start over.

## Accounts and secrets

None. Nothing leaves your machine unless you point narration at a voice service; if you do, the narration text goes to that service, so use only one you trust. Never put a secret value in `Areas.md` or in the learning record.

## Prove it works

Ask your agent "teach me DNS resolution" and expect an ASCII diagram, one question, then your answer driving the next beat. Then ask "/qf <area>" after an "/ef <area>" and check that `learning.jsonl` gained rows.
