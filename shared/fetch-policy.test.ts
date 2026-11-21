import { describe, expect, it } from 'vitest'
import {
  alberta,
  albertaPages,
  bc,
  tinyChambers,
  us,
  vancouver,
} from '../scripts/fixtures/load.ts'
import {
  THROTTLE_MS,
  checkSource,
  finalResultsOf,
  shouldFetch,
} from './fetch-policy.ts'

const bcDoc = bc()
const election = vancouver()
const ab = alberta()

describe('shouldFetch', () => {
  it('runs only inside the window, with a source, unthrottled and before official', () => {
    const close = Date.parse(bcDoc.pollsClose)
    const state = {
      source:
        'https://electionsbcenr.blob.core.windows.net/x_GE-2026-10-24_Candidate.html',
      checked: 0,
      official: false,
    }
    expect(shouldFetch(bcDoc, state, close + 60000)).toBe('')
    expect(shouldFetch(bcDoc, state, close - 60000)).toBe('before_polls_close')
    expect(
      shouldFetch(
        bcDoc,
        state,
        close + bcDoc.results.fetchHours! * 3600000 + 1,
      ),
    ).toBe('window_closed')
    // A count that runs into the next day stays inside the window.
    expect(shouldFetch(bcDoc, state, close + 24 * 3600000)).toBe('')
    expect(shouldFetch(bcDoc, { ...state, source: '' }, close + 60000)).toBe(
      'no_source',
    )
    expect(
      shouldFetch(bcDoc, { ...state, official: true }, close + 60000),
    ).toBe('official')
    expect(
      shouldFetch(
        bcDoc,
        { ...state, checked: close + 60000 },
        close + 60000 + THROTTLE_MS - 1,
      ),
    ).toBe('throttled')
    expect(
      shouldFetch(
        bcDoc,
        { ...state, checked: close + 60000 },
        close + 60000 + THROTTLE_MS,
      ),
    ).toBe('')
    expect(
      shouldFetch(election, state, Date.parse(election.pollsClose) + 60000),
    ).toBe('not_enabled')
  })

  it('honours Alberta’s own throttle and window', () => {
    const close = Date.parse(ab.pollsClose)
    const state = {
      source: ab.results.source!,
      checked: close + 60000,
      official: false,
    }
    expect(shouldFetch(ab, state, close + 60000 + THROTTLE_MS)).toBe(
      'throttled',
    )
    expect(
      shouldFetch(
        ab,
        state,
        close + 60000 + ab.results.throttleSeconds! * 1000,
      ),
    ).toBe('')
    expect(
      shouldFetch(ab, { ...state, checked: 0 }, close + 59 * 3600000),
    ).toBe('')
  })
})

describe('checkSource', () => {
  it('requires an Elections BC page for this event', () => {
    expect(
      checkSource(
        bcDoc,
        'https://electionsbcenr.blob.core.windows.net/electionsbcenr/Results_7200_GE-2026-10-24_Candidate.html',
      ),
    ).toBe('')
    expect(
      checkSource(
        bcDoc,
        'https://electionsbcenr.blob.core.windows.net/electionsbcenr/Results_7097_GE-2024-10-19_Candidate.html',
      ),
    ).toMatch(/not for/)
    expect(
      checkSource(bcDoc, 'http://127.0.0.1:8099/GE-2026-10-24.html'),
    ).toMatch(/must be on/)
    expect(
      checkSource(
        election,
        'https://electionsbcenr.blob.core.windows.net/GE-2026-10-24',
      ),
    ).toMatch(/no server-side fetch/)
  })

  it('accepts the civicAPI base URL for a chambers election', () => {
    const tiny = tinyChambers()
    expect(checkSource(tiny, 'https://civicapi.org/api/v2/race/')).toBe('')
    expect(checkSource(tiny, 'https://example.com/api/v2/race/')).toMatch(
      /must be on https:\/\/civicapi\.org\//,
    )
  })

  it('honours Alberta’s source prefix', () => {
    expect(checkSource(ab, ab.results.source!)).toBe('')
    expect(
      checkSource(albertaPages(), 'https://officialresults.elections.ab.ca/'),
    ).toBe('')
    expect(checkSource(ab, 'https://officialresults.elections.ab.ca/')).toMatch(
      /must be on https:\/\/results\.elections\.ab\.ca/,
    )
  })
})

describe('finalResultsOf', () => {
  it('takes the day the document gives', () => {
    expect(finalResultsOf(bc())).toEqual({ day: '2026-11-09', expected: false })
    expect(finalResultsOf(vancouver())).toEqual({
      day: '2026-10-21',
      expected: false,
    })
  })

  it('expects the fetch window’s last day otherwise, on pollsClose’s offset', () => {
    // 18:00 -05:00 Nov 3 + 336 h = 23:00 UTC Nov 17, 6 pm Eastern.
    const noDay = us()
    delete noDay.dates.finalResults
    expect(finalResultsOf(noDay)).toEqual({ day: '2026-11-17', expected: true })
    expect(finalResultsOf(us())).toEqual({ day: '2026-12-12', expected: true })
    const late = {
      pollsClose: '2026-10-24T20:00:00-07:00',
      results: { fetchHours: 6 },
    }
    // 8 pm PDT + 6 h is 2 am the next day there; + 3 h is still the same evening.
    expect(finalResultsOf(late)).toEqual({ day: '2026-10-25', expected: true })
    const evening = {
      pollsClose: '2026-10-24T20:00:00-07:00',
      results: { fetchHours: 3 },
    }
    expect(finalResultsOf(evening)).toEqual({
      day: '2026-10-24',
      expected: true,
    })
    expect(finalResultsOf({ pollsClose: '' })).toBeNull()
  })
})
