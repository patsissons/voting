// Hand-written analyses, one per election that has one. An election gets the
// Analysis tab (#/analysis) only when it is listed here; each analysis is a
// bespoke module under ./<slug>/ that loads into its own chunk.
import { lazy, Suspense, type ComponentType } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { EarlyVote } from '../../../shared/early-vote.ts'
import type { Snapshot } from '../../../shared/payload.ts'
import type { Election } from '../../../shared/schema/election.ts'

export type AnalysisProps = {
  election: Election
  snapshots: Snapshot[]
  live: boolean
  /** The election's advance or early vote, where it has one. */
  earlyVote?: EarlyVote | null
}

const analyses: Record<string, ComponentType<AnalysisProps>> = {
  'alberta-2026': lazy(() => import('./alberta-2026/analysis')),
  'bc-2026': lazy(() => import('./bc-2026/analysis')),
}

/** Whether an analysis was written for the election. */
export const hasAnalysis = (slug: string): boolean =>
  Object.prototype.hasOwnProperty.call(analyses, slug)

/** The election's analysis, loading its chunk first; nothing when it has none. */
export function AnalysisView(props: AnalysisProps) {
  const View = hasAnalysis(props.election.slug)
    ? analyses[props.election.slug]
    : null
  if (!View) return null
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <View {...props} />
    </Suspense>
  )
}
