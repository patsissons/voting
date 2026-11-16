// Where an election is in its life, from the calendar and the count.
import { windowClosed } from '../../shared/fetch-policy.ts'
import type { Payload } from '../../shared/payload.ts'
import type { Election } from '../../shared/schema/election.ts'
import { complete } from '../../shared/stats/results.ts'

export type Status = 'upcoming' | 'voting' | 'counting' | 'final' | 'results'

export const STATUS_LABEL: Record<Status, string> = {
  upcoming: 'Upcoming',
  voting: 'Voting now',
  counting: 'Counting',
  final: 'Final',
  results: 'Results',
}

/**
 * From the dates alone (the index has no snapshots): upcoming before the
 * first voting day, voting through the final day, results after.
 */
export function dateStatus(
  advance: string[],
  final: string,
  today: string,
): Status {
  const first = advance.length ? advance[0] : final
  if (today < first) return 'upcoming'
  if (today <= final) return 'voting'
  return 'results'
}

/**
 * With the newest snapshot: counting until the count is complete or official
 * (final), or until its window closes without that (results: nothing more is
 * fetched).
 */
export function electionStatus(
  advance: string[],
  final: string,
  today: string,
  latest: Payload | null,
  closed = false,
): Status {
  if (latest)
    return complete(latest) ? 'final' : closed ? 'results' : 'counting'
  return dateStatus(advance, final, today)
}

/**
 * An archived election is history: its count is complete or official, or its
 * window (pollsClose + fetchHours) has closed. The page drops the live cues
 * and, once the window has closed, reads its snapshots once instead of
 * streaming them.
 */
export function archived(
  election: Pick<Election, 'pollsClose' | 'results'>,
  latest: Payload | null,
  now: number,
): boolean {
  return complete(latest) || windowClosed(election, now)
}
