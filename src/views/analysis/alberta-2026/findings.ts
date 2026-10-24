// The key findings, written from the numbers so they stay true as the count
// moves. Each one is left out when its numbers are missing (a small or early
// count), so the list never claims a pattern it cannot show.
import { fmt, pct1, wallClock } from '../../../../shared/format.ts'
import type { Payload } from '../../../../shared/payload.ts'
import type {
  ReferendumElection,
  ReferendumQuestion,
} from '../../../../shared/schema/election.ts'
import { contestOf, tally } from '../../../../shared/stats/referendum.ts'
import {
  SEPARATION,
  type DivisionView,
  type Flip,
  type PollGap,
  type QuestionFit,
  type regionShares,
} from './stats'

export type Finding = { lead: string; text: string }

const qName = (q: ReferendumQuestion) => `Q${q.n} (${q.topic})`

/** "a", "a and b", "a, b and c" */
export function listOf(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function findings({
  election,
  latest,
  divs,
  fits,
  regions,
  gaps,
  flipped,
}: {
  election: ReferendumElection
  latest: Payload | null
  divs: DivisionView[]
  fits: QuestionFit[]
  regions: ReturnType<typeof regionShares>
  gaps: PollGap[]
  flipped: Flip[]
}): Finding[] {
  const out: Finding[] = []
  const others = election.questions.filter((q) => q.n !== SEPARATION)
  const byN = new Map(election.questions.map((q) => [q.n, q]))
  const sep = byN.get(SEPARATION)

  if (fits.length >= 2) {
    const rs = fits.map((f) => f.fit.r)
    const slopes = fits.map((f) => f.fit.b)
    const first = fits[0]
    out.push({
      lead: 'The vote ran along one axis.',
      text: `Across the ${fmt(divs.length)} divisions, the Yes share on every other question tracks the Begin process share on Question ${SEPARATION} (r between ${Math.min(...rs).toFixed(2)} and ${Math.max(...rs).toFixed(2)}, slopes ${Math.min(...slopes).toFixed(2)} to ${Math.max(...slopes).toFixed(2)}). Even where no one voted to begin the process, the fitted line puts Q${first.n} Yes near ${Math.round(first.fit.a)}%.`,
    })
  }

  const sepTally = sep ? tally(contestOf(latest, sep)) : null
  if (sep && sepTally && sepTally.started) {
    const begin = divs
      .filter((d) => (d.y[SEPARATION] ?? 0) > 50)
      .sort((a, b) => (b.y[SEPARATION] ?? 0) - (a.y[SEPARATION] ?? 0))
    const winner = sepTally.lead === 1 ? 1 : 0
    const poll = (sep.polls || []).find(
      (p) => typeof p.pct[0] === 'number' && typeof p.pct[1] === 'number',
    )
    out.push({
      lead: `${sep.options[winner].t} won Question ${SEPARATION} by ${Math.round(Math.abs(sepTally.shares[0] - sepTally.shares[1]))} points,`,
      text: `${pct1(sepTally.shares[0])} to ${pct1(sepTally.shares[1])}. ${
        begin.length
          ? `${sep.options[1].t} carried only ${listOf(begin.map((d) => `${d.name} (${pct1(d.y[SEPARATION])})`))}.`
          : `${sep.options[1].t} carried no division.`
      }${poll ? ` The last poll (${poll.by}) had it ${poll.pct[0]}% to ${poll.pct[1]}%.` : ''}`,
    })
  }

  const top = gaps
    .filter((g) => g.q.n !== SEPARATION)
    .sort((a, b) => b.value - a.value)[0]
  if (top && divs.length) {
    const majorities = divs.filter((d) => (d.y[top.q.n] ?? 0) > 50).length
    const calgary = regions.rows.find((r) => r.key === 'calgary')
    const calgaryYes = calgary
      ? others.filter((q) => (calgary.shares[q.n] ?? 0) > 50)
      : []
    const onlyInCalgary =
      calgary && calgaryYes.length === 1 && calgaryYes[0].n === top.q.n
    out.push({
      lead: `${qName(top.q)} drew the most Yes votes:`,
      text: `${pct1(top.value)}, with a majority in ${fmt(majorities)} of ${fmt(divs.length)} divisions${onlyInCalgary ? `, and the only Yes majority in Calgary (${pct1(calgary.shares[top.q.n])})` : ''}.`,
    })
  }

  const cal = regions.rows.find((r) => r.key === 'calgary')
  const edm = regions.rows.find((r) => r.key === 'edmonton')
  if (cal && edm && cal.n && edm.n) {
    const diffs = election.questions
      .map((q) => {
        const a = cal.shares[q.n]
        const b = edm.shares[q.n]
        return a != null && b != null ? a - b : null
      })
      .filter((v): v is number => v != null)
    if (diffs.length && diffs.every((v) => v > 0))
      out.push({
        lead: 'Calgary leaned further toward Yes than Edmonton on every question,',
        text: `by ${Math.min(...diffs).toFixed(1)} to ${Math.max(...diffs).toFixed(1)} points (Begin process on Question ${SEPARATION}).`,
      })
  }

  const turned = flipped.filter((f) => f.peak > 50 && f.final < 50)
  if (turned.length) {
    const last = turned.reduce((a, b) => (b.lastCross > a.lastCross ? b : a))
    const closest = others
      .map((q) => ({ q, t: tally(contestOf(latest, q)) }))
      .filter((x) => x.t.started)
      .sort(
        (a, b) => Math.abs(a.t.shares[0] - 50) - Math.abs(b.t.shares[0] - 50),
      )[0]
    out.push({
      lead: `${listOf(turned.map((f) => `Q${f.q.n}`))} led Yes during the count and then fell behind.`,
      text: `Small rural polls finished every ballot first, while big urban polls were still on the early questions. Q${last.q.n} peaked at ${pct1(last.peak)} and last crossed 50% at ${wallClock(last.lastCross)}.${closest ? ` The closest question is ${qName(closest.q)} at ${pct1(closest.t.shares[0])} Yes.` : ''}`,
    })
  }

  // The separation question's poll is in its own finding.
  const polled = gaps.filter((g) => g.range && g.q.n !== SEPARATION)
  const over = polled.filter((g) => g.value < g.range!.lo)
  const under = polled.filter((g) => g.value > g.range!.hi)
  const span = (list: PollGap[], pick: (g: PollGap) => number) =>
    `${Math.round(Math.min(...list.map(pick)))}% to ${Math.round(Math.max(...list.map(pick)))}%`
  if (over.length)
    out.push({
      lead: `Polls overstated ${over.length > 1 ? 'Yes on ' : ''}${listOf(over.map((g) => `Q${g.q.n}`))}${over.length > 1 ? '' : ' Yes'}.`,
      text: `The latest polls put option 1 at ${span(over, (g) => g.range!.latest)}; the count gave ${span(over, (g) => g.value)}. Poll figures include undecided respondents, so the real miss is at least that large.`,
    })
  if (under.length)
    out.push({
      lead: `${listOf(under.map((g) => `Q${g.q.n}`))} beat ${under.length > 1 ? 'their' : 'its'} polls.`,
      text: `The latest polls put option 1 at ${span(under, (g) => g.range!.latest)}; the count gave ${span(under, (g) => g.value)}. Undecided respondents breaking one way could account for some of it.`,
    })

  // Divisions in the five furthest from the line, above or below, on most questions.
  if (fits.length >= 3) {
    const tallyOf = (pick: (f: QuestionFit) => DivisionView[]) => {
      const n = new Map<string, { d: DivisionView; k: number }>()
      for (const f of fits)
        for (const d of pick(f)) {
          const e = n.get(d.code) || { d, k: 0 }
          e.k++
          n.set(d.code, e)
        }
      return [...n.values()]
        .filter((e) => e.k * 2 > fits.length)
        .sort((a, b) => b.k - a.k)
        .map((e) => e.d.name)
    }
    const above = tallyOf((f) => f.residuals.slice(0, 5).map((r) => r.d))
    const below = tallyOf((f) => f.residuals.slice(-5).map((r) => r.d))
    if (above.length || below.length)
      out.push({
        lead: 'Some divisions break from the pattern.',
        text: [
          above.length
            ? `${listOf(above)} voted Yes more than ${above.length > 1 ? 'their' : 'its'} separatist vote predicts on most questions.`
            : '',
          below.length
            ? `${listOf(below)} voted Yes less than the line predicts on most questions.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      })
  }
  return out
}
