// A results-only election (the US midterms): the viewer's state, then for
// every chamber its balance of power (called, leading and not up, with the
// majority line), the map, every race by state with a filter, the closest
// uncalled races and the seat timeline. Race calls are the feed's own.
import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { GroupHead, Note, Section, Swatch } from '@/components/bits'
import { SegmentBar, type Segment } from '@/components/charts/bars'
import { Choropleth } from '@/components/charts/choropleth'
import { Legend } from '@/components/charts/legend'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { blendCss } from '@/lib/blend'
import { partyColor, partyLookup, partyName, partyShort } from '@/lib/party'
import { keys as storageKeys, readString, writeString } from '@/lib/storage'
import { fmt, pct1 } from '../../../shared/format.ts'
import type { Contest, Payload, Snapshot } from '../../../shared/payload.ts'
import type {
  Chamber,
  ChambersElection,
} from '../../../shared/schema/election.ts'
import { blendWeights, LEADER } from '../../../shared/stats/blend.ts'
import {
  balanceOf,
  calledOf,
  chamberTimeline,
  closestIn,
  contestsOf,
  inState,
  type Balance,
} from '../../../shared/stats/chambers.ts'
import {
  complete,
  leaderOf,
  ridingsLed,
  voteShares,
} from '../../../shared/stats/results.ts'
import { RaceBody, RaceRow, labelOf, type RaceContext } from './race'
import { SourceNote, StatusLine, Tile } from './results-header'
import type { SectionLink } from './results-view'
import { TimelineSection } from './sections'

export const chambersSections = (election: ChambersElection): SectionLink[] => [
  { id: 'mine', label: 'Your state' },
  ...election.chambers.map((c) => ({ id: c.key, label: c.label })),
]

/** The newest snapshot that still carries its contests (older rows keep only the chamber tallies). */
const latestFull = (snapshots: Snapshot[]): Payload => {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const p = snapshots[i].payload
    if (p && p.contests && p.contests.length) return p
  }
  return snapshots[snapshots.length - 1].payload
}

export function ChambersResults({
  election,
  snapshots,
  live,
}: {
  election: ChambersElection
  snapshots: Snapshot[]
  live: boolean
}) {
  const latest = latestFull(snapshots)
  const P = useMemo(() => partyLookup(election), [election])
  const ctx: RaceContext = { election, P, matchParty: null }
  const done = complete(latest)
  const [mine, setMine] = useState(() =>
    readString(storageKeys.district(election.slug)),
  )
  const state = election.regions.find((r) => r.key === mine)
  const own = state ? inState(latest, state.key) : []
  const share = latest.polls.total
    ? latest.polls.closed / latest.polls.total
    : 0
  const source = election.results.label || 'the feed'
  return (
    <div className="space-y-6">
      <StatusLine
        latest={latest}
        live={live}
        done={done}
        doneText="Every race called"
        owner={`${source}'s`}
        timeZone={election.timeZone}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label="Races called"
          value={fmt(latest.polls.closed)}
          sub={`of ${fmt(latest.polls.total)} · ${pct1(share * 100)}`}
          share={share}
        />
        <Tile
          label="Votes counted"
          value={fmt(latest.ballots)}
          sub="in House races"
        />
        {latest.turnout != null ? (
          <Tile
            label="Turnout"
            value={pct1(latest.turnout * 100)}
            sub={`of ${fmt(latest.eligible)} registered`}
          />
        ) : null}
      </div>

      <Section
        id="mine"
        title={state ? `Your state: ${state.label}` : 'Your state'}
        sub={state ? `${own.length} races` : 'pick one'}
      >
        <StatePicker
          election={election}
          value={mine}
          onChange={(key) => {
            setMine(key)
            writeString(storageKeys.district(election.slug), key)
          }}
        />
        {state ? (
          own.length ? (
            <div className="divide-y">
              {own.map((c) => (
                <div key={c.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                  <h3 className="text-sm font-medium">
                    {chamberOf(election, c.kind)?.label || c.kind}
                    {c.kind === 'house' ? `: ${c.label}` : ''}
                  </h3>
                  <RaceBody contest={c} ctx={ctx} />
                </div>
              ))}
            </div>
          ) : (
            <Note>No races reported for {state.label} yet.</Note>
          )
        ) : (
          <Note>
            Pick your state to see its Senate, governor and House races here,
            outlined on the maps and first in the lists below.
          </Note>
        )}
      </Section>

      {election.chambers.map((chamber) => (
        <ChamberBlock
          key={chamber.key}
          chamber={chamber}
          latest={latest}
          snapshots={snapshots}
          ctx={ctx}
          mine={state ? state.key : ''}
        />
      ))}

      <SourceNote>
        Results and race calls: {election.results.label || 'the feed'}
        {election.results.official ? (
          <>
            {' '}
            (
            <a
              href={election.results.official}
              target="_blank"
              rel="noopener"
              className="underline underline-offset-4"
            >
              their results page
            </a>
            )
          </>
        ) : null}
        . A race shows as called only when {source} has called it; until then
        the leader is just leading. {election.results.unofficialNote || ''}
      </SourceNote>
    </div>
  )
}

const chamberOf = (election: ChambersElection, key: string) =>
  election.chambers.find((c) => c.key === key)

function StatePicker({
  election,
  value,
  onChange,
}: {
  election: ChambersElection
  value: string
  onChange: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = election.regions.find((r) => r.key === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Your state"
          className="w-full justify-between sm:w-80"
        >
          <span className="truncate">
            {current ? current.label : 'Choose a state'}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search states" />
          <CommandList>
            <CommandEmpty>No state found.</CommandEmpty>
            <CommandGroup>
              {election.regions.map((r) => (
                <CommandItem
                  key={r.key}
                  value={`${r.label} ${r.key}`}
                  onSelect={() => {
                    onChange(r.key === value ? '' : r.key)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={`size-4 ${r.key === value ? 'opacity-100' : 'opacity-0'}`}
                  />
                  {r.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ChamberBlock({
  chamber,
  latest,
  snapshots,
  ctx,
  mine,
}: {
  chamber: Chamber
  latest: Payload
  snapshots: Snapshot[]
  ctx: RaceContext
  mine: string
}) {
  const election = ctx.election as ChambersElection
  const contests = contestsOf(latest, chamber.key)
  const balance = balanceOf(latest, chamber, election)
  const up = Object.keys(chamber.divisions).length
  return (
    <>
      <GroupHead id={chamber.key}>{chamber.label}</GroupHead>
      <BalanceSection
        chamber={chamber}
        balance={balance}
        contests={contests}
        ctx={ctx}
      />
      <MapSection chamber={chamber} contests={contests} ctx={ctx} mine={mine} />
      <RacesSection
        chamber={chamber}
        contests={contests}
        ctx={ctx}
        mine={mine}
        up={up}
      />
      <ClosestSection chamber={chamber} contests={contests} ctx={ctx} />
      <TimelineSection
        id={`${chamber.key}-timeline`}
        t={chamberTimeline(snapshots, chamber.key, election)}
        title={`How the ${chamber.short} count moved`}
        sub="seats led by share of the expected vote in"
        yFormat={(v) => String(Math.round(v))}
        ariaLabel={`${chamber.label}: seats led by party as the expected vote came in`}
      />
    </>
  )
}

/** "+3", "−2" or "±0": a gain or loss of seats. */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')
const mix = (color: string, pct: number) =>
  `color-mix(in oklab, ${color} ${pct}%, var(--background))`
const hatch = (color: string) =>
  `repeating-linear-gradient(135deg, ${color} 0 5px, ${mix(color, 45)} 5px 9px)`

function BalanceSection({
  chamber,
  balance,
  contests,
  ctx,
}: {
  chamber: Chamber
  balance: Balance
  contests: Contest[]
  ctx: RaceContext
}) {
  const { P } = ctx
  const rows = balance.rows
  const total = (r: Balance['rows'][number]) =>
    r.called + r.leading + r.holdover
  const names = (key: string, called: boolean) =>
    contests
      .filter((c) => {
        const w = calledOf(c)
        if (called) return !!w && (w.party || 'other') === key
        const lead = leaderOf(c)
        return !w && !!lead && (lead.party || 'other') === key
      })
      .map((c) => c.label)
  const describe =
    (key: string, kind: 'called' | 'leading' | 'holdover', n: number) => () => {
      const list = kind === 'holdover' ? [] : names(key, kind === 'called')
      const r = rows.find((x) => x.key === key)
      const change =
        kind === 'called' && r && r.net != null
          ? [
              { label: 'Held before', value: fmt(r.before || 0) },
              { label: 'Net, called and not up', value: signed(r.net) },
            ]
          : []
      return {
        title: `${partyName(P, key)}: ${n} ${kind === 'holdover' ? 'not up this year' : kind}`,
        lines: list
          .slice(0, 12)
          .map((x) => ({ label: x, value: '' }))
          .concat(
            list.length > 12
              ? [{ label: `and ${list.length - 12} more`, value: '' }]
              : [],
          )
          .concat(change),
      }
    }
  const side = (r: Balance['rows'][number], reverse: boolean): Segment[] => {
    const color = partyColor(r.key === 'other' ? null : r.key)
    const short = partyShort(P, r.key)
    const parts: Segment[] = [
      {
        key: `${r.key}-called`,
        label: `${short} called`,
        color,
        n: r.called,
        describe: describe(r.key, 'called', r.called),
      },
      {
        key: `${r.key}-leading`,
        label: `${short} leading`,
        color: mix(color, 62),
        n: r.leading,
        describe: describe(r.key, 'leading', r.leading),
      },
      {
        key: `${r.key}-holdover`,
        label: `${short} not up`,
        color: hatch(color),
        n: r.holdover,
        describe: describe(r.key, 'holdover', r.holdover),
      },
    ]
    return reverse ? parts.reverse() : parts
  }
  const [first, ...rest] = rows
  const last = rest.length ? rest[rest.length - 1] : null
  const middle = rest.slice(0, -1)
  const segments: Segment[] = [
    ...(first ? side(first, false) : []),
    ...middle.flatMap((r) => side(r, false)),
    {
      key: 'undecided',
      label: 'No leader yet',
      color: 'var(--muted-foreground)',
      n: balance.undecided,
      describe: () => ({
        title: `${balance.undecided} races with no votes counted yet`,
        lines: [],
      }),
    },
    ...(last ? side(last, true) : []),
  ]
  const ranked = rows.slice().sort((a, b) => total(b) - total(a))
  const firm = (r: Balance['rows'][number]) => r.called + r.holdover
  // The net change once a seat is called: firm seats against those held before.
  const withNet = (r: Balance['rows'][number]) =>
    `${partyShort(P, r.key)} ${total(r)}${balance.called && r.net != null ? ` (${signed(r.net)})` : ''}`
  const held = rows
    .filter((r) => r.before)
    .sort((a, b) => (b.before || 0) - (a.before || 0))
  const before =
    balance.vacant == null
      ? ''
      : `Before the election: ${held.map((r) => `${partyShort(P, r.key)} ${fmt(r.before || 0)}`).join(' · ')}${balance.vacant ? ` · ${balance.vacant} vacant` : ''}.${balance.called ? ' The change in brackets counts seats called and not up, not leads.' : ''}`
  let line = ''
  if (ranked.length >= 2) {
    const [a, b] = ranked
    const majority = balance.majority
    const holder =
      majority != null ? rows.find((r) => firm(r) >= majority) : null
    line = `${withNet(a)} · ${withNet(b)}`
    if (holder)
      line += ` · ${partyName(P, holder.key)} has a majority: ${firm(holder)} seats called or not up.`
    else if (majority != null)
      line += ` · ${partyShort(P, a.key)} ${majority - firm(a) > 0 ? `is ${majority - firm(a)} short of a majority counting called seats and holdovers` : 'has the seats called or not up for a majority'}${a.leading ? `, leading in ${a.leading} more` : ''}.`
    else line += ` of ${balance.seats}.`
  }
  return (
    <Section
      id={`${chamber.key}-balance`}
      title="Balance of power"
      sub={`${balance.called} of ${Object.keys(chamber.divisions).length} races called${balance.majority != null ? ` · ${balance.majority} of ${balance.seats} for a majority` : ` · ${balance.seats} in all`}`}
    >
      {line ? <p className="font-medium">{line}</p> : null}
      {before ? (
        <p className="text-muted-foreground text-sm">{before}</p>
      ) : null}
      <SegmentBar
        caption="Called, leading and not up this year"
        majority={balance.majority || undefined}
        ariaLabel={`${chamber.label}: ${rows.map((r) => `${partyShort(P, r.key)} ${total(r)} (${r.called} called, ${r.leading} leading, ${r.holdover} not up)`).join(', ')}; ${balance.undecided} undecided${balance.majority != null ? `; ${balance.majority} for a majority` : ''}`}
        segments={segments}
      />
    </Section>
  )
}

function MapSection({
  chamber,
  contests,
  ctx,
  mine,
}: {
  chamber: Chamber
  contests: Contest[]
  ctx: RaceContext
  mine: string
}) {
  const { election, P } = ctx
  if (!chamber.boundaries) return null
  const byState = chamber.key !== 'house'
  const codeOf = (c: Contest) => (byState ? c.region || c.id : c.id)
  const byCode = new Map(contests.map((c) => [codeOf(c), c]))
  const fills: Record<string, string> = {}
  for (const c of contests) {
    const w = calledOf(c)
    fills[codeOf(c)] = w
      ? partyColor(w.party)
      : blendCss(blendWeights(voteShares(c)), partyColor)
  }
  const hasOthers = contests.some((c) => c.choices.some((ch) => !ch.party))
  const names = (election as ChambersElection).regions
  return (
    <Section
      id={`${chamber.key}-map`}
      title="Map"
      sub={
        byState
          ? 'states with a race this year'
          : 'every district by vote share'
      }
    >
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
        set={chamber.boundaries}
        fills={fills}
        ring={byState && mine ? mine : undefined}
        ariaLabel={`${chamber.label}: each ${byState ? 'state' : 'district'} coloured by its leader, blended by vote share until called`}
        describe={(code) => {
          const c = byCode.get(code)
          const stateName = names.find((r) => r.key === code.split('-')[0])
          const title = c ? c.label : stateName ? stateName.label : code
          const shares = c ? voteShares(c).filter((s) => s.share > 0) : []
          if (!c)
            return { title, lines: [{ label: 'No race this year', value: '' }] }
          if (!shares.length)
            return {
              title,
              lines: [{ label: 'Votes', value: 'none counted yet' }],
            }
          const w = calledOf(c)
          const lead = leaderOf(c)
          return {
            title,
            lines: [
              ...shares.slice(0, 5).map((s) => ({
                label: partyShort(P, s.key),
                value: pct1(s.share),
                color: partyColor(s.key),
              })),
              ...(w
                ? [{ label: 'Called', value: w.name }]
                : lead
                  ? [{ label: 'Leading', value: lead.name }]
                  : []),
              { label: 'Expected vote in', value: pct1(c.reporting || 0) },
            ],
          }
        }}
      />
      <Note>
        A called race shows its winner's colour in full. Until then each{' '}
        {byState ? 'state' : 'district'} blends its parties' colours by their
        share of the vote, sharpened so the leader makes up at least{' '}
        {Math.round(LEADER * 100)}% of the colour. Grey means no votes counted
        yet{byState ? ', or no race this year' : ''}.
        {byState
          ? mine
            ? ' Your state is outlined.'
            : ' Pick your state above to outline it.'
          : ''}
      </Note>
    </Section>
  )
}

function RacesSection({
  chamber,
  contests,
  ctx,
  mine,
  up,
}: {
  chamber: Chamber
  contests: Contest[]
  ctx: RaceContext
  mine: string
  up: number
}) {
  const { P } = ctx
  const election = ctx.election as ChambersElection
  const [q, setQ] = useState('')
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({})
  const needle = q.trim().toLowerCase()
  const text = (c: Contest) =>
    `${c.label} ${c.choices.map((ch) => `${ch.name} ${labelOf(P, ch)}`).join(' ')}`.toLowerCase()
  const groups = election.regions
    .map((reg) => ({ reg, list: contests.filter((c) => c.region === reg.key) }))
    .filter((g) => g.list.length)
  return (
    <Section
      id={`${chamber.key}-races`}
      title="Every race"
      sub={`${up} ${up === 1 ? 'race' : 'races'} in ${groups.length} states`}
    >
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a state, district or candidate"
        aria-label={`Find a ${chamber.short} race or candidate`}
        className="max-w-sm"
      />
      <div className="space-y-2">
        {groups.map(({ reg, list }) => {
          const hits = list.filter((c) => !needle || text(c).includes(needle))
          if (needle && !hits.length) return null
          const counts = ridingsLed(list, election)
          const called = list.filter((c) => calledOf(c)).length
          const open = needle ? true : (openStates[reg.key] ?? reg.key === mine)
          return (
            <details
              key={reg.key}
              open={open}
              onToggle={(e) =>
                !needle &&
                setOpenStates({
                  ...openStates,
                  [reg.key]: (e.target as HTMLDetailsElement).open,
                })
              }
              className="rounded-lg border"
            >
              <summary className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm font-medium">
                <span>
                  {reg.label}
                  {reg.key === mine ? (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      · yours
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground nums text-xs font-normal">
                  {list.length === 1 ? '1 race' : `${list.length} races`}
                  {called ? ` · ${called} called` : ''} ·{' '}
                  {counts
                    .map(([k, n]) => `${partyShort(P, k)} ${n}`)
                    .join(', ') || 'no counts yet'}
                </span>
              </summary>
              <div className="divide-y border-t">
                {hits.map((c) => (
                  <RaceRow
                    key={c.id}
                    contest={c}
                    ctx={ctx}
                    meta={`${pct1(c.reporting || 0)} in`}
                  />
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </Section>
  )
}

function ClosestSection({
  chamber,
  contests,
  ctx,
}: {
  chamber: Chamber
  contests: Contest[]
  ctx: RaceContext
}) {
  const near = closestIn(contests, 8)
  if (!near.length) return null
  return (
    <Section
      id={`${chamber.key}-closest`}
      title="Closest uncalled races"
      sub="by the leader's margin in points"
    >
      <div className="divide-y">
        {near.map((c) => (
          <div
            key={c.id}
            className="nums grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7rem]"
          >
            <span className="truncate font-medium">{c.label}</span>
            <span
              className="col-span-2 flex items-center gap-1.5 sm:col-span-1"
              style={
                { '--party': partyColor(c.lead.party) } as React.CSSProperties
              }
            >
              <Swatch party={c.lead.party} />
              <span className="truncate">{c.lead.name}</span>
              <small className="text-muted-foreground">
                over {c.next.name}
              </small>
            </span>
            <span className="text-muted-foreground col-start-2 row-start-1 text-right text-xs sm:col-start-3">
              {labelOf(ctx.P, c.lead)} +{c.margin.toFixed(1)} · {fmt(c.votes)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}
