// Early vote turnout as it sits in an election's `early_vote` column: the
// hooks pull the UF Election Lab CSV into it (server/early-vote.ts,
// shared/parsers/early-vote.ts) and `pnpm early-vote:push` writes Elections
// BC's advance voting table (shared/parsers/ebc-advance.ts). Ballots cast,
// never votes counted: nothing is counted before the polls close. No zod
// here because the hooks read it too, so the guard below is hand-rolled like
// shared/config-guard.ts.

/** Ballots cast; the split is there only when the state reports both halves. */
export type EarlyVoteCount = { voted: number; inPerson?: number; mail?: number }

/** Ballots cast per voting day (YYYY-MM-DD), where the feed gives them. */
export type EarlyVoteDays = Record<string, number>

export type EarlyVoteState = EarlyVoteCount & {
  /** The baseline count: the 2022 midterm for a state, the last election's advance vote for a riding. */
  prior?: number
  /** Registered voters, where the feed gives them. */
  registered?: number
  /** Ballots cast per day, where the feed gives them. */
  days?: EarlyVoteDays
  /** The day the state's figures last moved (YYYY-MM-DD). */
  updated?: string
  /** Early voters by party registration (dem, gop, other), where a state registers by party. */
  party?: Record<string, number>
  /** Returned mail ballots by party registration, where the state reports them. */
  partyMail?: Record<string, number>
  /** Early in-person voters by party registration, where the state reports them. */
  partyInPerson?: Record<string, number>
}

export type EarlyVoteTotal = EarlyVoteCount & {
  /** The baseline total, registered voters and the per-day totals, where the feed gives them. */
  prior?: number
  registered?: number
  days?: EarlyVoteDays
  /** The baseline's per-day totals, for a day-by-day comparison. */
  priorDays?: EarlyVoteDays
}

export type EarlyVote = {
  /** When the source last changed, ISO UTC. */
  asOf: string
  /** A fingerprint of the counts, so an unchanged pull writes nothing. */
  sig: string
  total: EarlyVoteTotal
  /** By division key: a state code (regions) or a riding code (districts). */
  states: Record<string, EarlyVoteState>
}

const count = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0

/** A keyed object of counts (by party, or by day). */
const isCounts = (v: unknown): boolean =>
  !!v && typeof v === 'object' && Object.values(v).every(count)

const isCount = (v: unknown): boolean => {
  const c = v as Record<string, unknown>
  return (
    !!c &&
    typeof c === 'object' &&
    count(c.voted) &&
    (c.inPerson == null || count(c.inPerson)) &&
    (c.mail == null || count(c.mail)) &&
    (c.prior == null || count(c.prior)) &&
    (c.registered == null || count(c.registered)) &&
    (c.days == null || isCounts(c.days))
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
  const total = d.total as Record<string, unknown>
  if (total.priorDays != null && !isCounts(total.priorDays)) return null
  const states = d.states as Record<string, unknown>
  if (!states || typeof states !== 'object') return null
  for (const s of Object.values(states)) {
    if (!isCount(s)) return null
    const st = s as Record<string, unknown>
    for (const k of ['party', 'partyMail', 'partyInPerson'])
      if (st[k] != null && !isCounts(st[k])) return null
  }
  return d as EarlyVote
}
