// Small HTML bars: a labelled meter, and a segmented bar split by party with
// an optional majority line (seats) and legend.
import type { CSSProperties, ReactNode } from 'react'
import { Legend } from './legend'
import { useTip, tipHandlersFor, type TipContent } from './tooltip'

export function Meter({
  label,
  closed,
  total,
  value,
  style,
}: {
  label: ReactNode
  closed: number
  total: number
  value: string
  style?: CSSProperties
}) {
  const share = total ? Math.min(1, closed / total) : 0
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
      style={style}
    >
      <span className="truncate">{label}</span>
      <span className="bg-muted col-span-2 h-2 overflow-hidden rounded-full sm:col-span-1">
        <i
          className="block h-full rounded-full bg-[var(--party,var(--brand))]"
          style={{ width: `${(share * 100).toFixed(1)}%` }}
        />
      </span>
      <span className="nums text-muted-foreground col-start-2 row-start-1 text-xs sm:col-start-3">
        {value}
      </span>
    </div>
  )
}

export type Segment = {
  key: string
  label: string
  color: string
  n: number
  describe: () => TipContent
}

/**
 * One bar split by segments, proportional to n, with the counts in the
 * segments and a legend beneath; `total` leaves the unfilled remainder grey
 * and `majority` marks a line at that count.
 */
export function SegmentBar({
  segments,
  total,
  majority,
  ariaLabel,
  legend = true,
  caption,
}: {
  segments: Segment[]
  total?: number
  majority?: number
  ariaLabel: string
  legend?: boolean
  caption?: ReactNode
}) {
  const tip = useTip()
  const filled = segments.reduce((n, s) => n + s.n, 0)
  const span = total && total > filled ? total : filled
  return (
    <div className="space-y-2">
      {caption ? (
        <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {caption}
        </div>
      ) : null}
      <div className="relative">
        <div
          className="bg-muted flex h-7 w-full overflow-hidden rounded-md"
          role="img"
          aria-label={ariaLabel}
        >
          {segments.map((s) =>
            s.n > 0 ? (
              <span
                key={s.key}
                tabIndex={0}
                className="nums flex items-center justify-center overflow-hidden text-xs font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                style={{ flex: s.n, background: s.color, minWidth: 2 }}
                {...tipHandlersFor(tip, s.describe)}
              >
                {s.n / span > 0.06 ? s.n : ''}
              </span>
            ) : null,
          )}
          {span > filled ? (
            <span
              className="text-muted-foreground nums flex items-center justify-center text-xs"
              style={{ flex: span - filled }}
              title={`${span - filled} without a leader yet`}
            >
              {(span - filled) / span > 0.08 ? span - filled : ''}
            </span>
          ) : null}
        </div>
        {majority && span ? (
          <i
            className="bg-foreground absolute -top-1 -bottom-1 w-0.5 rounded"
            style={{ left: `${(majority / span) * 100}%` }}
            title={`${majority} for a majority`}
            aria-hidden="true"
          />
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

/** A two-option bar: option 1 from the left, option 2 from the right, with a half line. */
export function TwoOptionBar({
  a,
  b,
  shares,
  votes,
  lead,
  started,
  emptyText = 'Count not started',
  labelA,
  labelB,
}: {
  a: string
  b: string
  shares: [number, number]
  votes: [number, number]
  lead: -1 | 0 | 1
  started: boolean
  emptyText?: string
  labelA?: string
  labelB?: string
}) {
  if (!started) {
    return (
      <div
        className="bg-muted text-muted-foreground flex h-8 items-center justify-center rounded-md text-xs"
        role="img"
        aria-label={emptyText}
      >
        {emptyText}
      </div>
    )
  }
  const pct = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)}%`
  const text = (name: string, share: number) =>
    share >= (name.length + 6) * 2.2 ? `${name} ${pct(share)}` : pct(share)
  return (
    <div
      className="relative flex h-8 w-full overflow-hidden rounded-md text-xs font-medium"
      role="img"
      aria-label={`${a} ${pct(shares[0])}, ${b} ${pct(shares[1])}`}
    >
      <span
        className={`nums flex items-center overflow-hidden px-2 text-[var(--ref-a-foreground)] ${lead === 0 ? '' : 'opacity-80'}`}
        style={{ flex: votes[0] || 0.0001, background: 'var(--ref-a)' }}
      >
        {labelA ?? text(a, shares[0])}
      </span>
      <span
        className={`nums flex items-center justify-end overflow-hidden px-2 text-[var(--ref-b-foreground)] ${lead === 1 ? '' : 'opacity-80'}`}
        style={{ flex: votes[1] || 0.0001, background: 'var(--ref-b)' }}
      >
        {labelB ?? text(b, shares[1])}
      </span>
      <i
        className="bg-background/70 absolute top-0 bottom-0 left-1/2 w-px"
        aria-hidden="true"
      />
    </div>
  )
}
