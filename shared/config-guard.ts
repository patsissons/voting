// A shape guard for an election document read back from the `config`
// column inside the hooks, where zod does not run. The push script validated
// the document with the full schema (shared/schema/election.ts); this only
// catches a row written some other way before the parsers trip over it.
import type { Election } from './schema/election.ts'

const BALLOTS = ['at-large', 'district', 'referendum', 'chambers']
const FORMATS = ['vancouver', 'ebc-enr', 'eab-ref', 'eab-dash', 'civicapi']

/** Problems with a document's shape, or [] when it looks like an election. */
export function configProblems(doc: unknown): string[] {
  const problems: string[] = []
  const d = doc as Record<string, unknown>
  if (!d || typeof d !== 'object') return ['config is not an object']
  if (typeof d.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(d.slug))
    problems.push('slug')
  if (typeof d.title !== 'string' || !d.title) problems.push('title')
  if (!BALLOTS.includes(String(d.ballot))) problems.push('ballot')
  if (
    typeof d.pollsClose !== 'string' ||
    !Number.isFinite(Date.parse(d.pollsClose))
  )
    problems.push('pollsClose')
  if (
    d.ballot !== 'chambers' &&
    (!Array.isArray(d.questions) || !d.questions.length)
  )
    problems.push('questions')
  const results = d.results as Record<string, unknown> | undefined
  if (!results || typeof results !== 'object') problems.push('results')
  else if (!FORMATS.includes(String(results.format)))
    problems.push('results.format')
  if (d.ballot !== 'referendum' && !Array.isArray(d.parties))
    problems.push('parties')
  if (d.ballot === 'district' && !Array.isArray(d.districts))
    problems.push('districts')
  if (d.ballot === 'chambers' && !Array.isArray(d.chambers))
    problems.push('chambers')
  return problems
}

export function isElectionConfig(doc: unknown): doc is Election {
  return configProblems(doc).length === 0
}
