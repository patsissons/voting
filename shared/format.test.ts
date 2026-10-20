import { describe, expect, it } from 'vitest'
import {
  clockOf,
  clockText,
  compact,
  dayLong,
  dayShort,
  fmt,
  pct1,
  pollDate,
  signed,
  wallClock,
} from './format.ts'

describe('format', () => {
  it('formats numbers without Intl', () => {
    expect(fmt(1234567)).toBe('1,234,567')
    expect(fmt(999)).toBe('999')
    expect(fmt(null)).toBe('0')
    expect(pct1(44.337)).toBe('44.3%')
    expect(pct1(0)).toBe('0.0%')
    expect(signed(1.25)).toBe('+1.3')
    expect(signed(-0.4)).toBe('-0.4')
    expect(compact(950)).toBe('950')
    expect(compact(12345)).toBe('12k')
    expect(compact(2500000)).toBe('2.5M')
  })

  it('formats wall-clock stamps and days', () => {
    expect(wallClock('2022-10-16 00:40:57')).toBe('Oct 16, 12:40 am')
    expect(wallClock('2026-10-24T20:05:00')).toBe('Oct 24, 8:05 pm')
    expect(wallClock('soon')).toBe('soon')
    expect(clockOf('2026-10-24 20:05:00')).toBe('8:05 pm')
    expect(dayShort('2026-10-17')).toBe('Sat Oct 17')
    expect(dayLong('2026-10-19')).toBe('Monday, October 19')
    expect(pollDate('2026-10')).toBe('Oct')
    expect(pollDate('2026-10-18')).toBe('Oct 18')
    expect(clockText(0)).toBe('0:00:00')
    expect(clockText(425.9)).toBe('0:07:05')
    expect(clockText(3 * 3600 + 61)).toBe('3:01:01')
    expect(clockText(-5)).toBe('0:00:00')
  })
})
