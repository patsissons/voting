// The top of the results page: official/unofficial, live, how old the newest
// count is (a split-flap clock while counting), and the headline tiles.
import type { ReactNode } from 'react'
import { useCallback } from 'react'
import { Note } from '@/components/bits'
import { FlipClock } from '@/components/charts/flip-clock'
import { Badge } from '@/components/ui/badge'
import { spanText, stampToEpoch } from '@/lib/time'
import {
  clockOf,
  clockText,
  fmt,
  pct1,
  wallClock,
} from '../../../shared/format.ts'
import type { Payload } from '../../../shared/payload.ts'

export function StatusLine({
  latest,
  live,
  done,
  doneText,
  owner,
  timeZone,
  stage,
}: {
  latest: Payload
  live: boolean
  done: boolean
  doneText: string
  owner: string
  timeZone?: string
  stage?: string
}) {
  const when = wallClock(latest.asOf)
  const at = stampToEpoch(latest.asOf, timeZone)
  const seconds = useCallback(() => (Date.now() - at) / 1000, [at])
  const spoken = useCallback(
    (s: number) => `Last count update ${spanText(s)} ago`,
    [],
  )
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <Badge variant={latest.official ? 'default' : 'outline'}>
        {latest.official ? 'Official' : 'Unofficial'}
      </Badge>
      {live ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <i
            className="bg-brand inline-block size-1.5 animate-pulse rounded-full"
            aria-hidden="true"
          />
          Live
        </span>
      ) : null}
      <span className="text-muted-foreground nums">
        {done ? (
          `${doneText} · last update ${when}`
        ) : !Number.isFinite(at) ? (
          `as of ${when}`
        ) : (
          <>
            <FlipClock seconds={seconds} format={clockText} spoken={spoken} />{' '}
            since {owner} last count ({clockOf(latest.asOf)})
          </>
        )}
      </span>
      {stage ? <span className="text-muted-foreground">{stage}</span> : null}
    </div>
  )
}

export function Tile({
  label,
  value,
  sub,
  share,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  share?: number | null
}) {
  return (
    <div className="bg-card space-y-1 rounded-xl border p-4">
      <span className="text-muted-foreground block text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      <b className="nums block text-2xl font-bold tracking-tight">
        {value}
        {sub ? (
          <small className="text-muted-foreground ml-1.5 text-sm font-normal">
            {sub}
          </small>
        ) : null}
      </b>
      {share != null ? (
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <i
            className="bg-brand block h-full rounded-full"
            style={{ width: `${(Math.min(1, share) * 100).toFixed(1)}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

/** The standard three tiles: units reported, ballots counted, turnout. */
export function CountTiles({
  latest,
  unitLabel,
}: {
  latest: Payload
  unitLabel: string
}) {
  const p = latest.polls
  const share = p.total ? p.closed / p.total : 0
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile
        label={`${unitLabel} reported`}
        value={fmt(p.closed)}
        sub={`of ${fmt(p.total)} · ${pct1(share * 100)}`}
        share={share}
      />
      <Tile label="Ballots counted" value={fmt(latest.ballots)} />
      {latest.turnout != null ? (
        <Tile
          label="Turnout"
          value={pct1(latest.turnout * 100)}
          sub={`of ${fmt(latest.eligible)} eligible`}
        />
      ) : null}
    </div>
  )
}

export function SourceNote({ children }: { children: ReactNode }) {
  return <Note className="border-t pt-4">{children}</Note>
}
