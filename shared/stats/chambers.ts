// Pure statistics for a results-only (chambers) election: the balance of
// each chamber, a state's races, the closest uncalled races and a chamber's
// seats over the night. The page, the markdown page and the MCP tools share
// them. Nothing here touches the DOM or Intl.
import type { Choice, Contest, Payload } from '../payload.ts'
import type { Chamber, ChambersElection } from '../schema/election.ts'
import type { CloseRiding, PayloadRow, Timeline } from './results.ts'

/** The contests of one chamber, in the document's division order. */
export const contestsOf = (payload: Payload, chamber: string): Contest[] =>
  (payload.contests || []).filter((c) => c.kind === chamber)

/** Every race in a state, in chamber order. */
export const inState = (payload: Payload, state: string): Contest[] =>
  (payload.contests || []).filter((c) => c.region === state)

/** The choice the feed has called, or null. */
export const calledOf = (contest: Contest): Choice | null =>
  contest.choices.filter((c) => c.winner)[0] || null

export type BalanceRow = {
  key: string
  /** Called for the party. */
  called: number
  /** Led but not yet called. */
  leading: number
  /** Not up this time. */
  holdover: number
  /** Held going in (the document's `before`), or null when the document has none. */
  before: number | null
  /** Called plus not up, less held before: the firm net change; null without `before`. */
  net: number | null
}
export type Balance = {
  rows: BalanceRow[]
  seats: number
  majority: number | null
  /** Contests nobody leads yet. */
  undecided: number
  /** Contests the feed has called. */
  called: number
  /** Seats vacant going in (seats less the document's `before`), or null without `before`. */
  vacant: number | null
}

/**
 * One chamber's balance of power from the payload's chamber tallies and the
 * document's holdovers, one row per election party (in document order) plus
 * 'other' when anyone outside them holds or leads a seat. With `before` in
 * the document each row also carries the seats held going in and the net
 * change of its firm seats (called and not up), never of leads.
 */
export function balanceOf(
  payload: Payload,
  chamber: Chamber,
  election: ChambersElection,
): Balance {
  const tally = (payload.chambers && payload.chambers[chamber.key]) || null
  const byKey: Record<string, BalanceRow> = {}
  const rows: BalanceRow[] = []
  const before = chamber.before || null
  const row = (key: string) => {
    if (!byKey[key]) {
      byKey[key] = {
        key,
        called: 0,
        leading: 0,
        holdover: 0,
        before: before ? before[key] || 0 : null,
        net: null,
      }
      rows.push(byKey[key])
    }
    return byKey[key]
  }
  for (const p of election.parties) row(p.key)
  for (const key of Object.keys(chamber.holdovers || {}))
    row(key).holdover = chamber.holdovers[key]
  let led = 0
  let called = 0
  for (const t of (tally && tally.parties) || []) {
    const c = t.called || 0
    if (!t.leading && !c) continue
    const r = row(t.key)
    r.called = c
    r.leading = Math.max(0, t.leading - c)
    led += t.leading
    called += c
  }
  let had = 0
  if (before) {
    for (const r of rows) {
      r.net = r.called + r.holdover - (r.before || 0)
      had += r.before || 0
    }
  }
  const up = Object.keys(chamber.divisions).length
  return {
    rows,
    seats: chamber.seats,
    majority: chamber.majority == null ? null : chamber.majority,
    undecided: Math.max(0, up - led),
    called,
    vacant: before ? Math.max(0, chamber.seats - had) : null,
  }
}

/** The tightest contests not yet called, by the leader's margin in points. */
export function closestIn(contests: Contest[], n = 8): CloseRiding[] {
  return contests
    .filter(
      (c) => c.choices.length > 1 && c.choices[0].votes > 0 && !calledOf(c),
    )
    .map((c) => ({
      id: c.id,
      label: c.label,
      lead: c.choices[0],
      next: c.choices[1],
      margin: c.choices[0].pct - c.choices[1].pct,
      votes: c.choices[0].votes - c.choices[1].votes,
    }))
    .sort(
      (a, b) =>
        a.margin - b.margin ||
        a.votes - b.votes ||
        a.label.localeCompare(b.label),
    )
    .slice(0, n)
}

/** Seats led per party in one chamber at every snapshot, against the chamber's share of the expected vote. */
export function chamberTimeline(
  snapshots: PayloadRow[],
  chamber: string,
  election: ChambersElection,
): Timeline | null {
  const points = snapshots.filter(
    (r) => r.payload && r.payload.chambers && r.payload.chambers[chamber],
  )
  if (points.length < 2) return null
  const tally = (payload: Payload) => {
    const out: Record<string, number> = {}
    for (const x of payload.chambers![chamber].parties) out[x.key] = x.leading
    return out
  }
  const final = tally(points[points.length - 1].payload)
  const keys = Object.keys(final)
    .filter((k) => final[k] > 0 || k !== 'other')
    .sort((a, b) => final[b] - final[a])
    .slice(0, 4)
  if (!keys.length) return null
  const names: Record<string, { name: string; short: string }> = {}
  for (const p of election.parties) names[p.key] = p
  return {
    rows: points,
    xs: points.map((r) => r.payload.chambers![chamber].reporting),
    series: keys.map((k) => ({
      id: k,
      label: k === 'other' || !names[k] ? 'Others' : names[k].name,
      short: k === 'other' || !names[k] ? 'Others' : names[k].short,
      party: k === 'other' || !names[k] ? null : k,
      values: points.map((r) => tally(r.payload)[k] || 0),
    })),
  }
}
