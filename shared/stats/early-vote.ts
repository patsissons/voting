// Early vote turnout for the waiting screen and its markdown: each state's
// ballots cast as a share of its 2022 midterm count (so a big state does not
// read as a busy one), the turnout map's colour steps, the party registration
// split per state and summed, and the margin bands of the party map. Turnout
// only: who has voted, never how.
import type { EarlyVote, EarlyVoteState } from '../early-vote.ts'
import type { EarlyVoteFormat, Election } from '../schema/election.ts'

/** The early vote feed an election names; the CSV when the document predates `format`. */
export const earlyVoteFormat = (election: Election): EarlyVoteFormat =>
  (election.results.earlyVote && election.results.earlyVote.format) ||
  'ufel-csv'

/** The divisions the early vote is keyed by: ridings for a district ballot, regions (states) otherwise. */
export function earlyVoteDivisions(
  election: Election,
): { key: string; label: string }[] {
  if (election.ballot === 'district')
    return election.districts.map((d) => ({ key: d.code, label: d.name }))
  return 'regions' in election ? election.regions : []
}

export type StateTurnout = EarlyVoteState & {
  key: string
  label: string
  /** voted / prior, or null without a baseline count. */
  share: number | null
}

/** Ballots cast as a share of the baseline count (the 2022 midterm, the last advance vote), or null without one. */
export const shareOfPrior = (s: EarlyVoteState): number | null =>
  s.prior ? s.voted / s.prior : null

/** Ballots cast as a share of registered voters, or null without a count. */
export const shareOfRegistered = (s: {
  voted: number
  registered?: number
}): number | null => (s.registered ? s.voted / s.registered : null)

/** The change from the baseline as a fraction (-0.11 for 11% fewer), or null without one. */
export const changeFromPrior = (s: {
  voted: number
  prior?: number
}): number | null => (s.prior ? s.voted / s.prior - 1 : null)

export type DayCount = { day: string; n: number; prior: number | null }

/**
 * The per-day totals in day order, each paired with the same-numbered day
 * of the baseline (the first advance day with the first, and so on), since
 * the calendar dates differ between elections.
 */
export function daySeries(
  days: Record<string, number> | undefined,
  priorDays?: Record<string, number>,
): DayCount[] {
  if (!days) return []
  const before = Object.keys(priorDays || {}).sort()
  return Object.keys(days)
    .sort()
    .map((day, i) => ({
      day,
      n: days[day],
      prior: priorDays && before[i] != null ? priorDays[before[i]] : null,
    }))
}

/** The states with ballots in the election's regions, most ballots first. */
export function turnoutByState(
  ev: EarlyVote,
  regions: readonly { key: string; label: string }[],
): StateTurnout[] {
  const out: StateTurnout[] = []
  for (const r of regions) {
    const s = ev.states[r.key]
    if (s)
      out.push({ ...s, key: r.key, label: r.label, share: shareOfPrior(s) })
  }
  return out.sort((a, b) => b.voted - a.voted || a.label.localeCompare(b.label))
}

/**
 * The upper edges of the map's colour steps: `steps - 1` even cuts in whole
 * multiples of 5% that reach the largest share, so the scale grows with the
 * count instead of every state landing in the top step by voting day.
 */
export function shareCuts(shares: readonly number[], steps = 5): number[] {
  const top = Math.max(0, ...shares)
  const width = Math.max(0.05, Math.ceil((top / steps) * 20) / 20)
  return Array.from(
    { length: steps - 1 },
    (_, i) => Math.round((i + 1) * width * 100) / 100,
  )
}

/** The step (0 = lowest) a share falls in. */
export const stepOf = (share: number, cuts: readonly number[]): number =>
  cuts.filter((c) => share >= c).length

export type PartySlice = { key: string; n: number; share: number }

/** A state's party registration split in a fixed order (parties, then other). */
export function partySplit(
  party: Record<string, number>,
  order: readonly string[],
): PartySlice[] {
  const keys = [
    ...order.filter((k) => k in party),
    ...Object.keys(party).filter((k) => !order.includes(k) && k !== 'other'),
    ...('other' in party ? ['other'] : []),
  ]
  const sum = keys.reduce((n, k) => n + party[k], 0)
  return keys.map((key) => ({
    key,
    n: party[key],
    share: sum ? party[key] / sum : 0,
  }))
}

export type PartyTotals = {
  /** How many states report a party split, and their ballots cast. */
  states: number
  voted: number
  /** Early voters by party across those states. */
  party: Record<string, number>
  /** The same for returned mail ballots and early in-person voters, where any state reports them. */
  mail?: Record<string, number>
  inPerson?: Record<string, number>
}

const addInto = (sum: Record<string, number>, part: Record<string, number>) => {
  for (const k of Object.keys(part)) sum[k] = (sum[k] || 0) + part[k]
}

/** Party registration summed over the states that report it. */
export function partyTotals(rows: readonly StateTurnout[]): PartyTotals {
  const out: PartyTotals = { states: 0, voted: 0, party: {} }
  const mail: Record<string, number> = {}
  const inPerson: Record<string, number> = {}
  let mails = 0
  let inPersons = 0
  for (const r of rows) {
    if (r.party) {
      out.states++
      out.voted += r.voted
      addInto(out.party, r.party)
    }
    if (r.partyMail) {
      mails++
      addInto(mail, r.partyMail)
    }
    if (r.partyInPerson) {
      inPersons++
      addInto(inPerson, r.partyInPerson)
    }
  }
  if (mails) out.mail = mail
  if (inPersons) out.inPerson = inPerson
  return out
}

/**
 * The first party's share minus the second's among the party-registered
 * (positive: the first party leads), or null without two parties or any voters.
 */
export function partyMargin(
  party: Record<string, number>,
  order: readonly string[],
): number | null {
  if (order.length < 2) return null
  const slices = partySplit(party, order)
  if (!slices.some((s) => s.n > 0)) return null
  const share = (k: string) => slices.find((s) => s.key === k)?.share || 0
  return share(order[0]) - share(order[1])
}

/** The margin map's bands: within 5 points reads neutral, then 5–15, 15–30 and 30+. */
export const MARGIN_CUTS: readonly number[] = [0.05, 0.15, 0.3]

/** The band a margin falls in: 0 inside the first cut, then ±1..±cuts.length, the sign saying who leads. */
export const marginStep = (
  margin: number,
  cuts: readonly number[] = MARGIN_CUTS,
): number => {
  const step = cuts.filter((c) => Math.abs(margin) >= c).length
  return margin < 0 && step ? -step : step
}
