// The voting tools: every one is read-only, filters to published elections
// itself (hooks bypass collection rules) and wraps a shared/stats function,
// so an agent's numbers match the page's.
import { asEarlyVote } from '../../shared/early-vote.ts'
import type { EarlyVote } from '../../shared/early-vote.ts'
import { fmt } from '../../shared/format.ts'
import type { Payload, Snapshot } from '../../shared/payload.ts'
import type { Election } from '../../shared/schema/election.ts'
import {
  changingHands,
  closest,
  complete,
  ridingsLed,
  ridingsOf,
} from '../../shared/stats/results.ts'
import {
  contestOf,
  divisionRows,
  tally,
  type DivisionSort,
} from '../../shared/stats/referendum.ts'
import { partyTotals, turnoutByState } from '../../shared/stats/early-vote.ts'
import { electionOf, snapshotOf } from '../db.ts'
import type { Db } from '../db.ts'
import { electionMarkdown } from '../markdown.ts'
import { InvalidParams } from './rpc.ts'
import type { Tool, ToolModule } from './rpc.ts'

export type ToolContext = { db: Db; origin: string }

const slugArg = {
  type: 'string',
  pattern: '^[a-z0-9][a-z0-9-]*$',
  description:
    'The election slug, as in its page URL (list_elections lists them).',
}
const readOnly = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
}

export const tools: Tool[] = [
  {
    name: 'list_elections',
    title: 'List elections',
    description:
      'Every published election with its slug, ballot mode, voting day and whether results are in.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: 'get_election',
    title: 'Get an election',
    description:
      'The election document (parties, offices or ridings, compass questions or referendum questions, dates, sources), plus earlyVoteTurnout (ballots cast so far by state and, as partyTotals, by party registration summed over the states that report it, before voting day) when the election has it. Pass section to get one top-level section, e.g. "questions", "parties", "districts", "dates", "results", "earlyVoteTurnout".',
    inputSchema: {
      type: 'object',
      properties: { slug: slugArg, section: { type: 'string', maxLength: 40 } },
      required: ['slug'],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: 'latest_results',
    title: 'Latest results',
    description:
      'The newest results snapshot: as-of stamp, polls reported, ballots, and every contest with its choices. Narrow with contest (an office kind such as "mayor", or a contest id), district (a riding code or name) or question (a referendum question number).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: slugArg,
        contest: { type: 'string', maxLength: 60 },
        district: { type: 'string', maxLength: 60 },
        question: { type: 'integer', minimum: 1 },
      },
      required: ['slug'],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: 'results_series',
    title: 'Results over time',
    description:
      'One row per stored snapshot: as-of stamp, polls reported and the metric. metric "ballots" (ballots counted), "polls" (polls reported), "seats" (ridings led per party in a riding election; in a chambers election pass chamber, a chamber key, for seats led and called per party), "share" (vote share per choice of a contest: pass contest, an office kind, a riding code, a chamber race id, or "q<n>" for a referendum question), "votes" (votes per choice of a contest). since narrows to stamps after an as-of value.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: slugArg,
        metric: {
          type: 'string',
          enum: ['ballots', 'polls', 'seats', 'share', 'votes'],
        },
        contest: { type: 'string', maxLength: 60 },
        chamber: { type: 'string', maxLength: 20 },
        since: { type: 'string', maxLength: 40 },
      },
      required: ['slug', 'metric'],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: 'closest_districts',
    title: 'Closest ridings',
    description:
      'The tightest ridings in a riding election by the leader’s margin in points over second place.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: slugArg,
        n: { type: 'integer', minimum: 1, maximum: 93 },
      },
      required: ['slug'],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: 'changing_hands',
    title: 'Ridings changing hands',
    description:
      'Ridings whose leader is not the party that won them last time, grouped by from -> to.',
    inputSchema: {
      type: 'object',
      properties: { slug: slugArg },
      required: ['slug'],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: 'question_divisions',
    title: 'Referendum divisions',
    description:
      'One referendum question’s count in every electoral division (only the newest snapshot keeps them). sort: name, share (option 1 share), votes, polls.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: slugArg,
        question: { type: 'integer', minimum: 1 },
        n: { type: 'integer', minimum: 1, maximum: 200 },
        sort: { type: 'string', enum: ['name', 'share', 'votes', 'polls'] },
      },
      required: ['slug', 'question'],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: 'summary',
    title: 'Election summary',
    description:
      'The election’s markdown page: dates, the latest results and the compass or ballot questions, as text.',
    inputSchema: {
      type: 'object',
      properties: { slug: slugArg },
      required: ['slug'],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
]

type Loaded = { id: string; election: Election; earlyVote: EarlyVote | null }

function load(db: Db, slug: unknown): Loaded {
  const row = db.publishedElection(String(slug))
  if (!row) throw new InvalidParams(`no published election "${String(slug)}"`)
  return {
    id: row.id,
    election: electionOf(row),
    earlyVote: asEarlyVote(row.getString('early_vote')),
  }
}

const latestOf = (db: Db, id: string): Snapshot | null => {
  const row = db.latestResult(id)
  return row ? snapshotOf(row) : null
}

const status = (latest: Payload | null) =>
  !latest
    ? 'no results yet'
    : latest.official
      ? 'official'
      : complete(latest)
        ? 'count complete'
        : 'counting'

function findContest(
  payload: Payload,
  election: Election,
  args: { contest?: unknown; district?: unknown; question?: unknown },
) {
  if (args.question != null)
    return payload.contests.find((c) => c.id === `q${args.question}`) || null
  const key =
    args.district != null
      ? String(args.district)
      : args.contest != null
        ? String(args.contest)
        : ''
  if (!key) return null
  const lower = key.toLowerCase()
  const byKind = payload.contests.find(
    (c) => c.kind === lower || c.id.toLowerCase() === lower,
  )
  if (byKind) return byKind
  if (election.ballot === 'district') {
    const d = election.districts.find(
      (x) => x.code.toLowerCase() === lower || x.name.toLowerCase() === lower,
    )
    if (d) return payload.contests.find((c) => c.id === d.code) || null
  }
  return (
    payload.contests.find(
      (c) => c.label.toLowerCase() === lower || c.name.toLowerCase() === lower,
    ) || null
  )
}

export function call(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): unknown {
  const { db } = ctx
  switch (name) {
    case 'list_elections':
      return {
        elections: db.publishedElections().map((row) => {
          const e = electionOf(row)
          const latest = latestOf(db, row.id)
          return {
            slug: e.slug,
            title: e.title,
            ballot: e.ballot,
            place: e.place,
            votingDay: e.votingDay,
            description: e.description,
            page: `${ctx.origin}/${e.slug}`,
            markdown: `${ctx.origin}/${e.slug}.md`,
            results: {
              status: status(latest ? latest.payload : null),
              asOf: latest ? latest.source_ts : null,
            },
          }
        }),
      }
    case 'get_election': {
      const { election, earlyVote } = load(db, args.slug)
      const doc: Record<string, unknown> = earlyVote
        ? {
            ...election,
            earlyVoteTurnout: {
              ...earlyVote,
              partyTotals: partyTotals(
                turnoutByState(
                  earlyVote,
                  'regions' in election ? election.regions : [],
                ),
              ),
            },
          }
        : { ...election }
      if (args.section == null) return doc
      const section = doc[String(args.section)]
      if (section === undefined)
        throw new InvalidParams(
          `no section "${String(args.section)}"; one of ${Object.keys(doc).join(', ')}`,
        )
      return { slug: election.slug, section: args.section, value: section }
    }
    case 'latest_results': {
      const { id, election } = load(db, args.slug)
      const latest = latestOf(db, id)
      if (!latest) return { slug: election.slug, status: 'no results yet' }
      const p = latest.payload
      const head = {
        slug: election.slug,
        status: status(p),
        asOf: p.asOf,
        official: p.official,
        polls: p.polls,
        ballots: p.ballots,
        turnout: p.turnout,
        unit: election.results.unit || null,
      }
      if (
        args.contest != null ||
        args.district != null ||
        args.question != null
      ) {
        const contest = findContest(p, election, args)
        if (!contest)
          throw new InvalidParams(
            `no contest matching ${JSON.stringify(args.contest ?? args.district ?? args.question)} in ${election.slug}`,
          )
        return { ...head, contest }
      }
      return {
        ...head,
        summary: p.summary || null,
        contests: p.contests.map((c) => ({
          ...c,
          eds:
            c.eds && c.eds.length
              ? `${c.eds.length} divisions (use question_divisions)`
              : undefined,
        })),
      }
    }
    case 'results_series': {
      const { id, election } = load(db, args.slug)
      const metric = String(args.metric)
      const since = args.since != null ? String(args.since) : ''
      const rows = db.resultsFor(id, since || undefined).map(snapshotOf)
      const base = (s: Snapshot) => ({
        asOf: s.source_ts,
        polls: s.payload.polls,
      })
      if (metric === 'ballots')
        return {
          slug: election.slug,
          metric,
          rows: rows.map((s) => ({ ...base(s), ballots: s.payload.ballots })),
        }
      if (metric === 'polls')
        return {
          slug: election.slug,
          metric,
          rows: rows.map((s) => ({
            ...base(s),
            closed: s.payload.polls.closed,
            total: s.payload.polls.total,
          })),
        }
      if (metric === 'seats' && election.ballot === 'chambers') {
        const chamber = args.chamber != null ? String(args.chamber) : ''
        if (!election.chambers.some((c) => c.key === chamber))
          throw new InvalidParams(
            `seats needs chamber: one of ${election.chambers.map((c) => c.key).join(', ')}`,
          )
        return {
          slug: election.slug,
          metric,
          chamber,
          rows: rows.map((s) => {
            const tally = s.payload.chambers && s.payload.chambers[chamber]
            const led: Record<string, number> = {}
            const called: Record<string, number> = {}
            for (const p of (tally && tally.parties) || []) {
              led[p.key] = p.leading
              called[p.key] = p.called || 0
            }
            return {
              ...base(s),
              reporting: tally ? tally.reporting : 0,
              led,
              called,
            }
          }),
        }
      }
      if (metric === 'seats') {
        if (election.ballot !== 'district')
          throw new InvalidParams('seats is for a riding election')
        return {
          slug: election.slug,
          metric,
          rows: rows.map((s) => ({
            ...base(s),
            led: Object.fromEntries(ridingsLed(ridingsOf(s.payload), election)),
          })),
        }
      }
      if (args.contest == null)
        throw new InvalidParams(`metric "${metric}" needs contest`)
      const key = String(args.contest)
      const pick = (p: Payload) => findContest(p, election, { contest: key })
      const last = rows.length ? pick(rows[rows.length - 1].payload) : null
      if (!last)
        throw new InvalidParams(
          `no contest matching "${key}" in ${election.slug}`,
        )
      return {
        slug: election.slug,
        metric,
        contest: { id: last.id, label: last.label, kind: last.kind },
        choices: last.choices.map((c) => c.name),
        rows: rows.map((s) => {
          const c = pick(s.payload)
          const values: Record<string, number> = {}
          for (const ch of c ? c.choices : [])
            values[ch.name] = metric === 'share' ? ch.pct : ch.votes
          return { ...base(s), ballots: c ? c.ballots : 0, values }
        }),
      }
    }
    case 'closest_districts': {
      const { id, election } = load(db, args.slug)
      if (election.ballot !== 'district')
        throw new InvalidParams('closest_districts is for a riding election')
      const latest = latestOf(db, id)
      if (!latest)
        return { slug: election.slug, status: 'no results yet', ridings: [] }
      const n = args.n != null ? Number(args.n) : 8
      return {
        slug: election.slug,
        asOf: latest.source_ts,
        ridings: closest(latest.payload, n).map((c) => ({
          id: c.id,
          riding: c.label,
          margin_pts: Math.round(c.margin * 100) / 100,
          margin_votes: c.votes,
          leader: {
            name: c.lead.name,
            party: c.lead.party,
            votes: c.lead.votes,
            pct: c.lead.pct,
          },
          second: {
            name: c.next.name,
            party: c.next.party,
            votes: c.next.votes,
            pct: c.next.pct,
          },
        })),
      }
    }
    case 'changing_hands': {
      const { id, election } = load(db, args.slug)
      if (election.ballot !== 'district')
        throw new InvalidParams('changing_hands is for a riding election')
      const latest = latestOf(db, id)
      if (!latest)
        return { slug: election.slug, status: 'no results yet', flips: [] }
      const hands = changingHands(latest.payload, election)
      return {
        slug: election.slug,
        asOf: latest.source_ts,
        official: latest.payload.official,
        count: hands.flips.length,
        pairs: hands.byPair.map((p) => ({
          from: p.from,
          to: p.to,
          n: p.n,
          ridings: p.ridings.map((f) => ({
            id: f.id,
            riding: f.label,
            leader: f.lead,
            margin_pts: Math.round(f.margin * 100) / 100,
          })),
        })),
      }
    }
    case 'question_divisions': {
      const { id, election } = load(db, args.slug)
      if (election.ballot !== 'referendum')
        throw new InvalidParams('question_divisions is for a referendum')
      const q = election.questions.find((x) => x.n === Number(args.question))
      if (!q) throw new InvalidParams(`no question ${String(args.question)}`)
      const latest = latestOf(db, id)
      const contest = latest ? contestOf(latest.payload, q) : null
      if (!contest)
        return {
          slug: election.slug,
          question: q.n,
          status: 'no results yet',
          divisions: [],
        }
      const t = tally(contest)
      const rows = divisionRows(
        contest,
        (args.sort as DivisionSort) || 'name',
      ).slice(0, args.n != null ? Number(args.n) : 200)
      return {
        slug: election.slug,
        question: q.n,
        topic: q.topic,
        options: q.options.map((o) => o.t),
        asOf: latest!.source_ts,
        province: { votes: t.votes, shares: t.shares, polls: contest.polls },
        divisions: rows.map((d) => ({
          code: d.code,
          name: d.name,
          votes: d.votes,
          share_option1: d.share,
          polls: d.polls,
          polls_reported_pct: d.reported,
        })),
        note: rows.length
          ? `${fmt(rows.length)} of ${fmt((contest.eds || []).length)} divisions`
          : 'this snapshot carries no per-division rows',
      }
    }
    case 'summary': {
      const { id, election, earlyVote } = load(db, args.slug)
      return electionMarkdown(election, latestOf(db, id), ctx.origin, earlyVote)
    }
    default:
      throw new InvalidParams(`unknown tool "${name}"`)
  }
}

export const votingTools: ToolModule<ToolContext> = { tools, call }
