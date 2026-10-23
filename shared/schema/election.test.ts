import { describe, expect, it } from 'vitest'
import { loadElections } from '../../scripts/lib/elections.ts'
import {
  alberta,
  bc,
  tinyChambers,
  vancouver,
} from '../../scripts/fixtures/load.ts'
import { fromRow, toRow } from '../election-row.ts'
import { configProblems } from '../config-guard.ts'
import { ElectionSchema, electionProblems, parseElection } from './election.ts'

const elections = loadElections()
const bcDoc = bc()

describe('election documents', () => {
  it('parse and pass the cross checks', () => {
    expect(elections.map((e) => e.slug)).toEqual([
      'alberta-2026',
      'bc-2026',
      'vancouver-2026',
    ])
    for (const e of elections) expect(electionProblems(e), e.slug).toEqual([])
  })

  it('reject unknown keys and bad values', () => {
    const van = vancouver()
    expect(ElectionSchema.safeParse({ ...van, bogus: 1 }).success).toBe(false)
    expect(
      ElectionSchema.safeParse({ ...van, votingDay: 'tomorrow' }).success,
    ).toBe(false)
    expect(() =>
      parseElection({ ...van, dates: { ...van.dates, final: '2026-10-18' } }),
    ).toThrow(/dates.final/)
    const badParty = {
      ...van,
      questions: [
        {
          ...van.questions[0],
          opts: [
            { ...van.questions[0].opts[0], pts: { nobody: 3 } },
            van.questions[0].opts[1],
          ],
        },
      ],
    }
    expect(() => parseElection(badParty)).toThrow(/unknown party/)
  })

  it('keep the BC ridings, candidates and regions consistent', () => {
    expect(bcDoc.districts.length).toBe(bcDoc.seats)
    expect(bcDoc.districts.flatMap((d) => d.candidates).length).toBe(353)
    for (const p of bcDoc.parties) {
      const best = bcDoc.questions.filter((q) =>
        q.opts.some((o) => o.pts[p.key] === 3),
      ).length
      expect(
        best >= bcDoc.questions.length / 2,
        `${p.key} is the best answer on at least half the questions`,
      ).toBe(true)
    }
  })

  it('carry the party colours for every party', () => {
    for (const e of elections) {
      if (e.ballot === 'referendum') continue
      for (const p of e.parties)
        expect(p.color, `${e.slug} ${p.key}`).toMatch(/^#/)
    }
  })

  it('accept a results-only chambers document and cross-check it', () => {
    const tiny = tinyChambers()
    expect(tiny.ballot).toBe('chambers')
    expect(tiny.chambers.map((c) => c.key)).toEqual([
      'house',
      'senate',
      'governor',
    ])
    expect(tiny.chambers[0].holdovers).toEqual({})
    expect(electionProblems(tiny)).toEqual([])
    expect(configProblems(fromRow(toRow(tiny)))).toEqual([])
    expect(ElectionSchema.safeParse({ ...tiny, questions: [] }).success).toBe(
      false,
    )
    const problems = (patch: (e: typeof tiny) => unknown) =>
      electionProblems(
        ElectionSchema.parse(patch(JSON.parse(JSON.stringify(tiny)))),
      )
    expect(
      problems((e) => ({ ...e, chambers: [e.chambers[0], e.chambers[0]] })),
    ).toContain('chamber keys must be unique')
    expect(
      problems((e) => ({
        ...e,
        results: { ...e.results, races: { house: 1 } },
      })),
    ).toContain('results.races: a race id per chamber')
    expect(
      problems((e) => ({
        ...e,
        chambers: [
          { ...e.chambers[0], divisions: { 'ak-al': 'Alaska at-large' } },
          ...e.chambers.slice(1),
        ],
      })),
    ).toContain('house: 1 divisions for 4 seats less 0 holdovers')
    expect(
      problems((e) => ({
        ...e,
        chambers: [
          {
            ...e.chambers[0],
            divisions: { ...e.chambers[0].divisions, 'zz-01': 'Nowhere 1' },
          },
          ...e.chambers.slice(1),
        ],
      })),
    ).toContain('house: division zz-01 is in no region')
    expect(
      problems((e) => ({
        ...e,
        chambers: [
          e.chambers[0],
          { ...e.chambers[1], holdovers: { dem: 1, lib: 1 } },
          e.chambers[2],
        ],
      })),
    ).toContain('senate: holdover party "lib" is unknown')
    expect(
      problems((e) => ({
        ...e,
        chambers: [{ ...e.chambers[0], majority: 9 }, ...e.chambers.slice(1)],
      })),
    ).toContain('house: majority exceeds seats')
    expect(
      problems((e) => ({
        ...e,
        affiliations: { Democratic: 'dem', Whig: 'whig' },
      })),
    ).toEqual(
      expect.arrayContaining([
        'affiliations: unknown party "whig"',
        'gop: no feed affiliation maps to it',
      ]),
    )
  })

  it('round-trip through the elections row', () => {
    for (const e of elections) {
      const row = toRow(e)
      expect(Object.keys(row)).toEqual([
        'slug',
        'title',
        'description',
        'voting_day',
        'published',
        'ballot',
        'config',
      ])
      expect(row.voting_day).toBe(`${e.votingDay} 12:00:00.000Z`)
      expect(row.config).not.toHaveProperty('slug')
      expect(
        fromRow({
          ...row,
          voting_day: '2026-10-24 12:00:00.000Z'.replace(
            '2026-10-24',
            e.votingDay,
          ),
        }),
      ).toEqual(e)
      expect(configProblems(fromRow(row))).toEqual([])
    }
    expect(configProblems({})).toContain('slug')
    expect(
      configProblems({ ...alberta(), results: { format: 'nope' } }),
    ).toEqual(['results.format'])
  })
})
