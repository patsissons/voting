// The UF Election Lab's early vote CSV (one row per state, the file its
// tracker at election.lab.ufl.edu/early-vote draws from) to the EarlyVote
// the hooks store. A 0 in a breakdown means the state does not report it,
// not that nobody voted that way, so the in-person/mail split is kept only
// when both halves are reported and each party split (all ballots, mail,
// in person) only when there is one.
// Rows outside the election's regions (DC) count toward the national total
// and nothing else; a state with no ballots yet is left out.
import type {
  EarlyVote,
  EarlyVoteCount,
  EarlyVoteState,
} from '../early-vote.ts'
import { FeedError, bodyText, fingerprint, num } from './common.ts'

/** RFC 4180: quoted cells may hold commas, newlines and doubled quotes. */
export function readCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

/** "10/23/2026" -> "2026-10-23"; anything else -> undefined. */
const isoDay = (text: string): string | undefined => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
  if (!m) return undefined
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/** The `<prefix>_dem/rep/none` columns as a party split, or undefined when the state reports neither party. */
const partyOf = (
  n: (name: string) => number,
  prefix: string,
): Record<string, number> | undefined => {
  const dem = n(`${prefix}_dem`)
  const gop = n(`${prefix}_rep`)
  return dem + gop ? { dem, gop, other: n(`${prefix}_none`) } : undefined
}

/** The early vote in a CSV body, for the region keys an election has. */
export function parseEarlyVote(
  raw: unknown,
  regions: readonly { key: string }[],
  asOf: string,
): EarlyVote {
  const rows = readCsv(bodyText(raw))
  if (rows.length < 2)
    throw new FeedError('empty_feed', 'the early vote CSV has no rows')
  const head = rows[0].map((h) => h.trim())
  const col = (name: string) => head.indexOf(name)
  if (col('state_abbv') < 0 || col('voted_all') < 0)
    throw new FeedError(
      'bad_feed',
      'the early vote CSV has no state_abbv or voted_all column',
    )
  const known = new Set(regions.map((r) => r.key))
  const total = { voted: 0, inPerson: 0, mail: 0 }
  const states: Record<string, EarlyVoteState> = {}
  for (const row of rows.slice(1)) {
    const cell = (name: string) => {
      const i = col(name)
      return i < 0 ? '' : row[i] || ''
    }
    const n = (name: string) => num(cell(name))
    const voted = n('voted_all')
    if (!voted) continue
    const inPerson = n('inperson_all')
    const mail = n('accept_all')
    total.voted += voted
    total.inPerson += inPerson
    total.mail += mail
    const key = cell('state_abbv').trim().toLowerCase()
    if (!known.has(key)) continue
    const state: EarlyVoteState = { voted }
    if (inPerson && mail) {
      state.inPerson = inPerson
      state.mail = mail
    }
    const prior = n('turn_2022')
    if (prior) state.prior = prior
    const updated = isoDay(cell('last_update'))
    if (updated) state.updated = updated
    const party = partyOf(n, 'voted')
    if (party) state.party = party
    const mailParty = partyOf(n, 'accept')
    if (mailParty) state.partyMail = mailParty
    const inPersonParty = partyOf(n, 'inperson')
    if (inPersonParty) state.partyInPerson = inPersonParty
    states[key] = state
  }
  if (!total.voted)
    throw new FeedError('empty_feed', 'the early vote CSV counts no ballots')
  const national: EarlyVoteCount =
    total.inPerson && total.mail ? total : { voted: total.voted }
  return {
    asOf,
    sig: fingerprint(JSON.stringify([national, states])),
    total: national,
    states,
  }
}
