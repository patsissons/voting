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
  /** Seats called for the party that another party held, and the party's seats called for another; null without `holders`. */
  gained: number | null
  lost: number | null
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
  const tracked = !!chamber.holders
  const row = (key: string) => {
    if (!byKey[key]) {
      byKey[key] = {
        key,
        called: 0,
        leading: 0,
        holdover: 0,
        before: before ? before[key] || 0 : null,
        net: null,
        gained: tracked ? 0 : null,
        lost: tracked ? 0 : null,
      }
      rows.push(byKey[key])
    }
    return byKey[key]
  }
  for (const p of election.parties) row(p.key)
  for (const key of Object.keys(before || {})) row(key)
  for (const key of Object.keys(chamber.holdovers || {}))
    row(key).holdover = chamber.holdovers[key]
  if (tracked) {
    for (const c of contestsOf(payload, chamber.key)) {
      const f = flipOf(chamber, c)
      if (!f) continue
      row(f.to).gained = (row(f.to).gained || 0) + 1
      row(f.from).lost = (row(f.from).lost || 0) + 1
    }
  }
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

export type RatingGrade = 'safe' | 'likely' | 'lean' | 'tossup'
export type Rating = { grade: RatingGrade; party: string | null }

/** The document's "tossup" or "<grade> <party>" as a rating. */
export const parseRating = (s: string): Rating => {
  const parts = s.split(' ')
  return { grade: parts[0] as RatingGrade, party: parts[1] || null }
}

/** A contest's division code: its id in a per-district chamber, else its state. */
export const divisionOf = (chamber: Chamber, c: Contest): string =>
  chamber.divisions[c.id] !== undefined ? c.id : c.region || c.id

/** Who held the contest's seat going in: a party key, null for an open or vacant seat, undefined when the document does not say. */
export const holderOf = (
  chamber: Chamber,
  c: Contest,
): string | null | undefined =>
  chamber.holders
    ? (chamber.holders[divisionOf(chamber, c)] ?? null)
    : undefined

/** The forecaster's rating of a division, or null without one. */
export const ratingOf = (chamber: Chamber, code: string): Rating | null =>
  chamber.ratings && chamber.ratings.divisions[code]
    ? parseRating(chamber.ratings.divisions[code])
    : null

export type Flip = { from: string; to: string }

/** A called race won by a party other than the holder's; open and vacant seats never flip. */
export function flipOf(chamber: Chamber, c: Contest): Flip | null {
  const w = calledOf(c)
  const from = holderOf(chamber, c)
  if (!w || !from) return null
  const to = w.party || 'other'
  return to === from ? null : { from, to }
}

export type GoingIn = {
  /** Divisions by the holder's party, election parties first; null without `holders`. */
  held: { key: string; n: number }[] | null
  /** Vacant and newly drawn divisions (no holder). */
  open: number
  /** Divisions per rating band, left to right: the first party's safe to lean, the toss-ups, the second party's lean to safe, then anyone else; empty without `ratings`. */
  bands: { grade: RatingGrade; party: string | null; n: number }[]
  /** Divisions rated for a party other than the holder's, in division order. */
  flips: {
    code: string
    label: string
    from: string
    to: string
    grade: RatingGrade
  }[]
  /** Divisions rated toss-up. */
  tossups: { code: string; label: string; from: string | null }[]
}

/** The chamber before the night: who holds each seat and how the forecaster rated it; null when the document has neither. */
export function goingIn(
  chamber: Chamber,
  election: ChambersElection,
): GoingIn | null {
  const holders = chamber.holders || null
  const ratings = chamber.ratings || null
  if (!holders && !ratings) return null
  const codes = Object.keys(chamber.divisions)
  const parties = election.parties.map((p) => p.key)
  const heldBy: Record<string, number> = {}
  let open = 0
  if (holders) {
    for (const code of codes) {
      const key = holders[code]
      if (key == null) open++
      else heldBy[key] = (heldBy[key] || 0) + 1
    }
  }
  // Most seats first; the election's parties break ties, then anyone else.
  const keysOf = (counts: Record<string, number>) =>
    parties
      .concat(Object.keys(counts).filter((k) => parties.indexOf(k) < 0))
      .filter((k) => counts[k])
      .sort((a, b) => counts[b] - counts[a])
  const held = holders
    ? keysOf(heldBy).map((key) => ({ key, n: heldBy[key] }))
    : null
  const bands: GoingIn['bands'] = []
  const flips: GoingIn['flips'] = []
  const tossups: GoingIn['tossups'] = []
  if (ratings) {
    const count: Record<string, number> = {}
    const ratedFor: Record<string, number> = {}
    for (const code of codes) {
      const r = parseRating(ratings.divisions[code])
      const k = `${r.grade} ${r.party || ''}`
      count[k] = (count[k] || 0) + 1
      if (r.party) ratedFor[r.party] = (ratedFor[r.party] || 0) + 1
      const from = holders ? holders[code] : null
      const label = chamber.divisions[code]
      if (r.grade === 'tossup') tossups.push({ code, label, from })
      else if (from && r.party && r.party !== from)
        flips.push({ code, label, from, to: r.party, grade: r.grade })
    }
    const side = (party: string, grades: RatingGrade[]) => {
      for (const grade of grades)
        bands.push({ grade, party, n: count[`${grade} ${party}`] || 0 })
    }
    const order = parties.concat(
      Object.keys(ratedFor).filter((k) => parties.indexOf(k) < 0),
    )
    side(order[0], ['safe', 'likely', 'lean'])
    bands.push({ grade: 'tossup', party: null, n: count['tossup '] || 0 })
    for (const key of order.slice(1)) side(key, ['lean', 'likely', 'safe'])
  }
  return { held, open, bands, flips, tossups }
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
