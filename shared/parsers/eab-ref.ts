// Elections Alberta's referendum pages (officialresults.elections.ab.ca; the
// 2021 referendum page is scripts/fixtures/voting-2021-eab-referendum.html):
// ColdFusion HTML with <TABLE id="dataTbl">, a header row of <Th> cells and
// data rows of <TD> cells that are never closed, a <TR class="showTotal">
// province row whose cells read "642,501 <BR> 61.7%", then one row per
// electoral division (or, in 2021, per municipality). Columns are read by
// their header text, never by position, so a renamed or added column still
// parses: "ED", "ED Name" or "Jurisdiction", "Voting Locations", the two
// options (matched by each option's "match" pattern, so "Yes"/"No" or
// "Option 1"/"Remain"), "Rejected ..." and "Turnout". The relay and the
// server fetch pull every page and hand them over as one JSON document
// { fetchedAt, pages: [{ n, html }] }; a single bare page (a --dump) parses
// too. The pages carry no update stamp, so asOf is the fetch time on the
// election's wall clock and "sig" fingerprints the counts: the store skips a
// fetch whose counts have not moved. Each question becomes one kind
// "question" contest (id "q<n>"), its choices in ballot order, with its own
// locations reported and per-division rows in "eds" (only the newest stored
// row keeps them).
import type { Contest, ContestPolls, Payload } from '../payload.ts'
import type {
  ReferendumElection,
  ReferendumQuestion,
} from '../schema/election.ts'
import {
  FeedError,
  bodyText,
  fingerprint,
  num,
  questionContest,
  textOf,
  titleCase,
  wallStamp,
} from './common.ts'

type LooseCell = { text: string; parts: string[]; span: number }
type LooseRow = { cls: string; header: boolean; cells: LooseCell[] }

/** The rows of an HTML table whose cells may be left unclosed, each cell's text split at <BR> in parts. */
function looseRows(tableHtml: string): LooseRow[] {
  const rows: LooseRow[] = []
  for (const chunk of String(tableHtml).split(/<tr\b/i).slice(1)) {
    const open = /^([^>]*)>/.exec(chunk)
    const attrs = open ? open[1] : ''
    const body = open ? chunk.slice(open[0].length) : chunk
    const cls = (/class\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1] || ''
    const cells: LooseCell[] = []
    let header = false
    const re = /<(t[hd])\b([^>]*)>/gi
    const starts: { tag: string; attrs: string; at: number; end: number }[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(body)))
      starts.push({
        tag: m[1].toLowerCase(),
        attrs: m[2],
        at: m.index,
        end: re.lastIndex,
      })
    starts.forEach((st, i) => {
      const raw = body
        .slice(st.end, i + 1 < starts.length ? starts[i + 1].at : body.length)
        .split(/<\/(?:t[dhr]|thead|tbody|table)\b/i)[0]
      const span = /colspan\s*=\s*["']?(\d+)/i.exec(st.attrs)
      if (st.tag === 'th') header = true
      cells.push({
        text: textOf(raw),
        parts: raw
          .split(/<br\s*\/?>/i)
          .map(textOf)
          .filter(Boolean),
        span: span ? Number(span[1]) : 1,
      })
    })
    if (cells.length) rows.push({ cls, header, cells })
  }
  return rows
}

/** The cells laid out by column, so a COLSPAN cell covers its columns. */
function byColumn(cells: LooseCell[]): (LooseCell | null)[] {
  const out: (LooseCell | null)[] = []
  for (const cell of cells)
    for (let i = 0; i < cell.span; i++) out.push(i === 0 ? cell : null)
  return out
}

/** "12 of 34", "12/34" -> [12, 34]; "71" -> [71, null]; "" -> null */
export function parseLocations(text: unknown): [number, number | null] | null {
  const pair = /(\d[\d,]*)\s*(?:of|\/)\s*(\d[\d,]*)/.exec(String(text || ''))
  if (pair) return [num(pair[1]), num(pair[2])]
  const one = /\d[\d,]*/.exec(String(text || ''))
  return one ? [num(one[0]), null] : null
}

const firstNumber = (cell: LooseCell | null): number =>
  cell
    ? num((/-?\d[\d,]*(?:\.\d+)?/.exec(cell.parts[0] || cell.text) || [''])[0])
    : 0

/** Header text -> role, for one question's two options. */
function columnRoles(
  headers: string[],
  question: ReferendumQuestion,
): string[] {
  const patterns = question.options.map(
    (o, k) => new RegExp(o.match || (k === 0 ? '^yes' : '^no\\b'), 'i'),
  )
  return headers.map((h) => {
    const t = h.toLowerCase()
    for (let k = 0; k < patterns.length; k++)
      if (patterns[k].test(t)) return `opt${k}`
    if (/^ed$|^ed\s*(#|no\.?|number)$/.test(t)) return 'code'
    if (/ed name|electoral division|jurisdiction|^division/.test(t))
      return 'name'
    if (/voting\s*locations?|voting places|polls/.test(t)) return 'locations'
    if (/turnout/.test(t)) return 'turnout'
    if (/rejected|declined|spoiled/.test(t)) return 'rejected'
    if (/electors who voted|ballots cast|total ballots/.test(t)) return 'voted'
    return ''
  })
}

type PageRow = {
  code: string
  name: string
  votes: [number, number]
  rejected: number
  voted: number
  locations: [number, number | null] | null
}
type PageRead = { total: PageRow; eds: PageRow[] }

/** One question's page, or null when the page has no table for this question (not posted yet). */
function readReferendumPage(
  html: string,
  question: ReferendumQuestion,
): PageRead | null {
  const table =
    /<table\b[^>]*id\s*=\s*["']?dataTbl["']?[^>]*>([\s\S]*?)(?:<\/table>|$)/i.exec(
      String(html || ''),
    )
  if (!table) return null
  const rows = looseRows(table[1])
  const head = rows.find((r) => r.header)
  if (!head) return null
  const roles = columnRoles(
    byColumn(head.cells).map((c) => (c ? c.text : '')),
    question,
  )
  const col = (role: string) => roles.indexOf(role)
  if (col('opt0') < 0 || col('opt1') < 0) return null
  const read = (cells: LooseCell[]): PageRow => {
    const at = byColumn(cells)
    const cell = (role: string) => {
      const i = col(role)
      return i >= 0 ? at[i] : null
    }
    let rejected = 0
    roles.forEach((role, i) => {
      if (role === 'rejected') rejected += firstNumber(at[i])
    })
    const where = cell('locations')
    const code = cell('code')
    const name = cell('name')
    return {
      code: code ? code.text : '',
      name: name
        ? titleCase(name.text).replace(
            /\bMc([a-z])/g,
            (_m, ch: string) => `Mc${ch.toUpperCase()}`,
          )
        : '',
      votes: [firstNumber(cell('opt0')), firstNumber(cell('opt1'))],
      rejected,
      voted: firstNumber(cell('voted')),
      locations: where ? parseLocations(where.parts[0] || where.text) : null,
    }
  }
  let total: PageRow | null = null
  const eds: PageRow[] = []
  for (const row of rows) {
    if (row.header) continue
    const first = row.cells[0] ? row.cells[0].text : ''
    if (/showtotal/i.test(row.cls) || /^(provincial\s+)?total\b/i.test(first)) {
      if (!total) total = read(row.cells)
      continue
    }
    const r = read(row.cells)
    if (!r.name && !r.code) continue
    eds.push(r)
  }
  if (!total) {
    total = {
      code: '',
      name: '',
      votes: [0, 0],
      rejected: 0,
      voted: 0,
      locations: null,
    }
    for (const d of eds) {
      total.votes[0] += d.votes[0]
      total.votes[1] += d.votes[1]
      total.rejected += d.rejected
      total.voted += d.voted
    }
  }
  return { total, eds }
}

export type RefDoc = {
  fetchedAt?: string | number
  pages: { n: number | null; html: string }[]
}

export function normalizeEabRef(
  raw: unknown,
  election: ReferendumElection,
): Payload {
  let doc = raw as RefDoc
  if (typeof raw === 'string') {
    const text = bodyText(raw)
    if (!text) throw new FeedError('empty_feed', 'the body is empty')
    if (text[0] === '{') {
      try {
        doc = JSON.parse(text)
      } catch (err) {
        throw new FeedError(
          'bad_feed',
          `the body is not JSON: ${String((err as Error).message || err).slice(0, 200)}`,
        )
      }
    } else {
      doc = { pages: [{ n: null, html: text }] }
    }
  }
  if (!doc || !Array.isArray(doc.pages))
    throw new FeedError('bad_feed', 'the body has no pages')

  const questions = election.questions || []
  const parsed = new Map<number, PageRead>()
  for (const page of doc.pages) {
    const candidates =
      page.n == null
        ? questions
        : questions.filter((q) => q.n === Number(page.n))
    for (const q of candidates) {
      if (parsed.has(q.n)) continue
      const read = readReferendumPage(page.html, q)
      if (read) {
        parsed.set(q.n, read)
        break
      }
    }
  }
  if (!parsed.size)
    throw new FeedError(
      'not_reporting',
      'no referendum results table on any page yet',
    )

  const contests: Contest[] = []
  for (const q of questions) {
    const read = parsed.get(q.n)
    const votes: [number, number] = read ? read.total.votes : [0, 0]
    const sum = votes[0] + votes[1]
    // Locations reported: the page's "x of y" when it gives one, else the
    // divisions with any votes counted, of all divisions listed.
    let polls: ContestPolls = { closed: 0, total: 0, unit: '' }
    if (read) {
      const loc = read.total.locations
      const edLoc = read.eds
        .map((d) => d.locations)
        .filter((l): l is [number, number | null] => !!l)
      if (loc && loc[1]) polls = { closed: loc[0], total: loc[1], unit: '' }
      else if (edLoc.length && edLoc.every((l) => l[1]))
        polls = {
          closed: edLoc.reduce((n, l) => n + l[0], 0),
          total: edLoc.reduce((n, l) => n + (l[1] || 0), 0),
          unit: '',
        }
      else if (read.eds.length)
        polls = {
          closed: read.eds.filter((d) => d.votes[0] + d.votes[1] > 0).length,
          total: read.eds.length,
          unit: 'divisions',
        }
    }
    contests.push(
      questionContest(
        q,
        votes,
        contests.length,
        {
          ballots: read ? read.total.voted || sum + read.total.rejected : 0,
          rejected: read ? read.total.rejected : 0,
          posted: !!read,
          polls,
          locations: read ? read.total.locations : null,
        },
        read
          ? read.eds.map((d) => ({
              code: d.code,
              name: d.name,
              votes: d.votes,
              rejected: d.rejected,
              polls: d.locations,
            }))
          : [],
      ),
    )
  }

  const head = contests[0]
  const sig = fingerprint(
    JSON.stringify(
      contests.map((c) => [
        c.choices.map((x) => x.votes),
        c.rejected,
        c.polls,
        (c.eds || []).map((d) =>
          (d.votes as (number | null)[]).concat(d.polls || []),
        ),
      ]),
    ),
  )
  return {
    asOf: wallStamp(
      doc.fetchedAt != null ? doc.fetchedAt : Date.now(),
      election.pollsClose,
    ),
    project: election.title || '',
    format: 'eab-ref',
    official: false,
    ballots: head.ballots,
    eligible: 0,
    turnout: null,
    polls: { closed: head.polls!.closed, total: head.polls!.total },
    tabulators: { closed: 0, total: 0 },
    groups: [],
    sig,
    contests,
  }
}
