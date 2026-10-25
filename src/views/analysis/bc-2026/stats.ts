// The numbers behind the BC 2026 analysis: every riding of the newest
// snapshot against its 2024 result (./prior), the advance vote and the
// election document. Contest rows exist on the newest snapshot only, so
// everything here reads the latest payload. Swing is the change in the
// Conservative lead over the NDP, in points: positive toward the
// Conservatives, negative toward the NDP.
import type { EarlyVote } from '../../../../shared/early-vote.ts'
import type { DistrictElection } from '../../../../shared/schema/election.ts'
import { linearFit, type Fit } from '../../../../shared/stats/fit.ts'
import type { Boxes, Payload } from '../../../../shared/payload.ts'
import { keyOf, ridingsOf } from '../../../../shared/stats/results.ts'
import { FINAL_BALLOTS, PRIOR, type PriorRow } from './prior'

/** The parties with a 2024 column; the rest of 2026's are new since. */
export const PRIOR_KEYS = ['ndp', 'cp', 'green', 'other'] as const

/** Swings within this many points read as no change (the map's grey). */
export const STEADY = 2

/** Final-count margins within this many points make the watch list. */
export const WATCH = 3

type Shares = Record<string, number>

export type RidingView = {
  code: string
  name: string
  region: string
  /** 2026 votes and shares by party key ('other' for everyone unaffiliated). */
  votes: Record<string, number>
  total: number
  shares: Shares
  /** 2024 shares of the final count (ndp, cp, green, other). */
  prior: Shares
  winner: string
  second: string | null
  /** The 2024 winner's party (districts[].last). */
  was: string
  /** The 2026 winner's lead over second place, in points. */
  margin: number
  /** The Conservative lead over the NDP, 2024 and 2026, and the change. */
  lead24: number
  lead26: number
  swing: number
  /** The Green share's change, where the Greens ran both times. */
  green: number | null
  /** Centre BC and OneBC together. */
  minor: number
  /** 2026 votes against 2024's advance and voting-day votes, in percent. */
  votesChange: number | null
  /** 2026 advance ballots against 2024's, in percent. */
  advanceChange: number | null
  /** The incumbent on the ballot, and whether they lost. */
  incumbent: { name: string; party: string; lost: boolean } | null
  complete: boolean
  /** A rough final count: the late ballots and where they leave the race. */
  final: FinalEstimate
}

export type FinalEstimate = {
  /** Late ballots expected, at 2024's rate for the riding. */
  late: number
  leader: string
  /** The projected leader's lead over second place, in points. */
  margin: number
}

/** Every ballot box in, advance and voting day (a riding without box counts reads as done). */
const boxesIn = (b: Boxes | undefined): boolean =>
  !b || [b.advance, b.final].every((k) => !k || k[0] >= k[1])

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

function priorShares(row: PriorRow): {
  all: Shares
  inPerson: Shares
  late: Shares
  inPersonVotes: number
  lateVotes: number
} {
  const inPerson = row.slice(0, 4)
  const late = row.slice(4)
  const a = sum(inPerson)
  const b = sum(late)
  const of = (vs: number[], t: number) => {
    const out: Shares = {}
    PRIOR_KEYS.forEach((k, i) => (out[k] = t ? (vs[i] / t) * 100 : 0))
    return out
  }
  return {
    all: of(
      inPerson.map((v, i) => v + late[i]),
      a + b,
    ),
    inPerson: of(inPerson, a),
    late: of(late, b),
    inPersonVotes: a,
    lateVotes: b,
  }
}

/** The province's 2024 late ballots per advance and voting-day ballot. */
export const lateRate = (() => {
  let a = 0
  let b = 0
  for (const row of Object.values(PRIOR)) {
    a += sum(row.slice(0, 4))
    b += sum(row.slice(4))
  }
  return a ? b / a : 0
})()

/**
 * The final count if the late ballots (mail, out-of-district, special) come
 * in at the riding's 2024 rate per counted vote and lean the way they did
 * then: each party's late share is its 2026 share moved by the gap between
 * its 2024 late and in-person shares (new parties keep their share).
 */
function finalEstimate(
  votes: Record<string, number>,
  total: number,
  p: ReturnType<typeof priorShares>,
): FinalEstimate {
  const late = p.inPersonVotes ? total * (p.lateVotes / p.inPersonVotes) : 0
  const lateShare: Shares = {}
  for (const k of Object.keys(votes)) {
    const s = total ? (votes[k] / total) * 100 : 0
    const gap =
      k in p.late && p.inPersonVotes && p.lateVotes
        ? p.late[k] - p.inPerson[k]
        : 0
    lateShare[k] = Math.max(0, s + gap)
  }
  const norm = sum(Object.values(lateShare)) || 1
  const ranked = Object.keys(votes)
    .map((k) => ({
      k,
      v: votes[k] + (late * lateShare[k]) / norm,
    }))
    .sort((a, b) => b.v - a.v)
  const t = total + late
  return {
    late,
    leader: ranked[0] ? ranked[0].k : 'other',
    margin:
      ranked.length > 1 && t ? ((ranked[0].v - ranked[1].v) / t) * 100 : 100,
  }
}

/** Every riding of the newest snapshot with its 2024 comparison. */
export function ridingViews(
  latest: Payload | null | undefined,
  election: DistrictElection,
  earlyVote: EarlyVote | null,
): RidingView[] {
  if (!latest) return []
  const districts = new Map(election.districts.map((d) => [d.code, d]))
  return ridingsOf(latest).flatMap((c) => {
    const d = districts.get(c.id)
    const row = PRIOR[c.id]
    if (!d || !row) return []
    const votes: Record<string, number> = {}
    for (const ch of c.choices)
      votes[keyOf(ch)] = (votes[keyOf(ch)] || 0) + ch.votes
    const total = sum(Object.values(votes))
    if (!total) return []
    const shares: Shares = {}
    for (const k of Object.keys(votes)) shares[k] = (votes[k] / total) * 100
    const ranked = Object.keys(votes).sort((a, b) => votes[b] - votes[a])
    const p = priorShares(row)
    const lead24 = p.all.cp - p.all.ndp
    const lead26 = (shares.cp || 0) - (shares.ndp || 0)
    const inc = c.choices.find((ch) => ch.incumbent)
    const early = earlyVote ? earlyVote.states[c.id] : undefined
    return [
      {
        code: c.id,
        name: c.label || d.name,
        region: c.region || d.region,
        votes,
        total,
        shares,
        prior: p.all,
        winner: ranked[0],
        second: ranked[1] || null,
        was: (d.last && d.last.party) || 'other',
        margin: ranked[1]
          ? shares[ranked[0]] - shares[ranked[1]]
          : shares[ranked[0]],
        lead24,
        lead26,
        swing: lead26 - lead24,
        green: shares.green && p.all.green ? shares.green - p.all.green : null,
        minor: (shares.centre || 0) + (shares.onebc || 0),
        votesChange: p.inPersonVotes
          ? (total / p.inPersonVotes - 1) * 100
          : null,
        advanceChange:
          early && early.prior ? (early.voted / early.prior - 1) * 100 : null,
        incumbent: inc
          ? {
              name: inc.name,
              party: keyOf(inc),
              lost: keyOf(inc) !== ranked[0],
            }
          : null,
        complete: boxesIn(c.boxes),
        final: finalEstimate(votes, total, p),
      },
    ]
  })
}

export type Totals = {
  votes: Record<string, number>
  total: number
  shares: Shares
}

const totalsOf = (rows: Record<string, number>[]): Totals => {
  const votes: Record<string, number> = {}
  for (const r of rows)
    for (const k of Object.keys(r)) votes[k] = (votes[k] || 0) + r[k]
  const total = sum(Object.values(votes))
  const shares: Shares = {}
  for (const k of Object.keys(votes))
    shares[k] = total ? (votes[k] / total) * 100 : 0
  return { votes, total, shares }
}

const priorVotes = (code: string): Record<string, number> => {
  const row = PRIOR[code]
  const out: Record<string, number> = {}
  PRIOR_KEYS.forEach((k, i) => (out[k] = row[i] + row[i + 4]))
  return out
}

export type Province = {
  now: Totals
  then: Totals
  lead24: number
  lead26: number
  swing: number
  /** The spread of the riding swings (population standard deviation). */
  spread: number
  /** Seats by party, 2026 and 2024. */
  seats: Record<string, number>
  seats24: Record<string, number>
  /** Seats by party had every riding moved by the province-wide change in each party's share. */
  uniform: Record<string, number>
  /** 2024 advance and voting-day votes, against which 2026's count is compared. */
  inPerson24: number
}

const count = (keys: string[]) => {
  const out: Record<string, number> = {}
  for (const k of keys) out[k] = (out[k] || 0) + 1
  return out
}

/** The province against 2024, with a uniform-swing seat count. */
export function provinceOf(views: RidingView[]): Province {
  const now = totalsOf(views.map((v) => v.votes))
  const then = totalsOf(views.map((v) => priorVotes(v.code)))
  const lead24 = (then.shares.cp || 0) - (then.shares.ndp || 0)
  const lead26 = (now.shares.cp || 0) - (now.shares.ndp || 0)
  const mean = views.length ? sum(views.map((v) => v.swing)) / views.length : 0
  const spread = views.length
    ? Math.sqrt(sum(views.map((v) => (v.swing - mean) ** 2)) / views.length)
    : 0
  const keys = Object.keys(now.shares)
  const uniform = count(
    views.map((v) => {
      let best = ''
      let top = -Infinity
      for (const k of keys) {
        const s =
          (v.prior[k] || 0) + (now.shares[k] || 0) - (then.shares[k] || 0)
        if (s > top) {
          top = s
          best = k
        }
      }
      return best
    }),
  )
  return {
    now,
    then,
    lead24,
    lead26,
    swing: lead26 - lead24,
    spread,
    seats: count(views.map((v) => v.winner)),
    seats24: count(views.map((v) => v.was)),
    uniform,
    inPerson24: sum(views.map((v) => sum(PRIOR[v.code].slice(0, 4)))),
  }
}

export type RegionSwing = {
  key: string
  label: string
  n: number
  lead24: number
  lead26: number
  swing: number
  seats: Record<string, number>
  seats24: Record<string, number>
}

/** The vote-weighted swing in each of the document's regions. */
export function regionSwings(
  views: RidingView[],
  election: DistrictElection,
): RegionSwing[] {
  return election.regions.flatMap((r) => {
    const list = views.filter((v) => v.region === r.key)
    if (!list.length) return []
    const now = totalsOf(list.map((v) => v.votes))
    const then = totalsOf(list.map((v) => priorVotes(v.code)))
    const lead24 = (then.shares.cp || 0) - (then.shares.ndp || 0)
    const lead26 = (now.shares.cp || 0) - (now.shares.ndp || 0)
    return [
      {
        key: r.key,
        label: r.label,
        n: list.length,
        lead24,
        lead26,
        swing: lead26 - lead24,
        seats: count(list.map((v) => v.winner)),
        seats24: count(list.map((v) => v.was)),
      },
    ]
  })
}

export type PartySeats = {
  key: string
  votes: number
  share: number
  seats: number
  seatShare: number
  /** Votes per seat won, or null with no seat. */
  perSeat: number | null
  share24: number | null
  seats24: number
}

/** Vote share against seat share per party, largest vote first. */
export function seatsVsVotes(
  views: RidingView[],
  province: Province,
): PartySeats[] {
  const n = views.length || 1
  return Object.keys(province.now.votes)
    .map((key) => {
      const seats = province.seats[key] || 0
      return {
        key,
        votes: province.now.votes[key],
        share: province.now.shares[key],
        seats,
        seatShare: (seats / n) * 100,
        perSeat: seats ? province.now.votes[key] / seats : null,
        share24: key in province.then.shares ? province.then.shares[key] : null,
        seats24: province.seats24[key] || 0,
      }
    })
    .sort((a, b) => b.share - a.share)
}

/** Ridings where Centre BC and OneBC together took more than the winning margin, by how far. */
export const minorMargins = (views: RidingView[]): RidingView[] =>
  views
    .filter((v) => v.minor > v.margin)
    .sort((a, b) => b.minor - b.margin - (a.minor - a.margin))

export type Pattern = { fit: Fit; n: number }

/** The swing against the change in votes and against the advance vote's growth. */
export function turnoutPatterns(views: RidingView[]): {
  votes: Pattern | null
  advance: Pattern | null
} {
  const pair = (pick: (v: RidingView) => number | null): Pattern | null => {
    const pts = views.filter((v) => pick(v) != null)
    const fit = linearFit(
      pts.map((v) => pick(v) as number),
      pts.map((v) => v.swing),
    )
    return fit ? { fit, n: pts.length } : null
  }
  return {
    votes: pair((v) => v.votesChange),
    advance: pair((v) => v.advanceChange),
  }
}

/** Ridings the final count could still decide: close now or after the estimate, or changing leader. */
export const finalWatch = (views: RidingView[]): RidingView[] =>
  views
    .filter(
      (v) =>
        v.final.leader !== v.winner ||
        v.margin < WATCH ||
        v.final.margin < WATCH,
    )
    .sort(
      (a, b) =>
        Number(b.final.leader !== b.winner) -
          Number(a.final.leader !== a.winner) ||
        a.final.margin - b.final.margin,
    )

/** The late ballots the estimate expects across the province, against 2024's final count. */
export function lateTotal(views: RidingView[]): {
  late: number
  final24: number
} {
  return { late: sum(views.map((v) => v.final.late)), final24: FINAL_BALLOTS }
}

export type LeaderResult = {
  party: string
  leader: string
  riding: RidingView
  won: boolean
}

/** How each party leader with a riding fared in it. */
export function leaders(
  views: RidingView[],
  election: DistrictElection,
): LeaderResult[] {
  const byCode = new Map(views.map((v) => [v.code, v]))
  return election.parties.flatMap((p) => {
    const riding = p.leaderDistrict ? byCode.get(p.leaderDistrict) : undefined
    if (!riding || !p.leader) return []
    return [
      {
        party: p.key,
        leader: p.leader,
        riding,
        won: riding.winner === p.key,
      },
    ]
  })
}

/** Incumbents who lost, tightest first. */
export const incumbentsLost = (views: RidingView[]): RidingView[] =>
  views
    .filter((v) => v.incumbent && v.incumbent.lost)
    .sort((a, b) => a.margin - b.margin)

/** The Green share's change by riding, where the Greens ran both times, largest gain first. */
export const greenChanges = (views: RidingView[]): RidingView[] =>
  views
    .filter((v) => v.green != null)
    .sort((a, b) => (b.green as number) - (a.green as number))
