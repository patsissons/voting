// Request helpers for the hook routes: the bearer token on the admin routes,
// the raw body, and the $http wrapper the fetch uses. Everything here touches
// JSVM globals, so the tests stay with the pure store and route logic.
import type { Http } from './store.ts'

export const BODY_LIMIT = 4194304
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

export function readBearer(e: RequestEvent): string {
  const header = e.request.header.get('Authorization') || ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match ? match[1] : ''
}

/** Constant-time compare; hashing first so the inputs have equal length. */
export function checkToken(given: string, expected: string): boolean {
  if (!given || !expected) return false
  return $security.equal($security.sha256(given), $security.sha256(expected))
}

/** The ingest token problem for a request, or null when the bearer matches VOTING_INGEST_TOKEN. */
export function tokenProblem(
  e: RequestEvent,
): { status: number; code: string; message: string } | null {
  const expected = $os.getenv('VOTING_INGEST_TOKEN')
  if (!expected)
    return {
      status: 503,
      code: 'not_configured',
      message: 'VOTING_INGEST_TOKEN is not set',
    }
  if (!checkToken(readBearer(e), expected))
    return {
      status: 401,
      code: 'unauthorized',
      message: 'missing or wrong bearer token',
    }
  return null
}

export function readBody(e: RequestEvent, limit = BODY_LIMIT): string {
  try {
    return toString(e.request.body, limit)
  } catch {
    return ''
  }
}

/** $http.send as the fetch's Http. */
export const pocketbaseHttp: Http = {
  get(url, timeoutSeconds) {
    const res = $http.send({
      url,
      method: 'GET',
      headers: { accept: 'text/html,application/json,*/*' },
      timeout: timeoutSeconds,
    })
    return { status: res.statusCode, text: toString(res.body) }
  },
}

export const log = (message: string): void => console.log(`[voting] ${message}`)
