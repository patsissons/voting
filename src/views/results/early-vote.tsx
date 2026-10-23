// The early vote panel on the waiting screen, folded under the results once
// they arrive. Two feeds share it (early-vote-copy.ts has the words): the UF
// Election Lab's early vote by state (ballots cast so far as a share of the
// 2022 midterm, and party registration where a state registers by party:
// summed, on a map, and per state) and Elections BC's advance vote by
// riding (ballots per day against the last election's, share of registered
// voters, and a riding map against the last advance vote). Turnout, never a
// result, so the turnout map is one neutral hue, the party map is a
// diverging scale with a grey middle (a lean within five points reads as
// none) and every label says who has voted, not how.
import { Note, Section } from '@/components/bits'
import { Choropleth } from '@/components/charts/choropleth'
import { Dumbbell } from '@/components/charts/dumbbell'
import { Legend } from '@/components/charts/legend'
import {
  tipHandlersFor,
  useTip,
  type TipLine,
} from '@/components/charts/tooltip'
import { partyColor } from '@/lib/party'
import { keys as storageKeys, readString } from '@/lib/storage'
import { instantText } from '@/lib/time'
import type { EarlyVote } from '../../../shared/early-vote.ts'
import { compact, dayShort, fmt, pct1, signed } from '../../../shared/format.ts'
import type { Election } from '../../../shared/schema/election.ts'
import {
  MARGIN_CUTS,
  changeFromPrior,
  daySeries,
  earlyVoteDivisions,
  marginStep,
  partyMargin,
  partySplit,
  partyTotals,
  shareCuts,
  shareOfRegistered,
  stepOf,
  turnoutByState,
  type StateTurnout,
} from '../../../shared/stats/early-vote.ts'
import { earlyVoteCopy } from './early-vote-copy'
import { Tile } from './results-header'

const STEPS = 5
/** Step i of the turnout scale: the brand hue over muted, 25% to full, so the lightest step still parts from a state with no figures. */
const stepColor = (i: number) =>
  `color-mix(in oklab, var(--brand) ${Math.round(25 + (i * 75) / (STEPS - 1))}%, var(--muted))`
/** The margin map's middle: a grey apart from the muted of a state with no figures. */
const NEUTRAL = 'color-mix(in oklab, var(--muted-foreground) 45%, var(--muted))'
/** How much of the leading party's colour each band away from the middle carries. */
const BAND_MIX = [45, 70, 100]
/** The legend swatch for a hatched state. */
const HATCH =
  'repeating-linear-gradient(135deg, var(--muted) 0 2px, color-mix(in oklab, var(--muted-foreground) 40%, var(--muted)) 2px 3px)'
const pct = (share: number) => pct1(share * 100)
const whole = (share: number) => `${Math.round(share * 100)}%`
const pts = (share: number) => `${Math.round(share * 100)}`
/** "-11.0%" for a change from the baseline, or '' without one. */
const changeText = (x: { voted: number; prior?: number }) => {
  const c = changeFromPrior(x)
  return c == null ? '' : `${signed(c * 100)}%`
}

export function EarlyVotePanel({
  election,
  earlyVote: ev,
}: {
  election: Election
  earlyVote: EarlyVote
}) {
  const early = election.results.earlyVote
  const copy = earlyVoteCopy(election, ev)
  const divisions = earlyVoteDivisions(election)
  const parties = 'parties' in election ? election.parties : []
  const rows = turnoutByState(ev, divisions)
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
  const totals = partyTotals(rows)
  const margin = partyMargin(totals.party, order)
  const labelOf = (code: string) =>
    divisions.find((x) => x.key === code)?.label || code
  const days = copy.advance ? daySeries(total.days, total.priorDays) : []
  const registered = shareOfRegistered(total)
  const lines = (r: StateTurnout) =>
    copy.advance ? ridingLines(r, copy.priorYear) : stateLines(r)
  /** "Dem +18.9" for a margin, the leader named. */
  const marginText = (m: number) =>
    m === 0
      ? 'even'
      : `${nameOf(order[m > 0 ? 0 : 1])} ${signed(Math.abs(m) * 100)}`
  /** "Dem 50% · GOP 29% · Other 21%", short enough for one tooltip line. */
  const splitText = (party: Record<string, number>) =>
    partySplit(party, order)
      .map(
        (s) =>
          `${s.key === 'other' ? 'Other' : nameOf(s.key)} ${whole(s.share)}`,
      )
      .join(' · ')
  const bandColor = (step: number) =>
    step === 0
      ? NEUTRAL
      : `color-mix(in oklab, ${partyColor(order[step > 0 ? 0 : 1])} ${BAND_MIX[Math.abs(step) - 1]}%, var(--muted))`
  const bandLabel = (step: number) => {
    if (step === 0) return `within ${pts(MARGIN_CUTS[0])} pts`
    const i = Math.abs(step) - 1
    const range =
      i === MARGIN_CUTS.length - 1
        ? `${pts(MARGIN_CUTS[i])}+`
        : `${pts(MARGIN_CUTS[i])}–${pts(MARGIN_CUTS[i + 1])}`
    return `${nameOf(order[step > 0 ? 0 : 1])} ${range}`
  }
  const leanFills: Record<string, string> = {}
  const hatched: string[] = []
  for (const r of rows) {
    const m = r.party ? partyMargin(r.party, order) : null
    if (m == null) hatched.push(r.key)
    else leanFills[r.key] = bandColor(marginStep(m))
  }
  const mailStates = rows.filter((r) => r.partyMail).length
  const inPersonStates = rows.filter((r) => r.partyInPerson).length
  return (
    <section aria-labelledby="early-vote-title" className="space-y-4">
      <div className="space-y-1">
        <h2
          id="early-vote-title"
          className="text-xl font-semibold tracking-tight"
        >
          {copy.advance
            ? `Advance voting${copy.span ? `, ${copy.span}` : ''}`
            : `Ballots cast as of ${instantText(ev.asOf, election.timeZone)}`}
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          {copy.advance
            ? `Voters at advance voting places, counted in the riding where they voted, not where they live. Turnout only: no ballots are counted before final voting day. Figures as of ${instantText(ev.asOf, election.timeZone)}, preliminary.`
            : 'Early in-person votes and returned mail ballots: who has voted so far, not how. No state releases vote counts before its polls close.'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label={copy.advance ? 'Advance ballots' : 'Ballots cast'}
          value={fmt(total.voted)}
        />
        {copy.advance && registered != null ? (
          <Tile
            label="Of registered voters"
            value={pct(registered)}
            sub={`${fmt(total.registered)} registered`}
          />
        ) : null}
        {copy.advance && total.prior ? (
          <Tile
            label={`vs ${copy.priorYear}`}
            value={changeText(total)}
            sub={`${fmt(total.prior)} in ${copy.priorYear}`}
          />
        ) : null}
        {!copy.advance && total.inPerson != null && total.mail != null ? (
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

      {days.length ? (
        <Section
          id="early-vote-days"
          title="By day"
          sub={
            total.priorDays
              ? `advance ballots each day, against the same day of ${copy.priorYear}`
              : 'advance ballots each day'
          }
        >
          <Dumbbell
            rows={days.map((d, i) => ({
              label: dayShort(d.day),
              color: 'var(--brand)',
              a: d.prior == null ? d.n : d.prior,
              b: d.n,
              describe: () => ({
                title: dayShort(d.day),
                lines: [
                  { label: 'Advance ballots', value: fmt(d.n) },
                  ...(d.prior != null
                    ? [
                        {
                          label: `${copy.priorYear}, day ${i + 1}`,
                          value: fmt(d.prior),
                        },
                        {
                          label: 'Change',
                          value: changeText({ voted: d.n, prior: d.prior }),
                        },
                      ]
                    : []),
                ],
              }),
            }))}
            aLabel={`${copy.priorYear}, same day`}
            bLabel={days[0].day.slice(0, 4)}
            xFormat={compact}
            ariaLabel={`Advance ballots by day: ${days
              .map(
                (d) =>
                  `${dayShort(d.day)} ${fmt(d.n)}${d.prior != null ? ` (${copy.priorYear}: ${fmt(d.prior)})` : ''}`,
              )
              .join(', ')}`}
          />
        </Section>
      ) : null}

      {early && early.boundaries ? (
        <Section
          id="early-vote-map"
          title={copy.advance ? 'By riding' : 'By state'}
          sub={`${copy.advance ? 'advance ballots' : 'ballots cast'} as a share of ${copy.baseline}`}
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
              {
                label: copy.advance ? 'no figures' : 'no figures yet',
                color: 'var(--muted)',
              },
            ]}
          />
          <Choropleth
            set={early.boundaries}
            fills={fills}
            ring={byKey.has(mine) ? mine : undefined}
            ariaLabel={`${copy.advance ? 'Advance ballots by riding' : 'Ballots cast by state'} as a share of ${copy.baseline}: ${rows
              .filter((r) => r.share != null)
              .map((r) => `${r.label} ${whole(r.share as number)}`)
              .join(', ')}`}
            describe={(code) => {
              const r = byKey.get(code)
              const label = labelOf(code)
              if (!r)
                return {
                  title: label,
                  lines: [
                    {
                      label: copy.advance
                        ? 'No advance vote figures'
                        : 'No early vote figures yet',
                      value: '',
                    },
                  ],
                }
              return { title: label, lines: lines(r) }
            }}
          />
          {copy.advance ? (
            <Note>
              Each riding is coloured by its advance ballots as a share of its
              count in {copy.baseline}; the boundaries are unchanged since then.
              {byKey.has(mine) ? ' Your riding is outlined.' : ''}
            </Note>
          ) : null}
        </Section>
      ) : null}

      {withParty.length ? (
        <Section
          id="early-vote-party"
          title="Party registration of early voters"
          sub={`${totals.states} states that register voters by party`}
        >
          <p className="text-muted-foreground text-sm">
            This is who has voted, not how they voted.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {partySplit(totals.party, order).map((s) => (
              <Tile
                key={s.key}
                label={nameOf(s.key)}
                value={fmt(s.n)}
                sub={pct(s.share)}
              />
            ))}
          </div>
          {margin != null ? (
            <p className="nums text-sm">
              <b className="font-semibold">{marginText(margin)} pts</b> among
              early voters in the {totals.states} states that register by party,{' '}
              {whole(totals.voted / total.voted)} of all ballots cast.
            </p>
          ) : null}
          <Legend
            items={[...order, 'other'].map((key) => ({
              label: nameOf(key),
              color: partyColor(key),
            }))}
          />
          <div id="early-vote-party-total" className="space-y-1.5">
            <PartyRow
              label="Reporting states"
              title={`${totals.states} states that register by party`}
              party={totals.party}
              order={order}
              nameOf={nameOf}
            />
            {totals.mail ? (
              <PartyRow
                label="By mail"
                title={`Mail ballots returned, ${mailStates} states`}
                party={totals.mail}
                order={order}
                nameOf={nameOf}
              />
            ) : null}
            {totals.inPerson ? (
              <PartyRow
                label="In person"
                title={`Early in-person voters, ${inPersonStates} states`}
                party={totals.inPerson}
                order={order}
                nameOf={nameOf}
              />
            ) : null}
          </div>
          {totals.mail || totals.inPerson ? (
            <Note>
              The mail and in-person rows cover only the states that report the
              split by party
              {totals.mail ? ` (${mailStates} by mail` : ''}
              {totals.inPerson
                ? `${totals.mail ? ', ' : ' ('}${inPersonStates} in person)`
                : totals.mail
                  ? ')'
                  : ''}
              .
            </Note>
          ) : null}
        </Section>
      ) : null}

      {withParty.length ? (
        <Section
          id="early-vote-lean"
          title="Party registration by state"
          sub="the lead among early voters registered by party"
        >
          {early && early.boundaries && order.length >= 2 ? (
            <>
              <Legend
                items={[
                  ...[-3, -2, -1, 0, 1, 2, 3].map((step) => ({
                    label: bandLabel(step),
                    color: bandColor(step),
                  })),
                  { label: 'no party registration', color: HATCH },
                  { label: 'no figures yet', color: 'var(--muted)' },
                ]}
              />
              <Choropleth
                set={early.boundaries}
                fills={leanFills}
                hatched={hatched}
                ring={byKey.has(mine) ? mine : undefined}
                ariaLabel={`Party registration of early voters by state: ${withParty
                  .map((r) => {
                    const m = partyMargin(r.party || {}, order)
                    return m == null ? '' : `${r.label} ${marginText(m)}`
                  })
                  .filter(Boolean)
                  .join(', ')}`}
                describe={(code) => {
                  const r = byKey.get(code)
                  const title = labelOf(code)
                  if (!r)
                    return {
                      title,
                      lines: [
                        { label: 'No early vote figures yet', value: '' },
                      ],
                    }
                  const m = r.party ? partyMargin(r.party, order) : null
                  if (!r.party || m == null)
                    return {
                      title,
                      lines: [
                        { label: 'Ballots cast', value: fmt(r.voted) },
                        {
                          label: 'Does not register voters by party',
                          value: '',
                        },
                      ],
                    }
                  const lines: TipLine[] = partySplit(r.party, order).map(
                    (s) => ({
                      label: nameOf(s.key),
                      value: `${fmt(s.n)} (${pct(s.share)})`,
                      color: partyColor(s.key),
                    }),
                  )
                  lines.push({
                    label: 'Margin',
                    value: `${marginText(m)} pts`,
                  })
                  if (r.partyMail)
                    lines.push({
                      label: 'By mail',
                      value: splitText(r.partyMail),
                    })
                  if (r.partyInPerson)
                    lines.push({
                      label: 'In person',
                      value: splitText(r.partyInPerson),
                    })
                  if (r.updated)
                    lines.push({
                      label: 'Updated',
                      value: dayShort(r.updated),
                    })
                  return { title, lines }
                }}
              />
              <Note>
                Each state is coloured by the gap between the two main parties'
                shares of its early voters who are registered by party:{' '}
                {nameOf(order[0])} ahead in blue, {nameOf(order[1])} ahead in
                red, deeper the wider the gap, grey within {pts(MARGIN_CUTS[0])}{' '}
                points. Hatched states do not register voters by party. This is
                who has voted, not how they voted.
                {byKey.has(mine) ? ' Your state is outlined.' : ''}
              </Note>
            </>
          ) : null}
          <div id="early-vote-party-states" className="space-y-1.5">
            {withParty.map((r) => (
              <PartyRow
                key={r.key}
                label={r.label}
                party={r.party || {}}
                order={order}
                nameOf={nameOf}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {copy.advance ? (
        <Note>
          Advance voting turnout from{' '}
          <a
            href={early ? early.page.url : 'https://elections.bc.ca/'}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {early ? early.page.label : 'Elections BC'}
          </a>
          {early ? (
            <>
              {' '}
              (
              <a
                href={early.source}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                the daily table
              </a>
              )
            </>
          ) : null}
          , preliminary and subject to change. Vote-by-mail packages are not
          counted here: Elections BC counts them after final voting day.
        </Note>
      ) : (
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
          (CC BY-NC-ND 4.0); states report on their own schedules, so some
          figures are a day or more older than others.
        </Note>
      )}
    </section>
  )
}

/** The tooltip for a riding: advance ballots, the share of registered voters and the change from the last advance vote. */
function ridingLines(r: StateTurnout, priorYear: string) {
  const lines = [{ label: 'Advance ballots', value: fmt(r.voted) }]
  const share = shareOfRegistered(r)
  if (share != null)
    lines.push({
      label: 'Of registered voters',
      value: `${pct(share)} of ${fmt(r.registered)}`,
    })
  if (r.prior)
    lines.push({
      label: `vs ${priorYear}`,
      value: `${changeText(r)} (${fmt(r.prior)})`,
    })
  return lines
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

/** A 100% stacked bar of one party split, labelled on the left. */
function PartyRow({
  label,
  title = label,
  party,
  order,
  nameOf,
}: {
  label: string
  /** The tooltip's name for the row, when the label is short for it. */
  title?: string
  party: Record<string, number>
  order: readonly string[]
  nameOf: (key: string) => string
}) {
  const tip = useTip()
  const slices = partySplit(party, order)
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="truncate" title={title === label ? undefined : title}>
        {label}
      </span>
      <div
        className="bg-muted flex h-5 w-full overflow-hidden rounded"
        role="img"
        aria-label={`${label}: ${slices.map((s) => `${nameOf(s.key)} ${pct(s.share)}`).join(', ')}`}
      >
        {slices.map((s) =>
          s.n > 0 ? (
            <span
              key={s.key}
              tabIndex={0}
              className="nums flex items-center justify-center overflow-hidden text-[0.7rem] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              style={{ flex: s.n, background: partyColor(s.key), minWidth: 2 }}
              {...tipHandlersFor(tip, () => ({
                title: `${title}: ${nameOf(s.key)}`,
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
