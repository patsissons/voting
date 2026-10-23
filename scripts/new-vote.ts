// Scaffolds a new election document from a ballot-mode template, with the
// header filled in and TODO markers where the editorial work goes.
//
//   pnpm new-vote <slug> --ballot at-large|district|referendum --title "..."
//     --day YYYY-MM-DD [--tz America/Vancouver] [--place "..."]
//     [--format vancouver|ebc-enr|eab-ref|eab-dash] [--close 20:00] [--force]
//
// Writes elections/<slug>.json (published: false), validates it, and prints
// the next steps. See docs/new-vote.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dayLong } from '../shared/format.ts'
import { parseElection, type Election } from '../shared/schema/election.ts'
import { argv, electionsDir, root } from './lib/elections.ts'
import { documentText } from './lib/json.ts'

export type NewVoteOptions = {
  slug: string
  ballot: 'at-large' | 'district' | 'referendum' | 'chambers'
  title: string
  day: string
  timeZone?: string
  place?: string
  format?: string
  close?: string
}

const templatesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'templates',
)

/** "-07:00" for a zone on a day (Intl is fine in Node). */
export function zoneOffset(timeZone: string, day: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${day}T12:00:00Z`))
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT'
  const m = /GMT([+-]\d{2}:\d{2})?/.exec(name)
  return m && m[1] ? m[1] : '+00:00'
}

/** The document for the options: the template with its header filled in. */
export function buildDocument(opts: NewVoteOptions): Election {
  const template = JSON.parse(
    readFileSync(path.join(templatesDir, `${opts.ballot}.json`), 'utf8'),
  ) as Record<string, unknown>
  if (!/^[a-z0-9][a-z0-9-]*$/.test(opts.slug))
    throw new Error('slug must be lowercase letters, digits and dashes')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.day))
    throw new Error('--day must be YYYY-MM-DD')
  const timeZone = opts.timeZone || String(template.timeZone)
  const close = opts.close || '20:00'
  if (!/^\d{2}:\d{2}$/.test(close)) throw new Error('--close must be HH:MM')
  const place = opts.place || 'TODO'
  const kind = opts.ballot === 'referendum' ? 'referendum' : 'election'
  const results = { ...(template.results as Record<string, unknown>) }
  if (opts.format) results.format = opts.format
  const doc = {
    ...template,
    slug: opts.slug,
    title: opts.title,
    ballot: opts.ballot,
    votingDay: opts.day,
    published: false,
    place,
    eyebrow: `${place} ${kind} · voting day ${dayLong(opts.day)}`,
    pollsClose: `${opts.day}T${close}:00${zoneOffset(timeZone, opts.day)}`,
    timeZone,
    dates: { ...(template.dates as Record<string, unknown>), final: opts.day },
    results,
  }
  return parseElection(doc)
}

export function nextSteps(slug: string): string {
  return [
    `Wrote elections/${slug}.json (published: false). Next:`,
    `  1. Replace every TODO: parties or questions, slates, ridings or chambers, dates, sources, results source.`,
    `  2. pnpm elections:check            validates the document (and --write reformats it)`,
    `  3. pnpm dev -- --seed              or pnpm elections:push --local to load it locally`,
    `  4. pnpm relay --fixture --election ${slug} --target http://127.0.0.1:8090   a synthetic night (VOTING_INGEST_TOKEN=local-ingest-token)`,
    `  5. Set "published": true and pnpm elections:push --url https://voting.pockethost.io when it is ready.`,
  ].join('\n')
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const args = argv()
  const slug = args.positional[0]
  const ballot = args.flag('ballot') as NewVoteOptions['ballot'] | undefined
  const title = args.flag('title')
  const day = args.flag('day')
  if (!slug || !ballot || !title || !day) {
    console.error(
      'usage: pnpm new-vote <slug> --ballot at-large|district|referendum|chambers --title "..." --day YYYY-MM-DD [--tz zone] [--place "..."] [--format ...] [--close HH:MM] [--force]',
    )
    process.exit(1)
  }
  const file = path.join(electionsDir, `${slug}.json`)
  if (existsSync(file) && !args.has('force')) {
    console.error(
      `${path.relative(root, file)} exists; pass --force to overwrite`,
    )
    process.exit(1)
  }
  const doc = buildDocument({
    slug,
    ballot,
    title,
    day,
    timeZone: args.flag('tz'),
    place: args.flag('place'),
    format: args.flag('format'),
    close: args.flag('close'),
  })
  writeFileSync(file, documentText(doc))
  console.log(nextSteps(slug))
}
