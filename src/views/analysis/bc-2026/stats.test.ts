import { describe, expect, it } from 'vitest'
import { feedText, fixtureFeeds } from '../../../../scripts/fixtures/fixture.ts'
import { bc, bcEarlyVote } from '../../../../scripts/fixtures/load.ts'
import type { EarlyVote } from '../../../../shared/early-vote.ts'
import { normalize } from '../../../../shared/parsers/index.ts'
import type { Contest, Payload } from '../../../../shared/payload.ts'
import { findings } from './findings'
import { PRIOR } from './prior'
import {
  finalWatch,
  greenChanges,
  incumbentsLost,
  leaders,
  minorMargins,
  provinceOf,
  regionSwings,
  ridingViews,
  seatsVsVotes,
  turnoutPatterns,
} from './stats'

const e = bc()
const night = fixtureFeeds(e).map((f) => normalize(feedText(f), e) as Payload)
const latest = night[night.length - 1]

type Pick = [party: string | null, votes: number, incumbent?: boolean]

function contest(id: string, picks: Pick[], done = true): Contest {
  const d = e.districts.find((x) => x.code === id)!
  const total = picks.reduce((s, p) => s + p[1], 0)
  return {
    id,
    name: d.name,
    label: d.name,
    kind: 'district',
    voteFor: 1,
    ballots: total,
    acclaimed: false,
    sort: 0,
    region: d.region,
    boxes: { advance: [5, 5], final: done ? [70, 70] : [60, 70], ood: '' },
    choices: picks
      .sort((a, b) => b[1] - a[1])
      .map(([party, votes, incumbent], i) => ({
        ballot: null,
        name: `${party || 'ind'} ${i}`,
        votes,
        pct: (votes / total) * 100,
        party,
        partyName: party || 'Independent',
        incumbent: !!incumbent,
        winner: false,
      })),
  }
}

const payload = (contests: Contest[]): Payload => ({
  asOf: '2026-10-24 22:00:00',
  project: '2026 Provincial General Election',
  official: false,
  ballots: 0,
  eligible: 0,
  turnout: null,
  polls: { closed: 0, total: 0 },
  tabulators: { closed: 0, total: 0 },
  groups: [],
  contests,
})

const prior2024 = (code: string) => {
  const r = PRIOR[code]
  const total = r.reduce((s, v) => s + v, 0)
  return {
    ndp: ((r[0] + r[4]) / total) * 100,
    cp: ((r[1] + r[5]) / total) * 100,
    green: ((r[2] + r[6]) / total) * 100,
  }
}

describe('the 2024 table', () => {
  it('matches every riding the document lists, winner, share and margin', () => {
    expect(Object.keys(PRIOR).sort()).toEqual(
      e.districts.map((d) => d.code).sort(),
    )
    for (const d of e.districts) {
      const r = PRIOR[d.code]
      const total = r.reduce((s, v) => s + v, 0)
      const shares = ['ndp', 'cp', 'green', 'other']
        .map((k, i) => ({ k, s: ((r[i] + r[i + 4]) / total) * 100 }))
        .sort((a, b) => b.s - a.s)
      expect(shares[0].k, d.code).toBe(d.last!.party)
      expect(Math.abs(shares[0].s - d.last!.pct), d.code).toBeLessThan(0.15)
      expect(
        Math.abs(shares[0].s - shares[1].s - d.last!.margin),
        d.code,
      ).toBeLessThan(0.15)
    }
  })
})

describe('bc analysis stats', () => {
  it('compares a riding with 2024', () => {
    const early: EarlyVote = {
      asOf: '',
      sig: '',
      total: { voted: 0 },
      states: { ABM: { voted: 7500, prior: 5000 } },
    }
    const [v] = ridingViews(
      payload([
        contest(
          'ABM',
          [
            ['cp', 600],
            ['ndp', 300, true],
            ['centre', 100],
          ],
          false,
        ),
      ]),
      e,
      early,
    )
    const p = prior2024('ABM')
    expect(v.winner).toBe('cp')
    expect(v.was).toBe('cp')
    expect(v.margin).toBeCloseTo(30)
    expect(v.lead24).toBeCloseTo(p.cp - p.ndp)
    expect(v.lead26).toBeCloseTo(30)
    expect(v.swing).toBeCloseTo(30 - (p.cp - p.ndp))
    expect(v.minor).toBeCloseTo(10)
    // No Green candidate in 2026 (or 2024): no Green change.
    expect(v.green).toBeNull()
    expect(v.advanceChange).toBeCloseTo(50)
    const r = PRIOR.ABM
    expect(v.votesChange).toBeCloseTo(
      (1000 / (r[0] + r[1] + r[2] + r[3]) - 1) * 100,
    )
    expect(v.incumbent).toEqual({ name: 'ndp 1', party: 'ndp', lost: true })
    expect(v.complete).toBe(false)
    // ABM's 2024 late ballots leaned to the NDP against its in-person ones,
    // so the estimate narrows the Conservative lead, with late ballots at
    // the 2024 rate per counted vote.
    expect(v.final.leader).toBe('cp')
    expect(v.final.margin).toBeLessThan(30)
    expect(v.final.margin).toBeGreaterThan(28)
    expect(v.final.late).toBeCloseTo(
      (1000 * (r[4] + r[5] + r[6] + r[7])) / (r[0] + r[1] + r[2] + r[3]),
    )
  })

  it('reads nothing without contests', () => {
    expect(ridingViews(null, e, null)).toEqual([])
    expect(ridingViews(payload([]), e, null)).toEqual([])
  })

  it('counts seats, the uniform swing and the regions over the fixture night', () => {
    const views = ridingViews(latest, e, bcEarlyVote())
    expect(views).toHaveLength(93)
    const province = provinceOf(views)
    const total = (r: Record<string, number>) =>
      Object.values(r).reduce((s, v) => s + v, 0)
    expect(total(province.seats)).toBe(93)
    expect(total(province.seats24)).toBe(93)
    expect(total(province.uniform)).toBe(93)
    expect(province.seats24).toEqual({ ndp: 47, cp: 44, green: 2 })
    expect(province.swing).toBeCloseTo(province.lead26 - province.lead24)
    expect(province.spread).toBeGreaterThan(0)
    const regions = regionSwings(views, e)
    expect(regions.map((r) => r.key)).toEqual(e.regions.map((r) => r.key))
    expect(regions.reduce((s, r) => s + r.n, 0)).toBe(93)
    const parties = seatsVsVotes(views, province)
    expect(parties.reduce((s, p) => s + p.seats, 0)).toBe(93)
    expect(parties.find((p) => p.key === 'centre')?.share24).toBeNull()
    for (const p of parties)
      if (p.seats) expect(p.perSeat).toBeCloseTo(p.votes / p.seats)
    const { votes, advance } = turnoutPatterns(views)
    expect(votes?.n).toBe(93)
    expect(advance?.n).toBe(93)
  })

  it('lists the minor-party margins, the final-count watch and the Greens', () => {
    const views = ridingViews(
      payload([
        contest('ABM', [
          ['cp', 500],
          ['ndp', 450],
          ['onebc', 80],
        ]),
        contest('VNP', [
          ['ndp', 700],
          ['cp', 200],
          ['green', 100],
        ]),
        contest('SAN', [
          ['green', 500],
          ['ndp', 300, true],
          ['cp', 200],
        ]),
      ]),
      e,
      null,
    )
    expect(minorMargins(views).map((v) => v.code)).toEqual(['ABM'])
    expect(finalWatch(views).map((v) => v.code)).toEqual([])
    const close = ridingViews(
      payload([
        contest('ABM', [
          ['cp', 505],
          ['ndp', 495],
        ]),
      ]),
      e,
      null,
    )
    expect(finalWatch(close).map((v) => v.code)).toEqual(['ABM'])
    expect(greenChanges(views).map((v) => v.code)).toEqual(['SAN', 'VNP'])
    expect(greenChanges(views)[0].green).toBeCloseTo(
      50 - prior2024('SAN').green,
    )
    expect(incumbentsLost(views).map((v) => v.code)).toEqual(['SAN'])
    const led = leaders(views, e)
    expect(led.map((l) => [l.party, l.won])).toEqual([
      ['ndp', true],
      ['green', true],
    ])
  })
})

describe('bc findings', () => {
  const args = (views: ReturnType<typeof ridingViews>) => {
    const province = provinceOf(views)
    return {
      election: e,
      views,
      province,
      regions: regionSwings(views, e),
      parties: seatsVsVotes(views, province),
      minors: minorMargins(views),
      patterns: turnoutPatterns(views),
      watch: finalWatch(views),
      leaders: leaders(views, e),
      lost: incumbentsLost(views),
      short: (k: string) => k.toUpperCase(),
    }
  }

  it('says nothing without ridings', () => {
    expect(findings(args([]))).toEqual([])
  })

  it('writes the night up from the numbers', () => {
    const views = ridingViews(latest, e, bcEarlyVote())
    const out = findings(args(views))
    const leads = out.map((f) => f.lead)
    expect(leads[0]).toMatch(/won \d+ of 93 seats on [\d.]+% of the vote/)
    expect(leads[1]).toMatch(/^A [\d.]+-point swing toward the /)
    expect(leads).toContainEqual(expect.stringMatching(/swung furthest/))
    expect(leads[leads.length - 1]).toMatch(/final count/)
    for (const f of out) expect(f.text).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('leaves out what the numbers do not show', () => {
    const views = ridingViews(
      payload([
        contest('VNP', [
          ['ndp', 700],
          ['cp', 300],
        ]),
      ]),
      e,
      null,
    )
    const leads = findings(args(views)).map((f) => f.lead)
    expect(leads.join(' ')).not.toMatch(
      /swung furthest|took more than|Turnout|incumbent/,
    )
    expect(leads).toContain('The final count is unlikely to change a seat.')
  })
})
