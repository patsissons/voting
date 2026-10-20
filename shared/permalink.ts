// The hash grammar, frozen because shared cubby.fyi links 301 here and the
// browser carries the fragment:
//
//   #/compass                   the compass intro (or the referendum ballot)
//   #/compass/<code>            compass results for <code>, one character per
//                               question in order ("-" skipped, "0"-"9" the
//                               option index, "A"-"J" the option counted
//                               double, trailing "-" trimmed); a referendum
//                               ballot uses "0"/"1" per question the same way
//   #/compass/<code>/q<i>       question i mid-quiz (code may be "-")
//   #/compass/<code>/r<i>       question i while reviewing finished answers
//   #/results                   the results tab
//
// plus one form that is never shared, only followed once: the move from
// cubby.fyi, whose localStorage this origin cannot read.
//
//   #/compass/import/<rest>?d=<riding>&o=<n,n>&e=<division>
//                               <rest> is what follows #/compass/ above; the
//                               query carries the state cubby kept only in
//                               localStorage (riding, swapped-out ballot
//                               numbers, referendum division), all optional
import type {
  CompassElection,
  Election,
  ReferendumElection,
} from './schema/election.ts'
import { blankState } from './stats/compass.ts'
import type { CompassState } from './stats/compass.ts'

export const TAB = '#/compass'
export const IMPORT = `${TAB}/import/`
export type Tab = 'compass' | 'results'

/** The tab a hash names, or '' when it names none. */
export function tabOf(hash: string): Tab | '' {
  const head = String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')[0]
  return head === 'compass' || head === 'results' ? head : ''
}

/** The hash for a compass state: '' for the intro (nothing to link to yet). */
export function encodeCompass(
  election: CompassElection,
  state: CompassState,
): string {
  const n = election.questions.length
  let code = ''
  for (let i = 0; i < n; i++) {
    const k = state.answers[i]
    if (k === undefined || k === null) code += '-'
    else code += state.weights[i] ? String.fromCharCode(65 + k) : String(k)
  }
  code = code.replace(/-+$/, '')
  if (state.done) return `${TAB}/${code}`
  if (state.i < 0) return ''
  return `${TAB}/${code || '-'}/${state.review ? 'r' : 'q'}${state.i}`
}

/** The state a hash describes, or null when the hash carries no code. Options an election does not have are dropped, so a stale link still loads. */
export function parseCompass(
  election: CompassElection,
  hash: string,
): CompassState | null {
  const segs = String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')
  if (segs[0] !== 'compass' || segs.length < 2) return null
  const code = segs[1] || ''
  if (!/^[0-9A-J-]*$/.test(code)) return null
  const pos = /^([qr])(\d+)$/.exec(segs[2] || '')
  if (!code.replace(/-/g, '') && !pos) return null
  const Q = election.questions
  const state = blankState()
  for (let i = 0; i < Math.min(code.length, Q.length); i++) {
    const c = code[i]
    if (c === '-') continue
    const k = c >= 'A' ? c.charCodeAt(0) - 65 : +c
    if (!Q[i].opts[k]) continue
    state.answers[i] = k
    if (c >= 'A') state.weights[i] = true
  }
  if (pos) {
    state.i = Math.min(Q.length - 1, +pos[2])
    state.review = pos[1] === 'r'
  } else {
    state.done = true
    state.i = Q.length - 1
  }
  return state
}

export type BallotMarks = Record<number, 0 | 1>

/** The hash for a referendum ballot ({ questionIndex: optionIndex }). */
export function encodeBallot(
  election: ReferendumElection,
  answers: BallotMarks,
): string {
  let code = ''
  for (let i = 0; i < election.questions.length; i++) {
    const k = answers[i]
    code += k === 0 || k === 1 ? String(k) : '-'
  }
  code = code.replace(/-+$/, '')
  return code ? `${TAB}/${code}` : TAB
}

/** The ballot a hash describes, or null when the hash carries no code. */
export function parseBallot(
  election: ReferendumElection,
  hash: string,
): BallotMarks | null {
  const segs = String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')
  if (segs[0] !== 'compass' || !segs[1] || !/^[01-]+$/.test(segs[1]))
    return null
  const answers: BallotMarks = {}
  for (
    let i = 0;
    i < Math.min(segs[1].length, election.questions.length);
    i++
  ) {
    const c = segs[1][i]
    if (c !== '-') answers[i] = +c as 0 | 1
  }
  return Object.keys(answers).length ? answers : null
}

export type Imported = {
  /** The permalink to land on once the state is stored. */
  hash: string
  district?: string
  omit?: number[]
  division?: string
}

/** What an import hash carries, or null when the hash is not one. Parts the election does not have are dropped, so a stale link still moves what it can. */
export function parseImport(election: Election, hash: string): Imported | null {
  const raw = String(hash || '')
  if (!raw.startsWith(IMPORT)) return null
  const [rest, query = ''] = raw.slice(IMPORT.length).split('?')
  const target = `${TAB}/${rest}`
  const valid =
    election.ballot === 'referendum'
      ? parseBallot(election, target)
      : parseCompass(election, target)
  const out: Imported = { hash: valid ? target : TAB }
  // By hand: the hooks runtime this file also builds for has no URLSearchParams.
  const params: Record<string, string> = {}
  for (const pair of query.split('&')) {
    const at = pair.indexOf('=')
    if (at < 1) continue
    try {
      params[pair.slice(0, at)] = decodeURIComponent(
        pair.slice(at + 1).replace(/\+/g, ' '),
      )
    } catch {
      // a malformed escape drops just that part
    }
  }
  const d = params.d
  if (d && election.ballot === 'district') {
    if (election.districts.some((x) => x.code === d)) out.district = d
  }
  const o = params.o
  if (o && election.ballot === 'at-large') {
    const numbers = new Set(
      election.parties.flatMap((p) =>
        [p.mayor, ...p.council, ...p.park, ...p.school].flatMap((r) =>
          r ? [r[0]] : [],
        ),
      ),
    )
    const omit = o
      .split(',')
      .map(Number)
      .filter((n, i, a) => numbers.has(n) && a.indexOf(n) === i)
    if (omit.length) out.omit = omit
  }
  const e = params.e
  if (e && election.ballot === 'referendum') {
    const divisions =
      election.results.format === 'eab-dash'
        ? election.results.divisions
        : undefined
    const known = divisions
      ? e in divisions || Object.values(divisions).includes(e)
      : e.length <= 64
    if (known) out.division = e
  }
  return out
}
