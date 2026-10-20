// Number formatting shared by the browser, the hooks and the scripts. Hand
// rolled because the PocketBase JSVM has no Intl and toLocaleString, and so
// that a count reads the same in a tooltip, a markdown page and an MCP result.

/** 1234567 -> "1,234,567" (rounded to an integer). */
export function fmt(n: number | null | undefined): string {
  return String(Math.round(Number(n) || 0)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  )
}

/** 44.337 -> "44.3%" */
export function pct1(n: number | null | undefined): string {
  return `${(Math.round((Number(n) || 0) * 10) / 10).toFixed(1)}%`
}

/** 7 -> "07" */
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** +1.25 -> "+1.3", -0.4 -> "-0.4" (one decimal, always signed). */
export function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}`
}

/** 1234 -> "1k", 2500000 -> "2.5M" */
export function compact(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`
  return String(Math.round(v))
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A wall-clock stamp ("2022-10-16 00:40:57") -> "Oct 16, 12:40 am". */
export function wallClock(stamp: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(
    String(stamp || ''),
  )
  if (!m) return String(stamp || '')
  const h = +m[4]
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${h % 12 || 12}:${m[5]} ${h < 12 ? 'am' : 'pm'}`
}

/** The time half of wallClock: "12:40 am". */
export function clockOf(stamp: string | null | undefined): string {
  const parts = wallClock(stamp).split(', ')
  return parts[parts.length - 1]
}

/** "2026-10-17" -> "Sat Oct 17" (calendar day, no zone involved). */
export function dayShort(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return day
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return `${DAYS[d.getUTCDay()]} ${MONTHS[+m[2] - 1]} ${+m[3]}`
}

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const LONG_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** "2026-10-17" -> "Saturday, October 17" */
export function dayLong(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return day
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return `${LONG_DAYS[d.getUTCDay()]}, ${LONG_MONTHS[+m[2] - 1]} ${+m[3]}`
}

/** "2026-10" -> "Oct"; "2026-10-18" -> "Oct 18" */
export function pollDate(date: string | null | undefined): string {
  const m = /^\d{4}-(\d{2})(?:-(\d{2}))?/.exec(String(date || ''))
  if (!m) return String(date || '')
  return m[2] ? `${MONTHS[+m[1] - 1]} ${+m[2]}` : MONTHS[+m[1] - 1]
}

/** 425 -> "0:07:05" */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(s / 3600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`
}

/** "voting places" -> "Voting places" */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
