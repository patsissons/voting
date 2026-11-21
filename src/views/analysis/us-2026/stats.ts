// Pure statistics for the US 2026 analysis: every race against who held it,
// how it was rated and, where the comparison holds, its 2024 result (./prior).
// Margins and swings are signed Democratic minus Republican, in points; the
// page names the direction in words. Only the newest snapshot keeps its
// contests, so everything by race reads that one; the count over time reads
// the chamber tallies every snapshot keeps.
import type { EarlyVote } from '../../../../shared/early-vote.ts'
import type { Contest, Payload } from '../../../../shared/payload.ts'
import type {
  Chamber,
  ChambersElection,
} from '../../../../shared/schema/election.ts'
import {
  calledOf,
  contestsOf,
  divisionOf,
  holderOf,
  ratingOf,
  runoffPending,
  type Rating,
} from '../../../../shared/stats/chambers.ts'
import { partyMargin } from '../../../../shared/stats/early-vote.ts'
import { linearFit, type Fit } from '../../../../shared/stats/fit.ts'
import {
  leaderOf,
  onTheClock,
  wallMs,
  type PayloadRow,
} from '../../../../shared/stats/results.ts'
import {
  HOUSE_2024,
  HOUSE_NATIONAL_2024,
  PRESIDENT_2024,
  REDRAWN,
  type PriorRow,
} from './prior'

export const DEM = 'dem'
export const GOP = 'gop'

/** A margin within this many points is close. */
export const CLOSE = 5
/** The share of the final House vote that must be in before the vote-share lines start. */
export const SHARE_FLOOR = 0.05
/** A swing inside this many points either way reads as no change on the maps. */
export const STEADY = 2

/** The rating bands, the safest Democratic seat first. */
export const BANDS = [
  'safe dem',
  'likely dem',
  'lean dem',
  'tossup',
  'lean gop',
  'likely gop',
  'safe gop',
] as const
export type Band = (typeof BANDS)[number]

export const bandOf = (r: Rating | null): Band | null =>
  !r
    ? null
    : r.grade === 'tossup'
      ? 'tossup'
      : r.party === DEM || r.party === GOP
        ? (`${r.grade} ${r.party}` as Band)
        : null

/** The party a band is rated for, or null for a toss-up. */
export const bandParty = (b: Band): string | null =>
  b === 'tossup' ? null : b.slice(b.indexOf(' ') + 1)

const round1 = (v: number) => Math.round(v * 10) / 10

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Democratic minus Republican in points of every vote; null unless both ran. */
export const marginOf = (row: PriorRow | undefined): number | null =>
  row && row[0] > 0 && row[1] > 0 && row[2] > 0
    ? ((row[0] - row[1]) / row[2]) * 100
    : null

export type RaceView = {
  id: string
  chamber: string
  state: string
  /** The division code: the district for the House, the state otherwise. */
  code: string
  /** The race in a list that mixes chambers ("Ohio 7", "Ohio Senate"), and its place alone. */
  name: string
  place: string
  /** The party holding the seat going in; null for an open or vacant seat. */
  holder: string | null
  band: Band | null
  /** The party the race is called for, else the party leading; null while a runoff is pending or nothing is counted. */
  leader: string | null
  leaderName: string | null
  called: boolean
  /** Waiting on a runoff. */
  pending: boolean
  /** The seat is led or won by a party other than its holder's. */
  flip: { from: string; to: string } | null
  votes: number
  dem: number
  gop: number
  /** Democratic minus Republican, in points; null unless the two are the race's top two. */
  margin: number | null
  /** The leader over the runner-up, in points; null with one candidate or no leader. */
  lead: number | null
  /** The margin, or where one big party did not run the leader's lead on its own side; null when neither leads. */
  signed: number | null
  /** The 2024 margin this race is set against: the district's House race, or the state's presidential vote for a Senate or governor's race. */
  prior: number | null
  /** The margin less the 2024 margin: positive toward the Democrats. */
  swing: number | null
  /** A House district in a state that redrew its map for 2026. */
  redrawn: boolean
  /** The feed's estimate of the expected vote in, 0 to 100. */
  reporting: number
}

const votesOf = (c: Contest, party: string) =>
  c.choices.reduce((n, x) => n + (x.party === party ? x.votes : 0), 0)

function raceView(chamber: Chamber, c: Contest): RaceView {
  const code = divisionOf(chamber, c)
  const state = c.region || code.slice(0, 2)
  const pending = runoffPending(c)
  const won = calledOf(c)
  const top = won || leaderOf(c)
  const leader = top ? top.party || 'other' : null
  const holder = holderOf(chamber, c) || null
  const votes = c.choices.reduce((n, x) => n + x.votes, 0)
  const dem = votesOf(c, DEM)
  const gop = votesOf(c, GOP)
  // A margin needs the two big parties to be the race's top two: where an
  // independent ran first or second, Democratic minus Republican says nothing.
  const pair = [...c.choices]
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 2)
    .map((x) => x.party)
  const headToHead = pair.indexOf(DEM) >= 0 && pair.indexOf(GOP) >= 0
  const margin =
    !pending && votes && headToHead ? ((dem - gop) / votes) * 100 : null
  const others = top ? c.choices.filter((x) => x !== top) : []
  const next = others.reduce((n, x) => Math.max(n, x.votes), 0)
  const lead =
    top && votes && others.length ? ((top.votes - next) / votes) * 100 : null
  const signed =
    margin != null
      ? margin
      : lead == null
        ? null
        : leader === DEM
          ? lead
          : leader === GOP
            ? -lead
            : null
  const house = chamber.divisions[c.id] !== undefined
  const redrawn = house && REDRAWN.indexOf(state) >= 0
  const prior = house
    ? redrawn
      ? null
      : marginOf(HOUSE_2024[code])
    : marginOf(PRESIDENT_2024[state])
  return {
    id: c.id,
    chamber: chamber.key,
    state,
    code,
    name: house
      ? c.label
      : `${c.label} ${chamber.key === 'senate' ? 'Senate' : 'governor'}`,
    place: c.label,
    holder,
    band: bandOf(ratingOf(chamber, code)),
    leader,
    leaderName: top ? top.name : null,
    called: !!won,
    pending,
    flip:
      holder && leader && leader !== holder
        ? { from: holder, to: leader }
        : null,
    votes,
    dem,
    gop,
    margin,
    lead,
    signed,
    prior,
    swing: margin != null && prior != null ? margin - prior : null,
    redrawn,
    reporting: c.reporting || 0,
  }
}

/** Every race of every chamber, in the document's order. */
export function raceViews(
  latest: Payload | null,
  election: ChambersElection,
): RaceView[] {
  if (!latest) return []
  return election.chambers.flatMap((chamber) =>
    contestsOf(latest, chamber.key).map((c) => raceView(chamber, c)),
  )
}

export type ChamberSummary = {
  key: string
  label: string
  short: string
  /** Every seat in the chamber, and the ones up this time. */
  seats: number
  up: number
  majority: number | null
  /** Seats per party now: led or won, plus the ones not up. */
  now: Record<string, number>
  /** The seats up this time that each party leads or has won. */
  led: Record<string, number>
  /** Seats per party going in, where the document says. */
  before: Record<string, number> | null
  called: number
  /** Races nobody leads yet (a pending runoff, nothing counted). */
  open: RaceView[]
  /** Led but not called. */
  uncalled: RaceView[]
  flips: RaceView[]
  /** Each party's share of the chamber's votes, 0 to 100. */
  share: Record<string, number>
  votes: number
  /** Races within CLOSE points and within one point. */
  close: number
  closest: number
  /** Races one of the two big parties sat out. */
  alone: RaceView[]
}

export function chamberSummaries(
  latest: Payload | null,
  views: RaceView[],
  election: ChambersElection,
): ChamberSummary[] {
  return election.chambers.map((chamber) => {
    const mine = views.filter((v) => v.chamber === chamber.key)
    const now: Record<string, number> = {}
    for (const k of Object.keys(chamber.holdovers || {}))
      now[k] = chamber.holdovers[k]
    const ledBy: Record<string, number> = {}
    for (const v of mine) {
      if (!v.leader) continue
      now[v.leader] = (now[v.leader] || 0) + 1
      ledBy[v.leader] = (ledBy[v.leader] || 0) + 1
    }
    const tally =
      (latest && latest.chambers && latest.chambers[chamber.key]) || null
    const share: Record<string, number> = {}
    let votes = 0
    for (const p of (tally && tally.parties) || []) {
      share[p.key] = p.pct
      votes += p.votes
    }
    const led = mine.filter((v) => v.lead != null)
    return {
      key: chamber.key,
      label: chamber.label,
      short: chamber.short,
      seats: chamber.seats,
      up: mine.length,
      majority: chamber.majority == null ? null : chamber.majority,
      now,
      led: ledBy,
      before: chamber.before || null,
      called: mine.filter((v) => v.called).length,
      open: mine.filter((v) => !v.leader),
      uncalled: mine.filter((v) => v.leader && !v.called),
      flips: mine.filter((v) => v.flip),
      share,
      votes,
      close: led.filter((v) => (v.lead as number) < CLOSE).length,
      closest: led.filter((v) => (v.lead as number) < 1).length,
      alone: mine.filter((v) => v.votes > 0 && (!v.dem || !v.gop)),
    }
  })
}

export type BandRecord = {
  band: Band
  n: number
  dem: number
  gop: number
  other: number
  /** Nobody leads yet. */
  open: number
  /** The median margin of the races both parties ran in. */
  median: number | null
  /** The median swing of the races with a 2024 comparison. */
  swing: number | null
  /** Races led by a party other than the one the band is rated for. */
  against: RaceView[]
}

/** One chamber's record in each rating band, the safest Democratic band first; bands with no race are left out. */
export function bandRecords(views: RaceView[]): BandRecord[] {
  return BANDS.map((band) => {
    const mine = views.filter((v) => v.band === band)
    const count = (k: string) => mine.filter((v) => v.leader === k).length
    const party = bandParty(band)
    return {
      band,
      n: mine.length,
      dem: count(DEM),
      gop: count(GOP),
      other: mine.filter(
        (v) => v.leader && v.leader !== DEM && v.leader !== GOP,
      ).length,
      open: mine.filter((v) => !v.leader).length,
      median: median(mine.flatMap((v) => (v.margin == null ? [] : [v.margin]))),
      swing: median(mine.flatMap((v) => (v.swing == null ? [] : [v.swing]))),
      against: party ? mine.filter((v) => v.leader && v.leader !== party) : [],
    }
  }).filter((r) => r.n)
}

export type Tipping = {
  party: string
  /** The seat that makes the majority: the party's seats in order of margin, the `majority`th. */
  seat: RaceView
  /** That seat's margin, on the party's side. */
  margin: number
  /** The party's seats beyond the majority. */
  spare: number
}

/** The seat that carries the leading party past the majority, or null when nobody has one. */
export function tippingPoint(
  views: RaceView[],
  majority: number | null,
  holdovers: Record<string, number> = {},
): Tipping | null {
  if (!majority) return null
  for (const party of [DEM, GOP]) {
    const side = party === DEM ? 1 : -1
    const mine = views
      .filter((v) => v.leader === party && v.signed != null)
      .sort((a, b) => side * ((b.signed as number) - (a.signed as number)))
    const need = majority - (holdovers[party] || 0)
    const all = views.filter((v) => v.leader === party).length
    if (need < 1 || all < need || mine.length < need) continue
    return {
      party,
      seat: mine[need - 1],
      margin: side * (mine[need - 1].signed as number),
      spare: all - need,
    }
  }
  return null
}

export type StateView = {
  key: string
  label: string
  redrawn: boolean
  /** The 2024 presidential margin. */
  president: number | null
  /** House seats, and the ones each party leads. */
  seats: number
  led: Record<string, number>
  /** The House vote in every district, and in the ones both parties ran in. */
  dem: number
  gop: number
  votes: number
  /** The margin of the House vote in the districts both parties ran in. */
  house: number | null
  /** Districts one big party sat out. */
  alone: number
  /** The House margin less the 2024 presidential margin. */
  swing: number | null
  /** The Democratic share of the two-party House vote and of the seats, 0 to 100. */
  voteShare: number | null
  seatShare: number | null
  senate: RaceView | null
  governor: RaceView | null
}

export function stateViews(
  views: RaceView[],
  election: ChambersElection,
): StateView[] {
  const out: StateView[] = []
  for (const r of election.regions) {
    const mine = views.filter((v) => v.state === r.key)
    const house = mine.filter((v) => v.chamber === 'house')
    if (!mine.length) continue
    const both = house.filter((v) => v.margin != null)
    const sum = (rows: RaceView[], pick: (v: RaceView) => number) =>
      rows.reduce((n, v) => n + pick(v), 0)
    const dem = sum(house, (v) => v.dem)
    const gop = sum(house, (v) => v.gop)
    const bothVotes = sum(both, (v) => v.votes)
    const margin = bothVotes
      ? ((sum(both, (v) => v.dem) - sum(both, (v) => v.gop)) / bothVotes) * 100
      : null
    const president = marginOf(PRESIDENT_2024[r.key])
    const led: Record<string, number> = {}
    for (const v of house)
      if (v.leader) led[v.leader] = (led[v.leader] || 0) + 1
    const decided = sum(house, (v) => (v.leader ? 1 : 0))
    out.push({
      key: r.key,
      label: r.label,
      redrawn: REDRAWN.indexOf(r.key) >= 0,
      president,
      seats: house.length,
      led,
      dem,
      gop,
      votes: sum(house, (v) => v.votes),
      house: margin,
      alone: house.length - both.length,
      swing: margin != null && president != null ? margin - president : null,
      voteShare: dem + gop ? (dem / (dem + gop)) * 100 : null,
      seatShare: decided ? ((led[DEM] || 0) / decided) * 100 : null,
      senate: mine.find((v) => v.chamber === 'senate') || null,
      governor: mine.find((v) => v.chamber === 'governor') || null,
    })
  }
  return out
}

export type Split = {
  key: string
  label: string
  senate: RaceView
  governor: RaceView
  /** The Senate margin less the governor's: positive when the Senate race was better for the Democrats. */
  gap: number
  /** Different parties lead the two races. */
  crossed: boolean
}

/** The states with a Senate and a governor's race that both big parties ran in, the widest gap first. */
export function splitTickets(states: StateView[]): Split[] {
  const out: Split[] = []
  for (const s of states) {
    const a = s.senate
    const b = s.governor
    if (!a || !b || a.margin == null || b.margin == null) continue
    out.push({
      key: s.key,
      label: s.label,
      senate: a,
      governor: b,
      gap: a.margin - b.margin,
      crossed: !!a.leader && !!b.leader && a.leader !== b.leader,
    })
  }
  return out.sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))
}

export type SwingSummary = {
  /** The national House vote: 2024, now, and the change. */
  national24: number | null
  national: number | null
  nationalSwing: number | null
  /** The House districts with a 2024 comparison: how many, how many moved toward the Democrats, the median swing. */
  districts: number
  towardDem: number
  median: number | null
  /** The districts either party sat out in one of the two years, in the states that kept their maps. */
  uncompared: number
  /** Senate and governor's races against the state's 2024 presidential vote. */
  statewide: number
  statewideMedian: number | null
}

export function swingSummary(
  views: RaceView[],
  chambers: ChamberSummary[],
): SwingSummary {
  const house = views.filter((v) => v.chamber === 'house')
  const compared = house.filter((v) => v.swing != null)
  const statewide = views.filter(
    (v) => v.chamber !== 'house' && v.swing != null,
  )
  const tally = chambers.find((c) => c.key === 'house')
  const national =
    tally && tally.votes
      ? (tally.share[DEM] || 0) - (tally.share[GOP] || 0)
      : null
  const national24 =
    ((HOUSE_NATIONAL_2024[0] - HOUSE_NATIONAL_2024[1]) /
      HOUSE_NATIONAL_2024[2]) *
    100
  return {
    national24,
    national,
    nationalSwing: national == null ? null : national - national24,
    districts: compared.length,
    towardDem: compared.filter((v) => (v.swing as number) > 0).length,
    median: median(compared.map((v) => v.swing as number)),
    uncompared: house.filter((v) => !v.redrawn && v.swing == null).length,
    statewide: statewide.length,
    statewideMedian: median(statewide.map((v) => v.swing as number)),
  }
}

export type RedrawnSplit = {
  redrawn: { seats: number; flips: number; toDem: number }
  kept: { seats: number; flips: number; toDem: number }
}

/** House seats changing hands in the states that redrew against the rest. */
export function redrawnSplit(views: RaceView[]): RedrawnSplit {
  const part = (rows: RaceView[]) => ({
    seats: rows.length,
    flips: rows.filter((v) => v.flip).length,
    toDem: rows.filter((v) => v.flip && v.flip.to === DEM).length,
  })
  const house = views.filter((v) => v.chamber === 'house')
  return {
    redrawn: part(house.filter((v) => v.redrawn)),
    kept: part(house.filter((v) => !v.redrawn)),
  }
}

export type EarlyPoint = {
  key: string
  label: string
  /** The Democratic lead among early voters registered with a party, in points. */
  early: number
  /** The margin of the state's House vote, in points. */
  result: number
}
export type EarlyPattern = { points: EarlyPoint[]; fit: Fit | null }

/** The early vote's party registration against the House vote, for the states that register by party. */
export function earlyPattern(
  states: StateView[],
  earlyVote: EarlyVote | null,
): EarlyPattern | null {
  if (!earlyVote) return null
  const points: EarlyPoint[] = []
  for (const s of states) {
    const row = earlyVote.states[s.key]
    if (!row || !row.party || !s.votes) continue
    const m = partyMargin(row.party, [DEM, GOP])
    if (m == null) continue
    points.push({
      key: s.key,
      label: s.label,
      early: m * 100,
      result: ((s.dem - s.gop) / s.votes) * 100,
    })
  }
  if (!points.length) return null
  return {
    points,
    fit: linearFit(
      points.map((p) => p.early),
      points.map((p) => p.result),
    ),
  }
}

export type Milestone = {
  chamber: string
  short: string
  party: string
  majority: number
  /** The stamp of the first snapshot with the party leading, and with it called for, a majority. */
  led: string | null
  called: string | null
}
export type CallDay = { day: string; called: number; added: number }
export type CountMoves = {
  /** The snapshots the share lines cover, and their wall-clock ms. */
  rows: PayloadRow[]
  xs: number[]
  /** Each big party's share of the House vote at each of them. */
  dem: number[]
  gop: number[]
  milestones: Milestone[]
  /** Races called by the end of each day of the count. */
  days: CallDay[]
  /** The Democratic lead in the House vote at the House majority call and now, in points. */
  leadAtCall: number | null
  leadNow: number | null
}

/** The count against the clock: the House vote shares, when each chamber's majority was led and called, and the calls per day. */
export function countMoves(
  snapshots: PayloadRow[],
  election: ChambersElection,
): CountMoves | null {
  const rows = snapshots.filter(
    (r) =>
      onTheClock(r) &&
      r.payload.chambers &&
      r.payload.chambers.house &&
      Number.isFinite(wallMs(r.payload.asOf)),
  )
  if (rows.length < 2) return null
  const pct = (p: Payload, chamber: string, key: string) => {
    const row = p.chambers![chamber]?.parties.find((x) => x.key === key)
    return row ? row.pct : 0
  }
  const tallyOf = (p: Payload, chamber: string, key: string) =>
    p.chambers![chamber]?.parties.find((x) => x.key === key) || null
  const last = rows[rows.length - 1].payload
  const milestones: Milestone[] = []
  for (const c of election.chambers) {
    if (c.majority == null) continue
    for (const party of [DEM, GOP]) {
      const held = (c.holdovers && c.holdovers[party]) || 0
      const end = tallyOf(last, c.key, party)
      if (!end || end.leading + held < c.majority) continue
      const first = (
        pick: (t: { leading: number; called?: number }) => number,
      ) => {
        const hit = rows.find((r) => {
          const t = tallyOf(r.payload, c.key, party)
          return !!t && pick(t) + held >= (c.majority as number)
        })
        return hit ? hit.payload.asOf : null
      }
      milestones.push({
        chamber: c.key,
        short: c.short,
        party,
        majority: c.majority,
        led: first((t) => t.leading),
        called: first((t) => t.called || 0),
      })
    }
  }
  const days: CallDay[] = []
  for (const r of rows) {
    const day = r.payload.asOf.slice(0, 10)
    const called = r.payload.polls.closed
    const prev = days[days.length - 1]
    if (prev && prev.day === day) {
      prev.added += called - prev.called
      prev.called = called
    } else days.push({ day, called, added: called - (prev ? prev.called : 0) })
  }
  const leadOf = (p: Payload) => pct(p, 'house', DEM) - pct(p, 'house', GOP)
  const houseCall = milestones.find((m) => m.chamber === 'house')
  const atCall =
    houseCall && houseCall.called
      ? rows.find((r) => r.payload.asOf === houseCall.called)
      : null
  // The share lines start once a twentieth of the final vote is in: the first
  // few thousand votes swing between the parties and would set the scale.
  const floor = last.ballots * SHARE_FLOOR
  const from = Math.max(
    0,
    rows.findIndex((r) => r.payload.ballots >= floor),
  )
  const shown = rows.slice(from)
  return {
    rows: shown,
    xs: shown.map((r) => wallMs(r.payload.asOf)),
    dem: shown.map((r) => round1(pct(r.payload, 'house', DEM))),
    gop: shown.map((r) => round1(pct(r.payload, 'house', GOP))),
    milestones,
    days,
    leadAtCall: atCall ? leadOf(atCall.payload) : null,
    leadNow: leadOf(last),
  }
}

/** The newest payload that still carries its contests (older rows keep only the chamber tallies). */
export function latestFull(snapshots: PayloadRow[]): Payload | null {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const p = snapshots[i].payload
    if (p && p.contests && p.contests.length) return p
  }
  return null
}
