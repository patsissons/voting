// Test and seed helpers: the committed election documents, the real feed
// fixtures and the golden payloads cubby.fyi's normalizer produced.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AtLargeElection, DistrictElection, Election, ReferendumElection } from '../../shared/schema/election.ts'
import type { Payload } from '../../shared/payload.ts'
import { loadElection } from '../lib/elections.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

export const fixture = (name: string): string => readFileSync(path.join(here, name), 'utf8')

export const vancouver = (): AtLargeElection => loadElection('vancouver-2026') as AtLargeElection
export const bc = (): DistrictElection => loadElection('bc-2026') as DistrictElection
export const alberta = (): ReferendumElection => loadElection('alberta-2026') as ReferendumElection

/** The Vancouver document accepting any project (the 2022 and 2025 feeds). */
export const vancouverAny = (): AtLargeElection => {
  const e = vancouver()
  return { ...e, results: { ...e.results, projectMatch: '.' } }
}

/** The BC document accepting any event (the 2024 page). */
export const bcAny = (): DistrictElection => {
  const e = bc()
  return { ...e, results: { ...e.results, eventMatch: '.' } }
}

/** Alberta as the per-question pages it was expected to publish (eab-ref); the night used the dashboard feed. */
export const albertaPages = (): ReferendumElection => {
  const e = alberta()
  const { questionIds: _q, divisions: _d, ...rest } = e.results as Extract<ReferendumElection['results'], { format: 'eab-dash' }>
  return { ...e, results: { ...rest, format: 'eab-ref', sourcePrefix: 'https://officialresults.elections.ab.ca/' } }
}

export type GoldenStep = { asOf: string; polls: { closed: number; total: number }; ballots: number; sig: string | null; contests: number }
export type Golden = {
  real: Record<string, Payload>
  nights: Record<string, { steps: GoldenStep[]; last: Payload }>
}

export const golden = (): Golden => JSON.parse(fixture('golden/payloads.json'))

export type AnyElection = Election
