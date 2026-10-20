// An at-large election (Vancouver): one race per office with a seats bar
// for multi-seat offices, the ballot questions, the mayoral timeline, then
// the count (what is left, mayor momentum, the race for the last seats) and
// the parties (City Hall seats, share by office, the council on the compass,
// the council field).
import { useMemo } from 'react'
import {
  DataTable,
  GroupHead,
  Note,
  PartyChip,
  Section,
} from '@/components/bits'
import { Legend } from '@/components/charts/legend'
import { Lines } from '@/components/charts/lines'
import { Meter } from '@/components/charts/bars'
import { Strip } from '@/components/charts/strip'
import { useTip, tipHandlersFor } from '@/components/charts/tooltip'
import { partyColor, partyLookup, partyName, partyShort } from '@/lib/party'
import { capitalize, clockOf, fmt, pct1 } from '../../../shared/format.ts'
import type { Payload, Snapshot } from '../../../shared/payload.ts'
import type { AtLargeElection } from '../../../shared/schema/election.ts'
import {
  cityHallSeats,
  complete,
  councilCentre,
  keyOf,
  mayorTimeline,
  momentum,
  partyOrder,
  partyShares,
  seatLineRace,
} from '../../../shared/stats/results.ts'
import { QuestionBar, Race, fullLabelOf, type RaceContext } from './race'
import {
  CompassSection,
  MomentumSection,
  SharesSection,
  TimelineSection,
} from './sections'
import { CountTiles, SourceNote, StatusLine } from './results-header'
import type { SectionLink } from './results-view'

export function atLargeSections(
  latest: Payload,
  election: AtLargeElection,
): SectionLink[] {
  const races = latest.contests
    .filter((c) => c.kind !== 'question')
    .map((c) => ({ id: `race-${c.kind}`, label: c.label }))
  const questions = latest.contests.some((c) => c.kind === 'question')
    ? [{ id: 'questions', label: 'Questions' }]
    : []
  return [
    ...races,
    ...questions,
    { id: 'timeline', label: 'Timeline' },
    { id: 'count', label: 'The count' },
    { id: 'parties', label: 'The parties' },
  ]
    .filter((s) => s.id !== 'timeline' || true)
    .concat(election.offices.length ? [] : [])
}

export function AtLargeResults({
  election,
  snapshots,
  live,
  matchParty,
}: {
  election: AtLargeElection
  snapshots: Snapshot[]
  live: boolean
  matchParty: string | null
}) {
  const latest = snapshots[snapshots.length - 1].payload
  const P = useMemo(() => partyLookup(election), [election])
  const ctx: RaceContext = { election, P, matchParty }
  const unit = election.results.unit || 'voting places'
  const done = complete(latest)
  const questions = latest.contests.filter((c) => c.kind === 'question')
  const hall = cityHallSeats(latest, election)
  const races = seatLineRace(snapshots, election)
  const council = latest.contests.find((c) => c.kind === 'council')
  return (
    <div className="space-y-6">
      <StatusLine
        latest={latest}
        live={live}
        done={done}
        doneText="Count complete"
        owner={
          election.results.label ? `${election.results.label}'s` : "the City's"
        }
        timeZone={election.timeZone}
      />
      <CountTiles latest={latest} unitLabel={capitalize(unit)} />
      {matchParty && P[matchParty] ? (
        <Note>
          <PartyChip party={matchParty} label={P[matchParty].name} /> is
          outlined below: your closest compass match.
        </Note>
      ) : null}

      {latest.contests
        .filter((c) => c.kind !== 'question')
        .map((c) => (
          <Race key={c.id} id={`race-${c.kind}`} contest={c} ctx={ctx} />
        ))}
      {questions.length ? (
        <Section id="questions" title="Ballot questions">
          <div className="grid gap-4 sm:grid-cols-2">
            {questions.map((c) => (
              <QuestionBar key={c.id} contest={c} />
            ))}
          </div>
        </Section>
      ) : null}

      <TimelineSection
        id="timeline"
        t={mayorTimeline(snapshots, election)}
        title="How the mayoral race moved"
        sub="share of the vote by voting places reported"
        yFormat={(v) => `${Math.round(v * 10) / 10}%`}
        valueFormat={pct1}
        ariaLabel="Mayoral vote share as voting places reported"
      />

      <GroupHead id="count">The count</GroupHead>
      <Section
        id="left"
        title="What's left to count"
        sub={
          latest.tabulators && latest.tabulators.total
            ? `${fmt(latest.tabulators.closed)} of ${fmt(latest.tabulators.total)} tabulators in`
            : undefined
        }
      >
        <div className="space-y-2">
          <Meter
            label={capitalize(unit)}
            closed={latest.polls.closed}
            total={latest.polls.total}
            value={`${fmt(latest.polls.closed)} / ${fmt(latest.polls.total)}`}
          />
          {(latest.groups || [])
            .filter((g) => g.total)
            .map((g) => (
              <Meter
                key={g.name}
                label={`${g.name} tabulators`}
                closed={g.closed}
                total={g.total}
                value={`${fmt(g.closed)} / ${fmt(g.total)}`}
              />
            ))}
          {election.results.baseline ? (
            <Meter
              label={`Ballots vs ${election.results.baseline.year}`}
              closed={latest.ballots}
              total={election.results.baseline.ballots}
              value={`${fmt(latest.ballots)} / ${fmt(election.results.baseline.ballots)}`}
            />
          ) : null}
        </div>
        {election.results.baseline ? (
          <Note>
            {pct1((latest.ballots / election.results.baseline.ballots) * 100)}{' '}
            of the {fmt(election.results.baseline.ballots)} ballots cast in{' '}
            {election.results.baseline.year}. The feed has no eligible-voter
            count until the City publishes one, so turnout appears only then.
          </Note>
        ) : null}
      </Section>
      <MomentumSection
        id="momentum"
        m={momentum(snapshots)}
        title="Mayor momentum"
        noun="mayoral votes"
        label={(r) => r.name.split(' ').slice(-1)[0]}
        P={P}
      />
      {races.length ? (
        <Section
          id="lastseats"
          title="Race for the last seats"
          sub="votes between the last seat in and the first name out"
        >
          <div className="grid gap-4 md:grid-cols-3">
            {races.map((race) => {
              const now = race.points[race.points.length - 1]
              const who = (x: { name: string; party: string | null }) =>
                `${x.name}${x.party ? ` (${partyShort(P, x.party)})` : ''}`
              return (
                <div key={race.kind} className="space-y-1">
                  <h3 className="font-medium">{race.label}</h3>
                  <p className="text-muted-foreground text-xs">
                    Seat {race.voteFor}: {who(now.last)} leads {who(now.next)}{' '}
                    by {fmt(now.gap)}.
                  </p>
                  <Lines
                    points={race.points.map((x) => x.reported)}
                    xMin={0}
                    xMax={100}
                    xTicks={[0, 50, 100]}
                    xFormat={(v) => `${Math.round(v)}%`}
                    yFormat={(v) => fmt(v)}
                    height={150}
                    padRight={52}
                    lines={[
                      {
                        label: 'Gap',
                        short: fmt(now.gap),
                        color: 'var(--brand)',
                        values: race.points.map((x) => x.gap),
                      },
                    ]}
                    title={(i) => {
                      const x = race.points[i]
                      return `${x.polls.closed}/${x.polls.total} reported · ${clockOf(x.asOf)} · ${who(x.last)} over ${who(x.next)}`
                    }}
                    ariaLabel={`${race.label}: vote gap at seat ${race.voteFor} as voting places reported`}
                  />
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      <GroupHead id="parties">The parties</GroupHead>
      {hall.seats ? <CityHall hall={hall} done={done} ctx={ctx} /> : null}
      <SharesSection
        id="shares"
        groups={partyShares(latest, election).filter((o) => o.total > 0)}
        title="Party share by office"
        sub="share of all votes cast in each race"
        note="A party running more candidates collects more votes in a multi-seat race; the tooltip shows votes per candidate."
        lines={(part) => [
          { label: 'Candidates', value: String(part.candidates || 0) },
          {
            label: 'Per candidate',
            value: fmt(Math.round(part.votes / (part.candidates || 1))),
          },
        ]}
        cell={(x) => `${pct1(x.share)} (${x.candidates})`}
        election={election}
        P={P}
      />
      <CompassSection
        id="council-plane"
        centre={councilCentre(latest, election)}
        title={
          done
            ? 'The new council on the compass'
            : 'The council so far, on the compass'
        }
        seatsLabel="Council seats"
        sized={`council seats${done ? '' : ' currently winning'}`}
        you="Council centre"
        aria="Council seats by party on the compass plane"
        P={P}
      />
      {council && council.choices.length > council.voteFor ? (
        <FieldSection council={council} ctx={ctx} />
      ) : null}

      <SourceNote>
        Counts from{' '}
        <a
          href={election.results.official}
          target="_blank"
          rel="noopener"
          className="underline underline-offset-4"
        >
          {election.results.label || 'the City of Vancouver'}
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

function CityHall({
  hall,
  done,
  ctx,
}: {
  hall: ReturnType<typeof cityHallSeats>
  done: boolean
  ctx: RaceContext
}) {
  const tip = useTip()
  const { P } = ctx
  const top = hall.totals.slice().sort((a, b) => b.seats - a.seats)[0]
  return (
    <Section
      id="cityhall"
      title="Seats across City Hall"
      sub={
        done
          ? `${hall.seats} seats elected`
          : `${hall.seats} seats if the count stopped now`
      }
    >
      {top ? (
        <p className="font-medium">
          {partyName(P, top.key)} {done ? 'won' : 'holds'} {top.seats} of{' '}
          {hall.seats} seats across the four ballots.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {hall.offices.map((office) => (
          <div key={office.kind} className="space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              {office.label} · {office.voteFor}
            </span>
            <div
              className="flex flex-wrap gap-1"
              role="img"
              aria-label={`${office.label}: ${office.seats.map((s) => `${s.name} (${partyShort(P, s.key)})`).join(', ')}`}
            >
              {office.seats.map((s, i) => (
                <span
                  key={i}
                  tabIndex={0}
                  className="size-6 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  style={{
                    background: partyColor(s.key === 'other' ? null : s.key),
                  }}
                  {...tipHandlersFor(tip, () => ({
                    title: `${office.label}, seat ${i + 1} of ${office.voteFor}`,
                    lines: [
                      {
                        label: s.name,
                        color: partyColor(s.key === 'other' ? null : s.key),
                        value: '',
                      },
                      { label: partyName(P, s.key), value: '' },
                      { label: 'Votes', value: fmt(s.votes) },
                    ],
                  }))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Legend
        items={hall.totals.map((t) => ({
          label: `${partyShort(P, t.key)} ${t.seats}`,
          color: partyColor(t.key === 'other' ? null : t.key),
        }))}
      />
    </Section>
  )
}

function FieldSection({
  council,
  ctx,
}: {
  council: Payload['contests'][number]
  ctx: RaceContext
}) {
  const { election, P } = ctx
  const n = council.voteFor
  const rank = new Map(council.choices.map((c, i) => [c, i]))
  const keys = partyOrder(election).filter((k) =>
    council.choices.some((c) => keyOf(c) === k),
  )
  const rows = keys.map((key) => {
    const mine = council.choices.filter((c) => keyOf(c) === key)
    const inCount = mine.filter((c) => rank.get(c)! < n).length
    return {
      label: partyShort(P, key),
      sub: `${inCount} of ${mine.length} in`,
      color: partyColor(key === 'other' ? null : key),
      dots: mine.map((c) => ({
        value: c.votes,
        in: rank.get(c)! < n,
        describe: () => ({
          title: `${c.ballot != null ? `${c.ballot} · ` : ''}${c.name}`,
          lines: [
            {
              label: fullLabelOf(P, c),
              color: partyColor(key === 'other' ? null : key),
              value: '',
            },
            { label: 'Votes', value: fmt(c.votes) },
            {
              label: 'Rank',
              value: `${rank.get(c)! + 1} of ${council.choices.length}`,
            },
          ],
        }),
      })),
    }
  })
  return (
    <Section
      id="field"
      title="Council field by party"
      sub={`${council.choices.length} candidates · top ${n} elected`}
    >
      <Strip
        rows={rows}
        cutoff={(council.choices[n - 1].votes + council.choices[n].votes) / 2}
        cutoffLabel={`seat ${n}`}
        xFormat={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        ariaLabel={`Council candidates by votes, grouped by party, with the seat ${n} cutoff`}
      />
      <Note>
        Filled dots are in the top {n}; the dashed line is the seat-{n} cutoff.
      </Note>
      <DataTable
        heads={['Party', 'In', 'Running']}
        rows={rows.map((r) => [
          r.label,
          r.dots.filter((d) => d.in).length,
          r.dots.length,
        ])}
      />
    </Section>
  )
}
