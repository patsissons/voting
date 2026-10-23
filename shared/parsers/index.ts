// normalize() turns one raw results document into the compact payload the
// page, the markdown route and the stored rows read, dispatching on the
// election's results.format. Pure: the hooks, the relay, the scripts and the
// tests all run the same code.
import type { Payload } from '../payload.ts'
import { FeedError } from '../payload.ts'
import type { Election } from '../schema/election.ts'
import { normalizeCivicapi } from './civicapi.ts'
import { normalizeEabDash } from './eab-dash.ts'
import { normalizeEabRef } from './eab-ref.ts'
import { normalizeEnr } from './enr.ts'
import { normalizeVancouver } from './vancouver.ts'

export { FeedError }
export { contestId, normalizeCivicapi } from './civicapi.ts'
export { dashSource, normalizeEabDash } from './eab-dash.ts'
export { normalizeEabRef, parseLocations } from './eab-ref.ts'
export { normalizeEnr, parseAsOf } from './enr.ts'
export { normalizeVancouver } from './vancouver.ts'
export { parseChoiceName, titleCase, wallStamp } from './common.ts'

export function normalize(raw: unknown, election: Election): Payload {
  const format = (election.results && election.results.format) || 'vancouver'
  if (election.ballot === 'district' && format === 'ebc-enr')
    return normalizeEnr(raw, election)
  if (election.ballot === 'at-large' && format === 'vancouver')
    return normalizeVancouver(raw, election)
  if (election.ballot === 'referendum' && format === 'eab-ref')
    return normalizeEabRef(raw, election)
  if (election.ballot === 'referendum' && format === 'eab-dash')
    return normalizeEabDash(raw, election)
  if (election.ballot === 'chambers' && format === 'civicapi')
    return normalizeCivicapi(raw, election)
  throw new FeedError(
    'bad_config',
    `unknown results format "${format}" for a ${election.ballot} ballot`,
  )
}

/**
 * The payload without its detail: what an older snapshot keeps once a newer
 * one carries it, or null when there is nothing to drop. A referendum row
 * loses its per-division rows (eds); a civicapi row loses its contests and
 * keeps the per-chamber tallies the timelines read.
 */
export function stripDetail(
  payload: Payload | null | undefined,
): Payload | null {
  if (!payload || !Array.isArray(payload.contests)) return null
  if (payload.format === 'civicapi')
    return payload.contests.length ? { ...payload, contests: [] } : null
  if (!payload.contests.some((c) => c.eds && c.eds.length)) return null
  return {
    ...payload,
    contests: payload.contests.map((c) => ({ ...c, eds: [] })),
  }
}

/**
 * The certified count names each riding's winner: Elections BC declares them
 * only at the final count, so an ENR payload carries winner: false until the
 * ingest marks it official. Vancouver payloads already carry the City's
 * flags. A referendum question (eab-ref, eab-dash) gets its majority option
 * the same way. Mutates and returns the payload.
 */
export function markOfficial<T extends Payload | null | undefined>(
  payload: T,
): T {
  if (!payload || !payload.official) return payload
  for (const c of payload.contests || []) {
    // A referendum question: the majority of votes for the two options.
    if (c.kind === 'question' && c.n != null) {
      const [a, b] = c.choices
      if (a && b && a.votes !== b.votes)
        (a.votes > b.votes ? a : b).winner = true
      continue
    }
    if (c.kind !== 'district') continue
    const [lead, second] = c.choices
    if (lead && lead.votes > 0 && !(second && second.votes === lead.votes))
      lead.winner = true
  }
  return payload
}
