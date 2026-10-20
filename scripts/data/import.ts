// Imports a transformed export (scripts/data/transform.ts) into an instance:
// the election documents by slug, then every results row missing by
// (election, source_ts). Idempotent: a second run makes no writes. Paced for
// PocketHost's rate limits. Writes <dir>/report.json with the counts and a
// payload hash per row so the import can be checked against the export.
//
//   pnpm data:import --local                       the scripts/pb.ts instance
//   pnpm data:import --url https://voting.pockethost.io   with
//        PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD
//   pnpm data:import ... --from data/import --dry-run --hidden
//   pnpm data:import ... --sync [--election alberta-2026,bc-2026]
//
// --hidden also copies results_source/results_checked/results_error from
// hidden.json (only at cutover: before that the new instance must not fetch).
//
// --sync overwrites instead of only adding: for every exported election (or
// the --election list) the instance's results become the export's, updating
// rows whose columns differ (cubby strips per-division detail from a row once
// a newer one lands) and deleting rows the export lacks.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { argv, loadElections, root } from '../lib/elections.ts'
import { clientFor, stableJson } from '../lib/pb-client.ts'
import type { PbClient } from '../lib/pb-client.ts'
import type { ImportResult } from './transform.ts'

export type ExistingRow = { id: string; election: string; source_ts: string }

export type ImportPlan = {
  create: ImportResult[]
  present: number
  missingElection: ImportResult[]
}

/** Which rows need creating, given what the instance has. */
export function planImport(rows: ImportResult[], electionIds: Record<string, string>, existing: ExistingRow[]): ImportPlan {
  const have = new Set(existing.map((r) => `${r.election}|${r.source_ts}`))
  const plan: ImportPlan = { create: [], present: 0, missingElection: [] }
  for (const row of rows) {
    const id = electionIds[row.electionSlug]
    if (!id) {
      plan.missingElection.push(row)
      continue
    }
    if (have.has(`${id}|${row.source_ts}`)) plan.present++
    else plan.create.push(row)
  }
  return plan
}

/** The columns --sync compares; `fetched` is left out (the API rewrites its format). */
export const SYNC_FIELDS = ['payload', 'official', 'polls_closed', 'polls_total', 'sig', 'format', 'schema_version'] as const

export type SyncRow = ExistingRow & Partial<Pick<ImportResult, (typeof SYNC_FIELDS)[number]>>

export type SyncPlan = {
  create: ImportResult[]
  update: { id: string; row: ImportResult }[]
  remove: ExistingRow[]
  present: number
  missingElection: ImportResult[]
}

/** What makes the instance's results for `slugs` equal the export's. */
export function planSync(rows: ImportResult[], electionIds: Record<string, string>, existing: SyncRow[], slugs: string[]): SyncPlan {
  const ids = new Set(slugs.map((slug) => electionIds[slug]).filter(Boolean))
  const have = new Map<string, SyncRow>()
  for (const r of existing) if (ids.has(r.election)) have.set(`${r.election}|${r.source_ts}`, r)
  const plan: SyncPlan = { create: [], update: [], remove: [], present: 0, missingElection: [] }
  const seen = new Set<string>()
  for (const row of rows) {
    if (!slugs.includes(row.electionSlug)) continue
    const id = electionIds[row.electionSlug]
    if (!id) {
      plan.missingElection.push(row)
      continue
    }
    const key = `${id}|${row.source_ts}`
    seen.add(key)
    const found = have.get(key)
    if (!found) plan.create.push(row)
    else if (SYNC_FIELDS.every((f) => stableJson(found[f]) === stableJson(row[f]))) plan.present++
    else plan.update.push({ id: found.id, row })
  }
  for (const [key, r] of have) if (!seen.has(key)) plan.remove.push(r)
  return plan
}

export const payloadHash = (payload: unknown): string => createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)

export function readImport(dir: string): { rows: ImportResult[]; hidden: Record<string, Record<string, string>> } {
  const file = path.join(dir, 'results.jsonl')
  const rows = existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ImportResult)
    : []
  const hiddenFile = path.join(dir, 'hidden.json')
  const hidden = existsSync(hiddenFile) ? JSON.parse(readFileSync(hiddenFile, 'utf8')) : {}
  return { rows, hidden }
}

export type ImportOptions = { dryRun?: boolean; hidden?: boolean; sync?: boolean; elections?: string[]; log?: (s: string) => void }

export async function runImport(client: PbClient, dir: string, opts: ImportOptions = {}) {
  const log = opts.log || console.log
  const { rows, hidden } = readImport(dir)
  const electionIds: Record<string, string> = {}
  for (const doc of loadElections()) {
    const extra = opts.hidden && hidden[doc.slug] ? hidden[doc.slug] : {}
    if (opts.dryRun) {
      const found = await client.list<{ id: string; slug: string }>('elections', { filter: `slug = "${doc.slug}"` })
      if (found[0]) electionIds[doc.slug] = found[0].id
      log(`${doc.slug}: ${found[0] ? 'exists' : 'would create'}`)
      continue
    }
    const { id, action } = await client.upsertElection(doc, extra)
    electionIds[doc.slug] = id
    log(`${doc.slug}: ${action}`)
  }
  const report = {
    at: new Date().toISOString(),
    dryRun: !!opts.dryRun,
    sync: !!opts.sync,
    elections: electionIds,
    present: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    failed: 0,
    rows: [] as { slug: string; source_ts: string; hash: string }[],
  }
  for (const row of rows) report.rows.push({ slug: row.electionSlug, source_ts: row.source_ts, hash: payloadHash(row.payload) })
  const write = async (method: string, url: string, body: unknown, label: string) => {
    const { status, body: res } = await client.request<{ message?: string; data?: unknown }>(method, url, body)
    if (status === 200 || status === 204) return true
    report.failed++
    log(`FAIL ${method} ${label}: ${status} ${res.message} ${JSON.stringify(res.data || '')}`)
    return false
  }
  const fields = (row: ImportResult) => {
    const { electionSlug, ...rest } = row
    return { ...rest, election: electionIds[electionSlug] }
  }

  let plan: SyncPlan
  if (opts.sync) {
    const scope = opts.elections?.length ? opts.elections : Object.keys(hidden).length ? Object.keys(hidden) : [...new Set(rows.map((r) => r.electionSlug))]
    const existing: SyncRow[] = []
    for (const slug of scope) {
      const id = electionIds[slug]
      if (!id) continue
      existing.push(...(await client.list<SyncRow>('results', { filter: `election = "${id}"`, fields: `id,election,source_ts,${SYNC_FIELDS.join(',')}`, perPage: '50' })))
    }
    plan = planSync(rows, electionIds, existing, scope)
    for (const slug of scope) {
      const create = plan.create.filter((r) => r.electionSlug === slug).length
      const update = plan.update.filter((u) => u.row.electionSlug === slug).length
      const remove = plan.remove.filter((r) => r.election === electionIds[slug]).length
      log(`${slug}: ${create} to create, ${update} to update, ${remove} to delete`)
    }
  } else {
    const existing = await client.list<ExistingRow>('results', { fields: 'id,election,source_ts' })
    plan = { ...planImport(rows, electionIds, existing), update: [], remove: [] }
  }
  report.present = plan.present
  log(`results: ${plan.present} present, ${plan.create.length} to create${opts.sync ? `, ${plan.update.length} to update, ${plan.remove.length} to delete` : ''}${plan.missingElection.length ? `, ${plan.missingElection.length} for elections not on the instance` : ''}`)
  if (!opts.dryRun) {
    for (const row of plan.create) if (await write('POST', '/api/collections/results/records', fields(row), `${row.electionSlug} ${row.source_ts}`)) report.created++
    for (const { id, row } of plan.update) if (await write('PATCH', `/api/collections/results/records/${id}`, fields(row), `${row.electionSlug} ${row.source_ts}`)) report.updated++
    for (const r of plan.remove) if (await write('DELETE', `/api/collections/results/records/${r.id}`, undefined, `${r.election} ${r.source_ts}`)) report.deleted++
    log(`created ${report.created}, updated ${report.updated}, deleted ${report.deleted} rows${report.failed ? `, ${report.failed} failed` : ''}`)
  }
  writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = argv()
  const dir = path.resolve(root, args.flag('from') || path.join('data', 'import'))
  const client = await clientFor(args)
  const elections = (args.flag('election') || '').split(',').filter(Boolean)
  const report = await runImport(client, dir, { dryRun: args.has('dry-run'), hidden: args.has('hidden'), sync: args.has('sync'), elections })
  if (report.failed) process.exit(1)
}
