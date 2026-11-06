# agent-skills

Fer's agent skills. Each folder holds one skill: a `SKILL.md` with spec frontmatter, plus its
references, templates and tools. Every skill follows [PORTABILITY.md](PORTABILITY.md), so it
works in any agent that can read files and run commands (Claude Code, Codex, pi, Gemini CLI, ...).

## Use a skill

Skills are not active until you link them. Each active skill adds its description to every
session's context, so turn on only the ones you use:

```bash
tools/link.sh research first-principles     # link into ~/.agents, ~/.claude, ~/.codex, ~/.pi skills folders
tools/link.sh --unlink research             # remove our links
```

`link.sh` refuses to replace a folder that is already there. Some names clash with skills
you already have installed (`research`, `cloudflare`, `html`, `simplify`). Remove the
existing one first, or keep it.

Skills with tools need [bun](https://bun.sh) 1.2+. API keys come from environment variables
or `~/.agent-skills/.env`. Per-user data lives in `~/.agent-skills/<skill>/`; set
`AGENT_SKILLS_HOME` to move it. Each skill's `compatibility` field and Setup section list
what it needs.

## Skills

<!-- skills:start -->
| Skill | What it does |
|---|---|
| [annual-reports](annual-reports/SKILL.md) | Aggregate several hundred cybersecurity annual reports from CrowdStrike, Mandiant, IBM, Verizon, Microsoft, CISA, OWASP, Wiz, Palo Alto across 19+ categories... |
| [aperture-oscillation](aperture-oscillation/SKILL.md) | 3-pass scope oscillation that holds a question constant while shifting zoom — narrow/tactical, wide/strategic, then synthesis — to surface design tensions, s... |
| [aphorisms](aphorisms/SKILL.md) | Curated aphorism collection with CRUD: content-based matching, themed search, thinker research, and usage tracking to avoid repeating quotes |
| [art](art/SKILL.md) | Static visual content in 20+ formats (diagrams, infographics, comics, icons, wallpaper) via Nano Banana Pro by default, Nano Banana, and Flux, plus technical... |
| [art-direction](art-direction/SKILL.md) | Directs visual quality across images, films, slides, documents and site captures through a direction council, two vendors' vision judgments against anchored ... |
| [arxiv](arxiv/SKILL.md) | Search and retrieve arXiv academic papers by topic, category, or paper ID — with AlphaXiv-enriched AI-generated overviews |
| [be-creative](be-creative/SKILL.md) | Single-pass divergent ideation via Verbalized Sampling: surfaces the strongest of several diverse candidates, or expands a seed corpus into an eval dataset |
| [bias-check](bias-check/SKILL.md) | Three-layer bias analysis of any URL, file, or text: fetches the content and cited studies, then audits data bias, source conflicts, and journalism distortions |
| [bitter-lesson-engineering](bitter-lesson-engineering/SKILL.md) | Audits any AI instruction set for over-prompting by asking whether a smarter model would make each rule unnecessary, then classifies every rule from CUT to KEEP |
| [brand](brand/SKILL.md) | The user brand integrity system: sweeps and refreshes brand/focus messaging across every public surface (GitHub profile README, blog, company site, marketing... |
| [bright-data](bright-data/SKILL.md) | 4-tier page fetching that moves from plain curl to curl with declared headers to a real browser (the agent's browser tools) to Bright Data's managed fetch pr... |
| [broadcast](broadcast/SKILL.md) | Multi-platform social syndication CLI: post text and media to X, LinkedIn, Bluesky and Instagram from one command, with per-platform limits, a --dry-run prev... |
| [cloudflare](cloudflare/SKILL.md) | Deploys and manages Cloudflare Workers, Pages, KV, R2, D1, DNS, and Queues with the cf CLI, converts Wrangler projects to cf, and authors MCP servers as Work... |
| [council](council/SKILL.md) | Multi-agent collaborative debate producing visible round-by-round transcripts with real intellectual friction — members are topic-briefed personas (parallel ... |
| [crime-stats](crime-stats/SKILL.md) | Pulls US city crime statistics from public sources (FBI crime data, city police data portals, state open-data portals, rate aggregators): rates per 100K, yea... |
| [data-refresh](data-refresh/SKILL.md) | Keeps your data-backed public sites and their source datasets current from a registry you configure: freshness check, source repull, rebuild, gated deploy, l... |
| [detect-ai](detect-ai/SKILL.md) | Detects AI-generated writing: heuristic audit against known AI patterns, statistical signals (entropy, burstiness), an empirical Pangram score, and a keyless... |
| [excalidraw](excalidraw/SKILL.md) | Sketches ideas as hand-drawn Excalidraw diagrams on a live local canvas via the pinned mcp-excalidraw-server CLI, with mermaid conversion, file I/O, and shar... |
| [explain](explain/SKILL.md) | Keeps the user current on the fundamentals of what is going on in the user's projects, work and technical infrastructure: interactive lessons (optionally spo... |
| [extract-wisdom](extract-wisdom/SKILL.md) | Content-adaptive wisdom extraction (sections built around what the content holds, five depth levels, mandatory contrarian takes) and extract alpha (the N hig... |
| [fabric](fabric/SKILL.md) | Runs Fabric prompt patterns natively from Patterns/ (240+), plus our ideal-state ports of the most-used ones: each port is an intent with its own code checke... |
| [first-principles](first-principles/SKILL.md) | Physics-based reasoning framework (Musk methodology) that deconstructs a problem to irreducible fundamental truths, classifies every element as hard constrai... |
| [flowsint-ontology](flowsint-ontology/SKILL.md) | Extract entities (nodes) and their relationships (edges) from any input - open sources (OSINT), documents, conversations, findings, tool output, datasets - a... |
| [herdr](herdr/SKILL.md) | Operates herdr, the third-party terminal workspace manager for coding agents, through its CLI and socket API; explains and edits the local herdr setup (confi... |
| [html](html/SKILL.md) | Renders the current session output as a self-contained, designed HTML artifact (one self-contained .html file) via a deterministic renderer that owns all lay... |
| [hyperframes](hyperframes/SKILL.md) | One-off semantic animations and animated explainers authored as HTML + GSAP on HyperFrames, directed by a meaning layer (MeaningMap then Direction, reviewed ... |
| [iterative-depth](iterative-depth/SKILL.md) | Structured multi-angle exploration running 2-8 sequential passes over the same problem, each through a different scientific lens, to surface hidden requireme... |
| [novelty](novelty/SKILL.md) | Evolutionary explanation-discovery engine for hard-to-vary causal theories of unknown phenomena |
| [open-source-management](open-source-management/SKILL.md) | Triages open issues, pull requests and GitHub Discussions across the user's own open-source repos (the list in Config.md) via the gh CLI, ranks what needs at... |
| [pareto](pareto/SKILL.md) | Maps any topic's zeitgeist and frontier — sweeps YouTube, GitHub, the web and the `research` skill, ranks everything down to the vital few by relevance, reac... |
| [prompting](prompting/SKILL.md) | Meta-prompting standard library for generating, optimizing, and composing prompts programmatically via Standards, Handlebars Templates, and Tools; output is ... |
| [red-team](red-team/SKILL.md) | Adversarial analysis deploying parallel expert agents to stress-test ideas, strategies, and plans — attacks atomic claims, then steelmans and counter-argues,... |
| [research](research/SKILL.md) | Multi-vendor web research with verified URLs and confidence-tagged output at four depths (Quick, Standard, Extensive, Deep Investigation) |
| [root-cause-analysis](root-cause-analysis/SKILL.md) | Structured incident investigation using Five Whys, Fishbone, blameless Postmortem, Fault Tree, Kepner-Tregoe, and FMEA — traces failures to systemic root cau... |
| [science](science/SKILL.md) | The scientific method for understanding a problem: a goal locked before evidence, plural falsifiable hypotheses, and the cheapest evidence that tells them ap... |
| [security-market-data](security-market-data/SKILL.md) | Query curated cybersecurity market and company intelligence |
| [security-updates](security-updates/SKILL.md) | Aggregates and curates security news from six authoritative sources into a ranked, deduplicated digest across Security News, Research, and Ideas, with statef... |
| [simplify](simplify/SKILL.md) | Research-first simplification of any file, skill, tool, subsystem or codebase against its ideal state: reads its spec or derives its purpose, maps every depe... |
| [speaking](speaking/SKILL.md) | Finds and tracks paid speaking opportunities that fit your own topics by scraping conference CFPs and speaker pages, ranks them by fit and urgency with deadl... |
| [spotify](spotify/SKILL.md) | Acts on the user's Spotify account via a deterministic CLI (Tools/Spotify.ts): search, playlists, now-playing, library, and playback across devices |
| [story-explanation](story-explanation/SKILL.md) | Generates narrative explanations in the user's first-person voice, from 3-part narrative to CSE numbered points, each a standalone social-ready thought |
| [stripe](stripe/SKILL.md) | Runs Stripe billing operations via the Stripe SDK and, when configured, an admin dashboard's cached endpoints: products, prices, subscriptions, MRR and reven... |
| [superior](superior/SKILL.md) | Thinking skill for big problems that swaps the solver: reads the scope it was given, infers the scope the asker most likely means, maps that, then asks how a... |
| [systems-thinking](systems-thinking/SKILL.md) | Structural analysis of complex systems — Iceberg model, Causal Loop feedback diagrams, archetype matching, Meadows leverage points, and concept maps — ground... |
| [threat-model](threat-model/SKILL.md) | Defensive threat modeling of your own estate from a user-provided inventory: sensitive-data map, trust boundaries and prompt-injection surfaces, compromise s... |
| [us-stats](us-stats/SKILL.md) | Query the configured long-run US almanac (90+ annual series on economy, debt, cost of living, health, crime, family, trust, energy, many back to the 1940s: t... |
| [visualize](visualize/SKILL.md) | Visualizes anything at all and never declines — a codebase, a physical setup, a timeline, a process, finances, a comparison, a concept, a URL, a dataset — as... |
| [wastewater-ca](wastewater-ca/SKILL.md) | Pull California population-level pathogen surveillance from CDC NWSS and CDPH/CHHS Open Data — SARS-CoV-2, Influenza A/B, RSV, Mpox, Norovirus, H5, Candida a... |
| [webdesign](webdesign/SKILL.md) | Designs and integrates web interfaces via DirectDesign (inline, Anthropic frontend-design philosophy, the default) or NativeDesign (/design artboards plus /d... |
| [write-story](write-story/SKILL.md) | Scaffolds a story the writer already wants to tell, deriving structure, wound, theme, and prose from their own notes across seven narrative layers, short sto... |
| [writing](writing/SKILL.md) | Authors and assembles prose from the user's material, writes in the user's own voice against a measured corpus model, audits and fixes AI-writing patterns, s... |
| [x-twitter](x-twitter/SKILL.md) | Runs all X (Twitter) operations via X API v2 and the xurl CLI: post tweets and threads with media (each post confirmed by the user first), publish X Articles... |
<!-- skills:end -->

## Maintain

```bash
python3 tools/lint.py [skill ...]   # portability check (frontmatter, references, imports, bun build)
python3 tools/lint.py --sync-lib    # copy tools/portable-lib/ into every Tools/_portable/
python3 tools/index.py              # rebuild the table above
```

- Add a skill: create `<name>/SKILL.md` (`name` = folder name), pass `tools/lint.py <name>`,
  run `tools/index.py`.
- Shared TypeScript helpers (paths, `.env`, LLM calls through any provider) live in
  `tools/portable-lib/`. Skills carry byte-identical copies in `Tools/_portable/`.
- A skill with `license: MIT (see LICENSE.txt)` includes third-party MIT code. Keep its
  `LICENSE.txt`: the license requires the copyright and permission notice in every copy.
