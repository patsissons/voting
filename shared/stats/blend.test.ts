import { describe, expect, it } from 'vitest'
import { blendWeights, LEADER } from './blend.ts'

const sum = (ws: { w: number }[]) => ws.reduce((a, b) => a + b.w, 0)

describe('blendWeights', () => {
  it('lifts a narrow leader to the floor and keeps the order', () => {
    const ws = blendWeights([
      { key: 'cp', share: 40 },
      { key: 'ndp', share: 45 },
      { key: 'green', share: 10 },
    ])
    expect(ws.map((w) => w.key)).toEqual(['ndp', 'cp', 'green'])
    expect(ws[0].w).toBe(LEADER)
    expect(ws[1].w).toBeGreaterThan(ws[2].w * 10)
    expect(sum(ws)).toBeCloseTo(1, 10)
  })

  it('sharpens a clear lead past the floor', () => {
    const [a, b] = blendWeights([
      { key: 'a', share: 70 },
      { key: 'b', share: 30 },
    ])
    expect(a.w).toBeCloseTo(343 / (343 + 27), 10)
    expect(b.w).toBeCloseTo(27 / (343 + 27), 10)
  })

  it('leaves a tie even, with no leader', () => {
    const ws = blendWeights([
      { key: 'a', share: 50 },
      { key: 'b', share: 50 },
    ])
    expect(ws.map((w) => w.w)).toEqual([0.5, 0.5])
  })

  it('gives a lone choice all of the colour and nothing for no votes', () => {
    expect(blendWeights([{ key: 'a', share: 12 }])).toEqual([
      { key: 'a', w: 1 },
    ])
    expect(
      blendWeights([
        { key: 'a', share: 0 },
        { key: 'b', share: 0 },
      ]),
    ).toEqual([])
    expect(blendWeights([])).toEqual([])
  })
})
