# Web Scraping

Data scraped or crawled from web pages with the tool that fits the site, at an ethical pace.

## Ideal State

- The tool fits the site, per the Tool contract decision tree: simple pages are fetched with the agent's page fetch tool (or `curl`) first, a whole-site crawl goes to the `bright-data` skill, and a block or CAPTCHA is reported, and social media goes to a platform-scraping skill if one is installed.
- The requested data is extracted and returned: links as the href attributes of a page's <a> tags, product listings as each container's data (title, price, image, etc.), and multi-page crawls as the data from every detail page linked from the index or listing page.
- The scrape fetched no path robots.txt disallows, its requests were spaced with delays (`sleep 1`), an error on one page does not abort the returned results, and results are cached when possible.

## Anti-criteria

- Never scrapes too fast, ignores rate limits, or overwhelms servers.
- Never scrapes personal data without permission.
- Never bypasses access controls, logins or challenges; a site that refuses automated access is reported, not worked around.

## Tool contract

1. **Simple pages?** → Fetch the page first (the agent's page fetch tool, or `curl`)
2. **Whole-site crawl, or a page that needs rendering?** → use the `bright-data` skill if it is installed (FourTierScrape, Crawl), within the site's terms and robots.txt; for one rendered page, the agent's browser tools (e.g. a Playwright or Chrome automation tool), if available. **CAPTCHA, block or login wall?** → stop and report it.
3. **Social media, business listings, e-commerce?** → a platform-scraping skill if one is installed (its actor wrappers filter the dataset in code); otherwise report that no such skill is available
