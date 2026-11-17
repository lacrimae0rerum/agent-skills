#!/usr/bin/env bun
/**
 * GrokQuery.ts - xAI Grok chat-completions client
 * Adapted from MIT-licensed code (see LICENSE.txt).
 *
 * The research skill's Grok slot: OpenAI-compatible chat completions against
 * api.x.ai, for what is being said on X. Public material only in the query, and
 * never a secret value (key, token, password).
 *
 * Usage (from the skill folder):
 *   bun Tools/GrokQuery.ts "<query>"
 *   bun Tools/GrokQuery.ts --model <grok id> "<query>"
 *   bun Tools/GrokQuery.ts --json "<query>"
 *
 * Options:
 *   --model <id>       Grok model id (default: GROK_MODEL, else the default below)
 *   --system <prompt>  Prepend a system instruction
 *   --max-tokens <n>   Cap output tokens (default: 2048)
 *   --json             Emit raw API JSON
 *   -h, --help         Usage — costs nothing, sends no request
 *
 * Environment (real env vars, or $AGENT_SKILLS_HOME/.env):
 *   XAI_API_KEY         xAI API key — direct api.x.ai. The only route: a broker
 *                       adds a party between the user and xAI, so there is no fallback.
 *   GROK_MODEL          optional model override
 *
 * Exit codes: 0 ok, 1 error (missing key, API failure, empty response)
 */

import { getEnv } from './_portable/paths.ts'

const colors = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', cyan: '\x1b[36m',
}

const XAI_URL = 'https://api.x.ai/v1/chat/completions'
const DEFAULT_MODEL = getEnv('GROK_MODEL') ?? 'grok-4.7'

const USAGE = `Usage: bun Tools/GrokQuery.ts [options] "<query>"

Never put a secret value (key, token, password) or private material in a prompt.

Options:
  --model <id>       Grok model id (default: ${DEFAULT_MODEL})
  --system <prompt>  Prepend a system instruction
  --max-tokens <n>   Cap output tokens (default: 2048)
  --json             Emit raw API JSON
  -h, --help         this message — costs nothing, sends no request`

interface Opts {
  model: string
  system?: string
  maxTokens: number
  json: boolean
}

function parseArgs(argv: string[]): { opts: Opts; query: string } {
  const opts: Opts = { model: DEFAULT_MODEL, maxTokens: 2048, json: false }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--model': opts.model = argv[++i] ?? opts.model; break
      case '--system': opts.system = argv[++i]; break
      case '--max-tokens': opts.maxTokens = Number(argv[++i]) || opts.maxTokens; break
      case '--json': opts.json = true; break
      default: rest.push(argv[i])
    }
  }
  return { opts, query: rest.join(' ').trim() }
}

interface Parsed { text: string; model: string; raw: unknown }

async function grok(apiKey: string, query: string, opts: Opts): Promise<Parsed> {
  const messages: Array<{ role: string; content: string }> = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  messages.push({ role: 'user', content: query })

  const res = await fetch(XAI_URL, {
    method: 'POST',
    // Auth rides the header, never the URL (URLs leak to logs and history).
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    // 4 minutes: Grok's reasoning on long prompts can run past 120 s.
    signal: AbortSignal.timeout(240_000),
    body: JSON.stringify({
      model: opts.model,
      messages,
      max_completion_tokens: opts.maxTokens,
      temperature: 0.2,
    }),
  })

  const data = await res.json() as any
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || data.error || `HTTP ${res.status}`)
  }

  const text = (data.choices?.[0]?.message?.content ?? '').trim()
  // Report the model the API says actually ran, not the one asked for —
  // a silent server-side substitution should be visible to the caller.
  return { text, model: data.model ?? opts.model, raw: data }
}

async function main() {
  const argv = process.argv.slice(2)

  // --help must NEVER reach the API (an unguarded --help is parsed as a query and billed).
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    process.exit(argv.length === 0 ? 1 : 0)
  }

  const { opts, query } = parseArgs(argv)
  const apiKey = getEnv('XAI_API_KEY')

  if (!apiKey) {
    console.error(`${colors.red}Error: XAI_API_KEY is not set (export it or add it to $AGENT_SKILLS_HOME/.env)${colors.reset}`)
    process.exit(1)
  }
  if (!query) {
    console.error(`${colors.red}Error: no query provided${colors.reset}`)
    console.error(USAGE)
    process.exit(1)
  }

  let result: Parsed
  try {
    result = await grok(apiKey, query, opts)
  } catch (e: any) {
    console.error(`${colors.red}Grok API error: ${e.message}${colors.reset}`)
    process.exit(1)
  }

  if (opts.json) {
    console.log(JSON.stringify(result.raw, null, 2))
    return
  }

  if (!result.text) {
    console.error(`${colors.red}Grok returned an empty response${colors.reset}`)
    process.exit(1)
  }

  console.log(result.text)
  console.log(`${colors.dim}model: ${result.model} · route: xai direct${colors.reset}`)
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`${colors.red}${e?.message ?? e}${colors.reset}`)
    process.exit(1)
  })
}
