import { describe, expect, it } from 'vitest'
import { alberta, bc, vancouver } from '../../scripts/fixtures/load.ts'
import {
  encodeBallot,
  encodeCompass,
  parseBallot,
  parseCompass,
  parseImport,
  tabOf,
} from '../permalink.ts'
import { ballotCard, position, ridingCard, score } from './compass.ts'

const election = vancouver()
const bcDoc = bc()
const ab = alberta()

describe('compass scoring', () => {
  it('follows the artifact: points, double weight, neutral skips', () => {
    // Q1 housing option 1, Q7 gas "not a deciding issue" (neutral), Q13
    // "change from the centre" counted double.
    const r = score(election, {
      answers: { 0: 0, 6: 2, 12: 1 },
      weights: { 12: true },
    })
    expect(r.answered).toBe(2)
    const by = Object.fromEntries(r.rows.map((x) => [x.p, x.pct]))
    // possible = 3 + 3*2 = 9 per party
    expect(by).toEqual({
      lib: 67,
      vv: 56,
      team: 44,
      onecity: 33,
      abc: 11,
      green: 11,
      cope: 0,
    })
    expect(r.rows[0].p).toBe('lib')
  })

  it('scores nothing with nothing answered', () => {
    const r = score(election, { answers: { 6: 2 }, weights: {} })
    expect(r.answered).toBe(0)
    expect(r.rows.every((x) => x.pct === 0)).toBe(true)
  })

  it('places the viewer at the weighted mean of the chosen axis deltas', () => {
    const q0 = election.questions[0].opts[3].axis!
    expect(position(election, { answers: { 0: 3 }, weights: {} })).toEqual({
      n: 1,
      e: q0.e,
      s: q0.s,
    })
    expect(position(election, { answers: { 6: 2 }, weights: {} })).toEqual({
      n: 0,
      e: 0,
      s: 0,
    })
    const a = election.questions[4].opts[0].axis!
    const b = election.questions[5].opts[0].axis!
    const even = position(election, { answers: { 4: 0, 5: 0 }, weights: {} })
    expect(Math.abs(even.e - (a.e + b.e) / 2)).toBeLessThan(1e-9)
    const heavy = position(election, {
      answers: { 4: 0, 5: 0 },
      weights: { 4: true },
    })
    expect(Math.abs(heavy.e - (2 * a.e + b.e) / 3)).toBeLessThan(1e-9)
    expect(heavy.n).toBe(2)
  })
})

describe('compass permalinks', () => {
  it('round-trips state through the hash', () => {
    const state = {
      i: 12,
      answers: { 0: 2, 3: 0, 12: 1 },
      weights: { 3: true },
      done: true,
      review: false,
    }
    expect(encodeCompass(election, state)).toBe('#/compass/2--A--------1')
    const back = parseCompass(election, '#/compass/2--A--------1')!
    expect(back.answers).toEqual({ 0: 2, 3: 0, 12: 1 })
    expect(back.weights).toEqual({ 3: true })
    expect(back.done).toBe(true)
    expect(
      encodeCompass(election, {
        ...state,
        done: false,
        answers: { 0: 2 },
        weights: {},
        i: 4,
      }),
    ).toBe('#/compass/2/q4')
    expect(
      encodeCompass(election, { ...state, done: false, review: true, i: 1 }),
    ).toBe('#/compass/2--A--------1/r1')
    const mid = parseCompass(election, '#/compass/-/q3')!
    expect([
      mid.i,
      mid.done,
      mid.review,
      Object.keys(mid.answers).length,
    ]).toEqual([3, false, false, 0])
    expect(parseCompass(election, '#/compass/2--A--------1/r1')!.review).toBe(
      true,
    )
    expect(
      encodeCompass(election, {
        i: -1,
        answers: { 0: 2 },
        weights: {},
        done: false,
        review: false,
      }),
    ).toBe('')
    expect(parseCompass(election, '#/compass')).toBeNull()
    expect(parseCompass(election, '#/compass/')).toBeNull()
    expect(parseCompass(election, '#/results')).toBeNull()
    expect(parseCompass(election, '#/compass/zz')).toBeNull()
    expect(
      parseCompass(election, '#/compass/9-----------------1')!.answers,
    ).toEqual({})
    expect(parseCompass(election, '#/compass/1/q99')!.i).toBe(
      election.questions.length - 1,
    )
  })

  it('names the tab', () => {
    expect(tabOf('#/compass/2/q4')).toBe('compass')
    expect(tabOf('#/results')).toBe('results')
    expect(tabOf('#/analysis')).toBe('analysis')
    expect(tabOf('#/about')).toBe('')
    expect(tabOf('')).toBe('')
  })

  it('round-trips a referendum ballot', () => {
    expect(encodeBallot(ab, {})).toBe('#/compass')
    expect(encodeBallot(ab, { 0: 0, 3: 1 })).toBe('#/compass/0--1')
    expect(parseBallot(ab, '#/compass/0--1')).toEqual({ 0: 0, 3: 1 })
    expect(parseBallot(ab, '#/compass')).toBeNull()
    expect(parseBallot(ab, '#/compass/2')).toBeNull()
    expect(parseBallot(ab, '#/results')).toBeNull()
    expect(parseBallot(ab, '#/compass/1111111111111')).toEqual(
      Object.fromEntries(ab.questions.map((_q, i) => [i, 1])),
    )
  })
})

describe('ballot card', () => {
  const rows = [
    { p: 'abc', pct: 60 },
    { p: 'lib', pct: 40 },
    { p: 'team', pct: 30 },
    { p: 'green', pct: 10 },
    { p: 'vv', pct: 0 },
    { p: 'onecity', pct: 0 },
    { p: 'cope', pct: 0 },
  ]

  it('fills every office from the ranking, sitting members first', () => {
    const card = ballotCard(election, rows)
    const by = Object.fromEntries(card.map((o) => [o.key, o]))
    expect(card.map((o) => [o.key, o.picks.length, o.voteFor])).toEqual([
      ['mayor', 1, 1],
      ['council', 10, 10],
      ['park', 7, 7],
      ['school', 9, 9],
    ])
    expect(by.mayor.picks[0]).toEqual({
      ballot: 54,
      name: 'Ken Sim',
      inc: true,
      party: 'abc',
    })
    expect(by.council.picks.slice(0, 5).map((c) => c.inc)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
    expect(by.council.picks.map((c) => c.party)).toEqual([
      ...Array(9).fill('abc'),
      'lib',
    ])
    expect(by.council.picks[9].ballot).toBe(107)
    expect(by.school.picks.map((c) => c.party)).toEqual([
      ...Array(7).fill('abc'),
      'lib',
      'lib',
    ])
    const all = card.flatMap((o) => o.picks.map((c) => c.ballot))
    expect(new Set(all).size).toBe(all.length)
    expect(
      all.some((b) =>
        election.parties
          .find((p) => p.key === 'vv')!
          .council.some((c) => c[0] === b),
      ),
    ).toBe(false)
  })

  it('lends the endorsed mayor when the top party runs none', () => {
    const left = [
      { p: 'cope', pct: 70 },
      { p: 'onecity', pct: 60 },
      { p: 'green', pct: 50 },
      { p: 'abc', pct: 0 },
      { p: 'lib', pct: 0 },
      { p: 'team', pct: 0 },
      { p: 'vv', pct: 0 },
    ]
    const card = ballotCard(election, left)
    expect(card.find((o) => o.key === 'mayor')!.picks).toEqual([
      { ballot: 51, name: 'Pete Fry', inc: false, party: 'green' },
    ])
    const council = card.find((o) => o.key === 'council')!
    expect(council.picks.map((c) => c.party)).toEqual([
      ...Array(4).fill('cope'),
      ...Array(5).fill('onecity'),
      'green',
    ])
    expect(card.find((o) => o.key === 'park')!.picks.length).toBe(7)
    expect(
      ballotCard(
        election,
        left.map((r) => ({ ...r, pct: 0 })),
      ).every((o) => o.picks.length === 0),
    ).toBe(true)
  })

  it('keeps a swapped-out name listed and pulls in the next best', () => {
    const base = Object.fromEntries(
      ballotCard(election, rows).map((o) => [o.key, o]),
    )
    const libCouncil = election.parties
      .find((p) => p.key === 'lib')!
      .council.slice()
      .sort((a, b) => (b[2] ? 1 : 0) - (a[2] ? 1 : 0) || a[0] - b[0])
      .map((c) => c[0])
    const at = (omit: number[]) =>
      Object.fromEntries(
        ballotCard(election, rows, omit).map((o) => [o.key, o]),
      )

    expect(base.council.list).toEqual(base.council.picks)
    expect(base.council.list.every((c) => !('in' in c) && !('out' in c))).toBe(
      true,
    )

    const mayor = at([54]).mayor
    expect(mayor.list).toEqual([
      { ballot: 54, name: 'Ken Sim', inc: true, party: 'abc', out: true },
      { ballot: 56, name: 'Kareem Allam', inc: false, party: 'lib', in: true },
    ])
    expect(mayor.picks.map((c) => c.ballot)).toEqual([56])

    const gone = base.council.picks[0].ballot
    const one = at([gone]).council
    expect(one.picks.length).toBe(10)
    expect(one.list[0]).toEqual({ ...base.council.picks[0], out: true })
    expect(one.picks.slice(0, 9)).toEqual(base.council.picks.slice(1))
    expect({ ballot: one.picks[9].ballot, in: one.picks[9].in }).toEqual({
      ballot: libCouncil[1],
      in: true,
    })
    expect(new Set(one.picks.map((c) => c.ballot)).size).toBe(10)

    const two = at([gone, libCouncil[1]]).council
    expect(two.picks.length).toBe(10)
    expect(two.list.filter((c) => c.out).map((c) => c.ballot)).toEqual([
      gone,
      libCouncil[1],
    ])
    expect(two.picks.filter((c) => c.in).map((c) => c.ballot)).toEqual([
      libCouncil[2],
    ])

    expect(at([]).council).toEqual(base.council)
    expect(at([libCouncil[6]]).council).toEqual(base.council)

    const abcOnly = rows.map((r) => (r.p === 'abc' ? r : { ...r, pct: 0 }))
    const lone = ballotCard(election, abcOnly, [gone]).find(
      (o) => o.key === 'council',
    )!
    expect(lone.picks.length).toBe(8)
    expect(lone.list.length).toBe(9)
  })
})

describe('riding card', () => {
  it('orders a riding by the ranking and skips parties scoring nothing', () => {
    const rows = [
      { p: 'centre', pct: 70 },
      { p: 'cp', pct: 55 },
      { p: 'ndp', pct: 40 },
      { p: 'green', pct: 0 },
      { p: 'onebc', pct: 0 },
    ]
    const card = ridingCard(bcDoc, rows, 'SUS')!
    expect(card.district!.code).toBe('SUS')
    expect(card.picks.map((c) => [c.name, c.party, c.pct])).toEqual([
      ['Elenore Sturko', 'centre', 70],
      ['Megan Knight', 'cp', 55],
      ['Parik Tahlan', 'ndp', 40],
    ])
    expect(card.others.map((c) => [c.name, c.party, c.partyName])).toEqual([
      ['Bill McConnell', 'green', 'BC Green Party'],
      ['Denis R Hurtubise', null, 'Unaffiliated'],
    ])
    expect(card.picks[0].inc).toBe(true)
    expect(ridingCard(bcDoc, rows, 'nope')).toBeNull()
    expect(ridingCard(bcDoc, rows, '')!.district).toBeNull()
  })
})

describe('import links from cubby.fyi', () => {
  it('ignores every other hash', () => {
    expect(parseImport(bcDoc, '#/compass/410310311141132')).toBeNull()
    expect(parseImport(bcDoc, '#/results')).toBeNull()
    expect(parseImport(bcDoc, '')).toBeNull()
  })

  it('lands on the permalink with the riding it carries', () => {
    expect(
      parseImport(bcDoc, '#/compass/import/410310311141132?d=SUS'),
    ).toEqual({ hash: '#/compass/410310311141132', district: 'SUS' })
    expect(parseImport(bcDoc, '#/compass/import/4103/q3?d=nope')).toEqual({
      hash: '#/compass/4103/q3',
    })
    expect(parseImport(bcDoc, '#/compass/import/-?d=SUS')).toEqual({
      hash: '#/compass',
      district: 'SUS',
    })
    expect(parseImport(bcDoc, '#/compass/import/<script>')).toEqual({
      hash: '#/compass',
    })
  })

  it('keeps only swaps the at-large slates have', () => {
    expect(
      parseImport(election, '#/compass/import/2--A?o=54,103,9999,54,x'),
    ).toEqual({ hash: '#/compass/2--A', omit: [54, 103] })
    expect(parseImport(election, '#/compass/import/2--A?d=SUS&e=10')).toEqual({
      hash: '#/compass/2--A',
    })
  })

  it('carries a referendum ballot and a known division', () => {
    expect(parseImport(ab, '#/compass/import/01-1?e=10')).toEqual({
      hash: '#/compass/01-1',
      division: '10',
    })
    expect(
      parseImport(ab, '#/compass/import/01?e=Calgary-Falconridge'),
    ).toEqual({ hash: '#/compass/01', division: 'Calgary-Falconridge' })
    expect(parseImport(ab, '#/compass/import/0123?e=nowhere')).toEqual({
      hash: '#/compass',
    })
  })
})
