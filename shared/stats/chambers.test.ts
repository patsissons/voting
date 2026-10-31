import { describe, expect, it } from 'vitest'
import {
  civicCounted,
  civicSample,
  tinyChambers,
} from '../../scripts/fixtures/load.ts'
import { normalize } from '../parsers/index.ts'
import {
  balanceOf,
  calledOf,
  chamberTimeline,
  closestIn,
  contestsOf,
  inState,
} from './chambers.ts'
import { voteShares } from './results.ts'

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
        },
        {
          key: 'gop',
          called: 1,
          leading: 0,
          holdover: 0,
          before: null,
          net: null,
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
        },
        {
          key: 'gop',
          called: 0,
          leading: 1,
          holdover: 1,
          before: null,
          net: null,
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
    expect(balanceOf(empty, chamber('house'), tiny)).toMatchObject({
      rows: [
        { key: 'dem', called: 0, leading: 0, holdover: 0 },
        { key: 'gop', called: 0, leading: 0, holdover: 0 },
      ],
      undecided: 4,
      called: 0,
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
      { key: 'dem', called: 2, leading: 1, holdover: 0, before: 1, net: 1 },
      { key: 'gop', called: 1, leading: 0, holdover: 0, before: 3, net: -2 },
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
    expect(t.xs).toEqual([0, 60])
    expect(t.series.map((s) => [s.id, s.short, s.values])).toEqual([
      ['dem', 'Dem', [0, 3]],
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
})
