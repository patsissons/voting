// The results tab: the waiting state before any count, or the view for the
// ballot mode, with a sticky in-page nav over its sections. An early vote
// pulled before voting day opens the waiting screen, then stays as a folded
// section under the results.
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ExternalLink, LinkList, Note } from '@/components/bits'
import { closeTimeText, todayIn } from '@/lib/time'
import { dayLong, dayShort } from '../../../shared/format.ts'
import type { EarlyVote } from '../../../shared/early-vote.ts'
import type { Snapshot } from '../../../shared/payload.ts'
import type { BallotMarks } from '../../../shared/permalink.ts'
import type { Election } from '../../../shared/schema/election.ts'
import { questionsReporting } from '../../../shared/stats/referendum.ts'
import { AtLargeResults, atLargeSections } from './atlarge-results'
import { ChambersResults, chambersSections } from './chambers-results'
import { DistrictResults, districtSections } from './district-results'
import { EarlyVotePanel } from './early-vote'
import { earlyVoteCopy, type EarlyVoteCopy } from './early-vote-copy'
import { ReferendumResults, referendumSections } from './referendum-results'

export type SectionLink = { id: string; label: string }

export function ResultsView({
  election,
  snapshots,
  earlyVote = null,
  live,
  matchParty,
  marks,
}: {
  election: Election
  snapshots: Snapshot[]
  /** Turnout pulled before voting day: the waiting screen, then a folded section under the results. */
  earlyVote?: EarlyVote | null
  live: boolean
  matchParty: string | null
  marks: BallotMarks
}) {
  const latest = snapshots.length
    ? snapshots[snapshots.length - 1].payload
    : null
  const started =
    latest &&
    (election.ballot === 'referendum'
      ? questionsReporting(latest, election) > 0
      : election.ballot === 'chambers'
        ? snapshots.some((s) => s.payload.contests.length > 0)
        : true)
  if (!latest || !started)
    return <Waiting election={election} earlyVote={earlyVote} />
  const copy = earlyVote ? earlyVoteCopy(election, earlyVote) : null
  const sections = [
    ...(election.ballot === 'referendum'
      ? referendumSections(election)
      : election.ballot === 'district'
        ? districtSections(election)
        : election.ballot === 'chambers'
          ? chambersSections(election)
          : atLargeSections(latest, election)),
    ...(copy ? [{ id: 'early-vote', label: copy.title }] : []),
  ]
  return (
    <div className="space-y-6">
      <SectionNav sections={sections} />
      {election.ballot === 'referendum' ? (
        <ReferendumResults
          election={election}
          snapshots={snapshots}
          live={live}
          marks={marks}
        />
      ) : election.ballot === 'district' ? (
        <DistrictResults
          election={election}
          snapshots={snapshots}
          live={live}
          matchParty={matchParty}
        />
      ) : election.ballot === 'chambers' ? (
        <ChambersResults
          election={election}
          snapshots={snapshots}
          live={live}
        />
      ) : (
        <AtLargeResults
          election={election}
          snapshots={snapshots}
          live={live}
          matchParty={matchParty}
        />
      )}
      {earlyVote && copy ? (
        <EarlyVoteFolded
          election={election}
          earlyVote={earlyVote}
          copy={copy}
        />
      ) : null}
    </div>
  )
}

/** The early vote under the results: folded, since the count is the story now. */
function EarlyVoteFolded({
  election,
  earlyVote,
  copy,
}: {
  election: Election
  earlyVote: EarlyVote
  copy: EarlyVoteCopy
}) {
  return (
    <details
      id="early-vote"
      className="group bg-card text-card-foreground scroll-mt-20 rounded-xl border p-4 sm:p-5"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          <ChevronRight
            className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          <h2 className="text-lg font-semibold tracking-tight">{copy.title}</h2>
        </span>
        <span className="text-muted-foreground nums text-xs">
          {copy.caption}
        </span>
      </summary>
      <div className="mt-4">
        <EarlyVotePanel election={election} earlyVote={earlyVote} />
      </div>
    </details>
  )
}

/** Links to the page's sections; the one in view is marked. */
export function SectionNav({
  sections,
  label = 'Results sections',
}: {
  sections: SectionLink[]
  label?: string
}) {
  const [active, setActive] = useState('')
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])
  return (
    <nav
      aria-label={label}
      className="bg-background/90 sticky top-14 z-30 -mx-4 overflow-x-auto px-4 py-2 backdrop-blur"
    >
      <ul className="flex gap-1 text-sm whitespace-nowrap">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => jump(e, s.id)}
              className={`inline-block rounded-full px-3 py-1 ${active === s.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Scroll to a section without touching the hash (it names the tab and the permalink). */
function jump(e: React.MouseEvent, id: string) {
  const el = document.getElementById(id)
  if (!el) return
  e.preventDefault()
  if (el instanceof HTMLDetailsElement) el.open = true
  el.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function Waiting({
  election,
  earlyVote,
}: {
  election: Election
  earlyVote: EarlyVote | null
}) {
  const today = todayIn(election.timeZone)
  const advance = election.dates.advance.filter(
    (d) => d >= today && d < election.dates.final,
  )
  const results = election.results
  const source = results.label
    ? `${results.label}'s results page`
    : 'the official results page'
  const referendum = election.ballot === 'referendum'
  const resultsOnly = election.ballot === 'chambers'
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          No results yet
        </h2>
        <p className="max-w-prose text-lg">
          Results appear here as {results.label || 'the City'}{' '}
          {referendum ? 'posts' : resultsOnly ? 'reports' : 'counts'} them,
          starting after{' '}
          {resultsOnly ? 'the first polls close' : 'voting closes'} at{' '}
          {closeTimeText(election.pollsClose, election.timeZone)} on{' '}
          {dayLong(election.votingDay)}.
          {referendum
            ? ` Ballots are counted by hand, Question ${election.questions[0].n} first, so the later questions start reporting hours after the first.`
            : ''}{' '}
          This page updates by itself; there is no need to reload.
        </p>
        <p className="text-muted-foreground max-w-prose">
          {advance.length
            ? `You can still vote early: ${advance.length === 1 ? 'the last advance voting day is' : 'advance voting days left are'} ${advance.map(dayShort).join(', ')}. `
            : ''}
          {earlyVote
            ? `${earlyVoteCopy(election, earlyVote, today).waiting} `
            : ''}
          {resultsOnly ? (
            <>
              Until then, follow{' '}
              <ExternalLink href={results.official}>{source}</ExternalLink>.
            </>
          ) : (
            <>
              Until then, {referendum ? 'mark ' : 'try '}
              <a
                href={`/${election.slug}#/compass`}
                className="text-foreground underline underline-offset-4"
              >
                {referendum ? 'your own ballot' : 'the ballot compass'}
              </a>
              , or follow{' '}
              <ExternalLink href={results.official}>{source}</ExternalLink>.
            </>
          )}
        </p>
      </div>
      {earlyVote ? (
        <EarlyVotePanel election={election} earlyVote={earlyVote} />
      ) : null}
      <LinkList eyebrow="Also follow" links={results.alternatives} />
      {results.unofficialNote ? <Note>{results.unofficialNote}</Note> : null}
    </div>
  )
}
