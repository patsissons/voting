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
//
// --hidden also copies results_source/results_checked/results_error from
// hidden.json (only at cutover: before that the new instance must not fetch).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { argv, loadElections, root } from '../lib/elections.ts'
import { clientFor } from '../lib/pb-client.ts'
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

export async function runImport(client: PbClient, dir: string, opts: { dryRun?: boolean; hidden?: boolean; log?: (s: string) => void } = {}) {
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
  const existing = await client.list<ExistingRow>('results', { fields: 'id,election,source_ts' })
  const plan = planImport(rows, electionIds, existing)
  log(`results: ${plan.present} present, ${plan.create.length} to create${plan.missingElection.length ? `, ${plan.missingElection.length} for elections not on the instance` : ''}`)
  const report = { at: new Date().toISOString(), dryRun: !!opts.dryRun, elections: electionIds, present: plan.present, created: 0, failed: 0, rows: [] as { slug: string; source_ts: string; hash: string }[] }
  for (const row of rows) report.rows.push({ slug: row.electionSlug, source_ts: row.source_ts, hash: payloadHash(row.payload) })
  if (!opts.dryRun) {
    for (const row of plan.create) {
      const { electionSlug, ...fields } = row
      const { status, body } = await client.request<{ message?: string; data?: unknown }>('POST', '/api/collections/results/records', { ...fields, election: electionIds[electionSlug] })
      if (status === 200) report.created++
      else {
        report.failed++
        log(`FAIL ${electionSlug} ${row.source_ts}: ${status} ${body.message} ${JSON.stringify(body.data || '')}`)
      }
    }
    log(`created ${report.created} rows${report.failed ? `, ${report.failed} failed` : ''}`)
  }
  writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = argv()
  const dir = path.resolve(root, args.flag('from') || path.join('data', 'import'))
  const client = await clientFor(args)
  const report = await runImport(client, dir, { dryRun: args.has('dry-run'), hidden: args.has('hidden') })
  if (report.failed) process.exit(1)
}
