// The data access the hooks need, as one small interface: the real one wraps
// PocketBase's $app, and server/db.memory.ts implements it in memory for the
// tests. Every public read filters `published = true` here, because hooks
// run as the app and bypass the collection rules.
import type { Election } from '../shared/schema/election.ts'
import { fromRow } from '../shared/election-row.ts'
import type { Payload, Snapshot } from '../shared/payload.ts'

/** A row we can read and write; a PocketBase record or the in-memory fake. */
export interface Row {
  id: string
  get(field: string): unknown
  getString(field: string): string
  set(field: string, value: unknown): void
}

export class UniqueError extends Error {
  constructor(message = 'unique constraint failed') {
    super(message)
    this.name = 'UniqueError'
  }
}

export interface Db {
  /** Any election by slug, published or not (the ingest and the fetch serve drafts too). */
  electionBySlug(slug: string): Row | null
  /** Published elections, newest voting day first. */
  publishedElections(): Row[]
  /** Published election by slug. */
  publishedElection(slug: string): Row | null
  /** Elections with a results source set (the fetch's candidates). */
  electionsWithSource(): Row[]
  resultByStamp(electionId: string, sourceTs: string): Row | null
  /** The newest snapshot by source stamp. */
  latestResult(electionId: string): Row | null
  hasOfficialResult(electionId: string): boolean
  /**
   * Snapshots for an election in stamp order, optionally after a stamp and
   * at most limit of them (every one when limit is absent).
   */
  resultsFor(electionId: string, afterTs?: string, limit?: number): Row[]
  newResult(): Row
  /** Throws UniqueError when an index refuses the row. */
  save(row: Row): void
}

/** The election document in a row's config column plus its columns. */
export function electionOf(row: Row): Election {
  let config: Record<string, unknown>
  try {
    config = JSON.parse(row.getString('config') || '{}') || {}
  } catch {
    config = {}
  }
  return fromRow({
    id: row.id,
    slug: row.getString('slug'),
    title: row.getString('title'),
    description: row.getString('description'),
    voting_day: row.getString('voting_day'),
    published: !!row.get('published'),
    ballot: (row.getString('ballot') || 'at-large') as Election['ballot'],
    config,
  })
}

export function payloadOf(row: Row): Payload | null {
  try {
    return JSON.parse(row.getString('payload') || 'null')
  } catch {
    return null
  }
}

export function snapshotOf(row: Row): Snapshot {
  return {
    id: row.id,
    source_ts: row.getString('source_ts'),
    official: !!row.get('official'),
    polls_closed: Number(row.get('polls_closed')) || 0,
    polls_total: Number(row.get('polls_total')) || 0,
    payload: payloadOf(row) as Payload,
    fetched: row.getString('fetched'),
  }
}

/** The real thing, over PocketBase's app. */
export function pocketbaseDb(app: PbApp): Db {
  const first = (
    collection: string,
    filter: string,
    params: Record<string, unknown>,
  ): Row | null => {
    try {
      return app.findFirstRecordByFilter(collection, filter, params)
    } catch {
      return null
    }
  }
  return {
    electionBySlug: (slug) => first('elections', 'slug = {:slug}', { slug }),
    publishedElections: () =>
      app.findRecordsByFilter(
        'elections',
        'published = true',
        '-voting_day',
        0,
        0,
      ),
    publishedElection: (slug) =>
      first('elections', 'slug = {:slug} && published = true', { slug }),
    electionsWithSource: () =>
      app.findRecordsByFilter('elections', "results_source != ''", '', 0, 0),
    resultByStamp: (id, ts) =>
      first('results', 'election = {:id} && source_ts = {:ts}', { id, ts }),
    latestResult: (id) =>
      app.findRecordsByFilter(
        'results',
        'election = {:id}',
        '-source_ts',
        1,
        0,
        { id },
      )[0] || null,
    hasOfficialResult: (id) =>
      !!first('results', 'election = {:id} && official = true', { id }),
    resultsFor: (id, afterTs, limit) =>
      afterTs
        ? app.findRecordsByFilter(
            'results',
            'election = {:id} && source_ts > {:ts}',
            'source_ts',
            limit || 0,
            0,
            { id, ts: afterTs },
          )
        : app.findRecordsByFilter(
            'results',
            'election = {:id}',
            'source_ts',
            limit || 0,
            0,
            { id },
          ),
    newResult: () => new Record(app.findCollectionByNameOrId('results')),
    save: (row) => {
      try {
        app.save(row as PbRecord)
      } catch (err) {
        if (/unique|source_ts/i.test(String(err)))
          throw new UniqueError(String(err))
        throw err
      }
    },
  }
}
