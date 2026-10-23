import { describe, expect, it } from 'vitest'
import { bc, fixture } from '../../scripts/fixtures/load.ts'
import { asEarlyVote } from '../early-vote.ts'
import { daySeries } from '../stats/early-vote.ts'
import { ebcAdvanceEarlyVote, parseEbcAdvance } from './ebc-advance.ts'

const text2026 = fixture('voting-2026-ebc-advance.txt')
const text2024 = fixture('voting-2024-ebc-advance.txt')
const codes = bc().districts.map((d) => d.code)

describe('parseEbcAdvance', () => {
  it('reads every riding, the days and the provincial total', () => {
    const t = parseEbcAdvance(text2026)
    expect(t.year).toBe(2026)
    expect(t.days).toEqual([
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ])
    expect(t.rows).toHaveLength(93)
    expect(t.rows.map((r) => r.code).sort()).toEqual([...codes].sort())
    expect(t.rows[0]).toEqual({
      code: 'ABM',
      name: 'Abbotsford-Mission',
      days: [1831, 3338, 1191, 1253, 1418, 2115],
      total: 11146,
      registered: 44439,
    })
    // A "-" is a day with no advance voting place open, not a zero.
    const abw = t.rows.find((r) => r.code === 'ABW')!
    expect(abw.days).toEqual([1400, 1692, 827, 981, 1172, null])
    expect(abw.total).toBe(6072)
    expect(t.total).toEqual({
      days: [137832, 201774, 105049, 128636, 139101, 178956],
      total: 891348,
      registered: 3738182,
    })
  })

  it('reads the 2024 table, whose days skip the Sunday', () => {
    const t = parseEbcAdvance(text2024)
    expect(t.year).toBe(2024)
    expect(t.days).toEqual([
      '2024-10-10',
      '2024-10-11',
      '2024-10-12',
      '2024-10-13',
      '2024-10-15',
      '2024-10-16',
    ])
    expect(t.rows).toHaveLength(93)
    expect(t.total.total).toBe(1001331)
    expect(t.total.registered).toBe(3550017)
  })

  it('refuses a table whose numbers disagree', () => {
    expect(() => parseEbcAdvance('')).toThrow(/empty/)
    expect(() => parseEbcAdvance('nothing here')).toThrow(/election year/)
    const broken = text2026.replace('11,146', '11,147')
    expect(() => parseEbcAdvance(broken)).toThrow(/ABM: the days sum to 11146/)
    const off = text2026.replace('891,348', '891,349')
    expect(() => parseEbcAdvance(off)).toThrow(
      /the districts sum to 891348, the provincial total says 891349/,
    )
  })
})

describe('ebcAdvanceEarlyVote', () => {
  it('keys the ridings by code with the last election as the baseline', () => {
    const ev = ebcAdvanceEarlyVote(
      parseEbcAdvance(text2026),
      parseEbcAdvance(text2024),
      codes,
      '2026-10-22T16:33:12.000Z',
    )
    expect(Object.keys(ev.states)).toHaveLength(93)
    expect(ev.total).toEqual({
      voted: 891348,
      registered: 3738182,
      prior: 1001331,
      days: {
        '2026-10-16': 137832,
        '2026-10-17': 201774,
        '2026-10-18': 105049,
        '2026-10-19': 128636,
        '2026-10-20': 139101,
        '2026-10-21': 178956,
      },
      priorDays: {
        '2024-10-10': 171381,
        '2024-10-11': 155464,
        '2024-10-12': 150250,
        '2024-10-13': 119660,
        '2024-10-15': 181669,
        '2024-10-16': 222907,
      },
    })
    expect(ev.states.ABW).toEqual({
      voted: 6072,
      registered: 38841,
      prior: 9163,
      days: {
        '2026-10-16': 1400,
        '2026-10-17': 1692,
        '2026-10-18': 827,
        '2026-10-19': 981,
        '2026-10-20': 1172,
      },
    })
    expect(asEarlyVote(JSON.stringify(ev))).toEqual(ev)
    expect(daySeries(ev.total.days, ev.total.priorDays)[4]).toEqual({
      day: '2026-10-20',
      n: 139101,
      prior: 181669,
    })
  })

  it('counts unknown ridings in the total only and works without a baseline', () => {
    const ev = ebcAdvanceEarlyVote(
      parseEbcAdvance(text2026),
      null,
      ['ABM', 'ZZZ'],
      '2026-10-22T16:33:12.000Z',
    )
    expect(Object.keys(ev.states)).toEqual(['ABM'])
    expect(ev.states.ABM.prior).toBeUndefined()
    expect(ev.total.voted).toBe(891348)
    expect(ev.total.prior).toBeUndefined()
    expect(ev.total.priorDays).toBeUndefined()
    const same = ebcAdvanceEarlyVote(
      parseEbcAdvance(text2026),
      null,
      ['ABM', 'ZZZ'],
      '2026-10-23T00:00:00.000Z',
    )
    expect(same.sig).toBe(ev.sig)
  })
})
