// A results-map fill as CSS: the blend weights (shared/stats/blend.ts) folded
// into nested color-mix() calls over the page's colour tokens, so the fill
// follows the light and dark palettes without any colour maths here.
import type { Weight } from '../../shared/stats/blend.ts'

/** A CSS colour mixing colorOf(key) by weight; `empty` for no weights. */
export function blendCss(
  weights: Weight[],
  colorOf: (key: string) => string,
  empty = 'var(--muted)',
): string {
  if (!weights.length) return empty
  let css = colorOf(weights[weights.length - 1].key)
  let rest = weights[weights.length - 1].w
  for (let i = weights.length - 2; i >= 0; i--) {
    rest += weights[i].w
    const p = Math.round((weights[i].w / rest) * 1000) / 10
    if (p >= 100) css = colorOf(weights[i].key)
    else if (p > 0)
      css = `color-mix(in oklab, ${colorOf(weights[i].key)} ${p}%, ${css})`
  }
  return css
}
