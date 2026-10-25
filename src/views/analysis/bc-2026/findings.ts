// The key findings, written from the numbers so they stay true as the count
// moves to the final count. Each one is left out when its numbers are missing
// or say nothing, so the list never claims a pattern it cannot show.
import { fmt, pct1, signed } from '../../../../shared/format.ts'
import type { DistrictElection } from '../../../../shared/schema/election.ts'
import { listOf } from '../alberta-2026/findings'
import {
  type LeaderResult,
  type PartySeats,
  type Province,
  type RegionSwing,
  type RidingView,
  type turnoutPatterns,
} from './stats'

export type Finding = { lead: string; text: string }

/** A correlation too weak to call a pattern. */
const WEAK = 0.3

/** How a party reads after "the" in a sentence; the rest take their short name. */
const THE: Record<string, string> = {
  cp: 'Conservatives',
  ndp: 'NDP',
  green: 'Greens',
  other: 'independents',
}

/** "toward the Conservatives" or "toward the NDP" for a signed swing. */
export const toward = (swing: number) =>
  `toward the ${THE[swing >= 0 ? 'cp' : 'ndp']}`

/** A swing in words, its direction once: "8.0 pts toward the NDP". */
export const swingText = (swing: number) =>
  Math.abs(swing) < 0.05
    ? 'no change'
    : `${Math.abs(swing).toFixed(1)} pts ${toward(swing)}`
/** A Conservative-over-NDP lead as who leads: "Conservatives by 5.4". */
export const leadText = (lead: number) =>
  `${lead >= 0 ? 'Conservatives' : 'NDP'} by ${Math.abs(lead).toFixed(1)}`
const seatsText = (n: number) => `${fmt(n)} seat${n === 1 ? '' : 's'}`

/** The votes counted against 2024's advance and voting-day votes. */
const changeText = (pct: number) =>
  Math.abs(pct) < 0.5
    ? "The votes counted so far match 2024's advance and voting-day votes."
    : `The votes counted so far are ${Math.abs(pct).toFixed(1)}% ${pct < 0 ? 'below' : 'above'} 2024's advance and voting-day votes.`

const pts = (v: number) => `${Math.abs(v).toFixed(1)} points`
const ptLong = (v: number) => `${Math.abs(v).toFixed(1)}-point`

export function findings({
  election,
  views,
  province,
  regions,
  parties,
  minors,
  patterns,
  watch,
  leaders,
  lost,
  short,
}: {
  election: DistrictElection
  views: RidingView[]
  province: Province
  regions: RegionSwing[]
  parties: PartySeats[]
  minors: RidingView[]
  patterns: ReturnType<typeof turnoutPatterns>
  watch: RidingView[]
  leaders: LeaderResult[]
  lost: RidingView[]
  /** A party's short name (NDP, Conservative...). */
  short: (key: string) => string
}): Finding[] {
  const name = (key: string) => THE[key] || short(key)
  const out: Finding[] = []
  if (!views.length) return out
  const top = parties[0]
  const n = views.length

  if (top && top.seats) {
    const change = top.seats - top.seats24
    out.push({
      lead: `The ${name(top.key)} won ${fmt(top.seats)} of ${fmt(n)} seats on ${pct1(top.share)} of the vote,`,
      text: `${top.seats >= election.majority ? 'a majority' : `short of the ${election.majority} for a majority`} and ${change ? `${change > 0 ? 'up' : 'down'} ${seatsText(Math.abs(change))} on 2024` : 'level with 2024'}. That is ${pct1(top.seatShare)} of the seats${top.share24 != null ? `; in 2024 they had ${pct1(top.share24)} of the vote and ${seatsText(top.seats24)}` : ''}.`,
    })
  }

  const flips = views.filter((v) => v.winner !== v.was)
  if (n > 1) {
    const actual = province.seats[top ? top.key : 'cp'] || 0
    const uniform = province.uniform[top ? top.key : 'cp'] || 0
    out.push({
      lead: `A ${ptLong(province.swing)} swing ${toward(province.swing)}.`,
      text: `The Conservative lead over the NDP went from ${signed(province.lead24)} to ${signed(province.lead26)} points, and ${fmt(flips.length)} seat${flips.length === 1 ? '' : 's'} changed hands. Riding swings spread ${province.spread.toFixed(1)} points either side of that; moving every riding by the province-wide change gives the ${top ? name(top.key) : 'winners'} ${seatsText(uniform)}, against the ${fmt(actual)} they won.`,
    })
  }

  if (regions.length >= 2) {
    const sorted = [...regions].sort((a, b) => b.swing - a.swing)
    const most = sorted[0]
    const rest = sorted.slice(1)
    const restLo = Math.min(...rest.map((r) => r.swing))
    const restHi = Math.max(...rest.map((r) => r.swing))
    const gained = (most.seats.cp || 0) - (most.seats24.cp || 0)
    out.push({
      lead: `The ${most.label} swung furthest,`,
      text: `${pts(most.swing)} ${toward(most.swing)}${gained > 0 ? ` for ${fmt(gained)} Conservative gain${gained === 1 ? '' : 's'}` : ''}, against ${restLo.toFixed(1)} to ${restHi.toFixed(1)} in the other regions.`,
    })
  }

  const greens = parties.find((p) => p.key === 'green')
  if (greens && greens.share24 != null) {
    const gains = views
      .filter((v) => v.green != null && (v.green as number) >= 5)
      .sort((a, b) => (b.green as number) - (a.green as number))
    out.push({
      lead: `The Greens ${greens.share >= greens.share24 ? 'grew' : 'slipped'} to ${pct1(greens.share)}`,
      text: `(${signed(greens.share - greens.share24)} points) for ${seatsText(greens.seats)}${greens.perSeat && top && top.perSeat ? `: ${fmt(Math.round(greens.perSeat))} votes a seat, against ${fmt(Math.round(top.perSeat))} for the ${name(top.key)}` : ''}.${gains.length ? ` Their biggest gains: ${listOf(gains.slice(0, 3).map((v) => `${v.name} (${signed(v.green as number)})`))}.` : ''}`,
    })
  }

  if (minors.length) {
    const byWinner = (k: string) => minors.filter((v) => v.winner === k).length
    out.push({
      lead: `${short('centre')} and ${short('onebc')} took more than the winning margin in ${fmt(minors.length)} riding${minors.length === 1 ? '' : 's'}`,
      text: `(${listOf(
        ['cp', 'ndp', 'green']
          .filter((k) => byWinner(k))
          .map((k) => `${fmt(byWinner(k))} won by the ${name(k)}`),
      )}). The widest: ${listOf(minors.slice(0, 3).map((v) => `${v.name} (${pct1(v.minor)} against a ${v.margin.toFixed(1)}-point margin)`))}.`,
    })
  }

  const { votes, advance } = patterns
  if (votes && advance) {
    const weak = Math.abs(votes.fit.r) < WEAK && Math.abs(advance.fit.r) < WEAK
    out.push({
      lead: weak
        ? 'Turnout did not predict the swing.'
        : 'Turnout moved with the swing.',
      text: `Across ridings, the swing against the change in votes from 2024 has r = ${votes.fit.r.toFixed(2)}, and against the advance vote's growth r = ${advance.fit.r.toFixed(2)}${weak ? ': where more people voted, the ridings swung about as much as where fewer did.' : '.'} ${changeText((province.now.total / province.inPerson24 - 1) * 100)}`,
    })
  }

  if (lost.length) {
    const parties = [...new Set(lost.map((v) => v.incumbent!.party))]
    out.push({
      lead: `${fmt(lost.length)} incumbent${lost.length === 1 ? '' : 's'} lost,`,
      text: `${parties.length === 1 ? `all ${short(parties[0])}` : listOf(parties.map((k) => `${fmt(lost.filter((v) => v.incumbent!.party === k).length)} ${k === 'other' ? 'independent' : short(k)}`))}. The closest: ${listOf(lost.slice(0, 3).map((v) => `${v.incumbent!.name} in ${v.name} (${v.margin.toFixed(1)} points)`))}.`,
    })
  }

  if (leaders.length) {
    const won = leaders.filter((l) => l.won)
    const beaten = leaders.filter((l) => !l.won)
    out.push({
      lead: `${won.length === leaders.length ? 'Every party leader won their riding.' : `${fmt(won.length)} of ${fmt(leaders.length)} party leaders won their ridings.`}`,
      text: [
        won.length
          ? `${listOf(won.map((l) => `${l.leader} took ${l.riding.name} by ${pts(l.riding.margin)}`))}.`
          : '',
        beaten.length
          ? `${listOf(beaten.map((l) => `${short(l.party)}'s ${l.leader} drew ${pct1(l.riding.shares[l.party] || 0)} in ${l.riding.name}`))}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    })
  }

  const turning = watch.filter((v) => v.final.leader !== v.winner)
  out.push(
    turning.length
      ? {
          lead: `The final count could turn ${fmt(turning.length)} seat${turning.length === 1 ? '' : 's'}:`,
          text: `if the late ballots come in like 2024's, ${listOf(turning.map((v) => `${v.name} (${name(v.winner)} to ${name(v.final.leader)})`))}. It is an estimate, not a count.`,
        }
      : {
          lead: 'The final count is unlikely to change a seat.',
          text: `If the late ballots come in at 2024's rate and lean, ${watch.length ? `the tightest riding stays with the ${name(watch[0].winner)}: ${watch[0].name} at about ${watch[0].final.margin.toFixed(1)} points` : 'no riding comes within three points'}. It is an estimate, not a count.`,
        },
  )
  return out
}
