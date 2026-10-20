// Exports the voting data from cubby.fyi: the voting_elections rows (hidden
// fields included, which needs superuser auth), every voting_results row,
// and the static elections/<slug>.json files, into data/export/<date>/.
// Repeatable; each run is its own directory.
//
//   CUBBY_SUPERUSER_EMAIL=... CUBBY_SUPERUSER_PASSWORD=... pnpm data:export
//     [--url https://cubby.fyi] [--out data/export/<date>]
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { argv, root } from '../lib/elections.ts'
import { PbClient } from '../lib/pb-client.ts'
import type { CubbyElectionRow, CubbyResultRow } from './transform.ts'

const args = argv()
const url = (args.flag('url') || process.env.CUBBY_URL || 'https://cubby.fyi').replace(/\/$/, '')
const email = process.env.CUBBY_SUPERUSER_EMAIL || ''
const password = process.env.CUBBY_SUPERUSER_PASSWORD || ''
if (!email || !password) {
  console.error('set CUBBY_SUPERUSER_EMAIL and CUBBY_SUPERUSER_PASSWORD (a cubby.fyi superuser; hidden fields need it)')
  process.exit(1)
}
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const out = path.resolve(root, args.flag('out') || path.join('data', 'export', stamp))
mkdirSync(path.join(out, 'configs'), { recursive: true })

const client = new PbClient(url, { gapMs: 250 })
await client.authenticate({ email, password })

const elections = await client.list<CubbyElectionRow>('voting_elections', { sort: 'voting_day' })
writeFileSync(path.join(out, 'elections.json'), `${JSON.stringify(elections, null, 2)}\n`)
console.log(`${elections.length} elections`)

const results = await client.list<CubbyResultRow>('voting_results', { sort: 'election,source_ts' })
writeFileSync(path.join(out, 'results.json'), JSON.stringify(results))
console.log(`${results.length} results rows`)

for (const row of elections) {
  const res = await fetch(`${url}/voting/elections/${row.slug}.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`elections/${row.slug}.json answered ${res.status}`)
  writeFileSync(path.join(out, 'configs', `${row.slug}.json`), await res.text())
  console.log(`configs/${row.slug}.json`)
}

const counts: Record<string, number> = {}
for (const r of results) counts[r.election] = (counts[r.election] || 0) + 1
writeFileSync(
  path.join(out, 'manifest.json'),
  `${JSON.stringify({ exportedAt: new Date().toISOString(), source: url, elections: elections.map((e) => ({ id: e.id, slug: e.slug, results: counts[e.id!] || 0 })) }, null, 2)}\n`,
)
console.log(`wrote ${path.relative(root, out)}`)
