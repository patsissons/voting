// Sections shared by the at-large and riding results pages: momentum
// (dumbbell), vote shares by group (segmented bars), seats on the compass
// plane, and the election-night timeline (lines with a table).
import { DataTable, Note, Section } from '@/components/bits'
import { Dumbbell } from '@/components/charts/dumbbell'
import { Legend } from '@/components/charts/legend'
import { Lines } from '@/components/charts/lines'
import { Plane } from '@/components/charts/plane'
import {
  useTip,
  tipHandlersFor,
  type TipLine,
} from '@/components/charts/tooltip'
import {
  partyColor,
  partyName,
  partyShort,
  type PartyLookup,
} from '@/lib/party'
import {
  clockOf,
  fmt,
  pct1,
  signed,
  wallClock,
} from '../../../shared/format.ts'
import type { CompassElection } from '../../../shared/schema/election.ts'
import type {
  Momentum,
  SeatCentre,
  Timeline,
} from '../../../shared/stats/results.ts'
import { partyOrder } from '../../../shared/stats/results.ts'

export function MomentumSection({
  id,
  m,
  title,
  noun,
  head = 'Candidate',
  label,
  P,
}: {
  id: string
  m: Momentum | null
  title: string
  noun: string
  head?: string
  label: (r: Momentum['rows'][number]) => string
  P: PartyLookup
}) {
  if (!m || !m.rows.length) return null
  const lead = m.rows[0]
  const since = clockOf(m.since)
  const who = (r: Momentum['rows'][number]) =>
    `${r.name}${r.party && P[r.party] && P[r.party].name !== r.name ? ` (${P[r.party].short})` : ''}`
  return (
    <Section id={id} title={title} sub={`votes counted since ${since}`}>
      <p className="font-medium">
        Of the {fmt(m.votes)} {noun} counted since {since}, {lead.name} took{' '}
        {pct1(lead.recent)} ({pct1(lead.overall)} overall).
      </p>
      <Dumbbell
        rows={m.rows.map((r) => ({
          label: label(r),
          color: partyColor(r.party),
          a: r.overall,
          b: r.recent,
          describe: () => ({
            title: who(r),
            lines: [
              { label: 'Overall', value: pct1(r.overall) },
              { label: `Since ${since}`, value: pct1(r.recent) },
              { label: 'Change', value: `${signed(r.change)} pts` },
            ],
          }),
        }))}
        aLabel="Overall share"
        bLabel={`Share since ${since}`}
        xFormat={(v) => `${Math.round(v)}%`}
        ariaLabel={`${title}: share overall and of the votes counted since ${since}`}
      />
      <Note>
        Batches can lean one way by where and when they were cast (advance,
        mail, election day), so this reads the votes counted, not a forecast.
      </Note>
      <DataTable
        heads={[head, 'Overall', `Since ${since}`, 'Change']}
        rows={m.rows.map((r) => [
          r.name,
          pct1(r.overall),
          pct1(r.recent),
          signed(r.change),
        ])}
      />
    </Section>
  )
}

export type ShareGroup = {
  key?: string
  label: string
  total: number
  parts: {
    key: string
    votes: number
    share: number
    candidates?: number
    led?: number
  }[]
}

export function SharesSection({
  id,
  groups,
  title,
  sub,
  note,
  lines,
  cell,
  election,
  P,
}: {
  id: string
  groups: ShareGroup[]
  title: string
  sub: string
  note: string
  lines: (part: ShareGroup['parts'][number]) => TipLine[]
  cell: (part: ShareGroup['parts'][number]) => string
  election: CompassElection
  P: PartyLookup
}) {
  const tip = useTip()
  if (!groups.length) return null
  const keys = partyOrder(election).filter((k) =>
    groups.some((o) => o.parts.some((x) => x.key === k && x.votes)),
  )
  return (
    <Section id={id} title={title} sub={sub}>
      <Legend
        items={keys.map((k) => ({
          label: partyShort(P, k),
          color: partyColor(k),
        }))}
      />
      <div className="space-y-2">
        {groups.map((group) => (
          <div
            key={group.key || group.label}
            className="grid grid-cols-1 gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:gap-3"
          >
            <span className="truncate text-sm">{group.label}</span>
            <div
              className="bg-muted flex h-6 overflow-hidden rounded-md"
              role="img"
              aria-label={`${group.label}: ${group.parts.map((x) => `${partyShort(P, x.key)} ${pct1(x.share)}`).join(', ')}`}
            >
              {group.parts.map((part) =>
                part.votes ? (
                  <span
                    key={part.key}
                    tabIndex={0}
                    className="nums flex items-center justify-center text-[11px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    style={{
                      flex: part.votes,
                      background: partyColor(part.key),
                      minWidth: 1,
                    }}
                    {...tipHandlersFor(tip, () => ({
                      title: `${group.label}: ${partyName(P, part.key)}`,
                      lines: [
                        { label: 'Votes', value: fmt(part.votes) },
                        { label: 'Share', value: pct1(part.share) },
                        ...lines(part),
                      ],
                    }))}
                  >
                    {part.share >= 8 ? `${Math.round(part.share)}%` : ''}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      <Note>{note}</Note>
      <DataTable
        heads={['Party', ...groups.map((o) => o.label)]}
        rows={keys.map((k) => [
          partyName(P, k),
          ...groups.map((o) => {
            const x = o.parts.find((y) => y.key === k)
            return x ? cell(x) : ''
          }),
        ])}
      />
    </Section>
  )
}

export function CompassSection({
  id,
  centre,
  title,
  seatsLabel,
  sized,
  you,
  aria,
  radius,
  P,
}: {
  id: string
  centre: SeatCentre | null
  title: string
  seatsLabel: string
  sized: string
  you: string
  aria: string
  radius?: (n: number) => number
  P: PartyLookup
}) {
  if (!centre || !centre.centre) return null
  const r = radius || ((n: number) => Math.min(22, 6 + n * 2))
  const points = centre.parties
    .filter((x) => P[x.key] && P[x.key].axis)
    .map((x) => ({
      key: x.key,
      label: `${P[x.key].short} ${x.seats}`,
      name: P[x.key].name,
      seats: x.seats,
      color: partyColor(x.key),
      x: P[x.key].axis.e,
      y: P[x.key].axis.s,
      r: r(x.seats),
    }))
  return (
    <Section
      id={id}
      title={title}
      sub="party positions from the ballot compass"
    >
      <Plane
        points={points}
        you={{ ...centre.centre, label: you }}
        xLabels={['Economic left', 'Economic right']}
        yLabels={['Progressive', 'Conservative']}
        describe={(pt) =>
          'seats' in pt && pt.seats
            ? {
                title: pt.name || pt.label,
                lines: [{ label: seatsLabel, value: String(pt.seats) }],
              }
            : {
                title: you,
                lines: [
                  { label: 'Seat-weighted average of the parties', value: '' },
                ],
              }
        }
        ariaLabel={`${aria}: ${points.map((x) => x.label).join(', ')}`}
      />
      <Note>
        Dots are sized by {sized}; the ring is their seat-weighted centre.
        {centre.unplaced
          ? ` ${centre.unplaced} ${centre.unplaced === 1 ? 'seat goes' : 'seats go'} to candidates outside the compass parties and ${centre.unplaced === 1 ? 'is' : 'are'} not placed.`
          : ''}
      </Note>
    </Section>
  )
}

export function TimelineSection({
  id,
  t,
  title,
  sub,
  yFormat,
  ariaLabel,
  valueFormat,
}: {
  id: string
  t: Timeline | null
  title: string
  sub: string
  yFormat: (v: number) => string
  ariaLabel: string
  valueFormat?: (v: number) => string
}) {
  if (!t) return null
  const series = t.series.map((s) => ({
    label: s.label,
    short: s.short,
    color: partyColor(s.party),
    values: s.values,
  }))
  return (
    <Section id={id} title={title} sub={sub}>
      <Legend
        items={series.map((s) => ({
          label: s.label,
          color: s.color,
          line: true,
        }))}
      />
      <Lines
        points={t.xs}
        xMin={0}
        xMax={100}
        xTicks={[0, 25, 50, 75, 100]}
        xFormat={(v) => `${Math.round(v)}%`}
        yFormat={yFormat}
        valueFormat={valueFormat}
        lines={series}
        title={(i) =>
          `${fmt(t.rows[i].payload.polls.closed)} of ${fmt(t.rows[i].payload.polls.total)} reported · ${wallClock(t.rows[i].payload.asOf)}`
        }
        ariaLabel={ariaLabel}
      />
      <DataTable
        heads={['As of', 'Reported', ...series.map((s) => s.short)]}
        rows={t.rows.map((r, i) => [
          wallClock(r.payload.asOf),
          `${r.payload.polls.closed}/${r.payload.polls.total}`,
          ...series.map((s) => (valueFormat || yFormat)(s.values[i] as number)),
        ])}
      />
    </Section>
  )
}
