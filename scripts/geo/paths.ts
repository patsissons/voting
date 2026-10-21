// The ring-to-path step of scripts/geo/build.ts, kept apart so the test can
// exercise it without mapshaper.

/**
 * An SVG path for polygons of rings, through `project` to whole units: an
 * absolute move per ring, then relative lines. Repeated points are dropped
 * and rings that collapse below a triangle are left out; '' when nothing is
 * left.
 */
export function toPath(
  polygons: number[][][][],
  project: (x: number, y: number) => [number, number],
): string {
  const out: string[] = []
  for (const poly of polygons) {
    for (const ring of poly) {
      const pts: [number, number][] = []
      for (const [x, y] of ring) {
        const p = project(x, y)
        const last = pts[pts.length - 1]
        if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p)
      }
      const first = pts[0]
      const end = pts[pts.length - 1]
      if (pts.length > 1 && first[0] === end[0] && first[1] === end[1])
        pts.pop()
      if (pts.length < 3) continue
      const steps = pts
        .slice(1)
        .map((p, i) => `${p[0] - pts[i][0]} ${p[1] - pts[i][1]}`)
      out.push(`M${first[0]} ${first[1]}l${steps.join(' ')}z`)
    }
  }
  return out.join('')
}
