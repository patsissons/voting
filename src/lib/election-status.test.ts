import { describe, expect, it } from 'vitest'
import { alberta, bc, tinyChambers } from '../../scripts/fixtures/load.ts'
import {
  archived,
  dateStatus,
  electionStatus,
  finalResultsText,
} from './election-status'

describe('election status', () => {
  const advance = ['2026-10-16', '2026-10-21']
  const final = '2026-10-24'

  it('follows the calendar without a count', () => {
    expect(dateStatus(advance, final, '2026-10-01')).toBe('upcoming')
    expect(dateStatus(advance, final, '2026-10-16')).toBe('voting')
    expect(dateStatus(advance, final, '2026-10-24')).toBe('voting')
    expect(dateStatus(advance, final, '2026-10-25')).toBe('results')
    expect(dateStatus([], final, '2026-10-23')).toBe('upcoming')
  })

  it('follows the count once there is one', () => {
    const counting = {
      official: false,
      polls: { closed: 1, total: 2 },
      tabulators: { closed: 0, total: 0 },
    } as never
    const done = { official: true } as never
    expect(electionStatus(advance, final, '2026-10-24', counting)).toBe(
      'counting',
    )
    expect(electionStatus(advance, final, '2026-11-10', done)).toBe('final')
    expect(electionStatus(advance, final, '2026-10-24', null)).toBe('voting')
  })

  it('reads results, not counting, once the window has closed', () => {
    const counting = {
      official: false,
      polls: { closed: 1, total: 2 },
      tabulators: { closed: 0, total: 0 },
    } as never
    expect(electionStatus(advance, final, '2026-11-15', counting, true)).toBe(
      'results',
    )
    expect(
      electionStatus(
        advance,
        final,
        '2026-11-15',
        { official: true } as never,
        true,
      ),
    ).toBe('final')
  })
})

describe('archived', () => {
  const at = (iso: string) => Date.parse(iso)

  it('follows the fetch window: pollsClose + fetchHours', () => {
    const doc = bc() // pollsClose 2026-10-24 20:00 PDT, fetchHours 48
    expect(archived(doc, null, at('2026-10-25T03:00:00Z'))).toBe(false)
    expect(archived(doc, null, at('2026-10-27T02:59:00Z'))).toBe(false)
    expect(archived(doc, null, at('2026-10-27T03:01:00Z'))).toBe(true)
  })

  it('holds the default window without fetchHours, and none without pollsClose', () => {
    const doc = alberta()
    const plain = {
      ...doc,
      results: { ...doc.results, fetchHours: undefined },
    } as typeof doc
    const close = Date.parse(doc.pollsClose)
    expect(archived(plain, null, close + 11 * 3600000)).toBe(false)
    expect(archived(plain, null, close + 13 * 3600000)).toBe(true)
    expect(archived({ ...plain, pollsClose: '' }, null, close + 1e12)).toBe(
      false,
    )
  })

  it('is archived as soon as the count is complete or official', () => {
    const doc = tinyChambers()
    const early = Date.parse(doc.pollsClose) + 3600000
    expect(archived(doc, { official: true } as never, early)).toBe(true)
    expect(
      archived(
        doc,
        {
          official: false,
          polls: { closed: 4, total: 4 },
          tabulators: { closed: 0, total: 0 },
        } as never,
        early,
      ),
    ).toBe(true)
    expect(
      archived(
        doc,
        {
          official: false,
          polls: { closed: 3, total: 4 },
          tabulators: { closed: 0, total: 0 },
        } as never,
        early,
      ),
    ).toBe(false)
  })
})

describe('final results', () => {
  const advance = ['2026-10-16']
  it('turns a past election final once its known day has come', () => {
    const known = { day: '2026-11-09', expected: false }
    expect(dateStatus(advance, '2026-10-24', '2026-11-08', known)).toBe(
      'results',
    )
    expect(dateStatus(advance, '2026-10-24', '2026-11-09', known)).toBe('final')
    const guess = { day: '2026-11-17', expected: true }
    expect(dateStatus([], '2026-11-03', '2026-11-20', guess)).toBe('results')
  })

  it('words the day as known, expected or past expected', () => {
    expect(
      finalResultsText({ day: '2026-10-21', expected: false }, '2026-11-15'),
    ).toBe('Results final Wednesday, October 21')
    expect(
      finalResultsText({ day: '2026-11-17', expected: true }, '2026-11-15'),
    ).toBe('Final results expected Tuesday, November 17')
    expect(
      finalResultsText({ day: '2026-11-17', expected: true }, '2026-11-20'),
    ).toBe('Final results were expected Tuesday, November 17')
    expect(
      finalResultsText(
        { day: '2026-11-17', expected: true },
        '2026-11-15',
        true,
      ),
    ).toBe('Final results expected Tue Nov 17')
  })
})
