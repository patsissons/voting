import { describe, expect, it } from 'vitest'
import { fixtureFeeds } from '../../scripts/fixtures/fixture.ts'
import { alberta } from '../../scripts/fixtures/load.ts'
import { normalize } from '../parsers/index.ts'
import type { Payload } from '../payload.ts'
import {
  allReported,
  contestOf,
  divisionRows,
  momentum,
  pollRange,
  pollsSeries,
  questionsReporting,
  regionOf,
  regionSplit,
  shareSeries,
  stripRows,
  tally,
  votesSeries,
} from './referendum.ts'

const ab = alberta()
const abQ = (n: number) => ab.questions.find((q) => q.n === n)!
const night = fixtureFeeds(ab).map((doc, i) => ({
  id: `r${i}`,
  payload: normalize(JSON.stringify(doc), ab),
}))

/** A minimal referendum payload: votes per question number, divisions per question. */
const refPayload = (
  asOf: string,
  closed: number,
  votes: Record<number, [number, number]>,
  eds: Record<number, [string, number, number][]> = {},
): Payload =>
  ({
    asOf,
    polls: { closed, total: 100 },
    contests: ab.questions.map((q) => ({
      id: `q${q.n}`,
      n: q.n,
      choices: (votes[q.n] || [0, 0]).map((v) => ({ votes: v })),
      eds: (eds[q.n] || []).map(([name, a, b]) => ({
        code: name,
        name,
        votes: [a, b],
        polls: [1, 2],
      })),
    })),
  }) as unknown as Payload

describe('referendum stats', () => {
  it('reads polls and tallies', () => {
    expect(pollRange(abQ(1), 0)).toEqual({ lo: 60, hi: 65, n: 3 })
    expect(pollRange(abQ(1), 1)).toBeNull()
    const r = night[0].payload
    const t = tally(contestOf(r, abQ(10)))
    expect(t.started && Math.abs(t.shares[0] + t.shares[1] - 100) < 1e-9).toBe(
      true,
    )
    expect(tally(contestOf(r, abQ(9))).started).toBe(false)
    expect(questionsReporting(r, ab)).toBe(
      r.contests.filter(
        (c) => c.posted && c.choices[0].votes + c.choices[1].votes > 0,
      ).length,
    )
    const rows = divisionRows(contestOf(r, abQ(10)), 'share')
    expect(
      rows.every(
        (x, i) => i === 0 || (rows[i - 1].share ?? -1) >= (x.share ?? -1),
      ),
    ).toBe(true)
    expect(allReported(night[night.length - 1].payload, ab)).toBe(true)
    expect(allReported(night[0].payload, ab)).toBe(false)
  })

  it('tracks polls reported over time and sorts divisions by polls reported', () => {
    expect(pollsSeries(night.slice(0, 1))).toBeNull()
    const s = pollsSeries(night)!
    expect(s.values.length).toBe(night.length)
    expect([...s.values].sort((a, b) => a - b)).toEqual(s.values)
    expect(s.values[s.values.length - 1]).toBe(100)
    expect(s.xs[1] - s.xs[0]).toBe(20 * 60000)
    const contest = contestOf(night[0].payload, abQ(10))
    const rows = divisionRows(contest, 'polls')
    expect(
      rows.every(
        (r) => r.reported != null && r.reported >= 0 && r.reported <= 100,
      ),
    ).toBe(true)
    expect(
      rows.every((r, i) => i === 0 || rows[i - 1].reported! >= r.reported!),
    ).toBe(true)
    const one = rows[0]
    expect(one.reported).toBe(
      Math.min(100, (one.polls![0] / one.polls![1]!) * 100),
    )
    expect(
      divisionRows(
        {
          eds: [
            { code: '1', name: 'A', votes: [1, 1], rejected: 0, polls: null },
          ],
        },
        'polls',
      )[0].reported,
    ).toBeNull()
  })

  it('counts votes per question over time', () => {
    expect(votesSeries(night.slice(0, 1), ab)).toBeNull()
    const v = votesSeries(night, ab)!
    expect(v.series[0].q.n).toBe(10)
    expect(v.series.length).toBe(ab.questions.length)
    for (const sr of v.series) {
      const seen = sr.values.filter((x) => x != null)
      expect([...seen].sort((a, b) => a! - b!)).toEqual(seen)
    }
    expect(v.series[9].values[0]).toBeNull()
  })

  it('compares the last hour of votes with each question overall', () => {
    const rows = [
      { payload: refPayload('2026-10-19 20:00:00', 5, { 10: [100, 50] }) },
      { payload: refPayload('2026-10-19 20:30:00', 9, { 10: [130, 70] }) },
      {
        payload: refPayload('2026-10-19 21:10:00', 14, {
          10: [160, 100],
          1: [40, 10],
        }),
      },
    ]
    const m = momentum(rows, ab, 60)!
    expect(m.since).toBe('2026-10-19 20:00:00')
    const q10 = m.rows.find((r) => r.q.n === 10)!
    expect(q10.added).toBe(110)
    expect(Math.abs(q10.recent - (60 / 110) * 100)).toBeLessThan(1e-9)
    expect(Math.abs(q10.overall - (160 / 260) * 100)).toBeLessThan(1e-9)
    expect(Math.abs(q10.change - (q10.recent - q10.overall))).toBeLessThan(1e-9)
    expect(m.rows.find((r) => r.q.n === 1)!.recent).toBe(80)
    expect(momentum(rows, ab, 30)!.since).toBe('2026-10-19 20:30:00')
    expect(momentum(rows.slice(0, 1), ab)).toBeNull()
    expect(momentum([rows[0], rows[0]], ab)).toBeNull()
  })

  it('starts each question’s share series when its count does', () => {
    const rows = [
      { payload: refPayload('2026-10-19 20:00:00', 0, {}) },
      { payload: refPayload('2026-10-19 20:20:00', 10, { 10: [60, 40] }) },
      {
        payload: refPayload('2026-10-19 20:40:00', 25, {
          10: [140, 60],
          1: [30, 10],
        }),
      },
    ]
    const s = shareSeries(rows, ab)!
    expect(s.xs).toEqual([10, 25])
    expect(s.series.map((x) => [x.q.n, x.values])).toEqual([
      [10, [60, 70]],
      [1, [null, 75]],
    ])
    expect(shareSeries(rows.slice(0, 2), ab)).toBeNull()
  })

  it('splits divisions into Calgary, Edmonton and the rest, and strip rows by region', () => {
    const eds: Record<number, [string, number, number][]> = {
      10: [
        ['Calgary-Acadia', 60, 40],
        ['Calgary-Bow', 30, 10],
        ['Edmonton-Glenora', 70, 30],
        ['Banff-Kananaskis', 50, 50],
        ['Airdrie-East', 0, 0],
      ],
    }
    const p = refPayload('2026-10-19 21:00:00', 20, { 10: [210, 130] }, eds)
    expect(regionOf('Calgary-Bhullar-McCall')).toBe('calgary')
    expect(regionOf('Edmonton-McClung')).toBe('edmonton')
    expect(regionOf('Strathcona-Sherwood Park')).toBe('rest')
    const split = regionSplit(p, ab)
    expect(split.length).toBe(1)
    expect(
      split[0].regions.map((r) => [r.key, r.divisions, r.votes, r.share]),
    ).toEqual([
      ['calgary', 2, [90, 50], (90 / 140) * 100],
      ['edmonton', 1, [70, 30], 70],
      ['rest', 2, [50, 50], 50],
    ])
    const strip = stripRows(p.contests[0])
    expect(strip.map((r) => [r.key, r.dots.map((d) => d.name)])).toEqual([
      ['calgary', ['Calgary-Bow', 'Calgary-Acadia']],
      ['edmonton', ['Edmonton-Glenora']],
      ['rest', ['Banff-Kananaskis']],
    ])
    const divisions = (ab.results as { divisions: Record<string, string> })
      .divisions
    const keys = Object.values(divisions).map(regionOf)
    expect(
      ['calgary', 'edmonton', 'rest'].map(
        (k) => keys.filter((x) => x === k).length,
      ),
    ).toEqual([26, 20, 41])
  })
})
