import { describe, expect, it } from 'vitest'
import { linearFit } from './fit.ts'

describe('linear fit', () => {
  it('recovers an exact line', () => {
    const fit = linearFit([0, 1, 2, 3], [5, 7, 9, 11])!
    expect(fit.a).toBeCloseTo(5)
    expect(fit.b).toBeCloseTo(2)
    expect(fit.r).toBeCloseTo(1)
  })

  it('fits noisy pairs and signs r by the slope', () => {
    const fit = linearFit([1, 2, 3, 4, 5], [10, 7, 8, 4, 3])!
    expect(fit.b).toBeCloseTo(-1.7)
    expect(fit.a).toBeCloseTo(11.5)
    expect(fit.r).toBeLessThan(-0.9)
    expect(fit.r).toBeGreaterThan(-1)
    expect(linearFit([1, 2, 3], [4, 4, 4])).toEqual({ a: 4, b: 0, r: 0 })
  })

  it('needs three pairs with some spread in x', () => {
    expect(linearFit([1, 2], [1, 2])).toBeNull()
    expect(linearFit([2, 2, 2], [1, 2, 3])).toBeNull()
  })
})
