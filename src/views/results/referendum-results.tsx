// A referendum (Alberta): each question's count by group, then the charts
// across questions: locations reported over time, votes counted per
// question, how each question moved, momentum, Calgary/Edmonton/rest, and
// the map of one question by division, and every division for one question
// with the viewer's own ringed.
import { useMemo, useState } from 'react'
import { DataTable, GroupHead, Note, Section } from '@/components/bits'
import { TwoOptionBar } from '@/components/charts/bars'
import { Choropleth } from '@/components/charts/choropleth'
import { Dumbbell } from '@/components/charts/dumbbell'
import { Legend } from '@/components/charts/legend'
import { Lines } from '@/components/charts/lines'
import { Strip } from '@/components/charts/strip'
import type { TipContent } from '@/components/charts/tooltip'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { blendCss } from '@/lib/blend'
import { seriesColor } from '@/lib/party'
import { keys as storageKeys, readString, writeString } from '@/lib/storage'
import { atClock, timeTicks } from '@/lib/time'
import {
  capitalize,
  clockOf,
  compact,
  fmt,
  pct1,
  signed,
} from '../../../shared/format.ts'
import type { BallotMarks } from '../../../shared/permalink.ts'
import type { Snapshot } from '../../../shared/payload.ts'
import type {
  ReferendumElection,
  ReferendumQuestion,
} from '../../../shared/schema/election.ts'
import { blendWeights, LEADER } from '../../../shared/stats/blend.ts'
import {
  allReported,
  ballotWide,
  contestOf,
  divisionRows,
  momentum,
  pollsSeries,
  questionsReporting,
  regionSplit,
  reported,
  shareSeries,
  stripRows,
  tally,
  votesSeries,
  type DivisionRow,
  type DivisionSort,
} from '../../../shared/stats/referendum.ts'
import { pollsText, reportedText } from '../ballot/referendum-ballot'
import { SourceNote, StatusLine, Tile } from './results-header'
import type { SectionLink } from './results-view'

export function referendumSections(
  election: ReferendumElection,
): SectionLink[] {
  return [
    ...election.groups.map((g) => ({ id: `group-${g.key}`, label: g.label })),
    { id: 'progress', label: 'Progress' },
    { id: 'votes', label: 'Votes' },
    { id: 'trend', label: 'Trend' },
    { id: 'momentum', label: 'Lately' },
    { id: 'regions', label: 'Regions' },
    ...(election.boundaries ? [{ id: 'map', label: 'Map' }] : []),
    { id: 'divisions', label: 'Divisions' },
  ]
}

export function ReferendumResults({
  election,
  snapshots,
  live,
  marks,
}: {
  election: ReferendumElection
  snapshots: Snapshot[]
  live: boolean
  marks: BallotMarks
}) {
  const latest = snapshots[snapshots.length - 1].payload
  const Q = election.questions
  const results = election.results
  const unit = results.unit || 'voting locations'
  const sourceName = results.label || 'the official source'
  const first = Q[0]
  const firstContest = contestOf(latest, first)
  const firstReported = reported(firstContest)
  const reporting = questionsReporting(latest, election)
  const counted = tally(firstContest).total
  const done = allReported(latest, election)
  const colorOfQ = (q: ReferendumQuestion) => seriesColor(Q.indexOf(q))
  // The viewer's own division, shared by the map and the division list.
  const [own, setOwn] = useState(() =>
    readString(storageKeys.division(election.slug)),
  )
  const pickOwn = (next: string) => {
    setOwn(next)
    writeString(storageKeys.division(election.slug), next)
  }
  return (
    <div className="space-y-6">
      <StatusLine
        latest={latest}
        live={live}
        done={done}
        doneText={
          latest.official ? 'Official count' : 'Every question fully reported'
        }
        owner="the"
        timeZone={election.timeZone}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label={`Question ${first.n}: ${unit} reported`}
          value={fmt(firstReported.closed)}
          sub={
            firstReported.total
              ? `of ${fmt(firstReported.total)} · ${pct1((firstReported.share || 0) * 100)}`
              : undefined
          }
          share={firstReported.share}
        />
        <Tile
          label={`Question ${first.n}: votes counted`}
          value={fmt(counted)}
        />
        <Tile
          label="Questions reporting"
          value={reporting}
          sub={`of ${Q.length}`}
        />
      </div>

      {election.groups.map((g) => {
        const items = Q.filter((q) => q.group === g.key)
        if (!items.length) return null
        return (
          <Section key={g.key} id={`group-${g.key}`} title={g.label}>
            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((q) => (
                <QuestionCard
                  key={q.n}
                  q={q}
                  election={election}
                  latest={latest}
                  marks={marks}
                />
              ))}
            </div>
          </Section>
        )
      })}

      <GroupHead id="charts">Across the questions</GroupHead>
      <ProgressSection election={election} snapshots={snapshots} />
      <VotesSection
        election={election}
        snapshots={snapshots}
        colorOfQ={colorOfQ}
      />
      <TrendSection
        election={election}
        snapshots={snapshots}
        colorOfQ={colorOfQ}
      />
      <MomentumRef
        election={election}
        snapshots={snapshots}
        colorOfQ={colorOfQ}
      />
      <RegionSection election={election} latest={latest} />
      <MapSection election={election} latest={latest} own={own} />
      <DivisionsSection
        election={election}
        latest={latest}
        own={own}
        onOwn={pickOwn}
      />

      <SourceNote>
        Counts from{' '}
        <a
          href={results.official}
          target="_blank"
          rel="noopener"
          className="underline underline-offset-4"
        >
          {sourceName}
        </a>
        , read every minute or two.{' '}
        {latest.official ? '' : results.unofficialNote || ''} Percentages are of
        the votes for the two options; rejected and blank ballots are left out.
      </SourceNote>
    </div>
  )
}

function QuestionCard({
  q,
  election,
  latest,
  marks,
}: {
  q: ReferendumQuestion
  election: ReferendumElection
  latest: Snapshot['payload']
  marks: BallotMarks
}) {
  const Q = election.questions
  const i = Q.indexOf(q)
  const contest = contestOf(latest, q)
  const t = tally(contest)
  const you = marks[i] === 0 || marks[i] === 1 ? q.options[marks[i]].t : ''
  const winner = contest && contest.choices.find((c) => c.winner)
  const lines: string[] = []
  if (t.started)
    lines.push(
      `${q.options[0].t} ${fmt(t.votes[0])} · ${q.options[1].t} ${fmt(t.votes[1])}`,
    )
  const rep = reportedText(election, contest)
  if (rep) lines.push(rep)
  const lead = tally(contestOf(latest, Q[0]))
  if (ballotWide(election) && i > 0 && t.started && lead.total)
    lines.push(
      `${pct1(Math.min(100, (t.total / lead.total) * 100))} of Question ${Q[0].n}'s votes counted so far`,
    )
  if (contest && contest.rejected)
    lines.push(`${fmt(contest.rejected)} rejected`)
  return (
    <article
      className={`space-y-3 rounded-lg border p-4 ${i === 0 ? 'lg:col-span-2' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          <span className="bg-muted mr-2 rounded px-1.5 py-0.5 text-xs">
            Q{q.n}
          </span>
          {q.topic}
        </h3>
        {winner ? (
          <span className="bg-foreground text-background rounded px-1.5 py-0.5 text-xs font-medium">
            majority: {winner.name}
          </span>
        ) : t.started && t.lead !== -1 ? (
          <span className="text-muted-foreground text-xs">
            Leading: {q.options[t.lead].t}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{q.short}</p>
      <TwoOptionBar
        a={q.options[0].t}
        b={q.options[1].t}
        shares={t.shares}
        votes={t.votes}
        lead={t.lead}
        started={t.started}
      />
      {lines.length ? (
        <p className="text-muted-foreground nums text-xs">
          {lines.join(' · ')}
        </p>
      ) : null}
      {q.polls.length ? <Note>Polls: {pollsText(q)}</Note> : null}
      {you ? (
        <p className="text-sm">
          Your ballot: <b>{you}</b>
          {t.started ? ` · ${pct1(t.shares[marks[i]])} so far` : ''}
        </p>
      ) : null}
    </article>
  )
}

function ProgressSection({
  election,
  snapshots,
}: {
  election: ReferendumElection
  snapshots: Snapshot[]
}) {
  const data = pollsSeries(snapshots)
  if (!data) return null
  const unit = election.results.unit || 'voting locations'
  const last = data.rows[data.rows.length - 1].payload.polls
  const start = data.xs[0]
  const end = data.xs[data.xs.length - 1]
  return (
    <Section
      id="progress"
      title={`${capitalize(unit)} reported over time`}
      sub={`${fmt(last.closed)} of ${fmt(last.total)} so far`}
    >
      <Lines
        points={data.xs}
        xMin={start}
        xMax={end}
        xTicks={timeTicks(start, end)}
        xFormat={atClock}
        yTicks={[0, 25, 50, 75, 100]}
        yFormat={(v) => `${Math.round(v)}%`}
        padRight={48}
        lines={[
          {
            label: `${capitalize(unit)} reported`,
            short: `${Math.floor(data.values[data.values.length - 1])}%`,
            color: 'var(--ref-a)',
            values: data.values,
          },
        ]}
        title={(i) => {
          const p = data.rows[i].payload.polls
          return `${fmt(p.closed)} of ${fmt(p.total)} ${unit} reported · ${clockOf(data.rows[i].payload.asOf)}`
        }}
        ariaLabel={`Share of ${unit} reported over time`}
      />
      {ballotWide(election) ? (
        <Note>
          {election.results.label || 'The source'} reports {unit} for the whole
          ballot, not per question: Question {election.questions[0].n} is
          counted first, so the later questions trail this line.
        </Note>
      ) : null}
    </Section>
  )
}

function VotesSection({
  election,
  snapshots,
  colorOfQ,
}: {
  election: ReferendumElection
  snapshots: Snapshot[]
  colorOfQ: (q: ReferendumQuestion) => string
}) {
  const data = votesSeries(snapshots, election)
  if (!data || !data.series.length) return null
  const unit = election.results.unit || 'voting locations'
  const start = data.xs[0]
  const end = data.xs[data.xs.length - 1]
  const lines = data.series.map((sr) => ({
    label: `Q${sr.q.n} ${sr.q.topic}`,
    short: `Q${sr.q.n}`,
    color: colorOfQ(sr.q),
    values: sr.values,
  }))
  return (
    <Section
      id="votes"
      title="Votes counted per question"
      sub="each question is counted in turn"
    >
      <Legend
        items={lines.map((l) => ({
          label: l.label,
          color: l.color,
          line: true,
        }))}
      />
      <Lines
        points={data.xs}
        xMin={start}
        xMax={end}
        xTicks={timeTicks(start, end)}
        xFormat={atClock}
        yFormat={compact}
        valueFormat={(v) => fmt(v)}
        padRight={lines.length > 4 ? 14 : 92}
        lines={lines}
        title={(i) =>
          `${clockOf(data.rows[i].payload.asOf)} · ${fmt(data.rows[i].payload.polls.closed)} of ${fmt(data.rows[i].payload.polls.total)} ${unit} reported`
        }
        ariaLabel="Votes counted for each question over time"
      />
      <Note>
        Ballots are counted by hand one question at a time, Question{' '}
        {election.questions[0].n} first, so each line rises later than the one
        before. Hover or focus the chart to read every question at one moment.
      </Note>
      <DataTable
        heads={['As of', ...data.series.map((sr) => `Q${sr.q.n}`)]}
        rows={data.rows.map((r, i) => [
          clockOf(r.payload.asOf),
          ...data.series.map((sr) =>
            sr.values[i] == null ? '-' : fmt(sr.values[i] as number),
          ),
        ])}
      />
    </Section>
  )
}

function TrendSection({
  election,
  snapshots,
  colorOfQ,
}: {
  election: ReferendumElection
  snapshots: Snapshot[]
  colorOfQ: (q: ReferendumQuestion) => string
}) {
  const data = shareSeries(snapshots, election)
  if (!data || !data.series.length) return null
  const unit = election.results.unit || 'voting locations'
  const first = election.questions[0]
  const lines = data.series.map((sr) => ({
    label: `Q${sr.q.n} ${sr.q.topic}`,
    short: `Q${sr.q.n}`,
    color: colorOfQ(sr.q),
    values: sr.values,
  }))
  // The x axis grows with the count, so the first hour is not a sliver.
  const top = Math.max(1, ...data.xs)
  const step = [1, 2, 5, 10, 25].find((s) => s * 4 >= top) || 25
  const xTicks: number[] = []
  for (let v = 0; v < top + step && v <= 100; v += step) xTicks.push(v)
  return (
    <Section
      id="trend"
      title="How each question moved"
      sub={`${first.options[0].t} or Yes share by ${unit} reported`}
    >
      <Legend
        items={lines.map((l) => ({
          label: l.label,
          color: l.color,
          line: true,
        }))}
      />
      <Lines
        points={data.xs}
        xMin={0}
        xMax={xTicks[xTicks.length - 1]}
        xTicks={xTicks}
        xFormat={(v) => `${Math.round(v)}%`}
        yTicks={[0, 25, 50, 75, 100]}
        yFormat={(v) => `${Math.round(v)}%`}
        valueFormat={pct1}
        rules={[{ y: 50, label: 'half' }]}
        padRight={lines.length > 4 ? 14 : 92}
        lines={lines}
        title={(i) => {
          const p = data.rows[i].payload.polls
          return `${fmt(p.closed)} of ${fmt(p.total)} ${unit} reported · ${clockOf(data.rows[i].payload.asOf)}`
        }}
        ariaLabel={`Each question's ${first.options[0].t} or Yes share as ${unit} reported`}
      />
      <Note>
        Above the dashed line, {first.options[0].t} (Question {first.n}) or Yes
        leads. Hover or focus the chart to read every question at one moment.
      </Note>
      <DataTable
        heads={['As of', 'Reported', ...data.series.map((sr) => `Q${sr.q.n}`)]}
        rows={data.rows.map((r, i) => [
          clockOf(r.payload.asOf),
          pct1(data.xs[i]),
          ...data.series.map((sr) =>
            sr.values[i] == null ? '-' : pct1(sr.values[i] as number),
          ),
        ])}
      />
    </Section>
  )
}

function MomentumRef({
  election,
  snapshots,
  colorOfQ,
}: {
  election: ReferendumElection
  snapshots: Snapshot[]
  colorOfQ: (q: ReferendumQuestion) => string
}) {
  const m = momentum(snapshots, election, 60)
  if (!m) return null
  const since = clockOf(m.since)
  const big = m.rows.reduce((a, b) =>
    Math.abs(b.change) > Math.abs(a.change) ? b : a,
  )
  const one = (q: ReferendumQuestion) => q.options[0].t
  return (
    <Section id="momentum" title="Lately" sub={`votes counted since ${since}`}>
      <p className="font-medium">
        Biggest swing: on Question {big.q.n} ({big.q.topic}), {one(big.q)} took{' '}
        {pct1(big.recent)} of the {fmt(big.added)} votes counted since {since},
        against {pct1(big.overall)} overall.
      </p>
      <Dumbbell
        rows={m.rows.map((r) => ({
          label: `Q${r.q.n} ${one(r.q)}`,
          color: colorOfQ(r.q),
          a: r.overall,
          b: r.recent,
          describe: () => ({
            title: `Question ${r.q.n}: ${r.q.topic}`,
            lines: [
              { label: `${one(r.q)} overall`, value: pct1(r.overall) },
              { label: `Since ${since}`, value: pct1(r.recent) },
              { label: 'Change', value: `${signed(r.change)} pts` },
              { label: 'Votes since', value: fmt(r.added) },
            ],
          }),
        }))}
        aLabel="Overall share"
        bLabel={`Share since ${since}`}
        xFormat={(v) => `${Math.round(v)}%`}
        ariaLabel={`Each question's first-option share overall and of the votes counted since ${since}`}
      />
      <Note>
        Batches can lean one way by where and when they were cast (advance,
        mobile, mail, election day), so this reads the votes counted, not a
        forecast.
      </Note>
      <DataTable
        heads={[
          'Question',
          'Overall',
          `Since ${since}`,
          'Change',
          'Votes since',
        ]}
        rows={m.rows.map((r) => [
          `Q${r.q.n} ${one(r.q)}`,
          pct1(r.overall),
          pct1(r.recent),
          signed(r.change),
          fmt(r.added),
        ])}
      />
    </Section>
  )
}

function RegionSection({
  election,
  latest,
}: {
  election: ReferendumElection
  latest: Snapshot['payload']
}) {
  const split = regionSplit(latest, election)
  if (!split.length) return null
  const regions = split[0].regions
  const first = election.questions[0]
  const cities = regions.filter((r) => r.key !== 'rest')
  return (
    <Section
      id="regions"
      title="Calgary, Edmonton and the rest"
      sub={`${first.options[0].t} or Yes share`}
    >
      <div className="overflow-x-auto">
        <table className="nums w-full text-left text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="py-1.5 pr-3 font-medium">Question</th>
              {regions.map((r) => (
                <th key={r.key} className="py-1.5 pr-3 font-medium">
                  <span className="hidden sm:inline">{r.label}</span>
                  <span className="sm:hidden">{r.short}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {split.map(({ q, regions: rs }) => (
              <tr key={q.n} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <span className="bg-muted mr-1.5 rounded px-1 text-xs">
                    Q{q.n}
                  </span>
                  {q.topic}
                  <span className="text-muted-foreground block text-xs">
                    {q.options[0].t} share
                  </span>
                </td>
                {regions.map((r) => {
                  const x = rs.find((y) => y.key === r.key)
                  if (!x || x.share == null) {
                    return (
                      <td
                        key={r.key}
                        className="text-muted-foreground py-2 pr-3"
                      >
                        -
                      </td>
                    )
                  }
                  const label = `${x.label}: ${q.options[0].t} ${pct1(x.share)}, ${q.options[1].t} ${pct1(100 - x.share)} of ${fmt(x.total)} votes`
                  return (
                    <td key={r.key} className="py-2 pr-3" title={label}>
                      <span className="block font-medium">{pct1(x.share)}</span>
                      <span
                        className="bg-muted mt-1 block h-1.5 w-24 overflow-hidden rounded-full"
                        role="img"
                        aria-label={label}
                      >
                        <i
                          className="block h-full rounded-full"
                          style={{
                            width: `${x.share.toFixed(1)}%`,
                            background: 'var(--ref-a)',
                          }}
                        />
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>
        Calgary and Edmonton are the{' '}
        {cities.map((r) => r.divisions).join(' and ')} divisions named for them;
        the rest of Alberta is every other division, including Airdrie, St.
        Albert, Sherwood Park, Red Deer and Lethbridge.
      </Note>
    </Section>
  )
}

function DivisionsSection({
  election,
  latest,
  own,
  onOwn,
}: {
  election: ReferendumElection
  latest: Snapshot['payload']
  own: string
  onOwn: (code: string) => void
}) {
  const withRows = useMemo(
    () =>
      election.questions.filter(
        (q) => (contestOf(latest, q)?.eds || []).length,
      ),
    [election, latest],
  )
  const [pickN, setPickN] = useState<number | null>(null)
  const [sort, setSort] = useState<DivisionSort>('name')
  if (!withRows.length) return null
  const pick = withRows.find((q) => q.n === pickN) || withRows[0]
  const contest = contestOf(latest, pick)
  const rows = divisionRows(contest, sort)
  const ownRow = rows.find((r) => (r.code || r.name) === own)
  const [a, b] = pick.options.map((o) => o.t)
  const unit = election.results.unit || 'voting locations'
  const prov = tally(contest).shares[0]
  const strips = stripRows(contest)
  return (
    <Section
      id="divisions"
      title="By electoral division"
      sub={`${rows.length} divisions`}
    >
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground block">Question</span>
          <Select
            value={String(pick.n)}
            onValueChange={(v) => setPickN(Number(v))}
          >
            <SelectTrigger className="w-64" aria-label="Question">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withRows.map((q) => (
                <SelectItem key={q.n} value={String(q.n)}>
                  Q{q.n} {q.topic}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground block">Your division</span>
          <Select
            value={own || '__none'}
            onValueChange={(v) => onOwn(v === '__none' ? '' : v)}
          >
            <SelectTrigger className="w-64" aria-label="Your division">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {divisionRows(contest, 'name').map((r) => (
                <SelectItem key={r.code || r.name} value={r.code || r.name}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      {ownRow ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
          <p className="nums text-sm">
            <b>{ownRow.name}</b>:{' '}
            {ownRow.total
              ? `${a} ${pct1(ownRow.share || 0)} · ${b} ${pct1(100 - (ownRow.share || 0))} of ${fmt(ownRow.total)} votes`
              : 'no votes counted yet'}
            {ownRow.polls && ownRow.polls[0] != null
              ? ` · ${ownRow.polls[1] ? `${fmt(ownRow.polls[0])} of ${fmt(ownRow.polls[1])}` : fmt(ownRow.polls[0])} ${unit}`
              : ''}
          </p>
          <TwoOptionBar
            a={a}
            b={b}
            shares={
              ownRow.total
                ? [ownRow.share || 0, 100 - (ownRow.share || 0)]
                : [0, 0]
            }
            votes={ownRow.votes}
            lead={
              ownRow.votes[0] === ownRow.votes[1]
                ? -1
                : ownRow.votes[0] > ownRow.votes[1]
                  ? 0
                  : 1
            }
            started={ownRow.total > 0}
          />
        </div>
      ) : null}
      {strips.length ? (
        <>
          <Strip
            rows={strips.map((r) => ({
              label: r.short,
              sub: `${r.dots.length} division${r.dots.length === 1 ? '' : 's'}`,
              color: 'var(--ref-a)',
              dots: r.dots.map((d) => ({
                value: d.share || 0,
                in: true,
                color: (d.share || 0) >= 50 ? 'var(--ref-a)' : 'var(--ref-b)',
                ring: (d.code || d.name) === own,
                describe: () =>
                  divisionTip(d, pick, unit, (d.code || d.name) === own),
              })),
            }))}
            xTicks={[0, 25, 50, 75, 100]}
            xMax={100}
            cutoff={50}
            cutoffLabel="half"
            cutoffAnchor={prov >= 50 ? 'end' : 'start'}
            marks={[
              {
                value: prov,
                label: `Alberta ${pct1(prov)}`,
                short: `AB ${pct1(prov)}`,
                anchor: prov >= 50 ? 'start' : 'end',
              },
            ]}
            xFormat={(v) => `${v}%`}
            ariaLabel={`${a} share in each division with votes counted`}
          />
          <Note>
            Each dot is one division's {a} share; the solid line is the
            province.{' '}
            {own
              ? 'The ringed dot is your division.'
              : 'Pick your division above to ring it.'}
          </Note>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Sort by</span>
        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={(v) => v && setSort(v as DivisionSort)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="name">Name</ToggleGroupItem>
          <ToggleGroupItem value="share">{a} share</ToggleGroupItem>
          <ToggleGroupItem value="votes">Votes</ToggleGroupItem>
          <ToggleGroupItem value="polls">
            {capitalize(unit)} reported
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="max-h-[32rem] overflow-auto rounded-md border">
        <table className="nums w-full text-left text-sm">
          <thead className="bg-card sticky top-0">
            <tr className="text-muted-foreground border-b text-xs">
              <th className="px-3 py-1.5 font-medium">Division</th>
              <th className="px-3 py-1.5 font-medium">{a}</th>
              <th className="px-3 py-1.5 font-medium">{b}</th>
              <th className="px-3 py-1.5 font-medium">Votes</th>
              <th className="px-3 py-1.5 font-medium">
                {capitalize(unit)} reported
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.code || r.name}
                className={`border-b last:border-0 ${(r.code || r.name) === own ? 'bg-muted/60 font-medium' : ''}`}
              >
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5">
                  {r.share == null ? '-' : pct1(r.share)}
                </td>
                <td className="px-3 py-1.5">
                  {r.share == null ? '-' : pct1(100 - r.share)}
                </td>
                <td className="px-3 py-1.5">{fmt(r.total)}</td>
                <td
                  className="px-3 py-1.5"
                  title={
                    r.reported != null && r.polls
                      ? `${fmt(r.polls[0])} of ${fmt(r.polls[1] || 0)} ${unit}`
                      : undefined
                  }
                >
                  {r.reported != null
                    ? `${Math.floor(r.reported)}%`
                    : r.polls && r.polls[0] != null
                      ? fmt(r.polls[0])
                      : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {withRows.length > 1 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setPickN(withRows[(withRows.indexOf(pick) + 1) % withRows.length].n)
          }
        >
          Next question
        </Button>
      ) : null}
    </Section>
  )
}

/** One division's count for one question, as tooltip lines. */
function divisionTip(
  d: DivisionRow,
  q: ReferendumQuestion,
  unit: string,
  yours: boolean,
): TipContent {
  const [a, b] = q.options.map((o) => o.t)
  return {
    title: `${d.name}${yours ? ' (yours)' : ''}`,
    lines: d.total
      ? [
          { label: a, value: pct1(d.share || 0), color: 'var(--ref-a)' },
          {
            label: b,
            value: pct1(100 - (d.share || 0)),
            color: 'var(--ref-b)',
          },
          { label: 'Votes', value: fmt(d.total) },
          ...(d.polls && d.polls[1]
            ? [
                {
                  label: capitalize(unit),
                  value: `${fmt(d.polls[0])} of ${fmt(d.polls[1])}`,
                },
              ]
            : []),
        ]
      : [{ label: 'Votes', value: 'none counted yet' }],
  }
}

const optionColor = (key: string) =>
  key === 'a' ? 'var(--ref-a)' : 'var(--ref-b)'

/** The map fill for one division's two-option count. */
const divisionFill = (votes: [number, number]): string =>
  blendCss(
    blendWeights([
      { key: 'a', share: votes[0] },
      { key: 'b', share: votes[1] },
    ]),
    optionColor,
  )

function MapSection({
  election,
  latest,
  own,
}: {
  election: ReferendumElection
  latest: Snapshot['payload']
  own: string
}) {
  const withRows = useMemo(
    () =>
      election.questions.filter(
        (q) => (contestOf(latest, q)?.eds || []).length,
      ),
    [election, latest],
  )
  const [pickN, setPickN] = useState<number | null>(null)
  const set = election.boundaries
  if (!set || !withRows.length) return null
  const pick = withRows.find((q) => q.n === pickN) || withRows[0]
  const rows = divisionRows(contestOf(latest, pick))
  const byCode = new Map(rows.map((r) => [r.code || r.name, r]))
  const unit = election.results.unit || 'voting locations'
  const names =
    election.results.format === 'eab-dash' ? election.results.divisions : null
  const [a, b] = pick.options.map((o) => o.t)
  const fills: Record<string, string> = {}
  for (const r of rows)
    if (r.total) fills[r.code || r.name] = divisionFill(r.votes)
  // The legend runs from all b to all a, through the same blend.
  const stops = Array.from({ length: 21 }, (_, i) =>
    divisionFill([i * 5, 100 - i * 5]),
  )
  return (
    <Section
      id="map"
      title="Map"
      sub={`Question ${pick.n} by electoral division`}
    >
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground block">Question</span>
        <Select
          value={String(pick.n)}
          onValueChange={(v) => setPickN(Number(v))}
        >
          <SelectTrigger className="w-64" aria-label="Map question">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {withRows.map((q) => (
              <SelectItem key={q.n} value={String(q.n)}>
                Q{q.n} {q.topic}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="max-w-sm space-y-1 text-xs">
        <div
          className="h-2.5 rounded-full"
          style={{
            background: `linear-gradient(to right, ${stops.join(', ')})`,
          }}
          role="img"
          aria-label={`From all ${b} on the left to all ${a} on the right`}
        />
        <div className="text-muted-foreground flex justify-between">
          <span>{b}</span>
          <span>even</span>
          <span>{a}</span>
        </div>
      </div>
      <Choropleth
        set={set}
        fills={fills}
        ring={own || undefined}
        ariaLabel={`Question ${pick.n}, ${pick.topic}: each division's blend of ${a} and ${b}`}
        describe={(code) => {
          const row = byCode.get(code)
          return row
            ? divisionTip(row, pick, unit, code === own)
            : {
                title: `${(names && names[code]) || code}${code === own ? ' (yours)' : ''}`,
                lines: [{ label: 'Votes', value: 'none counted yet' }],
              }
        }}
      />
      <Note>
        Each division blends the two options' colours by their share of its
        votes, sharpened so the option ahead always makes up at least{' '}
        {Math.round(LEADER * 100)}% of the colour; grey divisions have no votes
        counted yet.{' '}
        {own
          ? 'Your division is outlined.'
          : 'Pick your division below to outline it.'}
      </Note>
    </Section>
  )
}
