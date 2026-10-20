/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import { feedText, fixtureFeeds } from '../../scripts/fixtures/fixture.ts'
import { alberta, bc, vancouver } from '../../scripts/fixtures/load.ts'
import { memoryDb } from '../db.memory.ts'
import { storeSnapshot } from '../store.ts'
import { describeServer, dispatch, validateModule } from './rpc.ts'
import { call, tools, votingTools } from './tools.ts'

function seeded() {
  const db = memoryDb()
  for (const e of [vancouver(), bc(), alberta()]) {
    db.addElection(e)
    for (const feed of fixtureFeeds(e))
      storeSnapshot(db, e.slug, feedText(feed))
  }
  db.addElection({ ...vancouver(), slug: 'draft-2027', published: false })
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
      'bc-2026',
      'alberta-2026',
      'vancouver-2026',
    ])
    expect(out.elections[0]).toMatchObject({
      ballot: 'district',
      page: 'https://voting.lgtm.page/bc-2026',
      results: { status: 'counting' },
    })
    expect(out.elections[2].results.status).toBe('count complete')
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
