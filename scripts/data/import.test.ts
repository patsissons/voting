import { describe, expect, it } from 'vitest'
import { payloadHash, planImport } from './import.ts'
import type { ImportResult } from './transform.ts'

const row = (slug: string, ts: string): ImportResult => ({
  electionSlug: slug,
  source_ts: ts,
  sig: '',
  format: 'vancouver',
  official: false,
  polls_closed: 1,
  polls_total: 2,
  payload: { asOf: ts } as never,
  schema_version: 1,
  fetched: '',
})

describe('planImport', () => {
  it('creates only the rows the instance lacks', () => {
    const rows = [row('vancouver-2026', 'a'), row('vancouver-2026', 'b'), row('bc-2026', 'a'), row('nope', 'a')]
    const plan = planImport(rows, { 'vancouver-2026': 'v1', 'bc-2026': 'b1' }, [{ id: 'x', election: 'v1', source_ts: 'a' }])
    expect(plan.present).toBe(1)
    expect(plan.create.map((r) => [r.electionSlug, r.source_ts])).toEqual([
      ['vancouver-2026', 'b'],
      ['bc-2026', 'a'],
    ])
    expect(plan.missingElection.map((r) => r.electionSlug)).toEqual(['nope'])
    expect(planImport(rows.slice(0, 1), { 'vancouver-2026': 'v1' }, [{ id: 'x', election: 'v1', source_ts: 'a' }]).create).toEqual([])
  })

  it('hashes payloads stably', () => {
    expect(payloadHash({ a: 1 })).toBe(payloadHash({ a: 1 }))
    expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }))
    expect(payloadHash({ a: 1 })).toHaveLength(16)
  })
})
