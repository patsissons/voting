import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { legacyConfig } from '../fixtures/load.ts'
import { electionsDir } from '../lib/elections.ts'
import { documentText } from '../lib/json.ts'
import { LEGACY_ROWS } from './legacy.ts'
import { latestExport, transformElection, transformExport, transformResult } from './transform.ts'

describe('transform', () => {
  it('reproduces the committed election documents from the cubby files and rows', () => {
    for (const row of LEGACY_ROWS) {
      const doc = transformElection(legacyConfig(row.slug), row)
      const committed = readFileSync(path.join(electionsDir, `${row.slug}.json`), 'utf8')
      expect(documentText(doc), row.slug).toBe(committed)
    }
  })

  it('maps a results row onto the new columns with the payload untouched', () => {
    const election = transformElection(legacyConfig('bc-2026'), LEGACY_ROWS[1])
    const payload = { asOf: '2026-10-24 20:05:00', polls: { closed: 1, total: 2 }, contests: [] } as never
    const out = transformResult({ election: 'x', source_ts: '2026-10-24 20:05:00', official: false, polls_closed: 1, polls_total: 2, payload, created: '2026-10-25 03:06:00.000Z' }, 'bc-2026', election)
    expect(out).toEqual({
      electionSlug: 'bc-2026',
      source_ts: '2026-10-24 20:05:00',
      sig: '',
      format: 'ebc-enr',
      official: false,
      polls_closed: 1,
      polls_total: 2,
      payload,
      schema_version: 1,
      fetched: '2026-10-25 03:06:00.000Z',
    })
  })

  it('transforms a whole export, sorted by election and stamp', () => {
    const elections = LEGACY_ROWS.map((r, i) => ({ id: `id${i}`, ...r, results_source: i === 2 ? 'https://x' : '' }))
    const configs = Object.fromEntries(LEGACY_ROWS.map((r) => [r.slug, legacyConfig(r.slug)]))
    const payload = (asOf: string, sig?: string) => ({ asOf, sig, polls: { closed: 1, total: 1 }, contests: [] }) as never
    const results = [
      { election: 'id2', source_ts: '2026-10-19 21:00:00', official: false, polls_closed: 1, polls_total: 1, payload: payload('2026-10-19 21:00:00', 'abc') },
      { election: 'id0', source_ts: '2026-10-17 20:45:00', official: false, polls_closed: 1, polls_total: 1, payload: payload('2026-10-17 20:45:00') },
      { election: 'id2', source_ts: '2026-10-19 20:40:00', official: false, polls_closed: 1, polls_total: 1, payload: payload('2026-10-19 20:40:00', 'xyz') },
    ]
    const out = transformExport({ elections, results, configs })
    expect(out.elections.map((e) => e.slug)).toEqual(['vancouver-2026', 'bc-2026', 'alberta-2026'])
    expect(out.results.map((r) => [r.electionSlug, r.source_ts, r.sig, r.format])).toEqual([
      ['alberta-2026', '2026-10-19 20:40:00', 'xyz', 'eab-dash'],
      ['alberta-2026', '2026-10-19 21:00:00', 'abc', 'eab-dash'],
      ['vancouver-2026', '2026-10-17 20:45:00', '', 'vancouver'],
    ])
    expect(out.hidden['alberta-2026'].results_source).toBe('https://x')
    expect(() => transformExport({ elections, results: [{ ...results[0], election: 'nope' }], configs })).toThrow(/unknown election/)
  })
})

describe('latestExport', () => {
  it('picks the newest export with a manifest, never a hand-made directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'voting-export-'))
    try {
      expect(latestExport(path.join(dir, 'missing'))).toBeNull()
      for (const name of ['2026-10-20-12-00-00', '2026-10-20-22-24-49', '2026-10-20-legacy', 'README.md']) {
        if (name.endsWith('.md')) writeFileSync(path.join(dir, name), '')
        else mkdirSync(path.join(dir, name))
      }
      expect(latestExport(dir)).toBeNull()
      for (const name of ['2026-10-20-12-00-00', '2026-10-20-22-24-49']) writeFileSync(path.join(dir, name, 'manifest.json'), '{}')
      expect(latestExport(dir)).toBe(path.join(dir, '2026-10-20-22-24-49'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
