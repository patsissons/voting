/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import { feedText, fixtureFeeds } from '../../scripts/fixtures/fixture.ts'
import {
  alberta,
  bc,
  bcEarlyVote,
  civicCounted,
  civicSample,
  fixture,
  tinyChambers,
  us,
  vancouver,
} from '../../scripts/fixtures/load.ts'
import { parseEarlyVote } from '../../shared/parsers/early-vote.ts'
import { memoryDb } from '../db.memory.ts'
import { storeSnapshot } from '../store.ts'
import { describeServer, dispatch, validateModule } from './rpc.ts'
import { call, fitRows, SERIES_MAX, tools, votingTools } from './tools.ts'

function seeded() {
  const db = memoryDb()
  for (const e of [vancouver(), bc(), alberta()]) {
    db.addElection(e)
    for (const feed of fixtureFeeds(e))
      storeSnapshot(db, e.slug, feedText(feed))
  }
  db.addElection({ ...vancouver(), slug: 'draft-2027', published: false })
  const tiny = tinyChambers()
  db.addElection(tiny)
  storeSnapshot(db, tiny.slug, civicSample())
  storeSnapshot(db, tiny.slug, civicCounted())
  return db
}
const ctx = { db: seeded(), origin: 'https://voting.lgtm.page' }
const run = (name: string, args: Record<string, unknown> = {}) =>
  call(name, args, ctx) as Record<string, any>
const fails = (name: string, args: Record<string, unknown>) => {
  try {
    call(name, args, ctx)
  } catch (err) {
    return (err as Error).message
  }
  return ''
}

describe('voting tools', () => {
  it('is a valid module with read-only tools', () => {
    expect(validateModule(votingTools)).toEqual([])
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true)
  })

  it('lists only published elections, newest first', () => {
    const out = run('list_elections')
    expect(out.elections.map((e: { slug: string }) => e.slug)).toEqual([
      'tiny-2026',
      'bc-2026',
      'alberta-2026',
      'vancouver-2026',
    ])
    expect(out.elections[1]).toMatchObject({
      ballot: 'district',
      page: 'https://voting.lgtm.page/bc-2026',
      results: { status: 'counting' },
    })
    expect(out.elections[3].results.status).toBe('count complete')
    expect(fails('get_election', { slug: 'draft-2027' })).toBe(
      'no published election "draft-2027"',
    )
  })

  it('returns a document or one of its sections', () => {
    expect(run('get_election', { slug: 'bc-2026' }).seats).toBe(93)
    expect(
      run('get_election', { slug: 'bc-2026', section: 'regions' }).value.length,
    ).toBe(7)
    expect(fails('get_election', { slug: 'bc-2026', section: 'nope' })).toMatch(
      /no section "nope"/,
    )
  })

  it('adds the pulled early vote to the document and the summary', () => {
    const db = memoryDb()
    const e = us()
    const ev = parseEarlyVote(
      fixture('voting-2026-early-vote.csv'),
      e.regions,
      '2026-10-23T19:25:09.000Z',
    )
    db.addElection(e, { early_vote: ev })
    const usCtx = { db, origin: 'https://voting.lgtm.page' }
    const doc = call('get_election', { slug: 'us-2026' }, usCtx) as any
    expect(doc.earlyVoteTurnout.total.voted).toBe(6071374)
    expect(doc.earlyVoteTurnout.partyTotals).toEqual({
      states: 3,
      voted: 4508296,
      party: { dem: 2067470, gop: 1308379, other: 1127492 },
      mail: { dem: 1554742, gop: 1021711, other: 711856 },
      inPerson: { dem: 512728, gop: 286668, other: 415636 },
    })
    expect(
      (
        call(
          'get_election',
          { slug: 'us-2026', section: 'earlyVoteTurnout' },
          usCtx,
        ) as any
      ).value.states.ga.voted,
    ).toBe(1497446)
    expect(call('summary', { slug: 'us-2026' }, usCtx)).toContain(
      '### Early vote so far',
    )
    expect(run('get_election', { slug: 'bc-2026' }).earlyVoteTurnout).toBe(
      undefined,
    )
  })

  it('adds a pushed advance vote by riding, with no party totals', () => {
    const db = memoryDb()
    db.addElection(bc(), { early_vote: bcEarlyVote() })
    const bcCtx = { db, origin: 'https://voting.lgtm.page' }
    const doc = call('get_election', { slug: 'bc-2026' }, bcCtx) as any
    expect(doc.earlyVoteTurnout.total).toMatchObject({
      voted: 891348,
      registered: 3738182,
      prior: 1001331,
    })
    expect(doc.earlyVoteTurnout.states.LAO).toMatchObject({
      voted: 17436,
      registered: 51098,
    })
    expect(doc.earlyVoteTurnout.partyTotals).toEqual({
      states: 0,
      voted: 0,
      party: {},
    })
    const summary = call('summary', { slug: 'bc-2026' }, bcCtx) as string
    expect(summary).toContain('### Advance voting')
    expect(summary).toContain(
      '| Ladysmith-Oceanside | 17,436 | 34.1% | +11.4% |',
    )
  })

  it('answers the latest results, whole or narrowed', () => {
    const whole = run('latest_results', { slug: 'vancouver-2026' })
    expect(whole.asOf).toBe('2026-10-17 23:40:00')
    expect(whole.contests.length).toBe(9)
    expect(
      run('latest_results', { slug: 'vancouver-2026', contest: 'mayor' })
        .contest.kind,
    ).toBe('mayor')
    expect(
      run('latest_results', { slug: 'bc-2026', district: 'Surrey South' })
        .contest.id,
    ).toBe('SUS')
    expect(
      run('latest_results', { slug: 'alberta-2026', question: 10 }).contest.eds
        .length,
    ).toBe(87)
    expect(
      fails('latest_results', { slug: 'bc-2026', district: 'Narnia' }),
    ).toMatch(/no contest matching/)
  })

  it('builds series over the snapshots', () => {
    const ballots = run('results_series', {
      slug: 'vancouver-2026',
      metric: 'ballots',
    })
    expect(ballots.rows.length).toBe(8)
    expect(ballots.rows[7]).toEqual({
      asOf: '2026-10-17 23:40:00',
      polls: { closed: 147, total: 147 },
      ballots: 175000,
    })
    expect(
      run('results_series', {
        slug: 'vancouver-2026',
        metric: 'polls',
        since: '2026-10-17 22:50:00',
      }).rows.length,
    ).toBe(2)
    const seats = run('results_series', { slug: 'bc-2026', metric: 'seats' })
    expect(Object.keys(seats.rows[7].led)).toContain('ndp')
    const q3 = run('results_series', {
      slug: 'alberta-2026',
      metric: 'votes',
      contest: 'q3',
    })
    expect(q3.choices).toEqual(['Yes', 'No'])
    expect(q3.rows[9].values.Yes).toBeGreaterThan(0)
    const share = run('results_series', {
      slug: 'vancouver-2026',
      metric: 'share',
      contest: 'mayor',
    })
    expect(share.contest.kind).toBe('mayor')
    expect(
      Object.values(share.rows[0].values).every((v) => typeof v === 'number'),
    ).toBe(true)
    expect(
      fails('results_series', { slug: 'vancouver-2026', metric: 'seats' }),
    ).toBe('seats is for a riding election')
    expect(
      fails('results_series', { slug: 'vancouver-2026', metric: 'share' }),
    ).toBe('metric "share" needs contest')
  })

  it('pages a series with limit and next', () => {
    const all = run('results_series', {
      slug: 'vancouver-2026',
      metric: 'ballots',
    })
    expect(all.rows.length).toBe(8)
    expect(all.next).toBeUndefined()
    const seen: string[] = []
    let since: string | undefined
    let pages = 0
    do {
      const page = run('results_series', {
        slug: 'vancouver-2026',
        metric: 'ballots',
        limit: 3,
        ...(since ? { since } : {}),
      })
      pages++
      expect(page.rows.length).toBeLessThanOrEqual(3)
      seen.push(...page.rows.map((r: { asOf: string }) => r.asOf))
      if (page.next)
        expect(page.next).toBe(page.rows[page.rows.length - 1].asOf)
      since = page.next
    } while (since)
    expect(pages).toBe(3)
    expect(seen).toEqual(all.rows.map((r: { asOf: string }) => r.asOf))
    // an exact fit leaves no next
    expect(
      run('results_series', {
        slug: 'vancouver-2026',
        metric: 'ballots',
        limit: 8,
      }).next,
    ).toBeUndefined()
    // a page past the end still names the contest
    const past = run('results_series', {
      slug: 'alberta-2026',
      metric: 'share',
      contest: 'q3',
      since: '2099-01-01 00:00:00',
    })
    expect(past.rows).toEqual([])
    expect(past.choices).toEqual(['Yes', 'No'])
    expect(past.next).toBeUndefined()
  })

  it('cuts a page that would pass the text budget', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      asOf: `2026-10-19 ${String(i).padStart(2, '0')}:00:00`,
      wide: 'x'.repeat(100),
    }))
    const out = { slug: 's', metric: 'ballots', rows }
    const fit = fitRows(out, false, 2000)
    expect(JSON.stringify(fit, null, 2).length).toBeLessThanOrEqual(2000)
    expect(fit.rows.length).toBeGreaterThan(0)
    expect(fit.rows).toEqual(rows.slice(0, fit.rows.length))
    expect(fit.next).toBe(fit.rows[fit.rows.length - 1].asOf)
    expect(fitRows(out, false).next).toBeUndefined()
    expect(fitRows(out, true).next).toBe(rows[49].asOf)
    expect(fitRows({ ...out, rows: [] }, false)).toEqual({ ...out, rows: [] })
  })

  it('refuses a series limit out of range', () => {
    const describe_ = describeServer({ name: 'voting' })
    for (const limit of [0, SERIES_MAX + 1, 2.5]) {
      const out = dispatch(
        [
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'results_series',
              arguments: { slug: 'vancouver-2026', metric: 'ballots', limit },
            },
          },
        ],
        false,
        { module: votingTools, describe: describe_, ctx },
      )
      expect((out.body as { error: { code: number } }).error.code).toBe(-32602)
    }
  })

  it('answers a chambers election by race and by chamber', () => {
    const listed = run('list_elections').elections.find(
      (e: { slug: string }) => e.slug === 'tiny-2026',
    )
    expect(listed.ballot).toBe('chambers')
    const race = run('latest_results', { slug: 'tiny-2026', contest: 'ak-sen' })
    expect(race.contest.label).toBe('Alaska')
    expect(race.contest.choices[0].name).toBe('Dan S. Sullivan')
    const seats = run('results_series', {
      slug: 'tiny-2026',
      metric: 'seats',
      chamber: 'house',
    })
    expect(seats.rows.length).toBe(2)
    expect(seats.before).toBeUndefined()
    expect(seats.holdovers).toEqual({})
    expect(
      run('results_series', {
        slug: 'tiny-2026',
        metric: 'seats',
        chamber: 'senate',
      }).holdovers,
    ).toEqual({ dem: 1, gop: 1 })
    expect(seats.rows[1]).toEqual({
      asOf: '2026-11-03 22:30:00',
      polls: { closed: 5, total: 8 },
      reporting: 60,
      led: { dem: 3, gop: 1, other: 0 },
      called: { dem: 2, gop: 1, other: 0 },
    })
    expect(
      fails('results_series', { slug: 'tiny-2026', metric: 'seats' }),
    ).toMatch(/seats needs chamber: one of house, senate, governor/)
    expect(fails('closest_districts', { slug: 'tiny-2026' })).toMatch(/riding/)
    expect(run('summary', { slug: 'tiny-2026' } as never)).toContain(
      '### Governors (3)',
    )
  })

  it('answers the riding questions', () => {
    const near = run('closest_districts', { slug: 'bc-2026', n: 3 })
    expect(near.ridings.length).toBe(3)
    expect(near.ridings[0].margin_pts).toBeLessThanOrEqual(
      near.ridings[1].margin_pts,
    )
    const hands = run('changing_hands', { slug: 'bc-2026' })
    expect(hands.count).toBe(
      hands.pairs.reduce((n: number, p: { n: number }) => n + p.n, 0),
    )
    expect(fails('closest_districts', { slug: 'vancouver-2026' })).toBe(
      'closest_districts is for a riding election',
    )
  })

  it('answers the referendum divisions', () => {
    const out = run('question_divisions', {
      slug: 'alberta-2026',
      question: 3,
      n: 5,
      sort: 'share',
    })
    expect(out.divisions.length).toBe(5)
    expect(out.divisions[0].share_option1).toBeGreaterThanOrEqual(
      out.divisions[1].share_option1,
    )
    expect(out.options).toEqual(['Yes', 'No'])
    expect(
      fails('question_divisions', { slug: 'alberta-2026', question: 99 }),
    ).toBe('no question 99')
  })

  it('returns the markdown summary and works through dispatch', () => {
    expect(run('summary', { slug: 'alberta-2026' } as never)).toMatch(
      /^# Alberta Votes 2026/,
    )
    const describe_ = describeServer({ name: 'voting' })
    const out = dispatch(
      [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'closest_districts',
            arguments: { slug: 'bc-2026', n: 2 },
          },
        },
      ],
      false,
      { module: votingTools, describe: describe_, ctx },
    )
    expect(
      (out.body as { result: { structuredContent: { ridings: unknown[] } } })
        .result.structuredContent.ridings.length,
    ).toBe(2)
  })
})
