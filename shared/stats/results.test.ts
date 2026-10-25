import { describe, expect, it } from 'vitest'
import { fixtureFeeds, feedText } from '../../scripts/fixtures/fixture.ts'
import {
  bc,
  bcAny,
  fixture,
  vancouver,
  vancouverAny,
} from '../../scripts/fixtures/load.ts'
import { normalize } from '../parsers/index.ts'
import type { Payload } from '../payload.ts'
import {
  boxesReported,
  changingHands,
  cityHallSeats,
  closest,
  complete,
  councilCentre,
  initialDone,
  legislatureCentre,
  mayorTimeline,
  momentum,
  momentumClock,
  partyShares,
  popularSeries,
  regionShares,
  rejectedBallots,
  seatLineRace,
  seatsTimeline,
  shareClock,
  wallMs,
} from './results.ts'

const election = vancouver()
const any = vancouverAny()
const bcDoc = bc()
const enr2024 = fixture('voting-2024-enr-candidate.html')
const enr2026 = fixture('voting-2026-enr-candidate.html')
const night = fixtureFeeds(election).map((f) => ({
  payload: normalize(feedText(f), any),
}))
const bcNight = fixtureFeeds(bcDoc).map((f) => ({
  payload: normalize(f as string, bcDoc),
}))
const enrPayload = () => normalize(enr2024, bcAny())

describe('at-large stats', () => {
  it('completes once every place and tabulator is in, or official', () => {
    expect(complete(night[0].payload)).toBe(false)
    expect(complete(night[night.length - 1].payload)).toBe(true)
    expect(complete({ ...night[0].payload, official: true })).toBe(true)
    expect(
      complete({
        polls: { closed: 106, total: 106 },
        tabulators: { closed: 204, total: 205 },
      }),
    ).toBe(false)
  })

  it('splits every office’s votes by party, adding to 100', () => {
    const latest = night[night.length - 1].payload
    const shares = partyShares(latest, election)
    expect(shares.map((o) => o.kind)).toEqual([
      'mayor',
      'council',
      'park',
      'school',
    ])
    for (const office of shares) {
      const contest = latest.contests.find((c) => c.kind === office.kind)!
      expect(office.total).toBe(
        contest.choices.reduce((n, c) => n + c.votes, 0),
      )
      expect(
        Math.abs(office.parts.reduce((n, x) => n + x.share, 0) - 100),
      ).toBeLessThan(1e-9)
      expect(office.parts.reduce((n, x) => n + x.candidates, 0)).toBe(
        contest.choices.length,
      )
    }
    expect(shares[1].parts.find((x) => x.key === 'abc')!.candidates).toBe(
      election.parties.find((p) => p.key === 'abc')!.council.length,
    )
  })

  it('fills all 27 City Hall seats by current rank', () => {
    const latest = night[3].payload
    const hall = cityHallSeats(latest, election)
    expect(hall.seats).toBe(27)
    expect(hall.offices.map((o) => o.seats.length)).toEqual([1, 10, 7, 9])
    expect(hall.totals.reduce((n, t) => n + t.seats, 0)).toBe(27)
    const council = latest.contests.find((c) => c.kind === 'council')!
    expect(hall.offices[1].seats.map((s) => s.ballot)).toEqual(
      council.choices.slice(0, 10).map((c) => c.ballot),
    )
  })

  it('reads mayor momentum as the share of votes added since about an hour before', () => {
    const m = momentum(night)!
    expect(m.since).toBe('2026-10-17 22:25:00')
    const mayor = (i: number) =>
      night[i].payload.contests.find((c) => c.kind === 'mayor')!
    const sum = (c: { choices: { votes: number }[] }) =>
      c.choices.reduce((n, x) => n + x.votes, 0)
    const now = mayor(7)
    const then = mayor(4)
    expect(m.votes).toBe(sum(now) - sum(then))
    for (const row of m.rows) {
      const a = now.choices.find((c) => c.ballot === row.ballot)!.votes
      const b = then.choices.find((c) => c.ballot === row.ballot)!.votes
      expect(Math.abs(row.recent - ((a - b) / m.votes) * 100)).toBeLessThan(
        1e-9,
      )
      expect(Math.abs(row.overall - (a / sum(now)) * 100)).toBeLessThan(1e-9)
    }
    expect(m.rows.length).toBe(4)
    expect(momentum(night.slice(0, 2))!.since).toBe('2026-10-17 20:45:00')
    expect(momentum(night.slice(0, 1))).toBeNull()
  })

  it('tracks the seat-line race per multi-seat office', () => {
    const races = seatLineRace(night, election)
    expect(races.map((r) => [r.kind, r.voteFor, r.points.length])).toEqual([
      ['council', 10, 8],
      ['park', 7, 8],
      ['school', 9, 8],
    ])
    night.forEach((row, i) => {
      const c = row.payload.contests.find((x) => x.kind === 'park')!
      expect(races[1].points[i].gap).toBe(
        c.choices[6].votes - c.choices[7].votes,
      )
      expect(races[1].points[i].last.name).toBe(c.choices[6].name)
    })
    expect(seatLineRace(night.slice(0, 1), election)).toEqual([])
  })

  it('places the council centre at the seat-weighted mean of party positions', () => {
    const latest = night[night.length - 1].payload
    const council = latest.contests.find((c) => c.kind === 'council')!
    const out = councilCentre(latest, election)!
    expect(out.parties.reduce((n, x) => n + x.seats, 0)).toBe(10)
    const placed = council.choices.slice(0, 10).filter((c) => c.party)
    const axis = (c: { party: string | null }) =>
      election.parties.find((p) => p.key === c.party)!.axis
    expect(out.unplaced).toBe(10 - placed.length)
    expect(
      Math.abs(
        out.centre!.x -
          placed.reduce((n, c) => n + axis(c).e, 0) / placed.length,
      ),
    ).toBeLessThan(1e-9)
    expect(
      Math.abs(
        out.centre!.y -
          placed.reduce((n, c) => n + axis(c).s, 0) / placed.length,
      ),
    ).toBeLessThan(1e-9)
  })

  it('draws the mayoral timeline from the four leaders', () => {
    const t = mayorTimeline(night, election)!
    expect(t.xs.length).toBe(8)
    expect(t.series.length).toBe(4)
    expect(t.series[0].values.length).toBe(8)
    expect(mayorTimeline(night.slice(0, 1), election)).toBeNull()
  })

  it('measures wall-clock gaps', () => {
    expect(wallMs('2026-10-19 21:10:00') - wallMs('2026-10-19 20:00:00')).toBe(
      70 * 60000,
    )
    expect(Number.isNaN(wallMs('soon'))).toBe(true)
  })
})

describe('riding stats', () => {
  it('completes an Elections BC count only once official, whatever the boxes say', () => {
    const r = enrPayload()
    expect(r.polls).toEqual({ closed: 2146, total: 2146 })
    expect(complete(r)).toBe(false)
    expect(initialDone(r)).toBe(true)
    expect(complete({ ...r, official: true })).toBe(true)
    expect(initialDone(bcNight[0].payload)).toBe(false)
    const last = bcNight[bcNight.length - 1].payload
    expect(initialDone(last)).toBe(/complete/i.test(last.status!.initial))
    expect(initialDone(night[night.length - 1].payload)).toBe(false)
  })

  it('sums ballot boxes across ridings to the page totals', () => {
    const r = enrPayload()
    const b = boxesReported(r)
    expect(b.ridings).toBe(93)
    expect(b.advance[0] + b.final[0]).toBe(r.polls.closed)
    expect(b.advance[1] + b.final[1]).toBe(r.polls.total)
    expect([b.ridingsIn, b.oodReported, b.oodComplete]).toEqual([93, 93, 93])
    const first = boxesReported(bcNight[0].payload)
    expect(first.ridingsIn < first.ridings).toBe(true)
    expect(first.advance[0] + first.final[0]).toBe(
      bcNight[0].payload.polls.closed,
    )
  })

  it('reports no out-of-district line and counts rejected ballots on the 2026 page', () => {
    const r = normalize(enr2026, bcDoc)
    expect(boxesReported(r)).toMatchObject({ ridings: 93, oodReported: 0 })
    expect(rejectedBallots(r)).toBe(0)
    expect(rejectedBallots(enrPayload())).toBeNull()
    const some: Payload = {
      ...r,
      contests: r.contests.map((c, i) => ({ ...c, rejected: i < 3 ? 4 : 0 })),
    }
    expect(rejectedBallots(some)).toBe(12)
  })

  it("plots each party's share of the vote against the clock", () => {
    const t = shareClock(bcNight, bcDoc)!
    expect(t.rows.length).toBeGreaterThanOrEqual(2)
    expect(t.xs).toEqual(t.rows.map((r) => wallMs(r.payload.asOf)))
    expect(t.xs.every((x, i) => i === 0 || x > t.xs[i - 1])).toBe(true)
    const last = t.rows[t.rows.length - 1].payload
    const lead = last
      .summary!.parties.slice()
      .sort((a, b) => b.votes - a.votes)[0]
    expect(t.series[0].id).toBe(lead.key)
    const total = last.summary!.parties.reduce((n, p) => n + p.votes, 0)
    expect(t.series[0].values[t.rows.length - 1]).toBeCloseTo(
      (lead.votes / total) * 100,
      9,
    )
    expect(shareClock(bcNight.slice(0, 1), bcDoc)).toBeNull()
  })

  it("plots each party's share of the newest votes against the clock", () => {
    const t = momentumClock(bcNight, bcDoc, 15)!
    // The fixture steps 20 minutes apart, so each point measures from the one before.
    const rows = bcNight.filter((r) => r.payload.ballots > 0)
    expect(t.rows[0]).toBe(rows[1])
    const votes = (p: Payload, k: string) =>
      p.summary!.parties.find((x) => x.key === k)!.votes
    const k = t.series[0].id
    const [a, b] = [rows[1].payload, rows[2].payload]
    const added = b.ballots - a.ballots
    expect(t.series[0].values[1]).toBeCloseTo(
      ((votes(b, k) - votes(a, k)) / added) * 100,
      9,
    )
    // A wide window reaches back to the first stored snapshot.
    const wide = momentumClock(bcNight, bcDoc, 600)!
    const first = rows[0].payload
    const end = rows[rows.length - 1].payload
    expect(wide.series[0].values[wide.rows.length - 1]).toBeCloseTo(
      ((votes(end, k) - votes(first, k)) / (end.ballots - first.ballots)) * 100,
      9,
    )
  })

  it('compares each riding leader with the 2024 winning party', () => {
    const r = enrPayload()
    const base = changingHands(r, bcDoc)
    const initialFlips = r.contests.filter((c) => {
      const d = bcDoc.districts.find((x) => x.code === c.id)!
      return (
        d.last && (d.last.party || 'other') !== (c.choices[0].party || 'other')
      )
    })
    expect(base.flips.length).toBe(initialFlips.length)
    const abm = r.contests.find((c) => c.id === 'ABM')!
    abm.choices.reverse()
    const out = changingHands(r, bcDoc)
    expect(out.flips.length).toBe(base.flips.length + 1)
    const flip = out.flips.find((f) => f.id === 'ABM')!
    expect([flip.from, flip.to, flip.lead]).toEqual(['cp', 'ndp', 'Pam Alexis'])
    expect(Math.abs(flip.margin - (44.34 - 55.66))).toBeLessThan(1e-9)
    expect(out.byPair.reduce((n, p) => n + p.n, 0)).toBe(out.flips.length)
    abm.choices[1].votes = abm.choices[0].votes
    expect(changingHands(r, bcDoc).flips.length).toBe(base.flips.length)
  })

  it('lists the closest ridings tightest first', () => {
    const r = enrPayload()
    const near = closest(r, 8)
    expect(near.length).toBe(8)
    for (let i = 1; i < near.length; i++)
      expect(near[i - 1].margin <= near[i].margin).toBe(true)
    const all = r.contests
      .map((c) => c.choices[0].pct - c.choices[1].pct)
      .sort((a, b) => a - b)
    expect(Math.abs(near[0].margin - all[0])).toBeLessThan(1e-9)
    expect(near[0].votes).toBe(near[0].lead.votes - near[0].next.votes)
  })

  it('reads popular-vote momentum as each party’s share of the votes added', () => {
    const m = momentum(bcNight, 60, 5, popularSeries(bcDoc))!
    expect(m && m.votes > 0).toBe(true)
    const latest = bcNight[bcNight.length - 1].payload
    const base = bcNight.find((x) => x.payload.asOf === m.since)!.payload
    const votes = (p: Payload, key: string) =>
      p.summary!.parties.find((x) => x.key === key)!.votes
    const total = (p: Payload) =>
      p.summary!.parties.reduce((n, x) => n + x.votes, 0)
    expect(m.votes).toBe(total(latest) - total(base))
    for (const row of m.rows) {
      expect(
        Math.abs(
          row.recent -
            ((votes(latest, row.id) - votes(base, row.id)) / m.votes) * 100,
        ),
      ).toBeLessThan(1e-9)
      expect(
        Math.abs(row.overall - (votes(latest, row.id) / total(latest)) * 100),
      ).toBeLessThan(1e-9)
    }
    expect(
      m.rows.every((r, i) => i === 0 || m.rows[i - 1].overall >= r.overall),
    ).toBe(true)
  })

  it('splits regions to 100 and counts the ridings each party leads', () => {
    const r = enrPayload()
    const regions = regionShares(r, bcDoc)
    expect(regions.reduce((n, x) => n + x.ridings, 0)).toBe(93)
    for (const reg of regions) {
      expect(
        Math.abs(reg.parts.reduce((n, x) => n + x.share, 0) - 100),
      ).toBeLessThan(1e-9)
      expect(reg.parts.reduce((n, x) => n + x.led, 0)).toBe(reg.ridings)
    }
    expect(regions.reduce((n, x) => n + x.total, 0)).toBe(r.ballots)
  })

  it('places the legislature centre at the seat-weighted mean of the leaders', () => {
    const r = enrPayload()
    const out = legislatureCentre(r, bcDoc)!
    expect(out.parties.map((x) => [x.key, x.seats])).toEqual([
      ['ndp', 46],
      ['cp', 45],
      ['green', 2],
    ])
    expect(out.unplaced).toBe(0)
    const axis = (k: string) => bcDoc.parties.find((p) => p.key === k)!.axis
    expect(
      Math.abs(
        out.centre!.x -
          (46 * axis('ndp').e + 45 * axis('cp').e + 2 * axis('green').e) / 93,
      ),
    ).toBeLessThan(1e-9)
    expect(
      Math.abs(
        out.centre!.y -
          (46 * axis('ndp').s + 45 * axis('cp').s + 2 * axis('green').s) / 93,
      ),
    ).toBeLessThan(1e-9)
    expect(
      legislatureCentre({ contests: [] } as unknown as Payload, bcDoc),
    ).toBeNull()
  })

  it('draws the seat timeline from the leading parties', () => {
    const t = seatsTimeline(bcNight, bcDoc)!
    expect(t.series.length).toBeGreaterThan(1)
    expect(t.series[0].values.length).toBe(8)
    expect(seatsTimeline(night, election)).toBeNull()
  })
})
