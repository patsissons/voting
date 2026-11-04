import { describe, expect, it } from 'vitest'
import {
  civicCounted,
  civicSample,
  tinyChambers,
} from '../../scripts/fixtures/load.ts'
import { normalize } from '../parsers/index.ts'
import {
  balanceOf,
  calledClock,
  calledOf,
  chamberTimeline,
  closestIn,
  contestsOf,
  counterOf,
  divisionOf,
  flipOf,
  goingIn,
  holderOf,
  inState,
  paceOf,
  ratingOf,
  reportingClock,
  votesClock,
} from './chambers.ts'
import { voteShares, wallMs } from './results.ts'
import type { Payload } from '../payload.ts'

const tiny = tinyChambers()
const empty = normalize(civicSample(), tiny)
const counted = normalize(civicCounted(), tiny)
const chamber = (key: string) => tiny.chambers.find((c) => c.key === key)!

describe('chamber stats', () => {
  it('picks a chamber’s contests and a state’s races', () => {
    expect(contestsOf(counted, 'senate').map((c) => c.id)).toEqual([
      'ak-sen',
      'ga-sen',
    ])
    expect(inState(counted, 'ak').map((c) => c.id)).toEqual([
      'ak-al',
      'ak-sen',
      'ak-gov',
    ])
    expect(calledOf(counted.contests[0])!.name).toBe('Nick Begich III')
    expect(calledOf(counted.contests[1])).toBeNull()
    expect(voteShares(counted.contests[0]).map((s) => s.key)).toEqual([
      'gop',
      'dem',
      'other',
    ])
    expect(voteShares(counted.contests[0])[0].share).toBeCloseTo(58.25, 1)
  })

  it('balances each chamber from calls, leads and holdovers', () => {
    expect(balanceOf(counted, chamber('house'), tiny)).toEqual({
      rows: [
        {
          key: 'dem',
          called: 2,
          leading: 1,
          holdover: 0,
          before: null,
          net: null,
          gained: null,
          lost: null,
        },
        {
          key: 'gop',
          called: 1,
          leading: 0,
          holdover: 0,
          before: null,
          net: null,
          gained: null,
          lost: null,
        },
      ],
      seats: 4,
      majority: 3,
      undecided: 0,
      called: 3,
      vacant: null,
    })
    expect(balanceOf(counted, chamber('senate'), tiny)).toEqual({
      rows: [
        {
          key: 'dem',
          called: 1,
          leading: 0,
          holdover: 1,
          before: null,
          net: null,
          gained: null,
          lost: null,
        },
        {
          key: 'gop',
          called: 0,
          leading: 1,
          holdover: 1,
          before: null,
          net: null,
          gained: null,
          lost: null,
        },
      ],
      seats: 4,
      majority: 3,
      undecided: 0,
      called: 1,
      vacant: null,
    })
    expect(balanceOf(counted, chamber('governor'), tiny)).toMatchObject({
      rows: [
        { key: 'dem', called: 0, leading: 1, holdover: 0 },
        { key: 'gop', called: 1, leading: 0, holdover: 1 },
      ],
      majority: null,
      undecided: 0,
    })
    // Before any count, only WI-02 (unopposed) is decided.
    expect(balanceOf(empty, chamber('house'), tiny)).toMatchObject({
      rows: [
        { key: 'dem', called: 1, leading: 0, holdover: 0 },
        { key: 'gop', called: 0, leading: 0, holdover: 0 },
      ],
      undecided: 3,
      called: 1,
    })
  })

  it('nets the firm seats against those held before', () => {
    // House: Dem called 2 having held 1, GOP called 1 having held 3.
    const house = balanceOf(
      counted,
      { ...chamber('house'), before: { dem: 1, gop: 3 } },
      tiny,
    )
    expect(house.rows).toEqual([
      {
        key: 'dem',
        called: 2,
        leading: 1,
        holdover: 0,
        before: 1,
        net: 1,
        gained: null,
        lost: null,
      },
      {
        key: 'gop',
        called: 1,
        leading: 0,
        holdover: 0,
        before: 3,
        net: -2,
        gained: null,
        lost: null,
      },
    ])
    expect(house.vacant).toBe(0)
    // Senate: holdovers count as held; a seat vacant going in shows up.
    const senate = balanceOf(
      counted,
      { ...chamber('senate'), before: { dem: 1, gop: 2 } },
      tiny,
    )
    expect(senate.rows.map((r) => [r.key, r.before, r.net])).toEqual([
      ['dem', 1, 1],
      ['gop', 2, -1],
    ])
    expect(senate.vacant).toBe(1)
    // Before any call the nets read as losses of every seat up; the page waits for a call.
    expect(
      balanceOf(
        empty,
        { ...chamber('house'), before: { dem: 1, gop: 3 } },
        tiny,
      ).rows[1].net,
    ).toBe(-3)
  })

  it('tracks the seats changing hands and the picture going in', () => {
    const house = {
      ...chamber('house'),
      before: { dem: 1, gop: 2, other: 1 },
      holders: {
        'ak-al': 'dem',
        'ca-12': 'dem',
        'ny-10': 'gop',
        'wi-02': null,
      },
      ratings: {
        label: 'Tiny Ball',
        url: 'https://example.com/ratings',
        asOf: '2026-10-27',
        divisions: {
          'ak-al': 'lean gop',
          'ca-12': 'safe dem',
          'ny-10': 'tossup',
          'wi-02': 'safe dem',
        },
      },
    }
    const byId = (id: string) => counted.contests.find((c) => c.id === id)!
    expect(divisionOf(house, byId('ak-al'))).toBe('ak-al')
    expect(divisionOf(chamber('senate'), byId('ga-sen'))).toBe('ga')
    expect(holderOf(house, byId('wi-02'))).toBeNull()
    expect(holderOf(chamber('house'), byId('wi-02'))).toBeUndefined()
    // Alaska: called GOP, held Dem; New York 10: called Dem, held GOP; Wisconsin 2 had no holder; California 12 is not called.
    expect(flipOf(house, byId('ak-al'))).toEqual({ from: 'dem', to: 'gop' })
    expect(flipOf(house, byId('ny-10'))).toEqual({ from: 'gop', to: 'dem' })
    expect(flipOf(house, byId('wi-02'))).toBeNull()
    expect(flipOf(house, byId('ca-12'))).toBeNull()
    const balance = balanceOf(counted, house, tiny)
    expect(
      balance.rows.map((r) => [r.key, r.before, r.gained, r.lost]),
    ).toEqual([
      ['dem', 1, 1, 1],
      ['gop', 2, 1, 1],
      ['other', 1, 0, 0],
    ])
    expect(balance.vacant).toBe(0)
    expect(ratingOf(house, 'ak-al')).toEqual({ grade: 'lean', party: 'gop' })
    expect(ratingOf(house, 'ny-10')).toEqual({ grade: 'tossup', party: null })
    expect(ratingOf(chamber('house'), 'ak-al')).toBeNull()
    expect(goingIn(chamber('house'), tiny)).toBeNull()
    expect(goingIn(house, tiny)).toEqual({
      held: [
        { key: 'dem', n: 2 },
        { key: 'gop', n: 1 },
      ],
      open: 1,
      bands: [
        { grade: 'safe', party: 'dem', n: 2 },
        { grade: 'likely', party: 'dem', n: 0 },
        { grade: 'lean', party: 'dem', n: 0 },
        { grade: 'tossup', party: null, n: 1 },
        { grade: 'lean', party: 'gop', n: 1 },
        { grade: 'likely', party: 'gop', n: 0 },
        { grade: 'safe', party: 'gop', n: 0 },
      ],
      flips: [
        {
          code: 'ak-al',
          label: 'Alaska at-large',
          from: 'dem',
          to: 'gop',
          grade: 'lean',
        },
      ],
      tossups: [{ code: 'ny-10', label: 'New York 10', from: 'gop' }],
    })
    // Ratings alone: no holders, so nothing is rated to change hands.
    const rated = goingIn({ ...house, holders: undefined }, tiny)!
    expect(rated.held).toBeNull()
    expect(rated.flips).toEqual([])
    expect(rated.tossups[0].from).toBeNull()
  })

  it('ranks the closest uncalled races', () => {
    const close = closestIn(counted.contests)
    expect(close.map((c) => c.id)).toEqual(['ak-sen', 'ca-gov', 'ca-12'])
    expect(close[0]).toMatchObject({
      label: 'Alaska',
      margin: expect.closeTo(13.1, 1),
      votes: 30000,
    })
    expect(closestIn(counted.contests, 1).length).toBe(1)
    expect(closestIn(empty.contests)).toEqual([])
  })

  it('draws seats led per chamber over the night', () => {
    const rows = [{ payload: empty }, { payload: counted }]
    const t = chamberTimeline(rows, 'house', tiny)!
    expect(t.xs).toEqual([wallMs(empty.asOf), wallMs(counted.asOf)])
    expect(t.series.map((s) => [s.id, s.short, s.values])).toEqual([
      ['dem', 'Dem', [1, 3]], // WI-02 is unopposed
      ['gop', 'GOP', [0, 1]],
    ])
    expect(chamberTimeline([{ payload: counted }], 'house', tiny)).toBeNull()
    const stripped = { ...empty, contests: [] }
    expect(
      chamberTimeline(
        [{ payload: stripped }, { payload: counted }],
        'senate',
        tiny,
      )!.series[1].values,
    ).toEqual([0, 1])
  })

  // The count at a stamp: House votes, the House's expected vote in and races called.
  const at = (
    asOf: string,
    ballots: number,
    reporting: number,
    closed: number,
  ): { payload: Payload } => ({
    payload: {
      ...counted,
      asOf,
      ballots,
      polls: { ...counted.polls, closed },
      chambers: {
        ...counted.chambers,
        house: { ...counted.chambers!.house, reporting },
      },
      contests: [],
    },
  })

  it('follows the count against the clock, even when the feed runs backwards', () => {
    const rows = [
      at('2026-11-04 14:00:00', 1000, 90, 3),
      at('2026-11-04 14:44:00', 1200, 92, 4),
      // The feed restates a state: fewer votes, a lower estimate.
      at('2026-11-04 14:46:00', 900, 83, 4),
    ]
    const votes = votesClock(rows)!
    expect(votes.xs).toEqual(rows.map((r) => wallMs(r.payload.asOf)))
    expect(votes.xs[2]).toBeGreaterThan(votes.xs[1])
    expect(votes.series.map((s) => [s.id, s.party, s.values])).toEqual([
      ['votes', null, [1000, 1200, 900]],
    ])
    expect(reportingClock(rows, tiny)!.series[0].values).toEqual([90, 92, 83])
    expect(calledClock(rows)!.series[0].values).toEqual([3, 4, 4])
    const t = chamberTimeline(rows, 'house', tiny)!
    expect(t.xs[2]).toBeGreaterThan(t.xs[1])
    expect(votesClock(rows.slice(0, 1))).toBeNull()
    expect(
      votesClock([...rows, { payload: { ...counted, asOf: 'soon' } }])!.rows,
    ).toHaveLength(3)
  })

  it('reads the expected vote in from the House, else the first chamber', () => {
    expect(counterOf(tiny).key).toBe('house')
    const noHouse = {
      ...tiny,
      chambers: tiny.chambers.filter((c) => c.key !== 'house'),
    }
    expect(counterOf(noHouse).key).toBe(noHouse.chambers[0].key)
    const rows = [{ payload: empty }, { payload: counted }]
    expect(reportingClock(rows, noHouse)!.series[0].values).toEqual([
      0,
      counted.chambers![noHouse.chambers[0].key].reporting,
    ])
  })

  it('measures the pace of the House count by the hour', () => {
    const rows = [
      at('2026-11-04 12:00:00', 1000, 80, 1),
      at('2026-11-04 12:40:00', 1500, 85, 2),
      at('2026-11-04 13:00:00', 1800, 88, 3),
      at('2026-11-04 13:30:00', 1900, 89, 3),
      at('2026-11-04 14:05:00', 2000, 90, 3),
    ]
    // The hour to 14:05 measures from 13:00, the hour before from 12:00.
    expect(paceOf(rows)).toEqual({
      to: '2026-11-04 14:05:00',
      recent: 200,
      before: 800,
    })
    // A restated count reads as votes taken back.
    expect(paceOf([...rows, at('2026-11-04 14:20:00', 1700, 84, 3)])).toEqual({
      to: '2026-11-04 14:20:00',
      recent: -100,
      before: 800,
    })
    // Without the hour before, only the last hour.
    expect(paceOf(rows.slice(2))).toEqual({
      to: '2026-11-04 14:05:00',
      recent: 200,
      before: null,
    })
    expect(paceOf(rows.slice(3))).toBeNull()
    expect(paceOf(rows.slice(4))).toBeNull()
  })
})
