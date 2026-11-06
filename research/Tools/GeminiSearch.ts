#!/usr/bin/env bun
/**
 * GeminiSearch.ts - Google Gemini grounded-search client
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt).
 *
 * Multi-perspective web research via the Gemini API with Google Search grounding.
 * The research skill's Gemini slot (Standard and up).
 *
 * Why the REST API and not the `gemini` CLI: the CLI's non-interactive mode depends
 * on how the account authenticates (an OAuth login against a Workspace domain exits
 * with ProjectIdRequiredError unless GOOGLE_CLOUD_PROJECT is set), and switching the
 * CLI to api-key auth would change the user's own interactive session. The REST API
 * with an API key is deterministic and leaves the CLI as it was.
 *
 * Usage (from the skill folder):
 *   bun Tools/GeminiSearch.ts "<query>"
 *   bun Tools/GeminiSearch.ts --model <model-id> "<query>"
 *   bun Tools/GeminiSearch.ts --no-search "<query>"
 *   bun Tools/GeminiSearch.ts --json "<query>"
 *
 * Options:
 *   --model <id>       Gemini model id (default: GEMINI_MODEL, else the research default below)
 *   --pro              Use the deeper model (GEMINI_PRO_MODEL, else the pro default below)
 *   --no-search        Disable Google Search grounding (pure model answer)
 *   --system <prompt>  Prepend a system instruction
 *   --max-tokens <n>   Cap output tokens (default: 2048)
 *   --json             Emit raw API JSON
 *   -h, --help         Usage — costs nothing, sends no request
 *
 * Environment (real env vars, or $AGENT_SKILLS_HOME/.env):
 *   GOOGLE_API_KEY     Gemini API key (required)
 *   GEMINI_MODEL, GEMINI_PRO_MODEL, GEMINI_TIMEOUT_MS   optional overrides
 *
 * Exit codes: 0 ok, 1 error (missing key, API failure, empty response)
 */

import { getEnv } from './_portable/paths.ts'

const colors = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m',
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const RESEARCH_MODEL = getEnv('GEMINI_MODEL') ?? 'gemini-3.8-flash'
const PRO_MODEL = getEnv('GEMINI_PRO_MODEL') ?? 'gemini-4-argon'

const USAGE = `Usage: bun Tools/GeminiSearch.ts [options] "<query>"

Options:
  --model <id>       Gemini model id (default: ${RESEARCH_MODEL})
  --pro              Use the deeper model (${PRO_MODEL})
  --no-search        Disable Google Search grounding
  --system <prompt>  Prepend a system instruction
  --max-tokens <n>   Cap output tokens (default: 2048)
  --json             Emit raw API JSON
  -h, --help         this message — costs nothing, sends no request`

interface Opts {
  model: string
  search: boolean
  system?: string
  maxTokens: number
  json: boolean
}

function parseArgs(argv: string[]): { opts: Opts; query: string } {
  const opts: Opts = { model: RESEARCH_MODEL, search: true, maxTokens: 2048, json: false }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--model': opts.model = argv[++i] ?? opts.model; break
      case '--pro': opts.model = PRO_MODEL; break
      case '--no-search': opts.search = false; break
      case '--system': opts.system = argv[++i]; break
      case '--max-tokens': opts.maxTokens = Number(argv[++i]) || opts.maxTokens; break
      case '--json': opts.json = true; break
      default: rest.push(argv[i])
    }
  }
  return { opts, query: rest.join(' ').trim() }
}

interface Parsed { text: string; citations: string[]; raw: unknown }

async function gemini(apiKey: string, query: string, opts: Opts): Promise<Parsed> {
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: query }] }],
    generationConfig: { maxOutputTokens: opts.maxTokens, temperature: 0.2 },
  }
  // Google Search grounding is the reason this slot exists — a Gemini answer
  // without it is just another ungrounded model, not an independent research
  // substrate. Opt-out is explicit.
  if (opts.search) body.tools = [{ google_search: {} }]
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] }

  // The key rides the x-goog-api-key header, never the URL (URLs leak to logs,
  // history, and referrers).
  const res = await fetch(`${API_BASE}/${opts.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(getEnv('GEMINI_TIMEOUT_MS') ?? 120_000)), // long reasoning calls can run past two minutes
  })

  const data = await res.json() as any
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${res.status}`)
  }

  const cand = data.candidates?.[0]
  const text = (cand?.content?.parts ?? [])
    .map((p: any) => p.text ?? '')
    .join('')
    .trim()

  // Grounding metadata carries the sources the answer actually used. Unverified
  // URLs are the #1 research failure mode, so surface them rather than letting
  // the model paraphrase sources it never cited.
  const chunks = cand?.groundingMetadata?.groundingChunks ?? []
  const citations: string[] = chunks
    .map((c: any) => c.web?.uri || c.retrievedContext?.uri)
    .filter((u: unknown): u is string => typeof u === 'string')

  return { text, citations: [...new Set(citations)], raw: data }
}

async function main() {
  const argv = process.argv.slice(2)

  // --help must NEVER reach the API (an unguarded --help is parsed as a query and billed).
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    process.exit(argv.length === 0 ? 1 : 0)
  }

  const { opts, query } = parseArgs(argv)
  const apiKey = getEnv('GOOGLE_API_KEY')

  if (!apiKey) {
    console.error(`${colors.red}Error: GOOGLE_API_KEY is not set (export it or add it to $AGENT_SKILLS_HOME/.env)${colors.reset}`)
    process.exit(1)
  }
  if (!query) {
    console.error(`${colors.red}Error: no query provided${colors.reset}`)
    console.error(USAGE)
    process.exit(1)
  }

  let result: Parsed
  try {
    result = await gemini(apiKey, query, opts)
  } catch (e: any) {
    console.error(`${colors.red}Gemini API error: ${e.message}${colors.reset}`)
    process.exit(1)
  }

  if (opts.json) {
    console.log(JSON.stringify(result.raw, null, 2))
    return
  }

  if (!result.text) {
    console.error(`${colors.red}Gemini returned an empty response${colors.reset}`)
    process.exit(1)
  }

  console.log(result.text)
  if (result.citations.length) {
    console.log(`\n${colors.bold}Sources${colors.reset}`)
    result.citations.forEach((u, i) => console.log(`${colors.dim}[${i + 1}]${colors.reset} ${colors.cyan}${u}${colors.reset}`))
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`${colors.red}${e?.message ?? e}${colors.reset}`)
    process.exit(1)
  })
}
