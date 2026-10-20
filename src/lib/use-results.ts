import { useEffect, useState } from 'react'
import type { Snapshot } from '../../shared/payload.ts'
import { pb } from './pocketbase'
import { logger } from './logger'

export type ResultsState = {
  snapshots: Snapshot[]
  live: boolean
  loaded: boolean
}

const EMPTY: ResultsState = { snapshots: [], live: false, loaded: false }

const byStamp = (a: Snapshot, b: Snapshot) =>
  a.source_ts < b.source_ts ? -1 : a.source_ts > b.source_ts ? 1 : 0

/**
 * Every stored snapshot for an election, in stamp order, kept current.
 * Realtime is the fast path, not the only one. A phone that slept, a proxy
 * that dropped the stream or an instance restart loses events without an
 * error, and a reconnect never replays what it missed. So the hook also
 * catches up: on every reconnect, when the tab comes back into view or the
 * network returns, and once a minute while visible. Rows the stream should
 * have delivered mean the stream is dead, so the subscription is reopened.
 */
export function useResults(electionId: string | null): ResultsState {
  // Keyed by election, so a change reads as empty without a reset effect.
  const [state, setState] = useState<{
    id: string | null
    value: ResultsState
  }>({ id: electionId, value: EMPTY })

  useEffect(() => {
    if (!electionId) return
    const rows: Snapshot[] = []
    let cancelled = false
    let catching: Promise<void> | null = null
    let unsubscribe: (() => void) | null = null
    let live = false
    const results = pb.collection('results')
    const filter = pb.filter('election = {:id}', { id: electionId })

    const publish = () =>
      setState({
        id: electionId,
        value: { snapshots: rows.slice(), live, loaded: true },
      })
    const merge = (incoming: Snapshot[]) => {
      for (const row of incoming) {
        const at = rows.findIndex((r) => r.id === row.id)
        if (at >= 0) rows[at] = row
        else rows.push(row)
      }
      rows.sort(byStamp)
    }

    const subscribe = async () => {
      unsubscribe = await results.subscribe<Snapshot & { election: string }>(
        '*',
        (e) => {
          if (
            cancelled ||
            e.record.election !== electionId ||
            e.action === 'delete'
          )
            return
          merge([e.record])
          publish()
        },
        { filter },
      )
    }
    const reopen = async () => {
      try {
        if (unsubscribe) unsubscribe()
        unsubscribe = null
        await subscribe()
      } catch (err) {
        logger.warn('results stream reopen failed', err)
      }
    }
    const catchUp = (why: string) => {
      if (catching) return catching
      const last = rows.length ? rows[rows.length - 1].source_ts : ''
      catching = results
        .getFullList<Snapshot>({
          filter: pb.filter('election = {:id} && source_ts > {:ts}', {
            id: electionId,
            ts: last,
          }),
          sort: 'source_ts',
          requestKey: null,
        })
        .then((incoming) => {
          if (cancelled || !incoming.length) return
          merge(incoming)
          publish()
          if (why !== 'reconnect') return reopen()
        })
        .catch((err) => logger.warn('results catch-up failed', err))
        .finally(() => {
          catching = null
        })
      return catching
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') catchUp('visible')
    }
    const onOnline = () => catchUp('online')
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') catchUp('poll')
    }, 60000)
    let connects = 0
    let unsubscribeConnect: (() => void) | null = null

    ;(async () => {
      try {
        const initial = await results.getFullList<Snapshot>({
          filter,
          sort: 'source_ts',
          requestKey: null,
        })
        if (cancelled) return
        merge(initial)
        publish()
        await subscribe()
        if (cancelled) return
        live = true
        publish()
        unsubscribeConnect = await pb.realtime.subscribe('PB_CONNECT', () => {
          if (connects++) catchUp('reconnect')
        })
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('online', onOnline)
      } catch (err) {
        logger.warn('results unavailable', err)
        if (!cancelled) publish()
      }
    })()

    return () => {
      cancelled = true
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      if (unsubscribe) unsubscribe()
      if (unsubscribeConnect) unsubscribeConnect()
    }
  }, [electionId])

  return state.id === electionId ? state.value : EMPTY
}
