// Browser-side time helpers (Intl is fine here; shared/ stays without it).

/**
 * A source stamp is wall-clock time in the election's zone; this is the
 * instant it names. Two passes of the zone's offset settle a DST edge.
 */
export function stampToEpoch(stamp: string, timeZone?: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    String(stamp || ''),
  )
  if (!m) return NaN
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))
  if (!timeZone) return wall
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const offset = (t: number) => {
    const p: Record<string, string> = {}
    for (const part of format.formatToParts(new Date(t)))
      p[part.type] = part.value
    return (
      Date.UTC(
        +p.year,
        +p.month - 1,
        +p.day,
        +p.hour % 24,
        +p.minute,
        +p.second,
      ) - t
    )
  }
  const first = wall - offset(wall)
  return wall - offset(first)
}

/** Today's calendar day (YYYY-MM-DD) in a zone. */
export function todayIn(
  timeZone: string | undefined,
  now = new Date(),
): string {
  try {
    return now.toLocaleDateString('en-CA', { timeZone: timeZone || 'UTC' })
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** "8:00 p.m. MDT" for an ISO close time, in its zone. */
export function closeTimeText(pollsClose: string, timeZone?: string): string {
  const at = Date.parse(pollsClose || '')
  if (!Number.isFinite(at)) return 'polls close'
  try {
    return new Date(at)
      .toLocaleTimeString('en-CA', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timeZone || 'UTC',
        timeZoneName: 'short',
      })
      .replace(/\./g, '')
  } catch {
    return 'polls close'
  }
}

/** "8:05 pm" for wall-clock milliseconds (the referendum time axes). */
export function atClock(wallMs: number): string {
  return new Date(wallMs)
    .toLocaleTimeString('en-CA', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    })
    .replace(/\./g, '')
}

/** Clock ticks for a wall-ms axis: the ends plus round times between. */
export function timeTicks(start: number, end: number): number[] {
  const span = Math.max(1, end - start)
  const step =
    [15, 30, 60, 120, 240, 480, 720]
      .map((m) => m * 60000)
      .find((s) => span / s <= 5) || 1440 * 60000
  const ticks = [start]
  for (let v = Math.ceil(start / step) * step; v < end; v += step) {
    if (v - start > step / 3 && end - v > step / 3) ticks.push(v)
  }
  ticks.push(end)
  return ticks
}

/** "under a minute", "7 minutes", "2 h 5 min" */
export function spanText(seconds: number): string {
  const m = Math.floor(seconds / 60)
  return m < 1
    ? 'under a minute'
    : m < 60
      ? `${m} minute${m === 1 ? '' : 's'}`
      : `${Math.floor(m / 60)} h ${m % 60} min`
}

/** "Fri, Oct 23, 3:25 pm EDT" for an ISO instant, in a zone. */
export function instantText(iso: string, timeZone?: string): string {
  const at = Date.parse(iso || '')
  if (!Number.isFinite(at)) return iso
  try {
    return new Date(at)
      .toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timeZone || 'UTC',
        timeZoneName: 'short',
      })
      .replace(/\s?AM\b/, ' am')
      .replace(/\s?PM\b/, ' pm')
  } catch {
    return iso
  }
}
