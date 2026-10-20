// Helpers the four feed parsers share: numbers, names, HTML text and the
// wall-clock stamps. No DOM: PocketBase's JS runtime has none, so HTML is
// read with regular expressions.
import { FeedError } from '../payload.ts'
import type { Contest } from '../payload.ts'
import { pad2 } from '../format.ts'

export { FeedError }

/** "1,234" / "12.5%" / 12 -> number; anything else -> 0. */
export const num = (v: unknown): number => {
  const n = Number(String(v == null ? '' : v).replace(/[%,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** The body as text, with a UTF-8 BOM stripped. */
export function bodyText(raw: unknown): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .trim()
}

/** Parse a JSON body (or pass an object through); throws a FeedError. */
export function parseJson(raw: unknown, what = 'the feed'): unknown {
  if (raw && typeof raw === 'object') return raw
  const text = bodyText(raw)
  if (!text) throw new FeedError('empty_feed', `${what} body is empty`)
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new FeedError(
      'bad_feed',
      `${what} is not JSON: ${String((err as Error).message || err).slice(0, 200)}`,
    )
  }
}

// "POPAT" -> "Popat", "O'KEEFE" -> "O'Keefe", "YI-KIERAN" -> "Yi-Kieran".
export function titleCase(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(
      /(^|[\s'’-])(\S)/g,
      (_m, sep: string, ch: string) => sep + ch.toUpperCase(),
    )
}

/** "52 POPAT, Imtiaz" -> { ballot: 52, name: "Imtiaz Popat" }; "Yes" -> no ballot. */
export function parseChoiceName(choiceName: unknown): {
  ballot: number | null
  name: string
} {
  const text = String(choiceName || '').trim()
  const m = /^(\d+)\s+(.+)$/.exec(text)
  if (!m) return { ballot: null, name: text }
  const rest = m[2].trim()
  const comma = rest.indexOf(',')
  const name =
    comma < 0
      ? titleCase(rest)
      : `${rest.slice(comma + 1).trim()} ${titleCase(rest.slice(0, comma).trim())}`.trim()
  return { ballot: Number(m[1]), name }
}

export function unescapeHtml(text: string): string {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
}

/** The visible text of a fragment: tags dropped, entities decoded, whitespace collapsed. */
export function textOf(fragment: string): string {
  return unescapeHtml(String(fragment).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Contest kinds sort in the election's office order, then districts, then questions; anything else last. */
export function kindOrder(
  offices: { key: string }[] | undefined,
): (kind: string) => number {
  const kinds = [...(offices || []).map((o) => o.key), 'district', 'question']
  return (kind) => {
    const i = kinds.indexOf(kind)
    return i < 0 ? kinds.length : i
  }
}

/**
 * A fetch time ("2026-10-20T03:12:40Z" or ms) as wall-clock time in the zone
 * pollsClose names by its offset ("-06:00"): "2026-10-19 21:12:40".
 */
export function wallStamp(
  when: number | string | null | undefined,
  pollsClose: string | null | undefined,
): string {
  const at = typeof when === 'number' ? when : Date.parse(String(when || ''))
  if (!Number.isFinite(at)) return ''
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(String(pollsClose || ''))
  const offset = m
    ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000
    : 0
  return new Date(at + offset).toISOString().slice(0, 19).replace('T', ' ')
}

/** A short fingerprint of a string (djb2), for "have the counts moved". */
export function fingerprint(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++)
    h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** A two-option question contest in ballot order. */
export function questionContest(
  q: { n: number; topic?: string; options: readonly { t: string }[] },
  votes: [number, number],
  sort: number,
  extra: Partial<Contest>,
  eds: Contest['eds'],
): Contest {
  const sum = votes[0] + votes[1]
  return {
    id: `q${q.n}`,
    n: q.n,
    name: `Question ${q.n}`,
    label: q.topic || `Question ${q.n}`,
    kind: 'question',
    voteFor: 1,
    ballots: sum,
    rejected: 0,
    acclaimed: false,
    sort,
    posted: sum > 0,
    ...extra,
    choices: q.options.map((o, k) => ({
      ballot: null,
      name: o.t,
      votes: votes[k],
      pct: sum ? (100 * votes[k]) / sum : 0,
      party: null,
      partyName: '',
      incumbent: false,
      winner: false,
    })),
    eds,
  } as Contest
}

export { pad2 }
