// The split between an election document and its `elections` row: the
// columns the index page lists and the collection rules filter on are real
// fields; everything else is the `config` JSON column. fromRow() puts the
// document back together for the app, the hooks and the MCP tools.
import type { Ballot, Election } from './schema/election.ts'

/** The document fields that are row columns (in column order). */
export const ROW_FIELDS = [
  'slug',
  'title',
  'description',
  'voting_day',
  'published',
  'ballot',
] as const

export type ElectionRow = {
  id?: string
  slug: string
  title: string
  description: string
  /** PocketBase date: "2026-10-24 12:00:00.000Z" */
  voting_day: string
  published: boolean
  ballot: Ballot
  config: Record<string, unknown>
  results_source?: string
  results_checked?: string
  results_error?: string
}

/** The row for a document: columns plus the rest as config. */
export function toRow(doc: Election): Omit<ElectionRow, 'id'> {
  const { slug, title, description, votingDay, published, ballot, ...config } =
    doc
  return {
    slug,
    title,
    description,
    voting_day: `${votingDay} 12:00:00.000Z`,
    published,
    ballot,
    config,
  }
}

/** The document a row describes (not validated; the push script did that). */
export function fromRow(row: ElectionRow): Election {
  const config = (
    row.config && typeof row.config === 'object' ? row.config : {}
  ) as Record<string, unknown>
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    votingDay: String(row.voting_day || '').slice(0, 10),
    published: !!row.published,
    ballot: row.ballot || 'at-large',
    ...config,
  } as Election
}
