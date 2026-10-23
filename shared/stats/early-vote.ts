// Early vote turnout for the waiting screen and its markdown: each state's
// ballots cast as a share of its 2022 midterm count (so a big state does not
// read as a busy one), the map's colour steps, and the party registration
// split. Turnout only: who has voted, never how.
import type { EarlyVote, EarlyVoteState } from '../early-vote.ts'

export type StateTurnout = EarlyVoteState & {
  key: string
  label: string
  /** voted / prior, or null without a 2022 count. */
  share: number | null
}

/** Ballots cast as a share of the 2022 midterm's count, or null without one. */
export const shareOfPrior = (s: EarlyVoteState): number | null =>
  s.prior ? s.voted / s.prior : null

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
