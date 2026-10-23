// civicAPI's aggregate race documents (civicapi; https://civicapi.org): one
// JSON document per chamber from GET /api/v2/race/<id>, answering
// { election_name, election_type, election_date, registered_voters,
// percent_reporting, last_updated (ISO, UTC), test_data, candidates: [the
// parties with seats and votes], region_results: { <key>: { name, type,
// percent_reporting, candidates: [{ name, party, votes, percent, winner,
// incumbent, ... }] } } }. The fetch (and the relay) wrap the chambers'
// documents as { fetchedAt, races: { <chamberKey>: <document or its JSON
// text> } }; the election's chambers[].divisions name the region keys
// (House "ca-12", Senate and Governors "ak") and their short labels.
//
// Every region becomes one contest of kind <chamberKey>. Ids are the House
// keys as they are and "<state>-<first three letters of the chamber key>"
// elsewhere ("ak-sen", "ak-gov"), so a state's Senate and Governor races
// never share an id. The feed's winner flag is civicAPI's own race call and
// flows straight into Choice.winner; markOfficial leaves these kinds alone.
import type {
  ChamberTally,
  Choice,
  Contest,
  PartyTally,
  Payload,
} from '../payload.ts'
import type { Chamber, ChambersElection } from '../schema/election.ts'
import { FeedError, fingerprint, num, parseJson, wallStamp } from './common.ts'

type FeedCandidate = {
  name?: unknown
  party?: unknown
  votes?: unknown
  percent?: unknown
  winner?: unknown
  incumbent?: unknown
}
type FeedRegion = {
  name?: unknown
  percent_reporting?: unknown
  candidates?: FeedCandidate[]
}
type RaceDoc = {
  election_name?: unknown
  registered_voters?: unknown
  percent_reporting?: unknown
  last_updated?: unknown
  test_data?: unknown
  region_results?: Record<string, FeedRegion>
}
type Wrapper = { fetchedAt?: unknown; races?: Record<string, unknown> }

/** The contest id for a division: the House key itself, a chamber suffix elsewhere. */
export function contestId(chamber: Chamber, code: string): string {
  return chamber.key === 'house' ? code : `${code}-${chamber.key.slice(0, 3)}`
}

function raceOf(wrapper: Wrapper, chamber: Chamber): RaceDoc {
  const raw = wrapper.races ? wrapper.races[chamber.key] : undefined
  if (raw == null)
    throw new FeedError('bad_feed', `no race document for ${chamber.key}`)
  const doc = parseJson(raw, `the ${chamber.key} race`) as RaceDoc
  if (!doc || typeof doc !== 'object' || !doc.region_results)
    throw new FeedError(
      'bad_feed',
      `the ${chamber.key} race has no region_results`,
    )
  if (doc.test_data === true)
    throw new FeedError(
      'not_reporting',
      `the ${chamber.key} race carries test data`,
    )
  return doc
}

export function normalizeCivicapi(
  raw: unknown,
  election: ChambersElection,
): Payload {
  const wrapper = parseJson(raw) as Wrapper
  if (!wrapper || typeof wrapper !== 'object' || !wrapper.races)
    throw new FeedError('bad_feed', 'the body has no races')
  const affiliations: Record<string, string> = election.affiliations || {}
  const partyKeys = election.parties.map((p) => p.key)

  const contests: Contest[] = []
  const chambers: Record<string, ChamberTally> = {}
  let latest = 0
  let houseVotes = 0
  let eligible = 0
  let called = 0
  for (const chamber of election.chambers) {
    const doc = raceOf(wrapper, chamber)
    const regions = doc.region_results || {}
    const updated = Date.parse(String(doc.last_updated || ''))
    if (Number.isFinite(updated)) latest = Math.max(latest, updated)
    const codes = Object.keys(chamber.divisions)
    if (!codes.some((code) => regions[code]))
      throw new FeedError(
        'bad_feed',
        `the ${chamber.key} race reports none of the election's divisions`,
      )
    const tally = new Map<string, PartyTally>()
    const bucket = (key: string) => {
      let t = tally.get(key)
      if (!t) {
        t = { key, leading: 0, votes: 0, pct: 0, called: 0 }
        tally.set(key, t)
      }
      return t
    }
    for (const key of partyKeys) bucket(key)
    let chamberVotes = 0
    let chamberCalled = 0
    for (const code of codes) {
      const region = regions[code] || {}
      const choices: Choice[] = []
      for (const c of region.candidates || []) {
        const label = String(c.party || '').trim()
        choices.push({
          ballot: null,
          name: String(c.name || '').trim(),
          votes: num(c.votes),
          pct: num(c.percent),
          party: affiliations[label] || null,
          partyName: label,
          incumbent: c.incumbent === true,
          winner: c.winner === true,
        })
      }
      choices.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
      const ballots = choices.reduce((n, c) => n + c.votes, 0)
      chamberVotes += ballots
      for (const c of choices) bucket(c.party || 'other').votes += c.votes
      const lead = choices[0]
      if (
        lead &&
        lead.votes > 0 &&
        !(choices[1] && choices[1].votes === lead.votes)
      )
        bucket(lead.party || 'other').leading++
      const winner = choices.filter((c) => c.winner)[0]
      if (winner) {
        bucket(winner.party || 'other').called!++
        chamberCalled++
      }
      contests.push({
        id: contestId(chamber, code),
        name: String(region.name || chamber.divisions[code]),
        label: chamber.divisions[code],
        kind: chamber.key,
        region: code.split('-')[0],
        voteFor: 1,
        ballots,
        acclaimed: choices.length === 1,
        sort: contests.length,
        reporting: num(region.percent_reporting),
        choices,
      })
    }
    const parties: PartyTally[] = []
    tally.forEach((t) =>
      parties.push({
        ...t,
        pct: chamberVotes ? (100 * t.votes) / chamberVotes : 0,
      }),
    )
    chambers[chamber.key] = {
      parties,
      reporting: num(doc.percent_reporting),
      called: chamberCalled,
    }
    called += chamberCalled
    if (chamber.key === 'house' || !eligible) {
      houseVotes = chamberVotes
      eligible = num(doc.registered_voters)
    }
  }

  const fetchedAt = Date.parse(String(wrapper.fetchedAt || ''))
  const at = latest || (Number.isFinite(fetchedAt) ? fetchedAt : Date.now())
  const house = chambers.house || chambers[election.chambers[0].key]
  return {
    asOf: wallStamp(at, election.pollsClose),
    project: election.title,
    format: 'civicapi',
    official: false,
    ballots: houseVotes,
    eligible,
    turnout: eligible > 0 ? houseVotes / eligible : null,
    polls: { closed: called, total: contests.length },
    tabulators: { closed: 0, total: 0 },
    groups: [],
    summary: { parties: house.parties, reporting: `${house.reporting}%` },
    sig: fingerprint(
      JSON.stringify(
        contests.map((c) => [
          c.reporting,
          c.choices.map((x) => [x.votes, x.winner ? 1 : 0]),
        ]),
      ),
    ),
    chambers,
    contests,
  }
}
