import { describe, expect, it } from 'vitest'
import {
  alberta,
  albertaPages,
  bc,
  bcAny,
  fixture,
  golden,
  tinyChambers,
  us,
  vancouver,
  vancouverAny,
} from '../../scripts/fixtures/load.ts'
import {
  eabPage,
  fixtureEabNight,
  fixtureFeeds,
  feedText,
} from '../../scripts/fixtures/fixture.ts'
import type { Payload } from '../payload.ts'
import type { Election } from '../schema/election.ts'
import {
  contestId,
  dashSource,
  markOfficial,
  normalize,
  parseAsOf,
  parseChoiceName,
  parseLocations,
  stripDetail,
  titleCase,
  wallStamp,
} from './index.ts'

const election = vancouver()
const any = vancouverAny()
const feed2022 = fixture('voting-2022-arearesults.json')
const feed2025 = fixture('voting-2025-arearesults.json')
const enr2024 = fixture('voting-2024-enr-candidate.html')
const eab2021 = fixture('voting-2021-eab-referendum.html')
const abDash = fixture('voting-2026-eab-dash-empty.json')
const bcDoc = bc()
const bcDocAny = bcAny()
const ab = alberta()
const abPages = albertaPages()
const abQ = (n: number) => ab.questions.find((q) => q.n === n)!
const abDoc = (
  pages: { n: number | null; html: string }[],
  fetchedAt = '2026-10-20T03:12:40Z',
) => JSON.stringify({ fetchedAt, pages })
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (err) {
    return (err as { code?: string }).code
  }
  return ''
}

describe('vancouver feed', () => {
  it('parses choice names to ballot number and display name', () => {
    expect(parseChoiceName('52 POPAT, Imtiaz')).toEqual({
      ballot: 52,
      name: 'Imtiaz Popat',
    })
    expect(parseChoiceName('102 ROLLERGIRL')).toEqual({
      ballot: 102,
      name: 'Rollergirl',
    })
    expect(parseChoiceName('Yes')).toEqual({ ballot: null, name: 'Yes' })
    expect(titleCase("O'KEEFE")).toBe("O'Keefe")
    expect(titleCase('YI-KIERAN')).toBe('Yi-Kieran')
    expect(titleCase('VAN VLOTEN')).toBe('Van Vloten')
  })

  it('normalizes the 2022 feed into the four races and three questions', () => {
    // The file on the wire starts with a BOM; a body that keeps it must still parse.
    const r = normalize(`\uFEFF${feed2022}`, any)
    expect(r.asOf).toBe('2022-10-16 00:40:57')
    expect(r.polls).toEqual({ closed: 106, total: 106 })
    expect(r.ballots).toBe(171494)
    expect(r.turnout).toBeNull() // eligibleVoters was 0 in 2022
    expect(
      r.contests.map((c) => [c.kind, c.voteFor, c.choices.length]),
    ).toEqual([
      ['mayor', 1, 15],
      ['council', 10, 59],
      ['park', 7, 32],
      ['school', 9, 31],
      ['question', 1, 2],
      ['question', 1, 2],
      ['question', 1, 2],
    ])
    const mayor = r.contests[0]
    expect(
      mayor.choices.every(
        (c, i) => i === 0 || mayor.choices[i - 1].votes >= c.votes,
      ),
    ).toBe(true)
    expect(mayor.choices[0].partyName).toBe('ABC Vancouver')
    expect(r.contests[4].label.startsWith('1. Capital borrowing')).toBe(true)
  })

  it('counts a winner only once every voting place and tabulator has reported', () => {
    const winners = (r: Payload) =>
      r.contests.map((c) => c.choices.filter((ch) => ch.winner).length)
    expect(winners(normalize(feed2022, any))).toEqual([1, 10, 7, 9, 1, 1, 1])
    const midCount = (patch: Record<string, number>) => {
      const feed = JSON.parse(feed2022.replace(/^\uFEFF/, ''))
      Object.assign(feed.statistics, patch)
      return normalize(JSON.stringify(feed), any)
    }
    expect(winners(midCount({ globClosedPolls: 41 }))).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ])
    expect(winners(midCount({ globClosedTabulators: 204 }))).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ])
  })

  it('rejects the 2025 by-election for a 2026 election, and carries turnout', () => {
    expect(code(() => normalize(feed2025, election))).toBe('project_mismatch')
    const r = normalize(feed2025, any)
    expect(r.eligible).toBe(450503)
    expect(Math.abs((r.turnout || 0) - 67962 / 450503)).toBeLessThan(1e-9)
    expect(r.contests.map((c) => [c.kind, c.voteFor])).toEqual([['council', 2]])
  })

  it('fails bad feeds with a code', () => {
    expect(code(() => normalize('', any))).toBe('empty_feed')
    expect(code(() => normalize('<html>blocked</html>', any))).toBe('bad_feed')
    expect(
      code(() =>
        normalize('{"statistics":{"projectName":"x","timeStamp":"t"}}', any),
      ),
    ).toBe('bad_feed')
  })

  it('attributes every fixture-night slate candidate to its compass party', () => {
    const feeds = fixtureFeeds(election)
    expect(feeds.length).toBe(8)
    const last = normalize(feedText(feeds[feeds.length - 1]), election)
    expect(last.project).toBe('City of Vancouver 2026')
    expect(last.polls).toEqual({ closed: 147, total: 147 })
    const mayor = last.contests.find((c) => c.kind === 'mayor')!
    const sim = mayor.choices.find((c) => c.ballot === 54)!
    expect([sim.name, sim.party]).toEqual(['Ken Sim', 'abc'])
    const wyss = last.contests
      .find((c) => c.kind === 'park')!
      .choices.find((c) => c.ballot === 203)!
    expect([wyss.name, wyss.party]).toEqual(["T'uy't'tanat Cease Wyss", 'cope'])
    expect(mayor.choices.find((c) => c.ballot === 53)!.party).toBeNull()
    expect(last.contests.filter((c) => c.kind === 'question').length).toBe(5)
    const stamps = feeds.map(
      (f) => (f as { statistics: { timeStamp: string } }).statistics.timeStamp,
    )
    expect([...stamps].sort()).toEqual(stamps)
  })

  it('keeps the 2022 baseline at the feed’s final ballot count', () => {
    expect(election.results.baseline).toEqual({
      year: 2022,
      ballots: normalize(feed2022, any).ballots,
    })
  })
})

describe('elections bc page', () => {
  it('normalizes the 2024 page into 93 ridings with ballot boxes', () => {
    expect(code(() => normalize(enr2024, bcDoc))).toBe('project_mismatch')
    const r = normalize(enr2024, bcDocAny)
    expect(r.asOf).toBe('2024-10-21 16:00:00')
    expect(r.project).toBe('2024 General Election Results')
    expect(r.status).toEqual({ initial: 'Complete', final: 'October 26, 2024' })
    expect(r.contests.length).toBe(93)
    expect(
      r.contests.every(
        (c) => c.kind === 'district' && c.voteFor === 1 && c.region,
      ),
    ).toBe(true)
    expect(r.polls).toEqual({ closed: 2146, total: 2146 })
    expect(r.ballots).toBe(2038787)
    expect(r.eligible).toBe(3550017)
    expect(Math.abs((r.turnout || 0) - 0.5743)).toBeLessThan(1e-9)
    const abm = r.contests.find((c) => c.id === 'ABM')!
    expect(abm.label).toBe('Abbotsford-Mission')
    expect(abm.boxes).toEqual({
      advance: [5, 5],
      final: [16, 16],
      ood: 'Complete',
    })
    expect(abm.ballots).toBe(23814)
    expect(
      abm.choices.map((c) => [c.name, c.party, c.partyName, c.votes, c.pct]),
    ).toEqual([
      ['Reann Gasper', 'cp', 'Conservative Party', 13254, 55.66],
      ['Pam Alexis', 'ndp', 'BC NDP', 10560, 44.34],
    ])
    // The page's affiliation wins over the 2026 candidate list (Brodie was a
    // Conservative in 2024 and is OneBC now); unknown labels stay unattributed.
    const vnq = r.contests.find((c) => c.id === 'VNQ')!
    expect([vnq.choices[0].name, vnq.choices[0].party]).toEqual([
      'Dallas Brodie',
      'cp',
    ])
    const abs = r.contests.find((c) => c.id === 'ABS')!
    expect(abs.choices.map((c) => [c.party, c.partyName]).slice(-1)).toEqual([
      [null, 'Independent'],
    ])
    expect(abs.choices[0].incumbent).toBe(true)
    const by = Object.fromEntries(r.summary!.parties.map((p) => [p.key, p]))
    expect([by.ndp.leading, by.cp.leading, by.green.leading]).toEqual([
      46, 45, 2,
    ])
    expect(by.ndp.votes).toBe(909277)
    expect(Math.abs(by.ndp.pct - 44.6)).toBeLessThan(0.01)
    expect(r.summary!.reporting).toBe('100%')
  })

  it('parses "As of" stamps in the forms the page might use', () => {
    expect(parseAsOf('As of October 21, 2024 16:00 PST')).toBe(
      '2024-10-21 16:00:00',
    )
    expect(parseAsOf('<b>As of</b> October 24, 2026 8:05 pm PDT')).toBe(
      '2026-10-24 20:05:00',
    )
    expect(parseAsOf('As of Oct. 24, 2026, 20:05:30')).toBe(
      '2026-10-24 20:05:30',
    )
    expect(parseAsOf('nothing here')).toBe('')
  })

  it('fails with a code, and the formats reject each other', () => {
    expect(code(() => normalize('', bcDoc))).toBe('empty_feed')
    expect(code(() => normalize('<html>blocked</html>', bcDoc))).toBe(
      'bad_feed',
    )
    expect(code(() => normalize(feed2022, bcDoc))).toBe('bad_feed')
    expect(code(() => normalize(enr2024, any))).toBe('bad_feed')
    const nope = {
      ...bcDoc,
      results: { ...bcDoc.results, format: 'nope' },
    } as unknown as Election
    expect(code(() => normalize(enr2024, nope))).toBe('bad_config')
  })

  it('fills every riding of the fixture night from its own candidate list', () => {
    const pages = fixtureFeeds(bcDoc)
    expect(pages.length).toBe(8)
    expect(pages.every((p) => typeof p === 'string')).toBe(true)
    const first = normalize(pages[0], bcDoc)
    const last = normalize(pages[pages.length - 1], bcDoc)
    expect(
      first.polls.closed < first.polls.total && first.polls.closed > 0,
    ).toBe(true)
    expect(last.polls.closed).toBe(last.polls.total)
    expect(last.contests.length).toBe(bcDoc.seats)
    for (const c of last.contests) {
      const d = bcDoc.districts.find((x) => x.code === c.id)!
      expect(d, `${c.name} is a known riding`).toBeTruthy()
      expect(c.choices.length).toBe(d.candidates.length)
      for (const ch of c.choices) {
        const row = d.candidates.find((x) => x[0] === ch.name)!
        expect(row, `${c.id}: ${ch.name}`).toBeTruthy()
        expect(ch.party).toBe(row[1])
        expect(ch.incumbent).toBe(!!row[2])
      }
    }
    expect(last.summary!.parties.reduce((n, p) => n + p.leading, 0)).toBe(
      bcDoc.seats,
    )
    const stamps = pages.map((p) => normalize(p, bcDoc).asOf)
    expect([...stamps].sort()).toEqual(stamps)
    expect(last.turnout! > 0.4 && last.turnout! < 0.8).toBe(true)
  })

  it('keeps the 2024 baseline at the page’s initial-count total', () => {
    expect(bcDoc.results.baseline).toEqual({
      year: 2024,
      ballots: normalize(enr2024, bcDocAny).ballots,
      label: 'initial count',
    })
  })

  it('names each untied riding leader the winner once official', () => {
    const r = normalize(enr2024, bcDocAny)
    expect(r.contests.every((c) => c.choices.every((ch) => !ch.winner))).toBe(
      true,
    )
    expect(markOfficial(r)).toBe(r)
    expect(r.contests.every((c) => c.choices.every((ch) => !ch.winner))).toBe(
      true,
    )
    r.official = true
    const tied = r.contests[0]
    tied.choices[1].votes = tied.choices[0].votes
    markOfficial(r)
    expect(tied.choices.some((ch) => ch.winner)).toBe(false)
    for (const c of r.contests.slice(1))
      expect(c.choices.map((ch) => ch.winner)).toEqual(
        c.choices.map((_, i) => i === 0),
      )
  })
})

describe('elections alberta pages (eab-ref)', () => {
  it('parses the real 2021 page by its headers', () => {
    const r = normalize(abDoc([{ n: 1, html: eab2021 }]), abPages)
    const q1 = r.contests.find((c) => c.id === 'q1')!
    expect(q1.choices.map((c) => c.votes)).toEqual([642501, 399169])
    expect(q1.rejected).toBe(49401 + 1633)
    expect(q1.ballots).toBe(1092704)
    expect(q1.posted && q1.eds!.length > 200).toBe(true)
    expect(q1.eds!.find((d) => d.name === 'Acme')!.votes.join()).toBe('106,29')
    expect(q1.polls!.unit).toBe('divisions')
    expect(r.contests.filter((c) => c.posted).length).toBe(1)
    expect(r.asOf).toBe('2026-10-19 21:12:40')
    expect(r.contests[0].id).toBe('q10')
  })

  it('reads a 2026-shaped page: locations, options by pattern, divisions', () => {
    const rows = [
      {
        code: '01',
        name: 'CALGARY-ACADIA',
        closed: 10,
        total: 20,
        a: 700,
        b: 300,
        rejected: 5,
      },
      {
        code: '36',
        name: 'EDMONTON-MCCLUNG',
        closed: 0,
        total: 15,
        a: 0,
        b: 0,
        rejected: 0,
      },
    ]
    const r = normalize(
      abDoc([{ n: 10, html: eabPage(abQ(10), rows) }]),
      abPages,
    )
    const q10 = r.contests[0]
    expect(q10.id).toBe('q10')
    expect(q10.choices.map((c) => [c.name, c.votes])).toEqual([
      ['Remain', 700],
      ['Begin process', 300],
    ])
    expect(q10.polls).toEqual({ closed: 10, total: 35, unit: '' })
    expect(r.polls).toEqual({ closed: 10, total: 35 })
    expect(q10.eds![1].name).toBe('Edmonton-McClung')
    expect(q10.eds![0].polls).toEqual([10, 20])
    expect(q10.choices.some((c) => c.winner)).toBe(false)
    const bare = eabPage(abQ(1), rows).replace(/(\d+) of (\d+)/g, '$1')
    const q1 = normalize(abDoc([{ n: 1, html: bare }]), abPages).contests.find(
      (c) => c.id === 'q1',
    )!
    expect(q1.polls).toEqual({ closed: 1, total: 2, unit: 'divisions' })
    expect(parseLocations('12 of 34')).toEqual([12, 34])
    expect(parseLocations('1,973')).toEqual([1973, null])
    expect(parseLocations('')).toBeNull()
  })

  it('skips pages not posted yet; none posted is not_reporting', () => {
    const night = fixtureEabNight(abPages)
    const first = normalize(JSON.stringify(night[0]), abPages)
    expect(first.contests[0].posted).toBe(true)
    expect(first.contests[first.contests.length - 1].posted).toBe(false)
    const fallback = night[0].pages.find(
      (p) => !/Option 1|>Yes|Yes\n/.test(p.html),
    )!.html
    expect(
      code(() => normalize(abDoc([{ n: 10, html: fallback }]), abPages)),
    ).toBe('not_reporting')
    expect(code(() => normalize('', abPages))).toBe('empty_feed')
    expect(code(() => normalize('{"x":1}', abPages))).toBe('bad_feed')
    expect(normalize(eab2021, abPages).contests.some((c) => c.posted)).toBe(
      true,
    )
  })

  it('counts every question of the fixture night in order and ends complete', () => {
    const night = fixtureEabNight(abPages).map((doc) =>
      normalize(JSON.stringify(doc), abPages),
    )
    expect(night.length).toBe(10)
    const started = night.map(
      (r) =>
        r.contests.filter((c) => c.choices[0].votes + c.choices[1].votes > 0)
          .length,
    )
    expect([...started].sort((a, b) => a - b)).toEqual(started)
    expect(new Set(night.map((r) => r.sig)).size).toBe(night.length)
    expect(new Set(night.map((r) => r.asOf)).size).toBe(night.length)
    const last = night[night.length - 1]
    expect(last.contests[0].polls!.closed).toBe(last.contests[0].polls!.total)
    expect(
      normalize(JSON.stringify(fixtureEabNight(abPages)[3]), abPages).sig,
    ).toBe(night[3].sig)
  })

  it('marks each majority once official, and strips detail', () => {
    const r = normalize(JSON.stringify(fixtureEabNight(abPages)[9]), abPages)
    r.official = true
    markOfficial(r)
    for (const c of r.contests) {
      const [a, b] = c.choices
      expect(c.choices.filter((x) => x.winner).length).toBe(
        a.votes === b.votes ? 0 : 1,
      )
      expect((a.votes > b.votes ? a : b).winner).toBe(a.votes !== b.votes)
    }
    const lean = stripDetail(r)!
    expect(lean.contests.every((c) => c.eds!.length === 0)).toBe(true)
    expect(r.contests[0].eds!.length > 0).toBe(true)
    expect(stripDetail(lean)).toBeNull()
    expect(
      wallStamp(
        Date.parse('2026-10-20T02:00:00Z'),
        '2026-10-19T20:00:00-06:00',
      ),
    ).toBe('2026-10-19 20:00:00')
  })
})

describe('elections alberta dashboard (eab-dash)', () => {
  it('reports not_reporting before any count', () => {
    expect(code(() => normalize(abDash, ab))).toBe('not_reporting')
    expect(code(() => normalize('{"success":true}', ab))).toBe('bad_feed')
    expect(code(() => normalize('', ab))).toBe('empty_feed')
    const doc = JSON.parse(abDash)
    expect(doc.referendumResults.votes.questionStats.length).toBe(10)
    expect(
      doc.referendumResults.votes.questionStats.every(
        (q: { wardStats: unknown[] }) => q.wardStats.length === 87,
      ),
    ).toBe(true)
    const divisions = (ab.results as { divisions: Record<string, string> })
      .divisions
    expect(Object.keys(divisions).sort()).toEqual(
      doc.referendumResults.wards.map((w: { ward: string }) => w.ward).sort(),
    )
  })

  it('maps question ids, options, polls and divisions', () => {
    const doc = JSON.parse(abDash)
    const r = doc.referendumResults
    r.widgets.summary.pollsReporting = 120
    const q10 = r.votes.questionStats.find(
      (q: { questionID: number }) => q.questionID === 11,
    )
    q10.yesVotes = 1000
    q10.noVotes = 400
    Object.assign(
      q10.wardStats.find((w: { ward: string }) => w.ward === '36'),
      { yesVotes: 60, noVotes: 20 },
    )
    r.wards.find((w: { ward: string }) => w.ward === '36').pollsReporting = 3
    const p = normalize(JSON.stringify(doc), ab)
    expect(p.format).toBe('eab-dash')
    expect(p.asOf).toBe(wallStamp(doc.lastUpdated, ab.pollsClose))
    expect(p.polls).toEqual({ closed: 120, total: 5595 })
    const c = p.contests[0]
    expect(c.id).toBe('q10')
    expect(c.choices.map((x) => [x.name, x.votes])).toEqual([
      ['Remain', 1000],
      ['Begin process', 400],
    ])
    expect(c.posted && !p.contests[1].posted).toBe(true)
    expect(c.eds!.length).toBe(87)
    const ed = c.eds!.find((d) => d.code === '36')!
    expect([ed.name, ed.votes, ed.polls]).toEqual([
      'Edmonton-McClung',
      [60, 20],
      [3, 51],
    ])
    expect(p.contests[1].polls!.closed).toBe(120)
    expect(normalize(JSON.stringify(doc), ab).sig).not.toBe('')
  })

  it('parses the fixture night like the live feed', () => {
    const night = fixtureFeeds(ab).map((doc) =>
      normalize(JSON.stringify(doc), ab),
    )
    expect(night.length).toBe(10)
    const started = night.map((r) => r.contests.filter((c) => c.posted).length)
    expect([...started].sort((a, b) => a - b)).toEqual(started)
    expect(night[0].contests[0].posted && !night[0].contests[9].posted).toBe(
      true,
    )
    expect(night[night.length - 1].polls.closed).toBe(
      night[night.length - 1].polls.total,
    )
  })

  it('reports a retired dashboard version as stale_version, and the page names the next', () => {
    expect(code(() => normalize('{"forceFullRefresh":true}', ab))).toBe(
      'stale_version',
    )
    const page =
      "<script> let options = { countyMun: '8400', version: '3.1.0', apiRefreshRates: [-1, 30] }</script>"
    const old =
      'https://results.elections.ab.ca/data/8400?version=3.0.0&questions=1,11&wards='
    expect(dashSource(old, page)).toBe(
      'https://results.elections.ab.ca/data/8400?version=3.1.0&questions=1,11&wards=',
    )
    expect(dashSource(dashSource(old, page), page)).toBe('')
    expect(dashSource(old, '<html>no options</html>')).toBe('')
    expect(
      dashSource('https://results.elections.ab.ca/data/8400?questions=1', page),
    ).toBe('')
  })
})

describe('civicapi race documents', () => {
  // The three real documents of 2026-10-23, trimmed to a few regions. Taken
  // before voting day, so every count is zero and nothing is called.
  const sample = fixture('voting-2026-civicapi-sample.json')
  const tiny = tinyChambers()
  const wrapper = () =>
    JSON.parse(sample) as {
      fetchedAt: string
      races: Record<string, Record<string, unknown>>
    }

  it('turns every division into a contest of its chamber', () => {
    const r = normalize(sample, tiny)
    expect(r.format).toBe('civicapi')
    expect(r.project).toBe('Tiny Midterms 2026')
    // max(last_updated) = 02:10:37.040Z, as Eastern wall-clock time.
    expect(r.asOf).toBe('2026-10-22 21:10:37')
    expect(r.contests.map((c) => c.id)).toEqual([
      'ak-al',
      'ca-12',
      'ny-10',
      'wi-02',
      'ak-sen',
      'ga-sen',
      'ak-gov',
      'ca-gov',
    ])
    expect(r.contests.map((c) => c.kind)).toEqual([
      ...Array(4).fill('house'),
      'senate',
      'senate',
      'governor',
      'governor',
    ])
    const ak = r.contests[0]
    expect(ak.label).toBe('Alaska at-large')
    expect(ak.name).toBe("Alaska's At-large Congressional District")
    expect(ak.region).toBe('ak')
    expect(ak.voteFor).toBe(1)
    expect(ak.reporting).toBe(0)
    expect(ak.choices.map((c) => [c.name, c.party, c.partyName])).toEqual([
      ['Bill Hill', null, 'Nonpartisan'],
      ['Eric Hafner', 'dem', 'Democratic'],
      ['James C. “Jim” McDermott', null, 'Libertarian'],
      ['Nick Begich III', 'gop', 'Republican'],
    ])
    expect(r.contests[3].acclaimed).toBe(true)
    expect(r.contests[3].choices[0].name).toBe('Mark Pocan')
    const sen = r.contests[4]
    expect(sen.label).toBe('Alaska')
    expect(sen.choices.some((c) => c.incumbent)).toBe(true)
    expect(r.polls).toEqual({ closed: 0, total: 8 })
    expect(r.eligible).toBe(217223010)
    expect(r.ballots).toBe(0)
    expect(r.turnout).toBe(0)
    expect(r.sig).toMatch(/^[0-9a-z]+$/)
    expect(Object.keys(r.chambers!)).toEqual(['house', 'senate', 'governor'])
    expect(r.chambers!.senate).toEqual({
      parties: [
        { key: 'dem', leading: 0, votes: 0, pct: 0, called: 0 },
        { key: 'gop', leading: 0, votes: 0, pct: 0, called: 0 },
        { key: 'other', leading: 0, votes: 0, pct: 0, called: 0 },
      ],
      reporting: 0,
      called: 0,
    })
    expect(r.summary).toEqual({
      parties: r.chambers!.house.parties,
      reporting: '0%',
    })
    expect(r.official).toBe(false)
    expect(
      markOfficial({ ...r, official: true }).contests[0].choices[0].winner,
    ).toBe(false)
  })

  it('counts leaders, calls and votes per chamber', () => {
    const doc = wrapper()
    const house = doc.races.house as {
      percent_reporting: number
      region_results: Record<
        string,
        { percent_reporting: number; candidates: Record<string, unknown>[] }
      >
    }
    house.percent_reporting = 40
    const region = house.region_results['ak-al']
    region.percent_reporting = 97
    region.candidates[0].votes = 120000 // Begich (gop)
    region.candidates[0].winner = true
    region.candidates[1].votes = 80000 // Hafner (dem)
    region.candidates[2].votes = 5000
    house.region_results['ny-10'].candidates[0].votes = 50000 // Lander (dem)
    house.region_results['ny-10'].candidates[1].votes = 50000 // a tie leads nobody
    const r = normalize(doc, tiny)
    const ak = r.contests[0]
    expect(ak.choices[0].name).toBe('Nick Begich III')
    expect(ak.choices[0].winner).toBe(true)
    expect(ak.ballots).toBe(205000)
    expect(ak.reporting).toBe(97)
    expect(r.chambers!.house).toEqual({
      parties: [
        {
          key: 'dem',
          leading: 0,
          votes: 130000,
          pct: expect.any(Number),
          called: 0,
        },
        {
          key: 'gop',
          leading: 1,
          votes: 170000,
          pct: expect.any(Number),
          called: 1,
        },
        {
          key: 'other',
          leading: 0,
          votes: 5000,
          pct: expect.any(Number),
          called: 0,
        },
      ],
      reporting: 40,
      called: 1,
    })
    expect(r.polls).toEqual({ closed: 1, total: 8 })
    expect(r.ballots).toBe(305000)
    expect(r.turnout).toBeCloseTo(305000 / 217223010, 9)
    expect(r.summary!.reporting).toBe('40%')
    expect(r.sig).not.toBe(normalize(sample, tiny).sig)
    // The same counts fingerprint the same whatever the stamps say.
    const again = wrapper()
    ;(again.races.house as typeof house).percent_reporting = 40
    ;(again.races.house as typeof house).region_results = house.region_results
    again.fetchedAt = '2026-11-04T05:00:00Z'
    expect(normalize(again, tiny).sig).toBe(r.sig)
  })

  it('accepts the wrapper as text or object, with race documents as text', () => {
    const doc = wrapper()
    const asText = {
      fetchedAt: doc.fetchedAt,
      races: Object.fromEntries(
        Object.entries(doc.races).map(([k, v]) => [k, JSON.stringify(v)]),
      ),
    }
    expect(normalize(asText, tiny)).toEqual(normalize(sample, tiny))
    expect(normalize(JSON.stringify(doc), tiny)).toEqual(normalize(doc, tiny))
  })

  it('stamps the fetch time when no race carries one', () => {
    const doc = wrapper()
    for (const race of Object.values(doc.races)) delete race.last_updated
    expect(normalize(doc, tiny).asOf).toBe('2026-10-22 21:30:00')
  })

  it('refuses empty, partial and test documents', () => {
    expect(code(() => normalize('', tiny))).toBe('empty_feed')
    expect(code(() => normalize('<html>', tiny))).toBe('bad_feed')
    expect(code(() => normalize({ hello: 1 }, tiny))).toBe('bad_feed')
    const missing = wrapper()
    delete missing.races.senate
    expect(code(() => normalize(missing, tiny))).toBe('bad_feed')
    expect(() => normalize(missing, tiny)).toThrow(
      /no race document for senate/,
    )
    const test = wrapper()
    test.races.house.test_data = true
    expect(code(() => normalize(test, tiny))).toBe('not_reporting')
    const elsewhere = wrapper()
    elsewhere.races.governor.region_results = {
      tx: { name: 'Texas', candidates: [] },
    }
    expect(() => normalize(elsewhere, tiny)).toThrow(
      /none of the election's divisions/,
    )
    // One missing region is an empty contest, not a failure.
    const partial = wrapper()
    delete (partial.races.house.region_results as Record<string, unknown>)[
      'ny-10'
    ]
    const r = normalize(partial, tiny)
    expect(r.contests[2]).toMatchObject({
      id: 'ny-10',
      name: 'New York 10',
      choices: [],
      reporting: 0,
    })
  })

  it('turns the fixture night into a count that climbs and calls races', () => {
    const e = us()
    const night = fixtureFeeds(e).map((f) => normalize(feedText(f), e))
    expect(night.length).toBe(8)
    expect(night[0].asOf).toBe('2026-11-03 18:20:00')
    expect(night[7].asOf).toBe('2026-11-03 20:40:00')
    expect(night[0].polls).toEqual({ closed: 0, total: 506 })
    for (let i = 1; i < night.length; i++) {
      expect(night[i].polls.closed).toBeGreaterThanOrEqual(
        night[i - 1].polls.closed,
      )
      expect(night[i].ballots).toBeGreaterThan(night[i - 1].ballots)
      expect(night[i].sig).not.toBe(night[i - 1].sig)
    }
    const last = night[7]
    expect(last.polls.closed).toBeGreaterThan(400)
    expect(last.polls.closed).toBeLessThan(506)
    expect(last.contests.filter((c) => c.kind === 'house').length).toBe(435)
    expect(last.contests.map((c) => c.id)).toContain('ak-sen')
    const house = last.chambers!.house
    expect(
      house.parties.reduce((n, p) => n + p.leading, 0),
    ).toBeLessThanOrEqual(435)
    expect(house.parties.reduce((n, p) => n + (p.called || 0), 0)).toBe(
      house.called,
    )
    expect(last.summary!.parties).toEqual(house.parties)
    expect(last.turnout).toBeGreaterThan(0.4)
    expect(last.turnout).toBeLessThan(0.8)
    expect(JSON.stringify(last).length).toBeLessThan(400000)
    expect(new Set(last.contests.map((c) => c.id)).size).toBe(506)
  })

  it('names contests uniquely across chambers', () => {
    const [house, senate, governor] = tiny.chambers
    expect(contestId(house, 'ak-al')).toBe('ak-al')
    expect(contestId(senate, 'ak')).toBe('ak-sen')
    expect(contestId(governor, 'ak')).toBe('ak-gov')
  })

  it('strips an older row to its chamber tallies', () => {
    const r = normalize(sample, tiny)
    const stripped = stripDetail(r)!
    expect(stripped.contests).toEqual([])
    expect(stripped.chambers).toEqual(r.chambers)
    expect(stripped.summary).toEqual(r.summary)
    expect(stripped.sig).toBe(r.sig)
    expect(stripDetail(stripped)).toBeNull()
    expect(stripDetail(normalize(feed2022, any))).toBeNull()
  })
})

describe('parity with cubby.fyi', () => {
  const gold = golden()
  const summary = (p: Payload) => ({
    asOf: p.asOf,
    polls: p.polls,
    ballots: p.ballots,
    sig: p.sig || null,
    contests: p.contests.length,
  })

  it('normalizes the real fixtures to the golden payloads', () => {
    expect(normalize(feed2022, any)).toEqual(gold.real['vancouver-2022'])
    expect(normalize(feed2025, any)).toEqual(gold.real['vancouver-2025'])
    expect(normalize(enr2024, bcDocAny)).toEqual(gold.real['bc-2024-enr'])
    expect(normalize(abDoc([{ n: 1, html: eab2021 }]), abPages)).toEqual(
      gold.real['alberta-2021-eab-ref'],
    )
  })

  it('reproduces every fixture night', () => {
    const check = (name: string, feeds: unknown[], e: Election) => {
      const night = feeds.map((f) => normalize(feedText(f), e))
      expect(night.map(summary), name).toEqual(gold.nights[name].steps)
      expect(night[night.length - 1], name).toEqual(gold.nights[name].last)
    }
    check('vancouver-2026', fixtureFeeds(election), election)
    check('bc-2026', fixtureFeeds(bcDoc), bcDoc)
    check('alberta-2026-dash', fixtureFeeds(ab), ab)
    check('alberta-2026-ref', fixtureEabNight(abPages), abPages)
  })
})
