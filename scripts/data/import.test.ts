import { describe, expect, it } from 'vitest'
import { payloadHash, planImport, planSync } from './import.ts'
import type { SyncRow } from './import.ts'
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

const have = (id: string, election: string, r: ImportResult, patch: Partial<ImportResult> = {}): SyncRow => {
  const { electionSlug: _slug, fetched: _fetched, ...rest } = r
  return { id, election, ...rest, ...patch }
}

describe('planSync', () => {
  const ids = { 'vancouver-2026': 'v1', 'alberta-2026': 'a1', 'bc-2026': 'b1' }
  const slugs = Object.keys(ids)

  it('creates missing rows and leaves identical ones alone', () => {
    const rows = [row('vancouver-2026', 'a'), row('vancouver-2026', 'b')]
    const plan = planSync(rows, ids, [have('x', 'v1', rows[0])], slugs)
    expect(plan.present).toBe(1)
    expect(plan.create.map((r) => r.source_ts)).toEqual(['b'])
    expect(plan.update).toEqual([])
    expect(plan.remove).toEqual([])
  })

  it('compares payloads regardless of key order', () => {
    const r = { ...row('alberta-2026', 'a'), payload: { asOf: 'a', polls: { closed: 1, total: 2 } } as never }
    const sorted = have('x', 'a1', r, { payload: { polls: { total: 2, closed: 1 }, asOf: 'a' } as never })
    expect(planSync([r], ids, [sorted], slugs).present).toBe(1)
  })

  it('updates a row whose payload was stripped or whose official flag flipped', () => {
    const rows = [row('alberta-2026', 'a'), { ...row('alberta-2026', 'b'), official: true }]
    const existing = [have('x', 'a1', rows[0], { payload: { asOf: 'a', divisions: [] } as never }), have('y', 'a1', rows[1], { official: false })]
    const plan = planSync(rows, ids, existing, slugs)
    expect(plan.update.map((u) => [u.id, u.row.source_ts])).toEqual([
      ['x', 'a'],
      ['y', 'b'],
    ])
    expect(plan.present).toBe(0)
  })

  it('deletes instance rows the export lacks, including every row of an empty election', () => {
    const rows = [row('vancouver-2026', 'a')]
    const existing = [have('x', 'v1', rows[0]), have('y', 'v1', row('vancouver-2026', 'old')), have('z', 'b1', row('bc-2026', 'shadow'))]
    const plan = planSync(rows, ids, existing, slugs)
    expect(plan.remove.map((r) => r.id)).toEqual(['y', 'z'])
  })

  it('touches only the elections in scope', () => {
    const rows = [row('vancouver-2026', 'a'), row('alberta-2026', 'a')]
    const existing = [have('y', 'v1', row('vancouver-2026', 'old')), have('z', 'b1', row('bc-2026', 'shadow'))]
    const plan = planSync(rows, ids, existing, ['alberta-2026'])
    expect(plan.create.map((r) => r.electionSlug)).toEqual(['alberta-2026'])
    expect(plan.remove).toEqual([])
  })

  it('sets aside rows for elections the instance lacks', () => {
    const plan = planSync([row('nope', 'a')], ids, [], ['nope'])
    expect(plan.missingElection.map((r) => r.electionSlug)).toEqual(['nope'])
    expect(plan.create).toEqual([])
  })
})
