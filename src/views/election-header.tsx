// The election header: eyebrow, title, status, the voting days as pills with
// today marked (the election's own calendar day, so a viewer abroad sees the
// same strip), the share button for the tab being viewed, and the About
// sheet with sources, resources and the results source.
import { Info } from 'lucide-react'
import {
  ExternalLink,
  Eyebrow,
  LinkList,
  Note,
  StatusBadge,
} from '@/components/bits'
import { ShareButton } from '@/components/share-button'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { electionStatus } from '@/lib/election-status'
import { todayIn } from '@/lib/time'
import { dayShort } from '../../shared/format.ts'
import type { Payload } from '../../shared/payload.ts'
import type { Election } from '../../shared/schema/election.ts'

export function ElectionHeader({
  election,
  latest,
  live,
  shareHash,
}: {
  election: Election
  latest: Payload | null
  live: boolean
  shareHash: string
}) {
  const today = todayIn(election.timeZone)
  const d = election.dates
  const advance = d.advance.filter((day) => day < d.final)
  const status = electionStatus(d.advance, d.final, today, latest)
  const url = `${window.location.origin}/${election.slug}${shareHash}`
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1.5">
          <Eyebrow>{election.eyebrow}</Eyebrow>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {election.title}
          </h1>
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={status} live={live && status === 'counting'} />
            {election.published ? null : (
              <span className="text-muted-foreground text-xs">Draft</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AboutSheet election={election} />
          <ShareButton
            url={url}
            title={
              shareHash === '#/results'
                ? `${election.title}: live results`
                : election.title
            }
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {advance.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground mr-1 text-xs font-medium tracking-wide uppercase">
              Advance voting
            </span>
            {advance.map((day) => (
              <DayPill key={day} day={day} today={today} />
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground mr-1 text-xs font-medium tracking-wide uppercase">
            {status === 'final' || status === 'results' || status === 'counting'
              ? 'Voting day'
              : 'Final voting day'}
          </span>
          <DayPill day={d.final} today={today} final />
        </div>
      </div>
      <Note>
        {d.hours ? `Voting places are open ${d.hours}. ` : ''}
        {d.mailBy ? `${d.mailBy} ` : ''}
        {d.url ? (
          <>
            <ExternalLink href={d.url}>Where to vote</ExternalLink>.
          </>
        ) : null}
      </Note>
    </header>
  )
}

function DayPill({
  day,
  today,
  final = false,
}: {
  day: string
  today: string
  final?: boolean
}) {
  const past = day < today
  const isToday = day === today
  return (
    <span
      className={`nums inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${
        isToday
          ? 'border-brand bg-brand/10 font-semibold'
          : past
            ? 'text-muted-foreground border-dashed'
            : final
              ? 'border-foreground/40 font-medium'
              : ''
      }`}
    >
      {dayShort(day)}
      {isToday ? ' · today' : ''}
    </span>
  )
}

function AboutSheet({ election }: { election: Election }) {
  const results = election.results
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="About this election"
        >
          <Info className="size-4" />
          About
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{election.title}</SheetTitle>
          <SheetDescription>{election.description}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          <LinkList eyebrow="Before you vote" links={election.resources} />
          <LinkList
            eyebrow={
              election.ballot === 'referendum'
                ? 'Wording, context and polls from'
                : election.ballot === 'chambers'
                  ? 'Results and background from'
                  : 'Positions drawn from'
            }
            links={election.sources}
          />
          <div className="space-y-1.5">
            <Eyebrow>Results</Eyebrow>
            <p className="text-sm">
              Counts come from{' '}
              <ExternalLink href={results.official}>
                {results.label
                  ? `${results.label}'s results page`
                  : 'the official results page'}
              </ExternalLink>
              {results.serverFetch
                ? ', read every minute or two on election night'
                : ', relayed on election night'}
              .
            </p>
            {results.unofficialNote ? (
              <Note>{results.unofficialNote}</Note>
            ) : null}
          </div>
          <LinkList eyebrow="Also follow" links={results.alternatives} />
          {election.note ? (
            <Note>
              {election.note.text}
              {election.note.link ? (
                <>
                  {' '}
                  <ExternalLink href={election.note.link.url}>
                    {election.note.link.label}
                  </ExternalLink>
                  .
                </>
              ) : null}
            </Note>
          ) : null}
          {election.ballot === 'referendum' && election.pollNote ? (
            <Note>{election.pollNote}</Note>
          ) : null}
          <Note>
            Agents can read this election as markdown at{' '}
            <a
              href={`/${election.slug}.md`}
              className="underline underline-offset-4"
            >
              /{election.slug}.md
            </a>
            .
          </Note>
        </div>
      </SheetContent>
    </Sheet>
  )
}
