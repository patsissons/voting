// Ballot compass scoring. Each answer option awards a party 0-3 points;
// "matters a lot" doubles the question; an option that awards nobody is
// neutral and drops out of the denominator; a party's match is earned /
// possible over the scored questions. Two ballot models: at-large
// (election.offices, each party with slates of [ballotNumber, name,
// sitting?]) fills a ballot card from the ranking; district (one vote for one
// seat) orders the viewer's riding by the ranking instead.
import type {
  AtLargeElection,
  CompassElection,
  DistrictElection,
  SlateRow,
} from '../schema/election.ts'

export const MAXQ = 3

export type CompassState = {
  /** The question being viewed (-1 on the intro). */
  i: number
  answers: Record<number, number>
  weights: Record<number, boolean>
  done: boolean
  review: boolean
}

export const blankState = (): CompassState => ({
  i: -1,
  answers: {},
  weights: {},
  done: false,
  review: false,
})

export type ScoreRow = { p: string; pct: number }

export function score(
  election: CompassElection,
  state: Pick<CompassState, 'answers' | 'weights'>,
): { answered: number; rows: ScoreRow[] } {
  const keys = election.parties.map((p) => p.key)
  const earned: Record<string, number> = {}
  const possible: Record<string, number> = {}
  for (const k of keys) earned[k] = possible[k] = 0
  let answered = 0
  for (const qi of Object.keys(state.answers || {})) {
    const k = state.answers[Number(qi)]
    const q = election.questions[Number(qi)]
    const opt = q && q.opts[k]
    if (!opt) continue
    if (!Object.keys(opt.pts).length) continue
    const w = state.weights && state.weights[Number(qi)] ? 2 : 1
    answered++
    for (const p of keys) {
      possible[p] += MAXQ * w
      earned[p] += (opt.pts[p] || 0) * w
    }
  }
  const rows = keys
    .map((p) => ({
      p,
      pct: possible[p] ? Math.round((100 * earned[p]) / possible[p]) : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
  return { answered, rows }
}

/**
 * Where the answers put the viewer on the two-axis plane: each option may
 * carry axis deltas (e: -1 economic left to +1 right; s: -1 socially
 * conservative to +1 progressive), and the viewer's point is the weighted
 * mean of the chosen deltas per axis, "matters a lot" counting double.
 */
export function position(
  election: CompassElection,
  state: Pick<CompassState, 'answers' | 'weights'>,
): { n: number; e: number; s: number } {
  let e = 0
  let ew = 0
  let s = 0
  let sw = 0
  let n = 0
  for (const qi of Object.keys(state.answers || {})) {
    const k = state.answers[Number(qi)]
    const q = election.questions[Number(qi)]
    const opt = q && q.opts[k]
    if (!opt || !opt.axis) continue
    const w = state.weights && state.weights[Number(qi)] ? 2 : 1
    n++
    if (typeof opt.axis.e === 'number') {
      e += opt.axis.e * w
      ew += w
    }
    if (typeof opt.axis.s === 'number') {
      s += opt.axis.s * w
      sw += w
    }
  }
  return { n, e: ew ? e / ew : 0, s: sw ? s / sw : 0 }
}

export type Pick_ = {
  ballot: number
  name: string
  inc: boolean
  party: string
  out?: boolean
  in?: boolean
}
export type BallotOffice = {
  key: string
  label: string
  voteFor: number
  picks: Pick_[]
  list: Pick_[]
}

/**
 * A full ballot from the ranking: for each office, walk the parties in match
 * order (only those scoring above zero) and take their candidates, sitting
 * members first then ballot order, until the office's votes are used up. A
 * party with no mayoral candidate lends its endorsed party's. `omit` lists
 * ballot numbers the viewer swapped out: one reached while the office still
 * has room is listed with out: true and the walk moves on to the next best,
 * which is marked in: true (not on the unswapped card). `list` is the display
 * order and `picks` the ballot itself.
 */
export function ballotCard(
  election: AtLargeElection,
  rows: ScoreRow[],
  omit: number[] = [],
): BallotOffice[] {
  const P: Record<string, AtLargeElection['parties'][number]> = {}
  for (const p of election.parties) P[p.key] = p
  const ranked = rows.filter((r) => r.pct > 0).map((r) => r.p)
  const out = new Set(omit)
  const bySitting = (list: SlateRow[]) =>
    list.slice().sort((a, b) => (b[2] ? 1 : 0) - (a[2] ? 1 : 0) || a[0] - b[0])
  const slate = (
    p: AtLargeElection['parties'][number],
    office: string,
  ): SlateRow[] => {
    if (office !== 'mayor')
      return bySitting(
        (p as unknown as Record<string, SlateRow[]>)[office] || [],
      )
    if (p.mayor) return [p.mayor]
    const endorsed = p.endorsesMayor && P[p.endorsesMayor]
    return endorsed && endorsed.mayor ? [endorsed.mayor] : []
  }
  const fill = (o: AtLargeElection['offices'][number], skip: Set<number>) => {
    const list: Pick_[] = []
    const seen = new Set<number>()
    let n = 0
    for (const key of ranked) {
      if (n >= o.voteFor) break
      for (const [ballot, name, inc] of slate(P[key], o.key)) {
        if (n >= o.voteFor) break
        if (seen.has(ballot)) continue
        seen.add(ballot)
        const c: Pick_ = {
          ballot,
          name,
          inc: !!inc,
          party:
            o.key === 'mayor' && !P[key].mayor
              ? P[key].endorsesMayor || key
              : key,
        }
        if (skip.has(ballot)) c.out = true
        else n++
        list.push(c)
      }
    }
    return list
  }
  return election.offices.map((o) => {
    const list = fill(o, out)
    if (out.size) {
      const base = new Set(fill(o, new Set()).map((c) => c.ballot))
      for (const c of list) if (!c.out && !base.has(c.ballot)) c.in = true
    }
    return {
      key: o.key,
      label: o.label,
      voteFor: o.voteFor,
      picks: list.filter((c) => !c.out),
      list,
    }
  })
}

export type RidingCandidate = {
  name: string
  party: string | null
  partyName: string
  inc: boolean
  pct: number
}
export type RidingCard = {
  district: DistrictElection['districts'][number] | null
  picks: RidingCandidate[]
  others: RidingCandidate[]
}

/**
 * One riding's ballot from the ranking: the riding's candidates whose party
 * scored above zero, in match order, then everyone else in list order.
 * Returns null for an unknown code and an empty card for no code.
 */
export function ridingCard(
  election: DistrictElection,
  rows: ScoreRow[],
  code: string,
): RidingCard | null {
  const district = code
    ? (election.districts || []).find((d) => d.code === code)
    : null
  if (code && !district) return null
  if (!district) return { district: null, picks: [], others: [] }
  const pct: Record<string, number> = {}
  const rank: Record<string, number> = {}
  rows.forEach((r, i) => {
    pct[r.p] = r.pct
    rank[r.p] = i
  })
  const P: Record<string, DistrictElection['parties'][number]> = {}
  for (const p of election.parties) P[p.key] = p
  const all: RidingCandidate[] = district.candidates.map(
    ([name, party, inc, label]) => ({
      name,
      party,
      partyName: party
        ? P[party].name
        : (typeof label === 'string' && label) || 'Independent',
      inc: !!inc,
      pct: party ? pct[party] || 0 : 0,
    }),
  )
  const picks = all
    .filter((c) => c.party && c.pct > 0)
    .sort((a, b) => rank[a.party!] - rank[b.party!])
  const others = all.filter((c) => !(c.party && c.pct > 0))
  return { district, picks, others }
}
