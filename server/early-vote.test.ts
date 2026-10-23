import { describe, expect, it } from 'vitest'
import { fixture, us, vancouver } from '../scripts/fixtures/load.ts'
import { asEarlyVote } from '../shared/early-vote.ts'
import { memoryDb } from './db.memory.ts'
import { EARLY_VOTE_THROTTLE_MS, earlyVoteTick } from './early-vote.ts'
import type { Http } from './store.ts'

const csv = fixture('voting-2026-early-vote.csv')
const modified = 'Fri, 23 Oct 2026 19:25:09 GMT'
const now = Date.parse('2026-10-23T20:00:00Z')

type Answer = ReturnType<Http['get']>
const fakeHttp = (
  answer: (url: string) => Answer,
): Http & { calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    get(url) {
      calls.push(url)
      return answer(url)
    },
  }
}

function setup(answer: () => Answer) {
  const db = memoryDb()
  db.addElection(vancouver())
  const row = db.addElection(us())
  return { db, row, http: fakeHttp(answer) }
}

describe('earlyVoteTick', () => {
  it('pulls only elections with a source and stores the counts', () => {
    const { db, row, http } = setup(() => ({
      status: 200,
      text: csv,
      lastModified: modified,
    }))
    const out = earlyVoteTick(db, http, { now })
    expect(out).toEqual([
      {
        slug: 'us-2026',
        ran: true,
        stored: true,
        asOf: '2026-10-23T19:25:09.000Z',
        states: 5,
      },
    ])
    expect(http.calls).toEqual([
      `https://election.lab.ufl.edu/data-downloads/earlyvote/2026/US.csv?_=${now}`,
    ])
    const ev = asEarlyVote(row.getString('early_vote'))!
    expect(ev.states.nc.party).toEqual({
      dem: 535973,
      gop: 296478,
      other: 437469,
    })
    expect(row.getString('early_vote_checked')).toBe('2026-10-23 20:00:00.000Z')
    expect(row.getString('early_vote_error')).toBe('')
  })

  it('throttles, then calls a repeat unchanged', () => {
    const { db, row, http } = setup(() => ({
      status: 200,
      text: csv,
      lastModified: modified,
    }))
    earlyVoteTick(db, http, { now })
    const stored = row.get('early_vote')
    expect(earlyVoteTick(db, http, { now: now + 60000 })[0].skipped).toBe(
      'throttled',
    )
    const later = earlyVoteTick(db, http, {
      now: now + EARLY_VOTE_THROTTLE_MS,
    })
    expect(later[0]).toMatchObject({ ran: true, unchanged: true })
    expect(row.get('early_vote')).toBe(stored)
    expect(http.calls.length).toBe(2)
  })

  it('takes a newer Last-Modified, and without one only moved counts', () => {
    let answer: Answer = { status: 200, text: csv, lastModified: modified }
    const { db, row, http } = setup(() => answer)
    earlyVoteTick(db, http, { now })
    answer = { ...answer, lastModified: 'Sat, 24 Oct 2026 19:00:00 GMT' }
    const t2 = now + EARLY_VOTE_THROTTLE_MS
    expect(earlyVoteTick(db, http, { now: t2 })[0].stored).toBe(true)
    answer = { status: 200, text: csv }
    const t3 = t2 + EARLY_VOTE_THROTTLE_MS
    expect(earlyVoteTick(db, http, { now: t3 })[0].unchanged).toBe(true)
    answer = { status: 200, text: csv.replace(',30999,', ',31000,') }
    const t4 = t3 + EARLY_VOTE_THROTTLE_MS
    expect(earlyVoteTick(db, http, { now: t4 })[0].stored).toBe(true)
    expect(asEarlyVote(row.getString('early_vote'))!.asOf).toBe(
      new Date(t4).toISOString(),
    )
  })

  it('keeps the last good counts when a pull fails', () => {
    let answer: Answer = { status: 200, text: csv, lastModified: modified }
    const { db, row, http } = setup(() => answer)
    earlyVoteTick(db, http, { now })
    const stored = row.get('early_vote')
    answer = { status: 403, text: 'Forbidden' }
    const t2 = now + EARLY_VOTE_THROTTLE_MS
    expect(earlyVoteTick(db, http, { now: t2 })[0]).toEqual({
      slug: 'us-2026',
      ran: true,
      error: 'HTTP 403',
    })
    answer = { status: 200, text: '<html>\n<p>moved</p>\n</html>' }
    const t3 = t2 + EARLY_VOTE_THROTTLE_MS
    expect(earlyVoteTick(db, http, { now: t3 })[0].error).toMatch(/state_abbv/)
    expect(row.getString('early_vote_error')).toMatch(/state_abbv/)
    expect(row.get('early_vote')).toBe(stored)
  })

  it('stops once the polls close, and skips unpublished elections', () => {
    const { db, row, http } = setup(() => ({ status: 200, text: csv }))
    const close = Date.parse(us().pollsClose)
    expect(earlyVoteTick(db, http, { now: close })).toEqual([
      { slug: 'us-2026', ran: false, skipped: 'closed' },
    ])
    row.set('published', false)
    expect(earlyVoteTick(db, http, { now })).toEqual([])
    expect(http.calls).toEqual([])
  })
})
