// The results tab: the waiting state before any count, or the view for the
// ballot mode, with a sticky in-page nav over its sections.
import { useEffect, useState } from 'react'
import { ExternalLink, LinkList, Note } from '@/components/bits'
import { closeTimeText, todayIn } from '@/lib/time'
import { dayLong, dayShort } from '../../../shared/format.ts'
import type { Snapshot } from '../../../shared/payload.ts'
import type { BallotMarks } from '../../../shared/permalink.ts'
import type { Election } from '../../../shared/schema/election.ts'
import { questionsReporting } from '../../../shared/stats/referendum.ts'
import { AtLargeResults, atLargeSections } from './atlarge-results'
import { DistrictResults, districtSections } from './district-results'
import { ReferendumResults, referendumSections } from './referendum-results'

export type SectionLink = { id: string; label: string }

export function ResultsView({
  election,
  snapshots,
  live,
  matchParty,
  marks,
}: {
  election: Election
  snapshots: Snapshot[]
  live: boolean
  matchParty: string | null
  marks: BallotMarks
}) {
  const latest = snapshots.length
    ? snapshots[snapshots.length - 1].payload
    : null
  const started =
    latest &&
    (election.ballot !== 'referendum' ||
      questionsReporting(latest, election) > 0)
  if (!latest || !started) return <Waiting election={election} />
  const sections =
    election.ballot === 'referendum'
      ? referendumSections(election)
      : election.ballot === 'district'
        ? districtSections(election)
        : atLargeSections(latest, election)
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
      ) : (
        <AtLargeResults
          election={election}
          snapshots={snapshots}
          live={live}
          matchParty={matchParty}
        />
      )}
    </div>
  )
}

/** Links to the page's sections; the one in view is marked. */
function SectionNav({ sections }: { sections: SectionLink[] }) {
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
      aria-label="Results sections"
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
  el.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function Waiting({ election }: { election: Election }) {
  const today = todayIn(election.timeZone)
  const advance = election.dates.advance.filter(
    (d) => d >= today && d < election.dates.final,
  )
  const results = election.results
  const source = results.label
    ? `${results.label}'s results page`
    : 'the official results page'
  const referendum = election.ballot === 'referendum'
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          No results yet
        </h2>
        <p className="max-w-prose text-lg">
          Results appear here as {results.label || 'the City'}{' '}
          {referendum ? 'posts' : 'counts'} them, starting after voting closes
          at {closeTimeText(election.pollsClose, election.timeZone)} on{' '}
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
          Until then, {referendum ? 'mark ' : 'try '}
          <a
            href={`/${election.slug}#/compass`}
            className="text-foreground underline underline-offset-4"
          >
            {referendum ? 'your own ballot' : 'the ballot compass'}
          </a>
          , or follow{' '}
          <ExternalLink href={results.official}>{source}</ExternalLink>.
        </p>
      </div>
      <LinkList eyebrow="Also follow" links={results.alternatives} />
      {results.unofficialNote ? <Note>{results.unofficialNote}</Note> : null}
    </div>
  )
}
