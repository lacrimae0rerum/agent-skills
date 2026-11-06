# Aphorisms

Status: `test -f "${AGENT_SKILLS_HOME:-$HOME/.agent-skills}/aphorisms/aphorisms.md" && echo ok` · optional

## What it does

Keeps your quote collection as one markdown file, finds quotes that fit a piece of writing, adds and researches quotes, and records each use so the same quote is not suggested again soon. It works out of the box on a small starter collection; your own collection and preferences make it yours.

## Fill in

Two files in `$AGENT_SKILLS_HOME/aphorisms/` (default `~/.agent-skills/aphorisms/`).

**1. `aphorisms.md`**, your collection. Copy the skill's `Database/aphorisms.md` there to start (`mkdir -p` the folder first). Once it exists every intent reads and writes it instead of the starter, and `Tools/Aphorisms.ts path` prints it.

**2. `PREFERENCES.md`**, four sections, all optional:

| Section | Meaning |
|---|---|
| `## Default use` | What the quotes are usually for and who reads them, e.g. "an opening quote for each edition of Alex Example's weekly newsletter; readers are engineers". |
| `## Philosophy themes` | What a good quote embodies, used for the Philosophical Alignment score, plus an optional list of content themes for FindAphorism's analysis. |
| `## Key thinkers` | A table of `Thinker`, `Focus`, `Priority sources`. Each thinker gets a section in `aphorisms.md`, and ResearchThinker starts from those sources. |
| `## Approved categories` | One `- Category Name` bullet per theme category you approved beyond SKILL.md § Taxonomy, e.g. `- Wisdom & Truth-Seeking`. `Aphorisms.ts check` accepts these as Theme Index headings. |

Neither file is required: without them the starter collection and the generic defaults stand, and the intent says so.

## Accounts and secrets

None. Thinker research uses the `research` skill when installed, else web search; edition URLs are read by `Tools/Aphorisms.ts fetch`.

## Prove it works

```bash
# from the skill folder
bun Tools/Aphorisms.ts path    # prints your aphorisms.md
bun Tools/Aphorisms.ts check   # OK on a well-formed collection
```
