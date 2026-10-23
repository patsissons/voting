// The words the early vote panel, the folded section and the waiting screen
// use for each feed: the UF Election Lab CSV counts early voters by state
// before voting day; Elections BC's table counts advance voters by riding
// over the advance voting days. One place, so the nav label, the summary
// line and the panel agree.
import type { EarlyVote } from '../../../shared/early-vote.ts'
import { dayShort, fmt, pct1 } from '../../../shared/format.ts'
import type { Election } from '../../../shared/schema/election.ts'
import {
  daySeries,
  earlyVoteFormat,
  shareOfRegistered,
} from '../../../shared/stats/early-vote.ts'

export type EarlyVoteCopy = {
  /** Whether the feed is an advance vote by riding (Elections BC). */
  advance: boolean
  /** The section's name: the nav link and the folded heading. */
  title: string
  /** The folded summary's caption. */
  caption: string
  /** The sentence on the waiting screen. */
  waiting: string
  /** "state" / "riding", and the plural. */
  division: string
  divisions: string
  /** The baseline the turnout map compares with: "the 2022 midterm", "2024 advance voting". */
  baseline: string
  /** The baseline's year, for short labels ("vs 2024"). */
  priorYear: string
  /** "Fri Oct 16 to Wed Oct 21" for an advance vote; '' otherwise. */
  span: string
}

/**
 * The copy for an election's early vote. `today` (YYYY-MM-DD in the
 * election's zone) tells whether advance voting is still running.
 */
export function earlyVoteCopy(
  election: Election,
  ev: EarlyVote,
  today?: string,
): EarlyVoteCopy {
  const early = election.results.earlyVote
  if (earlyVoteFormat(election) !== 'ebc-advance')
    return {
      advance: false,
      title: 'Early vote',
      caption: 'ballots cast before voting day',
      waiting: 'Early voting is under way in most states.',
      division: 'state',
      divisions: 'states',
      baseline: 'the 2022 midterm',
      priorYear: '2022',
      span: '',
    }
  const days = daySeries(ev.total.days).map((d) => d.day)
  const planned = election.dates.advance
  const first = days[0] || planned[0]
  const last = planned[planned.length - 1] || days[days.length - 1]
  const span = first && last ? `${dayShort(first)} to ${dayShort(last)}` : ''
  const over = !today || !last || today > last
  const priorYear = ev.total.priorDays
    ? Object.keys(ev.total.priorDays)[0].slice(0, 4)
    : (early && early.prior && (/\d{4}/.exec(early.prior.label) || [])[0]) ||
      'last time'
  const share = shareOfRegistered(ev.total)
  const counted = `${fmt(ev.total.voted)} ballots cast${share != null ? `, ${pct1(share * 100)} of registered voters` : ''}`
  return {
    advance: true,
    title: 'Advance voting',
    caption: `advance ballots cast${span ? ` ${span}` : ''}`,
    waiting: over
      ? `Advance voting ran ${span}: ${counted}.`
      : `Advance voting is under way${span ? ` (${span})` : ''}: ${counted} so far.`,
    division: 'riding',
    divisions: 'ridings',
    baseline:
      (early && early.prior && early.prior.label) ||
      `${priorYear} advance voting`,
    priorYear,
    span,
  }
}
