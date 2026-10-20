// Where an election is in its life, from the calendar and the count.
import type { Payload } from '../../shared/payload.ts'
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

/** With the newest snapshot: counting until the count is complete or official. */
export function electionStatus(
  advance: string[],
  final: string,
  today: string,
  latest: Payload | null,
): Status {
  if (latest) return complete(latest) ? 'final' : 'counting'
  return dateStatus(advance, final, today)
}
