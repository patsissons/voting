// One contest: candidates ranked with vote bars, the seat line for
// multi-seat offices, the margin line for single seats, and the seats bar;
// plus the one-line row (leader and margin, opening to the contest) the
// riding and chamber lists are made of.
import { useState } from 'react'
import { PartyChip, Section, Swatch } from '@/components/bits'
import { SegmentBar } from '@/components/charts/bars'
import { useTip, tipHandlersFor } from '@/components/charts/tooltip'
import { Button } from '@/components/ui/button'
import {
  partyColor,
  partyName,
  partyShort,
  type PartyLookup,
} from '@/lib/party'
import { fmt, pct1 } from '../../../shared/format.ts'
import type { Choice, Contest } from '../../../shared/payload.ts'
import type { PartyElection } from '../../../shared/schema/election.ts'
import { keyOf, partyOrder } from '../../../shared/stats/results.ts'

export type RaceContext = {
  election: PartyElection
  P: PartyLookup
  matchParty: string | null
}

export const labelOf = (P: PartyLookup, c: Choice) =>
  c.party ? partyShort(P, c.party) : c.partyName || 'Independent'
export const fullLabelOf = (P: PartyLookup, c: Choice) =>
  c.party ? partyName(P, c.party) : c.partyName || 'Independent'

export function CandidateRow({
  c,
  rank,
  max,
  contest,
  ctx,
}: {
  c: Choice
  rank: number
  max: number
  contest: Contest
  ctx: RaceContext
}) {
  const tip = useTip()
  const elected = rank < contest.voteFor
  const mine = !!c.party && c.party === ctx.matchParty
  return (
    <div
      tabIndex={0}
      className={`nums grid grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-x-2 rounded-md px-1 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:grid-cols-[2.25rem_minmax(0,14rem)_minmax(0,1fr)_4.5rem_3.5rem] ${mine ? 'ring-1 ring-[var(--party-color)]' : ''} ${elected ? '' : 'opacity-80'}`}
      style={{ '--party-color': partyColor(c.party) } as React.CSSProperties}
      {...tipHandlersFor(tip, () => ({
        title: `${c.ballot ? `${c.ballot} · ` : ''}${c.name}`,
        lines: [
          {
            label: fullLabelOf(ctx.P, c),
            color: partyColor(c.party),
            value: '',
          },
          { label: 'Votes', value: fmt(c.votes) },
          { label: 'Share', value: pct1(c.pct) },
          { label: 'Rank', value: `${rank + 1} of ${contest.choices.length}` },
        ],
      }))}
    >
      <span className="text-muted-foreground text-xs">{c.ballot ?? ''}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="truncate font-medium">{c.name}</span>
        {c.winner ? (
          <span className="bg-foreground text-background rounded px-1 text-[10px] font-semibold uppercase">
            {ctx.election.ballot === 'chambers' ? 'called' : 'elected'}
          </span>
        ) : null}
        {c.incumbent ? (
          <span className="text-muted-foreground rounded border px-1 text-[10px] uppercase">
            sitting
          </span>
        ) : null}
        <PartyChip
          party={c.party}
          label={labelOf(ctx.P, c)}
          className="text-muted-foreground"
        />
      </span>
      <span
        className="bg-muted col-span-full h-2 overflow-hidden rounded-full sm:col-span-1 sm:h-2.5"
        style={{ gridRow: 'auto' }}
      >
        <i
          className="block h-full rounded-full"
          style={{
            width: `${max ? Math.max(0.5, (c.votes / max) * 100) : 0}%`,
            background: partyColor(c.party),
          }}
        />
      </span>
      <span className="text-right">{fmt(c.votes)}</span>
      <span className="text-muted-foreground text-right">{pct1(c.pct)}</span>
    </div>
  )
}

export function Race({
  contest,
  ctx,
  id,
  title,
}: {
  contest: Contest
  ctx: RaceContext
  id: string
  title?: string
}) {
  const { P, election } = ctx
  const top = contest.choices
  const max = top.length ? top[0].votes : 0
  const [open, setOpen] = useState(false)
  const d =
    contest.kind === 'district' && election.ballot === 'district'
      ? election.districts.find((x) => x.code === contest.id)
      : null
  const boxes = contest.boxes
    ? [
        contest.boxes.advance &&
          `advance ${contest.boxes.advance[0]}/${contest.boxes.advance[1]}`,
        contest.boxes.final &&
          `final day ${contest.boxes.final[0]}/${contest.boxes.final[1]}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const sub =
    contest.kind === 'district'
      ? `${boxes || 'no boxes yet'} · ${fmt(contest.ballots)} votes${d && d.last && d.last.party && P[d.last.party] ? ` · last time: ${P[d.last.party].short} by ${d.last.margin} points` : ''}`
      : contest.reporting != null
        ? `${pct1(contest.reporting)} of the expected vote in · ${fmt(contest.ballots)} votes`
        : `${contest.voteFor === 1 ? 'vote for 1' : `top ${contest.voteFor} elected`} · ${fmt(contest.ballots)} ballots`
  const shown =
    contest.voteFor === 1
      ? top.length
      : Math.min(top.length, contest.voteFor + 5)
  const rows = (from: number, to: number) => {
    const out = []
    for (let i = from; i < to; i++) {
      out.push(
        <CandidateRow
          key={`${top[i].ballot}|${top[i].name}`}
          c={top[i]}
          rank={i}
          max={max}
          contest={contest}
          ctx={ctx}
        />,
      )
      if (
        contest.voteFor > 1 &&
        i === contest.voteFor - 1 &&
        i < top.length - 1
      ) {
        out.push(
          <div
            key="seatline"
            className="text-muted-foreground flex items-center gap-2 py-1 text-[10px] font-medium tracking-wider uppercase"
          >
            <i className="bg-border h-px flex-1" />
            top {contest.voteFor} elected
            <i className="bg-border h-px flex-1" />
          </div>,
        )
      }
    }
    return out
  }
  let margin: string | null = null
  if (contest.voteFor === 1 && top.length > 1) {
    const lead = top[0].votes - top[1].votes
    const pts = top[0].pct - top[1].pct
    margin =
      lead > 0
        ? `${top[0].name} leads ${top[1].name} by ${fmt(lead)} votes (${pts.toFixed(1)} points).`
        : `${top[0].name} and ${top[1].name} are tied.`
  } else if (contest.voteFor > 1) {
    const inLast = top[contest.voteFor - 1]
    const outFirst = top[contest.voteFor]
    if (inLast && outFirst)
      margin = `Seat ${contest.voteFor}: ${inLast.name} is ${fmt(inLast.votes - outFirst.votes)} votes ahead of ${outFirst.name}.`
  }
  return (
    <Section id={id} title={title || contest.label} sub={sub}>
      {contest.voteFor > 1 ? (
        <ContestSeats contest={contest} ctx={ctx} />
      ) : null}
      {margin ? <p className="font-medium">{margin}</p> : null}
      <div className="divide-y">{rows(0, shown)}</div>
      {shown < top.length ? (
        <div>
          {open ? (
            <div className="divide-y border-t">{rows(shown, top.length)}</div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setOpen(!open)}
          >
            {open
              ? 'Fewer candidates'
              : `${top.length - shown} more candidates`}
          </Button>
        </div>
      ) : null}
    </Section>
  )
}

/** A contest's rows without the section frame (inside "Your riding" and the lists). */
export function RaceBody({
  contest,
  ctx,
}: {
  contest: Contest
  ctx: RaceContext
}) {
  return (
    <div className="[&>section]:border-0 [&>section]:p-0 [&>section]:shadow-none [&>section>div:first-child]:hidden">
      <Race id={`race-${contest.id}`} contest={contest} ctx={ctx} />
    </div>
  )
}

/** One line per contest: the leader, their margin and a note on the right (ballot boxes, or the share reported), opening to the whole contest. */
export function RaceRow({
  contest,
  ctx,
  meta,
}: {
  contest: Contest
  ctx: RaceContext
  meta?: string
}) {
  const [open, setOpen] = useState(false)
  const lead = contest.choices[0]
  const second = contest.choices[1]
  const gap = lead && second ? lead.pct - second.pct : 0
  const note =
    meta != null
      ? meta
      : contest.boxes && contest.boxes.final
        ? `${(contest.boxes.advance ? contest.boxes.advance[0] : 0) + contest.boxes.final[0]}/${(contest.boxes.advance ? contest.boxes.advance[1] : 0) + contest.boxes.final[1]}`
        : ''
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="nums grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3.5rem]">
        <span className="truncate font-medium">{contest.label}</span>
        <span
          className="col-span-2 flex items-center gap-1.5 sm:col-span-1"
          style={
            {
              '--party':
                lead && lead.votes > 0
                  ? partyColor(lead.party)
                  : 'var(--party-other)',
            } as React.CSSProperties
          }
        >
          <Swatch party={lead && lead.votes > 0 ? lead.party : null} />
          {lead && lead.votes > 0 ? (
            <>
              <span className="truncate">{lead.name}</span>
              <small className="text-muted-foreground">
                {labelOf(ctx.P, lead)}
                {second ? ` +${gap.toFixed(1)}` : ''}
                {lead.winner && ctx.election.ballot === 'chambers'
                  ? ' · called'
                  : ''}
              </small>
            </>
          ) : (
            <small className="text-muted-foreground">no votes yet</small>
          )}
        </span>
        <span className="text-muted-foreground col-start-2 row-start-1 text-right text-xs sm:col-start-3">
          {note}
        </span>
      </summary>
      {open ? (
        <div className="px-3 pb-3">
          <RaceBody contest={contest} ctx={ctx} />
        </div>
      ) : null}
    </details>
  )
}

/** Seats each party is currently winning in a multi-seat office. */
function ContestSeats({
  contest,
  ctx,
}: {
  contest: Contest
  ctx: RaceContext
}) {
  const winners = contest.choices.slice(0, contest.voteFor)
  const counts = new Map<string, Choice[]>()
  for (const c of winners) {
    const key = keyOf(c)
    if (!counts.has(key)) counts.set(key, [])
    counts.get(key)!.push(c)
  }
  const order = partyOrder(ctx.election).filter((k) => counts.has(k))
  return (
    <SegmentBar
      caption="Currently winning"
      ariaLabel={`Currently winning: ${order.map((k) => `${partyShort(ctx.P, k)} ${counts.get(k)!.length}`).join(', ')}`}
      segments={order.map((k) => ({
        key: k,
        label: partyShort(ctx.P, k),
        color: partyColor(k),
        n: counts.get(k)!.length,
        describe: () => ({
          title: `${partyName(ctx.P, k)}: ${counts.get(k)!.length} of ${contest.voteFor}`,
          lines: counts
            .get(k)!
            .map((c) => ({ label: c.name, value: fmt(c.votes) })),
        }),
      }))}
    />
  )
}

/** A yes/no ballot question. */
export function QuestionBar({ contest }: { contest: Contest }) {
  const total = contest.choices.reduce((n, c) => n + c.votes, 0)
  const yes = contest.choices.find((c) => /^yes/i.test(c.name))
  const no = contest.choices.find((c) => /^no/i.test(c.name))
  const share = (c?: Choice) => (total && c ? (c.votes / total) * 100 : 0)
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-medium">{contest.label}</h3>
      {yes && no ? (
        <>
          <div
            className="flex h-7 overflow-hidden rounded-md text-xs font-medium"
            role="img"
            aria-label={`Yes ${pct1(share(yes))}, No ${pct1(share(no))}`}
          >
            <span
              className="nums flex items-center px-2 text-[var(--ref-a-foreground)]"
              style={{ flex: yes.votes || 0.0001, background: 'var(--ref-a)' }}
            >
              Yes {pct1(share(yes))}
            </span>
            <span
              className="nums flex items-center justify-end px-2 text-[var(--ref-b-foreground)]"
              style={{ flex: no.votes || 0.0001, background: 'var(--ref-b)' }}
            >
              No {pct1(share(no))}
            </span>
          </div>
          <p className="text-muted-foreground nums text-xs">
            Yes {fmt(yes.votes)} · No {fmt(no.votes)}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground nums text-xs">
          {contest.choices.map((c) => `${c.name} ${fmt(c.votes)}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
