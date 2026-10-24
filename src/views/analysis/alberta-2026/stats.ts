// The numbers behind the Alberta 2026 analysis. Division rows exist on the
// newest snapshot only (older rows are stripped of them), so everything by
// division reads the latest payload; the over-time pieces read every
// snapshot, which keeps each question's totals.
import type { Payload } from '../../../../shared/payload.ts'
import type {
  ReferendumElection,
  ReferendumQuestion,
} from '../../../../shared/schema/election.ts'
import { linearFit, type Fit } from '../../../../shared/stats/fit.ts'
import {
  contestOf,
  pollRange,
  questionsReporting,
  regionOf,
  tally,
  wallMs,
  type RegionKey,
} from '../../../../shared/stats/referendum.ts'
import type { PayloadRow } from '../../../../shared/stats/results.ts'

/** Question 10, the separation question: its divisions are read as the Begin process share (option 2). */
export const SEPARATION = 10

/**
 * The smaller-city and commuter-belt divisions, picked by hand; the rest of
 * the province outside Calgary and Edmonton counts as rural.
 */
export const SMALLER_CITIES = new Set([
  '47', // Airdrie-Cochrane
  '48', // Airdrie-East
  '56', // Chestermere-Strathmore
  '61', // Fort McMurray-Wood Buffalo
  '63', // Grande Prairie
  '69', // Leduc-Beaumont
  '71', // Lethbridge-East
  '72', // Lethbridge-West
  '75', // Morinville-St. Albert
  '78', // Red Deer-North
  '79', // Red Deer-South
  '81', // Sherwood Park
  '82', // Spruce Grove-Stony Plain
  '83', // St. Albert
  '84', // Strathcona-Sherwood Park
])

export type Region = 'calgary' | 'edmonton' | 'cities' | 'rural'
export const REGIONS: { key: Region; label: string }[] = [
  { key: 'calgary', label: 'Calgary' },
  { key: 'edmonton', label: 'Edmonton' },
  { key: 'cities', label: 'Smaller cities' },
  { key: 'rural', label: 'Rural' },
]

export type DivisionView = {
  code: string
  name: string
  /** Calgary, Edmonton or the rest (the scatter's colours). */
  group: RegionKey
  region: Region
  polls: [number, number | null] | null
  complete: boolean
  /** Votes per question number. */
  votes: Record<number, [number, number]>
  /** Ballots counted per question number. */
  ballots: Record<number, number>
  /** Option-1 share per question number, except the Begin process share for Question 10. */
  y: Record<number, number | null>
}

/** The share a division's votes give a question: option 1, or option 2 on the separation question. */
export const sideShare = (n: number, v: [number, number]): number | null => {
  const t = v[0] + v[1]
  return t ? ((n === SEPARATION ? v[1] : v[0]) / t) * 100 : null
}

/** Every division of the newest snapshot with its shares on every question. */
export function divisionsOf(
  latest: Payload | null | undefined,
  election: ReferendumElection,
): DivisionView[] {
  const byQ = election.questions.map((q) => ({
    n: q.n,
    eds: new Map(
      ((contestOf(latest, q) || { eds: [] }).eds || []).map((d) => [d.code, d]),
    ),
  }))
  const base = byQ.find((b) => b.n === SEPARATION) || byQ[0]
  if (!base) return []
  return [...base.eds.values()].map((d) => {
    const group = regionOf(d.name)
    const view: DivisionView = {
      code: d.code,
      name: d.name,
      group,
      region:
        group === 'rest'
          ? SMALLER_CITIES.has(d.code)
            ? 'cities'
            : 'rural'
          : group,
      polls: d.polls,
      complete: !!(d.polls && d.polls[1] && d.polls[0] >= d.polls[1]),
      votes: {},
      ballots: {},
      y: {},
    }
    for (const b of byQ) {
      const e = b.eds.get(d.code)
      if (!e) continue
      view.votes[b.n] = e.votes
      view.ballots[b.n] = e.votes[0] + e.votes[1]
      view.y[b.n] = sideShare(b.n, e.votes)
    }
    return view
  })
}

export type Residual = { d: DivisionView; e: number }
export type QuestionFit = { n: number; fit: Fit; residuals: Residual[] }

/** Each other question's share across divisions against the Begin process share, residuals largest first. */
export function fitsAgainstSeparation(
  divs: DivisionView[],
  election: ReferendumElection,
): QuestionFit[] {
  return election.questions
    .filter((q) => q.n !== SEPARATION)
    .flatMap((q) => {
      const pts = divs.filter(
        (d) => d.y[q.n] != null && d.y[SEPARATION] != null,
      )
      const fit = linearFit(
        pts.map((d) => d.y[SEPARATION] as number),
        pts.map((d) => d.y[q.n] as number),
      )
      if (!fit) return []
      const residuals = pts
        .map((d) => ({
          d,
          e:
            (d.y[q.n] as number) -
            (fit.a + fit.b * (d.y[SEPARATION] as number)),
        }))
        .sort((a, b) => b.e - a.e)
      return [{ n: q.n, fit, residuals }]
    })
    .sort((a, b) => a.n - b.n)
}

/** Vote-weighted shares (option 1, Begin process on Question 10) by region, plus the province. */
export function regionShares(
  divs: DivisionView[],
  election: ReferendumElection,
  latest: Payload | null | undefined,
): {
  rows: {
    key: Region
    label: string
    n: number
    shares: Record<number, number | null>
  }[]
  province: Record<number, number | null>
} {
  const rows = REGIONS.map((r) => {
    const inRegion = divs.filter((d) => d.region === r.key)
    const shares: Record<number, number | null> = {}
    for (const q of election.questions) {
      let side = 0
      let total = 0
      for (const d of inRegion) {
        const v = d.votes[q.n]
        if (!v) continue
        side += q.n === SEPARATION ? v[1] : v[0]
        total += v[0] + v[1]
      }
      shares[q.n] = total ? (side / total) * 100 : null
    }
    return { key: r.key, label: r.label, n: inRegion.length, shares }
  })
  const province: Record<number, number | null> = {}
  for (const q of election.questions) {
    const t = tally(contestOf(latest, q))
    province[q.n] = t.started ? sideShare(q.n, t.votes) : null
  }
  return { rows, province }
}

export type PollGap = {
  q: ReferendumQuestion
  value: number
  range: { lo: number; hi: number; latest: number } | null
}

/** Each question's option-1 share against its published polls (the first listed is the latest). */
export function pollGaps(
  latest: Payload | null | undefined,
  election: ReferendumElection,
): PollGap[] {
  return election.questions.flatMap((q) => {
    const t = tally(contestOf(latest, q))
    if (!t.started) return []
    const r = pollRange(q, 0)
    const first = (q.polls || []).find((p) => typeof p.pct[0] === 'number')
    return [
      {
        q,
        value: t.shares[0],
        range:
          r && first
            ? { lo: r.lo, hi: r.hi, latest: first.pct[0] as number }
            : null,
      },
    ]
  })
}

export type ShareSeries = {
  rows: PayloadRow[]
  xs: number[]
  series: { q: ReferendumQuestion; values: (number | null)[] }[]
}

/** Option-1 share of the chosen questions at each snapshot, against its wall clock; null with fewer than two snapshots. */
export function shareOverTime(
  snapshots: PayloadRow[],
  election: ReferendumElection,
  ns: number[],
): ShareSeries | null {
  const rows = snapshots.filter(
    (r) =>
      r.payload &&
      Number.isFinite(wallMs(r.payload.asOf)) &&
      questionsReporting(r.payload, election),
  )
  if (rows.length < 2) return null
  return {
    rows,
    xs: rows.map((r) => wallMs(r.payload.asOf)),
    series: ns.flatMap((n) => {
      const q = election.questions.find((x) => x.n === n)
      if (!q) return []
      return [
        {
          q,
          values: rows.map((r) => {
            const t = tally(contestOf(r.payload, q))
            return t.started ? t.shares[0] : null
          }),
        },
      ]
    }),
  }
}

export type Flip = {
  q: ReferendumQuestion
  peak: number
  peakAt: string
  final: number
  /** The stamp of the last snapshot where the question crossed 50%. */
  lastCross: string
}

/** Questions that led one way during the count and finished the other, with their peak and last crossing. */
export function flips(data: ShareSeries | null): Flip[] {
  if (!data) return []
  return data.series.flatMap((s) => {
    let peak = -1
    let peakAt = ''
    let lastCross = ''
    let prev: number | null = null
    let final: number | null = null
    s.values.forEach((v, i) => {
      if (v == null) return
      const at = data.rows[i].payload.asOf
      if (v > peak) {
        peak = v
        peakAt = at
      }
      if (prev != null && prev > 50 !== v > 50) lastCross = at
      prev = v
      final = v
    })
    if (final == null || !lastCross) return []
    return [{ q: s.q, peak, peakAt, final, lastCross }]
  })
}

export type Projection = {
  n: number
  now: number
  projected: number
  added: number
}

/**
 * A rough finish for questions still being counted: each division's ballots
 * on the question are filled up to the coverage of the 75th-percentile
 * division (its ballots on the question over its Question 10 ballots, the
 * question counted first), and Question 10 itself is scaled to all of its
 * polls; the added ballots split like the division's counted ones.
 */
export function projections(divs: DivisionView[], ns: number[]): Projection[] {
  return ns.flatMap((n) => {
    const ratios = divs
      .filter((d) => d.ballots[SEPARATION] && d.ballots[n] != null)
      .map((d) => d.ballots[n] / d.ballots[SEPARATION])
      .sort((a, b) => a - b)
    if (!ratios.length) return []
    const full = ratios[Math.floor(ratios.length * 0.75)]
    let yes = 0
    let no = 0
    let addYes = 0
    let addNo = 0
    for (const d of divs) {
      const v = d.votes[n]
      if (!v) continue
      const t = v[0] + v[1]
      yes += v[0]
      no += v[1]
      const scale =
        d.polls && d.polls[1] && d.polls[0] ? d.polls[1] / d.polls[0] : 1
      const missing = Math.max(
        0,
        (d.ballots[SEPARATION] || 0) * scale * full - t,
      )
      if (t) {
        addYes += (missing * v[0]) / t
        addNo += (missing * v[1]) / t
      }
    }
    if (!(yes + no)) return []
    return [
      {
        n,
        now: (yes / (yes + no)) * 100,
        projected: ((yes + addYes) / (yes + no + addYes + addNo)) * 100,
        added: addYes + addNo,
      },
    ]
  })
}

export type CountNotes = {
  /** Snapshots where Question 10's counted ballots went down: the stamp and the change. */
  decreases: { at: string; change: number }[]
  /** The total number of polls each time it changed. */
  pollTotals: { at: string; total: number }[]
  /** Fully reported divisions where a later question counted more ballots than Question 10. */
  over: { d: DivisionView; n: number; ratio: number }[]
}

export function countNotes(
  snapshots: PayloadRow[],
  election: ReferendumElection,
  divs: DivisionView[],
): CountNotes {
  const sep = election.questions.find((q) => q.n === SEPARATION)
  const decreases: CountNotes['decreases'] = []
  const pollTotals: CountNotes['pollTotals'] = []
  let prev: number | null = null
  for (const r of snapshots) {
    if (!r.payload) continue
    const total = r.payload.polls && r.payload.polls.total
    if (
      total &&
      (!pollTotals.length || pollTotals[pollTotals.length - 1].total !== total)
    )
      pollTotals.push({ at: r.payload.asOf, total })
    if (!sep) continue
    const t = tally(contestOf(r.payload, sep))
    if (!t.started) continue
    if (prev != null && t.total < prev)
      decreases.push({ at: r.payload.asOf, change: t.total - prev })
    prev = t.total
  }
  const over: CountNotes['over'] = []
  for (const d of divs) {
    if (!d.complete || !d.ballots[SEPARATION]) continue
    let worst: { n: number; ratio: number } | null = null
    for (const q of election.questions) {
      if (q.n === SEPARATION || d.ballots[q.n] == null) continue
      const ratio = d.ballots[q.n] / d.ballots[SEPARATION]
      if (ratio > 1.005 && (!worst || ratio > worst.ratio))
        worst = { n: q.n, ratio }
    }
    if (worst) over.push({ d, ...worst })
  }
  over.sort((a, b) => b.ratio - a.ratio)
  return { decreases, pollTotals, over }
}
