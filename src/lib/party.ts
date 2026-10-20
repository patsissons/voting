// Party colours as CSS tokens per election: --party-<key> for light and dark,
// scoped to the election page, so a new election brings its own palette in
// its document instead of a stylesheet edit.
import type { CSSProperties } from 'react'
import type { CompassElection, Election } from '../../shared/schema/election.ts'

/** The CSS var reference for a party key ('other' and null fall back to the grey). */
export const partyColor = (key: string | null | undefined): string =>
  key && key !== 'other'
    ? `var(--party-${key}, var(--party-other))`
    : 'var(--party-other)'

/** An inline style that sets --party for the .swatch / bar utilities. */
export const partyStyle = (key: string | null | undefined): CSSProperties =>
  ({ '--party': partyColor(key) }) as CSSProperties

/** A stylesheet defining the election's party tokens in both themes. */
export function partyCss(election: Election): string {
  if (election.ballot === 'referendum') {
    const [a, b] = election.optionColors || []
    return a && b ? `.election-scope{--ref-a:${a};--ref-b:${b}}` : ''
  }
  const light = election.parties
    .map((p) => `--party-${p.key}:${p.color}`)
    .join(';')
  const dark = election.parties
    .map((p) => `--party-${p.key}:${p.colorDark || p.color}`)
    .join(';')
  return `.election-scope{${light}}.dark .election-scope{${dark}}`
}

export type PartyLookup<E extends CompassElection = CompassElection> = Record<
  string,
  E['parties'][number]
>

export function partyLookup<E extends CompassElection>(
  election: E,
): PartyLookup<E> {
  const out: PartyLookup<E> = {}
  for (const p of election.parties as E['parties']) out[p.key] = p
  return out
}

export const partyName = (
  P: PartyLookup,
  key: string | null | undefined,
): string => (key && key !== 'other' && P[key] ? P[key].name : 'Others')
export const partyShort = (
  P: PartyLookup,
  key: string | null | undefined,
): string => (key && key !== 'other' && P[key] ? P[key].short : 'Others')

/** A question's series colour when several questions share a chart, by ballot index. */
export const seriesColor = (i: number): string =>
  `var(--series-${(i % 11) + 1})`
