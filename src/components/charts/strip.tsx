// Dots on one value axis, a row per group: filled dots are in, hollow are
// out, with an optional dashed cutoff and marks. Each dot has a wider hit
// circle. A dot's own colour wins over its row's; ring circles it (the
// viewer's own).
import { useTip, tipHandlersFor, type TipContent } from './tooltip'
import { niceTicks, useMeasure } from './use-measure'

export type StripDot = {
  value: number
  in: boolean
  describe: () => TipContent
  color?: string
  ring?: boolean
}
export type StripRow = {
  label: string
  sub?: string
  color: string
  dots: StripDot[]
}

export type StripProps = {
  rows: StripRow[]
  xFormat: (v: number) => string
  ariaLabel: string
  cutoff?: number
  cutoffLabel?: string
  cutoffAnchor?: 'start' | 'middle' | 'end'
  marks?: {
    value: number
    label: string
    short?: string
    anchor?: 'start' | 'middle' | 'end'
  }[]
  xTicks?: number[]
  xMax?: number
}

export function Strip(props: StripProps) {
  const { ref, width } = useMeasure()
  const tip = useTip()
  const rowH = 30
  const pad = { t: 22, b: 24, r: 14 }
  const height = pad.t + rowH * props.rows.length + pad.b
  if (!width)
    return (
      <div ref={ref} className="viz viz-strip" style={{ minHeight: height }} />
    )
  const labelW = width < 480 ? 92 : 132
  const plotW = width - labelW - pad.r
  const max = Math.max(
    1,
    ...props.rows.flatMap((r) => r.dots.map((d) => d.value)),
  )
  const ticks = props.xTicks || niceTicks(max)
  const xMax = props.xMax != null ? props.xMax : ticks[ticks.length - 1]
  const x = (v: number) => labelW + (v / xMax) * plotW
  const narrow = width < 480
  const fits = (label: string, value: number) =>
    x(value) + 3 + String(label || '').length * 6.5 <= width - 2

  return (
    <div ref={ref} className="viz viz-strip" style={{ minHeight: height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={props.ariaLabel}
      >
        <g className="viz-grid">
          {ticks.map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={pad.t} y2={height - pad.b} />
          ))}
        </g>
        {props.rows.map((_row, i) => (
          <line
            key={i}
            className="viz-row-rule"
            x1={labelW}
            x2={labelW + plotW}
            y1={pad.t + rowH * i + rowH / 2}
            y2={pad.t + rowH * i + rowH / 2}
          />
        ))}
        {props.cutoff != null ? (
          <line
            className="viz-cutoff"
            x1={x(props.cutoff)}
            x2={x(props.cutoff)}
            y1={pad.t - 4}
            y2={height - pad.b}
          />
        ) : null}
        {(props.marks || []).map((mark, i) => (
          <line
            key={i}
            className="viz-mark"
            x1={x(mark.value)}
            x2={x(mark.value)}
            y1={pad.t - 4}
            y2={height - pad.b}
          />
        ))}
        <g className="viz-axis">
          {ticks.map((t, i) =>
            !narrow || i % 2 === 0 || i === ticks.length - 1 ? (
              <text
                key={t}
                x={x(t)}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : 'middle'}
              >
                {props.xFormat(t)}
              </text>
            ) : null,
          )}
          {props.rows.map((row, i) => (
            <g key={i}>
              <text
                x={0}
                y={pad.t + rowH * i + rowH / 2 - 1}
                className="viz-row-label"
              >
                {row.label}
              </text>
              <text
                x={0}
                y={pad.t + rowH * i + rowH / 2 + 11}
                className="viz-row-sub"
              >
                {row.sub || ''}
              </text>
            </g>
          ))}
          {props.cutoff != null ? (
            <text
              x={x(props.cutoff)}
              y={pad.t - 8}
              textAnchor={props.cutoffAnchor || 'middle'}
              className="viz-cutoff-label"
            >
              {props.cutoffLabel || ''}
            </text>
          ) : null}
          {(props.marks || []).map((mark, i) => {
            // A label that would run off the right edge takes its short form, then flips to end at its line.
            const label =
              mark.anchor !== 'start' || fits(mark.label, mark.value)
                ? mark.label
                : mark.short && fits(mark.short, mark.value)
                  ? mark.short
                  : mark.short || mark.label
            const anchor =
              mark.anchor === 'start' && !fits(label, mark.value)
                ? 'end'
                : mark.anchor || 'middle'
            return (
              <text
                key={i}
                x={
                  x(mark.value) +
                  (anchor === 'start' ? 3 : anchor === 'end' ? -3 : 0)
                }
                y={pad.t - 8}
                textAnchor={anchor}
                className="viz-mark-label"
              >
                {label}
              </text>
            )
          })}
        </g>
        {props.rows.map((row, i) => {
          const cy = pad.t + rowH * i + rowH / 2
          // Out dots first, so a dot that is in draws on top; a ringed dot last.
          const dots = row.dots
            .slice()
            .sort(
              (a, b) =>
                Number(a.in) - Number(b.in) ||
                Number(!!a.ring) - Number(!!b.ring),
            )
          return dots.map((d, j) => {
            const color = d.color || row.color
            return (
              <g
                key={j}
                className="viz-strip-dot"
                tabIndex={0}
                {...tipHandlersFor(tip, d.describe)}
              >
                <circle cx={x(d.value)} cy={cy} r={10} className="viz-hitdot" />
                <circle
                  cx={x(d.value)}
                  cy={cy}
                  r={5}
                  className={d.in ? 'viz-dot' : 'viz-dot viz-hollow'}
                  style={d.in ? { fill: color } : { stroke: color }}
                />
                {d.ring ? (
                  <circle
                    cx={x(d.value)}
                    cy={cy}
                    r={9}
                    className="viz-you-ring"
                  />
                ) : null}
              </g>
            )
          })
        })}
      </svg>
    </div>
  )
}
