// A row per item on one value axis: the result as a dot, labelled, against a
// bar spanning a range (the polls) with a tick at its latest value. A rule
// marks a threshold such as 50%. Each row is one hover and focus target.
import { useTip, tipHandlersFor, type TipContent } from './tooltip'
import { useMeasure } from './use-measure'

export type RangeDotsRow = {
  label: string
  value: number
  range?: { lo: number; hi: number; latest: number } | null
  describe: () => TipContent
}

export type RangeDotsProps = {
  rows: RangeDotsRow[]
  xDomain: [number, number]
  xTicks: number[]
  xFormat: (v: number) => string
  valueFormat: (v: number) => string
  ariaLabel: string
  dotColor: string
  rangeColor: string
  rule?: number
}

export function RangeDots(props: RangeDotsProps) {
  const { ref, width } = useMeasure()
  const tip = useTip()
  const rowH = 32
  const pad = { t: 8, b: 24, r: 14 }
  const height = pad.t + rowH * props.rows.length + pad.b
  if (!width)
    return (
      <div ref={ref} className="viz viz-range" style={{ minHeight: height }} />
    )
  const narrow = width < 480
  const labelW = narrow ? 112 : 196
  const plotW = width - labelW - pad.r
  const [x0, x1] = props.xDomain
  const x = (v: number) =>
    labelW + ((Math.min(x1, Math.max(x0, v)) - x0) / (x1 - x0)) * plotW
  const bottom = pad.t + rowH * props.rows.length

  return (
    <div ref={ref} className="viz viz-range" style={{ minHeight: height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={props.ariaLabel}
      >
        <g className="viz-grid">
          {props.xTicks.map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={pad.t} y2={bottom} />
          ))}
        </g>
        {props.rule != null ? (
          <line
            className="viz-base"
            x1={x(props.rule)}
            x2={x(props.rule)}
            y1={pad.t}
            y2={bottom}
          />
        ) : null}
        <g className="viz-axis">
          {props.xTicks.map((t) => (
            <text key={t} x={x(t)} y={height - 6} textAnchor="middle">
              {props.xFormat(t)}
            </text>
          ))}
        </g>
        {props.rows.map((row, i) => {
          const cy = pad.t + rowH * i + rowH / 2
          const r = row.range
          // The value label sits on the side of the dot away from the range.
          const right = !r || row.value >= r.latest
          return (
            <g
              key={i}
              className="viz-range-row"
              tabIndex={0}
              {...tipHandlersFor(tip, row.describe)}
            >
              <rect
                x={0}
                y={cy - rowH / 2}
                width={width}
                height={rowH}
                className="viz-hit"
              />
              <text x={0} y={cy + 4} className="viz-row-label">
                {row.label}
              </text>
              {r ? (
                <>
                  <line
                    className="viz-range-bar"
                    x1={x(r.lo)}
                    x2={Math.max(x(r.hi), x(r.lo) + 0.1)}
                    y1={cy}
                    y2={cy}
                    style={{ stroke: props.rangeColor }}
                  />
                  <line
                    className="viz-range-tick"
                    x1={x(r.latest)}
                    x2={x(r.latest)}
                    y1={cy - 7}
                    y2={cy + 7}
                    style={{ stroke: props.rangeColor }}
                  />
                </>
              ) : null}
              <circle
                cx={x(row.value)}
                cy={cy}
                r={6}
                className="viz-dot"
                style={{ fill: props.dotColor }}
              />
              <text
                x={x(row.value) + (right ? 11 : -11)}
                y={cy + 4}
                textAnchor={right ? 'start' : 'end'}
                className="viz-end viz-range-value"
              >
                {props.valueFormat(row.value)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
