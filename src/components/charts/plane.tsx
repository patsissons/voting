// A two-axis plane, -1..1 on both: labelled points (the parties) and an
// optional distinct "you" marker. Square, sized to the container. Labels sit
// beside their points and are nudged apart when points cluster.
import { useTip, tipHandlersFor, type TipContent } from './tooltip'
import { useMeasure } from './use-measure'

export type PlanePoint = {
  key: string
  label: string
  name?: string
  color: string
  x: number
  y: number
  r?: number
  seats?: number
}

export type PlaneProps = {
  points: PlanePoint[]
  you: { x: number; y: number; label?: string } | null
  xLabels: [string, string]
  yLabels: [string, string]
  describe: (
    pt: PlanePoint | { x: number; y: number; label: string },
  ) => TipContent
  ariaLabel: string
}

export function Plane(props: PlaneProps) {
  const { ref, width } = useMeasure()
  const tip = useTip()
  if (!width)
    return (
      <div ref={ref} className="viz viz-plane" style={{ minHeight: 240 }} />
    )
  const size = Math.max(240, Math.min(width, 460))
  const pad = 30
  const plot = size - pad * 2
  const sx = (v: number) => pad + ((v + 1) / 2) * plot
  const sy = (v: number) => pad + ((1 - v) / 2) * plot
  const mid = pad + plot / 2

  // Labels to the right of each point; a label near the right edge, or one
  // long enough to run past it (about 7 px a character at 12 px), flips left;
  // labels that would overlap are pushed apart vertically.
  const marks = props.points.map((pt) => ({ pt, cx: sx(pt.x), cy: sy(pt.y) }))
  const overflows = (m: (typeof marks)[number]) =>
    m.cx + (m.pt.r || 7) + 4 + String(m.pt.label).length * 7 > size - 4
  const labels = marks.map((m) => ({
    m,
    y: m.cy + 4,
    left: m.cx > pad + plot - 60 || overflows(m),
  }))
  labels.sort((a, b) => a.y - b.y)
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1]
    const cur = labels[i]
    if (Math.abs(cur.m.cx - prev.m.cx) < 90 && cur.y - prev.y < 14)
      cur.y = prev.y + 14
  }
  const you = props.you

  return (
    <div ref={ref} className="viz viz-plane">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={props.ariaLabel}
      >
        <rect
          x={pad}
          y={pad}
          width={plot}
          height={plot}
          className="viz-plane-bg"
        />
        <g className="viz-grid">
          {[-0.5, 0.5].map((v) => (
            <g key={v}>
              <line x1={sx(v)} x2={sx(v)} y1={pad} y2={pad + plot} />
              <line x1={pad} x2={pad + plot} y1={sy(v)} y2={sy(v)} />
            </g>
          ))}
        </g>
        <line
          className="viz-base"
          x1={sx(0)}
          x2={sx(0)}
          y1={pad}
          y2={pad + plot}
        />
        <line
          className="viz-base"
          x1={pad}
          x2={pad + plot}
          y1={sy(0)}
          y2={sy(0)}
        />
        <g className="viz-axis">
          <text x={mid} y={pad - 10} textAnchor="middle">
            {props.yLabels[0]}
          </text>
          <text x={mid} y={size - 10} textAnchor="middle">
            {props.yLabels[1]}
          </text>
          <text
            x={12}
            y={mid}
            textAnchor="middle"
            transform={`rotate(-90 12 ${mid})`}
          >
            {props.xLabels[0]}
          </text>
          <text
            x={size - 10}
            y={mid}
            textAnchor="middle"
            transform={`rotate(90 ${size - 10} ${mid})`}
          >
            {props.xLabels[1]}
          </text>
        </g>
        <g>
          {labels.map(({ m, y, left }) => {
            const r = m.pt.r || 7
            return (
              <g key={m.pt.key}>
                <circle
                  cx={m.cx}
                  cy={m.cy}
                  r={r}
                  className="viz-dot"
                  style={{ fill: m.pt.color }}
                  tabIndex={0}
                  {...tipHandlersFor(tip, () => props.describe(m.pt))}
                />
                <text
                  x={left ? m.cx - r - 4 : m.cx + r + 4}
                  y={y}
                  className="viz-plane-label"
                  textAnchor={left ? 'end' : 'start'}
                >
                  {m.pt.label}
                </text>
              </g>
            )
          })}
        </g>
        {you ? (
          <g
            className="viz-you"
            tabIndex={0}
            {...tipHandlersFor(tip, () =>
              props.describe({ ...you, label: you.label || 'You' }),
            )}
          >
            <circle
              cx={sx(you.x)}
              cy={sy(you.y)}
              r={11}
              className="viz-you-ring"
            />
            <circle
              cx={sx(you.x)}
              cy={sy(you.y)}
              r={3.5}
              className="viz-you-dot"
            />
            <text
              x={sx(you.x)}
              y={sy(you.y) - 16}
              textAnchor="middle"
              className="viz-plane-label viz-you-label"
            >
              {you.label || 'You'}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  )
}
