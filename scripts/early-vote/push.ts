// Pushes an election's advance voting turnout into its `early_vote` column,
// for a feed the hooks cannot read: Elections BC publishes the advance vote
// as a PDF (format ebc-advance), so this downloads it (and the last
// election's table, the baseline), runs pdftotext -layout on both, parses
// the text (shared/parsers/ebc-advance.ts) and writes the row the way the
// hooks' pull does (server/early-vote.ts): the counts, the check stamp and
// a cleared error. Re-run it whenever Elections BC amends the table.
//
//   pnpm early-vote:push --election bc-2026 --local
//   pnpm early-vote:push --election bc-2026 --url https://voting.pockethost.io
//        with PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD in the environment
//   ... --dry-run                parse and print, write nothing
//   ... --out early-vote.json    also write the EarlyVote JSON
//   ... --force                  write even when the counts are unchanged
//   ... --pdf a.pdf --prior-pdf b.pdf   local files instead of downloading
//
// Needs pdftotext (poppler): `brew install poppler`.
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { asEarlyVote } from '../../shared/early-vote.ts'
import type { EarlyVote } from '../../shared/early-vote.ts'
import { fmt, pct1 } from '../../shared/format.ts'
import {
  ebcAdvanceEarlyVote,
  parseEbcAdvance,
} from '../../shared/parsers/ebc-advance.ts'
import type { EbcAdvanceTable } from '../../shared/parsers/ebc-advance.ts'
import { argv, loadElection } from '../lib/elections.ts'
import { clientFor } from '../lib/pb-client.ts'

const run = promisify(execFile)
const USER_AGENT = 'voting.lgtm.page (+https://github.com/patsissons/voting)'

type Pdf = { bytes: Buffer; lastModified: string | null }

async function download(url: string): Promise<Pdf> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  if (res.status !== 200) throw new Error(`${url}: HTTP ${res.status}`)
  const type = res.headers.get('content-type') || ''
  if (!/pdf/i.test(type)) throw new Error(`${url}: not a PDF (${type})`)
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    lastModified: res.headers.get('last-modified'),
  }
}

/** The text pdftotext -layout makes of a PDF. */
async function pdfText(pdf: Buffer): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), 'voting-early-vote-'))
  const file = path.join(dir, 'table.pdf')
  try {
    writeFileSync(file, pdf)
    const { stdout } = await run('pdftotext', ['-layout', file, '-'], {
      maxBuffer: 16 * 1024 * 1024,
    })
    return stdout
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT')
      throw new Error('pdftotext is not installed: brew install poppler', {
        cause: err,
      })
    throw err
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function table(
  url: string,
  local: string | undefined,
): Promise<{ table: EbcAdvanceTable; lastModified: string | null }> {
  const pdf: Pdf = local
    ? { bytes: readFileSync(local), lastModified: null }
    : await download(url)
  return {
    table: parseEbcAdvance(await pdfText(pdf.bytes)),
    lastModified: pdf.lastModified,
  }
}

function describe(ev: EarlyVote, year: number): void {
  const t = ev.total
  console.log(
    `${year}: ${fmt(t.voted)} advance ballots in ${Object.keys(ev.states).length} ridings${t.registered ? `, ${pct1((t.voted / t.registered) * 100)} of ${fmt(t.registered)} registered` : ''}${t.prior ? `, ${pct1((t.voted / t.prior - 1) * 100)} vs ${fmt(t.prior)} last time` : ''}; as of ${ev.asOf}`,
  )
  for (const [day, n] of Object.entries(t.days || {}))
    console.log(`  ${day}: ${fmt(n)}`)
}

async function main() {
  const args = argv()
  const slug = args.flag('election')
  if (!slug) throw new Error('pass --election <slug>')
  const election = loadElection(slug)
  const early = election.results.earlyVote
  if (!early || early.format !== 'ebc-advance')
    throw new Error(`${slug}: results.earlyVote is not an ebc-advance feed`)
  if (election.ballot !== 'district')
    throw new Error(
      `${slug}: an advance vote by riding needs a district ballot`,
    )
  const current = await table(early.source, args.flag('pdf'))
  const prior = early.prior
    ? (await table(early.prior.source, args.flag('prior-pdf'))).table
    : null
  const modified = Date.parse(current.lastModified || '')
  const ev = ebcAdvanceEarlyVote(
    current.table,
    prior,
    election.districts.map((d) => d.code),
    new Date(Number.isFinite(modified) ? modified : Date.now()).toISOString(),
  )
  describe(ev, current.table.year)
  const out = args.flag('out')
  if (out) {
    writeFileSync(out, `${JSON.stringify(ev, null, 2)}\n`)
    console.log(`wrote ${out}`)
  }
  if (args.has('dry-run')) return
  const client = await clientFor(args)
  const row = await client.findElection(slug)
  if (!row)
    throw new Error(`${slug}: no election row (push the documents first)`)
  const stored = asEarlyVote(row.early_vote)
  const stamp = new Date().toISOString().replace('T', ' ')
  if (
    stored &&
    stored.sig === ev.sig &&
    stored.asOf === ev.asOf &&
    !args.has('force')
  ) {
    await client.patchElection(row.id, {
      early_vote_checked: stamp,
      early_vote_error: '',
    })
    console.log(`${slug}: unchanged since ${stored.asOf}`)
    return
  }
  await client.patchElection(row.id, {
    early_vote: ev,
    early_vote_checked: stamp,
    early_vote_error: '',
  })
  console.log(`${slug}: ${stored ? 'updated' : 'stored'} (${row.id})`)
}

main().catch((err) => {
  console.error(String((err as Error).message || err))
  process.exit(1)
})
