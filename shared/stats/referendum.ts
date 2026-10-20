// Pure statistics for a referendum (Alberta 2026): payloads from the eab-dash
// or eab-ref parsers, one contest per question (kind "question", id "q<n>")
// with its own locations reported and, on the newest snapshot only,
// per-division rows (eds).
import type { Contest, Division, Payload } from '../payload.ts'
import type {
  ReferendumElection,
  ReferendumQuestion,
} from '../schema/election.ts'
import { wallMs } from './results.ts'
import type { PayloadRow } from './results.ts'

export { wallMs }

/** The polled range for option k: { lo, hi, n }, or null with no figures. */
export function pollRange(
  question: ReferendumQuestion,
  k: number,
): { lo: number; hi: number; n: number } | null {
  const values = (question.polls || [])
    .map((p) => p.pct && p.pct[k])
    .filter((v): v is number => typeof v === 'number')
  if (!values.length) return null
  return { lo: Math.min(...values), hi: Math.max(...values), n: values.length }
}

/** A question's contest in a payload. */
export const contestOf = (
  payload: Payload | null | undefined,
  question: Pick<ReferendumQuestion, 'n'>,
): Contest | null =>
  (payload && payload.contests
    ? payload.contests.find((c) => c.id === `q${question.n}`)
    : null) || null

export type Tally = {
  started: boolean
  total: number
  votes: [number, number]
  shares: [number, number]
  lead: -1 | 0 | 1
}

/** Votes and shares of the two options, and whether the count has started. */
export function tally(contest: Contest | null | undefined): Tally {
  if (!contest)
    return { started: false, total: 0, votes: [0, 0], shares: [0, 0], lead: -1 }
  const votes: [number, number] = [0, 1].map((k) =>
    contest.choices[k] ? contest.choices[k].votes : 0,
  ) as [number, number]
  const total = votes[0] + votes[1]
  const shares = votes.map((v) => (total ? (v / total) * 100 : 0)) as [
    number,
    number,
  ]
  return {
    started: total > 0,
    total,
    votes,
    shares,
    lead: votes[0] === votes[1] ? -1 : votes[0] > votes[1] ? 0 : 1,
  }
}

/** Locations reported as { closed, total, share }; total is null when the source gives only a count. */
export function reported(contest: Contest | null | undefined): {
  closed: number
  total: number | null
  share: number | null
} {
  const p = (contest && contest.polls) || { closed: 0, total: 0, unit: '' }
  const closed = Number(p.closed) || 0
  const total = Number(p.total) || null
  return { closed, total, share: total ? Math.min(1, closed / total) : null }
}

export type DivisionRow = Division & {
  total: number
  share: number | null
  reported: number | null
}
export type DivisionSort = 'name' | 'share' | 'votes' | 'polls'

/** Division rows for one question, with option-1 share and the share of its polls reported (null without a polls total), sorted. */
export function divisionRows(
  contest: Pick<Contest, 'eds'> | null | undefined,
  sort: DivisionSort = 'name',
): DivisionRow[] {
  const rows: DivisionRow[] = ((contest && contest.eds) || []).map((d) => {
    const total = d.votes[0] + d.votes[1]
    const rep =
      d.polls && d.polls[1]
        ? Math.min(100, (d.polls[0] / d.polls[1]) * 100)
        : null
    return {
      ...d,
      total,
      share: total ? (d.votes[0] / total) * 100 : null,
      reported: rep,
    }
  })
  const by: Record<DivisionSort, (a: DivisionRow, b: DivisionRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    share: (a, b) =>
      (b.share ?? -1) - (a.share ?? -1) || a.name.localeCompare(b.name),
    votes: (a, b) => b.total - a.total || a.name.localeCompare(b.name),
    polls: (a, b) =>
      (b.reported ?? -1) - (a.reported ?? -1) || a.name.localeCompare(b.name),
  }
  return rows.sort(by[sort] || by.name)
}

/** Questions whose count has started, of all questions on the ballot. */
export const questionsReporting = (
  payload: Payload | null | undefined,
  election: ReferendumElection,
): number =>
  election.questions.filter((q) => tally(contestOf(payload, q)).started).length

/** Alberta's two big cities by division name; every other division is the rest of the province. */
export const REGIONS = [
  { key: 'calgary', label: 'Calgary', short: 'Calgary', prefix: 'Calgary-' },
  {
    key: 'edmonton',
    label: 'Edmonton',
    short: 'Edmonton',
    prefix: 'Edmonton-',
  },
  { key: 'rest', label: 'Rest of Alberta', short: 'Rest of AB', prefix: '' },
] as const
export type RegionKey = (typeof REGIONS)[number]['key']

export const regionOf = (name: string | null | undefined): RegionKey =>
  (
    REGIONS.find((r) => r.prefix && String(name || '').startsWith(r.prefix)) ||
    REGIONS[REGIONS.length - 1]
  ).key

export type RegionTally = {
  key: RegionKey
  label: string
  short: string
  divisions: number
  votes: [number, number]
  total: number
  share: number | null
}

/** Each started question's option-1 share by region, from one payload's divisions. */
export function regionSplit(
  payload: Payload | null,
  election: ReferendumElection,
): { q: ReferendumQuestion; regions: RegionTally[] }[] {
  const out: { q: ReferendumQuestion; regions: RegionTally[] }[] = []
  for (const q of election.questions) {
    const contest = contestOf(payload, q)
    if (!tally(contest).started || !(contest!.eds || []).length) continue
    const regions: RegionTally[] = REGIONS.map((r) => ({
      key: r.key,
      label: r.label,
      short: r.short,
      divisions: 0,
      votes: [0, 0],
      total: 0,
      share: null,
    }))
    for (const d of contest!.eds || []) {
      const r = regions.find((x) => x.key === regionOf(d.name))!
      r.divisions++
      r.votes[0] += d.votes[0]
      r.votes[1] += d.votes[1]
    }
    for (const r of regions) {
      r.total = r.votes[0] + r.votes[1]
      r.share = r.total ? (r.votes[0] / r.total) * 100 : null
    }
    if (regions.some((r) => r.total))
      out.push({ q, regions: regions.filter((r) => r.divisions) })
  }
  return out
}

export type QuestionSeries = {
  q: ReferendumQuestion
  values: (number | null)[]
}

/** Option-1 share of every question started in the newest snapshot, at each snapshot, against polls reported; null with fewer than two reporting snapshots. */
export function shareSeries(
  snapshots: PayloadRow[],
  election: ReferendumElection,
): { rows: PayloadRow[]; xs: number[]; series: QuestionSeries[] } | null {
  const rows = snapshots.filter(
    (r) =>
      r.payload &&
      r.payload.polls &&
      r.payload.polls.total &&
      questionsReporting(r.payload, election),
  )
  if (rows.length < 2) return null
  const latest = rows[rows.length - 1].payload
  const started = election.questions.filter(
    (q) => tally(contestOf(latest, q)).started,
  )
  return {
    rows,
    xs: rows.map((r) =>
      Math.min(100, (r.payload.polls.closed / r.payload.polls.total) * 100),
    ),
    series: started.map((q) => ({
      q,
      values: rows.map((r) => {
        const t = tally(contestOf(r.payload, q))
        return t.started ? t.shares[0] : null
      }),
    })),
  }
}

/** The share of polls reported at each stored snapshot, against its wall clock; null with fewer than two snapshots that report polls. */
export function pollsSeries(
  snapshots: PayloadRow[],
): { rows: PayloadRow[]; xs: number[]; values: number[] } | null {
  const rows = snapshots.filter(
    (r) =>
      r.payload &&
      r.payload.polls &&
      r.payload.polls.total &&
      Number.isFinite(wallMs(r.payload.asOf)),
  )
  if (rows.length < 2) return null
  return {
    rows,
    xs: rows.map((r) => wallMs(r.payload.asOf)),
    values: rows.map((r) =>
      Math.min(100, (r.payload.polls.closed / r.payload.polls.total) * 100),
    ),
  }
}

/** Votes counted for each question at each stored snapshot, against its wall clock; null with fewer than two snapshots. */
export function votesSeries(
  snapshots: PayloadRow[],
  election: ReferendumElection,
): { rows: PayloadRow[]; xs: number[]; series: QuestionSeries[] } | null {
  const rows = snapshots.filter(
    (r) =>
      r.payload &&
      Number.isFinite(wallMs(r.payload.asOf)) &&
      questionsReporting(r.payload, election),
  )
  if (rows.length < 2) return null
  const latest = rows[rows.length - 1].payload
  return {
    rows,
    xs: rows.map((r) => wallMs(r.payload.asOf)),
    series: election.questions
      .filter((q) => tally(contestOf(latest, q)).started)
      .map((q) => ({
        q,
        values: rows.map((r) => {
          const t = tally(contestOf(r.payload, q))
          return t.started ? t.total : null
        }),
      })),
  }
}

export type RefMomentumRow = {
  q: ReferendumQuestion
  added: number
  overall: number
  recent: number
  change: number
}

/** Each started question's option-1 share among the votes counted since the snapshot about `minutes` before the newest, next to its overall share. */
export function momentum(
  snapshots: PayloadRow[],
  election: ReferendumElection,
  minutes = 60,
): { since: string; rows: RefMomentumRow[] } | null {
  const rows = snapshots.filter(
    (r) => r.payload && Number.isFinite(wallMs(r.payload.asOf)),
  )
  if (rows.length < 2) return null
  const latest = rows[rows.length - 1].payload
  const cutoff = wallMs(latest.asOf) - minutes * 60000
  let base = rows[0].payload
  for (const r of rows.slice(0, -1))
    if (wallMs(r.payload.asOf) <= cutoff) base = r.payload
  const out: RefMomentumRow[] = []
  for (const q of election.questions) {
    const now = tally(contestOf(latest, q))
    const then = tally(contestOf(base, q))
    const added = now.total - then.total
    if (!now.started || added <= 0) continue
    const recent = ((now.votes[0] - then.votes[0]) / added) * 100
    out.push({
      q,
      added,
      overall: now.shares[0],
      recent,
      change: recent - now.shares[0],
    })
  }
  return out.length ? { since: base.asOf, rows: out } : null
}

export type StripRow = {
  key: RegionKey
  label: string
  short: string
  dots: DivisionRow[]
}

/** One question's divisions with votes, as strip rows by region. */
export function stripRows(
  contest: Pick<Contest, 'eds'> | null | undefined,
): StripRow[] {
  const rows = divisionRows(contest, 'share').filter((r) => r.total > 0)
  return REGIONS.map((reg) => ({
    key: reg.key,
    label: reg.label,
    short: reg.short,
    dots: rows.filter((r) => regionOf(r.name) === reg.key),
  })).filter((r) => r.dots.length)
}

/** Every question has every location in, or the count is official. */
export function allReported(
  payload: Payload | null | undefined,
  election: ReferendumElection,
): boolean {
  if (!payload) return false
  if (payload.official) return true
  return election.questions.every((q) => {
    const r = reported(contestOf(payload, q))
    return !!r.total && r.closed >= r.total
  })
}

/** The source reports polls for the whole ballot, not per question (Alberta's dashboard feed). */
export const ballotWide = (election: ReferendumElection): boolean =>
  election.results.format === 'eab-dash'
