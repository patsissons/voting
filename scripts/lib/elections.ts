// The election documents on disk (elections/<slug>.json) for the scripts.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseElection } from '../../shared/schema/election.ts'
import type { Election } from '../../shared/schema/election.ts'

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)
export const electionsDir = path.join(root, 'elections')

export function electionFiles(): string[] {
  return readdirSync(electionsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(electionsDir, f))
}

/** A document, validated. */
export function loadElection(slugOrFile: string): Election {
  const file = slugOrFile.endsWith('.json')
    ? slugOrFile
    : path.join(electionsDir, `${slugOrFile}.json`)
  return parseElection(JSON.parse(readFileSync(file, 'utf8')))
}

export function loadElections(): Election[] {
  return electionFiles().map(loadElection)
}

/** Simple CLI flags: `--name value` and `--flag`. */
export function argv(args = process.argv.slice(2)) {
  return {
    flag: (name: string): string | undefined => {
      const i = args.indexOf(`--${name}`)
      return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')
        ? args[i + 1]
        : undefined
    },
    has: (name: string): boolean => args.includes(`--${name}`),
    positional: args.filter(
      (a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')),
    ),
  }
}
