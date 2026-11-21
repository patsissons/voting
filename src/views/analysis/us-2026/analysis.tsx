// The US 2026 analysis: every House, Senate and governor's race against who
// held it, how it was rated and its 2024 result. Bespoke to this election
// (the swing from 2024, the ratings, the redrawn maps, split tickets, the
// early vote); the 2024 table is ./prior. Margins are Democratic minus
// Republican throughout, and every one names its direction in words.
import { useMemo, useState } from 'react'
import { DataTable, Note, PartyChip, Section, Swatch } from '@/components/bits'
import { ChangeBars } from '@/components/charts/change-bars'
import { Choropleth } from '@/components/charts/choropleth'
import { Dumbbell } from '@/components/charts/dumbbell'
import { Legend } from '@/components/charts/legend'
import { Lines } from '@/components/charts/lines'
import { Scatter } from '@/components/charts/scatter'
import type { TipContent } from '@/components/charts/tooltip'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { partyColor } from '@/lib/party'
import { dayShort, fmt, pct1, wallClock } from '../../../../shared/format.ts'
import type { ChambersElection } from '../../../../shared/schema/election.ts'
import { Tile } from '../../results/results-header'
import { SectionNav } from '../../results/results-view'
import type { AnalysisProps } from '..'
import { listOf } from '../alberta-2026/findings'
import {
  bandLabel,
  findings,
  leadText,
  letter,
  swingText,
  the,
  toward,
} from './findings'
import {
  BANDS,
  CLOSE,
  DEM,
  GOP,
  STEADY,
  bandRecords,
  chamberSummaries,
  countMoves,
  earlyPattern,
  latestFull,
  raceViews,
  redrawnSplit,
  splitTickets,
  stateViews,
  swingSummary,
  tippingPoint,
  type ChamberSummary,
  type CountMoves,
  type EarlyPattern,
  type RaceView,
  type Split,
  type StateView,
  type SwingSummary,
  type Tipping,
} from './stats'

const SECTIONS = [
  { id: 'findings', label: 'Findings' },
  { id: 'swing', label: 'Swing' },
  { id: 'ratings', label: 'Ratings' },
  { id: 'flips', label: 'Changed hands' },
  { id: 'seats', label: 'Seats and votes' },
  { id: 'split', label: 'Split tickets' },
  { id: 'early', label: 'Early vote' },
  { id: 'count', label: 'The count' },
  { id: 'races', label: 'Races' },
  { id: 'notes', label: 'Notes' },
]

/** The swing maps' bands, toward the Republicans first. */
const SWING_BANDS = [
  { lo: -Infinity, hi: -10, label: 'toward Republicans 10+' },
  { lo: -10, hi: -STEADY, label: `toward Republicans ${STEADY}–10` },
  { lo: -STEADY, hi: STEADY, label: `within ${STEADY} either way` },
  { lo: STEADY, hi: 10, label: `toward Democrats ${STEADY}–10` },
  { lo: 10, hi: 20, label: 'toward Democrats 10–20' },
  { lo: 20, hi: Infinity, label: 'toward Democrats 20+' },
]
const DEPTH = [70, 35, 0, 30, 55, 80]
const bandColor = (i: number) =>
  i === 2
    ? 'var(--muted)'
    : `color-mix(in oklab, ${partyColor(i < 2 ? GOP : DEM)} ${DEPTH[i]}%, var(--muted))`
const swingBand = (swing: number) =>
  SWING_BANDS.findIndex((b) => swing >= b.lo && swing < b.hi)

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

/** What a signed margin or swing axis means. */
const SIGNS = '+ Democratic, − Republican'
/** An axis tick in points: "+20", "0", "-20". */
const leadTick = (v: number) => (v > 0 ? `+${v}` : String(v))
const signedInt = (n: number) => (n > 0 ? `+${n}` : String(n))
const CHAMBER_WORD: Record<string, string> = {
  house: 'House',
  senate: 'Senate',
  governor: 'Governors',
}
const chamberWord = (key: string) => CHAMBER_WORD[key] || key
const shortBand = (band: string) =>
  band === 'tossup'
    ? 'Toss-up'
    : `${bandLabel(band).split(' ')[0]} ${band.endsWith(DEM) ? 'D' : 'R'}`

/** Who leads a race and by how much, without a sign: "Democrats by 5.4", "runoff pending". */
const resultText = (v: RaceView) =>
  v.pending
    ? 'runoff pending'
    : !v.leader
      ? 'no count'
      : v.lead == null
        ? `${the(v.leader)}, unopposed`
        : `${the(v.leader)} by ${v.lead.toFixed(1)}`

/** A race's tooltip: the result, who held it, its rating, and the 2024 comparison where there is one. */
function raceTip(v: RaceView, priorLabel = '2024'): TipContent {
  return {
    title: v.name,
    lines: [
      {
        label: v.called ? 'Called' : v.leader ? 'Leading' : 'Result',
        value: resultText(v),
        color: v.leader ? partyColor(v.leader) : undefined,
      },
      ...(v.flip
        ? [{ label: 'Gained from', value: the(v.flip.from) }]
        : v.holder
          ? [{ label: 'Held before', value: the(v.holder) }]
          : []),
      ...(v.band ? [{ label: 'Rated', value: bandLabel(v.band) }] : []),
      ...(v.margin != null
        ? [{ label: '2026 margin', value: leadText(v.margin) }]
        : []),
      ...(v.prior != null
        ? [{ label: `${priorLabel} margin`, value: leadText(v.prior) }]
        : []),
      ...(v.swing != null
        ? [{ label: 'Swing', value: swingText(v.swing) }]
        : []),
    ],
  }
}

export default function UsAnalysis({
  election,
  snapshots,
  earlyVote,
}: AnalysisProps) {
  if (election.ballot !== 'chambers') return null
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
  election: ChambersElection
  snapshots: AnalysisProps['snapshots']
  earlyVote: NonNullable<AnalysisProps['earlyVote']> | null
}) {
  const latest = useMemo(() => latestFull(snapshots), [snapshots])
  const data = useMemo(() => {
    const views = raceViews(latest, election)
    const chambers = chamberSummaries(latest, views, election)
    const states = stateViews(views, election)
    const swing = swingSummary(views, chambers)
    const house = views.filter((v) => v.chamber === 'house')
    const bands = bandRecords(house)
    const houseChamber = election.chambers.find((c) => c.key === 'house')
    const tipping = tippingPoint(
      house,
      houseChamber && houseChamber.majority != null
        ? houseChamber.majority
        : null,
    )
    const splits = splitTickets(states)
    const redrawn = redrawnSplit(views)
    const early = earlyPattern(states, earlyVote)
    const moves = countMoves(snapshots, election)
    return {
      views,
      chambers,
      states,
      swing,
      tipping,
      splits,
      redrawn,
      early,
      moves,
      findings: findings({
        chambers,
        views,
        swing,
        bands,
        tipping,
        splits,
        redrawn,
        early,
        moves,
      }),
    }
  }, [latest, election, earlyVote, snapshots])

  if (!latest || !data.views.some((v) => v.votes > 0))
    return (
      <Note>
        The analysis needs the count by race, which arrives with the first
        results.
      </Note>
    )
  const { views, chambers, swing } = data
  const house = chambers.find((c) => c.key === 'house')
  const flips = views.filter((v) => v.flip)
  const houseFlips = flips.filter((v) => v.chamber === 'house')
  const otherFlips = flips.filter((v) => v.chamber !== 'house')
  const toDem = (rows: RaceView[]) =>
    rows.filter((v) => v.flip!.to === DEM).length
  const gains = (rows: RaceView[]) =>
    `Democrats ${fmt(toDem(rows))}, Republicans ${fmt(rows.length - toDem(rows))}`
  const open = views.filter((v) => !v.called)
  const called = views.length - open.length

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Every race against who held it, how it was rated and its 2024 result,
        from the unofficial count as of {wallClock(latest.asOf)} Eastern, with{' '}
        {fmt(called)} of {fmt(views.length)} races called. Margins are in points
        of every vote; a seat counts for the party leading it. Hover or focus
        any mark for its numbers.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="House seats changed hands"
          value={fmt(houseFlips.length)}
          sub={
            houseFlips.length
              ? gains(houseFlips)
              : `of ${fmt(house ? house.up : 0)}`
          }
        />
        <Tile
          label="Senate and governors changed hands"
          value={fmt(otherFlips.length)}
          sub={otherFlips.length ? gains(otherFlips) : 'of the races this year'}
        />
        <Tile
          label="House vote swing from 2024"
          value={
            swing.nationalSwing == null
              ? '-'
              : `${Math.abs(swing.nationalSwing).toFixed(1)} pts`
          }
          sub={swing.nationalSwing == null ? '' : toward(swing.nationalSwing)}
        />
        <Tile
          label="Races still open"
          value={fmt(open.length)}
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
        states={data.states}
        swing={swing}
      />
      <RatingsSection election={election} views={views} />
      <FlipsSection election={election} views={views} redrawn={data.redrawn} />
      <SeatsSection
        chambers={chambers}
        states={data.states}
        tipping={data.tipping}
        swing={swing}
      />
      <SplitSection splits={data.splits} />
      <EarlySection early={data.early} />
      <CountSection moves={data.moves} />
      <RacesSection election={election} views={views} />
      <NotesSection election={election} chambers={chambers} views={views} />
    </div>
  )
}

const wonLegend = (rows: { leader: string | null }[]) =>
  [DEM, GOP, 'other']
    .filter((k) =>
      rows.some((v) =>
        k === 'other'
          ? v.leader && v.leader !== DEM && v.leader !== GOP
          : v.leader === k,
      ),
    )
    .map((k) => ({
      label: k === 'other' ? 'Others lead' : `${the(k)} lead`,
      color: partyColor(k),
    }))

function SwingSection({
  election,
  views,
  states,
  swing,
}: {
  election: ChambersElection
  views: RaceView[]
  states: StateView[]
  swing: SwingSummary
}) {
  const houseChamber = election.chambers.find((c) => c.key === 'house')
  const house = views.filter((v) => v.chamber === 'house')
  const compared = house.filter((v) => v.swing != null)
  const statewide = views.filter(
    (v) => v.chamber !== 'house' && v.swing != null,
  )
  const domain = domainOf(
    compared.flatMap((v) => [v.prior as number, v.margin as number]),
    20,
  )
  const ticks = ticksOf(domain, 20)
  const bySwing = [...compared].sort(
    (a, b) => (b.swing as number) - (a.swing as number),
  )
  const named = [...bySwing.slice(0, 3), ...bySwing.slice(-2)]
  const byCode = new Map(house.map((v) => [v.code, v]))
  const fills: Record<string, string> = {}
  for (const v of compared)
    fills[v.code] = bandColor(swingBand(v.swing as number))
  const hatched = house.filter((v) => v.swing == null).map((v) => v.code)
  const stateDomain = domainOf(
    statewide.flatMap((v) => [v.prior as number, v.margin as number]),
    20,
  )
  const stateTicks = ticksOf(stateDomain, 20)
  const stateNamed = [...statewide]
    .sort((a, b) => Math.abs(b.swing as number) - Math.abs(a.swing as number))
    .slice(0, 5)
  const stateSwings = states.filter((s) => s.swing != null)
  const stateFills: Record<string, string> = {}
  for (const s of stateSwings)
    stateFills[s.key] = bandColor(swingBand(s.swing as number))
  const byState = new Map(states.map((s) => [s.key, s]))
  const bands = bandRecords(house).filter((b) => b.swing != null)
  return (
    <Section
      id="swing"
      title="The swing from 2024"
      sub="Democratic lead over the Republicans, in points"
    >
      {compared.length >= 3 ? (
        <>
          <Note>
            Each dot is a House district in a state that kept its map: its
            Democratic lead over the Republican in 2024 across, in 2026 up. Dots
            above the diagonal moved toward the Democrats; above the zero line
            the Democrat leads.
          </Note>
          <Legend
            items={[
              ...wonLegend(compared),
              {
                label: 'No change',
                color: 'var(--muted-foreground)',
                line: true,
              },
            ]}
          />
          <Scatter
            points={compared.map((v) => ({
              key: v.id,
              x: v.prior as number,
              y: v.margin as number,
              color: partyColor(v.leader),
              describe: () => raceTip(v),
            }))}
            fit={{ a: 0, b: 1 }}
            rule={{ y: 0 }}
            xDomain={domain}
            yDomain={domain}
            xTicks={ticks}
            yTicks={ticks}
            xFormat={leadTick}
            yFormat={leadTick}
            xLabel={`2024 margin (${SIGNS})`}
            yLabel={`2026 margin (${SIGNS})`}
            labels={named.map((v) => ({ key: v.id, text: v.name }))}
            ariaLabel="Each House district's Democratic lead over the Republican, 2024 against 2026"
          />
          <Note>
            {fmt(swing.districts)} districts can be set against their own 2024
            race. The ten states that redrew their maps (
            {fmt(house.filter((v) => v.redrawn).length)} districts) are left
            out, as are {fmt(swing.uncompared)} districts one of the two big
            parties sat out in either year.
          </Note>
        </>
      ) : null}
      {houseChamber && houseChamber.boundaries && compared.length ? (
        <>
          <h3 className="text-sm font-semibold">
            By district{' '}
            <span className="text-muted-foreground font-normal">
              swing in points
            </span>
          </h3>
          <Legend
            items={SWING_BANDS.map((b, i) => ({
              label: b.label,
              color: bandColor(i),
            }))}
          />
          <Choropleth
            set={houseChamber.boundaries}
            fills={fills}
            hatched={hatched}
            ariaLabel={`Swing from 2024 by House district: ${fmt(swing.towardDem)} of ${fmt(swing.districts)} moved toward the Democrats; hatched districts have no comparison`}
            describe={(code) => {
              const v = byCode.get(code)
              if (!v)
                return { title: code, lines: [{ label: 'No race', value: '' }] }
              const tip = raceTip(v)
              return v.swing != null
                ? tip
                : {
                    ...tip,
                    lines: [
                      ...tip.lines,
                      {
                        label: 'No 2024 comparison',
                        value: v.redrawn ? 'new map' : 'one party sat out',
                      },
                    ],
                  }
            }}
          />
          <Note>Hatched districts have no 2024 race to compare with.</Note>
        </>
      ) : null}
      {bands.length >= 2 ? (
        <>
          <h3 className="text-sm font-semibold">
            By rating{' '}
            <span className="text-muted-foreground font-normal">
              the middle district&apos;s swing, in points
            </span>
          </h3>
          <Legend
            items={[
              { label: 'toward the Democrats', color: partyColor(DEM) },
              { label: 'toward the Republicans', color: partyColor(GOP) },
            ]}
          />
          <ChangeBars
            rows={bands.map((b) => ({
              label: bandLabel(b.band),
              color: partyColor((b.swing as number) >= 0 ? DEM : GOP),
              value: b.swing as number,
              describe: () => ({
                title: bandLabel(b.band),
                lines: [
                  { label: 'Districts', value: fmt(b.n) },
                  {
                    label: 'Median swing',
                    value: swingText(b.swing as number),
                  },
                  ...(b.median == null
                    ? []
                    : [{ label: 'Median margin', value: leadText(b.median) }]),
                ],
              }),
            }))}
            xFormat={(v) => String(Math.abs(v))}
            valueFormat={(v) => Math.abs(v).toFixed(1)}
            ariaLabel={`Median House swing from 2024 by rating: ${bands
              .map(
                (b) => `${bandLabel(b.band)} ${swingText(b.swing as number)}`,
              )
              .join(', ')}`}
          />
        </>
      ) : null}
      {statewide.length >= 3 ? (
        <>
          <h3 className="text-sm font-semibold">
            Senate and governors{' '}
            <span className="text-muted-foreground font-normal">
              against the state&apos;s 2024 presidential vote
            </span>
          </h3>
          <Legend
            items={[
              ...wonLegend(statewide),
              {
                label: 'No change',
                color: 'var(--muted-foreground)',
                line: true,
              },
            ]}
          />
          <Scatter
            points={statewide.map((v) => ({
              key: v.id,
              x: v.prior as number,
              y: v.margin as number,
              color: partyColor(v.leader),
              describe: () => raceTip(v, '2024 president'),
            }))}
            fit={{ a: 0, b: 1 }}
            rule={{ y: 0 }}
            xDomain={stateDomain}
            yDomain={stateDomain}
            xTicks={stateTicks}
            yTicks={stateTicks}
            xFormat={leadTick}
            yFormat={leadTick}
            xLabel={`2024 presidential margin (${SIGNS})`}
            yLabel={`2026 margin (${SIGNS})`}
            labels={stateNamed.map((v) => ({ key: v.id, text: v.name }))}
            height={360}
            ariaLabel="Each Senate and governor's race against its state's 2024 presidential margin"
          />
          {swing.statewideMedian != null ? (
            <Note>
              The middle of these {fmt(swing.statewide)} races ran{' '}
              {Math.abs(swing.statewideMedian).toFixed(1)} points{' '}
              {toward(swing.statewideMedian)} of the state&apos;s 2024
              presidential margin. A different office and different candidates,
              so this is a looser comparison than a district with itself.
            </Note>
          ) : null}
        </>
      ) : null}
      {stateSwings.length >= 3 ? (
        <>
          <h3 className="text-sm font-semibold">
            By state{' '}
            <span className="text-muted-foreground font-normal">
              the House vote against the 2024 presidential vote
            </span>
          </h3>
          <Legend
            items={SWING_BANDS.map((b, i) => ({
              label: b.label,
              color: bandColor(i),
            }))}
          />
          <Choropleth
            set="us-state"
            fills={stateFills}
            ariaLabel={`House vote against the 2024 presidential vote by state: ${stateSwings
              .map((s) => `${s.label} ${swingText(s.swing as number)}`)
              .join(', ')}`}
            describe={(code) => {
              const s = byState.get(code)
              return s && s.swing != null
                ? {
                    title: s.label,
                    lines: [
                      {
                        label: '2024 president',
                        value: leadText(s.president as number),
                      },
                      {
                        label: '2026 House vote',
                        value: leadText(s.house as number),
                      },
                      { label: 'Swing', value: swingText(s.swing) },
                      ...(s.alone
                        ? [
                            {
                              label: 'Districts left out',
                              value: `${fmt(s.alone)} of ${fmt(s.seats)}`,
                            },
                          ]
                        : []),
                    ],
                  }
                : {
                    title: s ? s.label : code,
                    lines: [{ label: 'No comparison', value: '' }],
                  }
            }}
          />
          <Note>
            This one covers all fifty states, the redrawn ones too: each
            state&apos;s House vote, in the districts both parties ran in,
            against its 2024 presidential margin.
          </Note>
        </>
      ) : null}
    </Section>
  )
}

/** A steady spread for the dots of one rating band, so they do not sit on one line. */
const jitter = (i: number) => (((i * 7) % 11) - 5) / 20
/** Margins beyond this sit at the edge of the ratings chart. */
const EDGE = 60

function RatingsSection({
  election,
  views,
}: {
  election: ChambersElection
  views: RaceView[]
}) {
  const rated = election.chambers.filter((c) =>
    views.some((v) => v.chamber === c.key && v.band),
  )
  const [key, setKey] = useState(rated.length ? rated[0].key : '')
  const chamber = rated.find((c) => c.key === key) || rated[0]
  if (!chamber) return null
  const mine = views.filter((v) => v.chamber === chamber.key && v.band)
  const records = bandRecords(mine)
  const plotted = mine.filter((v) => v.signed != null)
  const rowOf = (v: RaceView) => BANDS.length - 1 - BANDS.indexOf(v.band!)
  const against = records.flatMap((r) => r.against)
  const source = chamber.ratings
  return (
    <Section
      id="ratings"
      title="Ratings against the result"
      sub={
        source ? `${source.label}, as of ${dayShort(source.asOf)}` : undefined
      }
    >
      {rated.length > 1 ? (
        <label className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Show</span>
          <Select value={chamber.key} onValueChange={setKey}>
            <SelectTrigger className="w-48" aria-label="Chamber">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rated.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ) : null}
      <Legend items={wonLegend(plotted)} />
      <Scatter
        points={plotted.map((v, i) => ({
          key: v.id,
          x: Math.max(-EDGE, Math.min(EDGE, v.signed as number)),
          y: rowOf(v) + jitter(i),
          color: partyColor(v.leader),
          describe: () =>
            raceTip(v, chamber.key === 'house' ? '2024' : '2024 president'),
        }))}
        xDomain={[-EDGE, EDGE]}
        yDomain={[-0.5, BANDS.length - 0.5]}
        xTicks={ticksOf([-EDGE, EDGE], 20)}
        yTicks={BANDS.map((_, i) => i)}
        xFormat={leadTick}
        yFormat={(v) =>
          shortBand(BANDS[BANDS.length - 1 - Math.round(v)] || '')
        }
        xLabel={`2026 margin (${SIGNS})`}
        yLabel=""
        height={380}
        ariaLabel={`${chamber.label}: each race's margin by its pre-election rating`}
      />
      <Note>
        Each dot is a race, in the row of its rating before the election and
        placed by its margin. A dot on the far side of zero from its rating went
        against it. Margins beyond {EDGE} points and unopposed races sit at the
        edge.
      </Note>
      <div className="overflow-x-auto">
        <table className="nums w-full text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Rating</th>
              <th className="px-1.5 py-1 text-right font-medium">Races</th>
              <th className="px-1.5 py-1 text-right font-medium">Democrats</th>
              <th className="px-1.5 py-1 text-right font-medium">
                Republicans
              </th>
              <th className="px-1.5 py-1 text-right font-medium">Open</th>
              <th className="px-1.5 py-1 text-left font-medium">
                Middle margin
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.band} className="border-t">
                <td className="py-1 pr-2">{bandLabel(r.band)}</td>
                <td className="px-1.5 py-1 text-right">{fmt(r.n)}</td>
                <td className="px-1.5 py-1 text-right">{fmt(r.dem)}</td>
                <td className="px-1.5 py-1 text-right">{fmt(r.gop)}</td>
                <td className="px-1.5 py-1 text-right">
                  {r.open + r.other ? fmt(r.open + r.other) : '-'}
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap">
                  {r.median == null ? '-' : leadText(r.median)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {against.length ? (
        <Note>
          Against their rating ({fmt(against.length)}):{' '}
          {listOf(
            against.map(
              (v) => `${v.place} (${shortBand(v.band!)}, ${resultText(v)})`,
            ),
          )}
          .
        </Note>
      ) : (
        <Note>No rated race went against its rating.</Note>
      )}
    </Section>
  )
}

function FlipsSection({
  election,
  views,
  redrawn,
}: {
  election: ChambersElection
  views: RaceView[]
  redrawn: ReturnType<typeof redrawnSplit>
}) {
  const flips = views.filter((v) => v.flip)
  const houseChamber = election.chambers.find((c) => c.key === 'house')
  const house = views.filter((v) => v.chamber === 'house')
  const byCode = new Map(house.map((v) => [v.code, v]))
  const fills: Record<string, string> = {}
  for (const v of house) if (v.flip) fills[v.code] = partyColor(v.flip.to)
  const regionLabel = new Map(election.regions.map((r) => [r.key, r.label]))
  const perState = new Map<string, number>()
  for (const v of flips.filter((x) => x.chamber === 'house'))
    perState.set(v.state, (perState.get(v.state) || 0) + 1)
  const topStates = [...perState.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .filter(([, n]) => n >= 2)
  if (!flips.length)
    return (
      <Section id="flips" title="Seats that changed hands">
        <Note>No seat is led by a party other than the one that held it.</Note>
      </Section>
    )
  const rate = (p: { seats: number; flips: number }) =>
    p.seats ? pct1((100 * p.flips) / p.seats) : '-'
  return (
    <Section
      id="flips"
      title="Seats that changed hands"
      sub={`${fmt(flips.length)} of ${fmt(views.length)} races`}
    >
      {houseChamber && houseChamber.boundaries ? (
        <>
          <Legend
            items={[DEM, GOP]
              .filter((k) => house.some((v) => v.flip && v.flip.to === k))
              .map((k) => ({
                label: `Gained by the ${the(k)}`,
                color: partyColor(k),
              }))}
          />
          <Choropleth
            set={houseChamber.boundaries}
            fills={fills}
            ariaLabel={`House seats that changed hands: ${listOf(
              house.filter((v) => v.flip).map((v) => v.name),
            )}`}
            describe={(code) => {
              const v = byCode.get(code)
              return v
                ? raceTip(v)
                : { title: code, lines: [{ label: 'No race', value: '' }] }
            }}
          />
        </>
      ) : null}
      {topStates.length ? (
        <Note>
          By state:{' '}
          {listOf(
            topStates.map(([k, n]) => `${regionLabel.get(k) || k} ${fmt(n)}`),
          )}
          . In the ten states that redrew their maps{' '}
          {fmt(redrawn.redrawn.flips)} of {fmt(redrawn.redrawn.seats)} House
          seats changed hands ({rate(redrawn.redrawn)}), against{' '}
          {fmt(redrawn.kept.flips)} of {fmt(redrawn.kept.seats)} elsewhere (
          {rate(redrawn.kept)}). A seat on a new map is set against the party
          that held the district with its number.
        </Note>
      ) : null}
      <div className="max-h-[28rem] overflow-auto rounded-md border">
        <table className="nums w-full text-sm">
          <thead className="bg-card text-muted-foreground sticky top-0 text-xs">
            <tr>
              <th className="px-1.5 py-1.5 text-left font-medium">Race</th>
              <th className="px-1.5 py-1.5 text-left font-medium">Held by</th>
              <th className="px-1.5 py-1.5 text-left font-medium">Now</th>
              <th className="px-1.5 py-1.5 text-left font-medium">Rated</th>
              <th className="px-1.5 py-1.5 text-right font-medium">Lead</th>
              <th className="px-1.5 py-1.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {flips.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="px-1.5 py-1 whitespace-nowrap">{v.name}</td>
                <td className="px-1.5 py-1 whitespace-nowrap">
                  <PartyChip
                    party={v.flip!.from}
                    label={letter(v.flip!.from)}
                  />
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap">
                  <PartyChip party={v.flip!.to} label={letter(v.flip!.to)} />
                </td>
                <td className="text-muted-foreground px-1.5 py-1 whitespace-nowrap">
                  {v.band ? shortBand(v.band) : '-'}
                </td>
                <td className="px-1.5 py-1 text-right">
                  {v.lead == null ? '-' : v.lead.toFixed(1)}
                </td>
                <td className="text-muted-foreground px-1.5 py-1 whitespace-nowrap">
                  {v.called ? 'called' : 'leading'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function SeatsSection({
  chambers,
  states,
  tipping,
  swing,
}: {
  chambers: ChamberSummary[]
  states: StateView[]
  tipping: Tipping | null
  swing: SwingSummary
}) {
  const rows = chambers.flatMap((c) => {
    const decided = c.up - c.open.length
    return [DEM, GOP].map((k) => {
      const upLed = c.led[k] || 0
      return {
        key: `${c.key}-${k}`,
        chamber: c,
        party: k,
        share: c.share[k] || 0,
        seats: upLed,
        seatShare: decided ? (100 * upLed) / decided : 0,
      }
    })
  })
  const plotted = states.filter(
    (s) => s.voteShare != null && s.seatShare != null && s.seats >= 2,
  )
  const named = [...plotted]
    .filter((s) => s.seats >= 4)
    .sort(
      (a, b) =>
        Math.abs((b.seatShare as number) - (b.voteShare as number)) -
        Math.abs((a.seatShare as number) - (a.voteShare as number)),
    )
    .slice(0, 5)
  const ticks = [0, 25, 50, 75, 100]
  const house = chambers.find((c) => c.key === 'house')
  return (
    <Section
      id="seats"
      title="Seats against votes"
      sub="share of each, in the races held this year"
    >
      <Dumbbell
        rows={rows.map((r) => ({
          label: `${chamberWord(r.chamber.key)} ${letter(r.party)}`,
          color: partyColor(r.party),
          a: r.share,
          b: r.seatShare,
          describe: () => ({
            title: `${r.chamber.label}: ${the(r.party)}`,
            lines: [
              { label: 'Vote share', value: pct1(r.share) },
              {
                label: 'Seats up this year',
                value: `${fmt(r.seats)} (${pct1(r.seatShare)})`,
              },
            ],
          }),
        }))}
        aLabel="Vote share"
        bLabel="Seat share"
        xFormat={(v) => `${v}%`}
        ariaLabel="Each party's share of the vote against its share of the seats, by chamber"
      />
      {plotted.length >= 3 ? (
        <>
          <h3 className="text-sm font-semibold">
            By state{' '}
            <span className="text-muted-foreground font-normal">
              Democratic share of the House vote and of the seats
            </span>
          </h3>
          <Legend
            items={[
              { label: 'Democrats lead most seats', color: partyColor(DEM) },
              { label: 'Republicans lead most seats', color: partyColor(GOP) },
              {
                label: 'Seats match votes',
                color: 'var(--muted-foreground)',
                line: true,
              },
            ]}
          />
          <Scatter
            points={plotted.map((s) => ({
              key: s.key,
              x: s.voteShare as number,
              y: s.seatShare as number,
              color:
                (s.led[DEM] || 0) === (s.led[GOP] || 0)
                  ? 'var(--muted-foreground)'
                  : partyColor(
                      (s.led[DEM] || 0) > (s.led[GOP] || 0) ? DEM : GOP,
                    ),
              describe: () => ({
                title: s.label,
                lines: [
                  {
                    label: 'Democratic share of the two-party vote',
                    value: pct1(s.voteShare),
                  },
                  {
                    label: 'Seats',
                    value: `${fmt(s.led[DEM] || 0)} D, ${fmt(s.led[GOP] || 0)} R`,
                  },
                  ...(s.alone
                    ? [
                        {
                          label: 'One party sat out',
                          value: `${fmt(s.alone)} of ${fmt(s.seats)} districts`,
                        },
                      ]
                    : []),
                  ...(s.redrawn
                    ? [{ label: 'Map', value: 'redrawn for 2026' }]
                    : []),
                ],
              }),
            }))}
            fit={{ a: 0, b: 1 }}
            rule={{ y: 50 }}
            xDomain={[0, 100]}
            yDomain={[-10, 110]}
            xTicks={ticks}
            yTicks={ticks}
            xFormat={(v) => `${v}%`}
            yFormat={(v) => `${v}%`}
            xLabel="Democratic share of the two-party House vote"
            yLabel="Democratic share of the seats"
            labels={named.map((s) => ({ key: s.key, text: s.label }))}
            height={360}
            ariaLabel="Each state's Democratic share of the House vote against its share of the seats"
          />
          <Note>
            States with one House seat are left off. A dot above the diagonal
            gave the Democrats more seats than votes; below it, fewer.
          </Note>
        </>
      ) : null}
      {tipping && house && swing.national != null ? (
        <Note>
          Put the {the(tipping.party)}&apos; House seats in order of margin and
          the one that makes {fmt(house.majority || 0)} is {tipping.seat.name},
          won by {tipping.margin.toFixed(1)} points, with {fmt(tipping.spare)}{' '}
          more beyond it. The national House vote is {leadText(swing.national)}
          {house.alone.length
            ? `, a lead that the ${fmt(house.alone.length)} districts one big party sat out push wider`
            : ''}
          .
        </Note>
      ) : null}
    </Section>
  )
}

function SplitSection({ splits }: { splits: Split[] }) {
  if (splits.length < 3) return null
  const domain = domainOf(
    splits.flatMap((s) => [
      s.senate.margin as number,
      s.governor.margin as number,
    ]),
    20,
  )
  const ticks = ticksOf(domain, 20)
  const crossed = splits.filter((s) => s.crossed)
  const named = [...new Set([...crossed, ...splits.slice(0, 4)])].slice(0, 6)
  return (
    <Section
      id="split"
      title="Split tickets"
      sub="the Senate race against the governor's in the same state"
    >
      <Legend
        items={[
          { label: 'Same party leads both', color: 'var(--series-1)' },
          { label: 'A different party leads each', color: 'var(--series-3)' },
          {
            label: 'Same margin',
            color: 'var(--muted-foreground)',
            line: true,
          },
        ]}
      />
      <Scatter
        points={splits.map((s) => ({
          key: s.key,
          x: s.governor.margin as number,
          y: s.senate.margin as number,
          color: s.crossed ? 'var(--series-3)' : 'var(--series-1)',
          describe: () => ({
            title: s.label,
            lines: [
              {
                label: 'Senate',
                value: leadText(s.senate.margin as number),
                color: partyColor(s.senate.leader),
              },
              {
                label: 'Governor',
                value: leadText(s.governor.margin as number),
                color: partyColor(s.governor.leader),
              },
              {
                label: 'Gap',
                value: `${Math.abs(s.gap).toFixed(1)} pts, the ${s.gap >= 0 ? 'Senate' : "governor's"} race better for the Democrats`,
              },
            ],
          }),
        }))}
        fit={{ a: 0, b: 1 }}
        rule={{ y: 0 }}
        xDomain={domain}
        yDomain={domain}
        xTicks={ticks}
        yTicks={ticks}
        xFormat={leadTick}
        yFormat={leadTick}
        xLabel={`Governor margin (${SIGNS})`}
        yLabel={`Senate margin (${SIGNS})`}
        labels={named.map((s) => ({ key: s.key, text: s.label }))}
        height={360}
        ariaLabel="Each state's Senate margin against its governor's margin"
      />
      <Note>
        The {fmt(splits.length)} states that voted for both and where both big
        parties ran in each. On the diagonal the two races came out the same;
        the further off it, the more voters split their ticket.
      </Note>
      <DataTable
        heads={['State', 'Senate', 'Governor', 'Gap']}
        rows={splits.map((s) => [
          s.label,
          leadText(s.senate.margin as number),
          leadText(s.governor.margin as number),
          Math.abs(s.gap).toFixed(1),
        ])}
      />
    </Section>
  )
}

function EarlySection({ early }: { early: EarlyPattern | null }) {
  if (!early || early.points.length < 3) return null
  const xDomain = domainOf(
    early.points.map((p) => p.early),
    20,
  )
  const yDomain = domainOf(
    early.points.map((p) => p.result),
    20,
  )
  const named = [...early.points]
    .sort((a, b) => Math.abs(b.result - b.early) - Math.abs(a.result - a.early))
    .slice(0, 5)
  return (
    <Section
      id="early"
      title="The early vote against the result"
      sub={early.fit ? `r = ${early.fit.r.toFixed(2)}` : undefined}
    >
      <Legend
        items={[
          { label: 'Democrats lead the House vote', color: partyColor(DEM) },
          { label: 'Republicans lead the House vote', color: partyColor(GOP) },
          { label: 'Fit', color: 'var(--muted-foreground)', line: true },
        ]}
      />
      <Scatter
        points={early.points.map((p) => ({
          key: p.key,
          x: p.early,
          y: p.result,
          color: partyColor(p.result >= 0 ? DEM : GOP),
          describe: () => ({
            title: p.label,
            lines: [
              {
                label: 'Early voters by registration',
                value: leadText(p.early),
              },
              { label: 'House vote', value: leadText(p.result) },
            ],
          }),
        }))}
        fit={early.fit}
        rule={{ y: 0 }}
        xDomain={xDomain}
        yDomain={yDomain}
        xTicks={ticksOf(xDomain, 20)}
        yTicks={ticksOf(yDomain, 20)}
        xFormat={leadTick}
        yFormat={leadTick}
        xLabel={`Early voters by party registration (${SIGNS})`}
        yLabel={`House vote margin (${SIGNS})`}
        labels={named.map((p) => ({ key: p.key, text: p.label }))}
        height={360}
        ariaLabel="Each state's party lead among early voters against its House vote margin"
      />
      <Note>
        The {fmt(early.points.length)} states that register voters by party and
        report who voted early. Registration is not a vote: unaffiliated voters
        are left out of the early lead, and a registered voter can vote either
        way. The line is the least-squares fit.
      </Note>
    </Section>
  )
}

const DAY = 24 * 3600e3
/** Midnights across a span, at most about eight of them. */
function dayTicks(start: number, end: number): number[] {
  const days = Math.max(1, Math.ceil((end - start) / DAY))
  const step = Math.max(1, Math.ceil(days / 8)) * DAY
  const out: number[] = []
  for (let t = Math.ceil(start / DAY) * DAY; t <= end; t += step) out.push(t)
  return out
}
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const dayTick = (ms: number) => {
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function CountSection({ moves }: { moves: CountMoves | null }) {
  if (!moves) return null
  const values = [...moves.dem, ...moves.gop].filter((v) => v > 0)
  const lo = Math.floor(Math.min(50, ...values) / 4) * 4
  const hi = Math.ceil(Math.max(50, ...values) / 4) * 4
  const ticks = ticksOf([lo, hi], 4)
  const start = moves.xs[0]
  const end = moves.xs[moves.xs.length - 1]
  const lines = [
    {
      label: 'Democrats',
      short: 'Dem',
      color: partyColor(DEM),
      values: moves.dem,
    },
    {
      label: 'Republicans',
      short: 'GOP',
      color: partyColor(GOP),
      values: moves.gop,
    },
  ]
  return (
    <Section
      id="count"
      title="How the count moved"
      sub="share of the House vote counted so far"
    >
      <Legend
        items={lines.map((l) => ({
          label: l.label,
          color: l.color,
          line: true,
        }))}
      />
      <Lines
        points={moves.xs}
        xMin={start}
        xMax={end}
        xTicks={dayTicks(start, end)}
        xFormat={dayTick}
        yMin={ticks[0]}
        yTicks={ticks}
        yFormat={(v) => `${Math.round(v)}%`}
        valueFormat={(v) => pct1(v)}
        rules={[{ y: 50 }]}
        height={300}
        lines={lines}
        title={(i) =>
          `${wallClock(moves.rows[i].payload.asOf)} · ${fmt(moves.rows[i].payload.polls.closed)} races called`
        }
        ariaLabel="Each party's share of the House vote over the count"
      />
      {moves.milestones.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {moves.milestones.map((m) => (
            <li key={m.chamber}>
              <b className="font-semibold">{chamberWord(m.chamber)}:</b> the{' '}
              {the(m.party)} first led {fmt(m.majority)} seats
              {m.led ? ` at ${wallClock(m.led)}` : ''}
              {m.called
                ? ` and had them called at ${wallClock(m.called)}`
                : ', not yet all called'}
              , Eastern time
              {m.chamber === 'house' ? '' : ', counting the seats not up'}.
            </li>
          ))}
        </ul>
      ) : null}
      <Note>
        The seat timelines are on the Results tab; this is the vote behind them.
        States that count mail ballots for days after the election moved the
        national share after the majority was settled.
      </Note>
      <div className="overflow-x-auto">
        <table className="nums w-full max-w-md text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">Day</th>
              <th className="px-1.5 py-1 text-right font-medium">
                Races called that day
              </th>
              <th className="px-1.5 py-1 text-right font-medium">In all</th>
            </tr>
          </thead>
          <tbody>
            {moves.days
              .filter((d) => d.added)
              .map((d) => (
                <tr key={d.day} className="border-t">
                  <td className="py-1 pr-2">{dayShort(d.day)}</td>
                  <td className="px-1.5 py-1 text-right">
                    {signedInt(d.added)}
                  </td>
                  <td className="px-1.5 py-1 text-right">{fmt(d.called)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

type SortKey = 'name' | 'rating' | 'lead' | 'swing'

function RacesSection({
  election,
  views,
}: {
  election: ChambersElection
  views: RaceView[]
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: 'lead',
    dir: 1,
  })
  const [q, setQ] = useState('')
  const [chamber, setChamber] = useState('all')
  const regionLabel = new Map(election.regions.map((r) => [r.key, r.label]))
  const order = new Map(views.map((v, i) => [v.id, i]))
  const valueOf = (v: RaceView, key: SortKey): number =>
    key === 'name'
      ? (order.get(v.id) as number)
      : key === 'rating'
        ? v.band
          ? BANDS.indexOf(v.band)
          : 99
        : key === 'lead'
          ? (v.lead ?? 999)
          : (v.swing ?? -999)
  const needle = q.trim().toLowerCase()
  const rows = views
    .filter((v) => chamber === 'all' || v.chamber === chamber)
    .filter(
      (v) =>
        !needle ||
        `${v.name} ${regionLabel.get(v.state) || ''} ${v.leaderName || ''}`
          .toLowerCase()
          .includes(needle),
    )
    .sort(
      (a, b) =>
        (valueOf(a, sort.key) - valueOf(b, sort.key)) * sort.dir ||
        (order.get(a.id) as number) - (order.get(b.id) as number),
    )
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
                : { key, dir: key === 'swing' ? -1 : 1 },
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
    <Section id="races" title="Every race" sub={`${fmt(views.length)} races`}>
      <Note>
        The lead is the leader over the runner-up, in points. Swing is in points
        toward the party whose swatch it carries, against the district&apos;s
        2024 House race or, for a Senate or governor&apos;s race, the
        state&apos;s 2024 presidential vote. Click a heading to sort; it opens
        on the closest races.
      </Note>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a race, state or winner"
          aria-label="Find a race, state or winner"
          className="max-w-sm"
        />
        <Select value={chamber} onValueChange={setChamber}>
          <SelectTrigger className="w-40" aria-label="Races shown">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All races</SelectItem>
            {election.chambers.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {chamberWord(c.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="max-h-[32rem] overflow-auto rounded-md border">
        <table className="nums w-full text-sm">
          <thead className="bg-card text-muted-foreground sticky top-0 text-xs">
            <tr>
              {head('name', 'Race', true)}
              {head('rating', 'Rated', true)}
              <th className="px-1.5 py-1.5 text-left font-medium">Held</th>
              <th className="px-1.5 py-1.5 text-left font-medium">Now</th>
              <th className="px-1.5 py-1.5 text-left font-medium">Leader</th>
              {head('lead', 'Lead')}
              {head('swing', 'Swing')}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="px-1.5 py-1 whitespace-nowrap">{v.name}</td>
                <td className="text-muted-foreground px-1.5 py-1 whitespace-nowrap">
                  {v.band ? shortBand(v.band) : '-'}
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap">
                  {v.holder ? (
                    <PartyChip party={v.holder} label={letter(v.holder)} />
                  ) : (
                    <span className="text-muted-foreground">open</span>
                  )}
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap">
                  {v.leader ? (
                    <PartyChip party={v.leader} label={letter(v.leader)} />
                  ) : (
                    <span className="text-muted-foreground">
                      {v.pending ? 'runoff' : '-'}
                    </span>
                  )}
                </td>
                <td className="px-1.5 py-1 whitespace-nowrap">
                  {v.leaderName || '-'}
                  {v.leader && !v.called ? (
                    <span className="text-muted-foreground text-xs">
                      {' '}
                      not called
                    </span>
                  ) : null}
                </td>
                <td className="px-1.5 py-1 text-right">
                  {v.lead == null ? '-' : v.lead.toFixed(1)}
                </td>
                <td
                  className="px-1.5 py-1 text-right whitespace-nowrap"
                  title={v.swing == null ? undefined : swingText(v.swing)}
                >
                  {v.swing == null ? (
                    '-'
                  ) : Math.abs(v.swing) < 0.05 ? (
                    '0.0'
                  ) : (
                    <>
                      <Swatch party={v.swing > 0 ? DEM : GOP} />{' '}
                      {Math.abs(v.swing).toFixed(1)}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function NotesSection({
  election,
  chambers,
  views,
}: {
  election: ChambersElection
  chambers: ChamberSummary[]
  views: RaceView[]
}) {
  const open = views.filter((v) => !v.called)
  const alone = chambers.flatMap((c) => c.alone)
  const ratings = election.chambers.flatMap((c) =>
    c.ratings ? [c.ratings] : [],
  )
  return (
    <Section id="notes" title="Notes and sources">
      <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          2026: civicAPI&apos;s unofficial counts and race calls, as on the
          Results tab. States certify over the following weeks, so margins can
          still move a little. A race counts for its leader here whether or not
          it is called; the Results tab keeps the two apart.
        </li>
        <li>
          2024: the Clerk of the House&apos;s Statistics of the Presidential and
          Congressional Election of November 5, 2024, the official record. A
          House district is set against its own 2024 race only in the forty
          states that kept their maps, and only where both big parties ran both
          times; a Senate or governor&apos;s race is set against the
          state&apos;s 2024 presidential vote.
        </li>
        <li>
          A margin is the Democratic share less the Republican share of every
          vote in the race, and a swing is the change in it. Where one of the
          two did not run there is no margin, only the leader&apos;s lead over
          the runner-up.
        </li>
        {ratings.length ? (
          <li>
            Ratings: {ratings[0].label}, the last ones before the election (
            {dayShort(ratings[0].asOf)}).
          </li>
        ) : null}
        {alone.length ? (
          <li>
            One of the two big parties sat out {fmt(alone.length)} races:{' '}
            {listOf(alone.map((v) => v.name))}.
          </li>
        ) : null}
        {open.length ? (
          <li>
            Not called yet:{' '}
            {listOf(open.map((v) => `${v.name} (${resultText(v)})`))}.
          </li>
        ) : null}
        <li>
          Close means within {CLOSE} points. The early vote is the UF Election
          Lab&apos;s count of ballots cast before election day.
        </li>
      </ul>
    </Section>
  )
}
