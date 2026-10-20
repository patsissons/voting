// Lines over a shared numeric x (one point per snapshot). The crosshair
// snaps to the nearest snapshot, so the pointer never has to land on a line;
// arrow keys walk the snapshots when the chart has focus. A null value is a
// gap: a series that starts late begins there.
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTip } from './tooltip'
import { niceTicks, useMeasure } from './use-measure'

export type LineSeries = {
  label: string
  short?: string
  color: string
  values: (number | null)[]
}

export type LinesProps = {
  points: number[]
  lines: LineSeries[]
  xFormat: (v: number) => string
  yFormat: (v: number) => string
  valueFormat?: (v: number) => string
  title: (i: number) => string
  ariaLabel: string
  height?: number
  padRight?: number
  xMin?: number
  xMax?: number
  xTicks?: number[]
  yTicks?: number[]
  rules?: { y: number; label?: string }[]
}

export function Lines(props: LinesProps) {
  const { ref, width } = useMeasure()
  const tip = useTip()
  const height = props.height || 220
  const pad = {
    l: 40,
    r: props.padRight != null ? props.padRight : 92,
    t: 10,
    b: 24,
  }
  const xs = props.points
  const n = xs.length
  const [at, setAt] = useState(n - 1)
  const [hover, setHover] = useState(false)

  const geometry = useMemo(() => {
    const plotW = Math.max(10, width - pad.l - pad.r)
    const plotH = height - pad.t - pad.b
    const ticks =
      props.yTicks ||
      niceTicks(
        Math.max(
          1,
          ...props.lines
            .flatMap((l) => l.values)
            .filter((v): v is number => v != null),
        ),
      )
    const yMax = ticks[ticks.length - 1]
    const xMin = props.xMin != null ? props.xMin : Math.min(...xs)
    const xMax = props.xMax != null ? props.xMax : Math.max(...xs)
    const x = (v: number) =>
      pad.l + (xMax > xMin ? ((v - xMin) / (xMax - xMin)) * plotW : plotW / 2)
    const y = (v: number) => pad.t + plotH - (Math.max(0, v) / yMax) * plotH
    return { plotW, plotH, ticks, xMin, xMax, x, y }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, props.lines, props.yTicks, props.xMin, props.xMax, xs])

  if (!width)
    return (
      <div ref={ref} className="viz viz-lines" style={{ minHeight: height }} />
    )
  const { plotW, plotH, ticks, xMin, xMax, x, y } = geometry

  const read = (i: number, px: number, py: number) => {
    const idx = Math.max(0, Math.min(n - 1, i))
    setAt(idx)
    const rows = props.lines
      .filter((l) => l.values[idx] != null)
      .map((l) => ({
        label: l.label,
        color: l.color,
        value: (props.valueFormat || props.yFormat)(l.values[idx] as number),
        v: l.values[idx] as number,
      }))
      .sort((a, b) => b.v - a.v)
    tip.show({ title: props.title(idx), lines: rows }, px, py)
  }
  const nearest = (px: number) => {
    let best = 0
    for (let i = 1; i < n; i++)
      if (Math.abs(x(xs[i]) - px) < Math.abs(x(xs[best]) - px)) best = i
    return best
  }
  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    read(nearest(e.clientX - box.left), e.clientX, e.clientY)
  }
  const focusRead = (e: { currentTarget: SVGRectElement }, i = at) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    setHover(true)
    read(i, box.left + x(xs[Math.max(0, Math.min(n - 1, i))]), box.top + pad.t)
  }
  const leave = () => {
    setHover(false)
    tip.hide()
  }
  const onKeyDown = (e: KeyboardEvent<SVGRectElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    focusRead(e, at + (e.key === 'ArrowLeft' ? -1 : 1))
  }

  // Direct labels at the line ends (at most four), nudged apart so they never
  // overlap; the legend above carries identity for the rest.
  const ends: { y: number; label: string }[] = []
  const paths = props.lines.map((line) => {
    let d = ''
    let pen = false
    line.values.forEach((v, i) => {
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    let last = line.values.length - 1
    while (last >= 0 && line.values[last] == null) last--
    if (last >= 0)
      ends.push({
        y: y(line.values[last] as number),
        label: line.short || line.label,
      })
    return { d, last, line }
  })
  if (ends.length <= 4) {
    ends.sort((a, b) => a.y - b.y)
    for (let i = 1; i < ends.length; i++)
      ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13)
  }

  return (
    <div ref={ref} className="viz viz-lines" style={{ minHeight: height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={props.ariaLabel}
      >
        <g className="viz-grid">
          {ticks.map((t) => (
            <line key={t} x1={pad.l} x2={pad.l + plotW} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        {(props.rules || []).map((rule, i) => (
          <line
            key={i}
            className="viz-cutoff"
            x1={pad.l}
            x2={pad.l + plotW}
            y1={y(rule.y)}
            y2={y(rule.y)}
          />
        ))}
        {paths.map(({ d, last, line }, i) =>
          last < 0 ? null : (
            <g key={i}>
              <path d={d} className="viz-line" style={{ stroke: line.color }} />
              <circle
                cx={x(xs[last])}
                cy={y(line.values[last] as number)}
                r={4}
                className="viz-dot"
                style={{ fill: line.color }}
              />
            </g>
          ),
        )}
        <line
          className="viz-base"
          x1={pad.l}
          x2={pad.l + plotW}
          y1={y(0)}
          y2={y(0)}
        />
        <g className="viz-axis">
          {ticks.map((t) => (
            <text key={t} x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {props.yFormat(t)}
            </text>
          ))}
          {(props.xTicks || [xMin, xMax]).map((v) => (
            <text
              key={v}
              x={x(v)}
              y={height - 6}
              textAnchor={v === xMin ? 'start' : v === xMax ? 'end' : 'middle'}
            >
              {props.xFormat(v)}
            </text>
          ))}
          {(props.rules || []).map((rule, i) => (
            <text
              key={i}
              x={pad.l + 4}
              y={y(rule.y) - 4}
              className="viz-cutoff-label"
            >
              {rule.label || ''}
            </text>
          ))}
          {ends.length <= 4
            ? ends.map((end, i) => (
                <text
                  key={i}
                  x={pad.l + plotW + 8}
                  y={end.y + 4}
                  className="viz-end"
                >
                  {end.label}
                </text>
              ))
            : null}
        </g>
        <line
          className="viz-cross"
          x1={x(xs[at] ?? xMin)}
          x2={x(xs[at] ?? xMin)}
          y1={pad.t}
          y2={pad.t + plotH}
          visibility={hover ? 'visible' : 'hidden'}
        />
        <rect
          x={pad.l}
          y={pad.t}
          width={plotW}
          height={plotH + pad.b}
          className="viz-hit"
          tabIndex={0}
          aria-label={props.ariaLabel}
          onPointerEnter={() => setHover(true)}
          onPointerMove={onPointerMove}
          onPointerLeave={leave}
          onFocus={(e) => focusRead(e)}
          onBlur={leave}
          onKeyDown={onKeyDown}
        />
      </svg>
    </div>
  )
}
