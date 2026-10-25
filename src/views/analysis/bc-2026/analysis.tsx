// The BC 2026 analysis: every riding against its 2024 result. Bespoke to this
// election (the Conservative-NDP swing, the new Centre BC and OneBC vote, the
// advance vote, the late ballots of the final count); the 2024 table is
// ./prior.
import { useMemo, useState } from 'react'
import { DataTable, Note, PartyChip, Section } from '@/components/bits'
import { ChangeBars } from '@/components/charts/change-bars'
import { Choropleth } from '@/components/charts/choropleth'
import { Dumbbell } from '@/components/charts/dumbbell'
import { Legend } from '@/components/charts/legend'
import { Scatter } from '@/components/charts/scatter'
import { Input } from '@/components/ui/input'
import { partyColor, partyLookup, partyShort } from '@/lib/party'
import { fmt, pct1, signed, wallClock } from '../../../../shared/format.ts'
import type { DistrictElection } from '../../../../shared/schema/election.ts'
import { Tile } from '../../results/results-header'
import { SectionNav } from '../../results/results-view'
import type { AnalysisProps } from '..'
import { listOf } from '../alberta-2026/findings'
import { findings, leadText, swingText, toward } from './findings'
import {
  finalWatch,
  greenChanges,
  incumbentsLost,
  lateTotal,
  leaders,
  minorMargins,
  provinceOf,
  regionSwings,
  ridingViews,
  seatsVsVotes,
  STEADY,
  turnoutPatterns,
  WATCH,
  type RidingView,
} from './stats'

const SECTIONS = [
  { id: 'findings', label: 'Findings' },
  { id: 'swing', label: 'Swing' },
  { id: 'seats', label: 'Seats and votes' },
  { id: 'minor', label: 'Minor parties' },
  { id: 'turnout', label: 'Turnout' },
  { id: 'final', label: 'Final count' },
  { id: 'ridings', label: 'Ridings' },
  { id: 'notes', label: 'Notes' },
]

/** The swing map's bands: the upper edge of each, toward the NDP first. */
const BANDS = [
  { lo: -Infinity, hi: -10, label: 'toward NDP 10+' },
  { lo: -10, hi: -STEADY, label: `toward NDP ${STEADY}–10` },
  { lo: -STEADY, hi: STEADY, label: `within ${STEADY} either way` },
  { lo: STEADY, hi: 10, label: `toward Conservative ${STEADY}–10` },
  { lo: 10, hi: 20, label: 'toward Conservative 10–20' },
  { lo: 20, hi: Infinity, label: 'toward Conservative 20+' },
]
const DEPTH = [70, 35, 0, 30, 55, 80]
const bandColor = (i: number) =>
  i === 2
    ? 'var(--muted)'
    : `color-mix(in oklab, ${partyColor(i < 2 ? 'ndp' : 'cp')} ${DEPTH[i]}%, var(--muted))`
const bandOf = (swing: number) =>
  BANDS.findIndex((b) => swing >= b.lo && swing < b.hi)

/** A domain on whole steps covering every value (and zero). */
function domainOf(values: number[], step: number): [number, number] {
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step]
}
const ticksOf = ([lo, hi]: [number, number], step: number) => {
  const out: number[] = []
  for (let v = lo; v <= hi; v += step) out.push(v)
  return out
}

/** A party's short name; the unaffiliated read as independents. */
function shortOf(election: DistrictElection): (key: string) => string {
  const P = partyLookup(election)
  return (key) => (key === 'other' ? 'Independent' : partyShort(P, key))
}

/** An axis tick in points: "+20", "0", "-20". */
const leadTick = (v: number) => (v > 0 ? `+${v}` : String(v))
const arrow = (a: number | undefined, b: number | undefined) =>
  `${pct1(a || 0)} → ${pct1(b || 0)}`

/** A riding's swing tooltip: the result, both big parties' shares, the leads and the swing. */
function swingLines(v: RidingView, short: (key: string) => string) {
  return [
    {
      label: 'Result',
      value:
        v.winner === v.was
          ? `${short(v.winner)} hold`
          : `${short(v.winner)} gain from ${short(v.was)}`,
      color: partyColor(v.winner),
    },
    {
      label: short('cp'),
      value: arrow(v.prior.cp, v.shares.cp),
      color: partyColor('cp'),
    },
    {
      label: short('ndp'),
      value: arrow(v.prior.ndp, v.shares.ndp),
      color: partyColor('ndp'),
    },
    { label: '2024 lead', value: leadText(v.lead24) },
    { label: '2026 lead', value: leadText(v.lead26) },
    { label: 'Swing', value: swingText(v.swing) },
  ]
}

const pts = (v: number) => `${signed(v)} pts`
const signedInt = (n: number) => (n > 0 ? `+${n}` : String(n))
const cell = (v: number | null | undefined, text = signed) =>
  v == null ? '-' : text(v)

export default function BcAnalysis({
  election,
  snapshots,
  earlyVote,
}: AnalysisProps) {
  if (election.ballot !== 'district') return null
  return (
    <Analysis
      election={election}
      snapshots={snapshots}
      earlyVote={earlyVote ?? null}
    />
  )
}

function Analysis({
  election,
  snapshots,
  earlyVote,
}: {
  election: DistrictElection
  snapshots: AnalysisProps['snapshots']
  earlyVote: NonNullable<AnalysisProps['earlyVote']> | null
}) {
  const latest = snapshots.length
    ? snapshots[snapshots.length - 1].payload
    : null
  const short = useMemo(() => shortOf(election), [election])
  const data = useMemo(() => {
    const views = ridingViews(latest, election, earlyVote)
    const province = provinceOf(views)
    const regions = regionSwings(views, election)
    const parties = seatsVsVotes(views, province)
    const minors = minorMargins(views)
    const patterns = turnoutPatterns(views)
    const watch = finalWatch(views)
    const leaderList = leaders(views, election)
    const lost = incumbentsLost(views)
    return {
      views,
      province,
      regions,
      parties,
      minors,
      patterns,
      watch,
      lost,
      findings: findings({
        election,
        views,
        province,
        regions,
        parties,
        minors,
        patterns,
        watch,
        leaders: leaderList,
        lost,
        short,
      }),
    }
  }, [latest, election, earlyVote, short])

  if (!latest || !data.views.length)
    return (
      <Note>
        The analysis needs the count by riding, which arrives with the first
        results.
      </Note>
    )
  const { views, province } = data
  const flips = views.filter((v) => v.winner !== v.was).length
  const byseats = data.parties
    .filter((p) => p.seats || p.seats24)
    .sort((a, b) => b.seats - a.seats)
    .slice(0, 2)
  const reporting = views.filter((v) => v.complete).length

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Every riding against its 2024 result, from the{' '}
        {latest.official ? 'official' : 'unofficial initial'} count as of{' '}
        {wallClock(latest.asOf)}, with {fmt(reporting)} of {fmt(views.length)}{' '}
        ridings fully reported. Swing is the change in the Conservative lead
        over the NDP. Hover or focus any mark for its numbers.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {byseats.map((p) => (
          <Tile
            key={p.key}
            label={`${short(p.key)} seats`}
            value={fmt(p.seats)}
            sub={`${signedInt(p.seats - p.seats24)} on 2024`}
          />
        ))}
        <Tile
          label="Swing from 2024"
          value={`${Math.abs(province.swing).toFixed(1)} pts`}
          sub={toward(province.swing)}
        />
        <Tile
          label="Seats changed hands"
          value={fmt(flips)}
          sub={`of ${fmt(views.length)}`}
        />
      </div>
      <SectionNav sections={SECTIONS} label="Analysis sections" />

      <Section id="findings" title="Key findings">
        {data.findings.length ? (
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            {data.findings.map((f, i) => (
              <li key={i}>
                <b className="font-semibold">{f.lead}</b> {f.text}
              </li>
            ))}
          </ul>
        ) : (
          <Note>Findings appear once enough of the count is in.</Note>
        )}
      </Section>

      <SwingSection
        election={election}
        views={views}
        province={province}
        regions={data.regions}
        short={short}
      />
      <SeatsSection parties={data.parties} short={short} />
      <MinorSection
        election={election}
        views={views}
        minors={data.minors}
        short={short}
      />
      <TurnoutSection
        views={views}
        patterns={data.patterns}
        short={short}
        hasAdvance={!!earlyVote}
      />
      <FinalSection views={views} watch={data.watch} short={short} />
      <RidingsSection election={election} views={views} short={short} />
      <NotesSection lost={data.lost} short={short} />
    </div>
  )
}

type Short = (key: string) => string

function SwingSection({
  election,
  views,
  province,
  regions,
  short,
}: {
  election: DistrictElection
  views: RidingView[]
  province: ReturnType<typeof provinceOf>
  regions: ReturnType<typeof regionSwings>
  short: Short
}) {
  const domain = domainOf(
    views.flatMap((v) => [v.lead24, v.lead26]),
    20,
  )
  const ticks = ticksOf(domain, 20)
  const winners = [...new Set(views.map((v) => v.winner))]
  const bySwing = [...views].sort((a, b) => b.swing - a.swing)
  const named = [...bySwing.slice(0, 3), ...bySwing.slice(-2)]
  const byCode = new Map(views.map((v) => [v.code, v]))
  const fills: Record<string, string> = {}
  for (const v of views) fills[v.code] = bandColor(bandOf(v.swing))
  const lines = (v: RidingView) => swingLines(v, short)
  const top = Object.keys(province.seats).sort(
    (a, b) => province.seats[b] - province.seats[a],
  )[0]
  return (
    <Section
      id="swing"
      title="The swing from 2024"
      sub="Conservative lead over the NDP, in points"
    >
      <Note>
        Each dot is a riding: its Conservative lead over the NDP in 2024 across,
        in 2026 up. Dots above the diagonal moved toward the Conservatives;
        above the zero line the Conservatives lead.
      </Note>
      <Legend
        items={[
          ...winners.map((k) => ({
            label: `${short(k)} won`,
            color: partyColor(k),
          })),
          {
            label: 'No change',
            color: 'var(--muted-foreground)',
            line: true,
          },
        ]}
      />
      <Scatter
        points={views.map((v) => ({
          key: v.code,
          x: v.lead24,
          y: v.lead26,
          color: partyColor(v.winner),
          describe: () => ({ title: v.name, lines: lines(v) }),
        }))}
        fit={{ a: 0, b: 1 }}
        rule={{ y: 0 }}
        xDomain={domain}
        yDomain={domain}
        xTicks={ticks}
        yTicks={ticks}
        xFormat={leadTick}
        yFormat={leadTick}
        xLabel="2024 Conservative lead"
        yLabel="2026 Conservative lead"
        labels={named.map((v) => ({ key: v.code, text: v.name }))}
        ariaLabel="Each riding's Conservative lead over the NDP, 2024 against 2026"
      />
      <h3 className="text-sm font-semibold">
        By riding{' '}
        <span className="text-muted-foreground font-normal">
          swing in points
        </span>
      </h3>
      <Legend
        items={BANDS.map((b, i) => ({ label: b.label, color: bandColor(i) }))}
      />
      {election.boundaries ? (
        <Choropleth
          set={election.boundaries}
          fills={fills}
          ariaLabel={`Swing by riding: ${bySwing
            .map((v) => `${v.name} ${signed(v.swing)}`)
            .join(', ')}`}
          describe={(code) => {
            const v = byCode.get(code)
            return v
              ? { title: v.name, lines: lines(v) }
              : { title: code, lines: [{ label: 'No count', value: '' }] }
          }}
        />
      ) : null}
      <h3 className="text-sm font-semibold">By region</h3>
      <ChangeBars
        rows={regions.map((r) => ({
          label: r.label,
          color: partyColor(r.swing >= 0 ? 'cp' : 'ndp'),
          value: r.swing,
          describe: () => ({
            title: r.label,
            lines: [
              { label: 'Ridings', value: fmt(r.n) },
              { label: '2024 lead', value: leadText(r.lead24) },
              { label: '2026 lead', value: leadText(r.lead26) },
              { label: 'Swing', value: swingText(r.swing) },
              ...Object.keys(r.seats)
                .sort((a, b) => r.seats[b] - r.seats[a])
                .map((k) => ({
                  label: `${short(k)} seats`,
                  value: `${fmt(r.seats[k])} (${signedInt(r.seats[k] - (r.seats24[k] || 0))})`,
                  color: partyColor(k),
                })),
            ],
          }),
        }))}
        xFormat={leadTick}
        valueFormat={signed}
        ariaLabel="Vote-weighted swing by region, positive toward the Conservatives"
      />
      <Note>
        The province swung {Math.abs(province.swing).toFixed(1)} points{' '}
        {toward(province.swing)}, and riding swings spread{' '}
        {province.spread.toFixed(1)} points either side of that. Adding each
        party&apos;s province-wide change to every riding&apos;s 2024 share
        gives the {short(top)} {fmt(province.uniform[top] || 0)} seats; they won{' '}
        {fmt(province.seats[top] || 0)}.
      </Note>
    </Section>
  )
}

function SeatsSection({
  parties,
  short,
}: {
  parties: ReturnType<typeof seatsVsVotes>
  short: Short
}) {
  const shown = parties.filter((p) => p.share >= 1 || p.seats)
  return (
    <Section id="seats" title="Seats against votes" sub="share of each">
      <Dumbbell
        rows={shown.map((p) => ({
          label: short(p.key),
          color: partyColor(p.key),
          a: p.share,
          b: p.seatShare,
          describe: () => ({
            title: short(p.key),
            lines: [
              { label: 'Vote share', value: pct1(p.share) },
              {
                label: 'Seats',
                value: `${fmt(p.seats)} (${pct1(p.seatShare)})`,
              },
              {
                label: 'Votes per seat',
                value: p.perSeat ? fmt(Math.round(p.perSeat)) : 'no seat',
              },
            ],
          }),
        }))}
        aLabel="Vote share"
        bLabel="Seat share"
        xFormat={(v) => `${v}%`}
        ariaLabel="Each party's vote share against its share of the seats"
      />
      <DataTable
        summary="Table"
        heads={[
          'Party',
          'Votes',
          'Share',
          'Change',
          'Seats',
          'Change',
          'Votes per seat',
        ]}
        rows={shown.map((p) => [
          short(p.key),
          fmt(p.votes),
          pct1(p.share),
          p.share24 == null ? 'new' : signed(p.share - p.share24),
          fmt(p.seats),
          signedInt(p.seats - p.seats24),
          p.perSeat ? fmt(Math.round(p.perSeat)) : '-',
        ])}
      />
    </Section>
  )
}

function MinorSection({
  election,
  views,
  minors,
  short,
}: {
  election: DistrictElection
  views: RidingView[]
  minors: RidingView[]
  short: Short
}) {
  const greens = greenChanges(views)
  const regionIndex = new Map(election.regions.map((r, i) => [r.key, i]))
  const regionColor = (key: string) =>
    `var(--series-${((regionIndex.get(key) ?? 0) % 11) + 1})`
  const max =
    Math.ceil(
      Math.max(10, ...greens.flatMap((v) => [v.prior.green, v.shares.green])) /
        10,
    ) * 10
  const ticks = ticksOf([0, max], 10)
  const named = [...greens.slice(0, 3), ...greens.slice(-2)]
  return (
    <Section
      id="minor"
      title="Minor parties and margins"
      sub={`${short('centre')}, ${short('onebc')} and the Greens`}
    >
      {minors.length ? (
        <>
          <Note>
            {short('centre')} and {short('onebc')} ran in 2026 for the first
            time. In these {fmt(minors.length)} ridings their combined vote is
            larger than the winner&apos;s lead; where those votes would have
            gone is not in the count.
          </Note>
          <div className="overflow-x-auto">
            <table className="nums w-full text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th className="py-1 pr-2 text-left font-medium">Riding</th>
                  <th className="px-1.5 py-1 text-left font-medium">Won</th>
                  <th className="px-1.5 py-1 text-right font-medium">Margin</th>
                  <th className="px-1.5 py-1 text-right font-medium">
                    {short('centre')}
                  </th>
                  <th className="px-1.5 py-1 text-right font-medium">
                    {short('onebc')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {minors.map((v) => (
                  <tr key={v.code} className="border-t">
                    <td className="py-1 pr-2">{v.name}</td>
                    <td className="px-1.5 py-1">
                      <PartyChip party={v.winner} label={short(v.winner)} />
                      {v.second ? (
                        <span className="text-muted-foreground text-xs">
                          {' '}
                          over {short(v.second)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-1.5 py-1 text-right">
                      {v.margin.toFixed(1)}
                    </td>
                    <td className="px-1.5 py-1 text-right">
                      {cell(v.shares.centre, (x) => x.toFixed(1))}
                    </td>
                    <td className="px-1.5 py-1 text-right">
                      {cell(v.shares.onebc, (x) => x.toFixed(1))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Note>
          {short('centre')} and {short('onebc')} took less than the winning
          margin everywhere.
        </Note>
      )}
      {greens.length >= 3 ? (
        <>
          <h3 className="text-sm font-semibold">The Green vote</h3>
          <Legend
            items={[
              ...election.regions
                .filter((r) => greens.some((v) => v.region === r.key))
                .map((r) => ({ label: r.label, color: regionColor(r.key) })),
              {
                label: 'No change',
                color: 'var(--muted-foreground)',
                line: true,
              },
            ]}
          />
          <Scatter
            points={greens.map((v) => ({
              key: v.code,
              x: v.prior.green,
              y: v.shares.green,
              color: regionColor(v.region),
              describe: () => ({
                title: v.name,
                lines: [
                  { label: '2024 Green share', value: pct1(v.prior.green) },
                  { label: '2026 Green share', value: pct1(v.shares.green) },
                  { label: 'Change', value: pts(v.green as number) },
                ],
              }),
            }))}
            fit={{ a: 0, b: 1 }}
            xDomain={[0, max]}
            yDomain={[0, max]}
            xTicks={ticks}
            yTicks={ticks}
            xFormat={(v) => `${v}%`}
            yFormat={(v) => `${v}%`}
            xLabel="2024 Green share"
            yLabel="2026 Green share"
            labels={named.map((v) => ({ key: v.code, text: v.name }))}
            ariaLabel="Each riding's Green share, 2024 against 2026, where the Greens ran both times"
          />
          <Note>
            The {fmt(greens.length)} ridings where the Greens ran both times;
            dots above the diagonal gained.
          </Note>
        </>
      ) : null}
    </Section>
  )
}

function TurnoutSection({
  views,
  patterns,
  short,
  hasAdvance,
}: {
  views: RidingView[]
  patterns: ReturnType<typeof turnoutPatterns>
  short: Short
  hasAdvance: boolean
}) {
  const swingDomain = domainOf(
    views.map((v) => v.swing),
    10,
  )
  const plot = (
    pick: (v: RidingView) => number | null,
    pattern: (typeof patterns)['votes'],
    label: string,
    aria: string,
  ) => {
    const pts2 = views.filter((v) => pick(v) != null)
    if (!pattern || pts2.length < 3) return null
    const xDomain = domainOf(
      pts2.map((v) => pick(v) as number),
      10,
    )
    return (
      <div className="min-w-0 space-y-2">
        <h3 className="text-sm font-semibold">
          {label}{' '}
          <span className="text-muted-foreground font-normal">
            r = {pattern.fit.r.toFixed(2)}
          </span>
        </h3>
        <Scatter
          points={pts2.map((v) => ({
            key: v.code,
            x: pick(v) as number,
            y: v.swing,
            color: partyColor(v.winner),
            describe: () => ({
              title: v.name,
              lines: [
                { label, value: `${signed(pick(v) as number)}%` },
                { label: 'Swing', value: swingText(v.swing) },
                {
                  label: 'Won',
                  value: short(v.winner),
                  color: partyColor(v.winner),
                },
              ],
            }),
          }))}
          fit={pattern.fit}
          rule={{ y: 0 }}
          xDomain={xDomain}
          yDomain={swingDomain}
          xTicks={ticksOf(xDomain, 10)}
          yTicks={ticksOf(swingDomain, 10)}
          xFormat={(v) => `${v}%`}
          yFormat={leadTick}
          xLabel={label}
          yLabel="Swing to the Conservatives"
          height={320}
          ariaLabel={aria}
        />
      </div>
    )
  }
  return (
    <Section
      id="turnout"
      title="Turnout and the advance vote"
      sub="against the swing"
    >
      <Note>
        Each dot is a riding, coloured by its 2026 winner; the line is the
        least-squares fit. An r near zero means the two do not move together.
      </Note>
      <div className="grid gap-6 lg:grid-cols-2">
        {plot(
          (v) => v.votesChange,
          patterns.votes,
          'Votes against 2024',
          "Each riding's swing against the change in votes from 2024's advance and voting-day votes",
        )}
        {hasAdvance
          ? plot(
              (v) => v.advanceChange,
              patterns.advance,
              'Advance ballots against 2024',
              "Each riding's swing against the change in its advance ballots from 2024",
            )
          : null}
      </div>
      <Note>
        2026 votes are the initial count, so they are compared with 2024&apos;s
        advance and voting-day votes; 2024&apos;s mail and absentee ballots are
        left out on both sides.
      </Note>
    </Section>
  )
}

function FinalSection({
  views,
  watch,
  short,
}: {
  views: RidingView[]
  watch: RidingView[]
  short: Short
}) {
  const { late } = lateTotal(views)
  return (
    <Section
      id="final"
      title="What the final count could change"
      sub={`ridings within ${WATCH} points`}
    >
      <Note>
        The final count adds mail, out-of-district and special ballots. In 2024
        those leaned to the NDP more than the advance and voting-day ballots
        did. This estimate adds each riding&apos;s late ballots at its 2024 rate
        per counted vote (about {fmt(Math.round(late / 1000) * 1000)} across the
        province, an upper bound if none are in the initial count yet), moving
        each party&apos;s share by the gap between its 2024 late and in-person
        shares. It is an estimate, not a count.
      </Note>
      {watch.length ? (
        <div className="overflow-x-auto">
          <table className="nums w-full text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="py-1 pr-2 text-left font-medium">Riding</th>
                <th className="px-1.5 py-1 text-left font-medium">Leads now</th>
                <th className="px-1.5 py-1 text-right font-medium">Margin</th>
                <th className="px-1.5 py-1 text-right font-medium">
                  Late ballots
                </th>
                <th className="px-1.5 py-1 text-left font-medium">
                  Estimated final
                </th>
                <th className="px-1.5 py-1 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {watch.map((v) => (
                <tr key={v.code} className="border-t">
                  <td className="py-1 pr-2">{v.name}</td>
                  <td className="px-1.5 py-1">
                    <PartyChip party={v.winner} label={short(v.winner)} />
                  </td>
                  <td className="px-1.5 py-1 text-right">
                    {v.margin.toFixed(1)}
                  </td>
                  <td className="px-1.5 py-1 text-right">
                    ~{fmt(Math.round(v.final.late / 10) * 10)}
                  </td>
                  <td className="px-1.5 py-1">
                    <PartyChip
                      party={v.final.leader}
                      label={short(v.final.leader)}
                    />
                  </td>
                  <td className="px-1.5 py-1 text-right">
                    {v.final.margin.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Note>No riding is within {WATCH} points, before or after.</Note>
      )}
    </Section>
  )
}

type SortKey =
  'name' | 'region' | 'cp' | 'ndp' | 'green' | 'swing' | 'greenChange' | 'votes'

function RidingsSection({
  election,
  views,
  short,
}: {
  election: DistrictElection
  views: RidingView[]
  short: Short
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: 'swing',
    dir: -1,
  })
  const [q, setQ] = useState('')
  const regionLabel = new Map(election.regions.map((r) => [r.key, r.label]))
  const valueOf = (v: RidingView, key: SortKey): string | number =>
    key === 'name'
      ? v.name
      : key === 'region'
        ? regionLabel.get(v.region) || v.region
        : key === 'swing'
          ? v.swing
          : key === 'greenChange'
            ? (v.green ?? -999)
            : key === 'votes'
              ? (v.votesChange ?? -999)
              : v.shares[key] || 0
  const needle = q.trim().toLowerCase()
  const rows = views
    .filter(
      (v) =>
        !needle ||
        `${v.name} ${regionLabel.get(v.region) || ''}`
          .toLowerCase()
          .includes(needle),
    )
    .sort((a, b) => {
      const x = valueOf(a, sort.key)
      const y = valueOf(b, sort.key)
      const c =
        typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)
      return c * sort.dir || a.name.localeCompare(b.name)
    })
  const head = (key: SortKey, label: string, left = false) => {
    const active = sort.key === key
    return (
      <th
        key={key}
        aria-sort={
          active ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'
        }
        className={`px-1.5 py-1.5 font-medium ${left ? 'text-left' : 'text-right'}`}
      >
        <button
          type="button"
          className="hover:text-foreground whitespace-nowrap"
          onClick={() =>
            setSort(
              active
                ? { key, dir: sort.dir > 0 ? -1 : 1 }
                : { key, dir: key === 'name' || key === 'region' ? 1 : -1 },
            )
          }
        >
          {label}
          {active ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
        </button>
      </th>
    )
  }
  return (
    <Section id="ridings" title="Every riding" sub={`${views.length} ridings`}>
      <Note>
        Shares of the 2026 count; swing and the Green change are in points
        against 2024, votes in percent against 2024&apos;s advance and
        voting-day votes. Click a heading to sort.
      </Note>
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a riding or region"
        aria-label="Find a riding or region"
        className="max-w-sm"
      />
      <div className="max-h-[32rem] overflow-auto rounded-md border">
        <table className="nums w-full text-sm">
          <thead className="bg-card text-muted-foreground sticky top-0 text-xs">
            <tr>
              {head('name', 'Riding', true)}
              {head('region', 'Region', true)}
              <th className="px-1.5 py-1.5 text-left font-medium">2024</th>
              <th className="px-1.5 py-1.5 text-left font-medium">2026</th>
              {head('cp', 'CP')}
              {head('ndp', 'NDP')}
              {head('green', 'Green')}
              {head('swing', 'Swing')}
              {head('greenChange', 'Green ±')}
              {head('votes', 'Votes ±')}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.code} className="border-t">
                <td className="px-1.5 py-1 whitespace-nowrap">{v.name}</td>
                <td className="text-muted-foreground px-1.5 py-1 whitespace-nowrap">
                  {regionLabel.get(v.region) || v.region}
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap">
                  <PartyChip party={v.was} label={short(v.was)} />
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap">
                  <PartyChip party={v.winner} label={short(v.winner)} />
                </td>
                <td className="px-1.5 py-1 text-right">
                  {cell(v.shares.cp, (x) => x.toFixed(1))}
                </td>
                <td className="px-1.5 py-1 text-right">
                  {cell(v.shares.ndp, (x) => x.toFixed(1))}
                </td>
                <td className="px-1.5 py-1 text-right">
                  {cell(v.shares.green, (x) => x.toFixed(1))}
                </td>
                <td className="px-1.5 py-1 text-right">{signed(v.swing)}</td>
                <td className="px-1.5 py-1 text-right">{cell(v.green)}</td>
                <td className="px-1.5 py-1 text-right">
                  {cell(v.votesChange)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function NotesSection({ lost, short }: { lost: RidingView[]; short: Short }) {
  return (
    <Section id="notes" title="Notes and sources">
      <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          2026: Elections BC&apos;s results by candidate, unofficial until the
          final count. 2024: the final count by voting place from DataBC&apos;s
          Provincial Voting Results, valid votes only; the riding boundaries are
          the same.
        </li>
        <li>
          Swing is the change in the Conservative share minus the NDP share, in
          points; a riding the Greens won still has a swing between the other
          two.
        </li>
        <li>
          The advance vote is Elections BC&apos;s advance voting turnout table
          for each year.
        </li>
        {lost.length ? (
          <li>
            Incumbents who lost:{' '}
            {listOf(
              lost.map(
                (v) =>
                  `${v.incumbent!.name} (${short(v.incumbent!.party)}, ${v.name})`,
              ),
            )}
            .
          </li>
        ) : null}
      </ul>
    </Section>
  )
}
