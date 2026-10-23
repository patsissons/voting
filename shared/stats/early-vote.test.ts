import { describe, expect, it } from 'vitest'
import { fixture, us } from '../../scripts/fixtures/load.ts'
import { parseEarlyVote } from '../parsers/early-vote.ts'
import {
  MARGIN_CUTS,
  marginStep,
  partyMargin,
  partySplit,
  partyTotals,
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

  it('sums party registration over the states that report it', () => {
    const t = partyTotals(turnoutByState(ev, us().regions))
    expect(t.states).toBe(3)
    expect(t.voted).toBe(2478771 + 1269920 + 759605)
    expect(t.party).toEqual({
      dem: 1237550 + 535973 + 293947,
      gop: 719657 + 296478 + 292244,
      other: 516609 + 437469 + 173414,
    })
    expect(t.mail).toEqual({
      dem: 1237550 + 23245 + 293947,
      gop: 719657 + 9810 + 292244,
      other: 516609 + 21833 + 173414,
    })
    expect(t.inPerson).toEqual({ dem: 512728, gop: 286668, other: 415636 })
    expect(partyTotals([])).toEqual({ states: 0, voted: 0, party: {} })
  })

  it('measures the margin between the first two parties', () => {
    expect(
      partyMargin({ dem: 60, gop: 20, other: 20 }, ['dem', 'gop']),
    ).toBeCloseTo(0.4)
    expect(
      partyMargin({ dem: 20, gop: 60, other: 20 }, ['dem', 'gop']),
    ).toBeCloseTo(-0.4)
    expect(partyMargin({ dem: 0, gop: 0 }, ['dem', 'gop'])).toBeNull()
    expect(partyMargin({ dem: 5 }, ['dem'])).toBeNull()
  })

  it('bands a margin, neutral inside the first cut', () => {
    expect(MARGIN_CUTS).toEqual([0.05, 0.15, 0.3])
    expect(
      [0, 0.049, 0.05, 0.149, 0.15, 0.3, 0.6].map((m) => marginStep(m)),
    ).toEqual([0, 0, 1, 1, 2, 3, 3])
    expect([-0.049, -0.05, -0.2, -0.31].map((m) => marginStep(m))).toEqual([
      0, -1, -2, -3,
    ])
  })
})
