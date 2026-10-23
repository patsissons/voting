// The early vote pull: before voting day, fetch each published election's
// results.earlyVote source (the UF Election Lab's per-state CSV) and keep the
// turnout in the row's `early_vote` column. Not in `config`, because
// `pnpm elections:push` rewrites that whole. Two triggers like the results
// fetch: an hourly cron while the instance is awake and GET/POST
// /_voting/early-vote for a PocketHost webhook. Each election is pulled at
// most once per EARLY_VOTE_THROTTLE_MS whatever hits the route, a pull that
// fails keeps the last good counts, and nothing is pulled once its polls
// close (the results page has moved on by then).
import { asEarlyVote } from '../shared/early-vote.ts'
import { parseEarlyVote } from '../shared/parsers/early-vote.ts'
import type { Db } from './db.ts'
import { bust, loadConfig, nowStamp } from './store.ts'
import type { Http, Logger } from './store.ts'

export const EARLY_VOTE_THROTTLE_MS = 15 * 60000

export type EarlyVoteRow = {
  slug: string
  ran: boolean
  skipped?: 'closed' | 'throttled'
  stored?: boolean
  unchanged?: boolean
  asOf?: string
  states?: number
  error?: string
}

/** One pass over the published elections with an early vote source. */
export function earlyVoteTick(
  db: Db,
  http: Http,
  opts: { now?: number; log?: Logger } = {},
): EarlyVoteRow[] {
  const now = opts.now != null ? opts.now : Date.now()
  const log = opts.log || (() => {})
  const out: EarlyVoteRow[] = []
  for (const row of db.publishedElections()) {
    const loaded = loadConfig(row)
    if ('error' in loaded) continue
    const config = loaded.config
    const early = config.results.earlyVote
    if (!early) continue
    const slug = config.slug
    if (now >= Date.parse(config.pollsClose)) {
      out.push({ slug, ran: false, skipped: 'closed' })
      continue
    }
    // A date field reads back as "2026-10-24 20:05:00.000Z" ('' when unset).
    const checked = Date.parse(
      row.getString('early_vote_checked').replace(' ', 'T'),
    )
    if (Number.isFinite(checked) && now - checked < EARLY_VOTE_THROTTLE_MS) {
      out.push({ slug, ran: false, skipped: 'throttled' })
      continue
    }
    row.set('early_vote_checked', nowStamp(now))
    try {
      const res = http.get(bust(early.source, now), 30)
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const modified = Date.parse(res.lastModified || '')
      const ev = parseEarlyVote(
        res.text,
        'regions' in config ? config.regions : [],
        new Date(Number.isFinite(modified) ? modified : now).toISOString(),
      )
      const prev = asEarlyVote(row.getString('early_vote'))
      // Without a Last-Modified the stamp is the pull's own, so only the
      // counts say whether anything moved.
      const same =
        !!prev &&
        prev.sig === ev.sig &&
        (!Number.isFinite(modified) || prev.asOf === ev.asOf)
      if (!same) row.set('early_vote', ev)
      row.set('early_vote_error', '')
      db.save(row)
      const states = Object.keys(ev.states).length
      if (same && prev)
        out.push({ slug, ran: true, unchanged: true, asOf: prev.asOf })
      else {
        log(
          `${slug} early vote ${ev.asOf}: ${ev.total.voted} ballots, ${states} states`,
        )
        out.push({ slug, ran: true, stored: true, asOf: ev.asOf, states })
      }
    } catch (err) {
      const error = String((err as Error).message || err).slice(0, 500)
      row.set('early_vote_error', error)
      db.save(row)
      log(`${slug} early vote failed: ${error}`)
      out.push({ slug, ran: true, error })
    }
  }
  return out
}
