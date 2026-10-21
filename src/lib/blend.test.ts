import { describe, expect, it } from 'vitest'
import { blendCss } from './blend'

const colorOf = (key: string) => `var(--${key})`

describe('blendCss', () => {
  it('nests color-mix from the heaviest weight out', () => {
    expect(blendCss([], colorOf)).toBe('var(--muted)')
    expect(blendCss([{ key: 'a', w: 1 }], colorOf)).toBe('var(--a)')
    expect(
      blendCss(
        [
          { key: 'a', w: 0.75 },
          { key: 'b', w: 0.25 },
        ],
        colorOf,
      ),
    ).toBe('color-mix(in oklab, var(--a) 75%, var(--b))')
    // b is 0.2 of 0.25, so 80% of what is left after a.
    expect(
      blendCss(
        [
          { key: 'a', w: 0.75 },
          { key: 'b', w: 0.2 },
          { key: 'c', w: 0.05 },
        ],
        colorOf,
      ),
    ).toBe(
      'color-mix(in oklab, var(--a) 75%, color-mix(in oklab, var(--b) 80%, var(--c)))',
    )
  })

  it('drops a weight too small to show', () => {
    expect(
      blendCss(
        [
          { key: 'a', w: 0.9999 },
          { key: 'b', w: 0.0001 },
        ],
        colorOf,
        'grey',
      ),
    ).toBe('var(--a)')
  })
})
