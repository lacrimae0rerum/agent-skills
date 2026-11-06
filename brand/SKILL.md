---
name: brand
description: "The user brand integrity system: sweeps and refreshes brand/focus messaging across every public surface (GitHub profile README, blog, company site, marketing site, repo READMEs, LinkedIn/X/YouTube bios) to current focus, names, star counts, and flagship writing, from one surface inventory in the user's own config file. USE WHEN brand update, update my brand, brand sweep, refresh my profiles, update my GitHub profile, github front page, profile README, my bios are stale, sync my messaging, update my ideas page, refresh the ideas page, ideas page on the blog. NOT FOR the content registry, writing blog posts, or social post copy."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+ for Tools/Check.ts (offline). Needs the gh CLI signed in and each site's own deploy credentials; no env vars of its own. Publishing steps always need the user's approval."
---

# Brand

A person's brand is spread across a dozen public surfaces that drift out of sync: old project names, stale focus statements, dead links, outdated writing lists. This skill is the one place that knows every surface, how each one updates, and what "current" means, so a single BrandUpdate run brings them all back into line.

**Source of truth for what the brand currently is:** the files listed under `## Source-of-truth reads` in `Surfaces.md` (focus and missions, what is live, bio facts) plus the freshest posts from the blog feed (`$BLOG_FEED`). Never duplicate those facts into this skill; read them at run time.

## Ideal State

- Every surface a run touches says what the user is focused on now, as read from the user's inventory and source-of-truth files at run time, never from memory or this skill.
- Nothing goes public under the user's name before they have seen the rendered result and approved that one surface.
- Every run ends with a table in its run report naming each surface or idea, what changed and the evidence, including what was left unswept or rejected.
- A missing or invalid `Surfaces.md` stops the run at `Check.ts` with a pointer to `Setup.md`; no surface is ever swept from guesses.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **BrandUpdate** | "brand update", "brand sweep", "update my GitHub profile", "refresh my bios/profiles" | `Intents/BrandUpdate.md` |
| **UpdateIdeasPage** | "update my ideas page", "refresh the ideas page", "parse my latest ideas" | `Intents/UpdateIdeasPage.md` |

| File | Read when |
|------|-----------|
| `Setup.md` | first-time setup, or `Check.ts` exits non-zero |

## Data & Config

Every personal fact (the public-surface inventory with URLs, repo paths, handles and update mechanisms; the ideas-page location and structure; the blog and feed facts `$BLOG_URL`, `$BLOG_FEED`, `$BLOG_REPO`; per-surface rules) lives in `$AGENT_SKILLS_HOME/brand/Surfaces.md` (default `~/.agent-skills/brand/`). This skill body is generic. User preferences, when present, live in `$AGENT_SKILLS_HOME/brand/PREFERENCES.md` and override the defaults here; when absent, the defaults stand.

Both intents start with `bun Tools/Check.ts` (run from the skill folder). It validates `Surfaces.md` and, when the file or a required section is missing, exits non-zero and points at the guide. **First-time setup: [`Setup.md`](Setup.md).**

## Setup

Create `Surfaces.md` once (see `Setup.md`); `bun Tools/Check.ts` validates it. Nothing to install.

## Gotchas

- Use the feed URL recorded in `Surfaces.md` (`$BLOG_FEED`). A blog's feed often lives somewhere other than the obvious paths (`/feed.xml`, `/rss.xml`, `/atom.xml`), so confirm the working one with `curl` before recording it.

## Examples

**Example 1: Full brand sweep**
```
User: "Run a brand update — everything feels stale"
→ BrandUpdate intent, full sweep
→ A drift table in the run report covers every inventory row; each fix went live only after the owner approved that surface
```

**Example 2: Single surface**
```
User: "Update my GitHub front page based on recent focus"
→ BrandUpdate intent, scoped to the GitHub profile surface
→ The README is pushed after approval of its GitHub render; every other surface is listed as unswept
```

**Example 3: Ideas page**
```
User: "Refresh the ideas page with my latest ideas"
→ UpdateIdeasPage intent
→ New user-original ideas are on the live page, verified by screenshot after an approved deploy; rejected captures are listed with reasons
```
