// Test and seed helpers: the committed election documents, the real feed
// fixtures and the golden payloads cubby.fyi's normalizer produced.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AtLargeElection, ChambersElection, DistrictElection, Election, ReferendumElection } from '../../shared/schema/election.ts'
import { parseElection } from '../../shared/schema/election.ts'
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

/**
 * A small chambers (results-only) document matching the trimmed civicAPI
 * sample (voting-2026-civicapi-sample.json): four House districts, two
 * Senate races and two governors, with holdovers making up the seats.
 */
export const tinyChambers = (): ChambersElection =>
  parseElection({
    slug: 'tiny-2026',
    title: 'Tiny Midterms 2026',
    description: 'A results-only test election.',
    ballot: 'chambers',
    votingDay: '2026-11-03',
    published: true,
    place: 'United States',
    eyebrow: 'Test election · voting day Tue Nov 3, 2026',
    pollsClose: '2026-11-03T18:00:00-05:00',
    timeZone: 'America/New_York',
    dates: { advance: [], final: '2026-11-03' },
    lede: 'Live results for a handful of races.',
    intro: 'Nothing to see here but results.',
    parties: [
      { key: 'dem', name: 'Democratic Party', short: 'Dem', color: '#4874a3' },
      { key: 'gop', name: 'Republican Party', short: 'GOP', color: '#c6606b' },
    ],
    affiliations: { Democratic: 'dem', Republican: 'gop' },
    regions: [
      { key: 'ak', label: 'Alaska' },
      { key: 'ca', label: 'California' },
      { key: 'ga', label: 'Georgia' },
      { key: 'ny', label: 'New York' },
      { key: 'wi', label: 'Wisconsin' },
    ],
    chambers: [
      {
        key: 'house',
        label: 'House of Representatives',
        short: 'House',
        seats: 4,
        majority: 3,
        divisions: { 'ak-al': 'Alaska at-large', 'ca-12': 'California 12', 'ny-10': 'New York 10', 'wi-02': 'Wisconsin 2' },
      },
      { key: 'senate', label: 'Senate', short: 'Senate', seats: 4, majority: 3, holdovers: { dem: 1, gop: 1 }, divisions: { ak: 'Alaska', ga: 'Georgia' } },
      { key: 'governor', label: 'Governors', short: 'Gov', seats: 3, holdovers: { gop: 1 }, divisions: { ak: 'Alaska', ca: 'California' } },
    ],
    results: {
      format: 'civicapi',
      source: 'https://civicapi.org/api/v2/race/',
      races: { house: 87524, senate: 87528, governor: 87535 },
      official: 'https://civicapi.org/',
      label: 'civicAPI',
      unit: 'races called',
      serverFetch: true,
      fetchHours: 96,
      throttleSeconds: 120,
      sourcePrefix: 'https://civicapi.org/',
    },
  }) as ChambersElection

export type GoldenStep = { asOf: string; polls: { closed: number; total: number }; ballots: number; sig: string | null; contests: number }
export type Golden = {
  real: Record<string, Payload>
  nights: Record<string, { steps: GoldenStep[]; last: Payload }>
}

export const golden = (): Golden => JSON.parse(fixture('golden/payloads.json'))

export type AnyElection = Election
