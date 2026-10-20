import { describe, expect, it } from 'vitest'
import { alberta, bc, vancouver } from './fixtures/load.ts'
import { buildDocument, zoneOffset } from './new-vote.ts'
import { documentText } from './lib/json.ts'
import { parseElection } from '../shared/schema/election.ts'

describe('new-vote', () => {
  it('reads a zone offset for a day', () => {
    expect(zoneOffset('America/Vancouver', '2026-10-24')).toBe('-07:00')
    expect(zoneOffset('America/Edmonton', '2026-10-19')).toBe('-06:00')
    expect(zoneOffset('America/Toronto', '2026-01-15')).toBe('-05:00')
  })

  it('builds a valid draft for each ballot mode with the header filled in', () => {
    // A day before November 2026: newer tzdata keeps BC on daylight time
    // year-round from then, so later dates differ between machines.
    for (const ballot of ['at-large', 'district', 'referendum'] as const) {
      const doc = buildDocument({
        slug: `test-${ballot}`,
        ballot,
        title: 'Test Vote',
        day: '2026-03-07',
        timeZone: 'America/Vancouver',
        place: 'Testville',
      })
      expect(doc.slug).toBe(`test-${ballot}`)
      expect(doc.published).toBe(false)
      expect(doc.votingDay).toBe('2026-03-07')
      expect(doc.dates.final).toBe('2026-03-07')
      expect(doc.pollsClose).toBe('2026-03-07T20:00:00-08:00')
      expect(doc.eyebrow).toBe(
        `Testville ${ballot === 'referendum' ? 'referendum' : 'election'} · voting day Saturday, March 7`,
      )
      // The written file round-trips through the checker unchanged.
      expect(documentText(parseElection(JSON.parse(documentText(doc))))).toBe(
        documentText(doc),
      )
    }
  })

  it('regenerates each existing election’s shape from its template', () => {
    // The same top-level keys and results format as the committed documents:
    // only the editorial content (TODOs) differs.
    for (const real of [vancouver(), bc(), alberta()]) {
      const draft = buildDocument({
        slug: real.slug,
        ballot: real.ballot,
        title: real.title,
        day: real.votingDay,
        timeZone: real.timeZone,
        place: real.place,
        format: real.results.format,
      })
      expect(Object.keys(draft).sort(), real.slug).toEqual(
        Object.keys(real).sort(),
      )
      expect(draft.results.format).toBe(real.results.format)
      expect(draft.timeZone).toBe(real.timeZone)
      expect(draft.pollsClose.slice(0, 10)).toBe(real.pollsClose.slice(0, 10))
      expect(draft.pollsClose.slice(-6)).toBe(real.pollsClose.slice(-6))
    }
  })

  it('refuses bad arguments', () => {
    expect(() =>
      buildDocument({
        slug: 'Bad Slug',
        ballot: 'at-large',
        title: 'x',
        day: '2027-01-01',
      }),
    ).toThrow(/slug/)
    expect(() =>
      buildDocument({
        slug: 'ok',
        ballot: 'at-large',
        title: 'x',
        day: 'soon',
      }),
    ).toThrow(/--day/)
    expect(() =>
      buildDocument({
        slug: 'ok',
        ballot: 'at-large',
        title: 'x',
        day: '2027-01-01',
        close: '8pm',
      }),
    ).toThrow(/--close/)
  })
})
