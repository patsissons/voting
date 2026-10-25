// Elections BC's election-night page (the archived 2024 page is
// scripts/fixtures/voting-2024-enr-candidate.html): a header strip "INITIAL
// COUNT <status> FINAL COUNT <date> As of October 21, 2024 16:00 PST", info
// boxes (<div class="main-line">100%</div><div class="small-line">Of ballot
// boxes reporting</div>, then turnout, total valid votes, registered voters),
// a party table of <tr data-party="BC NDP"> rows, and <table id="tblReport">
// with one <tr data-ed="Abbotsford-Mission"> group per riding: candidate rows
// (name, affiliation, votes, pct), a totals row, then three colspan rows
// "Advance voting ballot boxes | 5 of 5 reported", "Final Voting Day ballot
// boxes | 16 of 16 reported" and "Out-of-district ballots | Complete". The
// 2026 page (scripts/fixtures/voting-2026-enr-candidate.html) drops the pin
// column and the out-of-district row, marks box counts "(Not Verified)", and
// adds "Total Valid Votes", "Rejected Ballots*" and "Total Considered Votes"
// rows in the candidate shape. Each riding becomes one kind "district"
// contest; "polls" counts ballot boxes.
// Candidates are attributed by the page's affiliation column through the
// election's affiliations map, and matched by name to districts[].candidates
// for the sitting flag.
import type { Boxes, Choice, Contest, PartyTally, Payload } from '../payload.ts'
import type {
  CandidateRow,
  District,
  DistrictElection,
} from '../schema/election.ts'
import { FeedError, num, pad2, textOf, unescapeHtml } from './common.ts'

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

type Cell = { text: string; span: number }

function cellsOf(row: string): Cell[] {
  const cells: Cell[] = []
  const re = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(row))) {
    const span = /colspan\s*=\s*["']?(\d+)/i.exec(m[1])
    cells.push({ text: textOf(m[2]), span: span ? Number(span[1]) : 1 })
  }
  return cells
}

/** "As of October 21, 2024 16:00 PST" -> "2024-10-21 16:00:00" */
export function parseAsOf(html: string): string {
  const m =
    /As of\s+([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(
      textOf(html.slice(0, 60000)),
    )
  if (!m) return ''
  const word = m[1].toLowerCase()
  const month =
    MONTHS[word] ||
    MONTHS[
      Object.keys(MONTHS).find((k) => k.startsWith(word) && word.length >= 3) ||
        ''
    ]
  if (!month) return ''
  let hour = Number(m[4])
  if (m[7]) {
    const pm = m[7].toLowerCase() === 'pm'
    hour = (hour % 12) + (pm ? 12 : 0)
  }
  return `${m[3]}-${pad2(month)}-${pad2(Number(m[2]))} ${pad2(hour)}:${m[5]}:${m[6] || '00'}`
}

/** "5 of 5 reported" / "16 of 16" -> [5, 5]; "Complete" -> null */
function parseBoxes(text: string): [number, number] | null {
  const m = /(\d[\d,]*)\s+of\s+(\d[\d,]*)/.exec(text)
  return m ? [num(m[1]), num(m[2])] : null
}

/** The info boxes: { 'of ballot boxes reporting': '100%', 'preliminary voter turnout': '57.43%', ... } */
function infoBoxes(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re =
    /<div class="main-line">([\s\S]*?)<\/div>[\s\S]*?<div class="small-line">([\s\S]*?)<\/div>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) out[textOf(m[2]).toLowerCase()] = textOf(m[1])
  return out
}

/** A lookup from riding name (as the page writes it) to the election's district. */
function districtIndex(
  election: DistrictElection,
): (name: string) => District | null {
  const key = (name: string) =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
  const byName: Record<string, District> = {}
  for (const d of election.districts || []) byName[key(d.name)] = d
  return (name) => byName[key(name)] || null
}

/** Matches a page name to one of the riding's listed candidates: exact first, then "first ... last" ignoring middle names and accents. */
function candidateMatch(
  district: District | null,
  name: string,
): CandidateRow | null {
  if (!district) return null
  const rows = district.candidates || []
  const exact = rows.find((c) => c[0] === name)
  if (exact) return exact
  const strip = (s: string) =>
    String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .split(/\s+/)
      .filter(Boolean)
  const want = strip(name)
  if (want.length < 2) return null
  return (
    rows.find((c) => {
      const have = strip(c[0])
      return (
        have.length >= 2 &&
        have[0] === want[0] &&
        have[have.length - 1] === want[want.length - 1]
      )
    }) || null
  )
}

export function normalizeEnr(
  raw: unknown,
  election: DistrictElection,
): Payload {
  const html = String(raw || '')
    .replace(/^\uFEFF/, '')
    .trim()
  if (!html) throw new FeedError('empty_feed', 'the page body is empty')
  if (html[0] === '{' || html[0] === '[')
    throw new FeedError(
      'bad_feed',
      'the body is JSON, not an Elections BC results page',
    )
  if (!/id="tblReport"/.test(html) || !/data-ed=/.test(html))
    throw new FeedError('bad_feed', 'the page has no results table')

  const results = election.results || ({} as DistrictElection['results'])
  const match = results.eventMatch
  if (match && !new RegExp(match, 'i').test(html)) {
    throw new FeedError('project_mismatch', `page is not for /${match}/`)
  }
  const asOf = parseAsOf(html)
  if (!asOf) throw new FeedError('bad_feed', 'the page has no "As of" stamp')

  const affiliations: Record<string, string> =
    results.affiliations || election.affiliations || {}
  const partyOf = (label: string) =>
    affiliations[label] || affiliations[label.replace(/\s+/g, ' ')] || null
  const findDistrict = districtIndex(election)
  const boxes = infoBoxes(html)
  const head = textOf(html.slice(0, 60000))
  const status = {
    initial: (/INITIAL COUNT\s*(.*?)\s*FINAL COUNT/i.exec(head) || [])[1] || '',
    final: (/FINAL COUNT\s*(.*?)\s*As of/i.exec(head) || [])[1] || '',
  }

  const table = /<table[^>]*id="tblReport"[^>]*>([\s\S]*?)<\/table>/i.exec(html)
  const groups = new Map<string, { name: string; rows: Cell[][] }>()
  const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(table ? table[1] : ''))) {
    const ed = /data-ed\s*=\s*"([^"]*)"/i.exec(m[1])
    if (!ed) continue
    const name = unescapeHtml(ed[1]).trim()
    if (!groups.has(name)) groups.set(name, { name, rows: [] })
    groups.get(name)!.rows.push(cellsOf(m[2]))
  }
  if (!groups.size)
    throw new FeedError('bad_feed', 'the results table has no ridings')

  let closed = 0
  let total = 0
  let ballots = 0
  const contests: Contest[] = []
  groups.forEach((group) => {
    const district = findDistrict(group.name)
    const choices: Choice[] = []
    let districtTotal = 0
    let rejected: number | null = null
    const reported: Boxes = { advance: null, final: null, ood: '' }
    for (const cells of group.rows) {
      if (cells.length === 1 && cells[0].span >= 5) {
        const text = cells[0].text
        const parts = text.split('|')
        const label = parts[0].toLowerCase()
        const value = (parts[1] || '').trim()
        if (/advance/.test(label)) reported.advance = parseBoxes(value)
        else if (/final voting day/.test(label))
          reported.final = parseBoxes(value)
        else if (/out-of-district|absentee/.test(label)) reported.ood = value
        continue
      }
      if (cells.length === 3 && cells[0].span >= 3) {
        districtTotal = num(cells[1].text)
        continue
      }
      if (cells.length >= 5) {
        // Read from the end: 2024 led each row with a pin button and the
        // riding (6 cells), 2026 with the riding only (5 cells).
        const at = (i: number) => cells[cells.length - i].text
        const who = at(4)
        if (!who) continue
        // 2026's totals rows share the candidate shape: "Total Valid Votes",
        // "Rejected Ballots*", "Total Considered Votes".
        if (/^(total|rejected)\b/i.test(who)) {
          if (/^total valid votes/i.test(who)) districtTotal = num(at(2))
          else if (/^rejected/i.test(who)) rejected = num(at(2))
          continue
        }
        const affiliation = at(3)
        const known = candidateMatch(district, who)
        choices.push({
          ballot: null,
          name: known ? known[0] : who,
          votes: num(at(2)),
          pct: num(at(1)),
          party: partyOf(affiliation) || (known && known[1]) || null,
          partyName: affiliation,
          incumbent: !!(known && known[2]),
          winner: false,
        })
      }
    }
    if (!choices.length) return
    choices.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
    if (!districtTotal) districtTotal = choices.reduce((n, c) => n + c.votes, 0)
    for (const pair of [reported.advance, reported.final]) {
      if (!pair) continue
      closed += pair[0]
      total += pair[1]
    }
    ballots += districtTotal
    contests.push({
      id: district ? district.code : group.name,
      name: group.name,
      label: district ? district.name : group.name,
      kind: 'district',
      region: district ? district.region : null,
      voteFor: 1,
      ballots: districtTotal,
      acclaimed: false,
      sort: contests.length,
      boxes: reported,
      ...(rejected != null ? { rejected } : {}),
      choices,
    })
  })
  if (!contests.length)
    throw new FeedError('bad_feed', 'the results table has no candidate rows')

  // Province-wide seat and vote totals per compass party, from the ridings.
  const tally = new Map<
    string,
    { key: string; leading: number; votes: number }
  >()
  const bucket = (key: string) => {
    if (!tally.has(key)) tally.set(key, { key, leading: 0, votes: 0 })
    return tally.get(key)!
  }
  for (const p of election.parties || []) bucket(p.key)
  for (const c of contests) {
    for (const ch of c.choices) bucket(ch.party || 'other').votes += ch.votes
    const lead = c.choices[0]
    if (
      lead &&
      lead.votes > 0 &&
      !(c.choices[1] && c.choices[1].votes === lead.votes)
    )
      bucket(lead.party || 'other').leading++
  }
  const parties: PartyTally[] = []
  tally.forEach((t) =>
    parties.push({ ...t, pct: ballots ? (100 * t.votes) / ballots : 0 }),
  )

  const boxEntries = Object.keys(boxes).map((k) => [k, boxes[k]] as const)
  const registered = boxEntries.find(([k]) => /registered voters/.test(k))
  const eligible = num(
    boxes['registered voters'] || (registered ? registered[1] : undefined),
  )
  const turnoutBox = boxEntries.find(([k]) => /turnout/.test(k))
  const turnout = turnoutBox
    ? num(turnoutBox[1]) / 100
    : eligible > 0
      ? ballots / eligible
      : null

  return {
    asOf,
    project: (/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(html) || ['', ''])[1]
      .replace(/<[^>]*>/g, '')
      .trim(),
    official: false,
    status,
    ballots,
    eligible,
    turnout: turnout != null && Number.isFinite(turnout) ? turnout : null,
    polls: { closed, total },
    tabulators: { closed: 0, total: 0 },
    groups: [],
    summary: { parties, reporting: boxes['of ballot boxes reporting'] || '' },
    contests,
  }
}
