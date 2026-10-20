import { describe, expect, it } from 'vitest'
import { dateStatus, electionStatus } from './election-status'

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
})
