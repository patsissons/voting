// The key findings, written from the numbers so they stay true as the last
// races are called and the runoffs land. Each one is left out when its
// numbers are missing or say nothing, so the list never claims a pattern it
// cannot show.
import { fmt, wallClock } from '../../../../shared/format.ts'
import { listOf } from '../alberta-2026/findings'
import {
  DEM,
  GOP,
  type BandRecord,
  type ChamberSummary,
  type CountMoves,
  type EarlyPattern,
  type RaceView,
  type RedrawnSplit,
  type Split,
  type SwingSummary,
  type Tipping,
} from './stats'

export type Finding = { lead: string; text: string }

/** A correlation too weak to call a pattern. */
const WEAK = 0.3

/** How a party reads after "the" in a sentence. */
const THE: Record<string, string> = {
  dem: 'Democrats',
  gop: 'Republicans',
  other: 'independents',
}
export const the = (key: string) => THE[key] || THE.other

/** One letter for a party in a tight spot: D, R or I. */
export const letter = (key: string | null) =>
  key === DEM ? 'D' : key === GOP ? 'R' : key ? 'I' : '-'

/** "toward the Democrats" or "toward the Republicans" for a signed swing. */
export const toward = (swing: number) =>
  `toward the ${the(swing >= 0 ? DEM : GOP)}`

/** A swing in words, its direction once: "8.0 pts toward the Democrats". */
export const swingText = (swing: number) =>
  Math.abs(swing) < 0.05
    ? 'no change'
    : `${Math.abs(swing).toFixed(1)} pts ${toward(swing)}`

/** A Democratic-minus-Republican margin as who leads: "Democrats by 5.4". */
export const leadText = (margin: number) =>
  Math.abs(margin) < 0.05
    ? 'level'
    : `${the(margin >= 0 ? DEM : GOP)} by ${Math.abs(margin).toFixed(1)}`

/** A band in words: "Safe Democratic", "Toss-up". */
export const bandLabel = (band: string) => {
  if (band === 'tossup') return 'Toss-up'
  const [grade, party] = band.split(' ')
  return `${grade[0].toUpperCase()}${grade.slice(1)} ${party === DEM ? 'Democratic' : 'Republican'}`
}

const seatsText = (n: number) => `${fmt(n)} seat${n === 1 ? '' : 's'}`
const racesText = (n: number) => `${fmt(n)} race${n === 1 ? '' : 's'}`
const pts = (v: number) => `${Math.abs(v).toFixed(1)} points`

/** The party with the most seats in a chamber now. */
const ahead = (c: ChamberSummary) =>
  Object.keys(c.now).sort((a, b) => c.now[b] - c.now[a])[0] || null

const score = (c: ChamberSummary) =>
  `${fmt(c.now[DEM] || 0)} to ${fmt(c.now[GOP] || 0)}`

export function findings({
  chambers,
  views,
  swing,
  bands,
  tipping,
  splits,
  redrawn,
  early,
  moves,
}: {
  chambers: ChamberSummary[]
  views: RaceView[]
  swing: SwingSummary
  /** The House's record by rating band. */
  bands: BandRecord[]
  tipping: Tipping | null
  splits: Split[]
  redrawn: RedrawnSplit
  early: EarlyPattern | null
  moves: CountMoves | null
}): Finding[] {
  const out: Finding[] = []
  if (!views.some((v) => v.leader)) return out
  const house = chambers.find((c) => c.key === 'house')

  // The chambers.
  const top = house ? ahead(house) : null
  if (house && top) {
    const n = house.now[top] || 0
    const was = house.before ? house.before[top] || 0 : null
    const rest = chambers
      .filter((c) => c !== house)
      .map(
        (c) =>
          `${score(c)} ${c.key === 'governor' ? 'among governors' : `in the ${c.short}`}`,
      )
    out.push({
      lead: `The ${the(top)} lead ${fmt(n)} of the ${fmt(house.seats)} House seats${house.majority && n >= house.majority ? ', a majority' : ''}.`,
      text: `${was == null ? '' : `They held ${fmt(was)} going in. `}${rest.length ? `Democrats to Republicans, it is ${listOf(rest)}.` : ''}`.trim(),
    })
  }

  // Seats changing hands.
  const flips = views.filter((v) => v.flip)
  if (flips.length) {
    const toDem = flips.filter((v) => v.flip!.to === DEM).length
    const toGop = flips.filter((v) => v.flip!.to === GOP)
    const major = toDem >= flips.length - toDem ? DEM : GOP
    const majorN = major === DEM ? toDem : toGop.length
    const per = chambers
      .filter((c) => c.flips.length)
      .map(
        (c) =>
          `${fmt(c.flips.length)} ${c.key === 'governor' ? "governors' races" : `in the ${c.short}`}`,
      )
    const minor = flips.filter((v) => v.flip!.to !== major)
    out.push({
      lead: `${seatsText(flips.length)} changed hands, ${majorN === flips.length ? 'every one' : fmt(majorN)} to the ${the(major)}:`,
      text: `${listOf(per)}.${minor.length && minor.length <= 4 ? ` The ${the(major === DEM ? GOP : DEM)} took ${listOf(minor.map((v) => v.name))}.` : ''}`,
    })
  }

  // The swing.
  if (swing.nationalSwing != null && swing.national != null) {
    const d = swing.districts
    out.push({
      lead: `The House vote moved ${swingText(swing.nationalSwing)} on 2024.`,
      text: `It was ${leadText(swing.national24 as number)} then and is ${leadText(swing.national)} now.${
        d >= 3 && swing.median != null
          ? ` Of the ${fmt(d)} districts that can be set against their own 2024 race, ${fmt(swing.towardDem)} moved toward the Democrats, and the middle one moved ${pts(swing.median)} ${toward(swing.median)}.`
          : ''
      }`,
    })
  }

  // The ratings.
  const tossup = bands.find((b) => b.band === 'tossup')
  const against = bands.flatMap((b) => b.against)
  if (tossup && tossup.dem + tossup.gop > 0) {
    const safe = bands
      .filter((b) => b.band.startsWith('safe'))
      .flatMap((b) => b.against)
    const hi = Math.max(tossup.dem, tossup.gop)
    const lo = Math.min(tossup.dem, tossup.gop)
    out.push({
      lead:
        hi === lo
          ? `The House toss-ups split ${fmt(hi)} each.`
          : `The House toss-ups broke ${fmt(hi)} to ${fmt(lo)} for the ${the(tossup.dem > tossup.gop ? DEM : GOP)}.`,
      text: against.length
        ? `${seatsText(against.length)} went against ${against.length === 1 ? 'its' : 'their'} rating${
            safe.length
              ? `, ${fmt(safe.length)} of them rated safe: ${listOf(safe.map((v) => v.name))}`
              : ''
          }.`
        : 'No rated seat went against its rating.',
    })
  }

  // The tipping point.
  if (tipping && swing.national != null) {
    const side = tipping.party === DEM ? 1 : -1
    out.push({
      lead: `The seat that made the majority was won by ${pts(tipping.margin)}.`,
      text: `Ordered by margin, the ${the(tipping.party)}' majority seat is ${tipping.seat.name}; the party leads the national House vote by ${pts(side * swing.national)} and has ${seatsText(tipping.spare)} to spare.`,
    })
  }

  // Close races.
  if (house && house.close) {
    out.push({
      lead: `${fmt(house.close)} House race${house.close === 1 ? ' is' : 's are'} within 5 points,`,
      text: `${fmt(house.closest)} of them within 1.${house.alone.length ? ` One of the two big parties sat out ${fmt(house.alone.length)} districts.` : ''}`,
    })
  }

  // The redrawn states.
  if (redrawn.redrawn.flips && redrawn.redrawn.seats && redrawn.kept.seats) {
    const rate = (p: { seats: number; flips: number }) =>
      `${fmt(p.flips)} of ${fmt(p.seats)}`
    out.push({
      lead: `${fmt(redrawn.redrawn.flips)} of the House seats that changed hands are in the ten states that redrew their maps:`,
      text: `${rate(redrawn.redrawn)} seats there, against ${rate(redrawn.kept)} in the other forty.`,
    })
  }

  // Split tickets.
  const crossed = splits.filter((s) => s.crossed)
  if (splits.length >= 3) {
    const wide = splits[0]
    out.push({
      lead: crossed.length
        ? `${listOf(crossed.map((s) => s.label))} chose a senator from one party and a governor from the other.`
        : 'No state chose a senator from one party and a governor from the other.',
      text: `The widest gap is ${wide.label}: ${leadText(wide.senate.margin as number)} for the Senate, ${leadText(wide.governor.margin as number)} for governor.`,
    })
  }

  // The early vote.
  if (early && early.fit && early.points.length >= 5) {
    const r = early.fit.r
    out.push({
      lead:
        Math.abs(r) < WEAK
          ? 'The early vote said little about the result.'
          : 'The early vote tracked the result.',
      text: `Across the ${fmt(early.points.length)} states that register voters by party, the party lead among early voters and the House vote margin have r = ${r.toFixed(2)}.${
        Math.abs(r) < WEAK
          ? ''
          : ` A state's margin ran about ${Math.abs(early.fit.b).toFixed(1)} points for each point of early lead.`
      }`,
    })
  }

  // The count.
  const m = moves && moves.milestones.find((x) => x.chamber === 'house')
  if (moves && m && m.led) {
    out.push({
      lead: `The ${the(m.party)} led ${fmt(m.majority)} House seats by ${wallClock(m.led)} Eastern${m.called ? ` and had them called by ${wallClock(m.called)}.` : '.'}`,
      text:
        moves.leadAtCall != null && moves.leadNow != null
          ? `Their lead in the House vote was ${pts(moves.leadAtCall)} at that call and is ${pts(moves.leadNow)} now, as the slower counts came in.`
          : '',
    })
  }

  // What is still open.
  const open = views.filter((v) => !v.called)
  if (open.length) {
    const pending = open.filter((v) => v.pending)
    const led = open.filter((v) => !v.pending && v.leader)
    const parts = [
      ...(led.length
        ? [
            `${listOf(led.map((v) => `${v.name} (${letter(v.leader)} by ${(v.lead || 0).toFixed(1)})`))} ${led.length === 1 ? 'is' : 'are'} led but not called`,
          ]
        : []),
      ...(pending.length
        ? [
            `${listOf(pending.map((v) => v.name))} ${pending.length === 1 ? 'goes' : 'go'} to a runoff`,
          ]
        : []),
    ]
    if (parts.length)
      out.push({
        lead: `${racesText(open.length)} ${open.length === 1 ? 'is' : 'are'} still open.`,
        text: `${parts.join('; ')}. This page follows them.`.replace(
          /^./,
          (c) => c.toUpperCase(),
        ),
      })
  }
  return out.map((f) => ({ lead: f.lead, text: f.text.trim() }))
}
