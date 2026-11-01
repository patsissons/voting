// A chamber before the night: the seats held going in, a bar of the
// forecaster's rating bands against the majority line, one map that switches
// between who holds each seat and how it is rated, and the seats rated to
// change hands. The waiting screen shows it for every chamber; once the
// counts start it folds under each chamber's map.
import { useState } from 'react'
import { GroupHead, Note, Section } from '@/components/bits'
import { SegmentBar, type Segment } from '@/components/charts/bars'
import { Choropleth } from '@/components/charts/choropleth'
import { Legend } from '@/components/charts/legend'
import type { TipLine } from '@/components/charts/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { partyColor, partyLookup, partyName, partyShort } from '@/lib/party'
import { keys as storageKeys, readString } from '@/lib/storage'
import { dayLong, fmt } from '../../../shared/format.ts'
import type {
  Chamber,
  ChambersElection,
} from '../../../shared/schema/election.ts'
import {
  goingIn,
  parseRating,
  type GoingIn,
  type Rating,
  type RatingGrade,
} from '../../../shared/stats/chambers.ts'

/** The rating map's middle, a grey apart from the muted of a seat with no race. */
const NEUTRAL = 'color-mix(in oklab, var(--muted-foreground) 45%, var(--muted))'
/** How much of the party's colour each band carries, as on the early vote margin map. */
const BAND_MIX: Record<RatingGrade, number> = {
  safe: 100,
  likely: 70,
  lean: 45,
  tossup: 0,
}
const HATCH =
  'repeating-linear-gradient(135deg, var(--muted) 0 2px, color-mix(in oklab, var(--muted-foreground) 40%, var(--muted)) 2px 3px)'
const mix = (color: string, pct: number) =>
  `color-mix(in oklab, ${color} ${pct}%, var(--background))`
const hatch = (color: string) =>
  `repeating-linear-gradient(135deg, ${color} 0 5px, ${mix(color, 45)} 5px 9px)`

const GRADE_NAME: Record<RatingGrade, string> = {
  safe: 'Safe',
  likely: 'Likely',
  lean: 'Lean',
  tossup: 'Toss-up',
}

/** "Lean Dem" or "Toss-up". */
const ratingText = (
  P: ReturnType<typeof partyLookup>,
  r: Rating | null,
): string =>
  !r
    ? ''
    : r.grade === 'tossup'
      ? GRADE_NAME.tossup
      : `${GRADE_NAME[r.grade]} ${partyShort(P, r.party)}`

const bandColor = (r: Rating): string =>
  r.grade === 'tossup' || !r.party
    ? NEUTRAL
    : `color-mix(in oklab, ${partyColor(r.party)} ${BAND_MIX[r.grade]}%, var(--muted))`

/** Every chamber's pre-election picture, for the waiting screen. */
export function GoingInBlocks({ election }: { election: ChambersElection }) {
  const mine = readString(storageKeys.district(election.slug))
  const blocks = election.chambers.filter((c) => goingIn(c, election))
  if (!blocks.length) return null
  return (
    <>
      {blocks.map((chamber) => (
        <div key={chamber.key} className="space-y-6">
          <GroupHead id={chamber.key}>{chamber.label}</GroupHead>
          <GoingInSection chamber={chamber} election={election} mine={mine} />
        </div>
      ))}
    </>
  )
}

/** The same picture folded under a chamber's results, rendered only once opened. */
export function GoingInFold({
  chamber,
  election,
  mine,
}: {
  chamber: Chamber
  election: ChambersElection
  mine: string
}) {
  const [open, setOpen] = useState(false)
  if (!goingIn(chamber, election)) return null
  return (
    <details
      id={`${chamber.key}-before`}
      className="scroll-mt-20"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
        Before the election: who held each seat and how it was rated
      </summary>
      {open ? (
        <div className="pt-3">
          <GoingInSection chamber={chamber} election={election} mine={mine} />
        </div>
      ) : null}
    </details>
  )
}

export function GoingInSection({
  chamber,
  election,
  mine,
}: {
  chamber: Chamber
  election: ChambersElection
  mine: string
}) {
  const g = goingIn(chamber, election)
  const P = partyLookup(election)
  const [view, setView] = useState<'ratings' | 'holders'>('ratings')
  if (!g) return null
  const ratings = chamber.ratings || null
  const byState = !Object.keys(chamber.divisions).some((k) => k.includes('-'))
  const unit = byState ? 'state' : 'district'
  const up = Object.keys(chamber.divisions).length
  const name = (key: string | null) => partyShort(P, key)
  const heldLine = heldText(chamber, P)
  const sittingLine = g.held
    ? `${byState ? 'Seats up this year' : `Sitting members by ${unit}`}: ${g.held
        .map((h) => `${name(h.key)} ${fmt(h.n)}`)
        .join(
          ' · ',
        )}${g.open ? ` · ${g.open} with none (${byState ? 'vacant' : 'redrawn or vacant'})` : ''}.`
    : ''
  const shown = view === 'ratings' && ratings ? 'ratings' : 'holders'
  return (
    <Section
      id={`${chamber.key}-going-in`}
      title="Before the election"
      sub={
        ratings
          ? `ratings by ${ratings.label}, ${dayLong(ratings.asOf)}`
          : `${up} ${up === 1 ? 'seat' : 'seats'} up`
      }
    >
      {heldLine ? <p className="font-medium">{heldLine}</p> : null}
      {sittingLine ? (
        <p className="text-muted-foreground text-sm">{sittingLine}</p>
      ) : null}
      {ratings ? <RatingBar chamber={chamber} g={g} P={P} /> : null}
      {chamber.boundaries ? (
        <>
          {ratings && g.held ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Colour by</span>
              <ToggleGroup
                type="single"
                value={shown}
                onValueChange={(v) => v && setView(v as 'ratings' | 'holders')}
                variant="outline"
                size="sm"
                aria-label={`${chamber.label} map: colour by`}
              >
                <ToggleGroupItem value="ratings">Rating</ToggleGroupItem>
                <ToggleGroupItem value="holders">Held by</ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : null}
          <GoingInMap
            chamber={chamber}
            election={election}
            P={P}
            view={shown}
            mine={mine}
          />
        </>
      ) : null}
      {ratings ? <RatedLists g={g} P={P} /> : null}
      <Note>
        {ratings ? (
          <>
            Ratings by{' '}
            <a
              href={ratings.url}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              {ratings.label}
            </a>{' '}
            as of {dayLong(ratings.asOf)}: safe, likely and lean are the
            forecaster's own categories, and a {unit} it does not list as
            competitive is shown as safe for the party holding it.{' '}
          </>
        ) : null}
        {g.held
          ? byState
            ? 'Held by is the party of the member whose seat is up. '
            : 'Held by is the party of the sitting member, in a redrawn district the incumbent running there; a redrawn district with no incumbent, or a vacant seat, has none. '
          : null}
        {byState && chamber.boundaries
          ? mine
            ? 'Your state is outlined.'
            : 'Pick your state above to outline it.'
          : null}
      </Note>
    </Section>
  )
}

/** "Held before the election: GOP 218 · Dem 214 · Others 1 · 2 vacant." from the document's `before`, or ''. */
function heldText(chamber: Chamber, P: ReturnType<typeof partyLookup>) {
  const before = chamber.before
  if (!before) return ''
  const rows = Object.keys(before)
    .filter((k) => before[k] > 0)
    .sort((a, b) => before[b] - before[a])
  const had = rows.reduce((n, k) => n + before[k], 0)
  const vacant = chamber.seats - had
  return `Held before the election: ${rows.map((k) => `${partyShort(P, k)} ${fmt(before[k])}`).join(' · ')}${vacant > 0 ? ` · ${vacant} vacant` : ''}.`
}

function RatingBar({
  chamber,
  g,
  P,
}: {
  chamber: Chamber
  g: GoingIn
  P: ReturnType<typeof partyLookup>
}) {
  const ratings = chamber.ratings!
  const codes = Object.keys(chamber.divisions)
  const listOf = (grade: RatingGrade, party: string | null) =>
    codes
      .filter((code) => {
        const r = parseRating(ratings.divisions[code])
        return r.grade === grade && r.party === party
      })
      .map((code) => chamber.divisions[code])
  const segment = (b: GoingIn['bands'][number]): Segment => {
    const r: Rating = { grade: b.grade, party: b.party }
    const label = ratingText(P, r)
    return {
      key: `${b.grade}-${b.party || 'none'}`,
      label,
      color: bandColor(r),
      n: b.n,
      describe: () => {
        const list = b.grade === 'safe' ? [] : listOf(b.grade, b.party)
        return {
          title: `${label}: ${b.n} ${b.n === 1 ? 'seat' : 'seats'}`,
          lines: list
            .slice(0, 12)
            .map((x) => ({ label: x, value: '' }))
            .concat(
              list.length > 12
                ? [{ label: `and ${list.length - 12} more`, value: '' }]
                : [],
            ),
        }
      },
    }
  }
  const holdover = (key: string): Segment[] => {
    const n = chamber.holdovers[key] || 0
    return n
      ? [
          {
            key: `${key}-holdover`,
            label: `${partyShort(P, key)} not up`,
            color: hatch(partyColor(key)),
            n,
            describe: () => ({
              title: `${partyName(P, key)}: ${n} not up this year`,
              lines: [],
            }),
          },
        ]
      : []
  }
  const parties = g.bands
    .map((b) => b.party)
    .filter((p, i, all): p is string => !!p && all.indexOf(p) === i)
  const [first, ...others] = parties
  const segments: Segment[] = [
    ...holdover(first),
    ...g.bands.map(segment),
    ...others.flatMap(holdover),
  ]
  const words = g.bands
    .filter((b) => b.n)
    .map((b) => `${ratingText(P, { grade: b.grade, party: b.party })} ${b.n}`)
    .concat(
      parties
        .filter((key) => chamber.holdovers[key])
        .map((key) => `${partyShort(P, key)} ${chamber.holdovers[key]} not up`),
    )
    .join(', ')
  return (
    <SegmentBar
      caption="Rated seats and seats not up this year"
      majority={chamber.majority || undefined}
      ariaLabel={`${chamber.label} before the election: ${words}${chamber.majority != null ? `; ${chamber.majority} for a majority` : ''}`}
      segments={segments}
    />
  )
}

function GoingInMap({
  chamber,
  election,
  P,
  view,
  mine,
}: {
  chamber: Chamber
  election: ChambersElection
  P: ReturnType<typeof partyLookup>
  view: 'ratings' | 'holders'
  mine: string
}) {
  const ratings = chamber.ratings || null
  const holders = chamber.holders || null
  const codes = Object.keys(chamber.divisions)
  const byState = !codes.some((k) => k.includes('-'))
  const fills: Record<string, string> = {}
  const hatched: string[] = []
  const seen = new Set<string>()
  const bands: { label: string; color: string }[] = []
  for (const code of codes) {
    if (view === 'ratings' && ratings) {
      const r = parseRating(ratings.divisions[code])
      fills[code] = bandColor(r)
      const label = ratingText(P, r)
      if (!seen.has(label)) {
        seen.add(label)
        bands.push({ label, color: fills[code] })
      }
    } else if (holders) {
      const key = holders[code]
      if (key == null) hatched.push(code)
      else fills[code] = partyColor(key)
    }
  }
  const order = (label: string) => {
    const [grade, party] = label.split(' ')
    const side = party
      ? election.parties.findIndex((p) => p.short === party)
      : 0
    const rank = { Safe: 0, Likely: 1, Lean: 2, 'Toss-up': 3 }[grade] ?? 3
    return side <= 0 ? rank : 7 + side * 10 - rank
  }
  bands.sort((a, b) => order(a.label) - order(b.label))
  const legend =
    view === 'ratings'
      ? bands
      : [
          ...election.parties.map((p) => ({
            label: p.short,
            color: partyColor(p.key),
          })),
          ...(codes.some((c) => holders && holders[c] === 'other')
            ? [{ label: 'Others', color: partyColor('other') }]
            : []),
          {
            label: byState ? 'vacant' : 'no sitting member',
            color: HATCH,
          },
        ]
  const names = election.regions
  return (
    <>
      <Legend
        items={[
          ...legend,
          ...(byState
            ? [{ label: 'no race this year', color: 'var(--muted)' }]
            : []),
        ]}
      />
      <Choropleth
        set={chamber.boundaries!}
        fills={fills}
        hatched={hatched}
        ring={byState && mine ? mine : undefined}
        ariaLabel={`${chamber.label} before the election: each ${byState ? 'state' : 'district'} coloured by ${view === 'ratings' ? `its rating` : 'the party holding it'}`}
        describe={(code) => {
          const label = chamber.divisions[code]
          const stateName = names.find((r) => r.key === code.split('-')[0])
          const title = label || (stateName ? stateName.label : code)
          if (!label)
            return { title, lines: [{ label: 'No race this year', value: '' }] }
          const lines: TipLine[] = []
          const held = holders ? holders[code] : undefined
          if (held !== undefined)
            lines.push({
              label: 'Held by',
              value: held
                ? partyName(P, held)
                : byState
                  ? 'no one (vacant)'
                  : 'no one (redrawn or vacant)',
              color: held ? partyColor(held) : undefined,
            })
          const r = ratings ? parseRating(ratings.divisions[code]) : null
          if (r) {
            lines.push({
              label: 'Rating',
              value: ratingText(P, r),
              color: r.party ? partyColor(r.party) : undefined,
            })
            if (held && r.party && r.party !== held)
              lines.push({ label: 'Rated to change hands', value: '' })
          }
          return { title, lines }
        }}
      />
    </>
  )
}

function RatedLists({
  g,
  P,
}: {
  g: GoingIn
  P: ReturnType<typeof partyLookup>
}) {
  const to = g.flips
    .map((f) => f.to)
    .filter((k, i, all) => all.indexOf(k) === i)
  if (!g.flips.length && !g.tossups.length) return null
  return (
    <div className="space-y-2 text-sm">
      {to.map((key) => {
        const list = g.flips.filter((f) => f.to === key)
        return (
          <p key={key}>
            <span className="font-medium">
              Rated to go {partyShort(P, key)} ({list.length}):
            </span>{' '}
            {list
              .map(
                (f) =>
                  `${f.label} (${GRADE_NAME[f.grade].toLowerCase()}, from ${partyShort(P, f.from)})`,
              )
              .join(', ')}
            .
          </p>
        )
      })}
      {g.tossups.length ? (
        <p>
          <span className="font-medium">Toss-ups ({g.tossups.length}):</span>{' '}
          {g.tossups
            .map(
              (t) => `${t.label}${t.from ? ` (${partyShort(P, t.from)})` : ''}`,
            )
            .join(', ')}
          .
        </p>
      ) : null}
    </div>
  )
}
