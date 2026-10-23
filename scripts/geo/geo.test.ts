import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BoundarySet } from '../../shared/geo.ts'
import { BOUNDARY_SETS } from '../../shared/schema/election.ts'
import { loadElections, root } from '../lib/elections.ts'
import { us } from '../fixtures/load.ts'
import { toPath } from './paths.ts'

const loadSet = (key: string): BoundarySet =>
  JSON.parse(readFileSync(path.join(root, 'src/geo', `${key}.json`), 'utf8'))

describe('toPath', () => {
  it('moves once per ring, then draws relative lines', () => {
    const square = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ]
    expect(toPath([square], (x, y) => [x, y])).toBe('M0 0l10 0 0 10 -10 0z')
  })

  it('drops repeated points and rings that collapse', () => {
    const sliver = [
      [
        [0, 0],
        [0.2, 0],
        [0.2, 0.2],
        [0, 0],
      ],
    ]
    const round = (x: number, y: number): [number, number] => [
      Math.round(x),
      Math.round(y),
    ]
    expect(toPath([sliver], round)).toBe('')
  })
})

describe('boundary sets', () => {
  const elections = loadElections()

  it.each([...BOUNDARY_SETS])('%s has one path per division', (key) => {
    const set = loadSet(key)
    expect(set.key).toBe(key)
    expect(set.attribution).toMatch(/Licence|public domain/)
    const [province, ...insets] = set.frames
    expect(province.key).toBe('province')
    expect(insets.length).toBeGreaterThan(0)
    const codes = Object.keys(province.paths).sort()
    for (const f of set.frames) {
      expect(f.viewBox[0]).toBe(1000)
      for (const [code, d] of Object.entries(f.paths)) {
        expect(codes, `${f.key} ${code}`).toContain(code)
        expect(d).toMatch(/^M\d+ \d+l/)
      }
    }
    for (const e of elections) {
      if (e.ballot === 'at-large') continue
      if (e.ballot === 'chambers') {
        // A chamber's divisions are the set's codes, or a subset of them:
        // the state map serves the 35 Senate races and the 36 governors.
        for (const c of e.chambers) {
          if (c.boundaries !== key) continue
          for (const code of Object.keys(c.divisions))
            expect(codes, `${e.slug} ${c.key} ${code}`).toContain(code)
        }
        continue
      }
      if (e.boundaries !== key) continue
      const want =
        e.ballot === 'district'
          ? e.districts.map((d) => d.code)
          : Object.keys(
              (e.results.format === 'eab-dash' && e.results.divisions) || {},
            )
      expect(codes, e.slug).toEqual([...want].sort())
    }
  })

  it('names a set for each map election', () => {
    const named = elections
      .filter((e) =>
        e.ballot === 'chambers'
          ? e.chambers.some((c) => c.boundaries)
          : e.ballot !== 'at-large' && e.boundaries,
      )
      .map((e) => e.slug)
      .sort()
    expect(named).toEqual(['alberta-2026', 'bc-2026', 'us-2026'])
  })

  it('covers every House district and every state', () => {
    const house = us().chambers.find((c) => c.key === 'house')!
    const districts = loadSet('us-cd119')
    expect(Object.keys(districts.frames[0].paths).sort()).toEqual(
      Object.keys(house.divisions).sort(),
    )
    expect(districts.frames.map((f) => f.key)).toEqual([
      'province',
      'nyc',
      'la',
      'bay',
      'chicago',
      'dc',
      'sfl',
    ])
    const states = loadSet('us-state')
    expect(Object.keys(states.frames[0].paths).length).toBe(50)
    expect(states.frames[0].paths.ak).toMatch(/^M/)
  })
})
