import { describe, expect, it } from 'vitest'
import { feedText, fixtureFeeds } from '../../../../scripts/fixtures/fixture.ts'
import { alberta } from '../../../../scripts/fixtures/load.ts'
import { normalize, stripDetail } from '../../../../shared/parsers/index.ts'
import type { Payload } from '../../../../shared/payload.ts'
import type { ReferendumElection } from '../../../../shared/schema/election.ts'
import { findings, listOf } from './findings'
import {
  countNotes,
  divisionsOf,
  fitsAgainstSeparation,
  flips,
  pollGaps,
  projections,
  regionShares,
  SEPARATION,
  shareOverTime,
  SMALLER_CITIES,
  type ShareSeries,
} from './stats'

const e = alberta() as ReferendumElection
const night = fixtureFeeds(e).map((f) => ({
  payload: normalize(feedText(f), e) as Payload,
}))
const latest = night[night.length - 1].payload
// What the page loads in production: every row but the newest is stripped
// of its division rows.
const stored = night.map((r, i) =>
  i === night.length - 1 ? r : { payload: stripDetail(r.payload) || r.payload },
)

describe('alberta analysis stats', () => {
  it('reads every division off the newest snapshot', () => {
    const divs = divisionsOf(latest, e)
    expect(divs).toHaveLength(87)
    const by = (region: string) => divs.filter((d) => d.region === region)
    expect(by('calgary')).toHaveLength(26)
    expect(by('edmonton')).toHaveLength(20)
    expect(by('cities')).toHaveLength(SMALLER_CITIES.size)
    expect(by('rural')).toHaveLength(87 - 26 - 20 - SMALLER_CITIES.size)
    for (const code of SMALLER_CITIES)
      expect(divs.find((d) => d.code === code)?.group).toBe('rest')
    const d = divs[0]
    const v = d.votes[SEPARATION]
    // Question 10 reads as the Begin process share, the others as option 1.
    expect(d.y[SEPARATION]).toBeCloseTo((v[1] / (v[0] + v[1])) * 100)
    expect(d.y[1]).toBeCloseTo((d.votes[1][0] / d.ballots[1]) * 100)
    expect(divisionsOf(stored[stored.length - 1].payload, e)).toHaveLength(87)
    expect(divisionsOf(stored[0].payload, e)).toEqual([])
    expect(divisionsOf(null, e)).toEqual([])
  })

  it('fits every other question against the separation question', () => {
    const divs = divisionsOf(latest, e)
    const fits = fitsAgainstSeparation(divs, e)
    expect(fits.map((f) => f.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const f of fits) {
      expect(Math.abs(f.fit.r)).toBeLessThanOrEqual(1)
      const es = f.residuals.map((r) => r.e)
      expect(es).toEqual([...es].sort((a, b) => b - a))
    }
  })

  it('weights the regions by votes and matches the province', () => {
    const divs = divisionsOf(latest, e)
    const regions = regionShares(divs, e, latest)
    expect(regions.rows.map((r) => r.n)).toEqual([26, 20, 15, 26])
    let side = 0
    let total = 0
    for (const d of divs) {
      side += d.votes[1][0]
      total += d.ballots[1]
    }
    const all = regions.rows.map((r) => r.shares[1] as number)
    expect(Math.min(...all)).toBeLessThanOrEqual((side / total) * 100)
    expect(Math.max(...all)).toBeGreaterThanOrEqual((side / total) * 100)
    expect(regions.province[1]).toBeCloseTo((side / total) * 100, 0)
  })

  it('compares each question with its polls', () => {
    const gaps = pollGaps(latest, e)
    expect(gaps).toHaveLength(10)
    const q1 = gaps.find((g) => g.q.n === 1)!
    expect(q1.range).toEqual({ lo: 60, hi: 65, latest: 60 })
  })

  it('follows shares over the stored rows and finds flips', () => {
    const series = shareOverTime(stored, e, [6, 7, 8, 9])!
    expect(series.xs.length).toBeGreaterThan(1)
    expect(series.series.map((s) => s.q.n)).toEqual([6, 7, 8, 9])
    expect(shareOverTime(stored.slice(0, 1), e, [6])).toBeNull()
    const fake: ShareSeries = {
      rows: ['20:00', '20:10', '20:20', '20:30'].map((t) => ({
        payload: { asOf: `2026-10-19 ${t}:00` } as Payload,
      })),
      xs: [0, 1, 2, 3],
      series: [
        { q: e.questions[1], values: [null, 52, 54, 48] },
        { q: e.questions[2], values: [45, 46, 47, 48] },
      ],
    }
    expect(flips(fake)).toEqual([
      {
        q: e.questions[1],
        peak: 54,
        peakAt: '2026-10-19 20:20:00',
        final: 48,
        lastCross: '2026-10-19 20:30:00',
      },
    ])
    expect(flips(null)).toEqual([])
  })

  it('projects only from the counted share and notes the count', () => {
    const divs = divisionsOf(latest, e)
    for (const p of projections(divs, [6, 7, 8, 9])) {
      expect(p.added).toBeGreaterThanOrEqual(0)
      expect(p.projected).toBeGreaterThan(0)
      expect(p.projected).toBeLessThan(100)
    }
    const notes = countNotes(stored, e, divs)
    expect(notes.pollTotals.length).toBeGreaterThan(0)
    for (const d of notes.decreases) expect(d.change).toBeLessThan(0)
    for (const o of notes.over) expect(o.ratio).toBeGreaterThan(1)
  })

  it('writes findings only from numbers it has', () => {
    const divs = divisionsOf(latest, e)
    const fits = fitsAgainstSeparation(divs, e)
    const regions = regionShares(divs, e, latest)
    const gaps = pollGaps(latest, e)
    const all = findings({
      election: e,
      latest,
      divs,
      fits,
      regions,
      gaps,
      flipped: flips(shareOverTime(stored, e, [6, 7, 8, 9])),
    })
    expect(all.length).toBeGreaterThan(2)
    expect(all[0].lead).toBe('The vote ran along one axis.')
    for (const f of all) {
      expect(f.lead).not.toMatch(/undefined|NaN/)
      expect(f.text).not.toMatch(/undefined|NaN/)
    }
    expect(
      findings({
        election: e,
        latest: null,
        divs: [],
        fits: [],
        regions: regionShares([], e, null),
        gaps: [],
        flipped: [],
      }),
    ).toEqual([])
    expect(listOf(['a'])).toBe('a')
    expect(listOf(['a', 'b', 'c'])).toBe('a, b and c')
  })
})
