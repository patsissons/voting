// The agent-readable pages: one election as markdown (/<slug>.md, or
// /<slug> with Accept: text/markdown) and the llms.txt index. Port of
// cubby.fyi's content.js over the shared stats, so the numbers match the
// page. Pure: the hooks and the MCP summary tool call these with rows the
// Db already filtered to published.
import type { EarlyVote } from '../shared/early-vote.ts'
import { dayShort, fmt, pct1, signed, wallClock } from '../shared/format.ts'
import type { Payload, Snapshot } from '../shared/payload.ts'
import type {
  ChambersElection,
  CompassElection,
  Election,
  Link,
  ReferendumElection,
} from '../shared/schema/election.ts'
import { changingHands, complete, leaderOf } from '../shared/stats/results.ts'
import { ballotWide, contestOf } from '../shared/stats/referendum.ts'
import { balanceOf, calledOf, contestsOf } from '../shared/stats/chambers.ts'
import {
  changeFromPrior,
  daySeries,
  earlyVoteDivisions,
  earlyVoteFormat,
  partyMargin,
  partySplit,
  partyTotals,
  shareOfRegistered,
  turnoutByState,
} from '../shared/stats/early-vote.ts'

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

// The stamps are wall-clock time in the election's zone.
const ZONES: Record<string, string> = {
  'America/Vancouver': 'Pacific time',
  'America/Edmonton': 'Mountain time',
  'America/Toronto': 'Eastern time',
  'America/New_York': 'Eastern time',
}
const zoneName = (election: Election) =>
  ZONES[election.timeZone] || election.timeZone || 'local time'

const links = (rows: Link[]) =>
  rows.map((s) => `- [${s.label}](${s.url})`).join('\n')

export function datesMarkdown(election: Election): string {
  const d = election.dates
  const lines = ['## When to vote', '']
  if (d.advance.length)
    lines.push(`- Advance voting days: ${d.advance.join(', ')}`)
  lines.push(
    `- Final voting day: ${d.final}${d.hours ? ` (voting places open ${d.hours})` : ''}`,
  )
  if (d.mailBy) lines.push(`- ${d.mailBy}`)
  if (d.url) lines.push(`- [Where to vote](${d.url})`)
  if (election.resources.length)
    lines.push('', '### Before you vote', '', links(election.resources))
  return lines.join('\n')
}

export function compassMarkdown(
  election: CompassElection,
  origin: string,
): string {
  const parties: Record<string, CompassElection['parties'][number]> = {}
  for (const p of election.parties) parties[p.key] = p
  const slate = (rows: (readonly [number, string, ...unknown[]])[]) =>
    rows
      .map(([n, name, inc]) => `${n} ${name}${inc ? ' (sitting)' : ''}`)
      .join('; ')
  const axis = (a: { e: number; s: number } | undefined) =>
    a
      ? ` Position: economic ${a.e < 0 ? 'left' : a.e > 0 ? 'right' : 'centre'} ${Math.abs(a.e)}, social ${a.s < 0 ? 'conservative' : a.s > 0 ? 'progressive' : 'centre'} ${Math.abs(a.s)} (each axis -1 to 1).`
      : ''
  const district = election.ballot === 'district'
  const lines = [district ? '## Parties' : '## Parties and slates', '']
  for (const p of election.parties) {
    lines.push(
      `### ${p.url ? `[${p.name}](${p.url})` : p.name}`,
      '',
      `${p.lean}${axis(p.axis)}`,
      '',
    )
    if (election.ballot === 'district') {
      const dp = p as (typeof election.parties)[number]
      if (dp.leader) lines.push(`- Leader: ${dp.leader}`)
      if (dp.candidates != null)
        lines.push(
          `- Candidates: ${dp.candidates} of ${election.seats} ridings`,
        )
      lines.push('')
      continue
    }
    const ap = p as Extract<
      CompassElection,
      { ballot: 'at-large' }
    >['parties'][number]
    for (const o of election.offices) {
      if (o.key === 'mayor')
        lines.push(
          `- ${o.label}: ${ap.mayor ? slate([ap.mayor]) : ap.endorses || 'none'}`,
        )
      else
        lines.push(
          `- ${o.label}: ${slate((ap as unknown as Record<string, (readonly [number, string, ...unknown[]])[]>)[o.key] || [])}`,
        )
    }
    lines.push('')
  }
  if (election.ballot === 'district') {
    lines.push(
      '## Ridings',
      '',
      `One vote, for one ${election.offices[0]?.label || 'member'}, in the voter's riding. Candidates are listed with their compass party key; (sitting) marks a current member; "last time" is who won the riding last time and by how many points.`,
      '',
    )
    const regions = election.regions.length
      ? election.regions
      : [{ key: '', label: 'All ridings' }]
    for (const reg of regions) {
      const list = election.districts.filter(
        (d) => !reg.key || d.region === reg.key,
      )
      if (!list.length) continue
      lines.push(`### ${reg.label}`, '')
      for (const d of list) {
        const names = d.candidates
          .map(
            ([n, k, inc, label]) =>
              `${n} (${k ? parties[k].short : (typeof label === 'string' && label) || 'Independent'}${inc ? ', sitting' : ''})`,
          )
          .join('; ')
        const last =
          d.last && d.last.party && parties[d.last.party]
            ? `; last time: ${parties[d.last.party].short} by ${d.last.margin}`
            : ''
        lines.push(`- ${d.code} ${d.name}: ${names}${last}`)
      }
      lines.push('')
    }
  }
  lines.push(
    '## Compass questions',
    '',
    `Each answer awards parties 0 to 3 points; "matters a lot" doubles a question; a party's match is points earned over points possible across the answered questions. Answers also place the voter on a two-axis plane (economic left -1 to right +1, social conservative -1 to progressive +1) as the weighted mean of the chosen options' axis values, shown after each option as [e, s]. Results are permalinks: ${origin}/${election.slug}#/compass/<code>, one character per question in order ("-" skipped, "0"-"9" the option index, "A"-"J" the option counted double).`,
    '',
  )
  election.questions.forEach((q, i) => {
    lines.push(`### ${i + 1}. ${q.topic}: ${q.q}`, '', q.context, '')
    for (const o of q.opts) {
      const pts = Object.keys(o.pts)
        .sort((a, b) => o.pts[b] - o.pts[a])
        .map((k) => `${parties[k].short} +${o.pts[k]}`)
        .join(', ')
      lines.push(
        `- ${o.t} (${pts || 'neutral'})${o.axis ? ` [${o.axis.e}, ${o.axis.s}]` : ''}`,
      )
    }
    lines.push('')
  })
  if (election.note) lines.push(election.note.text, '')
  if (election.sources.length)
    lines.push(
      'Sources: ' +
        election.sources.map((s) => `[${s.label}](${s.url})`).join(', '),
    )
  return lines.join('\n')
}

export function resultsMarkdown(
  election: CompassElection,
  snapshot: Snapshot | null,
  earlyVote: EarlyVote | null = null,
): string {
  const results = election.results
  const follow = results.alternatives.length
    ? `\n\nAlso follow:\n\n${links(results.alternatives)}`
    : ''
  const source = results.label
    ? `${results.label}'s results page`
    : "the City's results page"
  if (!snapshot)
    return `## Results\n\nNo results yet. They appear after polls close on voting day, from [${source}](${results.official}).${follow}${earlyVote ? `\n\n${earlyVoteMarkdown(election, earlyVote)}` : ''}`
  const r = snapshot.payload
  const parties: Record<string, CompassElection['parties'][number]> = {}
  for (const p of election.parties) parties[p.key] = p
  const party = (c: { party: string | null; partyName: string }) =>
    c.party && parties[c.party]
      ? parties[c.party].short
      : c.partyName || 'Independent'
  const short = (key: string) =>
    key === 'other' || !parties[key] ? 'Others' : parties[key].short
  const unit = results.unit || 'voting places'
  const lines = [
    `## Results (${r.official ? 'official' : 'unofficial'}, as of ${r.asOf} ${zoneName(election)}${r.status && r.status.initial ? `, initial count ${r.status.initial.toLowerCase()}` : ''}${
      r.status && r.status.final && !r.official
        ? `; final count ${r.status.final}`
        : ''
    })`,
    '',
    `${fmt(r.polls.closed)} of ${fmt(r.polls.total)} ${unit} reported; ${fmt(r.ballots)} ballots counted${r.turnout != null ? `; turnout ${pct1(r.turnout * 100)}` : ''}.`,
    '',
  ]
  const ridings = r.contests.filter((c) => c.kind === 'district')
  if ((r.groups || []).some((g) => g.total)) {
    lines.push(
      `Tabulators reported: ${r.groups
        .filter((g) => g.total)
        .map((g) => `${g.name} ${fmt(g.closed)} of ${fmt(g.total)}`)
        .join(', ')}.`,
      '',
    )
  }
  if (!ridings.length) {
    const offices = election.offices
      .map((o) => r.contests.find((c) => c.kind === o.key))
      .filter((c): c is NonNullable<typeof c> => !!c)
    const counts: Record<string, number> = {}
    let seats = 0
    for (const c of offices) {
      for (const ch of c.choices.slice(0, c.voteFor)) {
        const key = ch.party || 'other'
        counts[key] = (counts[key] || 0) + 1
        seats++
      }
    }
    const done = complete(r)
    const order = [...election.parties.map((p) => p.key), 'other'].filter(
      (k) => counts[k],
    )
    if (seats)
      lines.push(
        `Seats across City Hall (${done ? 'elected' : 'if the count stopped now'}, ${seats} in all): ${order.map((k) => `${short(k)} ${counts[k]}`).join(', ')}.`,
        '',
      )
  }
  if (ridings.length && election.ballot === 'district') {
    const total = election.seats || ridings.length
    const seats = ((r.summary && r.summary.parties) || [])
      .filter((x) => x.leading > 0 || x.votes > 0)
      .sort((a, b) => b.leading - a.leading || b.votes - a.votes)
    lines.push(
      `### Seats (${election.majority || Math.floor(total / 2) + 1} of ${total} for a majority)`,
      '',
    )
    for (const x of seats)
      lines.push(
        `- ${x.key === 'other' ? 'Others' : parties[x.key] ? parties[x.key].name : x.key}: ${r.official ? 'won' : 'leading'} ${x.leading}, ${fmt(x.votes)} votes (${pct1(x.pct)})`,
      )
    lines.push('')
    const hands = changingHands(r, election)
    if (hands.flips.length) {
      lines.push(
        `${r.official ? 'Changed' : 'Changing'} hands since last time (${hands.flips.length}${r.official ? '' : ', if the count stopped now'}): ${hands.byPair.map((p) => `${short(p.from)} to ${short(p.to)} ${p.n} (${p.ridings.map((f) => f.label).join(', ')})`).join('; ')}.`,
        '',
      )
    }
    const regions = election.regions.length
      ? election.regions
      : [{ key: '', label: 'All ridings' }]
    for (const reg of regions) {
      const list = ridings.filter((c) => !reg.key || c.region === reg.key)
      if (!list.length) continue
      lines.push(`### ${reg.label}`, '')
      for (const c of list) {
        const lead = c.choices[0]
        const second = c.choices[1]
        const boxes =
          c.boxes && c.boxes.final
            ? `, ${(c.boxes.advance ? c.boxes.advance[0] : 0) + c.boxes.final[0]} of ${(c.boxes.advance ? c.boxes.advance[1] : 0) + c.boxes.final[1]} boxes`
            : ''
        lines.push(
          lead && lead.votes > 0
            ? `- ${c.label}: ${lead.name} (${party(lead)}) ${fmt(lead.votes)} (${pct1(lead.pct)})${second ? `, ${second.name} (${party(second)}) ${fmt(second.votes)} (${pct1(second.pct)})` : ''}${boxes}${leaderOf(c) ? '' : ' (tied)'}`
            : `- ${c.label}: no votes yet${boxes}`,
        )
      }
      lines.push('')
    }
  }
  for (const c of r.contests) {
    if (c.kind === 'district') continue
    if (c.kind === 'question') {
      lines.push(
        `### ${c.label}`,
        '',
        c.choices
          .map((ch) => `${ch.name} ${fmt(ch.votes)} (${pct1(ch.pct)})`)
          .join(' · '),
        '',
      )
      continue
    }
    lines.push(
      `### ${c.label} (${c.voteFor === 1 ? 'vote for 1' : `top ${c.voteFor} elected`})`,
      '',
    )
    c.choices.slice(0, c.voteFor + 3).forEach((ch, i) => {
      if (c.voteFor > 1 && i === c.voteFor) lines.push('- *seat line*')
      lines.push(
        `- ${ch.ballot != null ? `${ch.ballot} ` : ''}${ch.name} (${party(ch)}): ${fmt(ch.votes)} (${pct1(ch.pct)})${ch.winner ? ', elected' : ''}`,
      )
    })
    if (c.choices.length > c.voteFor + 3)
      lines.push(`- …and ${c.choices.length - c.voteFor - 3} more`)
    lines.push('')
  }
  if (earlyVote) lines.push(earlyVoteMarkdown(election, earlyVote, true), '')
  return lines.join('\n').trimEnd() + follow
}

/** A referendum: the questions in ballot order, with wording, context and polls. */
export function referendumMarkdown(
  election: ReferendumElection,
  origin: string,
): string {
  const lines = ['## The questions', '', election.intro, '']
  for (const g of election.groups) {
    const items = election.questions.filter((q) => q.group === g.key)
    if (!items.length) continue
    lines.push(`### ${g.label}`, '')
    if (g.order || g.note)
      lines.push([g.order, g.note].filter(Boolean).join('. '), '')
    for (const q of items) {
      lines.push(`#### Question ${q.n}: ${q.topic}`, '', q.q, '')
      q.options.forEach((o, k) =>
        lines.push(`- Option ${k + 1}: ${o.full || o.t}`),
      )
      lines.push('', q.context, '')
      if (q.polls.length) {
        lines.push(
          `Polls: ${q.polls.map((p) => `${p.by} (${p.date}): ${q.options[0].t} ${p.pct[0]}%${p.pct[1] != null ? `, ${q.options[1].t} ${p.pct[1]}%` : ''}`).join('; ')}.`,
          '',
        )
      }
    }
  }
  lines.push(
    `A marked ballot is a permalink: ${origin}/${election.slug}#/compass/<code>, one character per question in ballot order ("-" unmarked, "0" option 1, "1" option 2).`,
    '',
  )
  if (election.pollNote) lines.push(election.pollNote, '')
  if (election.sources.length)
    lines.push('### Sources', '', links(election.sources))
  return lines.join('\n').trimEnd()
}

export function referendumResultsMarkdown(
  election: ReferendumElection,
  snapshot: Snapshot | null,
): string {
  const results = election.results
  const follow = results.alternatives.length
    ? `\n\nAlso follow:\n\n${links(results.alternatives)}`
    : ''
  const source = results.label
    ? `${results.label}'s results page`
    : 'the official results page'
  const r = snapshot && snapshot.payload
  const first = election.questions[0]
  if (
    !r ||
    !(r.contests || []).some((c) => c.choices.some((ch) => ch.votes > 0))
  ) {
    return `## Results\n\nNo results yet. Ballots are counted by hand after voting closes, Question ${first.n} first; counts come from [${source}](${results.official}).${follow}`
  }
  const unit = results.unit || 'voting locations'
  const lines = [
    `## Results (${r.official ? 'official' : 'unofficial'}, as of ${r.asOf} ${zoneName(election)})`,
    '',
  ]
  if (!r.official && results.unofficialNote)
    lines.push(results.unofficialNote, '')
  const wide = ballotWide(election)
  const head = contestOf(r, first)
  const headSum = head ? head.choices.reduce((n, ch) => n + ch.votes, 0) : 0
  for (const q of election.questions) {
    const c = contestOf(r, q)
    const votes = c ? c.choices.map((ch) => ch.votes) : [0, 0]
    const sum = votes[0] + votes[1]
    lines.push(`### Question ${q.n}: ${q.topic}`, '')
    if (!sum || !c) {
      lines.push('Count not started.', '')
      continue
    }
    const winner = c.choices.find((ch) => ch.winner)
    let where =
      c.polls && c.polls.total
        ? `; ${fmt(c.polls.closed)} of ${fmt(c.polls.total)} ${c.polls.unit || unit} reported${wide ? ' (whole ballot)' : ''}`
        : ''
    if (wide && head !== c && headSum)
      where += `; ${pct1(Math.min(100, (100 * sum) / headSum))} of Question ${first.n}'s votes counted so far`
    lines.push(
      `${q.options.map((o, k) => `${o.t} ${fmt(votes[k])} (${pct1((100 * votes[k]) / sum)})`).join(' · ')}${c.rejected ? `; ${fmt(c.rejected)} rejected` : ''}${where}.${winner ? ` Majority: ${winner.name}.` : ''}`,
      '',
    )
  }
  return lines.join('\n').trimEnd() + follow
}

/** The whole page for one election. */
export function electionMarkdown(
  election: Election,
  snapshot: Snapshot | null,
  origin: string,
  earlyVote: EarlyVote | null = null,
): string {
  const head = [
    `# ${election.title}`,
    '',
    `> ${election.description}`,
    '',
    `- Page: ${origin}/${election.slug}`,
    `- Live results: ${origin}/${election.slug}#/results`,
    `- MCP: POST ${origin}/mcp (tools list_elections, get_election, latest_results, results_series, closest_districts, changing_hands, question_divisions, summary)`,
    '',
    election.eyebrow,
    '',
    election.lede,
  ]
  const body =
    election.ballot === 'referendum'
      ? [
          datesMarkdown(election),
          referendumResultsMarkdown(election, snapshot),
          referendumMarkdown(election, origin),
        ]
      : election.ballot === 'chambers'
        ? [
            datesMarkdown(election),
            chambersResultsMarkdown(election, snapshot, earlyVote),
            chambersMarkdown(election),
          ]
        : [
            datesMarkdown(election),
            resultsMarkdown(election, snapshot, earlyVote),
            compassMarkdown(election, origin),
          ]
  return `${[...head, ...body].filter(Boolean).join('\n\n').trimEnd()}\n`
}

/** What a results-only election covers: its chambers, seats and holdovers. */
export function chambersMarkdown(election: ChambersElection): string {
  const lines = ['## What is being decided', '', election.intro, '']
  for (const c of election.chambers) {
    const up = Object.keys(c.divisions).length
    const held = Object.entries(c.holdovers || {})
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${partyShort(election, k)} ${n}`)
      .join(', ')
    lines.push(
      `- ${c.label}: ${up} of ${c.seats} seats up${c.majority != null ? `, ${c.majority} for a majority` : ''}${held ? ` (not up: ${held})` : ''}.`,
    )
  }
  lines.push(
    '',
    `Parties: ${election.parties.map((p) => `${p.name} (${p.short})`).join(', ')}; everyone else is listed under their own label.`,
  )
  if (election.sources.length)
    lines.push('', '### Background', '', links(election.sources))
  return lines.join('\n')
}

const partyShort = (
  election: { parties: readonly { key: string; short: string }[] },
  key: string,
) => {
  const p = election.parties.filter((x) => x.key === key)[0]
  return key === 'other' || !p ? 'Others' : p.short
}

/** The balance of every chamber and each race by state. */
export function chambersResultsMarkdown(
  election: ChambersElection,
  snapshot: Snapshot | null,
  earlyVote: EarlyVote | null = null,
): string {
  const results = election.results
  const follow = results.alternatives.length
    ? `\n\nAlso follow:\n\n${links(results.alternatives)}`
    : ''
  const source = results.label || 'the results feed'
  // The page waits for the first contests, not the first row: the fetch can
  // store a snapshot before any race reports.
  if (!snapshot || !snapshot.payload.contests.length)
    return `## Results\n\nNo results yet. They appear after the first polls close on voting day, from [${source}](${results.official}).${follow}${earlyVote ? `\n\n${earlyVoteMarkdown(election, earlyVote)}` : ''}`
  const r = snapshot.payload
  const short = (key: string | null) => (key ? partyShort(election, key) : '')
  const lines = [
    `## Results (${r.official ? 'official' : 'unofficial'}, as of ${r.asOf} ${zoneName(election)})`,
    '',
    `${fmt(r.polls.closed)} of ${fmt(r.polls.total)} races called; ${fmt(r.ballots)} votes counted in House races${r.turnout != null ? `; turnout ${pct1(r.turnout * 100)} of registered voters` : ''}. Race calls are ${source}'s.`,
    '',
  ]
  for (const chamber of election.chambers) {
    const b = balanceOf(r, chamber, election)
    lines.push(
      `### ${chamber.label}${b.majority != null ? ` (${b.majority} of ${b.seats} for a majority)` : ` (${b.seats})`}`,
      '',
    )
    for (const row of b.rows) {
      const total = row.called + row.leading + row.holdover
      if (!total && !row.before) continue
      const change =
        row.net == null
          ? ''
          : `; ${row.before} before, net ${row.net > 0 ? '+' : ''}${row.net} counting seats called and not up`
      lines.push(
        `- ${partyShort(election, row.key)}: ${total} (${row.called} called, ${row.leading} leading, ${row.holdover} not up${change})`,
      )
    }
    if (b.vacant) lines.push(`- Vacant before the election: ${b.vacant}`)
    if (b.undecided) lines.push(`- Not yet leading anyone: ${b.undecided}`)
    lines.push('')
  }
  lines.push('### Races by state', '')
  for (const region of election.regions) {
    const races = r.contests.filter((c) => c.region === region.key)
    if (!races.length) continue
    lines.push(`#### ${region.label}`, '')
    for (const c of races) {
      const chamber = election.chambers.filter((x) => x.key === c.kind)[0]
      const called = calledOf(c)
      const top = c.choices
        .slice(0, 3)
        .map(
          (x) =>
            `${x.name}${x.party || x.partyName ? ` (${short(x.party) || x.partyName})` : ''} ${pct1(x.pct)}`,
        )
        .join(', ')
      lines.push(
        `- ${c.label} (${chamber ? chamber.short : c.kind}): ${top || 'no count yet'}; ${pct1(c.reporting || 0)} of the expected vote in${called ? `; called for ${called.name}` : ''}.`,
      )
    }
    lines.push('')
  }
  const house = contestsOf(r, election.chambers[0].key)
  if (!house.length) lines.push('No races reported yet.', '')
  if (earlyVote) lines.push(earlyVoteMarkdown(election, earlyVote, true), '')
  return lines.join('\n').trimEnd() + follow
}

export type IndexEntry = { election: Election; latest: Payload | null }

/** llms.txt: what this site is, every published election, and how agents read it. */
export function llmsText(entries: IndexEntry[], origin: string): string {
  const lines = [
    '# Voting',
    '',
    '> Vote compasses that match your answers to the parties and candidates on your ballot, and live election-night results (some elections carry results alone).',
    '',
    `Pages render in the browser; every election is also a markdown page at ${origin}/<slug>.md (or GET ${origin}/<slug> with Accept: text/markdown). Compass results and marked ballots are permalinks in the page hash (#/compass/<code>); live results are at #/results.`,
    '',
    '## Elections',
    '',
  ]
  if (!entries.length) lines.push('No elections yet.')
  for (const { election, latest } of entries) {
    const status = latest
      ? latest.official
        ? 'official results'
        : complete(latest)
          ? 'count complete'
          : `counting, as of ${latest.asOf}`
      : 'no results yet'
    lines.push(
      `- [${election.title}](${origin}/${election.slug}.md) (${election.ballot}, voting day ${election.votingDay}, ${status}): ${election.description}`,
    )
  }
  lines.push(
    '',
    '## API',
    '',
    `- Elections: ${origin}/api/collections/elections/records (published rows; the election document is the config column)`,
    `- Results: ${origin}/api/collections/results/records?filter=election="<id>"&sort=source_ts (one normalized snapshot per row, newest last; realtime at /api/realtime)`,
    `- MCP (Model Context Protocol, streamable HTTP, JSON-RPC over POST, no auth): ${origin}/mcp`,
    '  - list_elections, get_election(slug, section?), latest_results(slug, contest?|district?|question?), results_series(slug, metric, contest?, since?, limit?), closest_districts(slug, n?), changing_hands(slug), question_divisions(slug, question, n?, sort?), summary(slug)',
    '  - results_series pages: at most limit rows (default 500) oldest first, and next, when present, is the since for the following page',
    "  - the host's edge refuses some default HTTP User-Agents (Python's urllib) with a 403; send any other User-Agent",
    `- Source: https://github.com/patsissons/voting`,
    '',
  )
  return lines.join('\n')
}

/**
 * Early vote turnout by division: ballots cast, not votes. By state for the
 * UF Election Lab feed, by riding for Elections BC's advance voting table.
 * `done` once the results are in, so the copy stops saying "so far".
 */
export function earlyVoteMarkdown(
  election: Election,
  ev: EarlyVote,
  done = false,
): string {
  const page = election.results.earlyVote
  const from = page ? ` from [${page.page.label}](${page.page.url})` : ''
  if (earlyVoteFormat(election) === 'ebc-advance')
    return advanceVoteMarkdown(election, ev, from)
  const t = ev.total
  const split =
    t.inPerson != null && t.mail != null
      ? ` (${fmt(t.inPerson)} in person, ${fmt(t.mail)} by mail)`
      : ''
  const parties = 'parties' in election ? election.parties : []
  const order = parties.map((p) => p.key)
  const nameOf = (k: string) =>
    k === 'other' ? 'other' : partyShort({ parties }, k)
  const rows = turnoutByState(ev, earlyVoteDivisions(election))
  const totals = partyTotals(rows)
  const lines = [
    done ? '### Early vote' : '### Early vote so far',
    '',
    `Ballots cast before voting day as of ${wallClock(ev.asOf)} UTC${from}: ${fmt(t.voted)}${split}. This is who ${done ? 'had' : 'has'} voted, not how: no state releases vote counts before its polls close.`,
    '',
  ]
  if (totals.states) {
    const counts = (party: Record<string, number>) =>
      partySplit(party, order)
        .map((s) => `${nameOf(s.key)} ${fmt(s.n)} (${pct1(s.share * 100)})`)
        .join(', ')
    const m = partyMargin(totals.party, order)
    const lead =
      m == null
        ? ''
        : m === 0
          ? '; even'
          : `; ${nameOf(order[m > 0 ? 0 : 1])} ${signed(Math.abs(m) * 100)} pts`
    const halves = [
      totals.mail ? `By mail: ${counts(totals.mail)}` : '',
      totals.inPerson ? `In person: ${counts(totals.inPerson)}` : '',
    ].filter(Boolean)
    lines.push(
      `Party registration of early voters across the ${totals.states} states that register by party (${pct1((totals.voted / t.voted) * 100)} of ballots cast): ${counts(totals.party)}${lead}.${halves.length ? ` ${halves.join('. ')}, in the states that report the split.` : ''}`,
      '',
    )
  }
  lines.push(
    `| State | Ballots cast | Share of 2022 turnout | Registration (${[...order, 'other'].map(nameOf).join(' / ')}) |`,
    '| --- | ---: | ---: | --- |',
  )
  for (const r of rows) {
    const party = r.party
      ? partySplit(r.party, order)
          .map((s) => pct1(s.share * 100))
          .join(' / ')
      : ''
    lines.push(
      `| ${r.label} | ${fmt(r.voted)} | ${r.share != null ? pct1(r.share * 100) : ''} | ${party} |`,
    )
  }
  return lines.join('\n')
}

/** A change from the baseline as "-11.0%" / "+2.3%", or '' without one. */
const change = (x: { voted: number; prior?: number }): string => {
  const c = changeFromPrior(x)
  return c == null ? '' : `${signed(c * 100)}%`
}

/** Elections BC's advance voting turnout: the province by day, then every riding. */
function advanceVoteMarkdown(
  election: Election,
  ev: EarlyVote,
  from: string,
): string {
  const t = ev.total
  const days = daySeries(t.days, t.priorDays)
  const span = days.length
    ? ` ${dayShort(days[0].day)} to ${dayShort(days[days.length - 1].day)}`
    : ''
  const registered = shareOfRegistered(t)
  const priorYear = t.priorDays
    ? Object.keys(t.priorDays)[0].slice(0, 4)
    : 'last time'
  const parts = [`${fmt(t.voted)}`]
  if (registered != null)
    parts.push(
      `${pct1(registered * 100)} of ${fmt(t.registered)} registered voters`,
    )
  if (t.prior) parts.push(`${change(t)} from ${priorYear} (${fmt(t.prior)})`)
  const lines = [
    '### Advance voting',
    '',
    `Advance ballots cast${span} (as of ${wallClock(ev.asOf)} UTC${from}): ${parts.join(', ')}. Voters are counted in the riding where they voted, not where they live; the figures are preliminary.`,
    '',
  ]
  if (days.length)
    lines.push(
      `By day: ${days
        .map(
          (d, i) =>
            `${dayShort(d.day)} ${fmt(d.n)}${d.prior != null ? ` (${priorYear} day ${i + 1}: ${fmt(d.prior)})` : ''}`,
        )
        .join('; ')}.`,
      '',
    )
  lines.push(
    `| Riding | Advance ballots | Of registered | vs ${priorYear} |`,
    '| --- | ---: | ---: | ---: |',
  )
  for (const r of turnoutByState(ev, earlyVoteDivisions(election))) {
    const share = shareOfRegistered(r)
    lines.push(
      `| ${r.label} | ${fmt(r.voted)} | ${share != null ? pct1(share * 100) : ''} | ${change(r)} |`,
    )
  }
  return lines.join('\n')
}
