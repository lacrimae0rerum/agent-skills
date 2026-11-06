# Public site launch completeness

A public-site build includes its launch infrastructure. The visual page alone is not the finished deliverable. This applies to new public sites and requests to complete an existing launch, not isolated components or local mockups.

## Required outcome

The project's spec (its acceptance criteria) contains independently verifiable criteria for these outcomes before implementation:

- The site's identity survives tabs, bookmarks, phone shortcuts, and sharing: logo, SVG/favicon fallback, touch icon, appropriately sized raster social card, and resolving head references. Open Graph and X metadata use the canonical origin and include descriptive image alt text. The manifest, robots policy, and sitemap match the site's actual routes and intended indexing.
- Build and sanctioned deploy commands assert the emitted output, including asset formats/dimensions, local references, canonical metadata, and analytics source identity. Assertions use the real output directory from the project's configuration. Source-file existence does not prove packaging.
- Every applicable registration and integration in the installation's operational rules is complete and verified against its live authority. The project's own test suite or launch checklist carries the actual probes and runs with one command; source registration and cloud deployment are separate criteria.
- Browser evidence covers the rendered assets and the page at desktop/mobile widths. Analytics evidence covers the actual pageview and engagement path plus its reporting destination. Security evidence covers the curated deployed target, relevant protected/data paths, and headers. Missing verifiers remain visibly open.
> Run code rows with the project's test runner (e.g. `bun test ./<path>`); eval-suite rows can use the `assay` skill when it is installed.

## Installation-specific sources

Use the user's own operational rules: the project's deploy and contributing docs and, when present, the `## Deployment` and `## Registration` sections of `$AGENT_SKILLS_HOME/webdesign/PREFERENCES.md`. Deployment owns brand and deploy requirements; Registration owns the full same-motion registration checklist (project discovery, any public mirror obligation, all analytics registries). Read those sections in full. They are the single source for mutable installation details, not this skill. When none exist, ask the user which registrations and integrations apply before writing the criteria.

The build is prepared and verified before approval is requested for any action held by the existing authorization policy. A held deployment leaves live-dependent criteria open and names the exact remaining action. This intent grants no new publication, credential, or infrastructure permissions: every deploy, publish or registration with outside effect waits for the user's explicit confirmation of that exact action.
