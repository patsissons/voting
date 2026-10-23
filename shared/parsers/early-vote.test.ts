import { describe, expect, it } from 'vitest'
import { fixture, us } from '../../scripts/fixtures/load.ts'
import { asEarlyVote } from '../early-vote.ts'
import { FeedError } from '../payload.ts'
import { parseEarlyVote, readCsv } from './early-vote.ts'

const csv = fixture('voting-2026-early-vote.csv')
const asOf = '2026-10-23T19:25:09Z'

describe('readCsv', () => {
  it('reads quoted commas, newlines and doubled quotes', () => {
    expect(readCsv('a,b,c\r\n1,"x, ""y""\nz",3\n\n4,,6')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, "y"\nz', '3'],
      ['4', '', '6'],
    ])
  })
})

describe('parseEarlyVote', () => {
  const ev = parseEarlyVote(csv, us().regions, asOf)

  it('keeps the regions, leaving out DC and states with no ballots yet', () => {
    expect(Object.keys(ev.states).sort()).toEqual([
      'ak',
      'az',
      'ca',
      'ga',
      'nc',
    ])
    expect(ev.asOf).toBe(asOf)
    expect(asEarlyVote(ev)).toEqual(ev)
  })

  it('counts DC in the national total', () => {
    expect(ev.total).toEqual({
      voted: 30999 + 759605 + 2478771 + 34633 + 1497446 + 1269920,
      inPerson: 20436 + 1424987 + 1215032,
      mail: 10563 + 759605 + 2478771 + 34633 + 72459 + 54888,
    })
  })

  it('keeps a split only when both halves are reported', () => {
    expect(ev.states.ak).toEqual({
      voted: 30999,
      inPerson: 20436,
      mail: 10563,
      prior: 267047,
      updated: '2026-10-23',
    })
    expect(ev.states.az).toEqual({
      voted: 759605,
      prior: 2592313,
      updated: '2026-10-23',
      party: { dem: 293947, gop: 292244, other: 173414 },
    })
    expect(ev.states.ga.party).toBeUndefined()
  })

  it('fingerprints the counts, not the stamp', () => {
    const later = parseEarlyVote(csv, us().regions, '2026-10-24T19:00:00Z')
    expect(later.sig).toBe(ev.sig)
    const moved = parseEarlyVote(
      csv.replace(',30999,', ',31000,'),
      us().regions,
      asOf,
    )
    expect(moved.sig).not.toBe(ev.sig)
  })

  it('refuses a body that is not the CSV', () => {
    const code = (body: string) => {
      try {
        parseEarlyVote(body, us().regions, asOf)
        return ''
      } catch (err) {
        return (err as FeedError).code
      }
    }
    expect(code('')).toBe('empty_feed')
    expect(code('<html>\n<body>blocked</body>\n</html>')).toBe('bad_feed')
    expect(code(csv.split('\r\n')[0] + '\r\nMO,MO,0')).toBe('empty_feed')
  })
})

describe('asEarlyVote', () => {
  it('reads JSON text and refuses a bad shape', () => {
    const ev = parseEarlyVote(csv, us().regions, asOf)
    expect(asEarlyVote(JSON.stringify(ev))).toEqual(ev)
    expect(asEarlyVote(null)).toBeNull()
    expect(asEarlyVote('')).toBeNull()
    expect(asEarlyVote({ ...ev, asOf: 'soon' })).toBeNull()
    expect(asEarlyVote({ ...ev, states: { ak: { voted: -1 } } })).toBeNull()
    expect(
      asEarlyVote({ ...ev, states: { ak: { voted: 1, party: { dem: 'x' } } } }),
    ).toBeNull()
  })
})
