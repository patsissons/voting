// The Alberta 2026 analysis: what the division and over-time numbers show
// beyond the count itself. Bespoke to this referendum (ten questions, Question
// 10 the separation question, Calgary and Edmonton by division name).
import { useMemo, useState } from 'react'
import { DataTable, Note, Section } from '@/components/bits'
import { Legend } from '@/components/charts/legend'
import { Lines } from '@/components/charts/lines'
import { useMeasure } from '@/components/charts/use-measure'
import { RangeDots } from '@/components/charts/range-dots'
import { Scatter } from '@/components/charts/scatter'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { seriesColor } from '@/lib/party'
import { fmt, pct1, wallClock } from '../../../../shared/format.ts'
import type { Payload } from '../../../../shared/payload.ts'
import type {
  ReferendumElection,
  ReferendumQuestion,
} from '../../../../shared/schema/election.ts'
import {
  contestOf,
  tally,
  votesSeries,
  type RegionKey,
} from '../../../../shared/stats/referendum.ts'
import { Tile } from '../../results/results-header'
import { SectionNav } from '../../results/results-view'
import type { AnalysisProps } from '..'
import { findings, listOf } from './findings'
import {
  countNotes,
  divisionsOf,
  fitsAgainstSeparation,
  flips,
  pollGaps,
  projections,
  regionShares,
  SEPARATION,
  shareOverTime,
  type DivisionView,
} from './stats'

const SECTIONS = [
  { id: 'findings', label: 'Findings' },
  { id: 'polls', label: 'Polls' },
  { id: 'axis', label: 'One axis' },
  { id: 'regions', label: 'Regions' },
  { id: 'flips', label: 'Flips' },
  { id: 'count', label: 'Count' },
  { id: 'divisions', label: 'Divisions' },
  { id: 'notes', label: 'Notes' },
]

const GROUPS: { key: RegionKey; label: string; color: string }[] = [
  { key: 'calgary', label: 'Calgary', color: 'var(--series-1)' },
  { key: 'edmonton', label: 'Edmonton', color: 'var(--series-2)' },
  { key: 'rest', label: 'Rest of Alberta', color: 'var(--series-3)' },
]
const groupColor = (key: RegionKey) =>
  (GROUPS.find((g) => g.key === key) || GROUPS[2]).color

const LINE_SETS = [
  { key: 'constitution', label: 'Constitution (Q6 to Q9)', ns: [6, 7, 8, 9] },
  {
    key: 'immigration',
    label: 'Immigration and voter ID (Q1 to Q5)',
    ns: [1, 2, 3, 4, 5],
  },
  { key: 'separation', label: 'Separation (Q10 Remain)', ns: [SEPARATION] },
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** A wall-clock x value as "Tue 6 pm", or just "Wed" at midnight (the night runs over several days). */
const dayHour = (ms: number) => {
  const d = new Date(ms)
  const h = d.getUTCHours()
  const day = DAYS[d.getUTCDay()]
  return h ? `${day} ${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}` : day
}
/** Ticks on whole hours across a span: every 6 or 12 hours, or only midnights on a narrow chart. */
const hourTicks = (start: number, end: number, narrow: boolean) => {
  const hours = narrow ? 24 : end - start > 36 * 3600e3 ? 12 : 6
  const step = hours * 3600e3
  const out: number[] = []
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) out.push(t)
  return out
}
/** Share ticks with 50 on one of them, covering every value. */
const shareTicks = (values: number[]) => {
  const lo = Math.min(50, ...values)
  const hi = Math.max(50, ...values)
  const step = hi - lo > 24 ? 10 : 4
  const ticks: number[] = []
  for (
    let v = 50 - Math.ceil((50 - lo) / step) * step;
    v < hi + step;
    v += step
  )
    ticks.push(v)
  return ticks
}
/** One row per 10 minutes, for the tables behind long series. */
const thin = (stamps: string[]) =>
  stamps.flatMap((s, i) =>
    i === stamps.length - 1 || s.slice(0, 15) !== stamps[i + 1].slice(0, 15)
      ? [i]
      : [],
  )

/** A cell takes the colour of the option leading there, deeper with a wider lead. */
function shade(n: number, v: number | null | undefined): string | undefined {
  if (v == null) return undefined
  const optionOne = n === SEPARATION ? v < 50 : v >= 50
  const depth = Math.round(Math.min(1, Math.abs(v - 50) / 30) * 50)
  return `color-mix(in oklab, var(${optionOne ? '--ref-a' : '--ref-b'}) ${depth}%, var(--muted))`
}

/** Points with no sign, where the words already say which way. */
const ptsText = (v: number) => `${Math.abs(v).toFixed(1)} pts`
/** A signed gap as "3.2 pts above" or "1.0 pts below". */
const sideOf = (v: number) =>
  Math.abs(v) < 0.05 ? 'level' : `${ptsText(v)} ${v > 0 ? 'above' : 'below'}`

const shareText = (v: number | null | undefined) =>
  v == null ? '-' : v.toFixed(1)

export default function AlbertaAnalysis({
  election,
  snapshots,
}: AnalysisProps) {
  if (election.ballot !== 'referendum') return null
  return <Analysis election={election} snapshots={snapshots} />
}

function Analysis({
  election,
  snapshots,
}: {
  election: ReferendumElection
  snapshots: AnalysisProps['snapshots']
}) {
  const latest = snapshots.length
    ? snapshots[snapshots.length - 1].payload
    : null
  const data = useMemo(() => {
    const divs = divisionsOf(latest, election)
    const fits = fitsAgainstSeparation(divs, election)
    const regions = regionShares(divs, election, latest)
    const gaps = pollGaps(latest, election)
    const constitution = shareOverTime(snapshots, election, [6, 7, 8, 9])
    const flipped = flips(constitution)
    return {
      divs,
      fits,
      regions,
      gaps,
      flipped,
      projected: projections(divs, [6, 7, 8, 9]),
      notes: countNotes(snapshots, election, divs),
      findings: findings({
        election,
        latest,
        divs,
        fits,
        regions,
        gaps,
        flipped,
      }),
    }
  }, [latest, snapshots, election])
  const Q = election.questions
  const colorOfQ = (q: ReferendumQuestion) => seriesColor(Q.indexOf(q))

  if (!latest || !data.divs.length)
    return (
      <Note>
        The analysis needs the count by division, which arrives with the first
        results.
      </Note>
    )
  const sep = Q.find((q) => q.n === SEPARATION)
  const sepTally = sep ? tally(contestOf(latest, sep)) : null
  const others = Q.filter((q) => q.n !== SEPARATION)
  const passing = others.filter(
    (q) => tally(contestOf(latest, q)).shares[0] > 50,
  )
  const closest = others
    .map((q) => ({ q, t: tally(contestOf(latest, q)) }))
    .filter((x) => x.t.started)
    .sort(
      (a, b) => Math.abs(a.t.shares[0] - 50) - Math.abs(b.t.shares[0] - 50),
    )[0]

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Patterns in the {latest.official ? 'official' : 'unofficial'} count as
        of {wallClock(latest.asOf)}, with {fmt(latest.polls.closed)} of{' '}
        {fmt(latest.polls.total)} polls reported. Hover or focus any mark for
        its numbers.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sep && sepTally ? (
          <Tile
            label={`Q${sep.n} ${sep.options[0].t}`}
            value={pct1(sepTally.shares[0])}
            sub={`${fmt(sepTally.votes[0])} to ${fmt(sepTally.votes[1])}`}
          />
        ) : null}
        {sepTally ? (
          <Tile
            label={`Ballots counted (Q${SEPARATION})`}
            value={fmt(sepTally.total)}
          />
        ) : null}
        <Tile
          label={`Questions 1 to ${others.length} passing`}
          value={`${passing.length} of ${others.length}`}
        />
        {closest ? (
          <Tile
            label={`Closest: Q${closest.q.n} ${closest.q.topic}`}
            value={pct1(closest.t.shares[0])}
            sub={closest.q.options[0].t}
          />
        ) : null}
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

      <PollsSection gaps={data.gaps} />
      <AxisSection election={election} divs={data.divs} fits={data.fits} />
      <RegionsSection election={election} regions={data.regions} />
      <FlipsSection
        election={election}
        snapshots={snapshots}
        colorOfQ={colorOfQ}
      />
      <CountSection
        election={election}
        snapshots={snapshots}
        colorOfQ={colorOfQ}
        projected={data.projected}
      />
      <DivisionsSection election={election} divs={data.divs} />
      <NotesSection notes={data.notes} latest={latest} />
    </div>
  )
}

function PollsSection({ gaps }: { gaps: ReturnType<typeof pollGaps> }) {
  if (!gaps.length) return null
  const order = [...gaps].sort(
    (a, b) =>
      Number(b.q.n === SEPARATION) - Number(a.q.n === SEPARATION) ||
      a.q.n - b.q.n,
  )
  return (
    <Section id="polls" title="Results against the polls" sub="option 1 share">
      <Legend
        items={[
          { label: 'Result', color: 'var(--ref-a)' },
          {
            label: 'Poll range, tick at the latest',
            color: 'var(--ref-b)',
            line: true,
          },
        ]}
      />
      <RangeDots
        rows={order.map((g) => ({
          label: `Q${g.q.n} ${g.q.topic}`,
          value: g.value,
          range: g.range,
          describe: () => ({
            title: `Q${g.q.n} ${g.q.topic}`,
            lines: [
              {
                label: `Result, ${g.q.options[0].t}`,
                value: pct1(g.value),
                color: 'var(--ref-a)',
              },
              ...g.q.polls.map((p) => ({
                label: `${p.by} (${p.date})`,
                value: p.pct[0] == null ? '-' : `${p.pct[0]}%`,
                color: 'var(--ref-b)',
              })),
              ...(g.range
                ? [
                    {
                      label: 'Against the latest poll',
                      value: sideOf(g.value - g.range.latest),
                    },
                  ]
                : []),
            ],
          }),
        }))}
        xDomain={[30, 80]}
        xTicks={[30, 40, 50, 60, 70, 80]}
        xFormat={(v) => `${v}%`}
        valueFormat={(v) => pct1(v)}
        rule={50}
        dotColor="var(--ref-a)"
        rangeColor="var(--ref-b)"
        ariaLabel="Each question's result against the range of its published polls"
      />
      <Note>
        Poll figures are option 1 as a share of every respondent, so undecided
        respondents sit outside them. Question {SEPARATION} shows{' '}
        {order[0].q.options[0].t}.
      </Note>
    </Section>
  )
}

function AxisSection({
  election,
  divs,
  fits,
}: {
  election: ReferendumElection
  divs: DivisionView[]
  fits: ReturnType<typeof fitsAgainstSeparation>
}) {
  const [pickN, setPickN] = useState(fits.length ? fits[0].n : 0)
  const qf = fits.find((f) => f.n === pickN) || fits[0]
  if (!qf) return null
  const q = election.questions.find((x) => x.n === qf.n)!
  const sep = election.questions.find((x) => x.n === SEPARATION)!
  const pts = divs.filter((d) => d.y[q.n] != null && d.y[SEPARATION] != null)
  const above = qf.residuals.slice(0, 3)
  const below = qf.residuals.slice(-3).reverse()
  return (
    <Section
      id="axis"
      title="One axis explains every answer"
      sub={`r = ${qf.fit.r.toFixed(3)}`}
    >
      <Note>
        Each dot is an electoral division. Across divisions, the Yes share on
        every question moves almost point for point with the {sep.options[1].t}{' '}
        share on Question {SEPARATION}.
      </Note>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Question</span>
        <Select value={String(q.n)} onValueChange={(v) => setPickN(Number(v))}>
          <SelectTrigger className="w-64" aria-label="Scatter question">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fits.map((f) => {
              const x = election.questions.find((y) => y.n === f.n)!
              return (
                <SelectItem key={f.n} value={String(f.n)}>
                  Q{x.n} {x.topic}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </label>
      <Legend
        items={[
          ...GROUPS.map((g) => ({ label: g.label, color: g.color })),
          {
            label: 'Fitted line',
            color: 'var(--muted-foreground)',
            line: true,
          },
        ]}
      />
      <Scatter
        points={pts.map((d) => ({
          key: d.code,
          x: d.y[SEPARATION] as number,
          y: d.y[q.n] as number,
          color: groupColor(d.group),
          describe: () => {
            const e =
              (d.y[q.n] as number) -
              (qf.fit.a + qf.fit.b * (d.y[SEPARATION] as number))
            return {
              title: d.name,
              lines: [
                {
                  label: `Q${SEPARATION} ${sep.options[1].t}`,
                  value: pct1(d.y[SEPARATION]),
                },
                { label: `Q${q.n} ${q.options[0].t}`, value: pct1(d.y[q.n]) },
                { label: 'Against the line', value: sideOf(e) },
                ...(d.complete || !d.polls
                  ? []
                  : [
                      {
                        label: 'Polls reported',
                        value: `${d.polls[0]} of ${d.polls[1] ?? '?'}`,
                      },
                    ]),
              ],
            }
          },
        }))}
        fit={qf.fit}
        rule={{ y: 50 }}
        xDomain={[0, 60]}
        yDomain={[10, 90]}
        xTicks={[0, 10, 20, 30, 40, 50, 60]}
        yTicks={[10, 30, 50, 70, 90]}
        xFormat={(v) => `${v}%`}
        yFormat={(v) => `${v}%`}
        xLabel={`Q${SEPARATION} ${sep.options[1].t} share`}
        yLabel={`Q${q.n} ${q.options[0].t} share`}
        labels={[...above, ...below].map((r) => ({
          key: r.d.code,
          text: r.d.name,
        }))}
        ariaLabel={`Question ${q.n} against Question ${SEPARATION} by division`}
      />
      <Note>
        Q{q.n} {q.options[0].t} = {qf.fit.a.toFixed(1)} + {qf.fit.b.toFixed(2)}{' '}
        × {sep.options[1].t}. Furthest above the line:{' '}
        {listOf(above.map((r) => `${r.d.name} (${ptsText(r.e)})`))}. Furthest
        below: {listOf(below.map((r) => `${r.d.name} (${ptsText(r.e)})`))}.
      </Note>
    </Section>
  )
}

function RegionsSection({
  election,
  regions,
}: {
  election: ReferendumElection
  regions: ReturnType<typeof regionShares>
}) {
  const Q = [...election.questions].sort((a, b) => a.n - b.n)
  const cell = (n: number, v: number | null | undefined, strong = false) => (
    <td
      key={n}
      className="rounded px-1.5 py-1 text-right"
      style={{ background: shade(n, v) }}
    >
      {strong ? <b>{shareText(v)}</b> : shareText(v)}
    </td>
  )
  return (
    <Section id="regions" title="By region" sub="vote-weighted share">
      <Note>
        Option 1 share per question (Begin process on Question {SEPARATION}).
        Calgary and Edmonton are every division by name; the 15 smaller-city and
        commuter-belt divisions are picked by hand, and the rest are rural. A
        cell takes the colour of the option leading there, deeper with a wider
        lead.
      </Note>
      <div className="overflow-x-auto">
        <table className="nums w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="py-1 pr-2 text-left font-medium">Region</th>
              <th className="px-1.5 py-1 text-right font-medium">Divisions</th>
              {Q.map((q) => (
                <th
                  key={q.n}
                  className="px-1.5 py-1 text-right font-medium"
                  title={q.topic}
                >
                  Q{q.n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="py-1 pr-2">{r.label}</td>
                <td className="px-1.5 py-1 text-right">{r.n}</td>
                {Q.map((q) => cell(q.n, r.shares[q.n]))}
              </tr>
            ))}
            <tr className="border-t font-semibold">
              <td className="py-1 pr-2">Alberta</td>
              <td className="px-1.5 py-1 text-right">
                {regions.rows.reduce((s, r) => s + r.n, 0)}
              </td>
              {Q.map((q) => cell(q.n, regions.province[q.n], true))}
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function FlipsSection({
  election,
  snapshots,
  colorOfQ,
}: {
  election: ReferendumElection
  snapshots: AnalysisProps['snapshots']
  colorOfQ: (q: ReferendumQuestion) => string
}) {
  const [setKey, setSetKey] = useState(LINE_SETS[0].key)
  const { ref, width } = useMeasure()
  const set = LINE_SETS.find((s) => s.key === setKey) || LINE_SETS[0]
  const data = useMemo(
    () => shareOverTime(snapshots, election, set.ns),
    [snapshots, election, set],
  )
  if (!data || !data.series.length) return null
  const values = data.series.flatMap((s) =>
    s.values.filter((v): v is number => v != null),
  )
  const ticks = shareTicks(values)
  const start = data.xs[0]
  const end = data.xs[data.xs.length - 1]
  const lines = data.series.map((s) => ({
    label: `Q${s.q.n} ${s.q.topic}`,
    short: `Q${s.q.n}`,
    color: colorOfQ(s.q),
    values: s.values,
  }))
  const keep = thin(data.rows.map((r) => r.payload.asOf))
  return (
    <Section
      id="flips"
      title="Early leads that flipped"
      sub="option 1 share over time"
    >
      <Note>
        Ballots were counted by hand one question at a time, Question{' '}
        {SEPARATION} first. Small rural polls got through every ballot quickly
        while large urban polls were still on the early questions, so the later
        questions opened with rural-heavy leads that slid as the city ballots
        came in.
      </Note>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Show</span>
        <Select value={set.key} onValueChange={setSetKey}>
          <SelectTrigger className="w-72" aria-label="Questions over time">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LINE_SETS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <Legend
        items={lines.map((l) => ({
          label: l.label,
          color: l.color,
          line: true,
        }))}
      />
      <div ref={ref}>
        <Lines
          points={data.xs}
          xMin={start}
          xMax={end}
          xTicks={hourTicks(start, end, width < 560)}
          xFormat={dayHour}
          yMin={ticks[0]}
          yTicks={ticks}
          yFormat={(v) => `${Math.round(v)}%`}
          valueFormat={(v) => pct1(v)}
          rules={[{ y: 50 }]}
          padRight={lines.length > 4 ? 14 : 92}
          height={300}
          lines={lines}
          title={(i) =>
            `${wallClock(data.rows[i].payload.asOf)} · ${fmt(data.rows[i].payload.polls.closed)} polls reported`
          }
          ariaLabel="Option 1 share of each question over the count"
        />
      </div>
      <DataTable
        summary="Table (one row per 10 minutes)"
        heads={['As of', ...data.series.map((s) => `Q${s.q.n}`)]}
        rows={keep.map((i) => [
          wallClock(data.rows[i].payload.asOf),
          ...data.series.map((s) => shareText(s.values[i])),
        ])}
      />
    </Section>
  )
}

function CountSection({
  election,
  snapshots,
  colorOfQ,
  projected,
}: {
  election: ReferendumElection
  snapshots: AnalysisProps['snapshots']
  colorOfQ: (q: ReferendumQuestion) => string
  projected: ReturnType<typeof projections>
}) {
  const { ref, width } = useMeasure()
  const data = useMemo(
    () => votesSeries(snapshots, election),
    [snapshots, election],
  )
  if (!data) return null
  const pick = [SEPARATION, 1, 7, 9]
  const series = pick.flatMap((n) => data.series.filter((s) => s.q.n === n))
  if (!series.length) return null
  const start = data.xs[0]
  const end = data.xs[data.xs.length - 1]
  const lines = series.map((s) => ({
    label: `Q${s.q.n} ${s.q.topic}`,
    short: `Q${s.q.n}`,
    color: colorOfQ(s.q),
    values: s.values,
  }))
  const moving = projected.filter((p) => p.added >= 1000)
  const keep = thin(data.rows.map((r) => r.payload.asOf))
  return (
    <Section
      id="count"
      title="How far each question's count got"
      sub="ballots counted"
    >
      <Legend
        items={lines.map((l) => ({
          label: l.label,
          color: l.color,
          line: true,
        }))}
      />
      <div ref={ref}>
        <Lines
          points={data.xs}
          xMin={start}
          xMax={end}
          xTicks={hourTicks(start, end, width < 560)}
          xFormat={dayHour}
          yFormat={(v) =>
            v >= 1e6
              ? `${(v / 1e6).toFixed(1)}M`
              : v >= 1e3
                ? `${Math.round(v / 1e3)}k`
                : String(v)
          }
          valueFormat={(v) => fmt(v)}
          height={260}
          lines={lines}
          title={(i) =>
            `${wallClock(data.rows[i].payload.asOf)} · ${fmt(data.rows[i].payload.polls.closed)} polls reported`
          }
          ariaLabel="Ballots counted for four questions over the count"
        />
      </div>
      <Note>
        The later questions trail Question {SEPARATION} because they were still
        being counted, not because voters skipped them.
        {moving.length
          ? ` If the uncounted ballots split like each division's counted ones: ${moving
              .map(
                (p) => `Q${p.n} ${pct1(p.now)} to about ${pct1(p.projected)}`,
              )
              .join(
                ', ',
              )}. The late ballots have leaned No within divisions, so the real finish is probably lower still.`
          : ''}
      </Note>
      <DataTable
        summary="Table (one row per 10 minutes)"
        heads={['As of', ...series.map((s) => `Q${s.q.n}`)]}
        rows={keep.map((i) => [
          wallClock(data.rows[i].payload.asOf),
          ...series.map((s) =>
            s.values[i] == null ? '-' : fmt(s.values[i] as number),
          ),
        ])}
      />
    </Section>
  )
}

type SortKey = 'name' | 'region' | 'polls' | 'ratio' | number

function DivisionsSection({
  election,
  divs,
}: {
  election: ReferendumElection
  divs: DivisionView[]
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: SEPARATION,
    dir: -1,
  })
  const [q, setQ] = useState('')
  const Q = [
    ...election.questions.filter((x) => x.n === SEPARATION),
    ...election.questions
      .filter((x) => x.n !== SEPARATION)
      .sort((a, b) => a.n - b.n),
  ]
  const last = Q[Q.length - 1]
  const regionLabel: Record<string, string> = {
    calgary: 'Calgary',
    edmonton: 'Edmonton',
    cities: 'Smaller cities',
    rural: 'Rural',
  }
  const ratio = (d: DivisionView) =>
    d.ballots[SEPARATION] && d.ballots[last.n] != null
      ? (d.ballots[last.n] / d.ballots[SEPARATION]) * 100
      : null
  const valueOf = (d: DivisionView, key: SortKey): string | number =>
    key === 'name'
      ? d.name
      : key === 'region'
        ? regionLabel[d.region]
        : key === 'polls'
          ? d.polls && d.polls[1]
            ? d.polls[0] / d.polls[1]
            : -1
          : key === 'ratio'
            ? (ratio(d) ?? -1)
            : (d.y[key] ?? -1)
  const needle = q.trim().toLowerCase()
  const rows = divs
    .filter(
      (d) =>
        !needle ||
        `${d.name} ${regionLabel[d.region]}`.toLowerCase().includes(needle),
    )
    .sort((a, b) => {
      const x = valueOf(a, sort.key)
      const y = valueOf(b, sort.key)
      const c =
        typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)
      return c * sort.dir || a.name.localeCompare(b.name)
    })
  const head = (key: SortKey, label: string, title?: string, left = false) => {
    const active = sort.key === key
    return (
      <th
        key={String(key)}
        aria-sort={
          active ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'
        }
        className={`px-1.5 py-1.5 font-medium ${left ? 'text-left' : 'text-right'}`}
        title={title}
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
    <Section
      id="divisions"
      title="Every division"
      sub={`${divs.length} divisions`}
    >
      <Note>
        Option 1 share per question (Begin process on Question {SEPARATION}). Q
        {last.n} counted is Question {last.n}&apos;s ballots as a share of
        Question {SEPARATION}&apos;s. Click a heading to sort.
      </Note>
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a division or region"
        aria-label="Find a division or region"
        className="max-w-sm"
      />
      <div className="max-h-[32rem] overflow-auto rounded-md border">
        <table className="nums w-full text-sm">
          <thead className="bg-card text-muted-foreground sticky top-0 text-xs">
            <tr>
              {head('name', 'Division', undefined, true)}
              {head('region', 'Region', undefined, true)}
              {head('polls', 'Polls')}
              {Q.map((x) =>
                head(
                  x.n,
                  x.n === SEPARATION ? `Q${x.n} ${x.options[1].t}` : `Q${x.n}`,
                  x.topic,
                ),
              )}
              {head('ratio', `Q${last.n} counted`)}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const r = ratio(d)
              return (
                <tr key={d.code} className="border-t">
                  <td className="px-1.5 py-1 whitespace-nowrap">{d.name}</td>
                  <td className="text-muted-foreground px-1.5 py-1 whitespace-nowrap">
                    {regionLabel[d.region]}
                  </td>
                  <td className="px-1.5 py-1 text-right whitespace-nowrap">
                    {d.polls ? `${d.polls[0]}/${d.polls[1] ?? '?'}` : '-'}
                  </td>
                  {Q.map((x) => (
                    <td
                      key={x.n}
                      className="rounded px-1.5 py-1 text-right"
                      style={{ background: shade(x.n, d.y[x.n]) }}
                    >
                      {shareText(d.y[x.n])}
                    </td>
                  ))}
                  <td className="px-1.5 py-1 text-right">
                    {r == null ? '-' : `${Math.round(r)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function NotesSection({
  notes,
  latest,
}: {
  notes: ReturnType<typeof countNotes>
  latest: Payload
}) {
  const items: string[] = []
  if (notes.decreases.length) {
    const big = notes.decreases.reduce((a, b) => (b.change < a.change ? b : a))
    items.push(
      `Question ${SEPARATION}'s ballot total went down in ${fmt(notes.decreases.length)} snapshot${notes.decreases.length === 1 ? '' : 's'} (corrections); the largest drop was ${fmt(-big.change)} at ${wallClock(big.at)}.`,
    )
  }
  if (notes.pollTotals.length > 1)
    items.push(
      `The total number of polls was revised ${fmt(notes.pollTotals.length - 1)} time${notes.pollTotals.length === 2 ? '' : 's'}, from ${fmt(notes.pollTotals[0].total)} to ${fmt(notes.pollTotals[notes.pollTotals.length - 1].total)}.`,
    )
  if (notes.over.length)
    items.push(
      `Some divisions with every poll in report more ballots on a later question than on Question ${SEPARATION}, which should not happen: ${listOf(
        notes.over
          .slice(0, 6)
          .map((o) => `${o.d.name} (Q${o.n}, ${Math.round(o.ratio * 100)}%)`),
      )}${notes.over.length > 6 ? `, and ${notes.over.length - 6} more` : ''}.`,
    )
  const left = latest.polls.total - latest.polls.closed
  if (!latest.official && left > 0)
    items.push(
      `The count is unofficial, with ${fmt(left)} poll${left === 1 ? '' : 's'} not yet reported as of ${wallClock(latest.asOf)}.`,
    )
  if (!items.length) return null
  return (
    <Section id="notes" title="Count notes">
      <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm leading-relaxed">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </Section>
  )
}
