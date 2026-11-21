import { describe, expect, it } from 'vitest'
import { feedText, fixtureFeeds } from '../../../../scripts/fixtures/fixture.ts'
import { us, usEarlyVote } from '../../../../scripts/fixtures/load.ts'
import type { Contest, Payload } from '../../../../shared/payload.ts'
import { normalize, stripDetail } from '../../../../shared/parsers/index.ts'
import { bandLabel, findings, leadText, letter, swingText } from './findings'
import {
  HOUSE_2024,
  HOUSE_NATIONAL_2024,
  PRESIDENT_2024,
  REDRAWN,
} from './prior'
import {
  bandRecords,
  chamberSummaries,
  countMoves,
  earlyPattern,
  latestFull,
  marginOf,
  median,
  raceViews,
  redrawnSplit,
  splitTickets,
  stateViews,
  swingSummary,
  tippingPoint,
  type RaceView,
} from './stats'

const e = us()
const house = e.chambers.find((c) => c.key === 'house')!
const night = fixtureFeeds(e).map((f) => normalize(feedText(f), e) as Payload)
// As production stores them: only the newest row keeps its contests.
const stored = night.map((payload, i) => ({
  payload: i === night.length - 1 ? payload : stripDetail(payload) || payload,
}))
const latest = night[night.length - 1]

type Pick = [party: string | null, votes: number, winner?: boolean]

function contest(
  id: string,
  kind: string,
  picks: Pick[],
  extra: Partial<Contest> = {},
): Contest {
  const total = picks.reduce((s, p) => s + p[1], 0)
  return {
    id,
    name: id,
    label: id,
    kind,
    voteFor: 1,
    ballots: total,
    acclaimed: false,
    sort: 0,
    region: id.slice(0, 2),
    reporting: 99,
    choices: [...picks]
      .sort((a, b) => b[1] - a[1])
      .map(([party, votes, winner], i) => ({
        ballot: null,
        name: `${party || 'ind'} ${i}`,
        votes,
        pct: total ? (votes / total) * 100 : 0,
        party,
        partyName: party || 'Independent',
        incumbent: false,
        winner: !!winner,
      })),
    ...extra,
  }
}

const payload = (contests: Contest[], asOf = '2026-11-03 22:00:00'): Payload =>
  ({
    asOf,
    official: false,
    ballots: 0,
    eligible: 0,
    turnout: null,
    polls: { closed: 0, total: contests.length },
    contests,
  }) as unknown as Payload

const view = (c: Contest): RaceView => raceViews(payload([c]), e)[0]

describe('the 2024 table', () => {
  it('has every state and only districts of states that kept their maps', () => {
    expect(Object.keys(PRESIDENT_2024).sort()).toEqual(
      e.regions.map((r) => r.key).sort(),
    )
    const codes = Object.keys(HOUSE_2024)
    expect(codes).toHaveLength(253)
    for (const code of codes) {
      expect(house.divisions[code]).toBeDefined()
      expect(REDRAWN).not.toContain(code.slice(0, 2))
    }
    // Every district of a state that kept its map, less Oklahoma's 3rd.
    const kept = Object.keys(house.divisions).filter(
      (c) => !REDRAWN.includes(c.slice(0, 2)),
    )
    expect(kept.filter((c) => !HOUSE_2024[c])).toEqual(['ok-03'])
    expect(REDRAWN).toHaveLength(10)
  })

  it('adds up to the published totals', () => {
    const sum = (rows: number[][], i: number) =>
      rows.reduce((n, r) => n + r[i], 0)
    const pres = Object.values(PRESIDENT_2024)
    // The 50 states, without the District of Columbia.
    expect(sum(pres, 0)).toBe(74724744)
    expect(sum(pres, 1)).toBe(77282352)
    const rows = Object.values(HOUSE_2024)
    expect(sum(rows, 0)).toBe(44523413)
    expect(sum(rows, 1)).toBe(43319945)
    for (const r of [...pres, ...rows])
      expect(r[0] + r[1]).toBeLessThanOrEqual(r[2])
    expect(marginOf(HOUSE_NATIONAL_2024)!).toBeCloseTo(-2.65, 2)
    // Arizona's 1st: Schweikert 225,538, Shah 208,966.
    expect(HOUSE_2024['az-01']).toEqual([208966, 225538, 434504])
    expect(marginOf(PRESIDENT_2024.ga)!).toBeCloseTo(-2.19, 1)
    expect(marginOf([0, 289652, 295052])).toBeNull()
  })
})

describe('race views', () => {
  it('sets a district against its own 2024 race', () => {
    const v = view(
      contest('az-01', 'house', [
        ['dem', 5300, true],
        ['gop', 4500],
        [null, 200],
      ]),
    )
    expect(v.leader).toBe('dem')
    expect(v.called).toBe(true)
    expect(v.margin).toBeCloseTo(8)
    expect(v.lead).toBeCloseTo(8)
    expect(v.prior).toBeCloseTo(marginOf(HOUSE_2024['az-01'])!)
    expect(v.swing).toBeCloseTo(8 - marginOf(HOUSE_2024['az-01'])!)
    expect(v.flip).toEqual({ from: 'gop', to: 'dem' })
    expect(v.band).toBe('lean dem')
    expect(v.redrawn).toBe(false)
  })

  it('has no 2024 comparison in a redrawn state, and none without both parties', () => {
    const redrawn = view(
      contest('tx-15', 'house', [
        ['dem', 60],
        ['gop', 40],
      ]),
    )
    expect(redrawn.redrawn).toBe(true)
    expect(redrawn.margin).toBeCloseTo(20)
    expect(redrawn.prior).toBeNull()
    expect(redrawn.swing).toBeNull()
    // An independent ran second: Democratic minus Republican says nothing.
    const third = view(
      contest('ak-al', 'house', [
        ['gop', 48],
        [null, 42],
        ['dem', 10],
      ]),
    )
    expect(third.margin).toBeNull()
    expect(third.lead).toBeCloseTo(6)
    expect(third.signed).toBeCloseTo(-6)
    expect(third.swing).toBeNull()
    const alone = view(contest('ma-01', 'house', [['dem', 100, true]]))
    expect(alone.lead).toBeNull()
    expect(alone.leader).toBe('dem')
  })

  it('sets a statewide race against the 2024 presidential vote', () => {
    const v = view(
      contest('ga-sen', 'senate', [
        ['dem', 55],
        ['gop', 45],
      ]),
    )
    expect(v.name).toBe('ga-sen Senate')
    expect(v.code).toBe('ga')
    expect(v.called).toBe(false)
    expect(v.prior).toBeCloseTo(marginOf(PRESIDENT_2024.ga)!)
    expect(v.swing).toBeCloseTo(10 - marginOf(PRESIDENT_2024.ga)!)
  })

  it('leads nobody while a runoff is pending', () => {
    const v = view(
      contest(
        'la-05',
        'house',
        [
          ['gop', 45],
          ['dem', 30],
          ['gop', 25],
        ],
        { runoff: { day: '2026-12-12', round: 1 } },
      ),
    )
    expect(v.pending).toBe(true)
    expect(v.leader).toBeNull()
    expect(v.flip).toBeNull()
    expect(v.margin).toBeNull()
  })
})

describe('the patterns', () => {
  const contests = [
    contest('az-01', 'house', [
      ['dem', 53, true],
      ['gop', 47],
    ]),
    contest('az-02', 'house', [
      ['gop', 60, true],
      ['dem', 40],
    ]),
    contest('az-06', 'house', [
      ['dem', 51],
      ['gop', 49],
    ]),
    contest('me-sen', 'senate', [
      ['dem', 53, true],
      ['gop', 47],
    ]),
    contest('me-gov', 'governor', [
      ['gop', 51, true],
      ['dem', 49],
    ]),
  ]
  const p = {
    ...payload(contests),
    chambers: {
      house: {
        reporting: 99,
        called: 2,
        parties: [
          { key: 'dem', leading: 2, called: 1, votes: 144, pct: 48 },
          { key: 'gop', leading: 1, called: 1, votes: 156, pct: 52 },
        ],
      },
    },
  } as unknown as Payload
  const views = raceViews(p, e)
  const chambers = chamberSummaries(p, views, e)
  const states = stateViews(views, e)

  it('summarises each chamber', () => {
    const h = chambers.find((c) => c.key === 'house')!
    expect(h.led).toEqual({ dem: 2, gop: 1 })
    expect(h.called).toBe(2)
    expect(h.uncalled.map((v) => v.id)).toEqual(['az-06'])
    expect(h.flips.map((v) => v.id)).toEqual(['az-01', 'az-06'])
    expect(h.close).toBe(1)
    expect(h.share.dem).toBe(48)
    const s = chambers.find((c) => c.key === 'senate')!
    // The seats not up count toward the chamber as it stands.
    expect(s.now.dem).toBe(e.chambers[1].holdovers.dem + 1)
  })

  it('finds a split ticket', () => {
    const splits = splitTickets(states)
    expect(splits).toHaveLength(1)
    expect(splits[0].key).toBe('me')
    expect(splits[0].crossed).toBe(true)
    expect(splits[0].gap).toBeCloseTo(8)
  })

  it('sums a state and sets it against the presidential vote', () => {
    const az = states.find((s) => s.key === 'az')!
    expect(az.seats).toBe(3)
    expect(az.led).toEqual({ dem: 2, gop: 1 })
    expect(az.house).toBeCloseTo(-4)
    expect(az.swing).toBeCloseTo(-4 - marginOf(PRESIDENT_2024.az)!)
    expect(az.voteShare).toBeCloseTo(48)
    expect(az.seatShare).toBeCloseTo(66.67, 1)
  })

  it('records each rating band and the races against their rating', () => {
    const bands = bandRecords(views.filter((v) => v.chamber === 'house'))
    const total = bands.reduce((n, b) => n + b.n, 0)
    expect(total).toBe(3)
    for (const b of bands) expect(b.dem + b.gop + b.open + b.other).toBe(b.n)
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  it('finds the seat that makes a majority', () => {
    const rows = views.filter((v) => v.chamber === 'house')
    const t = tippingPoint(rows, 2)!
    expect(t.party).toBe('dem')
    expect(t.seat.id).toBe('az-06')
    expect(t.margin).toBeCloseTo(2)
    expect(t.spare).toBe(0)
    expect(tippingPoint(rows, 3)).toBeNull()
    expect(tippingPoint(rows, null)).toBeNull()
  })

  it('splits the flips by redrawn and kept maps', () => {
    const r = redrawnSplit(views)
    expect(r.kept).toEqual({ seats: 3, flips: 2, toDem: 2 })
    expect(r.redrawn.seats).toBe(0)
  })

  it('summarises the swing', () => {
    const s = swingSummary(views, chambers)
    expect(s.national).toBeCloseTo(-4)
    expect(s.nationalSwing).toBeCloseTo(-4 - s.national24!)
    expect(s.districts).toBe(3)
    expect(s.statewide).toBe(2)
  })
})

describe('the count over time', () => {
  const row = (
    asOf: string,
    ballots: number,
    dem: [number, number],
    called: number,
  ) => ({
    payload: {
      asOf,
      official: false,
      ballots,
      polls: { closed: called, total: 506 },
      contests: [],
      chambers: {
        house: {
          reporting: 50,
          called,
          parties: [
            {
              key: 'dem',
              leading: dem[0],
              called: dem[1],
              votes: ballots * 0.55,
              pct: 55,
            },
            {
              key: 'gop',
              leading: 435 - dem[0],
              called: 0,
              votes: ballots * 0.45,
              pct: 45,
            },
          ],
        },
      },
    } as unknown as Payload,
  })
  const rows = [
    row('2026-11-03 18:10:00', 10, [1, 0], 0),
    row('2026-11-03 21:00:00', 4000, [200, 100], 100),
    row('2026-11-03 23:00:00', 6000, [220, 150], 150),
    row('2026-11-04 02:00:00', 9000, [222, 218], 300),
    row('2026-11-05 09:00:00', 10000, [222, 220], 305),
  ]

  it('dates the majority, counts the calls per day and skips the first votes', () => {
    const m = countMoves(rows, e)!
    expect(m.milestones).toEqual([
      {
        chamber: 'house',
        short: 'House',
        party: 'dem',
        majority: 218,
        led: '2026-11-03 23:00:00',
        called: '2026-11-04 02:00:00',
      },
    ])
    expect(m.days).toEqual([
      { day: '2026-11-03', called: 150, added: 150 },
      { day: '2026-11-04', called: 300, added: 150 },
      { day: '2026-11-05', called: 305, added: 5 },
    ])
    // The 10-vote first row is under a twentieth of the final count.
    expect(m.rows).toHaveLength(4)
    expect(m.dem).toEqual([55, 55, 55, 55])
    expect(m.leadNow).toBeCloseTo(10)
    expect(countMoves(rows.slice(0, 1), e)).toBeNull()
  })
})

describe('over the fixture night', () => {
  const full = latestFull(stored)!
  const views = raceViews(full, e)
  const chambers = chamberSummaries(full, views, e)
  const states = stateViews(views, e)
  const swing = swingSummary(views, chambers)
  const bands = bandRecords(views.filter((v) => v.chamber === 'house'))

  it('reads the newest row that still has contests', () => {
    expect(full).toBe(latest)
    expect(latestFull(stored.slice(0, -1))).toBeNull()
    expect(views).toHaveLength(506)
    expect(views.filter((v) => v.chamber === 'house')).toHaveLength(435)
    expect(views.filter((v) => v.redrawn)).toHaveLength(181)
    expect(states).toHaveLength(50)
    expect(bands.reduce((n, b) => n + b.n, 0)).toBe(435)
  })

  it('reads the early vote and the count', () => {
    const early = earlyPattern(states, usEarlyVote(e))
    expect(early && early.points.length).toBeGreaterThan(2)
    expect(earlyPattern(states, null)).toBeNull()
    const moves = countMoves(stored, e)
    expect(moves && moves.days.length).toBeGreaterThan(0)
  })

  it('writes findings from the numbers and none without them', () => {
    const args = {
      chambers,
      views,
      swing,
      bands,
      tipping: tippingPoint(
        views.filter((v) => v.chamber === 'house'),
        house.majority ?? null,
      ),
      splits: splitTickets(states),
      redrawn: redrawnSplit(views),
      early: earlyPattern(states, usEarlyVote(e)),
      moves: countMoves(stored, e),
    }
    const list = findings(args)
    expect(list.length).toBeGreaterThan(3)
    for (const f of list) {
      expect(f.lead).toBeTruthy()
      expect(`${f.lead} ${f.text}`).not.toMatch(/undefined|NaN|Infinity/)
    }
    expect(list[0].lead).toMatch(/lead \d+ of the 435 House seats/)
    const none = raceViews(null, e)
    expect(
      findings({
        ...args,
        views: none,
        chambers: chamberSummaries(null, none, e),
      }),
    ).toEqual([])
  })
})

describe('the copy', () => {
  it('names a direction once and never signs it', () => {
    expect(swingText(8.04)).toBe('8.0 pts toward the Democrats')
    expect(swingText(-3.26)).toBe('3.3 pts toward the Republicans')
    expect(swingText(0.01)).toBe('no change')
    expect(leadText(5.44)).toBe('Democrats by 5.4')
    expect(leadText(-12)).toBe('Republicans by 12.0')
    expect(leadText(0)).toBe('level')
    expect(bandLabel('lean gop')).toBe('Lean Republican')
    expect(bandLabel('tossup')).toBe('Toss-up')
    expect(letter('dem')).toBe('D')
    expect(letter('other')).toBe('I')
  })
})
