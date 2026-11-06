#!/usr/bin/env bun
/**
 * PerplexitySearch.ts - Perplexity Sonar API web research client
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt).
 *
 * Real-time, grounded web research with inline citations via Perplexity's Sonar
 * models. Returns a synthesized answer plus a numbered citation list. The research
 * skill's Perplexity slot (Quick, and part of Standard and up).
 *
 * Usage (from the skill folder):
 *   bun Tools/PerplexitySearch.ts "<query>"
 *   bun Tools/PerplexitySearch.ts --model perplexityPro "<query>"
 *   bun Tools/PerplexitySearch.ts --model perplexityReasoning "<query>"
 *   bun Tools/PerplexitySearch.ts --recency week "<query>"
 *   bun Tools/PerplexitySearch.ts --system "You are a ..." "<query>"
 *   bun Tools/PerplexitySearch.ts --json "<query>"
 *
 * Models (lanes below; PERPLEXITY_MODEL overrides the default lane):
 *   perplexity           Fast, grounded, real-time web (default)
 *   perplexityPro        Higher quality, deeper synthesis
 *   perplexityReasoning  Chain-of-thought reasoning + citations
 *
 * Options:
 *   --model <lane|id>  a lane (perplexity, perplexityPro, perplexityReasoning) or a raw Sonar id (default: perplexity)
 *   --recency <span>   Freshness filter: hour | day | week | month | year
 *   --system <prompt>  Override the system prompt
 *   --max-tokens <n>   Cap output tokens (default: 2048)
 *   --json             Emit parsed JSON (content, citations, usage)
 *
 * Environment (real env vars, or $AGENT_SKILLS_HOME/.env):
 *   PERPLEXITY_API_KEY   Perplexity API key (required)
 *   PERPLEXITY_MODEL     Optional default model id
 *
 * Exit codes: 0 ok, 1 error (missing key, API failure, empty response)
 */

import { getEnv } from './_portable/paths.ts'

const colors = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
}

/** Model lanes; ids live here only. */
const LANES: Record<string, string> = {
  perplexity: 'sonar',
  perplexityPro: 'sonar-pro',
  perplexityReasoning: 'sonar-reasoning',
}

const API_URL = 'https://api.perplexity.ai/chat/completions'
const DEFAULT_MODEL = getEnv('PERPLEXITY_MODEL') ?? LANES.perplexity

interface Parsed { content: string; citations: string[]; usage: any }

function parseArgs(argv: string[]) {
  const opts = {
    model: DEFAULT_MODEL,
    recency: '',
    system: 'Be precise and concise. Include inline citations.',
    maxTokens: 2048,
    json: false,
  }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--model') { const v = argv[++i]; opts.model = LANES[v] ?? v }
    else if (a === '--recency') opts.recency = argv[++i]
    else if (a === '--system') opts.system = argv[++i]
    else if (a === '--max-tokens') opts.maxTokens = parseInt(argv[++i], 10) || opts.maxTokens
    else rest.push(a)
  }
  return { opts, query: rest.join(' ').trim() }
}

async function perplexity(apiKey: string, query: string, opts: ReturnType<typeof parseArgs>['opts']): Promise<Parsed> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: query },
    ],
    max_tokens: opts.maxTokens,
    temperature: 0.2,
    return_citations: true,
    return_images: false,
  }
  if (opts.recency) body.search_recency_filter = opts.recency

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  const data = await res.json() as any
  if (!res.ok || data.error) {
    throw new Error(typeof data.error === 'string' ? data.error : (data.error?.message || `HTTP ${res.status}`))
  }

  const content = data.choices?.[0]?.message?.content ?? ''
  const citations = Array.isArray(data.citations) ? data.citations : []
  return { content: content.trim(), citations, usage: data.usage ?? {} }
}

const USAGE = `Usage: bun Tools/PerplexitySearch.ts [options] "<query>"

Options:
  --model <name>     perplexity | perplexityPro | perplexityReasoning (lanes; default: perplexity)
  --recency <span>   hour | day | week | month | year      (bias toward fresh sources)
  --system <prompt>  override the system prompt
  --max-tokens <n>   cap output tokens (default: 2048)
  --json             machine-readable output
  -h, --help         this message — costs nothing, sends no request`

async function main() {
  const argv = process.argv.slice(2)

  // --help must NEVER reach the API: an unguarded --help is parsed as a query and
  // billed as a live call. A usage probe has to be free, or nobody will run it.
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    process.exit(argv.length === 0 ? 1 : 0)
  }

  const { opts, query } = parseArgs(argv)
  const apiKey = getEnv('PERPLEXITY_API_KEY')

  if (!apiKey) {
    console.error(`${colors.red}Error: PERPLEXITY_API_KEY is not set (export it or add it to $AGENT_SKILLS_HOME/.env)${colors.reset}`)
    process.exit(1)
  }
  if (!query) {
    console.error(`${colors.red}Error: no query provided${colors.reset}`)
    console.error(USAGE)
    process.exit(1)
  }

  let result: Parsed
  try {
    result = await perplexity(apiKey, query, opts)
  } catch (e: any) {
    console.error(`${colors.red}Perplexity API error: ${e.message}${colors.reset}`)
    process.exit(1)
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (!result.content) {
    console.error(`${colors.red}Error: empty response from Perplexity${colors.reset}`)
    process.exit(1)
  }

  console.log(result.content)
  if (result.citations.length) {
    console.log(`\n${colors.dim}Sources:${colors.reset}`)
    result.citations.forEach((u, i) => console.log(`${colors.dim}[${i + 1}]${colors.reset} ${u}`))
  }
}

if (import.meta.main) main()
