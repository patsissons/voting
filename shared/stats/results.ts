// Pure statistics over results payloads for at-large (Vancouver) and riding
// (BC) elections: what the results page, the markdown page and the MCP tools
// all compute the same way. Nothing here touches the DOM or Intl.
import type { Choice, Contest, Payload, Snapshot } from '../payload.ts'
import type { CompassElection, PartyElection } from '../schema/election.ts'

export type PayloadRow = Pick<Snapshot, 'payload'> & Partial<Snapshot>

/** A wall-clock stamp ("2026-10-19 20:20:00") as milliseconds, for differences between stamps of one night only. */
export function wallMs(stamp: string | null | undefined): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    String(stamp || ''),
  )
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : NaN
}

/**
 * Every place and tabulator in, or the certified count. An Elections BC
 * payload (it carries the page's count status) is only complete once
 * official: all ballot boxes in ends the initial count, and mail-in and
 * absentee ballots join at the final count days later.
 */
export function complete(
  payload: Partial<Payload> | null | undefined,
): boolean {
  if (!payload) return false
  if (payload.official) return true
  if (payload.status) return false
  const p = payload.polls || { closed: 0, total: 0 }
  const t = payload.tabulators
  return (
    p.total > 0 &&
    p.closed >= p.total &&
    (!t || !t.total || t.closed >= t.total)
  )
}

/** The page says its initial count is complete (every riding's boxes in). */
export const initialDone = (
  payload: Partial<Payload> | null | undefined,
): boolean =>
  !!(
    payload &&
    payload.status &&
    /complete/i.test(payload.status.initial || '')
  )

export const officeContests = (
  payload: Payload,
  election: CompassElection,
): Contest[] =>
  (election.offices || [])
    .map((o) => payload.contests.find((c) => c.kind === o.key))
    .filter((c): c is Contest => !!c)
export const partyOrder = (election: PartyElection): string[] => [
  ...election.parties.map((p) => p.key),
  'other',
]
export const keyOf = (c: Pick<Choice, 'party'>): string => c.party || 'other'

export type PartyShare = {
  key: string
  votes: number
  candidates: number
  share: number
}
export type OfficeShares = {
  kind: string
  label: string
  total: number
  parts: PartyShare[]
}

/** Each office's votes split by party, compass order then others. */
export function partyShares(
  payload: Payload,
  election: CompassElection,
): OfficeShares[] {
  return officeContests(payload, election).map((contest) => {
    const total = contest.choices.reduce((n, c) => n + c.votes, 0)
    const parts = partyOrder(election)
      .map((key) => {
        const mine = contest.choices.filter((c) => keyOf(c) === key)
        const votes = mine.reduce((n, c) => n + c.votes, 0)
        return {
          key,
          votes,
          candidates: mine.length,
          share: total ? (votes / total) * 100 : 0,
        }
      })
      .filter((x) => x.candidates > 0)
    return { kind: contest.kind, label: contest.label, total, parts }
  })
}

export type Seat = {
  key: string
  name: string
  ballot: number | null
  votes: number
}
export type CityHall = {
  offices: { kind: string; label: string; voteFor: number; seats: Seat[] }[]
  totals: { key: string; seats: number }[]
  seats: number
}

/** Every seat on every office's ballot, filled by the current rank. */
export function cityHallSeats(
  payload: Payload,
  election: CompassElection,
): CityHall {
  const offices = officeContests(payload, election).map((contest) => ({
    kind: contest.kind,
    label: contest.label,
    voteFor: contest.voteFor,
    seats: contest.choices.slice(0, contest.voteFor).map((c) => ({
      key: keyOf(c),
      name: c.name,
      ballot: c.ballot,
      votes: c.votes,
    })),
  }))
  const counts = new Map<string, number>()
  for (const o of offices)
    for (const s of o.seats) counts.set(s.key, (counts.get(s.key) || 0) + 1)
  const totals = partyOrder(election)
    .filter((k) => counts.has(k))
    .map((key) => ({ key, seats: counts.get(key)! }))
  return {
    offices,
    totals,
    seats: offices.reduce((n, o) => n + o.seats.length, 0),
  }
}

export type SeriesRow = {
  id: string
  ballot?: number | null
  name: string
  party: string | null
  votes: number
}
export type Series = (payload: Payload) => SeriesRow[] | null

/** The mayoral choices as momentum series (one row per candidate). */
export const mayorSeries: Series = (payload) => {
  const mayor = payload.contests.find((c) => c.kind === 'mayor')
  return mayor
    ? mayor.choices.map((c) => ({
        id: `${c.ballot}|${c.name}`,
        ballot: c.ballot,
        name: c.name,
        party: c.party,
        votes: c.votes,
      }))
    : null
}

/** Province-wide popular vote as momentum series. */
export const popularSeries =
  (election: PartyElection): Series =>
  (payload) => {
    const rows = (payload.summary && payload.summary.parties) || null
    if (!rows) return null
    const names: Record<string, string> = {}
    for (const p of election.parties) names[p.key] = p.name
    return rows
      .map((x) => ({
        id: x.key,
        name: x.key === 'other' ? 'Others' : names[x.key] || x.key,
        party: x.key === 'other' ? null : x.key,
        votes: x.votes,
      }))
      .sort((a, b) => b.votes - a.votes)
  }

export type MomentumRow = {
  id: string
  ballot?: number | null
  name: string
  party: string | null
  overall: number
  recent: number
  change: number
}
export type Momentum = {
  since: string
  votes: number
  ballots: number
  rows: MomentumRow[]
}

/**
 * Each series' share of the votes added since the snapshot about `minutes`
 * before the newest (or the first stored one), next to its overall share.
 * `series(payload)` lists rows largest first, or null when the payload has
 * none; the default is the mayoral race.
 */
export function momentum(
  snapshots: PayloadRow[],
  minutes = 60,
  top = 4,
  series: Series = mayorSeries,
): Momentum | null {
  const rows = snapshots.filter((r) => r.payload && series(r.payload))
  if (rows.length < 2) return null
  const latest = rows[rows.length - 1].payload
  const cutoff = wallMs(latest.asOf) - minutes * 60000
  let base = rows[0].payload
  for (const r of rows.slice(0, -1))
    if (wallMs(r.payload.asOf) <= cutoff) base = r.payload
  const now = series(latest)!
  const then = series(base)!
  const sum = (list: SeriesRow[]) => list.reduce((n, x) => n + x.votes, 0)
  const total = sum(now)
  const added = total - sum(then)
  if (added <= 0) return null
  const before = (c: SeriesRow) => {
    const hit = then.find((x) => x.id === c.id)
    return hit ? hit.votes : 0
  }
  return {
    since: base.asOf,
    votes: added,
    ballots: latest.ballots - base.ballots,
    rows: now.slice(0, top).map((c) => {
      const overall = total ? (c.votes / total) * 100 : 0
      const recent = ((c.votes - before(c)) / added) * 100
      return {
        id: c.id,
        ballot: c.ballot,
        name: c.name,
        party: c.party,
        overall,
        recent,
        change: recent - overall,
      }
    }),
  }
}

export type SeatLinePoint = {
  asOf: string
  reported: number
  polls: Payload['polls']
  gap: number
  last: { name: string; party: string | null }
  next: { name: string; party: string | null }
}
export type SeatLineRace = {
  kind: string
  label: string
  voteFor: number
  points: SeatLinePoint[]
}

/** Per multi-seat office: the vote gap between the last seat in and the first name out, at every snapshot. */
export function seatLineRace(
  snapshots: PayloadRow[],
  election: CompassElection,
): SeatLineRace[] {
  const rows = snapshots.filter(
    (r) => r.payload && r.payload.polls && r.payload.polls.total,
  )
  if (rows.length < 2) return []
  const latest = rows[rows.length - 1].payload
  return officeContests(latest, election)
    .filter((c) => c.voteFor > 1 && c.choices.length > c.voteFor)
    .map((office) => {
      const n = office.voteFor
      const points: SeatLinePoint[] = []
      for (const r of rows) {
        const c = r.payload.contests.find((x) => x.kind === office.kind)
        if (!c || c.choices.length <= n) continue
        const last = c.choices[n - 1]
        const next = c.choices[n]
        points.push({
          asOf: r.payload.asOf,
          reported: (r.payload.polls.closed / r.payload.polls.total) * 100,
          polls: r.payload.polls,
          gap: last.votes - next.votes,
          last: { name: last.name, party: last.party },
          next: { name: next.name, party: next.party },
        })
      }
      return { kind: office.kind, label: office.label, voteFor: n, points }
    })
    .filter((x) => x.points.length >= 2)
}

export type SeatCentre = {
  parties: { key: string; seats: number }[]
  centre: { x: number; y: number } | null
  unplaced: number
}

/** Seats by party and their seat-weighted centre on the compass plane; seats outside the compass parties are counted, not placed. */
export function seatCentre(
  counts: Iterable<[string, number]>,
  election: CompassElection,
): SeatCentre {
  const byKey: Record<string, CompassElection['parties'][number]> = {}
  for (const p of election.parties) byKey[p.key] = p
  const map = new Map(counts)
  const parties = partyOrder(election)
    .filter((k) => map.has(k))
    .map((key) => ({ key, seats: map.get(key)! }))
  const placed = parties.filter((p) => byKey[p.key] && byKey[p.key].axis)
  const weight = placed.reduce((n, p) => n + p.seats, 0)
  const centre = weight
    ? {
        x:
          placed.reduce((n, p) => n + byKey[p.key].axis.e * p.seats, 0) /
          weight,
        y:
          placed.reduce((n, p) => n + byKey[p.key].axis.s * p.seats, 0) /
          weight,
      }
    : null
  const seats = parties.reduce((n, p) => n + p.seats, 0)
  return { parties, centre, unplaced: seats - weight }
}

/** Council seats by party, on the compass plane. */
export function councilCentre(
  payload: Payload,
  election: CompassElection,
): SeatCentre | null {
  const council = payload.contests.find((c) => c.kind === 'council')
  if (!council) return null
  const counts = new Map<string, number>()
  for (const c of council.choices.slice(0, council.voteFor))
    counts.set(keyOf(c), (counts.get(keyOf(c)) || 0) + 1)
  return seatCentre(counts, election)
}

// ---- riding elections (kind "district") ----

export const ridingsOf = (payload: Payload): Contest[] =>
  payload.contests.filter((c) => c.kind === 'district')

/** A riding's leader: the top choice once it has votes and nobody ties it. */
export function leaderOf(contest: Contest): Choice | null {
  const lead = contest.choices[0]
  if (!lead || !lead.votes) return null
  const second = contest.choices[1]
  if (second && second.votes === lead.votes) return null
  return lead
}

/** Ridings led by party, compass order then others. */
export function ridingsLed(
  ridings: Contest[],
  election: PartyElection,
): [string, number][] {
  const counts = new Map<string, number>()
  for (const c of ridings) {
    const lead = leaderOf(c)
    if (lead) counts.set(keyOf(lead), (counts.get(keyOf(lead)) || 0) + 1)
  }
  return partyOrder(election)
    .filter((k) => counts.has(k))
    .map((k) => [k, counts.get(k)!])
}

/** The ridings currently led, on the compass plane. */
export function legislatureCentre(
  payload: Payload,
  election: CompassElection,
): SeatCentre | null {
  const counts = ridingsLed(ridingsOf(payload), election)
  return counts.length ? seatCentre(counts, election) : null
}

export type BoxesReported = {
  advance: [number, number]
  final: [number, number]
  ridingsIn: number
  ridings: number
  /** Ridings whose page has an out-of-district line (2024 did, 2026 does not). */
  oodReported: number
  oodComplete: number
}

/** Ballot boxes across every riding: advance and Final Voting Day boxes, ridings with every box in, and ridings whose out-of-district count is done. */
export function boxesReported(payload: Payload): BoxesReported {
  const out: BoxesReported = {
    advance: [0, 0],
    final: [0, 0],
    ridingsIn: 0,
    ridings: 0,
    oodReported: 0,
    oodComplete: 0,
  }
  for (const c of ridingsOf(payload)) {
    const b = c.boxes || { advance: null, final: null, ood: '' }
    out.ridings++
    for (const kind of ['advance', 'final'] as const) {
      const pair = b[kind]
      if (!pair) continue
      out[kind][0] += pair[0]
      out[kind][1] += pair[1]
    }
    const pairs = [b.advance, b.final].filter((x): x is [number, number] => !!x)
    if (pairs.length && pairs.every((x) => x[1] > 0 && x[0] >= x[1]))
      out.ridingsIn++
    if (b.ood) out.oodReported++
    if (/complete/i.test(b.ood || '')) out.oodComplete++
  }
  return out
}

/** Rejected ballots across every riding, or null when the page does not report them (2024). */
export function rejectedBallots(payload: Payload): number | null {
  const listed = ridingsOf(payload).filter((c) => c.rejected != null)
  return listed.length
    ? listed.reduce((n, c) => n + (c.rejected || 0), 0)
    : null
}

export type Flip = {
  id: string
  label: string
  from: string
  to: string
  lead: string
  margin: number
}
export type FlipPair = { from: string; to: string; n: number; ridings: Flip[] }

/** Ridings whose leader is not the last winner's party (districts[].last), tightest margin first within each from -> to pair. */
export function changingHands(
  payload: Payload,
  election: CompassElection,
): { flips: Flip[]; byPair: FlipPair[] } {
  const districts: Record<string, { last?: { party: string | null } | null }> =
    {}
  if (election.ballot === 'district')
    for (const d of election.districts) districts[d.code] = d
  const flips: Flip[] = []
  for (const c of ridingsOf(payload)) {
    const d = districts[c.id]
    const lead = leaderOf(c)
    if (!d || !d.last || !lead) continue
    const from = d.last.party || 'other'
    const to = keyOf(lead)
    if (from === to) continue
    const second = c.choices[1]
    flips.push({
      id: c.id,
      label: c.label,
      from,
      to,
      lead: lead.name,
      margin: second ? lead.pct - second.pct : lead.pct,
    })
  }
  const pairs = new Map<string, FlipPair>()
  for (const f of flips) {
    const key = `${f.from}>${f.to}`
    if (!pairs.has(key))
      pairs.set(key, { from: f.from, to: f.to, n: 0, ridings: [] })
    const pair = pairs.get(key)!
    pair.n++
    pair.ridings.push(f)
  }
  const byPair: FlipPair[] = []
  pairs.forEach((p) => byPair.push(p))
  byPair.sort(
    (a, b) =>
      b.n - a.n || a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  )
  for (const pair of byPair) pair.ridings.sort((a, b) => a.margin - b.margin)
  return { flips, byPair }
}

/** Each party's share of a contest's votes, the unaffiliated together under 'other', largest first. */
export function voteShares(contest: Contest): { key: string; share: number }[] {
  const votes = new Map<string, number>()
  for (const c of contest.choices)
    votes.set(keyOf(c), (votes.get(keyOf(c)) || 0) + c.votes)
  let total = 0
  votes.forEach((v) => (total += v))
  const out: { key: string; share: number }[] = []
  votes.forEach((v, key) =>
    out.push({ key, share: total ? (v / total) * 100 : 0 }),
  )
  return out.sort((a, b) => b.share - a.share)
}

export type CloseRiding = {
  id: string
  label: string
  lead: Choice
  next: Choice
  margin: number
  votes: number
}

/** The tightest ridings by the leader's lead in points over second place. */
export function closest(payload: Payload, n = 8): CloseRiding[] {
  return ridingsOf(payload)
    .filter((c) => c.choices.length > 1 && c.choices[0].votes > 0)
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

export type RegionShare = {
  key: string
  label: string
  ridings: number
  total: number
  parts: { key: string; votes: number; share: number; led: number }[]
}

/** Each region's votes split by party, with the ridings each party leads. */
export function regionShares(
  payload: Payload,
  election: CompassElection,
): RegionShare[] {
  const ridings = ridingsOf(payload)
  const regions = election.ballot === 'district' ? election.regions : []
  return regions
    .map((reg) => {
      const list = ridings.filter((c) => c.region === reg.key)
      const votes = new Map<string, number>()
      const led = new Map<string, number>()
      for (const c of list) {
        for (const ch of c.choices)
          votes.set(keyOf(ch), (votes.get(keyOf(ch)) || 0) + ch.votes)
        const lead = leaderOf(c)
        if (lead) led.set(keyOf(lead), (led.get(keyOf(lead)) || 0) + 1)
      }
      let total = 0
      votes.forEach((v) => (total += v))
      const parts = partyOrder(election)
        .filter((k) => votes.has(k))
        .map((key) => ({
          key,
          votes: votes.get(key)!,
          share: total ? (votes.get(key)! / total) * 100 : 0,
          led: led.get(key) || 0,
        }))
      return {
        key: reg.key,
        label: reg.label,
        ridings: list.length,
        total,
        parts,
      }
    })
    .filter((r) => r.ridings)
}

export type TimelineSeries = {
  id: string
  label: string
  short: string
  party: string | null
  values: number[]
}
export type Timeline = {
  xs: number[]
  rows: PayloadRow[]
  series: TimelineSeries[]
}

/** The mayoral vote share of the four leaders at every snapshot with polls, against the share of places reported. */
export function mayorTimeline(
  snapshots: PayloadRow[],
  election: CompassElection,
): Timeline | null {
  const points = snapshots.filter((r) => r.payload && r.payload.polls.total)
  if (points.length < 2) return null
  const mayorOf = (payload: Payload) =>
    payload.contests.find((c) => c.kind === 'mayor')
  const final = mayorOf(points[points.length - 1].payload)
  if (!final) return null
  const short: Record<string, string> = {}
  for (const p of election.parties) short[p.key] = p.short
  return {
    rows: points,
    xs: points.map(
      (r) => (r.payload.polls.closed / r.payload.polls.total) * 100,
    ),
    series: final.choices.slice(0, 4).map((c) => ({
      id: `${c.ballot}|${c.name}`,
      label: `${c.name}${c.party ? ` (${short[c.party]})` : ''}`,
      short: c.name.split(' ').slice(-1)[0],
      party: c.party,
      values: points.map((r) => {
        const m = mayorOf(r.payload)
        const hit =
          m && m.choices.find((x) => x.ballot === c.ballot && x.name === c.name)
        return hit ? hit.pct : 0
      }),
    })),
  }
}

/** Ridings led by the top four parties at every snapshot with polls, against the share of boxes reported. */
const partyVotes = (payload: Payload): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const x of (payload.summary && payload.summary.parties) || [])
    out[x.key] = x.votes
  return out
}
const sumOf = (votes: Record<string, number>) =>
  Object.values(votes).reduce((n, v) => n + v, 0)

/** The parties a clock timeline follows: each with at least `floor`% of the newest count, largest first, at most `top`. */
function clockSeries(
  latest: Payload,
  election: PartyElection,
  top: number,
  floor = 1,
): Omit<TimelineSeries, 'values'>[] {
  const votes = partyVotes(latest)
  const total = sumOf(votes)
  const names: Record<string, { name: string; short: string }> = {}
  for (const p of election.parties) names[p.key] = p
  return Object.keys(votes)
    .filter((k) => total > 0 && (votes[k] / total) * 100 >= floor)
    .sort((a, b) => votes[b] - votes[a])
    .slice(0, top)
    .map((k) => ({
      id: k,
      label: k === 'other' || !names[k] ? 'Others' : names[k].name,
      short: k === 'other' || !names[k] ? 'Others' : names[k].short,
      party: k === 'other' ? null : k,
    }))
}

/** Snapshots with a stamp and a counted province-wide vote, oldest first. */
const clockRows = (snapshots: PayloadRow[]) =>
  snapshots.filter(
    (r) =>
      r.payload &&
      r.payload.summary &&
      Number.isFinite(wallMs(r.payload.asOf)) &&
      sumOf(partyVotes(r.payload)) > 0,
  )

/** Each party's share of all votes counted so far at every snapshot, against the clock (xs are wall-clock ms). */
export function shareClock(
  snapshots: PayloadRow[],
  election: PartyElection,
  top = 6,
): Timeline | null {
  const rows = clockRows(snapshots)
  if (rows.length < 2) return null
  const keys = clockSeries(rows[rows.length - 1].payload, election, top)
  if (!keys.length) return null
  const shares = rows.map((r) => {
    const votes = partyVotes(r.payload)
    const total = sumOf(votes)
    return (k: string) => ((votes[k] || 0) / total) * 100
  })
  return {
    rows,
    xs: rows.map((r) => wallMs(r.payload.asOf)),
    series: keys.map((s) => ({ ...s, values: shares.map((f) => f(s.id)) })),
  }
}

/**
 * Each party's share of the votes added in the `minutes` before every
 * snapshot, against the clock: the momentum line. A party running above its
 * overall share is gaining. A snapshot with no earlier one that far back
 * measures from the first stored one; snapshots that added no votes are left
 * out.
 */
export function momentumClock(
  snapshots: PayloadRow[],
  election: PartyElection,
  minutes = 15,
  top = 6,
): Timeline | null {
  const rows = clockRows(snapshots)
  if (rows.length < 2) return null
  const keys = clockSeries(rows[rows.length - 1].payload, election, top)
  if (!keys.length) return null
  const points: { row: PayloadRow; share: (k: string) => number }[] = []
  for (let i = 1; i < rows.length; i++) {
    const cutoff = wallMs(rows[i].payload.asOf) - minutes * 60000
    let base = rows[0]
    for (let j = 0; j < i; j++)
      if (wallMs(rows[j].payload.asOf) <= cutoff) base = rows[j]
    const now = partyVotes(rows[i].payload)
    const then = partyVotes(base.payload)
    const added = sumOf(now) - sumOf(then)
    if (added <= 0) continue
    points.push({
      row: rows[i],
      share: (k) => Math.max(0, ((now[k] || 0) - (then[k] || 0)) / added) * 100,
    })
  }
  if (points.length < 2) return null
  return {
    rows: points.map((p) => p.row),
    xs: points.map((p) => wallMs(p.row.payload.asOf)),
    series: keys.map((s) => ({
      ...s,
      values: points.map((p) => p.share(s.id)),
    })),
  }
}

export function seatsTimeline(
  snapshots: PayloadRow[],
  election: PartyElection,
): Timeline | null {
  const points = snapshots.filter((r) => r.payload && r.payload.polls.total)
  if (points.length < 2) return null
  const tally = (payload: Payload) => {
    const out: Record<string, number> = {}
    for (const x of (payload.summary && payload.summary.parties) || [])
      out[x.key] = x.leading
    return out
  }
  const final = tally(points[points.length - 1].payload)
  const keys = Object.keys(final)
    .sort((a, b) => final[b] - final[a])
    .slice(0, 4)
  if (!keys.length) return null
  const names: Record<string, { name: string; short: string }> = {}
  for (const p of election.parties) names[p.key] = p
  return {
    rows: points,
    xs: points.map(
      (r) => (r.payload.polls.closed / r.payload.polls.total) * 100,
    ),
    series: keys.map((k) => ({
      id: k,
      label: k === 'other' ? 'Others' : names[k].name,
      short: k === 'other' ? 'Others' : names[k].short,
      party: k === 'other' ? null : k,
      values: points.map((r) => tally(r.payload)[k] || 0),
    })),
  }
}
