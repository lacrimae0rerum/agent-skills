---
name: story-explanation
description: "Generates narrative explanations in the user's first-person voice, from 3-part narrative to CSE numbered points, each a standalone social-ready thought. USE WHEN story explanation, narrative summary, CSE, CSE5, tell as story, explain as a story, create a narrative, story format, summarize as story, explain in my voice, with links, with citations, abridged, explain this YouTube, explain this article. NOT FOR multi-source research (use `research`), writing original social posts or blog drafts, wisdom extraction (use `extract-wisdom`)."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ for Tools/CheckFormat.ts (offline, no keys). Optional: the fabric CLI (fabric -y / -u) to fetch YouTube transcripts and web text; no env vars."
---

# story-explanation

Turns any source (a YouTube video, a URL, a file, pasted text, or "this" for the current conversation) into a narrative explanation in the user's own first-person voice. It explores 5-7 framings, picks the strongest, and outputs in the format you ask for: a 3-part narrative, a links version with inline citations, a 5-line abridged version, or a numbered CSE/CSE5. Each point stands alone, so any one can be lifted straight to social media.

Every intent reads the source the same way. A YouTube URL (contains "youtube.com" or "youtu.be") is fetched as a transcript (`fabric -y <URL>` when the optional `fabric` CLI is installed; otherwise ask the user to paste the transcript, or use a transcript tool such as `yt-dlp --write-auto-subs`), any other URL (starts with http:// or https://) as its raw text (`fabric -u <URL>` when installed; otherwise the agent's fetch tool or `curl`, reading the page text itself), a file path by reading the file, pasted text as given, and previous output or "this" from the conversation.

Every format has a deterministic check. `bun Tools/CheckFormat.ts --format <format> [--lines N] [--words N]` reads the output from stdin or `--file`, exits 0 when it conforms and 1 with one violation per line when it does not; flags and per-format checks are in `Tools/CheckFormat.help.md`. It checks counts, numbering, headers, bullets, labels, periods, link placement and the default cliche list, never voice or fidelity.

| Intent | `--format` | Other flags |
|---|---|---|
| Create | `create` | none |
| CreateWithLinks | `links` | `--lines N` when the request named a length |
| CreateAbridged | `abridged` | none |
| Cse | `cse` | `--lines N`, and `--words N` when the request named a word count |
| Cse5 | `cse5` | none |

## Ideal State

- Every explanation is written in the user's first-person voice from the voice file and notes named in Config.md (the generic defaults when it is absent), never in the assistant's own register or another person's voice.
- The source was actually read before writing (a YouTube transcript, a web page's raw text, a file, pasted text or the conversation), and nothing in the explanation goes beyond it.
- The output is exactly the format and length the request named, with no commentary around it (`Tools/CheckFormat.ts` exits 0 on it), and each point or sentence is a complete thought that lifts to social media unedited.
- Several framings were explored, the explanation uses the one picked as strongest over the others, and someone who never saw the source can follow the idea from the explanation alone.
- When Config.md names an opinion-lookup command, the explanation agrees with the user's published position on the topic as that command reports it.

## Intent Routing

| Intent | Trigger | File |
|----------|---------|------|
| **Create** | "story explanation", default | `Intents/Create.md` |
| **CreateWithLinks** | "with links", "with sources" | `Intents/CreateWithLinks.md` |
| **CreateAbridged** | "abridged", "5-12 words per line" | `Intents/CreateAbridged.md` |
| **Cse** | "CSE", "comprehensive", `/cse`; where an install adds line-count shortcut commands, they call this intent with that line count | `Intents/Cse.md` |
| **Cse5** | "CSE5", "5 lines", `/cse5` | `Intents/Cse5.md` |

| File | Read when |
|------|-----------|
| `VoiceStyleGuide.md` | how the user's voice is applied, cliches to avoid |
| `NarrativeFraming.md` | Framing selection rule + angle palette |
| `OutputFormats.md` | choosing between the formats |
| `Patterns/` | the Create intent's 3-part narrative prompt (`Patterns/create_story_explanation/system.md`) |
| `Setup.md` | first-time setup of Config.md and the voice file |
| `Tools/` | checking an output against its format (`CheckFormat.ts`; flags in `CheckFormat.help.md`) |

## Data & Config

The user's voice and optional integrations live in `$AGENT_SKILLS_HOME/story-explanation/Config.md (default `~/.agent-skills/story-explanation/`)`; first-time setup is in [Setup.md](Setup.md). It names the voice file to write from, voice notes, an optional opinion-lookup command, an optional directory for saved explanations, and an optional explainer MCP tool. Read it before writing. The voice file it names is the canon for prose written as the user. When it is missing, say so once, point the user at `Setup.md`, and carry on with the generic defaults (first person, plain and conversational, no opinion lookup, nothing saved, the embedded prompt in `Intents/Cse.md` as the explainer); never borrow another person's voice.

## Setup

Optional. `Setup.md` covers the voice file, `Config.md` and the optional `fabric` CLI. Run `bun Tools/CheckFormat.ts` from the skill folder; it needs no install.

## Gotchas

- **CSE = N numbered points (default 8, 3-50, so 3 and 4 lines are valid). CSE5 = 5-point condensed version.** A 5-line shortcut is CSE at 5 lines; "CSE5" or "5 lines" is the CSE5 format, and "abridged" is the unnumbered 5-12-word format. Don't mix up the formats.
- **A web-fetch tool can return a model-made summary of a page instead of its text.** Fetch the page's raw text (`fabric -u`, or `curl` plus text extraction) so the explanation rests on the real wording.
- **Narrator's asides ('the way everyone does X', 'as anyone would') are vague filler.** These universalizing clauses speak for people in general instead of the source; cut them or make each claim specific to the source or to the user's own experience. The user reviews and owns anything posted under their name.

## Examples

**Example 1: YouTube video story explanation**
```
User: "create a story explanation for this video" [YouTube URL]
-> Invokes Create intent
-> Extracts the transcript
-> Returns 3-part narrative (opening/body/closing) in the user's voice
```

**Example 2: Story with inline links**
```
User: "story explanation with links for this article"
-> Invokes CreateWithLinks intent
-> Returns 25-sentence narrative with inline source citations
```

**Example 3: Abridged 5-line summary**
```
User: "give me an abridged 5-line summary of this" [URL]
-> Invokes CreateAbridged intent
-> Returns ultra-concise 5 lines (5-12 words each)
```

**Example 4: CSE with custom line count**
```
User: "/cse 12 leaky abstraction"
-> Invokes Cse intent
-> Returns 12-line numbered story explanation
```
