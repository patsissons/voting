import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows = [
  { id: 'a', source_ts: '2026-10-24 20:10:00', payload: {} },
  { id: 'b', source_ts: '2026-10-24 20:20:00', payload: {} },
]
const getFullList = vi.fn(async () => rows.slice())
const subscribe = vi.fn(async () => () => {})
const realtime = vi.fn(async () => () => {})

vi.mock('./pocketbase', () => ({
  pb: {
    collection: () => ({ getFullList, subscribe }),
    filter: (raw: string) => raw,
    realtime: { subscribe: realtime },
  },
}))

const { useResults } = await import('./use-results')

describe('useResults', () => {
  beforeEach(() => {
    getFullList.mockClear()
    subscribe.mockClear()
    realtime.mockClear()
  })

  it('streams a live election', async () => {
    const { result } = renderHook(() => useResults('e1'))
    await waitFor(() => expect(result.current.live).toBe(true))
    expect(result.current.snapshots.map((r) => r.id)).toEqual(['a', 'b'])
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(realtime).toHaveBeenCalledTimes(1)
  })

  it('reads an archived election once, without a stream', async () => {
    const { result } = renderHook(() => useResults('e1', { stream: false }))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.snapshots.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result.current.live).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(getFullList).toHaveBeenCalledTimes(1)
    expect(subscribe).not.toHaveBeenCalled()
    expect(realtime).not.toHaveBeenCalled()
  })
})
