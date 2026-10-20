// The server-side fetch's decisions, kept pure so the tests run them in Node:
// whether a fetch is due, and whether a results source may be used. The
// fetch runs only for an election whose results block sets serverFetch
// (Elections BC's page and Elections Alberta's feed; the City of Vancouver's
// feed refuses every non-browser client, so it stays relay-only), whose
// results_source has been set, inside results.fetchHours after pollsClose,
// at most once every 45 s (or results.throttleSeconds) between the cron and
// the webhook, and never after an official snapshot.
import type { Election } from './schema/election.ts'

export const THROTTLE_MS = 45000
export const DEFAULT_FETCH_HOURS = 12
export const SOURCE_PREFIX = 'https://electionsbcenr.blob.core.windows.net/'

type ResultsPolicy = Partial<
  Pick<
    Election['results'],
    'serverFetch' | 'fetchHours' | 'throttleSeconds' | 'sourcePrefix'
  >
> & { eventMatch?: string }
type Config = { pollsClose?: string; results?: ResultsPolicy }

export const throttleMs = (results: ResultsPolicy): number =>
  Number(results.throttleSeconds) > 0
    ? Number(results.throttleSeconds) * 1000
    : THROTTLE_MS

export type FetchState = { source: string; checked: number; official: boolean }
export type SkipReason =
  | ''
  | 'not_enabled'
  | 'no_source'
  | 'official'
  | 'no_polls_close'
  | 'before_polls_close'
  | 'window_closed'
  | 'throttled'

/** Why a fetch would not run now, or '' when it should. */
export function shouldFetch(
  config: Config,
  state: FetchState,
  now: number,
): SkipReason {
  const results = (config && config.results) || {}
  if (!results.serverFetch) return 'not_enabled'
  if (!state.source) return 'no_source'
  if (state.official) return 'official'
  const opens = Date.parse(config.pollsClose || '')
  if (!Number.isFinite(opens)) return 'no_polls_close'
  const hours = Number(results.fetchHours) || DEFAULT_FETCH_HOURS
  if (now < opens) return 'before_polls_close'
  if (now > opens + hours * 3600000) return 'window_closed'
  if (state.checked && now - state.checked < throttleMs(results))
    return 'throttled'
  return ''
}

/** An error message for a results source the fetch must not use, or ''. */
export function checkSource(config: Config, url: string): string {
  const results = (config && config.results) || {}
  if (!results.serverFetch) return 'this election has no server-side fetch'
  const prefix = results.sourcePrefix || SOURCE_PREFIX
  if (!url.startsWith(prefix)) return `the source must be on ${prefix}`
  if (results.eventMatch && !new RegExp(results.eventMatch, 'i').test(url))
    return `the source is not for /${results.eventMatch}/`
  return ''
}
