// Elections BC's advance voting turnout table (a PDF, one row per electoral
// district: the voters at an advance voting place each day, the total and
// the registered voters) to the EarlyVote the page shows. The hooks cannot
// read a PDF, so `pnpm early-vote:push` runs pdftotext -layout on it and
// this reads that text: rows are "<name>  <ED code>  <day> ... <total>
// <registered>", a "-" where no advance place was open that day, and a
// PROVINCIAL TOTAL line. Voters are counted in the district where they
// voted, not where they live. The same table for the last election is the
// baseline (`prior`), like the 2022 midterm in the UF Election Lab CSV.
import type { EarlyVote, EarlyVoteState } from '../early-vote.ts'
import { pad2 } from '../format.ts'
import { FeedError, bodyText, fingerprint, num } from './common.ts'

export type EbcAdvanceRow = {
  code: string
  name: string
  /** Voters per day in `days` order; null where the table has "-". */
  days: (number | null)[]
  total: number
  registered: number
}

export type EbcAdvanceTable = {
  /** The year the table is for (from its title). */
  year: number
  /** The advance voting days, YYYY-MM-DD. */
  days: string[]
  rows: EbcAdvanceRow[]
  total: { days: number[]; total: number; registered: number }
}

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
]

const cells = (text: string): (number | null)[] =>
  text
    .trim()
    .split(/\s+/)
    .map((t) => (t === '-' ? null : num(t)))

const sum = (xs: readonly (number | null)[]): number =>
  xs.reduce<number>((n, x) => n + (x || 0), 0)

/** The table in the text pdftotext -layout makes of the PDF. */
export function parseEbcAdvance(raw: unknown): EbcAdvanceTable {
  const text = bodyText(raw)
  if (!text)
    throw new FeedError('empty_feed', 'the advance voting table is empty')
  const yearMatch = /(\d{4}) PROVINCIAL GENERAL ELECTION/i.exec(text)
  const year = yearMatch ? Number(yearMatch[1]) : 0
  if (!year)
    throw new FeedError(
      'bad_feed',
      'the advance voting table names no election year',
    )
  const lines = text.split(/\r?\n/)
  let days: string[] = []
  const rows: EbcAdvanceRow[] = []
  let total: EbcAdvanceTable['total'] | null = null
  for (const line of lines) {
    if (!days.length) {
      const found: string[] = []
      const re = /\b([A-Z]{3}) (\d{1,2})\b/g
      for (let m = re.exec(line); m; m = re.exec(line)) {
        const month = MONTHS.indexOf(m[1])
        if (month >= 0) found.push(`${year}-${pad2(month + 1)}-${pad2(+m[2])}`)
      }
      if (found.length >= 2) days = found
    }
    const totalLine = /PROVINCIAL TOTAL\s+(.+?)\s*$/.exec(line)
    if (totalLine) {
      const n = cells(totalLine[1]).map((x) => x || 0)
      total = {
        days: n.slice(0, -2),
        total: n[n.length - 2],
        registered: n[n.length - 1],
      }
      continue
    }
    const m =
      /^\s*(\S.*?)\s{2,}([A-Z]{3})\s+((?:[\d,]+|-)(?:\s+(?:[\d,]+|-))+)\s*$/.exec(
        line,
      )
    if (!m) continue
    const n = cells(m[3])
    if (n.length < 3) continue
    rows.push({
      code: m[2],
      name: m[1].trim(),
      days: n.slice(0, -2),
      total: n[n.length - 2] || 0,
      registered: n[n.length - 1] || 0,
    })
  }
  if (!days.length)
    throw new FeedError(
      'bad_feed',
      'the advance voting table has no day columns',
    )
  if (!rows.length)
    throw new FeedError(
      'bad_feed',
      'the advance voting table has no district rows',
    )
  for (const r of rows) {
    if (r.days.length !== days.length)
      throw new FeedError(
        'bad_feed',
        `${r.code}: ${r.days.length} day counts for ${days.length} days`,
      )
    if (sum(r.days) !== r.total)
      throw new FeedError(
        'bad_feed',
        `${r.code}: the days sum to ${sum(r.days)}, not ${r.total}`,
      )
  }
  const totals = {
    days: days.map((_, i) => sum(rows.map((r) => r.days[i]))),
    total: sum(rows.map((r) => r.total)),
    registered: sum(rows.map((r) => r.registered)),
  }
  if (total && total.total !== totals.total)
    throw new FeedError(
      'bad_feed',
      `the districts sum to ${totals.total}, the provincial total says ${total.total}`,
    )
  return { year, days, rows, total: total || totals }
}

const daysOf = (
  days: readonly string[],
  counts: readonly (number | null)[],
) => {
  const out: Record<string, number> = {}
  days.forEach((d, i) => {
    const n = counts[i]
    if (n != null) out[d] = n
  })
  return out
}

/**
 * The EarlyVote for a table, keyed by riding code. Rows outside `codes`
 * count toward the total only. `prior` is the last election's table: its
 * total per riding (matched by code) and province become the baseline.
 */
export function ebcAdvanceEarlyVote(
  table: EbcAdvanceTable,
  prior: EbcAdvanceTable | null,
  codes: readonly string[],
  asOf: string,
): EarlyVote {
  const known = new Set(codes)
  const priorBy = new Map((prior ? prior.rows : []).map((r) => [r.code, r]))
  const states: Record<string, EarlyVoteState> = {}
  for (const r of table.rows) {
    if (!known.has(r.code)) continue
    const state: EarlyVoteState = {
      voted: r.total,
      registered: r.registered,
      days: daysOf(table.days, r.days),
    }
    const before = priorBy.get(r.code)
    if (before && before.total) state.prior = before.total
    states[r.code] = state
  }
  if (!table.total.total)
    throw new FeedError(
      'empty_feed',
      'the advance voting table counts no voters',
    )
  const total: EarlyVote['total'] = {
    voted: table.total.total,
    registered: table.total.registered,
    days: daysOf(table.days, table.total.days),
  }
  if (prior && prior.total.total) {
    total.prior = prior.total.total
    total.priorDays = daysOf(prior.days, prior.total.days)
  }
  return {
    asOf,
    sig: fingerprint(JSON.stringify([total, states])),
    total,
    states,
  }
}
