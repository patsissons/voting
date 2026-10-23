// One election: the header, the hash-driven tabs (compass or ballot, and
// results), and the view for the tab. The path names the election and the
// hash names the view, so shared cubby.fyi links land on the same state.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { partyCss } from '@/lib/party'
import { consumeImport, keys, readJson } from '@/lib/storage'
import { useElection } from '@/lib/use-election'
import { useHash } from '@/lib/use-hash'
import { useResults } from '@/lib/use-results'
import type { CompassElection, Election } from '../../shared/schema/election.ts'
import {
  blankState,
  score,
  type CompassState,
} from '../../shared/stats/compass.ts'
import { TAB, tabOf, type BallotMarks } from '../../shared/permalink.ts'
import { ElectionHeader } from './election-header'
import { Compass } from './compass/compass'
import { ReferendumBallot } from './ballot/referendum-ballot'
import { ResultsView } from './results/results-view'

export function ElectionPage({ slug }: { slug: string }) {
  const state = useElection(slug)
  if (state.status === 'loading') {
    return (
      <Shell wide>
        <div className="space-y-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-96 max-w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Shell>
    )
  }
  if (state.status === 'missing' || state.status === 'error') {
    return (
      <Shell>
        <section className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {state.status === 'missing'
              ? 'Election not found'
              : 'Something broke'}
          </h1>
          <p className="text-muted-foreground">
            {state.status === 'missing' ? (
              <>
                There is no published election at{' '}
                <code className="bg-muted rounded px-1.5 py-0.5 text-sm">
                  /{slug}
                </code>
                .
              </>
            ) : (
              state.message
            )}{' '}
            <a
              href="/"
              className="text-foreground underline underline-offset-4"
            >
              See all elections
            </a>
            .
          </p>
        </section>
      </Shell>
    )
  }
  return <ElectionView id={state.id} election={state.election} />
}

function initialMatch(election: Election): string | null {
  if (election.ballot === 'referendum' || election.ballot === 'chambers')
    return null
  const saved = readJson<Partial<CompassState> | null>(
    keys.compass(election.slug),
    null,
  )
  const state = { ...blankState(), ...(saved || {}) }
  if (!state.done) return null
  const scored = score(election, state)
  return scored.answered ? scored.rows[0].p : null
}

function ElectionView({ id, election }: { id: string; election: Election }) {
  // First, before anything reads the hash or storage: an import link from
  // cubby.fyi stores its state and becomes the plain permalink.
  useState(() => consumeImport(election))
  const hash = useHash()
  const results = useResults(id)
  const referendum = election.ballot === 'referendum'
  // The compass tab keeps pointing at the viewer's own permalink.
  const [compassHash, setCompassHash] = useState(() =>
    tabOf(hash) === 'compass' ? hash : TAB,
  )
  const [matchParty, setMatchParty] = useState<string | null>(() =>
    initialMatch(election),
  )
  const [marks, setMarks] = useState<BallotMarks>(() =>
    referendum ? readJson<BallotMarks>(keys.ballot(election.slug), {}) : {},
  )
  const latest = results.snapshots.length
    ? results.snapshots[results.snapshots.length - 1].payload
    : null
  const named = tabOf(hash)
  const tab = named || (results.snapshots.length ? 'results' : 'compass')

  useEffect(() => {
    document.title = `${election.title} · Voting`
  }, [election.title])

  // An import link pasted into an open page: every card read its storage on
  // mount, so reload to let them read the imported state.
  useEffect(() => {
    const onHash = () => {
      if (consumeImport(election)) window.location.reload()
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [election])

  const onCompassChange = useCallback(
    (state: CompassState, next: string) => {
      setCompassHash(next || TAB)
      const scored = state.done
        ? score(election as CompassElection, state)
        : null
      setMatchParty(scored && scored.answered ? scored.rows[0].p : null)
    },
    [election],
  )
  const onMarksChange = useCallback((next: BallotMarks, nextHash: string) => {
    setMarks(next)
    setCompassHash(nextHash || TAB)
  }, [])

  const switchTab = (value: string) => {
    const next = value === 'results' ? '#/results' : compassHash || TAB
    if (window.location.hash !== next) window.location.hash = next
  }
  const css = useMemo(() => partyCss(election), [election])
  const shareHash = tab === 'results' ? '#/results' : compassHash
  const waiting = !named && !results.loaded

  return (
    <Shell
      wide
      middle={
        <span className="text-muted-foreground hidden sm:inline">
          {election.place}
        </span>
      }
    >
      {css ? <style>{css}</style> : null}
      <div className="election-scope space-y-6">
        <ElectionHeader
          election={election}
          latest={latest}
          live={results.live}
          shareHash={shareHash}
        />
        <Tabs value={tab} onValueChange={switchTab}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger
              value="compass"
              className="flex-1 sm:flex-none sm:px-5"
            >
              {referendum ? 'Your ballot' : 'Compass'}
            </TabsTrigger>
            <TabsTrigger
              value="results"
              className="flex-1 gap-2 sm:flex-none sm:px-5"
            >
              {results.live && latest ? (
                <i
                  className="bg-brand inline-block size-1.5 animate-pulse rounded-full"
                  aria-hidden="true"
                />
              ) : null}
              Results
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {waiting ? (
          <Skeleton className="h-64 w-full" />
        ) : tab === 'results' ? (
          <ResultsView
            election={election}
            snapshots={results.snapshots}
            live={results.live}
            matchParty={matchParty}
            marks={marks}
          />
        ) : referendum ? (
          <ReferendumBallot
            election={election}
            hash={hash}
            latest={latest}
            onChange={onMarksChange}
          />
        ) : election.ballot === 'chambers' ? null : (
          <Compass election={election} hash={hash} onChange={onCompassChange} />
        )}
      </div>
    </Shell>
  )
}
