// The normalized results payload (schema version 1): what every parser in
// shared/parsers produces, what a `results` row stores in its `payload`
// column, and what the views, the markdown pages and the MCP tools read. The
// shape is unchanged from cubby.fyi so exported rows import byte for byte.

export type Format = 'vancouver' | 'ebc-enr' | 'eab-ref' | 'eab-dash'

export const FORMATS: Format[] = ['vancouver', 'ebc-enr', 'eab-ref', 'eab-dash']

export const PAYLOAD_SCHEMA_VERSION = 1

export type Choice = {
  /** The ballot number (Vancouver), or null. */
  ballot: number | null
  name: string
  votes: number
  pct: number
  /** The compass party key, or null for anyone outside the compass parties. */
  party: string | null
  /** The feed's own party label ("Conservative Party"), or ''. */
  partyName: string
  incumbent: boolean
  winner: boolean
}

/** Ballot boxes in an Elections BC riding: [reported, total] per kind. */
export type Boxes = {
  advance: [number, number] | null
  final: [number, number] | null
  ood: string
}

/** One referendum question's count in one electoral division. */
export type Division = {
  code: string
  name: string
  votes: [number, number]
  rejected: number
  polls: [number, number | null] | null
}

export type ContestPolls = { closed: number; total: number; unit: string }

export type Contest = {
  id: string
  name: string
  label: string
  /** An office key (mayor, council...), 'district' or 'question'. */
  kind: string
  voteFor: number
  ballots: number
  acclaimed: boolean
  sort: number
  choices: Choice[]
  /** kind 'district': the region key from the election's districts list. */
  region?: string | null
  boxes?: Boxes
  /** Referendum questions (eab-ref, eab-dash). */
  n?: number
  rejected?: number
  posted?: boolean
  polls?: ContestPolls
  locations?: [number, number | null] | null
  eds?: Division[]
}

export type PartyTally = {
  key: string
  leading: number
  votes: number
  pct: number
}

export type Payload = {
  /** Wall-clock stamp in the election's zone: "2026-10-24 20:05:00". */
  asOf: string
  project: string
  format?: Format
  official: boolean
  /** Elections BC's count status strip. */
  status?: { initial: string; final: string }
  ballots: number
  eligible: number
  turnout: number | null
  polls: { closed: number; total: number }
  tabulators: { closed: number; total: number }
  groups: { name: string; closed: number; total: number }[]
  /** Province-wide tallies per compass party (ebc-enr). */
  summary?: { parties: PartyTally[]; reporting: string }
  /** A fingerprint of the counts for feeds without an update stamp. */
  sig?: string
  contests: Contest[]
}

/** A `results` row as the API returns it. */
export type Snapshot = {
  id: string
  election?: string
  source_ts: string
  official: boolean
  polls_closed: number
  polls_total: number
  payload: Payload
  fetched?: string
}

export type FeedErrorCode =
  | 'empty_feed'
  | 'bad_feed'
  | 'project_mismatch'
  | 'not_reporting'
  | 'stale_version'
  | 'bad_config'

export class FeedError extends Error {
  code: FeedErrorCode
  constructor(code: FeedErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'FeedError'
  }
}

export function isFeedError(err: unknown): err is FeedError {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as FeedError).code === 'string'
  )
}
