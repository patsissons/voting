// The JSON behind Elections Alberta's results dashboard (eab-dash; the 2026
// referendum went out on results.elections.ab.ca/8400): the page polls
// /data/8400?version=3.0.0&questions=<ids>&wards=<codes>, which answers
// { success, forceFullRefresh, lastUpdated (ISO, UTC), referendumResults: {
// widgets: { summary: { valid, pollsReporting, totalPolls }, ... }, wards:
// [{ ward "01", pollsReporting, totalPolls }], votes: { questionStats: [{
// questionID, yesVotes, noVotes, wardStats: [{ ward, yesVotes, noVotes }] }]
// } } }. Asking for every question id returns every division's counts.
// Question 10 is questionID 11 (results.questionIds maps them), and its
// yesVotes is Option 1 (remain). Polls reported are one count for the whole
// ballot, so every question carries the same "polls"; a division's name
// comes from results.divisions. Rejected ballots are not published there. A
// new dashboard version retires the old feed URL (stale_version); dashSource
// reads the current version off the dashboard page (results.official).
import type { Contest, ContestPolls, Payload } from '../payload.ts'
import type { ReferendumElection } from '../schema/election.ts'
import {
  FeedError,
  bodyText,
  fingerprint,
  questionContest,
  wallStamp,
} from './common.ts'

type Ward = { ward: unknown; pollsReporting?: unknown; totalPolls?: unknown }
type WardStat = { ward: unknown; yesVotes?: unknown; noVotes?: unknown }
type QuestionStat = {
  questionID: unknown
  yesVotes?: unknown
  noVotes?: unknown
  wardStats?: WardStat[]
}
type DashDoc = {
  success?: boolean
  forceFullRefresh?: boolean
  lastUpdated?: string
  fetchedAt?: string
  referendumResults?: {
    widgets?: { summary?: { pollsReporting?: unknown; totalPolls?: unknown } }
    wards?: Ward[]
    votes?: { questionStats?: QuestionStat[] }
  }
}

/**
 * The dashboard feed is asked for by version ("?version=3.0.0"); when
 * Elections Alberta ships a new dashboard, the old version answers only
 * { forceFullRefresh: true }. The dashboard page names the current one
 * ("version: '3.1.0'"): the feed URL with it, or '' when the page names none
 * or the URL already has it.
 */
export function dashSource(source: string, pageHtml: unknown): string {
  const m = /\bversion:\s*['"]([\w.-]+)['"]/.exec(String(pageHtml || ''))
  if (!m || !/[?&]version=/.test(source)) return ''
  const next = source.replace(/([?&]version=)[^&]*/, `$1${m[1]}`)
  return next === source ? '' : next
}

export function normalizeEabDash(
  raw: unknown,
  election: ReferendumElection,
): Payload {
  let doc = raw as DashDoc
  if (typeof raw === 'string') {
    const text = bodyText(raw)
    if (!text) throw new FeedError('empty_feed', 'the body is empty')
    try {
      doc = JSON.parse(text)
    } catch (err) {
      throw new FeedError(
        'bad_feed',
        `the body is not JSON: ${String((err as Error).message || err).slice(0, 200)}`,
      )
    }
  }
  const data = doc && doc.referendumResults
  if (doc && doc.forceFullRefresh && !data)
    throw new FeedError(
      'stale_version',
      'the feed asks for a full refresh: the dashboard version changed',
    )
  if (!doc || doc.success === false || !data || !data.votes)
    throw new FeedError('bad_feed', 'the body has no referendumResults')

  const results =
    election.results.format === 'eab-dash' ? election.results : null
  const ids: Record<string, number> = (results && results.questionIds) || {}
  const names: Record<string, string> = (results && results.divisions) || {}
  const count = (v: unknown) =>
    v == null || !Number.isFinite(Number(v)) ? 0 : Number(v)
  const stats = new Map<number, QuestionStat>(
    (data.votes.questionStats || []).map((s) => [Number(s.questionID), s]),
  )
  const wards = new Map<string, Ward>(
    (data.wards || []).map((w) => [String(w.ward), w]),
  )
  const summary = (data.widgets && data.widgets.summary) || {}
  const total = count(summary.totalPolls)
  const polls: ContestPolls = {
    closed: Math.min(count(summary.pollsReporting), total || Infinity),
    total,
    unit: '',
  }

  const contests: Contest[] = []
  for (const q of election.questions || []) {
    const s = stats.get(Number(ids[q.n] != null ? ids[q.n] : q.n))
    const votes: [number, number] = s
      ? [count(s.yesVotes), count(s.noVotes)]
      : [0, 0]
    contests.push(
      questionContest(
        q,
        votes,
        contests.length,
        { polls, locations: total ? [polls.closed, total] : null },
        ((s && s.wardStats) || []).map((w) => {
          const code = String(w.ward)
          const ward = wards.get(code)
          return {
            code,
            name: names[code] || code,
            votes: [count(w.yesVotes), count(w.noVotes)] as [number, number],
            rejected: 0,
            polls:
              ward && ward.totalPolls
                ? ([count(ward.pollsReporting), count(ward.totalPolls)] as [
                    number,
                    number,
                  ])
                : null,
          }
        }),
      ),
    )
  }
  if (!contests.some((c) => c.posted))
    throw new FeedError('not_reporting', 'no referendum votes counted yet')

  const head = contests[0]
  const sig = fingerprint(
    JSON.stringify(
      contests.map((c) => [
        c.choices.map((x) => x.votes),
        c.polls,
        (c.eds || []).map((d) =>
          (d.votes as (number | null)[]).concat(d.polls || []),
        ),
      ]),
    ),
  )
  return {
    asOf: wallStamp(
      doc.lastUpdated || doc.fetchedAt || Date.now(),
      election.pollsClose,
    ),
    project: election.title || '',
    format: 'eab-dash',
    official: false,
    ballots: head.ballots,
    eligible: 0,
    turnout: null,
    polls: { closed: polls.closed, total: polls.total },
    tabulators: { closed: 0, total: 0 },
    groups: [],
    sig,
    contests,
  }
}
