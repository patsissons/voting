// The early vote panel on the waiting screen: ballots cast so far, by state
// as a share of the 2022 midterm, and by party registration where a state
// registers by party. Turnout, never a result, so the map is one neutral
// hue and every label says ballots cast. The hooks pull the counts
// (server/early-vote.ts); the panel goes with the waiting screen when the
// first results arrive.
import { Note, Section } from '@/components/bits'
import { Choropleth } from '@/components/charts/choropleth'
import { Legend } from '@/components/charts/legend'
import { tipHandlersFor, useTip } from '@/components/charts/tooltip'
import { partyColor } from '@/lib/party'
import { keys as storageKeys, readString } from '@/lib/storage'
import { instantText } from '@/lib/time'
import type { EarlyVote } from '../../../shared/early-vote.ts'
import { dayShort, fmt, pct1 } from '../../../shared/format.ts'
import type { Election } from '../../../shared/schema/election.ts'
import {
  partySplit,
  shareCuts,
  stepOf,
  turnoutByState,
  type StateTurnout,
} from '../../../shared/stats/early-vote.ts'
import { Tile } from './results-header'

const STEPS = 5
/** Step i of the turnout scale: the brand hue over muted, lightest first. */
const stepColor = (i: number) =>
  `color-mix(in oklch, var(--brand) ${Math.round(((i + 1) / STEPS) * 100)}%, var(--muted))`
const pct = (share: number) => pct1(share * 100)
const whole = (share: number) => `${Math.round(share * 100)}%`

export function EarlyVotePanel({
  election,
  earlyVote: ev,
}: {
  election: Election
  earlyVote: EarlyVote
}) {
  const early = election.results.earlyVote
  const regions = 'regions' in election ? election.regions : []
  const parties = 'parties' in election ? election.parties : []
  const rows = turnoutByState(ev, regions)
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const cuts = shareCuts(
    rows.map((r) => r.share || 0),
    STEPS,
  )
  const fills: Record<string, string> = {}
  for (const r of rows)
    if (r.share != null) fills[r.key] = stepColor(stepOf(r.share, cuts))
  const withParty = rows.filter((r) => r.party)
  const order = parties.map((p) => p.key)
  const nameOf = (key: string) =>
    parties.find((p) => p.key === key)?.short ||
    (key === 'other' ? 'Unaffiliated or other' : key)
  const mine = readString(storageKeys.district(election.slug))
  const { total } = ev
  return (
    <section aria-labelledby="early-vote-title" className="space-y-4">
      <div className="space-y-1">
        <h2
          id="early-vote-title"
          className="text-xl font-semibold tracking-tight"
        >
          Ballots cast as of {instantText(ev.asOf, election.timeZone)}
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          Early in-person votes and returned mail ballots: who has voted so far,
          not how. No state releases vote counts before its polls close.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Ballots cast" value={fmt(total.voted)} />
        {total.inPerson != null && total.mail != null ? (
          <>
            <Tile
              label="In person"
              value={fmt(total.inPerson)}
              sub={pct(total.inPerson / total.voted)}
            />
            <Tile
              label="By mail"
              value={fmt(total.mail)}
              sub={pct(total.mail / total.voted)}
            />
          </>
        ) : null}
      </div>

      {early && early.boundaries ? (
        <Section
          id="early-vote-map"
          title="By state"
          sub="ballots cast as a share of the 2022 midterm"
        >
          <Legend
            items={[
              ...Array.from({ length: STEPS }, (_, i) => ({
                label:
                  i === 0
                    ? `under ${whole(cuts[0])}`
                    : i === STEPS - 1
                      ? `${whole(cuts[i - 1])}+`
                      : `${whole(cuts[i - 1])}–${whole(cuts[i])}`,
                color: stepColor(i),
              })),
              { label: 'no figures yet', color: 'var(--muted)' },
            ]}
          />
          <Choropleth
            set={early.boundaries}
            fills={fills}
            ring={byKey.has(mine) ? mine : undefined}
            ariaLabel={`Ballots cast by state as a share of the 2022 midterm: ${rows
              .filter((r) => r.share != null)
              .map((r) => `${r.label} ${whole(r.share as number)}`)
              .join(', ')}`}
            describe={(code) => {
              const r = byKey.get(code)
              const label = regions.find((x) => x.key === code)?.label || code
              if (!r)
                return {
                  title: label,
                  lines: [{ label: 'No early vote figures yet', value: '' }],
                }
              return { title: label, lines: stateLines(r) }
            }}
          />
        </Section>
      ) : null}

      {withParty.length ? (
        <Section
          id="early-vote-party"
          title="Party registration of early voters"
          sub={`${withParty.length} states that register voters by party`}
        >
          <p className="text-muted-foreground text-sm">
            This is who has voted, not how they voted.
          </p>
          <Legend
            items={[...order, 'other'].map((key) => ({
              label: nameOf(key),
              color: partyColor(key),
            }))}
          />
          <div className="space-y-1.5">
            {withParty.map((r) => (
              <PartyRow
                key={r.key}
                row={r}
                slices={partySplit(r.party || {}, order)}
                nameOf={nameOf}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Note>
        Counts of ballots cast from{' '}
        <a
          href={early ? early.page.url : 'https://election.lab.ufl.edu/'}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {early ? early.page.label : 'the UF Election Lab'}
        </a>{' '}
        (CC BY-NC-ND 4.0); states report on their own schedules, so some figures
        are a day or more older than others.
      </Note>
    </section>
  )
}

function stateLines(r: StateTurnout) {
  const lines = [{ label: 'Ballots cast', value: fmt(r.voted) }]
  if (r.inPerson != null && r.mail != null)
    lines.push(
      { label: 'In person', value: fmt(r.inPerson) },
      { label: 'By mail', value: fmt(r.mail) },
    )
  if (r.share != null)
    lines.push({ label: 'Share of 2022', value: pct(r.share) })
  if (r.updated) lines.push({ label: 'Updated', value: dayShort(r.updated) })
  return lines
}

function PartyRow({
  row,
  slices,
  nameOf,
}: {
  row: StateTurnout
  slices: ReturnType<typeof partySplit>
  nameOf: (key: string) => string
}) {
  const tip = useTip()
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="truncate">{row.label}</span>
      <div
        className="bg-muted flex h-5 w-full overflow-hidden rounded"
        role="img"
        aria-label={`${row.label}: ${slices.map((s) => `${nameOf(s.key)} ${pct(s.share)}`).join(', ')}`}
      >
        {slices.map((s) =>
          s.n > 0 ? (
            <span
              key={s.key}
              tabIndex={0}
              className="nums flex items-center justify-center overflow-hidden text-[0.7rem] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              style={{ flex: s.n, background: partyColor(s.key), minWidth: 2 }}
              {...tipHandlersFor(tip, () => ({
                title: `${row.label}: ${nameOf(s.key)}`,
                lines: [
                  { label: 'Early voters', value: fmt(s.n) },
                  { label: 'Share', value: pct(s.share) },
                ],
              }))}
            >
              {s.share >= 0.12 ? whole(s.share) : ''}
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}
