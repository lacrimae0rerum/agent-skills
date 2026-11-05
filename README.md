# agent-skills

Fer's own agent skills. Each folder holds one skill: a `SKILL.md` with frontmatter, plus its
references and scripts. Agents load them from their skills folders through symlinks.

| Skill | Purpose |
|---|---|
| [flowsint-ontology](flowsint-ontology/SKILL.md) | Extracts entities and relationships from any input with the Flowsint taxonomy and ontology. Each extraction produces a JSON graph you can import into Flowsint, a GraphQL document, and a Markdown report. |

## Install

Link every skill into the agents' skills folders (Claude Code, Codex, pi, shared `~/.agents`):

```bash
cd ~/Projects/agent-skills
for s in */SKILL.md; do
  s=${s%/SKILL.md}
  for d in ~/.agents/skills ~/.claude/skills ~/.codex/skills ~/.pi/agent/skills; do
    mkdir -p "$d" && ln -sfn "$PWD/$s" "$d/$s"
  done
done
```

## Add a skill

1. Create `<name>/SKILL.md` (frontmatter `name` = folder name, plus a `description` that says when to use it).
2. Run the install loop.
3. Add a row to the table above.
