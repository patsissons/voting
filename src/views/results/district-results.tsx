// A riding election (BC): the seat count across the province with the
// majority line and the popular vote, the viewer's own riding, every riding
// by region with a filter, the map, the seat timeline, then the count (boxes left,
// boxes over the night, popular-vote momentum, then the momentum and the vote
// share against the clock), the ridings (changing hands, closest) and the
// parties (vote by region, the legislature on the compass).
import { useMemo, useState } from 'react'
import {
  DataTable,
  GroupHead,
  Note,
  PartyChip,
  Section,
  Swatch,
} from '@/components/bits'
import { Meter, SegmentBar } from '@/components/charts/bars'
import { Choropleth } from '@/components/charts/choropleth'
import { niceTicks } from '@/components/charts/use-measure'
import { Legend } from '@/components/charts/legend'
import { useTip, tipHandlersFor } from '@/components/charts/tooltip'
import { Input } from '@/components/ui/input'
import { blendCss } from '@/lib/blend'
import { partyColor, partyLookup, partyName, partyShort } from '@/lib/party'
import { keys as storageKeys, readString, writeString } from '@/lib/storage'
import { capitalize, fmt, pct1 } from '../../../shared/format.ts'
import type { Contest, Payload, Snapshot } from '../../../shared/payload.ts'
import type { DistrictElection } from '../../../shared/schema/election.ts'
import { blendWeights, LEADER } from '../../../shared/stats/blend.ts'
import {
  boxesReported,
  changingHands,
  closest,
  complete,
  initialDone,
  keyOf,
  leaderOf,
  legislatureCentre,
  momentum,
  momentumClock,
  popularSeries,
  regionShares,
  rejectedBallots,
  ridingsLed,
  ridingsOf,
  seatsTimeline,
  shareClock,
  voteShares,
  type Timeline,
} from '../../../shared/stats/results.ts'
import { pollsSeries } from '../../../shared/stats/referendum.ts'
import { RidingPicker } from '../compass/riding-card'
import { RaceBody, RaceRow, labelOf, type RaceContext } from './race'
import {
  ClockSection,
  CompassSection,
  MomentumSection,
  SharesSection,
  TimelineSection,
} from './sections'
import { CountTiles, SourceNote, StatusLine } from './results-header'
import type { SectionLink } from './results-view'

/** The momentum-over-time window: about five of Elections BC's 3-minute updates. */
const MOMENTUM_MINUTES = 15

/** Ballot boxes reported against the clock, as a one-line timeline. */
function boxesClock(snapshots: Snapshot[], unit: string): Timeline | null {
  const data = pollsSeries(snapshots)
  if (!data) return null
  return {
    rows: data.rows,
    xs: data.xs,
    series: [
      {
        id: 'boxes',
        label: `${capitalize(unit)} reported`,
        short: 'Reported',
        party: null,
        values: data.values,
      },
    ],
  }
}

/** The boxes axis follows the count up to 100%, so the early night is not a flat line on the floor. */
function boxesTicks(snapshots: Snapshot[]): number[] | undefined {
  const data = pollsSeries(snapshots)
  if (!data) return undefined
  const ticks = niceTicks(Math.max(1, ...data.values))
  return ticks[ticks.length - 1] >= 100 ? [0, 25, 50, 75, 100] : ticks
}

export function districtSections(election: DistrictElection): SectionLink[] {
  return [
    { id: 'seats', label: 'Seats' },
    { id: 'mine', label: 'Your riding' },
    { id: 'ridings', label: 'Every riding' },
    ...(election.boundaries ? [{ id: 'map', label: 'Map' }] : []),
    { id: 'timeline', label: 'Timeline' },
    { id: 'count', label: 'The count' },
    { id: 'hands', label: 'Changing hands' },
    { id: 'parties', label: 'The parties' },
  ]
}

export function DistrictResults({
  election,
  snapshots,
  live,
  matchParty,
}: {
  election: DistrictElection
  snapshots: Snapshot[]
  live: boolean
  matchParty: string | null
}) {
  const latest = snapshots[snapshots.length - 1].payload
  const P = useMemo(() => partyLookup(election), [election])
  const ctx: RaceContext = { election, P, matchParty }
  const unit = election.results.unit || 'ballot boxes'
  const won = !!latest.official
  const done = complete(latest)
  const stage =
    latest.status && latest.status.initial
      ? `Initial count ${latest.status.initial.toLowerCase()}`
      : ''
  const ridings = ridingsOf(latest)
  const [mine, setMine] = useState(() =>
    readString(storageKeys.district(election.slug)),
  )
  const own = mine ? ridings.find((c) => c.id === mine) : undefined
  const doneText = done
    ? 'Count complete'
    : initialDone(latest)
      ? `Initial count complete${latest.status && latest.status.final ? ` · final count ${latest.status.final}` : ''}`
      : ''
  const b = boxesReported(latest)
  const hands = changingHands(latest, election)
  const near = closest(latest, 8)
  return (
    <div className="space-y-6">
      <StatusLine
        latest={latest}
        live={live}
        done={!!doneText}
        doneText={doneText}
        owner={election.results.label ? `${election.results.label}'s` : 'the'}
        timeZone={election.timeZone}
        stage={stage}
      />
      <CountTiles
        latest={latest}
        unitLabel={capitalize(unit)}
        rejected={rejectedBallots(latest)}
      />
      {matchParty && P[matchParty] ? (
        <Note>
          <PartyChip party={matchParty} label={P[matchParty].name} /> is
          outlined below: your closest compass match.
        </Note>
      ) : null}

      <SeatsSection latest={latest} ridings={ridings} ctx={ctx} won={won} />

      <Section
        id="mine"
        title={own ? `Your riding: ${own.label}` : 'Your riding'}
        sub={own ? undefined : 'from the compass, or pick one'}
      >
        <RidingPicker
          election={election}
          value={mine}
          onChange={(code) => {
            setMine(code)
            writeString(storageKeys.district(election.slug), code)
          }}
        />
        {own ? (
          <RaceBody contest={own} ctx={ctx} />
        ) : (
          <Note>
            Pick your riding to see its count here and first in the list below.
          </Note>
        )}
      </Section>

      <EveryRiding ridings={ridings} ctx={ctx} own={own} />

      <MapSection ridings={ridings} ctx={ctx} own={mine} />

      <TimelineSection
        id="timeline"
        t={seatsTimeline(snapshots, election)}
        title="How the seat count moved"
        sub={`ridings led by ${unit} reported`}
        yFormat={(v) => String(Math.round(v))}
        ariaLabel={`Ridings led by party as ${unit} reported`}
      />

      <GroupHead id="count">The count</GroupHead>
      {b.ridings ? (
        <Section
          id="left"
          title="What's left to count"
          sub={`${b.ridingsIn} of ${b.ridings} ridings fully reported`}
        >
          <div className="space-y-2">
            {b.advance[1] ? (
              <Meter
                label="Advance boxes"
                closed={b.advance[0]}
                total={b.advance[1]}
                value={`${fmt(b.advance[0])} / ${fmt(b.advance[1])}`}
              />
            ) : null}
            {b.final[1] ? (
              <Meter
                label="Final Voting Day boxes"
                closed={b.final[0]}
                total={b.final[1]}
                value={`${fmt(b.final[0])} / ${fmt(b.final[1])}`}
              />
            ) : null}
            <Meter
              label="Ridings fully reported"
              closed={b.ridingsIn}
              total={b.ridings}
              value={`${b.ridingsIn} / ${b.ridings}`}
            />
            {b.oodReported ? (
              <Meter
                label="Out-of-district counts done"
                closed={b.oodComplete}
                total={b.ridings}
                value={`${b.oodComplete} / ${b.ridings}`}
              />
            ) : null}
            {election.results.baseline ? (
              <Meter
                label={`Votes vs ${election.results.baseline.year}`}
                closed={latest.ballots}
                total={election.results.baseline.ballots}
                value={`${fmt(latest.ballots)} / ${fmt(election.results.baseline.ballots)}`}
              />
            ) : null}
          </div>
          <Note>
            {election.results.baseline
              ? `${pct1((latest.ballots / election.results.baseline.ballots) * 100)} of the ${fmt(election.results.baseline.ballots)} valid votes in ${election.results.baseline.year}'s ${election.results.baseline.label || 'count'}. `
              : ''}
            The initial count covers district electoral offices, advance voting
            and Final Voting Day; mail-in and absentee ballots are added at the
            final count.
          </Note>
        </Section>
      ) : null}
      <ClockSection
        id="boxes-time"
        t={boxesClock(snapshots, unit)}
        title={`${capitalize(unit)} reported over time`}
        sub={`${fmt(latest.polls.closed)} of ${fmt(latest.polls.total)} so far`}
        yTicks={boxesTicks(snapshots)}
        yFormat={(v) => `${+v.toFixed(2)}%`}
        valueFormat={pct1}
        color={() => 'var(--primary)'}
        ariaLabel={`Share of ${unit} reported over time`}
      />
      <MomentumSection
        id="momentum"
        m={momentum(snapshots, 60, 5, popularSeries(election))}
        title="Popular-vote momentum"
        noun="votes"
        head="Party"
        label={(r) => partyShort(P, r.party || 'other')}
        P={P}
      />
      <ClockSection
        id="momentum-time"
        t={momentumClock(snapshots, election, MOMENTUM_MINUTES)}
        title="Where the new votes went"
        sub={`each party's share of the votes counted in the ${MOMENTUM_MINUTES} minutes before each update`}
        yFormat={(v) => `${Math.round(v)}%`}
        valueFormat={pct1}
        ariaLabel={`Each party's share of the votes counted in the ${MOMENTUM_MINUTES} minutes before each update`}
      >
        <Note>
          A party whose line runs above its share in the chart below is gaining
          as the count goes on. Early updates move a lot: a handful of boxes
          from one part of the province can swing a {MOMENTUM_MINUTES}-minute
          window.
        </Note>
      </ClockSection>
      <ClockSection
        id="share-time"
        t={shareClock(snapshots, election)}
        title="Popular vote over time"
        sub="each party's share of all votes counted so far"
        yFormat={(v) => `${Math.round(v)}%`}
        valueFormat={pct1}
        ariaLabel="Each party's share of all votes counted so far, over time"
      />

      {near.length ? (
        <>
          <GroupHead id="ridings-group">The ridings</GroupHead>
          <ChangingSection hands={hands} near={near} won={won} ctx={ctx} />
        </>
      ) : null}

      <GroupHead id="parties">The parties</GroupHead>
      <SharesSection
        id="regions"
        groups={regionShares(latest, election).filter((r) => r.total > 0)}
        title="Popular vote by region"
        sub="share of all votes cast in each region"
        note="A party can take a region's vote and still lead fewer of its ridings; the tooltip shows the ridings each party leads."
        lines={(part) => [
          {
            label: won ? 'Ridings won' : 'Ridings led',
            value: String(part.led || 0),
          },
        ]}
        cell={(x) => `${pct1(x.share)} (${x.led})`}
        election={election}
        P={P}
      />
      <CompassSection
        id="legislature"
        centre={legislatureCentre(latest, election)}
        title={
          won
            ? 'The new legislature on the compass'
            : 'The legislature so far, on the compass'
        }
        seatsLabel={won ? 'Seats won' : 'Ridings led'}
        sized={won ? 'seats won' : 'ridings led'}
        you="Legislature centre"
        aria={`${won ? 'Seats won' : 'Ridings led'} by party on the compass plane`}
        radius={(n) => Math.min(24, 6 + Math.sqrt(n) * 2.6)}
        P={P}
      />

      <SourceNote>
        Counts from{' '}
        <a
          href={election.results.official}
          target="_blank"
          rel="noopener"
          className="underline underline-offset-4"
        >
          {election.results.label || 'the official results page'}
        </a>
        .{' '}
        {latest.official
          ? ''
          : `${election.results.unofficialNote || 'Unofficial until the Chief Electoral Officer declares the results.'} `}
        Party colours follow the compass parties; candidates outside them are
        grey.
      </SourceNote>
    </div>
  )
}

function SeatsSection({
  latest,
  ridings,
  ctx,
  won,
}: {
  latest: Payload
  ridings: Contest[]
  ctx: RaceContext
  won: boolean
}) {
  const { election, P } = ctx
  if (election.ballot !== 'district') return null
  const total = election.seats || ridings.length
  const majority = election.majority || Math.floor(total / 2) + 1
  const counts = ridingsLed(ridings, election)
  const led = counts.reduce((n, [, c]) => n + c, 0)
  let margin = ''
  if (counts.length >= 2) {
    const [a, b] = counts.slice().sort((x, y) => y[1] - x[1])
    const name = (k: string) => partyShort(P, k)
    const diff = a[1] - b[1]
    margin =
      diff > 0
        ? `${name(a[0])} ${won ? 'won' : 'leads'} ${won ? `${diff} more ${diff === 1 ? 'riding' : 'ridings'} than ${name(b[0])}` : `${name(b[0])} by ${diff} ${diff === 1 ? 'riding' : 'ridings'}`}.`
        : `${name(a[0])} and ${name(b[0])} are level.`
  }
  const summary = ((latest.summary && latest.summary.parties) || [])
    .filter((x) => x.votes > 0)
    .sort((a, b) => b.votes - a.votes)
  const max = summary.length ? summary[0].votes : 0
  return (
    <Section
      id="seats"
      title="Seats"
      sub={`${won ? 'won' : 'leading'} in ${led} of ${total} ridings · ${majority} for a majority`}
    >
      {margin ? <p className="font-medium">{margin}</p> : null}
      <SegmentBar
        caption={won ? 'Elected' : 'Currently leading'}
        total={total}
        majority={majority}
        ariaLabel={`${won ? 'Won' : 'Leading'}: ${counts.map(([k, n]) => `${partyShort(P, k)} ${n}`).join(', ') || 'nobody yet'}; ${majority} needed for a majority`}
        segments={counts.map(([key, n]) => {
          const names = ridings
            .filter((c) => leaderOf(c) && keyOf(leaderOf(c)!) === key)
            .map((c) => c.label)
          return {
            key,
            label: partyShort(P, key),
            color: partyColor(key === 'other' ? null : key),
            n,
            describe: () => ({
              title: `${partyName(P, key)}: ${won ? 'won' : 'leading'} ${n} of ${total}`,
              lines: names
                .slice(0, 12)
                .map((x) => ({ label: x, value: '' }))
                .concat(
                  names.length > 12
                    ? [{ label: `and ${names.length - 12} more`, value: '' }]
                    : [],
                ),
            }),
          }
        })}
      />
      {summary.length ? (
        <div className="space-y-1.5">
          <span className="text-muted-foreground block text-xs font-medium tracking-wide uppercase">
            Popular vote
          </span>
          {summary.map((row) => (
            <div
              key={row.key}
              className="nums grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-2 text-sm"
            >
              <span className="flex items-center gap-1.5 truncate">
                <Swatch party={row.key === 'other' ? null : row.key} />
                {partyName(P, row.key)}
              </span>
              <span className="bg-muted h-2.5 overflow-hidden rounded-full">
                <i
                  className="block h-full rounded-full"
                  style={{
                    width: `${max ? Math.max(0.5, (row.votes / max) * 100) : 0}%`,
                    background: partyColor(
                      row.key === 'other' ? null : row.key,
                    ),
                  }}
                />
              </span>
              <span className="text-right">{fmt(row.votes)}</span>
              <span className="text-muted-foreground text-right">
                {pct1(row.pct)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Section>
  )
}

function EveryRiding({
  ridings,
  ctx,
  own,
}: {
  ridings: Contest[]
  ctx: RaceContext
  own?: Contest
}) {
  const { election, P } = ctx
  const [q, setQ] = useState('')
  const [openRegions, setOpenRegions] = useState<Record<string, boolean>>({})
  if (election.ballot !== 'district') return null
  const regions = election.regions.length
    ? election.regions
    : [{ key: '', label: 'All ridings' }]
  const groups = regions.map((reg) => ({
    reg,
    list: ridings.filter((c) => !reg.key || c.region === reg.key),
  }))
  const stray = ridings.filter(
    (c) => c.region && !election.regions.some((r) => r.key === c.region),
  )
  if (stray.length)
    groups.push({ reg: { key: 'other', label: 'Other' }, list: stray })
  const needle = q.trim().toLowerCase()
  const text = (c: Contest) =>
    `${c.label} ${c.choices.map((ch) => `${ch.name} ${labelOf(P, ch)}`).join(' ')}`.toLowerCase()
  return (
    <Section
      id="ridings"
      title="Every riding"
      sub={`${ridings.length} ridings`}
    >
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a riding or candidate"
        aria-label="Find a riding or candidate"
        className="max-w-sm"
      />
      <div className="space-y-2">
        {groups.map(({ reg, list }) => {
          const hits = list.filter((c) => !needle || text(c).includes(needle))
          if (!list.length || (needle && !hits.length)) return null
          const counts = ridingsLed(list, election)
          const open = needle
            ? true
            : (openRegions[reg.key] ??
              (!!own && list.some((c) => c.id === own.id)))
          return (
            <details
              key={reg.key}
              open={open}
              onToggle={(e) =>
                !needle &&
                setOpenRegions({
                  ...openRegions,
                  [reg.key]: (e.target as HTMLDetailsElement).open,
                })
              }
              className="rounded-lg border"
            >
              <summary className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm font-medium">
                <span>{reg.label}</span>
                <span className="text-muted-foreground nums text-xs font-normal">
                  {list.length} ridings ·{' '}
                  {counts
                    .map(([k, n]) => `${partyShort(P, k)} ${n}`)
                    .join(', ') || 'no counts yet'}
                </span>
              </summary>
              <div className="divide-y border-t">
                {hits.map((contest) => (
                  <RaceRow key={contest.id} contest={contest} ctx={ctx} />
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </Section>
  )
}

function ChangingSection({
  hands,
  near,
  won,
  ctx,
}: {
  hands: ReturnType<typeof changingHands>
  near: ReturnType<typeof closest>
  won: boolean
  ctx: RaceContext
}) {
  const tip = useTip()
  const { P } = ctx
  const n = hands.flips.length
  const scale = Math.max(5, Math.ceil(near[near.length - 1].margin))
  const colorOf = (k: string) => partyColor(k === 'other' ? null : k)
  return (
    <Section
      id="hands"
      title={
        won ? 'Changed hands since last time' : 'Changing hands since last time'
      }
      sub="leader against the last winning party"
    >
      <p className="font-medium">
        {n
          ? `${n} ${n === 1 ? 'riding' : 'ridings'} ${won ? 'changed' : 'would change'} hands${won ? '' : ' if the count stopped now'}.`
          : 'Every riding with a leader is led by the party that won it last time.'}
      </p>
      {n ? (
        <div className="space-y-3">
          {hands.byPair.map((pair) => (
            <div
              key={`${pair.from}>${pair.to}`}
              className="flex flex-wrap items-start gap-3 text-sm"
            >
              <span className="nums inline-flex items-center gap-2 font-medium">
                <PartyChip
                  party={pair.from === 'other' ? null : pair.from}
                  label={partyShort(P, pair.from)}
                />
                <span aria-label="to">→</span>
                <PartyChip
                  party={pair.to === 'other' ? null : pair.to}
                  label={partyShort(P, pair.to)}
                />
                <b>{pair.n}</b>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {pair.ridings.map((f) => (
                  <span
                    key={f.id}
                    tabIndex={0}
                    className="nums rounded-md border px-2 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    {...tipHandlersFor(tip, () => ({
                      title: f.label,
                      lines: [
                        {
                          label: `Last time: ${partyName(P, f.from)}`,
                          color: colorOf(f.from),
                          value: '',
                        },
                        {
                          label: `${won ? 'Won' : 'Leading'}: ${f.lead} (${partyShort(P, f.to)})`,
                          color: colorOf(f.to),
                          value: '',
                        },
                        {
                          label: 'Margin',
                          value: `${f.margin.toFixed(1)} pts`,
                        },
                      ],
                    }))}
                  >
                    {f.label}{' '}
                    <small className="text-muted-foreground">
                      +{f.margin.toFixed(1)}
                    </small>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <h3 className="pt-2 font-semibold">Closest ridings</h3>
      <div className="space-y-1.5">
        {near.map((c) => (
          <div
            key={c.id}
            tabIndex={0}
            className="nums grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
            {...tipHandlersFor(tip, () => ({
              title: c.label,
              lines: [
                {
                  label: `${c.lead.name} (${labelOf(P, c.lead)})`,
                  color: partyColor(c.lead.party),
                  value: fmt(c.lead.votes),
                },
                {
                  label: `${c.next.name} (${labelOf(P, c.next)})`,
                  color: partyColor(c.next.party),
                  value: fmt(c.next.votes),
                },
                {
                  label: 'Margin',
                  value: `${fmt(c.votes)} votes · ${c.margin.toFixed(1)} pts`,
                },
              ],
            }))}
          >
            <span className="truncate">{c.label}</span>
            <span className="bg-muted col-span-2 h-2 overflow-hidden rounded-full sm:col-span-1">
              <i
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(1, (c.margin / scale) * 100).toFixed(1)}%`,
                  background: partyColor(c.lead.party),
                }}
              />
            </span>
            <span className="text-muted-foreground col-start-2 row-start-1 text-right text-xs sm:col-start-3">
              {labelOf(P, c.lead)} +{c.margin.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <Note>
        Bars run from a tie to {scale} points; the leader's party sets the
        colour.
      </Note>
      <DataTable
        heads={['Riding', won ? 'Won' : 'Leading', 'Second', 'Margin']}
        rows={near.map((c) => [
          c.label,
          `${c.lead.name} (${labelOf(P, c.lead)})`,
          `${c.next.name} (${labelOf(P, c.next)})`,
          `${fmt(c.votes)} votes · ${c.margin.toFixed(1)} pts`,
        ])}
      />
    </Section>
  )
}

function MapSection({
  ridings,
  ctx,
  own,
}: {
  ridings: Contest[]
  ctx: RaceContext
  own: string
}) {
  const { election, P } = ctx
  if (election.ballot !== 'district' || !election.boundaries) return null
  const byCode = new Map(ridings.map((c) => [c.id, c]))
  const names = new Map(election.districts.map((d) => [d.code, d.name]))
  const fills: Record<string, string> = {}
  for (const c of ridings)
    fills[c.id] = blendCss(blendWeights(voteShares(c)), partyColor)
  const hasOthers = ridings.some((c) => c.choices.some((ch) => !ch.party))
  return (
    <Section id="map" title="Map" sub="every riding by vote share">
      <Legend
        items={[
          ...election.parties.map((p) => ({
            label: p.short,
            color: partyColor(p.key),
          })),
          ...(hasOthers
            ? [{ label: 'Others', color: partyColor('other') }]
            : []),
        ]}
      />
      <Choropleth
        set={election.boundaries}
        fills={fills}
        ring={own || undefined}
        ariaLabel="Each riding's blend of party colours by vote share"
        describe={(code) => {
          const c = byCode.get(code)
          const title = `${c ? c.label : names.get(code) || code}${code === own ? ' (yours)' : ''}`
          const shares = c ? voteShares(c).filter((s) => s.share > 0) : []
          if (!c || !shares.length)
            return {
              title,
              lines: [{ label: 'Votes', value: 'none counted yet' }],
            }
          const lead = leaderOf(c)
          return {
            title,
            lines: [
              ...shares.slice(0, 5).map((s) => ({
                label: partyShort(P, s.key),
                value: pct1(s.share),
                color: partyColor(s.key),
              })),
              ...(lead
                ? [
                    {
                      label: lead.winner ? 'Elected' : 'Leading',
                      value: lead.name,
                    },
                  ]
                : []),
            ],
          }
        }}
      />
      <Note>
        Each riding blends its parties' colours by their share of its votes,
        sharpened so the party ahead always makes up at least{' '}
        {Math.round(LEADER * 100)}% of the colour: the leader reads first, and a
        close race shows as a tint of the runner-up. Grey ridings have no votes
        counted yet.{' '}
        {own
          ? 'Your riding is outlined.'
          : 'Pick your riding above to outline it.'}
      </Note>
    </Section>
  )
}
