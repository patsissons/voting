import { useEffect, useState } from 'react'
import type { ElectionRow } from '../../shared/election-row.ts'
import { fromRow } from '../../shared/election-row.ts'
import type { Election } from '../../shared/schema/election.ts'
import { pb } from './pocketbase'
import { logger } from './logger'

export type ElectionState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; id: string; election: Election }

const LOADING: ElectionState = { status: 'loading' }

/** The election row for a slug, as its document (config column merged). */
export function useElection(slug: string): ElectionState {
  // Keyed by slug, so a slug change reads as loading without a reset effect.
  const [loaded, setLoaded] = useState<{
    slug: string
    state: ElectionState
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    pb.collection('elections')
      .getFirstListItem<ElectionRow & { id: string }>(
        pb.filter('slug = {:slug}', { slug }),
        { requestKey: null },
      )
      .then((row) => {
        if (cancelled) return
        setLoaded({
          slug,
          state: { status: 'ready', id: row.id, election: fromRow(row) },
        })
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return
        if (err && err.status === 404)
          setLoaded({ slug, state: { status: 'missing' } })
        else {
          logger.warn('election failed to load', err)
          setLoaded({
            slug,
            state: {
              status: 'error',
              message: (err && err.message) || 'failed to load',
            },
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [slug])
  return loaded && loaded.slug === slug ? loaded.state : LOADING
}

export type IndexRow = {
  id: string
  slug: string
  title: string
  description: string
  voting_day: string
  ballot: Election['ballot']
}

/** The published elections for the index, newest voting day first, without their config. */
export function useElectionList(): {
  status: 'loading' | 'ready' | 'error'
  rows: IndexRow[]
} {
  const [rows, setRows] = useState<IndexRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    pb.collection('elections')
      .getFullList<IndexRow>({
        sort: '-voting_day',
        fields: 'id,slug,title,description,voting_day,ballot',
        requestKey: null,
      })
      .then((list) => {
        if (!cancelled) setRows(list)
      })
      .catch((err) => {
        logger.warn('elections failed to load', err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return {
    status: failed ? 'error' : rows ? 'ready' : 'loading',
    rows: rows || [],
  }
}
