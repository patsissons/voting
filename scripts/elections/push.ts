// Pushes elections/<slug>.json into the `elections` collection (the row
// columns plus the document in `config`), creating or updating by slug.
// Validates each document first; a change to an election needs no deploy.
//
//   pnpm elections:push --local                  the scripts/pb.ts instance
//   pnpm elections:push --url https://voting.pockethost.io   with
//        PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD in the environment
//   pnpm elections:push ... --only bc-2026       one document
//   pnpm elections:push ... --dry-run            validate and diff only
import { argv, loadElections } from '../lib/elections.ts'
import { clientFor } from '../lib/pb-client.ts'

const args = argv()
const only = args.flag('only')
const docs = loadElections().filter((d) => !only || d.slug === only)
if (!docs.length) {
  console.error(`no election documents${only ? ` named ${only}` : ''}`)
  process.exit(1)
}
const client = await clientFor(args)
for (const doc of docs) {
  if (args.has('dry-run')) {
    console.log(`would push ${doc.slug} (${doc.ballot}, ${doc.results.format}, ${doc.published ? 'published' : 'draft'})`)
    continue
  }
  const { id, action } = await client.upsertElection(doc)
  console.log(`${doc.slug}: ${action} (${id})`)
}
