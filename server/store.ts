// The one path that turns a raw results document into a `results` row,
// shared by the relay's push (the ingest route) and the server-side fetch,
// plus the fetch itself.
//
// storeSnapshot normalizes the body (shared/parsers), rejects one from
// another election, marks an official count's winners, and stores one row
// per distinct source stamp; a repeat, or a row the other writer stored a
// moment earlier (the unique (election, source_ts) index), is a no-op. A
// payload with a "sig" (Alberta's referendum feeds, civicAPI) is skipped
// when the newest stored row has the same counts, and only the newest row
// keeps its detail (per-division rows, or every contest for civicapi):
// storing a new one strips it from the row before.
//
// fetchTick runs shouldFetch (shared/fetch-policy) over every election with
// a results source and fetches the ones due: one page per question for an
// eab-ref election, one race document per chamber for a civicapi election
// (all or nothing: a chamber that fails fails the tick), else the source
// itself, following a retired Alberta dashboard version to the current one.
import { checkSource, shouldFetch } from '../shared/fetch-policy.ts'
import {
  dashSource,
  markOfficial,
  normalize,
  stripDetail,
} from '../shared/parsers/index.ts'
import { PAYLOAD_SCHEMA_VERSION } from '../shared/payload.ts'
import type { Payload } from '../shared/payload.ts'
import { isFeedError } from '../shared/payload.ts'
import { configProblems } from '../shared/config-guard.ts'
import type { Election } from '../shared/schema/election.ts'
import { electionOf, payloadOf, UniqueError } from './db.ts'
import type { Db, Row } from './db.ts'

export type Reply = { status: number; body: Record<string, unknown> }
const reply = (status: number, body: Record<string, unknown>): Reply => ({
  status,
  body,
})

export type Logger = (message: string) => void

/** The outbound HTTP the fetch needs; the real one wraps $http.send. */
export interface Http {
  get(
    url: string,
    timeoutSeconds: number,
  ): { status: number; text: string; lastModified?: string }
}

/** A PocketBase date field value for a time. */
export const nowStamp = (ms: number) =>
  new Date(ms).toISOString().replace('T', ' ')

/** The election document for a row, or a reply explaining why not. */
export function loadConfig(row: Row): { config: Election } | { error: Reply } {
  const config = electionOf(row)
  const problems = configProblems(config)
  if (problems.length)
    return {
      error: reply(500, {
        code: 'no_config',
        message: `the election config is incomplete: ${problems.join(', ')}`,
      }),
    }
  return { config }
}

/** Normalizes and stores one raw results document for the election `slug`. */
export function storeSnapshot(
  db: Db,
  slug: string,
  raw: unknown,
  opts: { official?: boolean; log?: Logger; now?: number } = {},
): Reply {
  const election = db.electionBySlug(slug)
  if (!election)
    return reply(404, { code: 'not_found', message: `no election "${slug}"` })
  const loaded = loadConfig(election)
  if ('error' in loaded) return loaded.error
  const config = loaded.config

  let payload: Payload
  try {
    payload = normalize(raw, config)
  } catch (err) {
    const code = isFeedError(err) ? err.code : 'bad_feed'
    const status = code === 'project_mismatch' ? 409 : 400
    return reply(status, {
      code,
      message: String((err as Error).message || err),
    })
  }
  payload.official = !!opts.official
  markOfficial(payload)

  const unchanged = () =>
    reply(200, {
      ok: true,
      unchanged: true,
      source_ts: payload.asOf,
      polls: payload.polls,
    })
  if (db.resultByStamp(election.id, payload.asOf)) return unchanged()
  const previous = db.latestResult(election.id)
  if (payload.sig && previous) {
    const prior = payloadOf(previous)
    if (
      prior &&
      prior.sig === payload.sig &&
      !!prior.official === payload.official
    )
      return unchanged()
  }

  const record = db.newResult()
  record.set('election', election.id)
  record.set('source_ts', payload.asOf)
  record.set('sig', payload.sig || '')
  record.set('format', payload.format || config.results.format)
  record.set('official', payload.official)
  record.set('polls_closed', payload.polls.closed)
  record.set('polls_total', payload.polls.total)
  record.set('schema_version', PAYLOAD_SCHEMA_VERSION)
  record.set('payload', payload)
  record.set('fetched', nowStamp(opts.now != null ? opts.now : Date.now()))
  try {
    db.save(record)
  } catch (err) {
    // The relay and the fetch can race to the same stamp; the unique index
    // keeps one row and the loser is a repeat.
    if (err instanceof UniqueError) return unchanged()
    throw err
  }
  if (payload.sig && previous) {
    const stripped = stripDetail(payloadOf(previous))
    if (stripped) {
      previous.set('payload', stripped)
      db.save(previous)
    }
  }
  if (opts.log)
    opts.log(
      `${slug} snapshot ${payload.asOf}: ${payload.polls.closed}/${payload.polls.total} ${config.results.unit || 'polls'}`,
    )
  return reply(201, {
    ok: true,
    source_ts: payload.asOf,
    polls: payload.polls,
    id: record.id,
  })
}

export const bust = (url: string, now: number) =>
  `${url}${url.includes('?') ? '&' : '?'}_=${now}`

export type TickRow = {
  slug: string
  ran: boolean
  skipped?: string
  status?: number
  error?: string
  source?: string
} & Record<string, unknown>

/** One pass over every election with a results source: fetch the ones due and store what changed. */
export function fetchTick(
  db: Db,
  http: Http,
  opts: { now?: number; log?: Logger } = {},
): TickRow[] {
  const now = opts.now != null ? opts.now : Date.now()
  const log = opts.log || (() => {})
  const out: TickRow[] = []
  for (const election of db.electionsWithSource()) {
    const slug = election.getString('slug')
    const loaded = loadConfig(election)
    if ('error' in loaded) {
      out.push({ slug, ran: false, skipped: 'no_config' })
      continue
    }
    const config = loaded.config
    const results = config.results
    // A date field reads back as "2026-10-24 20:05:00.000Z" ('' when unset).
    const checked = Date.parse(
      election.getString('results_checked').replace(' ', 'T'),
    )
    const state = {
      source: election.getString('results_source'),
      checked: Number.isFinite(checked) ? checked : 0,
      official: db.hasOfficialResult(election.id),
    }
    const skip = shouldFetch(config, state, now)
    if (skip) {
      out.push({ slug, ran: false, skipped: skip })
      continue
    }

    election.set('results_checked', nowStamp(now))
    db.save(election)
    let error = ''
    let row: TickRow = { slug, ran: true }
    try {
      const pages = results.format === 'eab-ref' ? results.pages : undefined
      if (pages && pages.length) {
        // One page per question; a page that fails is left out (it parses as
        // not posted yet) rather than sinking the others.
        const doc: { fetchedAt: string; pages: { n: number; html: string }[] } =
          { fetchedAt: new Date(now).toISOString(), pages: [] }
        const failed: string[] = []
        const template = results.format === 'eab-ref' ? results.page || '' : ''
        for (const page of pages) {
          const url = state.source + template.replace('{event}', page.event)
          try {
            const res = http.get(bust(url, now), 20)
            if (res.status === 200)
              doc.pages.push({ n: page.n, html: res.text })
            else failed.push(`Q${page.n} ${res.status}`)
          } catch (err) {
            failed.push(`Q${page.n} ${(err as Error).message || err}`)
          }
        }
        if (!doc.pages.length) {
          error = `every page failed: ${failed.join(', ')}`
        } else {
          const stored = storeSnapshot(db, slug, JSON.stringify(doc), {
            now,
            log,
          })
          row = { ...row, status: stored.status, ...stored.body }
          if (stored.status >= 300)
            error = `${stored.body.code}: ${stored.body.message}`
          else if (failed.length)
            error = `some pages failed: ${failed.join(', ')}`
        }
      } else if (results.format === 'civicapi') {
        // One document per chamber, stored together or not at all.
        const races: Record<string, unknown> = {}
        const failed: string[] = []
        for (const key of Object.keys(results.races)) {
          const url = `${state.source}${results.races[key]}`
          try {
            const res = http.get(bust(url, now), 20)
            if (res.status === 200) races[key] = JSON.parse(res.text)
            else failed.push(`${key} ${res.status}`)
          } catch (err) {
            failed.push(`${key} ${(err as Error).message || err}`)
          }
        }
        if (failed.length) {
          error = `race fetch failed: ${failed.join(', ')}`
        } else {
          const stored = storeSnapshot(
            db,
            slug,
            { fetchedAt: new Date(now).toISOString(), races },
            { now, log },
          )
          row = { ...row, status: stored.status, ...stored.body }
          if (stored.status >= 300)
            error = `${stored.body.code}: ${stored.body.message}`
        }
      } else {
        let res = http.get(bust(state.source, now), 30)
        let stored =
          res.status === 200
            ? storeSnapshot(db, slug, res.text, { now, log })
            : null
        // Alberta's dashboard retired the feed's version: follow the page to
        // the current one, keep it as the source, and fetch once more.
        if (
          stored &&
          stored.body.code === 'stale_version' &&
          results.official
        ) {
          const page = http.get(bust(results.official, now), 20)
          const next =
            page.status === 200 ? dashSource(state.source, page.text) : ''
          if (next && !checkSource(config, next)) {
            election.set('results_source', next)
            db.save(election)
            log(`${slug} results source moved to ${next}`)
            row.source = next
            res = http.get(bust(next, now), 30)
            stored =
              res.status === 200
                ? storeSnapshot(db, slug, res.text, { now, log })
                : null
          }
        }
        if (!stored) {
          error = `source answered ${res.status}`
        } else {
          row = { ...row, status: stored.status, ...stored.body }
          if (stored.status >= 300)
            error = `${stored.body.code}: ${stored.body.message}`
        }
      }
    } catch (err) {
      error = `fetch failed: ${(err as Error).message || err}`
    }
    if (error) row.error = error
    if (error !== election.getString('results_error')) {
      election.set('results_error', error.slice(0, 500))
      db.save(election)
    }
    out.push(row)
  }
  return out
}

/** Sets or clears an election's results source for the fetch. */
export function setSource(db: Db, slug: string, url: string): Reply {
  const election = db.electionBySlug(slug)
  if (!election)
    return reply(404, { code: 'not_found', message: `no election "${slug}"` })
  const loaded = loadConfig(election)
  if ('error' in loaded) return loaded.error
  if (url) {
    const problem = checkSource(loaded.config, url)
    if (problem) return reply(400, { code: 'bad_source', message: problem })
  }
  election.set('results_source', url)
  election.set('results_error', '')
  election.set('results_checked', '')
  db.save(election)
  return reply(200, { ok: true, slug, source: url })
}
