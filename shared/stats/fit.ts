// Ordinary least squares on paired values: y = a + b * x, with Pearson's r.
// For the bespoke analysis pages (division shares against each other).

export type Fit = { a: number; b: number; r: number }

/** The least-squares line through the pairs, or null with fewer than 3 or no spread. */
export function linearFit(xs: number[], ys: number[]): Fit | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += xs[i]
    my += ys[i]
  }
  mx /= n
  my /= n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  if (!sxx) return null
  const b = sxy / sxx
  return { a: my - b * mx, b, r: syy ? sxy / Math.sqrt(sxx * syy) : 0 }
}
