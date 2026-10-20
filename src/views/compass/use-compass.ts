// The compass state machine: answers, weights, position and mode, kept in
// localStorage per election and in the hash, so the address is a permalink.
// A code in the hash wins over the saved state: a shared link shows the
// sharer's results, and from then on it is this browser's state too.
import { useCallback, useEffect, useRef, useState } from 'react'
import { keys, readJson, writeJson } from '@/lib/storage'
import { TAB, encodeCompass, parseCompass } from '../../../shared/permalink.ts'
import type { CompassElection } from '../../../shared/schema/election.ts'
import { blankState, type CompassState } from '../../../shared/stats/compass.ts'

function load(slug: string): CompassState {
  const saved = readJson<Partial<CompassState> | null>(keys.compass(slug), null)
  return saved && typeof saved === 'object'
    ? { ...blankState(), ...saved }
    : blankState()
}

export type CompassApi = {
  state: CompassState
  hash: string
  commit: (next: CompassState) => void
  start: () => void
  reset: () => void
  answer: (i: number, k: number) => void
  weigh: (i: number, double: boolean) => void
  skip: () => void
  next: () => void
  back: () => void
  finish: () => void
  review: () => void
}

export function useCompass(
  election: CompassElection,
  initialHash: string,
  onChange?: (state: CompassState, hash: string) => void,
): CompassApi {
  const slug = election.slug
  const [state, setState] = useState<CompassState>(() => {
    const s = parseCompass(election, initialHash) || load(slug)
    if (!s.done && !(s.i >= 0 && Object.keys(s.answers).length)) s.i = -1
    return s
  })
  const encoded = encodeCompass(election, state)

  const commit = useCallback(
    (next: CompassState) => {
      setState(next)
      writeJson(keys.compass(slug), next)
      const target = encodeCompass(election, next) || TAB
      if (window.location.hash !== target)
        window.history.replaceState(null, '', target)
      if (onChange) onChange(next, encodeCompass(election, next))
    },
    [election, slug, onChange],
  )

  // On mount: keep what the hash said, sync the hash to the state, tell the page.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    writeJson(keys.compass(slug), state)
    if (window.location.hash.startsWith(TAB)) {
      const target = encoded || TAB
      if (window.location.hash !== target)
        window.history.replaceState(null, '', target)
    }
    if (onChange) onChange(state, encoded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Another code pasted into the address bar while the page is open.
  useEffect(() => {
    const onHash = () => {
      const next = parseCompass(election, window.location.hash)
      if (!next || encodeCompass(election, next) === encoded) return
      commit(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [election, commit, encoded])

  const n = election.questions.length
  const finish = useCallback(
    () => commit({ ...state, done: true, review: false }),
    [commit, state],
  )
  return {
    state,
    hash: encoded,
    commit,
    start: () => commit({ ...state, i: Math.max(0, state.i) }),
    reset: () => commit({ ...blankState(), i: 0 }),
    answer: (i, k) =>
      commit({ ...state, answers: { ...state.answers, [i]: k } }),
    weigh: (i, double) => {
      const weights = { ...state.weights }
      if (double) weights[i] = true
      else delete weights[i]
      commit({ ...state, weights })
    },
    skip: () => {
      const answers = { ...state.answers }
      delete answers[state.i]
      const cleared = { ...state, answers }
      if (state.i >= n - 1) commit({ ...cleared, done: true, review: false })
      else commit({ ...cleared, i: state.i + 1 })
    },
    next: () => {
      if (state.i >= n - 1) finish()
      else commit({ ...state, i: state.i + 1 })
    },
    back: () => {
      if (state.i === 0 && state.review) return finish()
      commit({ ...state, i: state.i - 1 })
    },
    finish,
    review: () => commit({ ...state, done: false, review: true, i: 0 }),
  }
}
