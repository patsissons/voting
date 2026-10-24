// The admin and fetch routes, as functions over a RequestEvent so the thin
// pb_hooks/*.pb.js files stay one line each:
//
//   POST /_voting/ingest/{slug}[?official=1]   bearer VOTING_INGEST_TOKEN; the
//        raw results document as the body (the City's JSON, the Elections BC
//        page, or Alberta's feed). Why a push: results.vancouver.ca answers
//        403 to every non-browser client, so scripts/relay.ts drives a real
//        Chrome and posts each new snapshot here.
//   POST /_voting/source/{slug}?url=<page>      bearer token; sets (or, with
//        an empty url, clears) the page the server-side fetch pulls.
//   GET|POST /_voting/fetch[?slug=<slug>]       public: runs one fetch tick
//        and answers with per-election outcomes. A PocketHost webhook hits it
//        on election nights because the instance hibernates and misses cron
//        ticks; it only does what the next tick would do anyway. ?slug=
//        limits the tick to that election (404 when there is none).
//   GET|POST /_voting/early-vote[?slug=<slug>]  public: pulls each election's
//        early vote turnout before its polls close (server/early-vote.ts),
//        for a PocketHost webhook; throttled per election, so extra hits
//        cost nothing. ?slug= scopes it as it does the fetch.
import { pocketbaseDb } from './db.ts'
import { earlyVoteTick } from './early-vote.ts'
import { SLUG_RE, log, pocketbaseHttp, readBody, tokenProblem } from './http.ts'
import { fetchTick, scopeProblem, setSource, storeSnapshot } from './store.ts'

export function handleIngest(e: RequestEvent): void {
  const problem = tokenProblem(e)
  if (problem)
    return e.json(problem.status, {
      code: problem.code,
      message: problem.message,
    })
  const slug = e.request.pathValue('slug')
  if (!SLUG_RE.test(slug))
    return e.json(400, { code: 'bad_request', message: 'bad election slug' })
  // The query, not e.requestInfo(): that parses the body and refuses an HTML one.
  const official = e.request.url.query().get('official') === '1'
  const out = storeSnapshot(pocketbaseDb(e.app), slug, readBody(e), {
    official,
    log,
  })
  return e.json(out.status, out.body)
}

export function handleSource(e: RequestEvent): void {
  const problem = tokenProblem(e)
  if (problem)
    return e.json(problem.status, {
      code: problem.code,
      message: problem.message,
    })
  const slug = e.request.pathValue('slug')
  if (!SLUG_RE.test(slug))
    return e.json(400, { code: 'bad_request', message: 'bad election slug' })
  const url = String(e.request.url.query().get('url') || '').trim()
  const out = setSource(pocketbaseDb(e.app), slug, url)
  if (out.status === 200)
    log(`${slug} results source ${url ? `set to ${url}` : 'cleared'}`)
  return e.json(out.status, out.body)
}

export function handleFetch(e: RequestEvent): void {
  try {
    const db = pocketbaseDb(e.app)
    const only = String(e.request.url.query().get('slug') || '').trim()
    const problem = scopeProblem(db, only)
    if (problem) return e.json(problem.status, problem.body)
    return e.json(200, {
      elections: fetchTick(db, pocketbaseHttp, { log, only }),
    })
  } catch (err) {
    return e.json(500, {
      code: 'fetch_failed',
      message: (err as Error).message || String(err),
    })
  }
}

/** The cron body: one tick, logging only what changed or failed. */
export function cronFetch(): void {
  try {
    for (const row of fetchTick(pocketbaseDb($app), pocketbaseHttp, { log })) {
      if (row.ran && (row.error || row.status === 201))
        log(`fetch: ${JSON.stringify(row)}`)
    }
  } catch (err) {
    log(`fetch failed: ${(err as Error).message || err}`)
  }
}

export function handleEarlyVote(e: RequestEvent): void {
  try {
    const db = pocketbaseDb(e.app)
    const only = String(e.request.url.query().get('slug') || '').trim()
    const problem = scopeProblem(db, only)
    if (problem) return e.json(problem.status, problem.body)
    return e.json(200, {
      elections: earlyVoteTick(db, pocketbaseHttp, { log, only }),
    })
  } catch (err) {
    return e.json(500, {
      code: 'early_vote_failed',
      message: (err as Error).message || String(err),
    })
  }
}

/** The cron body (four times a day); the tick logs what it stored or what failed. */
export function cronEarlyVote(): void {
  try {
    earlyVoteTick(pocketbaseDb($app), pocketbaseHttp, { log })
  } catch (err) {
    log(`early vote failed: ${(err as Error).message || err}`)
  }
}
