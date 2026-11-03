// A chamber as a semicircle of seats, one dot each, filled left to right in
// segment order so each party reads as a wedge, with a tick at the majority
// and a legend beneath. Each segment is one tooltip target and one tab stop;
// a hatched segment (seats not up) stripes its dots with an SVG pattern.
import { useId, type ReactNode } from 'react'
import type { Segment } from './bars'
import { Legend } from './legend'
import { useTip, tipHandlersFor } from './tooltip'

export type Seat = { x: number; y: number; angle: number }

/** The seat rows' inner radius, as a share of the outer. */
const INNER = 0.4

/** How many rows of seats n takes: 12 for 435, 6 for 100. */
export const hemicycleRows = (n: number): number =>
  Math.max(2, Math.round(Math.sqrt(n) / 1.7))

/**
 * n seats on concentric half rings of radius INNER to 1 around (0, 0), y up:
 * each row takes seats in proportion to its length, and the seats come back
 * ordered by angle from the left end to the right.
 */
export function hemicycleSeats(n: number): Seat[] {
  if (n <= 0) return []
  const rows = hemicycleRows(n)
  const radii = Array.from(
    { length: rows },
    (_, i) => INNER + ((1 - INNER) * i) / (rows - 1),
  )
  const sum = radii.reduce((a, r) => a + r, 0)
  // Largest remainder, so the rows add up to n exactly.
  const exact = radii.map((r) => (n * r) / sum)
  const counts = exact.map(Math.floor)
  let left = n - counts.reduce((a, c) => a + c, 0)
  const order = exact
    .map((e, i) => ({ i, rest: e - Math.floor(e) }))
    .sort((a, b) => b.rest - a.rest)
  for (let k = 0; left > 0; k++, left--) counts[order[k % rows].i]++
  const seats: (Seat & { ring: number })[] = []
  radii.forEach((r, ring) => {
    const k = counts[ring]
    for (let j = 0; j < k; j++) {
      const angle = k === 1 ? Math.PI / 2 : Math.PI * (1 - j / (k - 1))
      seats.push({
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
        angle,
        ring,
      })
    }
  })
  return seats
    .sort((a, b) => b.angle - a.angle || a.ring - b.ring)
    .map(({ x, y, angle }) => ({ x, y, angle }))
}

/** The distance between rows of seats for n seats, in the same units. */
const rowGap = (n: number) => (1 - INNER) / (hemicycleRows(n) - 1)

/**
 * The seats of a chamber filled by segments in order, any left over in the
 * muted colour; `majority` ticks the gap after that many seats from the left.
 */
export function Hemicycle({
  segments,
  seats,
  majority,
  ariaLabel,
  caption,
  center,
  legend = true,
}: {
  segments: Segment[]
  seats: number
  majority?: number
  ariaLabel: string
  caption?: ReactNode
  center?: ReactNode
  legend?: boolean
}) {
  const tip = useTip()
  const id = useId()
  const S = 100
  const places = hemicycleSeats(seats)
  // A dot is under half the gap between rows; a transparent ring takes the
  // pointer most of the way to its neighbours, short of their dots.
  const r = 0.42 * rowGap(seats) * S
  const hit = 0.3 * rowGap(seats) * S
  const pad = r + 3
  const filled = segments.filter((s) => s.n > 0)
  // Where each segment starts: the seats of every segment before it.
  const starts = filled.map((_, i) =>
    filled.slice(0, i).reduce((a, s) => a + s.n, 0),
  )
  const groups = filled.map((s, i) => ({
    s,
    own: places.slice(starts[i], starts[i] + s.n),
    pattern: s.hatch ? `${id}-hatch-${i}` : null,
  }))
  const rest = places.slice(filled.reduce((a, s) => a + s.n, 0))
  const tick =
    majority && majority < places.length
      ? (places[majority - 1].angle + places[majority].angle) / 2
      : null
  return (
    <div className="space-y-2">
      {caption ? (
        <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {caption}
        </div>
      ) : null}
      <div className="viz relative">
        <svg
          viewBox={`${-S - pad} ${-S - pad} ${2 * (S + pad)} ${S + 2 * pad}`}
          className="block h-auto w-full"
          role="img"
          aria-label={ariaLabel}
        >
          <defs>
            {groups.map(({ s, pattern }) =>
              pattern ? (
                <pattern
                  key={pattern}
                  id={pattern}
                  width={3}
                  height={3}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(135)"
                >
                  <rect
                    width={3}
                    height={3}
                    style={{
                      fill: `color-mix(in oklab, ${s.hatch} 45%, var(--background))`,
                    }}
                  />
                  <rect width={1.7} height={3} style={{ fill: s.hatch }} />
                </pattern>
              ) : null,
            )}
          </defs>
          {rest.map((p, i) => (
            <circle
              key={i}
              cx={p.x * S}
              cy={-p.y * S}
              r={r}
              style={{ fill: 'var(--muted)' }}
            />
          ))}
          {groups.map(({ s, own, pattern }) => (
            <g
              key={s.key}
              tabIndex={0}
              data-segment={s.key}
              {...tipHandlersFor(tip, s.describe)}
            >
              {own.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x * S}
                  cy={-p.y * S}
                  r={r}
                  style={{
                    fill: pattern ? `url(#${pattern})` : s.color,
                    stroke: 'transparent',
                    strokeWidth: hit,
                  }}
                />
              ))}
            </g>
          ))}
          {tick != null ? (
            <line
              className="viz-mark"
              x1={(INNER * S - pad) * Math.cos(tick)}
              y1={-(INNER * S - pad) * Math.sin(tick)}
              x2={(S + pad) * Math.cos(tick)}
              y2={-(S + pad) * Math.sin(tick)}
              aria-hidden="true"
            />
          ) : null}
        </svg>
        {center ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
            <div className="max-w-[30%] text-center leading-tight">
              {center}
            </div>
          </div>
        ) : null}
      </div>
      {legend ? (
        <Legend
          items={segments
            .filter((s) => s.n > 0)
            .map((s) => ({ label: `${s.label} ${s.n}`, color: s.color }))}
        />
      ) : null}
    </div>
  )
}
