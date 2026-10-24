// Points on two numeric axes, one per item (a division, a riding), with an
// optional fitted line, a horizontal rule and a few named points labelled.
// Labels that would overlap step away from their point and take a leader
// line; on a narrow chart there is no room, so the tooltip names every point.
// Each point has a wider hit circle.
import { useTip, tipHandlersFor, type TipContent } from './tooltip'
import { useMeasure } from './use-measure'

export type ScatterPoint = {
  key: string
  x: number
  y: number
  color: string
  describe: () => TipContent
}

export type ScatterProps = {
  points: ScatterPoint[]
  xDomain: [number, number]
  yDomain: [number, number]
  xTicks: number[]
  yTicks: number[]
  xFormat: (v: number) => string
  yFormat: (v: number) => string
  xLabel: string
  yLabel: string
  ariaLabel: string
  /** y = a + b * x, drawn across the points' x range. */
  fit?: { a: number; b: number } | null
  rule?: { y: number }
  /** Points to name on the chart (the rest are in the tooltip). */
  labels?: { key: string; text: string }[]
  height?: number
}

const CHAR_W = 6.4
const LINE_H = 14

export function Scatter(props: ScatterProps) {
  const { ref, width } = useMeasure()
  const tip = useTip()
  const narrow = width < 480
  const height = props.height || (narrow ? 300 : 420)
  const pad = { l: 44, r: 12, t: 12, b: 40 }
  if (!width)
    return (
      <div
        ref={ref}
        className="viz viz-scatter"
        style={{ minHeight: height }}
      />
    )
  const plotW = width - pad.l - pad.r
  const plotH = height - pad.t - pad.b
  const [x0, x1] = props.xDomain
  const [y0, y1] = props.yDomain
  const x = (v: number) => pad.l + ((v - x0) / (x1 - x0)) * plotW
  const y = (v: number) => pad.t + plotH - ((v - y0) / (y1 - y0)) * plotH
  const byKey = new Map(props.points.map((p) => [p.key, p]))
  const fitLine = (() => {
    if (!props.fit || !props.points.length) return null
    const xs = props.points.map((p) => p.x)
    const lo = Math.max(x0, Math.min(...xs))
    const hi = Math.min(x1, Math.max(...xs))
    return {
      x1: x(lo),
      y1: y(props.fit.a + props.fit.b * lo),
      x2: x(hi),
      y2: y(props.fit.a + props.fit.b * hi),
    }
  })()
  // A point above the fit labels upward, below it downward, so labels move
  // away from the cloud; a label that would overlap one placed earlier steps on.
  const placed: { x: number; y: number; w: number }[] = []
  const labels = (narrow ? [] : props.labels || []).flatMap((l) => {
    const p = byKey.get(l.key)
    if (!p) return []
    const above = props.fit ? p.y >= props.fit.a + props.fit.b * p.x : true
    const w = l.text.length * CHAR_W
    const cx = x(p.x)
    const cy = y(p.y)
    const lx = Math.max(pad.l, Math.min(cx + 8, width - pad.r - w))
    let ly = cy + (above ? -9 : 16)
    while (
      placed.some(
        (o) =>
          lx < o.x + o.w && o.x < lx + w && Math.abs(o.y - ly) < LINE_H - 1,
      )
    )
      ly += above ? -LINE_H : LINE_H
    placed.push({ x: lx, y: ly, w })
    return [{ key: l.key, text: l.text, cx, cy, lx, ly, above }]
  })

  return (
    <div ref={ref} className="viz viz-scatter" style={{ minHeight: height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={props.ariaLabel}
      >
        <g className="viz-grid">
          {props.xTicks.map((t) => (
            <line
              key={`x${t}`}
              x1={x(t)}
              x2={x(t)}
              y1={pad.t}
              y2={pad.t + plotH}
            />
          ))}
          {props.yTicks.map((t) => (
            <line
              key={`y${t}`}
              x1={pad.l}
              x2={pad.l + plotW}
              y1={y(t)}
              y2={y(t)}
            />
          ))}
        </g>
        {props.rule ? (
          <line
            className="viz-base"
            x1={pad.l}
            x2={pad.l + plotW}
            y1={y(props.rule.y)}
            y2={y(props.rule.y)}
          />
        ) : null}
        <g className="viz-axis">
          {props.xTicks.map((t, i) =>
            !narrow || i % 2 === 0 ? (
              <text
                key={`x${t}`}
                x={x(t)}
                y={pad.t + plotH + 16}
                textAnchor="middle"
              >
                {props.xFormat(t)}
              </text>
            ) : null,
          )}
          {props.yTicks.map((t) => (
            <text key={`y${t}`} x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {props.yFormat(t)}
            </text>
          ))}
          <text x={pad.l + plotW / 2} y={height - 4} textAnchor="middle">
            {props.xLabel}
          </text>
          <text
            x={12}
            y={pad.t + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 12 ${pad.t + plotH / 2})`}
          >
            {props.yLabel}
          </text>
        </g>
        {fitLine ? <line className="viz-fit" {...fitLine} /> : null}
        {props.points.map((p) => (
          <g
            key={p.key}
            className="viz-scatter-dot"
            data-key={p.key}
            tabIndex={0}
            {...tipHandlersFor(tip, p.describe)}
          >
            <circle cx={x(p.x)} cy={y(p.y)} r={10} className="viz-hitdot" />
            <circle
              cx={x(p.x)}
              cy={y(p.y)}
              r={narrow ? 4 : 5}
              className="viz-dot"
              style={{ fill: p.color }}
            />
          </g>
        ))}
        {labels.map((l) =>
          Math.abs(l.ly - l.cy) > 20 ? (
            <line
              key={`${l.key}-leader`}
              className="viz-leader"
              x1={l.cx}
              y1={l.cy}
              x2={l.lx + 4}
              y2={l.ly + (l.above ? 3 : -11)}
            />
          ) : null,
        )}
        {labels.map((l) => (
          <text
            key={l.key}
            x={l.lx}
            y={l.ly}
            className="viz-plane-label viz-scatter-label"
          >
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  )
}
