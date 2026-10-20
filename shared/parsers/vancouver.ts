// The City of Vancouver's arearesults.json (confirmed on the 2022 general
// election and the 2025 by-election): statistics.{projectName, official,
// timeStamp, eligibleVoters, globBallotCast, globPolls, globClosedPolls,
// globTabulators, globClosedTabulators, countinggroups[]}, and
// areaResults[0]["1"].contestResults[] of {id, contestName, voteFor,
// ballotCast, sort, choiceResults[] of {choiceName "52 POPAT, Imtiaz", votes,
// percentage "0.24%", isIncumbent, isWinner, partyBreakdown[].partyName}}.
// The file starts with a UTF-8 BOM. Candidates are attributed to compass
// parties by ballot number (the election document lists every party
// candidate's number), so the feed's own party labels are only a fallback.
import type { Contest, Payload } from '../payload.ts'
import type { AtLargeElection } from '../schema/election.ts'
import {
  FeedError,
  kindOrder,
  num,
  parseChoiceName,
  parseJson,
} from './common.ts'

type Feed = {
  statistics?: Record<string, unknown> & {
    countinggroups?: Record<string, unknown>[]
  }
  areaResults?: Record<string, { contestResults?: RawContest[] }>[]
}

type RawChoice = {
  choiceName?: string
  votes?: unknown
  percentage?: unknown
  isIncumbent?: unknown
  isWinner?: unknown
  partyBreakdown?: { partyName?: string; votes?: unknown }[]
}

type RawContest = {
  id: unknown
  contestName?: string
  voteFor?: unknown
  ballotCast?: unknown
  isAcclaimed?: unknown
  sort?: unknown
  choiceResults?: RawChoice[]
}

// The city-wide area: areaResults is a list of { "<areaId>": {statistics,
// contestResults} }; the all-locations feed carries one entry.
function cityArea(feed: Feed): { contestResults: RawContest[] } {
  for (const entry of feed.areaResults || []) {
    for (const key of Object.keys(entry || {})) {
      const area = entry[key]
      if (area && Array.isArray(area.contestResults))
        return area as { contestResults: RawContest[] }
    }
  }
  throw new FeedError('bad_feed', 'the feed has no contest results')
}

/** Ballot-number index over the election's party slates. */
function ballotIndex(
  election: AtLargeElection,
): Record<number, { party: string; name: string }> {
  const index: Record<number, { party: string; name: string }> = {}
  for (const party of election.parties || []) {
    const add = (
      row: readonly [number, string, ...unknown[]] | null | undefined,
    ) => {
      if (row) index[row[0]] = { party: party.key, name: row[1] }
    }
    add(party.mayor)
    for (const office of ['council', 'park', 'school'] as const)
      for (const row of party[office] || []) add(row)
  }
  return index
}

function contestKind(
  election: AtLargeElection,
  name: string,
): { kind: string; label: string } {
  for (const rule of (election.results && election.results.contests) || []) {
    if (new RegExp(rule.match, 'i').test(name))
      return { kind: rule.kind, label: rule.label }
  }
  // Borrowing questions and plebiscites: "1. CAPITAL BORROWING: ..." keeps
  // its own wording, sentence-cased.
  const clean = String(name).trim()
  const label =
    clean === clean.toUpperCase()
      ? clean.toLowerCase().replace(/[a-z]/, (ch) => ch.toUpperCase())
      : clean
  return { kind: 'question', label }
}

export function normalizeVancouver(
  raw: unknown,
  election: AtLargeElection,
): Payload {
  const feed = parseJson(raw) as Feed
  const stats = feed.statistics
  if (!stats || typeof stats !== 'object')
    throw new FeedError('bad_feed', 'the feed has no statistics block')

  const project = String(stats.projectName || '')
  const match = election.results && election.results.projectMatch
  if (match && !new RegExp(match, 'i').test(project)) {
    throw new FeedError(
      'project_mismatch',
      `feed is "${project}", expected one matching /${match}/`,
    )
  }

  const asOf = String(stats.timeStamp || '').trim()
  if (!asOf)
    throw new FeedError('bad_feed', 'the feed has no statistics.timeStamp')

  const area = cityArea(feed)
  const index = ballotIndex(election)
  const ballots = num(stats.globBallotCast)
  const eligible = num(stats.eligibleVoters)
  // The City sets isWinner on whoever leads, from the first poll in (2026:
  // every seat "won" at 41 of 149), so a winner only counts once every
  // voting place and tabulator has reported.
  const complete =
    num(stats.globPolls) > 0 &&
    num(stats.globClosedPolls) >= num(stats.globPolls) &&
    num(stats.globClosedTabulators) >= num(stats.globTabulators)

  const contests: Contest[] = area.contestResults.map((c) => {
    const { kind, label } = contestKind(election, String(c.contestName || ''))
    const choices = (c.choiceResults || []).map((ch) => {
      const parsed = parseChoiceName(ch.choiceName)
      const known = parsed.ballot != null ? index[parsed.ballot] : null
      const all = ch.partyBreakdown || []
      const breakdown = all.filter((b) => num(b.votes) > 0 || all.length === 1)
      return {
        ballot: parsed.ballot,
        name: known ? known.name : parsed.name,
        votes: num(ch.votes),
        pct: num(ch.percentage),
        party: known ? known.party : null,
        partyName: breakdown.length
          ? String(breakdown[0].partyName || '').trim()
          : '',
        incumbent: !!num(ch.isIncumbent),
        winner: complete && !!num(ch.isWinner),
      }
    })
    choices.sort(
      (a, b) => b.votes - a.votes || (a.ballot || 0) - (b.ballot || 0),
    )
    return {
      id: String(c.id),
      name: String(c.contestName || '').trim(),
      label,
      kind,
      voteFor: num(c.voteFor) || 1,
      ballots: num(c.ballotCast),
      acclaimed: !!num(c.isAcclaimed),
      sort: num(c.sort),
      choices,
    }
  })
  const order = kindOrder(election.offices)
  contests.sort(
    (a, b) =>
      order(a.kind) - order(b.kind) || a.sort - b.sort || num(a.id) - num(b.id),
  )

  return {
    asOf,
    project,
    // "official" is a code, not a flag ("22" in 2022, "25" in 2025); the
    // city stamps official results on its own page, so this stays unofficial
    // until someone says otherwise.
    official: false,
    ballots,
    eligible,
    turnout: eligible > 0 ? ballots / eligible : null,
    polls: { closed: num(stats.globClosedPolls), total: num(stats.globPolls) },
    tabulators: {
      closed: num(stats.globClosedTabulators),
      total: num(stats.globTabulators),
    },
    groups: (stats.countinggroups || []).map((g) => ({
      name: String(g.countingGroupName || ''),
      closed: num(g.closedTabulators),
      total: num(g.tabulators),
    })),
    contests,
  }
}
