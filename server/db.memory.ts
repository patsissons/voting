// An in-memory Db for the tests: the same unique index as the migration
// ((election, source_ts)), rows that read back like PocketBase records (json
// fields through getString), and a way to seed elections from documents.
import { toRow } from '../shared/election-row.ts'
import type { Election } from '../shared/schema/election.ts'
import { UniqueError } from './db.ts'
import type { Db, Row } from './db.ts'

export class MemoryRow implements Row {
  id: string
  collection: string
  data: Record<string, unknown>
  constructor(collection: string, id: string, data: Record<string, unknown>) {
    this.collection = collection
    this.id = id
    this.data = data
  }
  get(field: string): unknown {
    return this.data[field]
  }
  getString(field: string): string {
    const v = this.data[field]
    if (v == null) return ''
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
  set(field: string, value: unknown): void {
    this.data[field] = value
  }
}

export type MemoryDb = Db & {
  elections: MemoryRow[]
  results: MemoryRow[]
  addElection(doc: Election, extra?: Record<string, unknown>): MemoryRow
}

export function memoryDb(): MemoryDb {
  let seq = 0
  const nextId = () => `r${String(++seq).padStart(14, '0')}`
  const elections: MemoryRow[] = []
  const results: MemoryRow[] = []
  const db: MemoryDb = {
    elections,
    results,
    addElection(doc, extra = {}) {
      const row = new MemoryRow('elections', nextId(), {
        ...toRow(doc),
        results_source: '',
        results_checked: '',
        results_error: '',
        ...extra,
      })
      elections.push(row)
      return row
    },
    electionBySlug: (slug) =>
      elections.find((e) => e.get('slug') === slug) || null,
    publishedElections: () =>
      elections
        .filter((e) => !!e.get('published'))
        .sort((a, b) =>
          b.getString('voting_day').localeCompare(a.getString('voting_day')),
        ),
    publishedElection: (slug) =>
      elections.find((e) => e.get('slug') === slug && !!e.get('published')) ||
      null,
    electionsWithSource: () =>
      elections.filter((e) => e.getString('results_source') !== ''),
    resultByStamp: (id, ts) =>
      results.find(
        (r) => r.get('election') === id && r.get('source_ts') === ts,
      ) || null,
    latestResult: (id) => {
      const rows = results
        .filter((r) => r.get('election') === id)
        .sort((a, b) =>
          b.getString('source_ts').localeCompare(a.getString('source_ts')),
        )
      return rows[0] || null
    },
    hasOfficialResult: (id) =>
      results.some((r) => r.get('election') === id && !!r.get('official')),
    resultsFor: (id, afterTs) =>
      results
        .filter(
          (r) =>
            r.get('election') === id &&
            (!afterTs || r.getString('source_ts') > afterTs),
        )
        .sort((a, b) =>
          a.getString('source_ts').localeCompare(b.getString('source_ts')),
        ),
    newResult: () => new MemoryRow('results', '', {}),
    save(row) {
      const r = row as MemoryRow
      if (r.collection === 'results') {
        const dup = results.find(
          (x) =>
            x !== r &&
            x.get('election') === r.get('election') &&
            x.get('source_ts') === r.get('source_ts'),
        )
        if (dup) throw new UniqueError()
        if (!r.id) {
          r.id = nextId()
          results.push(r)
        }
      } else if (!r.id) {
        r.id = nextId()
        elections.push(r)
      }
    },
  }
  return db
}
