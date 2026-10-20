import { describe, expect, it } from 'vitest'
import { atClock, spanText, stampToEpoch, timeTicks, todayIn } from './time'

describe('time', () => {
  it('turns Vancouver wall-clock stamps into instants across both offsets', () => {
    expect(
      new Date(
        stampToEpoch('2026-10-17 22:03:41', 'America/Vancouver'),
      ).toISOString(),
    ).toBe('2026-10-18T05:03:41.000Z')
    // Standard time from a date every tzdata agrees on: newer tzdata keeps BC
    // on daylight time year-round from November 2026, so never assume a fall back.
    expect(
      new Date(
        stampToEpoch('2026-01-15 21:00', 'America/Vancouver'),
      ).toISOString(),
    ).toBe('2026-01-16T05:00:00.000Z')
    expect(new Date(stampToEpoch('2026-10-17 22:03:41')).toISOString()).toBe(
      '2026-10-17T22:03:41.000Z',
    )
    expect(Number.isNaN(stampToEpoch('soon', 'America/Vancouver'))).toBe(true)
  })

  it('names today in a zone and formats clocks', () => {
    expect(todayIn('America/Edmonton', new Date('2026-10-20T03:30:00Z'))).toBe(
      '2026-10-19',
    )
    expect(atClock(Date.UTC(2026, 9, 19, 20, 5))).toMatch(/8:05/)
    expect(spanText(30)).toBe('under a minute')
    expect(spanText(7 * 60)).toBe('7 minutes')
    expect(spanText(125 * 60)).toBe('2 h 5 min')
  })

  it('picks round time ticks', () => {
    const start = Date.UTC(2026, 9, 19, 20, 20)
    const end = Date.UTC(2026, 9, 19, 23, 20)
    const ticks = timeTicks(start, end)
    expect(ticks[0]).toBe(start)
    expect(ticks[ticks.length - 1]).toBe(end)
    expect(ticks.length).toBeGreaterThan(2)
    expect(ticks.length).toBeLessThanOrEqual(7)
  })
})
