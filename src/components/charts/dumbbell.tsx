// Two values per row on one percent axis: a hollow ring for the first, a
// filled dot for the second, joined by a line.
import { Legend } from './legend'
import { useTip, tipHandlersFor, type TipContent } from './tooltip'
import { niceTicks, useMeasure } from './use-measure'

export type DumbbellRow = {
  label: string
  color: string
  a: number
  b: number
  describe: () => TipContent
}

export type DumbbellProps = {
  rows: DumbbellRow[]
  aLabel: string
  bLabel: string
  xFormat: (v: number) => string
  ariaLabel: string
}

export function Dumbbell(props: DumbbellProps) {
  const { ref, width } = useMeasure()
  const tip = useTip()
  const rowH = 32
  const pad = { t: 6, b: 24, r: 16 }
  const height = pad.t + rowH * props.rows.length + pad.b
  const labelW = width < 480 ? 92 : 150
  const plotW = Math.max(10, width - labelW - pad.r)
  const ticks = niceTicks(Math.max(1, ...props.rows.flatMap((r) => [r.a, r.b])))
  const xMax = ticks[ticks.length - 1]
  const x = (v: number) => labelW + (Math.max(0, v) / xMax) * plotW
  return (
    <div className="viz-dumbbell space-y-2">
      <Legend
        items={[
          { label: props.aLabel, color: 'transparent', line: false },
          { label: props.bLabel, color: 'var(--foreground)' },
        ]}
        className="[&>span:first-child>i]:border-foreground [&>span:first-child>i]:rounded-full [&>span:first-child>i]:border-2"
      />
      <div ref={ref} className="viz" style={{ minHeight: height }}>
        {width ? (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={props.ariaLabel}
          >
            <g className="viz-grid">
              {ticks.map((t) => (
                <line
                  key={t}
                  x1={x(t)}
                  x2={x(t)}
                  y1={pad.t}
                  y2={height - pad.b}
                />
              ))}
            </g>
            <g className="viz-axis">
              {ticks.map((t, i) => (
                <text
                  key={t}
                  x={x(t)}
                  y={height - 6}
                  textAnchor={i === 0 ? 'start' : 'middle'}
                >
                  {props.xFormat(t)}
                </text>
              ))}
              {props.rows.map((row, i) => (
                <text
                  key={i}
                  x={0}
                  y={pad.t + rowH * i + rowH / 2 + 4}
                  className="viz-row-label"
                >
                  {row.label}
                </text>
              ))}
            </g>
            {props.rows.map((row, i) => {
              const cy = pad.t + rowH * i + rowH / 2
              return (
                <g
                  key={i}
                  className="viz-strip-dot"
                  tabIndex={0}
                  {...tipHandlersFor(tip, row.describe)}
                >
                  <rect
                    x={labelW}
                    y={cy - rowH / 2}
                    width={plotW}
                    height={rowH}
                    className="viz-hitdot"
                  />
                  <line
                    x1={x(row.a)}
                    x2={x(row.b)}
                    y1={cy}
                    y2={cy}
                    className="viz-bell"
                    style={{ stroke: row.color }}
                  />
                  <circle
                    cx={x(row.a)}
                    cy={cy}
                    r={6}
                    className="viz-dot viz-hollow"
                    style={{ stroke: row.color }}
                  />
                  <circle
                    cx={x(row.b)}
                    cy={cy}
                    r={6}
                    className="viz-dot"
                    style={{ fill: row.color }}
                  />
                </g>
              )
            })}
          </svg>
        ) : null}
      </div>
    </div>
  )
}
