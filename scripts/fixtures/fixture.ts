// Synthetic election-night feeds, built from an election's own slates or
// ridings so names and party colours line up. fixtureFeeds() returns City of
// Vancouver feed objects for a "vancouver" election, Elections BC ENR-shaped
// HTML pages (strings) for an "ebc-enr" one, Elections Alberta referendum
// page sets ({ fetchedAt, pages }) for "eab-ref" and dashboard documents for
// "eab-dash", and civicAPI race-document sets ({ fetchedAt, races }) for
// "civicapi" (see shared/parsers for the shapes). Deterministic: the same
// election always yields the same night, and the same night cubby.fyi's
// fixture produced (scripts/fixtures/golden.ts checks). Used by the relay's
// --fixture mode, the e2e seed and the tests. Not real results: every count
// here is made up.
import type { AtLargeElection, ChambersElection, DistrictElection, Election, ReferendumElection, ReferendumQuestion } from '../../shared/schema/election.ts'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** "Ken Sim" -> "54 SIM, Ken", the feed's choiceName format. */
function choiceName(ballot: number, name: string): string {
  const parts = name.split(' ')
  const last = parts.pop()!
  return `${ballot} ${last.toUpperCase()}${parts.length ? `, ${parts.join(' ')}` : ''}`
}

const INDEPENDENTS: Record<string, [number, string][]> = {
  mayor: [
    [53, 'Mira Holt'],
    [55, 'Dan Okafor'],
    [57, 'Lee Parsons'],
  ],
  council: [
    [104, 'Ana Ferreira'],
    [108, 'Sam Whitlock'],
    [116, 'Grace Tan'],
  ],
  park: [
    [202, 'Owen Price'],
    [213, 'Ruth Calder'],
  ],
  school: [
    [307, 'Ivy Moreau'],
    [309, 'Ben Achebe'],
  ],
}

const QUESTIONS = [
  '1. CAPITAL BORROWING: STREETS AND BRIDGES',
  '2. CAPITAL BORROWING: COMMUNITY AND CIVIC FACILITIES',
  '3. CAPITAL BORROWING: PARKS',
  '4. PLEBISCITE: OPEN-AIR DRUG USE',
  '5. PLEBISCITE: INVOLUNTARY CARE',
]

export type FixtureOptions = { steps?: number; polls?: number; seed?: number }

/** Feeds from first count to final, in posting order. */
export function fixtureFeeds(election: Election, options: FixtureOptions = {}): unknown[] {
  if (election.ballot === 'referendum') {
    return election.results.format === 'eab-ref' ? fixtureEabNight(election, options) : fixtureEabDashNight(election, options)
  }
  if (election.ballot === 'chambers') return fixtureCivicNight(election, options)
  return election.ballot === 'district' ? fixtureEnrPages(election, options) : fixtureVancouverFeeds(election, options)
}

/** The body to post for one fixture feed. */
export const feedText = (feed: unknown): string => (typeof feed === 'string' ? feed : JSON.stringify(feed))

export function fixtureVancouverFeeds(election: AtLargeElection, { steps = 8, polls = 147, seed = 2026 }: FixtureOptions = {}): object[] {
  const rand = rng(seed)
  const offices: [string, string, number, 'mayor' | 'council' | 'park' | 'school'][] = [
    ['1', 'MAYOR', 1, 'mayor'],
    ['2', 'COUNCILLOR', 10, 'council'],
    ['3', 'PARK COMMISSIONER', 7, 'park'],
    ['4', 'SCHOOL TRUSTEE', 9, 'school'],
  ]
  type Ch = { ballot: number; who: string; inc: boolean; partyName: string; base: number; drift: number }
  // Each candidate gets a base strength and a drift, so leads move as the
  // count goes on (advance votes first, then election-day places).
  const contests = offices.map(([id, name, voteFor, kind]) => {
    const choices: Ch[] = []
    for (const p of election.parties) {
      const rows = kind === 'mayor' ? (p.mayor ? [p.mayor] : []) : p[kind]
      const pull = 0.6 + rand()
      for (const [ballot, who, inc] of rows) {
        choices.push({ ballot, who, inc: !!inc, partyName: p.name, base: pull * (0.7 + rand() * 0.6), drift: (rand() - 0.5) * 0.5 })
      }
    }
    for (const [ballot, who] of INDEPENDENTS[kind]) choices.push({ ballot, who, inc: false, partyName: '', base: 0.15 + rand() * 0.2, drift: 0 })
    choices.sort((a, b) => a.ballot - b.ballot)
    return { id, name, voteFor, choices }
  })
  const questions = QUESTIONS.map((name, i) => ({ id: String(5 + i), name, yes: 0.45 + rand() * 0.25 }))

  const feeds: object[] = []
  for (let s = 1; s <= steps; s++) {
    const done = s / steps
    const closed = Math.round(polls * done)
    const ballots = Math.round(175000 * done)
    const minute = 20 + s * 25
    const stamp = `2026-10-17 ${String(20 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`
    const contestResults: object[] = contests.map((c) => {
      const weights = c.choices.map((ch) => Math.max(0.01, ch.base + ch.drift * (done - 0.5)))
      const sum = weights.reduce((a, b) => a + b, 0)
      const cast = ballots * c.voteFor * 0.72
      const votes = weights.map((w) => Math.round((w / sum) * cast))
      const total = votes.reduce((a, b) => a + b, 0) || 1
      return {
        id: c.id,
        contestName: c.name,
        voteFor: c.voteFor,
        isAcclaimed: 0,
        ballotCast: ballots,
        sort: Number(c.id),
        choiceResults: c.choices.map((ch, i) => ({
          id: String(ch.ballot),
          choiceName: choiceName(ch.ballot, ch.who),
          votes: votes[i],
          percentage: `${((votes[i] / total) * 100).toFixed(2)}%`,
          isIncumbent: ch.inc ? 1 : 0,
          isWinner: 0,
          gender: 'Unknown',
          partyBreakdown: ch.partyName ? [{ id: '1', partyName: ch.partyName, percentage: '100.00%', votes: votes[i] }] : [],
        })),
      }
    })
    for (const q of questions) {
      const yes = Math.round(ballots * 0.9 * q.yes)
      const no = Math.round(ballots * 0.9) - yes
      contestResults.push({
        id: q.id,
        contestName: q.name,
        voteFor: 1,
        isAcclaimed: 0,
        ballotCast: ballots,
        sort: Number(q.id),
        choiceResults: [
          { id: '1', choiceName: 'Yes', votes: yes, percentage: `${((yes / (yes + no)) * 100).toFixed(2)}%`, isIncumbent: 0, isWinner: 0, partyBreakdown: [] },
          { id: '2', choiceName: 'No', votes: no, percentage: `${((no / (yes + no)) * 100).toFixed(2)}%`, isIncumbent: 0, isWinner: 0, partyBreakdown: [] },
        ],
      })
    }
    feeds.push({
      statistics: {
        projectName: 'City of Vancouver 2026',
        official: '26',
        timeStamp: stamp,
        eligibleVoters: 472665,
        globTurnout: `${((ballots / 472665) * 100).toFixed(2)}%`,
        globBallotCast: ballots,
        globTabulators: 210,
        globClosedTabulators: Math.round(210 * done),
        globPolls: polls,
        globClosedPolls: closed,
        globStartedPolls: 0,
        countinggroups: [
          { countingGroupId: '1', countingGroupName: 'General', tabulators: 170, closedTabulators: Math.round(170 * done) },
          { countingGroupId: '2', countingGroupName: 'Advance', tabulators: 30, closedTabulators: Math.min(30, Math.round(30 * done * 2)) },
          { countingGroupId: '3', countingGroupName: 'Mail', tabulators: 10, closedTabulators: Math.round(10 * done) },
        ],
        partyStats: [],
      },
      areaResults: [{ 1: { statistics: { ballotCast: ballots, polls, closedPolls: closed }, contestResults } }],
    })
  }
  return feeds
}

// ---- Elections BC ENR pages -------------------------------------------------

const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Last time's winner starts from its 2024 share and the rest split the
 * remainder by a province-wide prior; independents stay small. Boxes report
 * in over the night, advance boxes first, and a riding's votes scale with its
 * boxes reported.
 */
export function fixtureEnrPages(election: DistrictElection, { steps = 8, seed = 2026 }: FixtureOptions = {}): string[] {
  const rand = rng(seed)
  const prior: Record<string, number> = { ndp: 0.42, cp: 0.42, green: 0.08, centre: 0.05, onebc: 0.04 }
  const affiliation: Record<string, string> = {}
  for (const [label, key] of Object.entries(election.affiliations || {})) affiliation[key] = label
  const event = (election.results && election.results.eventMatch ? election.results.eventMatch.split('|')[0] : '') || 'GE'
  const day = new Date(`${election.votingDay}T12:00:00Z`)
  const ridings = (election.districts || []).map((d) => {
    const held = d.last && d.last.party && d.candidates.some((c) => c[1] === d.last!.party) ? d.last.party : null
    const heldShare = held ? Math.min(0.7, d.last!.pct / 100) : 0
    const restPrior = d.candidates.reduce((n, [, key]) => n + (key === held ? 0 : key ? prior[key] || 0.02 : 0.015), 0) || 1
    const candidates = d.candidates.map(([name, key, _sitting, label]) => ({
      name,
      affiliation: key ? affiliation[key] || key : (typeof label === 'string' && label) || 'Independent',
      base: (key === held ? heldShare : ((1 - heldShare) * (key ? prior[key] || 0.02 : 0.015)) / restPrior) * (0.85 + rand() * 0.3),
      drift: (rand() - 0.5) * 0.08,
    }))
    const advance = 4 + Math.floor(rand() * 6)
    const final = 10 + Math.floor(rand() * 28)
    const voters = 14000 + Math.floor(rand() * 20000)
    return { d, candidates, advance, final, voters, start: rand() * 0.3 }
  })
  const registered = ridings.reduce((n, r) => n + Math.round(r.voters / 0.58), 0)

  const pages: string[] = []
  for (let s = 1; s <= steps; s++) {
    const done = s / steps
    const minute = 5 + s * 20
    const hour = 20 + Math.floor(minute / 60)
    const stamp = `As of ${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}, ${day.getUTCFullYear()} ${String(hour).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')} PST`
    let closedBoxes = 0
    let totalBoxes = 0
    let validVotes = 0
    const partyVotes: Record<string, number> = {}
    const leading: Record<string, number> = {}
    const rows: string[] = []
    for (const r of ridings) {
      const share = Math.max(0, Math.min(1, (done - r.start) / (1 - r.start)))
      const adv = Math.min(r.advance, Math.ceil(r.advance * share * 2))
      const fin = Math.round(r.final * share)
      closedBoxes += adv + fin
      totalBoxes += r.advance + r.final
      const counted = Math.round(r.voters * ((adv + fin) / (r.advance + r.final)))
      const weights = r.candidates.map((c) => Math.max(0.002, c.base + c.drift * (share - 0.5)))
      const sum = weights.reduce((a, b) => a + b, 0)
      const votes = weights.map((w) => Math.round((w / sum) * counted))
      const total = votes.reduce((a, b) => a + b, 0)
      validVotes += total
      const order = r.candidates.map((_c, i) => i).sort((a, b) => votes[b] - votes[a])
      if (total > 0) leading[r.candidates[order[0]].affiliation] = (leading[r.candidates[order[0]].affiliation] || 0) + 1
      order.forEach((i, rank) => {
        const c = r.candidates[i]
        partyVotes[c.affiliation] = (partyVotes[c.affiliation] || 0) + votes[i]
        rows.push(
          `<tr data-ed="${esc(r.d.name)}" data-index=${rows.length + 1}><td>${rank === 0 ? `<button data-ed="${esc(r.d.name)}"><i class="fa-solid fa-thumb-tack"></i></button>` : ''}</td><td>${rank === 0 ? `<b> ${esc(r.d.name)}</b>` : ''}</td><td>${esc(c.name)}</td><td>${esc(c.affiliation)}</td><td style="text-align:right">${fmt(votes[i])}</td><td style="text-align:right">${total ? ((100 * votes[i]) / total).toFixed(2) : '0.00'}%</td></tr>`,
        )
      })
      rows.push(`<tr data-ed="${esc(r.d.name)}"><td colspan="4"></td><td style="text-align:right;font-weight:bold;">${fmt(total)}</td><td style="text-align: right;font-weight:bold;">100%</td></tr>`)
      rows.push(
        `<tr style="border:none;" data-ed="${esc(r.d.name)}"><td colspan="6">Advance voting ballot boxes | ${adv} of ${r.advance} reported${adv === r.advance ? '<i class="fas fa-check-circle fa-xs"></i>' : ''}</td></tr>`,
      )
      rows.push(`<tr style="border:none;" data-ed="${esc(r.d.name)}"><td colspan="6">Final Voting Day ballot boxes | ${fin} of ${r.final} reported</td></tr>`)
      rows.push(`<tr style="border-bottom:5px solid black" data-ed="${esc(r.d.name)}"><td colspan="6">Out-of-district ballots | ${done >= 1 ? 'Complete' : 'In progress'}</td></tr>`)
    }
    const partyRows = Object.entries(partyVotes)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([name, v]) =>
          `<tr data-party="${esc(name)}" class="visible-row"><td>${esc(name)}</td><td class="col-sm-4"><div class="bar"></div></td><td style="text-align:center">${leading[name] || 0}</td><td style="text-align:center">${fmt(v)}</td><td style="text-align:center">${((100 * v) / (validVotes || 1)).toFixed(2)} <span>%</span></td></tr>`,
      )
      .join('')
    const box = (main: string, small: string) => `<div class="box col-md-3 col-12"><div class="content"><div class="main-line">${main}</div></div><div class="small-line">${small}</div></div>`
    pages.push(`<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title> - Event Night Reporting</title><meta http-equiv="refresh" content="180"></head>
<body><header><h3>${day.getUTCFullYear()} General Election Results</h3></header>
<div class="container body-content">
<div class="status"><span>INITIAL COUNT</span> <span>${done >= 1 ? 'Complete' : 'In progress'}</span> <span>FINAL COUNT</span> <span>November 6, ${day.getUTCFullYear()}</span> <span>${stamp}</span></div>
<p>Initial count includes votes cast at district electoral offices, at advance voting and on Final Voting Day. Fixture page for ${esc(event)}; every count is made up.</p>
<table border="1" style=""><thead><tr><th>Party</th><th colspan="2">Electoral Districts Leading</th><th>Total Votes</th><th>% of Vote</th></tr></thead><tbody id="partyTableBody">${partyRows}</tbody></table>
<div class="row" id="divInfoTable">${box(`${((100 * closedBoxes) / totalBoxes).toFixed(2)}%`, 'Of ballot boxes reporting')}${box(`${((100 * validVotes) / registered).toFixed(2)}%`, 'Preliminary Voter Turnout')}${box(fmt(validVotes), 'Total Valid Votes')}${box(fmt(registered), `Registered voters as of ${MONTHS[day.getUTCMonth()]} ${day.getUTCDate() - 17}, ${day.getUTCFullYear()}`)}</div>
<nav><a href="https://electionsbcenr.blob.core.windows.net/electionsbcenr/Results_0000_${esc(event)}_Candidate.html">Results by Candidate</a><a href="https://electionsbcenr.blob.core.windows.net/electionsbcenr/Results_0000_${esc(event)}_Party.html">Results by Party</a></nav>
<div class="content"><table id="tblReport"><thead><tr><th></th><th>Electoral District</th><th>Candidate's Ballot Name</th><th>Affiliation</th><th>Total Valid Votes</th><th>% of Votes</th></tr></thead><tbody>
${rows.join('\n')}
</tbody></table></div></div></body></html>`)
  }
  return pages
}

// ---- Elections Alberta referendum ------------------------------------------

/** The 87 electoral divisions of the 2019 and 2023 general elections. */
const ALBERTA_EDS =
  'CALGARY-ACADIA|CALGARY-BEDDINGTON|CALGARY-BOW|CALGARY-BUFFALO|CALGARY-CROSS|CALGARY-CURRIE|CALGARY-EAST|CALGARY-EDGEMONT|CALGARY-ELBOW|CALGARY-FALCONRIDGE|CALGARY-FISH CREEK|CALGARY-FOOTHILLS|CALGARY-GLENMORE|CALGARY-HAYS|CALGARY-KLEIN|CALGARY-LOUGHEED|CALGARY-BHULLAR-MCCALL|CALGARY-MOUNTAIN VIEW|CALGARY-NORTH|CALGARY-NORTH EAST|CALGARY-NORTH WEST|CALGARY-PEIGAN|CALGARY-SHAW|CALGARY-SOUTH EAST|CALGARY-VARSITY|CALGARY-WEST|EDMONTON-BEVERLY-CLAREVIEW|EDMONTON-CASTLE DOWNS|EDMONTON-CITY CENTRE|EDMONTON-DECORE|EDMONTON-ELLERSLIE|EDMONTON-GLENORA|EDMONTON-GOLD BAR|EDMONTON-HIGHLANDS-NORWOOD|EDMONTON-MANNING|EDMONTON-MCCLUNG|EDMONTON-MEADOWS|EDMONTON-MILL WOODS|EDMONTON-NORTH WEST|EDMONTON-RIVERVIEW|EDMONTON-RUTHERFORD|EDMONTON-SOUTH|EDMONTON-SOUTH WEST|EDMONTON-STRATHCONA|EDMONTON-WEST HENDAY|EDMONTON-WHITEMUD|AIRDRIE-COCHRANE|AIRDRIE-EAST|ATHABASCA-BARRHEAD-WESTLOCK|BANFF-KANANASKIS|BONNYVILLE-COLD LAKE-ST. PAUL|BROOKS-MEDICINE HAT|CAMROSE|CARDSTON-SIKSIKA|CENTRAL PEACE-NOTLEY|CHESTERMERE-STRATHMORE|CYPRESS-MEDICINE HAT|DRAYTON VALLEY-DEVON|DRUMHELLER-STETTLER|FORT MCMURRAY-LAC LA BICHE|FORT MCMURRAY-WOOD BUFFALO|FORT SASKATCHEWAN-VEGREVILLE|GRANDE PRAIRIE|GRANDE PRAIRIE-WAPITI|HIGHWOOD|INNISFAIL-SYLVAN LAKE|LAC STE. ANNE-PARKLAND|LACOMBE-PONOKA|LEDUC-BEAUMONT|LESSER SLAVE LAKE|LETHBRIDGE-EAST|LETHBRIDGE-WEST|LIVINGSTONE-MACLEOD|MASKWACIS-WETASKIWIN|MORINVILLE-ST. ALBERT|OLDS-DIDSBURY-THREE HILLS|PEACE RIVER|RED DEER-NORTH|RED DEER-SOUTH|RIMBEY-ROCKY MOUNTAIN HOUSE-SUNDRE|SHERWOOD PARK|SPRUCE GROVE-STONY PLAIN|ST. ALBERT|STRATHCONA-SHERWOOD PARK|TABER-WARNER|VERMILION-LLOYDMINSTER-WAINWRIGHT|WEST YELLOWHEAD'.split(
    '|',
  )

export type EabRow = { code: string; name: string; closed: number; total: number; a: number; b: number; rejected: number }

/**
 * One question's page in the guessed 2026 shape (the by-election page's
 * columns with the two options in place of the parties): ED, ED Name,
 * Voting Locations "x of y", the options, Rejected, unclosed cells.
 */
export function eabPage(question: ReferendumQuestion, rows: EabRow[], { optionHeaders }: { optionHeaders?: [string, string] } = {}): string {
  const heads = optionHeaders || (question.n === 10 ? ['Option 1', 'Option 2'] : ['Yes', 'No'])
  const sum = (k: keyof EabRow) => rows.reduce((n, r) => n + (r[k] as number), 0)
  const a = sum('a')
  const b = sum('b')
  const pct = (v: number) => `${a + b ? ((100 * v) / (a + b)).toFixed(1) : '0.0'}%`
  return `<!DOCTYPE html><html><head><title>Provincial Referendum Results | Elections Alberta</title></head><body>
<h2>Question ${question.n}</h2>
<p><A HREF="orEDResultsReferendum2026.cfm?MODE=exProv&EventId=2026${String(question.n).padStart(2, '0')}">Download as Excel</A></p>
<TABLE CELLPADDING=0 CELLSPACING=1 id="dataTbl" border="0">
<thead><TR>
  <Th>ED
  <Th>ED Name
  <Th style="text-align:right;">Voting<BR>Locations
  <Th style="text-align:CENTER;">${heads[0]}
  <Th style="text-align:CENTER;">${heads[1]}
  <Th style="text-align:right;">Rejected
</tr></thead>
  <TR  class="showTotal">
  <TD COLSPAN="2" style="text-align:right; font-weight: 700;">Total<BR>Valid Vote Count Percentage
  <TD style="text-align:right;font-weight: 700;">${fmt(sum('closed'))} of ${fmt(sum('total'))}
  <TD style="text-align:right;font-weight: 700;">${fmt(a)}<BR>${pct(a)}
  <TD style="text-align:right;font-weight: 700;">${fmt(b)}<BR>${pct(b)}
  <TD style="text-align:right;font-weight: 700;">${fmt(sum('rejected'))} </tr>
${rows
  .map(
    (r) => `  <TR>
    <TD><a href="orEDResultsReferendum2026.cfm?ED=${r.code}">${r.code}</a>
    <TD>${esc(r.name)}
    <TD style="text-align:right;">${r.closed} of ${r.total}
    <TD style="text-align:right;">${fmt(r.a)}
    <TD style="text-align:right;">${fmt(r.b)}
    <TD style="text-align:right;">${fmt(r.rejected)}
  </tr>`,
  )
  .join('\n')}
</TABLE></body></html>`
}

/**
 * The Alberta count as data: per step, its fetch time and each question's
 * division rows (null before that question's count starts). Questions start
 * in ballot order (Question 10 first), each lagging the one before, and every
 * division reports its locations at its own pace. Option shares lean on the
 * question's polls.
 */
function eabNightRows(election: ReferendumElection, { steps = 10, seed = 2026 }: FixtureOptions = {}) {
  const rand = rng(seed)
  const Q = election.questions
  const eds = ALBERTA_EDS.map((name, i) => ({
    code: String(i + 1).padStart(2, '0'),
    name,
    total: 14 + Math.floor(rand() * 26),
    electors: 16000 + Math.floor(rand() * 14000),
    pace: 1 + rand() * 0.6,
    lean: (rand() - 0.5) * 0.24,
  }))
  const shareOf = (q: ReferendumQuestion) => {
    const polls = (q.polls || []).filter((p) => typeof p.pct[0] === 'number')
    if (!polls.length) return 0.5
    const yes = polls.reduce((n, p) => n + (p.pct[0] as number), 0) / polls.length
    const no = polls.every((p) => typeof p.pct[1] === 'number') ? polls.reduce((n, p) => n + (p.pct[1] as number), 0) / polls.length : Math.max(5, 90 - yes)
    return yes / (yes + no)
  }
  const close = Date.parse(election.pollsClose)
  const nights: { fetchedAt: string; questions: { q: ReferendumQuestion; rows: EabRow[] | null }[] }[] = []
  for (let s = 1; s <= steps; s++) {
    const questions = Q.map((q, p) => {
      const progress = Math.max(0, Math.min(1, (s - p * 0.6) / (steps * 0.55)))
      if (progress <= 0) return { q, rows: null }
      const base = shareOf(q)
      const rows = eds.map((d) => {
        const done = Math.min(1, progress * d.pace)
        const closed = Math.round(d.total * done)
        const ballots = Math.round(d.electors * 0.42 * (closed / d.total))
        const share = Math.max(0.03, Math.min(0.97, base + d.lean))
        const rejected = Math.round(ballots * 0.012)
        const a = Math.round((ballots - rejected) * share)
        return { code: d.code, name: d.name, closed, total: d.total, a, b: ballots - rejected - a, rejected }
      })
      return { q, rows }
    })
    nights.push({ fetchedAt: new Date(close + s * 20 * 60000).toISOString(), questions })
  }
  return nights
}

/** A hand count over `steps` fetches, 20 minutes apart from poll close, as eab-ref page sets. */
export function fixtureEabNight(election: ReferendumElection, options: FixtureOptions = {}): { fetchedAt: string; pages: { n: number; html: string }[] }[] {
  const fallback =
    '<!DOCTYPE html><html><head><title>Provincial Results | Elections Alberta</title></head><body><TABLE id="dataTbl"><thead><TR><Th>ED<Th>ED Name<Th>Voting<BR>Locations<Th>NDP<Th>UCP</tr></thead></TABLE></body></html>'
  return eabNightRows(election, options).map(({ fetchedAt, questions }) => ({
    fetchedAt,
    pages: questions.map(({ q, rows }) => ({ n: q.n, html: rows ? eabPage(q, rows) : fallback })),
  }))
}

/** The same night as Elections Alberta's 2026 dashboard feed (eab-dash). */
export function fixtureEabDashNight(election: ReferendumElection, options: FixtureOptions = {}): object[] {
  const results = election.results
  const ids: Record<string, number> = (results.format === 'eab-dash' && results.questionIds) || {}
  return eabNightRows(election, options).map(({ fetchedAt, questions }) => {
    const any = questions.find((x) => x.rows) || { rows: [] as EabRow[] }
    const wards = (any.rows || []).map((r) => ({ ward: r.code, pollsReporting: r.closed, totalPolls: r.total }))
    const sum = (rows: { [k: string]: unknown }[], k: string) => rows.reduce((n, r) => n + (r[k] as number), 0)
    return {
      success: true,
      forceFullRefresh: false,
      lastUpdated: fetchedAt,
      candidateResults: null,
      referendumResults: {
        widgets: { summary: { votes: 0, valid: 0, pollsReporting: sum(wards, 'pollsReporting'), totalPolls: sum(wards, 'totalPolls') || 5595 } },
        wards,
        votes: {
          questionStats: questions.map(({ q, rows }) => ({
            questionID: ids[q.n] != null ? ids[q.n] : q.n,
            yesVotes: rows ? sum(rows, 'a') : 0,
            noVotes: rows ? sum(rows, 'b') : 0,
            wardStats: (rows || any.rows || []).map((r) => ({ ward: r.code, yesVotes: rows ? r.a : null, noVotes: rows ? r.b : null, pollStats: [] })),
          })),
        },
      },
    }
  })
}

// ---- civicAPI (chambers) ------------------------------------------------------

const FIRST = ['Maria', 'James', 'Aisha', 'Daniel', 'Grace', 'Luis', 'Hannah', 'Marcus', 'Priya', 'Tom', 'Elena', 'Victor', 'Nora', 'Samuel', 'Ruth', 'Omar', 'Clara', 'Felix', 'Ingrid', 'Jonah', 'Leah', 'Mateo', 'Naomi', 'Owen']
const LAST = ['Alvarez', 'Brooks', 'Chen', 'Dawson', 'Ellis', 'Foster', 'Garcia', 'Hughes', 'Iwata', 'Jensen', 'Kim', 'Lopez', 'Morgan', 'Nguyen', 'Okafor', 'Patel', 'Quinn', 'Reyes', 'Singh', 'Torres', 'Underwood', 'Vance', 'Walker', 'Young', 'Zimmerman', 'Baker', 'Collins', 'Duarte', 'Fischer', 'Hale']
const MINOR = ['Libertarian', 'Independent', 'Green', 'Nonpartisan']

type CivicCandidate = {
  name: string
  party: string
  color: string
  votes: number
  percent: number
  winner: boolean
  advanced: boolean
  incumbent: boolean
  major_candidate: boolean
}

/**
 * Eight civicAPI document sets for a chambers election, from the first
 * counts to a night nearly done: every division gets two main candidates
 * (one per election party, a few with a minor-party or independent third),
 * a lean of its own, a start step and a pace, a share of the expected vote
 * that climbs to 100, and a call once 95% is in with a margin of at least
 * two points.
 * A few tight races stay uncalled at the end. Nothing here is a real count.
 */
export function fixtureCivicNight(election: ChambersElection, { steps = 8, seed = 2026 }: FixtureOptions = {}): { fetchedAt: string; races: Record<string, unknown> }[] {
  const rand = rng(seed)
  const [major, ...otherParties] = election.parties
  const minor = otherParties[0] || major
  const labelOf: Record<string, string> = {}
  for (const [label, key] of Object.entries(election.affiliations || {})) if (!labelOf[key]) labelOf[key] = label
  const colorOf: Record<string, string> = {}
  for (const p of election.parties) colorOf[p.key] = p.color
  const close = Date.parse(election.pollsClose)
  const lean: Record<string, number> = {}
  for (const r of election.regions) lean[r.key] = (rand() - 0.5) * 0.3
  const name = () => `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`

  const chambers = election.chambers.map((chamber) => {
    const codes = Object.keys(chamber.divisions)
    const divisions = codes.map((code) => {
      const state = code.split('-')[0]
      const tight = rand() < 0.08
      const majorShare = 0.5 + (lean[state] || 0) + (rand() - 0.5) * 0.16
      const share = tight ? 0.5 + (rand() - 0.5) * 0.02 : Math.max(0.3, Math.min(0.72, majorShare))
      const third = rand() < 0.3 ? MINOR[Math.floor(rand() * MINOR.length)] : ''
      const thirdShare = third ? 0.01 + rand() * 0.05 : 0
      const incumbent = rand() < 0.7 ? (rand() < share ? 0 : 1) : -1
      const candidates = [
        { name: name(), party: labelOf[major.key] || major.name, color: colorOf[major.key], share: share * (1 - thirdShare), incumbent: incumbent === 0 },
        { name: name(), party: labelOf[minor.key] || minor.name, color: colorOf[minor.key], share: (1 - share) * (1 - thirdShare), incumbent: incumbent === 1 },
      ]
      if (third) candidates.push({ name: name(), party: third, color: '#808080', share: thirdShare, incumbent: false })
      const voters = chamber.key === 'house' ? 220000 + Math.floor(rand() * 140000) : 900000 + Math.floor(rand() * 3000000)
      const start = Math.floor(rand() * 4)
      const span = 2 + Math.floor(rand() * (steps - start - 1))
      return { code, state, candidates, voters, start, span, drift: (rand() - 0.5) * 0.04 }
    })
    return { chamber, divisions }
  })

  const out: { fetchedAt: string; races: Record<string, unknown> }[] = []
  for (let s = 1; s <= steps; s++) {
    const at = new Date(close + s * 20 * 60000).toISOString()
    const races: Record<string, unknown> = {}
    for (const { chamber, divisions } of chambers) {
      const region_results: Record<string, unknown> = {}
      const totals: Record<string, { votes: number; seats: number; color: string }> = {}
      let reportingSum = 0
      for (const d of divisions) {
        const progress = Math.max(0, Math.min(1, (s - d.start) / d.span))
        const reporting = Math.round(100 * progress)
        reportingSum += reporting
        const counted = Math.round(d.voters * progress)
        const weights = d.candidates.map((c, i) => Math.max(0.001, c.share + (i === 0 ? d.drift : i === 1 ? -d.drift : 0) * (progress - 0.5)))
        const sum = weights.reduce((a, b) => a + b, 0)
        const votes = weights.map((w) => Math.round((w / sum) * counted))
        const total = votes.reduce((a, b) => a + b, 0)
        const pct = votes.map((v) => (total ? Math.round((1000 * v) / total) / 10 : 0))
        const order = votes.map((_v, i) => i).sort((a, b) => votes[b] - votes[a])
        const called = reporting >= 95 && total > 0 && pct[order[0]] - pct[order[1]] >= 2
        const candidates: CivicCandidate[] = d.candidates.map((c, i) => ({
          name: c.name,
          party: c.party,
          color: c.color,
          votes: votes[i],
          percent: pct[i],
          winner: called && i === order[0],
          advanced: false,
          incumbent: c.incumbent,
          major_candidate: true,
        }))
        for (const c of candidates) {
          const t = totals[c.party] || (totals[c.party] = { votes: 0, seats: 0, color: c.color })
          t.votes += c.votes
          if (c.winner) t.seats++
        }
        region_results[d.code] = {
          name: chamber.key === 'house' ? `${chamber.divisions[d.code]} Congressional District` : chamber.divisions[d.code],
          type: chamber.key === 'house' ? 'Congressional District' : 'State',
          fill: '#404040',
          election_id: 100000 + Object.keys(region_results).length,
          percent_reporting: reporting,
          candidates,
        }
      }
      for (const [key, n] of Object.entries(chamber.holdovers || {})) {
        const label = labelOf[key] || key
        const t = totals[label] || (totals[label] = { votes: 0, seats: 0, color: colorOf[key] || '#808080' })
        t.seats += n
      }
      const allVotes = Object.values(totals).reduce((n, t) => n + t.votes, 0)
      races[chamber.key] = {
        election_name: `Fixture ${chamber.label}`,
        election_type: chamber.label,
        election_scope: 'General',
        election_date: `${election.votingDay}T05:00:00.000Z`,
        country: 'US',
        province: 'US',
        district: null,
        municipality: null,
        polls_open: null,
        polls_close: null,
        is_disputed: false,
        has_map: false,
        registered_voters: 217223010,
        percent_reporting: Math.round(reportingSum / divisions.length),
        test_data: false,
        last_updated: at,
        round: 1,
        candidates: Object.entries(totals).map(([party, t]) => ({
          name: party,
          party,
          incumbent: false,
          major_candidate: true,
          winner: false,
          advanced: false,
          color: t.color,
          votes: t.votes,
          seats: t.seats,
          percent: allVotes ? Math.round((1000 * t.votes) / allVotes) / 10 : 0,
        })),
        region_results,
      }
    }
    out.push({ fetchedAt: at, races })
  }
  return out
}
