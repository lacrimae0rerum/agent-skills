# Retrieve

**Contents:** Ideal State · Anti-criteria · Inputs · Tool contract · Output format · Examples · References

Hard-to-fetch content retrieved through a 3-layer ladder (built-in tools, a real browser session for pages you can open yourself, a data-product skill where the site's terms allow it) and archived with a record of the layers used. When a site blocks automated access, the intent stops and reports the block.

## Ideal State

- The content the user asked for is delivered, retrieved at the cheapest layer that works: Layer 1 built-in tools, Layer 2 a real browser session through the agent's browser tools (e.g. a Playwright or Chrome automation tool), if available (JavaScript-rendered pages, or pages behind the user's own signed-in session), Layer 3 the `bright-data` skill, or a platform-scraping skill if one is installed, for a documented data product on a site whose terms allow it. A higher layer appears only when the decision tree calls for it or the layer below failed with an error listed under Error Handling & Escalation.
- When the `Accept: text/markdown` probe returns a markdown body (it starts with YAML frontmatter `---` or a `# ` heading rather than `<!DOCTYPE`/`<html`), that body is the content, with no page-fetch pass on top.
- When a site refuses automated access (an explicit block, a CAPTCHA, a login wall, a robots.txt disallow or terms that forbid it), the user gets that reason, the URL, and the options that remain: the site's official API or data export, the user opening the page themselves, or skipping the source. No layer is used to get past the refusal.
- All retrieval work artifacts (raw scraped content, intermediate notes, error logs and retry attempts, draft extractions) are in the task's work folder `$AGENT_SKILLS_HOME/research/work/<slug>/` (default `~/.agent-skills/research/work/`), created with `mkdir -p` before writing so files never land in cwd, and they stay there with the task.
- On completion, the final content is in the history directory `$AGENT_SKILLS_HOME/research/history/YYYY-MM/YYYY-MM-DD_[description]/` (or a folder the user names) with `README.md` (template under Output format) recording which layers were used and why, the final extracted content and metadata, written there directly (no hook saves research output) and confirmed present with `ls -lah`.

## Anti-criteria

- Not used for simple requests without a signal of difficulty ("Read this page", "Get content from [URL]" and the like go to a plain page fetch directly), and not for research questions ("research X", "find information about X" go to the research skill).
- Working artifacts are never deleted from the work folder.
- A site's block, CAPTCHA, login wall or rate limit is never worked around; it is reported.

## Inputs

A URL or topic plus a signal of difficulty from the user, such as:
- "I can't get this content"
- "Having trouble retrieving this"
- "Site is blocking me"
- "Keeps giving me CAPTCHA"
- "Rate limited when trying to get this"
- "Tried to fetch but failed"
- "Need a JavaScript-rendered page read"
- "Need several pages from one site"

Routine requests with no such signal ("What does this site say", "Fetch this article", "Check this URL") go to a plain page fetch directly.

## Tool contract

```
Layer 1: Built-in tools (fast, simple)
  ↓ (page needs JavaScript rendering, or the user's own signed-in session)
Layer 2: the agent's browser tools, if available (a real browser profile, the page as it renders for the user)
  ↓ (many pages of one site, or a documented platform data product, and the site's terms allow it)
Layer 3: the `bright-data` skill, or a platform-scraping skill if one is installed (documented vendor products, used within the target site's terms)
```

### Decision tree

**Start with Layer 1 (built-in) if:**
- Simple public webpage
- Standard HTML content
- Quick one-off fetch

**Use Layer 2 (browser tools) if:**
- Layer 1 returned an empty shell because the page renders with JavaScript
- The page needs the user's own signed-in session and the user has asked for it

**Use Layer 3 (`bright-data` or Apify) if:**
- The task is a multi-page crawl or a platform data pull, and the site's terms and robots.txt allow it
- A documented vendor product fits the data (for example a search-results API or a platform actor)
- Need RAG-optimized content (markdown format for LLM processing)

### Error Handling & Escalation

**Layer 1 errors that move to Layer 2:**
- Empty content returned because the page is built client-side
- A page the user can open themselves and asked to have read

**Layer 1 or 2 refusals that stop the retrieval and are reported:**
- HTTP 403 or 401 that is a deliberate block
- HTTP 429 (rate limited): back off, then report if it persists
- CAPTCHA challenge or bot-check page
- Login wall the user did not ask to be used
- robots.txt disallow, or terms that forbid automated access

**Layer 3 failures are reported:**
- The vendor product returned no data or the site's terms do not allow the pull
- Requires manual intervention or login
- Legal or terms concerns with collecting the data

### Layer 1: Built-in Tools

**Pre-fetch: Markdown Content Negotiation (Cloudflare).** Sites behind Cloudflare (Pro+) that have enabled [Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) serve server-side converted markdown via `Accept: text/markdown`. Non-Cloudflare sites simply ignore the header -- zero downside. Same pattern as the pre-check in FourTierScrape.

```bash
curl -sL -H "Accept: text/markdown" "[URL]" | head -5
```

- Also check `Content-Type: text/markdown` header and `x-markdown-tokens` header
- Cloudflare may report `content-type: text/html` even when the body is markdown, so judge by the body format, not the header
- If body is HTML → proceed to a normal page fetch
- ~80% fewer tokens, a more accurate server-side conversion, and free

**Fetch the page** (the agent's page fetch tool, or `curl -sL`) for simple HTML pages, public content, one-off fetches:
```text
fetch https://example.com/page
  and extract the main article content and author name
```

**Search the web** when you have keywords but not URLs, then fetch the results:
```text
web search: latest React 19 features documentation (limit to react.dev when the tool allows a domain filter)
```

### Layers 2 and 3: the owning skills

The tool calls for these layers live with the skills that own them, so this intent names only the hand-off:

- **Layer 2, the agent's browser tools** (e.g. a Playwright or Chrome automation tool), if available. They drive a real browser profile so a JavaScript-rendered page, or a page behind the user's own sign-in, renders as it does for the user. Without them, report that the page needs rendering and offer the user opening it themselves.
- **Layer 3, the `bright-data` skill (if installed) and any platform-scraping skill installed beside it.** `bright-data` covers single-URL fetches, multi-page crawls and search-engine results through the vendor's documented products; a platform-scraping skill, where installed, covers platform actors for social, business and e-commerce data. Both are used within each target site's terms, with an honest user agent, and neither is used after a site has refused access.

### Work directory

`<slug>` is `$(date +%Y%m%d)-<kebab-topic>`, or the slug of the user's current task when one exists.

## Output format

**Working files (in the task's work folder):**
```
$AGENT_SKILLS_HOME/research/work/{slug}/
├── raw-content/
│   ├── page1.md (Layer 2 output)
│   ├── page2.md (Layer 2 output)
│   └── page3.md (Layer 2 output)
├── processed/
│   ├── combined-content.md
│   └── extracted-features.json
├── metadata.json (URLs, layers used, timestamps)
└── errors.log (failed attempts, escalations)
```

**History (permanent archive):**
```
$AGENT_SKILLS_HOME/research/history/2025-10/2025-10-26_react19-documentation/
├── README.md (retrieval documentation)
├── content.md (final extracted content)
├── metadata.json (sources, layers used, timestamps)
└── summary.md (key extracted information)
```

**README.md Template:**
```markdown
# Retrieval: [Site/Topic]

**Date:** YYYY-MM-DD
**Target:** [URLs or site description]
**Layers Used:** Layer 1 / Layer 2 / Layer 3

## Retrieval Request
[Original request]

## URLs Retrieved
- URL 1
- URL 2
- URL 3

## Layers & Tools Used
- Layer 1: page fetch (success/failed)
- Layer 2: browser tools (success/failed/not used)
- Layer 3: `bright-data` or a platform-scraping skill, product used (success/failed/not used)

## Challenges Encountered
- Access refused (block, CAPTCHA, login wall, rate limit): Yes/No, with the reason if yes
- JavaScript rendering: Yes/No

## Output Files
- content.md: Final extracted content
- metadata.json: Source tracking
- summary.md: Key information extracted

## Notes
[Any limitations, challenges, or follow-up needed]
```

## Examples

| Request | Path |
|---|---|
| "The page fetch returns an empty page for https://example.com/article" | Page fetch (Layer 1), then the agent's browser tools to render the page in a real browser |
| "Get content about React 19 from the top 5 search results" | A web search for the URLs and parallel page fetches on each; a page that refuses automated access is reported, not worked around |
| "This site shows me a CAPTCHA" | Report the CAPTCHA and the URL; offer the site's official API or data export, or the user opening the page themselves |

## References

### Layer Comparison Matrix

| Feature | Layer 1 (Built-in) | Layer 2 (Browser tools) | Layer 3 (`bright-data` / Apify) |
|---------|-------------------|-----------------------|------------------------------|
| Speed | Fast (< 5s) | Medium (10-30s) | Slower (30-60s) |
| JavaScript rendering | Limited | Full | Full |
| User's signed-in session | No | Yes, when asked | No |
| Batch operations | Manual | One page at a time | Crawls and batches |
| Search integration | Basic | No | Multi-engine (`bright-data`) |
| Specialized extraction | No | No | Yes (Apify actors) |
| Cost | Free | Free | Paid |
| Best for | Simple pages | Rendered or signed-in pages | Crawls and platform data within site terms |
