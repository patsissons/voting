// POST /mcp: the whole request flow. Public and read-only, so there is no
// token; because PocketBase's default CORS answers any origin, a browser
// page on another site could otherwise drive the endpoint, so the Origin
// header is checked (absent, the instance's own, or localhost pass). GET
// and DELETE answer 405: no SSE stream, no sessions to end.
import { pocketbaseDb } from '../db.ts'
import { readBody } from '../http.ts'
import { shellOrigin, publicDir } from '../pages.ts'
import {
  BODY_LIMIT,
  describeServer,
  dispatch,
  ERR,
  errorResponse,
  parseBody,
} from './rpc.ts'
import { votingTools } from './tools.ts'

export const INSTRUCTIONS =
  "Read-only tools over the voting elections: list_elections first, then get_election for a document, latest_results and results_series for counts, closest_districts and changing_hands for a riding election, question_divisions for a referendum, results_series with metric seats and a chamber key for a chambers (results-only) election, and summary for the markdown page. Results are unofficial until marked official; stamps are wall-clock time in the election's zone."

/** Is this Origin allowed to call the endpoint? */
export function originAllowed(origin: string, host: string): boolean {
  if (!origin) return true
  const m = /^https?:\/\/([^/]+)/i.exec(origin)
  if (!m) return false
  const originHost = m[1].toLowerCase()
  if (originHost === String(host || '').toLowerCase()) return true
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(originHost)
}

export function methodNotAllowed(e: RequestEvent): void {
  e.response.header().set('Allow', 'POST')
  e.response.header().set('Cache-Control', 'no-store')
  return e.json(405, {
    code: 'method_not_allowed',
    message: 'the MCP endpoint accepts POST only',
  })
}

export function handleMcp(e: RequestEvent): void {
  const started = Date.now()
  e.response.header().set('Cache-Control', 'no-store')
  const fail = (status: number, code: string, message: string) => {
    console.log(`[mcp] - ${Date.now() - started}ms err:${code}`)
    return e.json(status, { code, message })
  }
  if (
    !originAllowed(
      e.request.header.get('Origin') || '',
      e.request.header.get('Host') || '',
    )
  )
    return fail(
      403,
      'forbidden_origin',
      'this origin may not call the MCP endpoint',
    )

  let parsed
  try {
    parsed = parseBody(readBody(e, BODY_LIMIT))
  } catch {
    console.log(`[mcp] - ${Date.now() - started}ms err:parse`)
    return e.json(400, errorResponse(null, ERR.PARSE, 'parse error'))
  }

  let origin: string
  try {
    origin = shellOrigin(toString($os.readFile(`${publicDir()}/index.html`)))
  } catch {
    origin = ''
  }
  const describe = describeServer({
    name: 'voting',
    title: 'Voting: vote compasses and live election results',
    instructions: INSTRUCTIONS,
  })
  let out
  try {
    out = dispatch(parsed.messages, parsed.batch, {
      module: votingTools,
      describe,
      ctx: { db: pocketbaseDb(e.app), origin },
    })
  } catch (err) {
    console.log(
      `[mcp] - ${Date.now() - started}ms err:internal ${(err as Error).message || err}`,
    )
    return e.json(500, { code: 'mcp_internal', message: 'dispatch failed' })
  }
  // One line per request; never arguments or results.
  console.log(
    `[mcp] ${out.methods.join(',') || '-'} ${Date.now() - started}ms ${out.errors ? `err:${out.errors}` : 'ok'}`,
  )
  if (out.status === 202) return e.noContent(202)
  return e.json(200, out.body)
}
