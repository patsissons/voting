import { describe, expect, it } from 'vitest'
import {
  feedText,
  fixtureEabNight,
  fixtureFeeds,
} from '../scripts/fixtures/fixture.ts'
import {
  alberta,
  albertaPages,
  bc,
  vancouver,
} from '../scripts/fixtures/load.ts'
import { payloadOf } from './db.ts'
import { memoryDb } from './db.memory.ts'
import type { MemoryRow } from './db.memory.ts'
import { fetchTick, setSource, storeSnapshot } from './store.ts'
import type { Http } from './store.ts'

const feeds = fixtureFeeds(vancouver())

describe('storeSnapshot', () => {
  it('stores one row per source stamp and calls repeats unchanged', () => {
    const db = memoryDb()
    db.addElection(vancouver())
    const first = storeSnapshot(db, 'vancouver-2026', feedText(feeds[0]))
    expect(first.status).toBe(201)
    expect(first.body.source_ts).toBe('2026-10-17 20:45:00')
    expect(db.results.length).toBe(1)
    expect(db.results[0].get('format')).toBe('vancouver')
    expect(db.results[0].get('schema_version')).toBe(1)
    const again = storeSnapshot(db, 'vancouver-2026', feedText(feeds[0]))
    expect(again.status).toBe(200)
    expect(again.body.unchanged).toBe(true)
    expect(db.results.length).toBe(1)
    const next = storeSnapshot(db, 'vancouver-2026', feedText(feeds[1]))
    expect(next.status).toBe(201)
    expect(db.results.length).toBe(2)
  })

  it('answers 404 for an unknown election and codes for bad feeds', () => {
    const db = memoryDb()
    db.addElection(vancouver())
    expect(storeSnapshot(db, 'nope', feedText(feeds[0])).status).toBe(404)
    const bad = storeSnapshot(db, 'vancouver-2026', '<html>blocked</html>')
    expect([bad.status, bad.body.code]).toEqual([400, 'bad_feed'])
    db.addElection(bc())
    const mismatch = storeSnapshot(
      db,
      'bc-2026',
      fixtureFeeds({
        ...bc(),
        results: { ...bc().results, eventMatch: 'GE-2030' },
      })[0] as string,
    )
    expect([mismatch.status, mismatch.body.code]).toEqual([
      409,
      'project_mismatch',
    ])
  })

  it('refuses a row whose config is not an election', () => {
    const db = memoryDb()
    db.addElection(vancouver(), { config: { nonsense: true } })
    const out = storeSnapshot(db, 'vancouver-2026', feedText(feeds[0]))
    expect([out.status, out.body.code]).toEqual([500, 'no_config'])
  })

  it('marks an official count and treats the unique index as a repeat', () => {
    const db = memoryDb()
    db.addElection(bc())
    const pages = fixtureFeeds(bc()) as string[]
    const out = storeSnapshot(db, 'bc-2026', pages[pages.length - 1], {
      official: true,
    })
    expect(out.status).toBe(201)
    const payload = payloadOf(db.results[0])!
    expect(payload.official).toBe(true)
    expect(payload.contests.every((c) => c.choices[0].winner)).toBe(true)
    expect(db.hasOfficialResult(db.elections[0].id)).toBe(true)
    // Another writer stored the same stamp a moment earlier: the fake's save throws like the index.
    const race = memoryDb()
    race.addElection(vancouver())
    const row = race.newResult()
    row.set('election', race.elections[0].id)
    row.set('source_ts', '2026-10-17 20:45:00')
    race.results.push(Object.assign(row as MemoryRow, { id: 'preexisting' }))
    const racedResultByStamp = race.resultByStamp
    race.resultByStamp = () => null // the lookup misses, the save collides
    expect(
      storeSnapshot(race, 'vancouver-2026', feedText(feeds[0])).body.unchanged,
    ).toBe(true)
    race.resultByStamp = racedResultByStamp
  })

  it('skips a referendum feed whose counts have not moved, and strips old detail', () => {
    const db = memoryDb()
    db.addElection(alberta())
    const night = fixtureFeeds(alberta())
    expect(storeSnapshot(db, 'alberta-2026', feedText(night[0])).status).toBe(
      201,
    )
    const sameCounts = {
      ...(night[0] as object),
      lastUpdated: '2026-10-20T02:59:00Z',
    }
    const same = storeSnapshot(db, 'alberta-2026', JSON.stringify(sameCounts))
    expect([same.status, same.body.unchanged]).toEqual([200, true])
    expect(storeSnapshot(db, 'alberta-2026', feedText(night[1])).status).toBe(
      201,
    )
    expect(
      payloadOf(db.results[0])!.contests.every((c) => c.eds!.length === 0),
    ).toBe(true)
    expect(payloadOf(db.results[1])!.contests[0].eds!.length).toBe(87)
    expect(db.results[1].get('sig')).toBe(payloadOf(db.results[1])!.sig)
  })
})

describe('setSource', () => {
  it('validates and stores the fetch source', () => {
    const db = memoryDb()
    db.addElection(bc())
    expect(setSource(db, 'bc-2026', 'http://127.0.0.1/x').body.code).toBe(
      'bad_source',
    )
    const ok = setSource(
      db,
      'bc-2026',
      'https://electionsbcenr.blob.core.windows.net/electionsbcenr/Results_7200_GE-2026-10-24_Candidate.html',
    )
    expect(ok.status).toBe(200)
    expect(db.elections[0].getString('results_source')).toContain(
      'GE-2026-10-24',
    )
    expect(setSource(db, 'bc-2026', '').body.source).toBe('')
    expect(setSource(db, 'nope', '').status).toBe(404)
  })
})

describe('fetchTick', () => {
  const fakeHttp = (
    answer: (url: string) => { status: number; text: string },
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

  it('skips elections that are not due and fetches the ones that are', () => {
    const db = memoryDb()
    const bcDoc = bc()
    const pages = fixtureFeeds(bcDoc) as string[]
    db.addElection(vancouver(), {
      results_source: 'https://results.vancouver.ca/data/arearesults.json',
    })
    db.addElection(bcDoc, {
      results_source:
        'https://electionsbcenr.blob.core.windows.net/x_GE-2026-10-24_Candidate.html',
    })
    const close = Date.parse(bcDoc.pollsClose)
    const http = fakeHttp(() => ({ status: 200, text: pages[0] }))
    const before = fetchTick(db, http, { now: close - 60000 })
    expect(before.map((r) => [r.slug, r.skipped])).toEqual([
      ['vancouver-2026', 'not_enabled'],
      ['bc-2026', 'before_polls_close'],
    ])
    const during = fetchTick(db, http, { now: close + 60000 })
    expect(during[1]).toMatchObject({ slug: 'bc-2026', ran: true, status: 201 })
    expect(http.calls.length).toBe(1)
    expect(db.elections[1].getString('results_checked')).not.toBe('')
    expect(fetchTick(db, http, { now: close + 90000 })[1].skipped).toBe(
      'throttled',
    )
    const later = fetchTick(db, http, { now: close + 180000 })
    expect(later[1]).toMatchObject({ ran: true, status: 200, unchanged: true })
  })

  it('records a failing source and clears the error on the next success', () => {
    const db = memoryDb()
    const bcDoc = bc()
    db.addElection(bcDoc, {
      results_source:
        'https://electionsbcenr.blob.core.windows.net/x_GE-2026-10-24_Candidate.html',
    })
    const close = Date.parse(bcDoc.pollsClose)
    const down = fakeHttp(() => ({ status: 503, text: '' }))
    expect(fetchTick(db, down, { now: close + 60000 })[0].error).toBe(
      'source answered 503',
    )
    expect(db.elections[0].getString('results_error')).toBe(
      'source answered 503',
    )
    const up = fakeHttp(() => ({
      status: 200,
      text: (fixtureFeeds(bcDoc) as string[])[0],
    }))
    expect(fetchTick(db, up, { now: close + 180000 })[0].error).toBeUndefined()
    expect(db.elections[0].getString('results_error')).toBe('')
  })

  it('assembles one snapshot from per-question pages and tolerates a failed page', () => {
    const db = memoryDb()
    const ab = albertaPages()
    const withPages = {
      ...ab,
      results: {
        ...ab.results,
        pages: ab.questions.map((q) => ({
          n: q.n,
          event: `2026${String(q.n).padStart(2, '0')}`,
        })),
        page: 'orEDResultsReferendum2026.cfm?EventId={event}',
      },
    }
    db.addElection(withPages as never, {
      results_source: 'https://officialresults.elections.ab.ca/',
    })
    const night = fixtureEabNight(ab)[2]
    const byEvent = new Map(
      night.pages.map((p) => [`2026${String(p.n).padStart(2, '0')}`, p.html]),
    )
    const http = fakeHttp((url) => {
      const event = /EventId=(\d+)/.exec(url)![1]
      if (event === '202609') return { status: 500, text: '' }
      return { status: 200, text: byEvent.get(event)! }
    })
    const out = fetchTick(db, http, { now: Date.parse(ab.pollsClose) + 60000 })
    expect(http.calls.length).toBe(10)
    expect(out[0]).toMatchObject({ ran: true, status: 201 })
    expect(out[0].error).toMatch(/some pages failed: Q9 500/)
  })

  it('follows a retired Alberta dashboard version to the current one', () => {
    const db = memoryDb()
    const ab = alberta()
    const old =
      'https://results.elections.ab.ca/data/8400?version=3.0.0&questions=1,2,3,4,5,6,7,8,9,11&wards='
    db.addElection(ab, { results_source: old })
    const doc = feedText(fixtureFeeds(ab)[0])
    const http = fakeHttp((url) => {
      if (url.includes('version=3.0.0'))
        return { status: 200, text: '{"forceFullRefresh":true}' }
      if (url.startsWith('https://results.elections.ab.ca/8400'))
        return {
          status: 200,
          text: "<script>let options = { version: '3.1.0' }</script>",
        }
      return { status: 200, text: doc }
    })
    const out = fetchTick(db, http, { now: Date.parse(ab.pollsClose) + 60000 })
    expect(out[0]).toMatchObject({
      ran: true,
      status: 201,
      source: old.replace('3.0.0', '3.1.0'),
    })
    expect(db.elections[0].getString('results_source')).toContain(
      'version=3.1.0',
    )
    expect(http.calls.length).toBe(3)
  })

  it('stops after an official count', () => {
    const db = memoryDb()
    const bcDoc = bc()
    db.addElection(bcDoc, {
      results_source:
        'https://electionsbcenr.blob.core.windows.net/x_GE-2026-10-24_Candidate.html',
    })
    storeSnapshot(db, 'bc-2026', (fixtureFeeds(bcDoc) as string[])[7], {
      official: true,
    })
    const out = fetchTick(
      db,
      fakeHttp(() => ({ status: 200, text: '' })),
      { now: Date.parse(bcDoc.pollsClose) + 60000 },
    )
    expect(out[0].skipped).toBe('official')
  })
})
