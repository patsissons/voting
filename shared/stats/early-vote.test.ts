import { describe, expect, it } from 'vitest'
import { fixture, us } from '../../scripts/fixtures/load.ts'
import { parseEarlyVote } from '../parsers/early-vote.ts'
import {
  partySplit,
  shareCuts,
  shareOfPrior,
  stepOf,
  turnoutByState,
} from './early-vote.ts'

const ev = parseEarlyVote(
  fixture('voting-2026-early-vote.csv'),
  us().regions,
  '2026-10-23T19:25:09Z',
)

describe('early vote stats', () => {
  it('lists the states with ballots, most first, with their share of 2022', () => {
    const rows = turnoutByState(ev, us().regions)
    expect(rows.map((r) => r.key)).toEqual(['ca', 'ga', 'nc', 'az', 'ak'])
    expect(rows[0].label).toBe('California')
    expect(rows[1].share).toBeCloseTo(1497446 / 3964926)
    expect(shareOfPrior({ voted: 5 })).toBeNull()
  })

  it('cuts the map scale in 5% multiples up to the largest share', () => {
    expect(shareCuts([0.02, 0.38])).toEqual([0.1, 0.2, 0.3, 0.4])
    expect(shareCuts([0.7])).toEqual([0.15, 0.3, 0.45, 0.6])
    expect(shareCuts([])).toEqual([0.05, 0.1, 0.15, 0.2])
    const cuts = shareCuts([0.38])
    expect([0, 0.09, 0.1, 0.38, 0.5].map((s) => stepOf(s, cuts))).toEqual([
      0, 0, 1, 3, 4,
    ])
  })

  it('splits party registration in party order with other last', () => {
    expect(
      partySplit({ other: 2, gop: 1, dem: 1 }, ['dem', 'gop']).map((s) => [
        s.key,
        s.share,
      ]),
    ).toEqual([
      ['dem', 0.25],
      ['gop', 0.25],
      ['other', 0.5],
    ])
    expect(partySplit({ dem: 0, gop: 0 }, ['dem', 'gop'])[0].share).toBe(0)
  })
})
