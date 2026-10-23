// Early vote turnout as the hooks store it in an election's `early_vote`
// column (server/early-vote.ts pulls it, shared/parsers/early-vote.ts reads
// the CSV). Ballots cast, never votes counted: no state releases a count
// before its polls close. No zod here because the hooks read it too, so the
// guard below is hand-rolled like shared/config-guard.ts.

/** Ballots cast; the split is there only when the state reports both halves. */
export type EarlyVoteCount = { voted: number; inPerson?: number; mail?: number }

export type EarlyVoteState = EarlyVoteCount & {
  /** Ballots counted in the 2022 midterm, the turnout baseline. */
  prior?: number
  /** The day the state's figures last moved (YYYY-MM-DD). */
  updated?: string
  /** Early voters by party registration (dem, gop, other), where a state registers by party. */
  party?: Record<string, number>
  /** Returned mail ballots by party registration, where the state reports them. */
  partyMail?: Record<string, number>
  /** Early in-person voters by party registration, where the state reports them. */
  partyInPerson?: Record<string, number>
}

export type EarlyVote = {
  /** When the source last changed, ISO UTC. */
  asOf: string
  /** A fingerprint of the counts, so an unchanged pull writes nothing. */
  sig: string
  total: EarlyVoteCount
  /** By region key. */
  states: Record<string, EarlyVoteState>
}

const count = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0

/** A party-keyed object of counts. */
const isPartyCounts = (v: unknown): boolean =>
  !!v && typeof v === 'object' && Object.values(v).every(count)

const isCount = (v: unknown): boolean => {
  const c = v as Record<string, unknown>
  return (
    !!c &&
    typeof c === 'object' &&
    count(c.voted) &&
    (c.inPerson == null || count(c.inPerson)) &&
    (c.mail == null || count(c.mail))
  )
}

/** The early vote in a column value (an object, or JSON text), or null when it is not one. */
export function asEarlyVote(value: unknown): EarlyVote | null {
  let v = value
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  const d = v as Record<string, unknown>
  if (!d || typeof d !== 'object') return null
  if (typeof d.asOf !== 'string' || !Number.isFinite(Date.parse(d.asOf)))
    return null
  if (typeof d.sig !== 'string' || !isCount(d.total)) return null
  const states = d.states as Record<string, unknown>
  if (!states || typeof states !== 'object') return null
  for (const s of Object.values(states)) {
    if (!isCount(s)) return null
    const st = s as Record<string, unknown>
    for (const k of ['party', 'partyMail', 'partyInPerson'])
      if (st[k] != null && !isPartyCounts(st[k])) return null
  }
  return d as EarlyVote
}
