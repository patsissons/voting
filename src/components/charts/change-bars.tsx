// One signed value per row on an axis centred on zero: a bar to the right
// for a gain, to the left for a loss, with the value at its end. The axis is
// symmetric and scales to the largest change, so a one-point swing stays
// visible where a share axis (0-50%) would flatten it.
import { useTip, tipHandlersFor, type TipContent } from './tooltip'
import { niceTicks, useMeasure } from './use-measure'

export type ChangeRow = {
  label: string
  color: string
  value: number
  describe: () => TipContent
}

export type ChangeBarsProps = {
  rows: ChangeRow[]
  xFormat: (v: number) => string
  valueFormat: (v: number) => string
  ariaLabel: string
}

export function ChangeBars(props: ChangeBarsProps) {
  const { ref, width } = useMeasure()
  const tip = useTip()
  const rowH = 28
  const barH = 12
  const pad = { t: 6, b: 24, r: 16 }
  const height = pad.t + rowH * props.rows.length + pad.b
  const labelW = width < 480 ? 92 : 150
  const plotW = Math.max(10, width - labelW - pad.r)
  // A quarter of headroom keeps the value labels inside the plot.
  const half = niceTicks(
    Math.max(1, ...props.rows.map((r) => Math.abs(r.value))) * 1.25,
    2,
  )
  const xMax = half[half.length - 1]
  const ticks = [
    ...half
      .slice(1)
      .map((t) => -t)
      .reverse(),
    ...half,
  ]
  const x = (v: number) =>
    labelW + ((Math.max(-xMax, Math.min(xMax, v)) + xMax) / (2 * xMax)) * plotW
  return (
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
          <line
            x1={x(0)}
            x2={x(0)}
            y1={pad.t}
            y2={height - pad.b}
            className="viz-base"
          />
          <g className="viz-axis">
            {ticks.map((t, i) => (
              <text
                key={t}
                x={x(t)}
                y={height - 6}
                textAnchor={
                  i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'
                }
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
            const from = x(Math.min(0, row.value))
            const to = x(Math.max(0, row.value))
            const gain = row.value >= 0
            return (
              <g key={i} tabIndex={0} {...tipHandlersFor(tip, row.describe)}>
                <rect
                  x={labelW}
                  y={cy - rowH / 2}
                  width={plotW}
                  height={rowH}
                  className="viz-hitdot"
                />
                <rect
                  x={from}
                  y={cy - barH / 2}
                  width={Math.max(2, to - from)}
                  height={barH}
                  rx={2}
                  style={{ fill: row.color }}
                />
                <text
                  x={gain ? to + 6 : from - 6}
                  y={cy + 4}
                  textAnchor={gain ? 'start' : 'end'}
                  className="viz-end nums"
                >
                  {props.valueFormat(row.value)}
                </text>
              </g>
            )
          })}
        </svg>
      ) : null}
    </div>
  )
}
