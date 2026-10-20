// Validates every elections/<slug>.json against the schema and its cross
// checks, and that each file is in the canonical compact format.
//
//   pnpm elections:check [--write]   (--write reformats the files in place)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseElection } from '../../shared/schema/election.ts'
import { argv, electionFiles, root } from '../lib/elections.ts'
import { documentText } from '../lib/json.ts'

const args = argv()
let failed = 0
for (const file of electionFiles()) {
  const rel = path.relative(root, file)
  const text = readFileSync(file, 'utf8')
  try {
    const doc = parseElection(JSON.parse(text))
    const canonical = documentText(doc)
    if (canonical !== text) {
      if (args.has('write')) {
        writeFileSync(file, canonical)
        console.log(`ok   ${rel} (reformatted)`)
      } else {
        failed++
        console.error(`FAIL ${rel}: not in canonical format (run pnpm elections:check --write)`)
      }
      continue
    }
    console.log(`ok   ${rel} (${doc.ballot}, ${doc.results.format}, ${doc.published ? 'published' : 'draft'})`)
  } catch (err) {
    failed++
    console.error(`FAIL ${rel}: ${(err as Error).message}`)
  }
}
if (failed) process.exit(1)
