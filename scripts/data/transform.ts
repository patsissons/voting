// Pure mapping from the cubby.fyi export (scripts/data/export.ts) to this
// app's schema: an election document per voting_elections row plus its
// static elections/<slug>.json, and one `results` row per voting_results row.
// It keeps working on old exports as the schema evolves, and the committed
// elections/*.json are its output (scripts/data/transform.test.ts checks).
//
//   pnpm data:transform [--from data/export/<date>] [--out data/import]
//
// Writes elections/<slug>.json (the documents) and <out>/results.jsonl (one
// row per line, electionSlug in place of the relation id) for import.ts.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseElection } from '../../shared/schema/election.ts'
import type { Election } from '../../shared/schema/election.ts'
import type { Payload } from '../../shared/payload.ts'
import { PAYLOAD_SCHEMA_VERSION } from '../../shared/payload.ts'
import { argv, electionsDir, root } from '../lib/elections.ts'
import { documentText } from '../lib/json.ts'
import { LEGACY_COLORS } from './legacy.ts'

export type CubbyElectionRow = {
  id?: string
  slug: string
  title: string
  description: string
  voting_day: string
  published: boolean
  results_source?: string
  results_checked?: string
  results_error?: string
}

export type CubbyResultRow = {
  id?: string
  election: string
  source_ts: string
  official: boolean
  polls_closed: number
  polls_total: number
  payload: Payload
  fetched?: string
  created?: string
}

export type ImportResult = {
  electionSlug: string
  source_ts: string
  sig: string
  format: string
  official: boolean
  polls_closed: number
  polls_total: number
  payload: Payload
  schema_version: number
  fetched: string
}

type Json = Record<string, unknown>

/** The document for a cubby election JSON and its row: columns first, then the JSON in its own order, results last. */
export function transformElection(json: Json, row: CubbyElectionRow): Election {
  const { slug: _s, title: _t, votingDay, ballot, place, eyebrow, pollsClose, timeZone, dates, lede, intro, results, ...rest } = json as Json & {
    votingDay: string
    ballot?: string
    results: Json
  }
  const parties = Array.isArray(rest.parties)
    ? (rest.parties as Json[]).map((p) => {
        const colors = LEGACY_COLORS[String(p.key)]
        if (!colors) return p
        const { key, name, short, url, lean, axis, ...more } = p
        const party: Json = { key, name, short, url, lean, axis, color: colors.light }
        if (colors.dark !== colors.light) party.colorDark = colors.dark
        return { ...party, ...more }
      })
    : undefined
  const doc: Json = {
    slug: row.slug,
    title: String(json.title || row.title),
    description: row.description,
    votingDay,
    published: !!row.published,
    ballot: ballot || 'at-large',
    place,
    eyebrow,
    pollsClose,
    timeZone,
    dates,
    lede,
    intro,
    ...rest,
    ...(parties ? { parties } : {}),
    results: { format: 'vancouver', ...results },
  }
  // The compass JSONs listed questions after parties; keep the editorial order
  // (parties, questions, note, sources, resources) the files had.
  return parseElection(doc)
}

/** A `results` row for import: the payload byte for byte, plus the columns the new schema indexes. */
export function transformResult(row: CubbyResultRow, slug: string, election: Election): ImportResult {
  const payload = row.payload
  return {
    electionSlug: slug,
    source_ts: row.source_ts,
    sig: (payload && payload.sig) || '',
    format: (payload && payload.format) || election.results.format,
    official: !!row.official,
    polls_closed: Number(row.polls_closed) || 0,
    polls_total: Number(row.polls_total) || 0,
    payload,
    schema_version: PAYLOAD_SCHEMA_VERSION,
    fetched: row.fetched || row.created || '',
  }
}

export type Export = {
  elections: CubbyElectionRow[]
  results: CubbyResultRow[]
  configs: Record<string, Json>
}

export function transformExport(data: Export): { elections: Election[]; results: ImportResult[]; hidden: Record<string, Pick<CubbyElectionRow, 'results_source' | 'results_checked' | 'results_error'>> } {
  const bySlug = new Map<string, Election>()
  const byId = new Map<string, string>()
  const hidden: Record<string, Pick<CubbyElectionRow, 'results_source' | 'results_checked' | 'results_error'>> = {}
  for (const row of data.elections) {
    const json = data.configs[row.slug]
    if (!json) throw new Error(`no elections/${row.slug}.json in the export`)
    const doc = transformElection(json, row)
    bySlug.set(row.slug, doc)
    if (row.id) byId.set(row.id, row.slug)
    hidden[row.slug] = { results_source: row.results_source || '', results_checked: row.results_checked || '', results_error: row.results_error || '' }
  }
  const results = data.results.map((row) => {
    const slug = byId.get(row.election)
    if (!slug) throw new Error(`result ${row.id || row.source_ts} belongs to unknown election ${row.election}`)
    return transformResult(row, slug, bySlug.get(slug)!)
  })
  results.sort((a, b) => a.electionSlug.localeCompare(b.electionSlug) || a.source_ts.localeCompare(b.source_ts))
  return { elections: [...bySlug.values()], results, hidden }
}

/** The newest data/export/<stamp> directory export.ts wrote (it leaves a manifest.json; a hand-made one like `<date>-legacy` has none). */
export function latestExport(dir = path.join(root, 'data', 'export')): string | null {
  if (!existsSync(dir)) return null
  const stamps = readdirSync(dir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d) && existsSync(path.join(dir, d, 'manifest.json')))
    .sort()
  return stamps.length ? path.join(dir, stamps[stamps.length - 1]) : null
}

export function readExport(dir: string): Export {
  const read = (name: string) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
  const elections = read('elections.json') as CubbyElectionRow[]
  const configs: Record<string, Json> = {}
  for (const row of elections) configs[row.slug] = read(path.join('configs', `${row.slug}.json`))
  return { elections, results: read('results.json'), configs }
}

function main() {
  const args = argv()
  const from = args.flag('from') || latestExport()
  if (!from) {
    console.error('no export found: run `pnpm data:export` first or pass --from <dir>')
    process.exit(1)
  }
  const out = path.resolve(root, args.flag('out') || 'data/import')
  const data = readExport(from)
  const { elections, results, hidden } = transformExport(data)
  mkdirSync(out, { recursive: true })
  for (const doc of elections) {
    writeFileSync(path.join(electionsDir, `${doc.slug}.json`), documentText(doc))
    console.log(`wrote elections/${doc.slug}.json`)
  }
  writeFileSync(path.join(out, 'results.jsonl'), results.map((r) => JSON.stringify(r)).join('\n') + (results.length ? '\n' : ''))
  writeFileSync(path.join(out, 'hidden.json'), `${JSON.stringify(hidden, null, 2)}\n`)
  console.log(`wrote ${results.length} results rows to ${path.relative(root, out)}/results.jsonl`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main()
