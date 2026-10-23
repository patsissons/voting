// The election document: everything an election needs beyond its results
// rows, authored as elections/<slug>.json and stored in the `config` column
// of its `elections` row (see shared/election-row.ts for the split). Strict
// schemas, so a typo in a document fails `pnpm elections:check` instead of
// silently rendering nothing. Four ballot modes share the header fields:
//
//   at-large    one city-wide ballot, parties run slates (Vancouver)
//   district    one vote for one seat in the voter's riding (BC)
//   referendum  yes/no (or two-option) questions, no parties (Alberta)
//   chambers    one seat per division, grouped by chamber; results only,
//               no compass (the US midterms)
//
// The results block names the feed format the parsers read and what the
// server-side fetch may touch. zod runs in Node and the browser; the hooks
// bundle never imports this file (see shared/config-guard.ts).
import { z } from 'zod'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a YYYY-MM-DD day')
const url = z.string().url()
const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes')
const link = z.strictObject({ label: z.string().min(1), url })
const axis = z.strictObject({
  e: z.number().min(-1).max(1),
  s: z.number().min(-1).max(1),
})
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a #rrggbb colour')
const cssColor = z.string().min(1)

export const BALLOTS = [
  'at-large',
  'district',
  'referendum',
  'chambers',
] as const
export type Ballot = (typeof BALLOTS)[number]

/** The boundary sets the results maps draw (src/geo/<set>.json, `pnpm geo`). */
export const BOUNDARY_SETS = ['ab-2017', 'bc-2023'] as const
export type BoundarySetKey = (typeof BOUNDARY_SETS)[number]
const boundaries = z.enum(BOUNDARY_SETS).optional()

const dates = z.strictObject({
  advance: z.array(day).default([]),
  final: day,
  hours: z.string().optional(),
  mailBy: z.string().optional(),
  url: url.optional(),
})

const note = z.strictObject({ text: z.string().min(1), link: link.optional() })

/** Fields every ballot mode shares; the row columns live here too. */
const head = {
  slug,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
}

const header = {
  votingDay: day,
  published: z.boolean(),
  place: z.string().min(1),
  eyebrow: z.string().min(1),
  pollsClose: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?[+-]\d{2}:\d{2}$/,
      'an ISO time with a zone offset',
    ),
  timeZone: z.string().min(1),
  dates,
  lede: z.string().min(1),
  intro: z.string().min(1),
  sources: z.array(link).default([]),
  resources: z.array(link).default([]),
  note: note.optional(),
}

// ---- results feeds ----------------------------------------------------------

const resultsBase = {
  /** The results page people should follow, and the source label. */
  official: url,
  label: z.string().optional(),
  unit: z.string().optional(),
  unofficialNote: z.string().optional(),
  alternatives: z.array(link).default([]),
  /** The server-side fetch (server/store.ts). */
  serverFetch: z.boolean().default(false),
  fetchHours: z.number().positive().optional(),
  throttleSeconds: z.number().positive().optional(),
  sourcePrefix: url.optional(),
  baseline: z
    .strictObject({
      year: z.number().int(),
      ballots: z.number().int().nonnegative(),
      label: z.string().optional(),
    })
    .optional(),
}

const vancouverResults = z.strictObject({
  format: z.literal('vancouver'),
  source: url,
  projectMatch: z.string().optional(),
  contests: z
    .array(
      z.strictObject({
        match: z.string().min(1),
        kind: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .default([]),
  ...resultsBase,
})

const enrResults = z.strictObject({
  format: z.literal('ebc-enr'),
  source: url.nullable(),
  eventMatch: z.string().optional(),
  affiliations: z.record(z.string(), z.string()).optional(),
  ...resultsBase,
})

const eabRefResults = z.strictObject({
  format: z.literal('eab-ref'),
  source: url.nullable(),
  pages: z
    .array(z.strictObject({ n: z.number().int(), event: z.string().min(1) }))
    .optional(),
  page: z.string().optional(),
  ...resultsBase,
})

const eabDashResults = z.strictObject({
  format: z.literal('eab-dash'),
  source: url.nullable(),
  questionIds: z.record(z.string(), z.number().int()).optional(),
  divisions: z.record(z.string(), z.string()).optional(),
  ...resultsBase,
})

/**
 * civicAPI's aggregate race documents, one per chamber: `source` is the base
 * URL (https://civicapi.org/api/v2/race/) and `races` maps each chamber key
 * to the race id the fetch appends to it.
 */
const civicapiResults = z.strictObject({
  format: z.literal('civicapi'),
  source: url.nullable(),
  races: z.record(z.string().min(1), z.number().int().positive()),
  ...resultsBase,
})

export const ResultsSchema = z.discriminatedUnion('format', [
  vancouverResults,
  enrResults,
  eabRefResults,
  eabDashResults,
  civicapiResults,
])

// ---- compass questions (at-large and district) ------------------------------

const compassOption = z.strictObject({
  t: z.string().min(1),
  s: z.string().min(1),
  pts: z.record(z.string(), z.number().int().min(0).max(3)),
  axis: axis.optional(),
})

const compassQuestion = z.strictObject({
  topic: z.string().min(1),
  q: z.string().min(1),
  context: z.string().min(1),
  opts: z.array(compassOption).min(2).max(10),
})

const office = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  voteFor: z.number().int().positive(),
  fact: z.string().min(1),
})

const partyBase = {
  key: z.string().regex(/^[a-z][a-z0-9]*$/),
  name: z.string().min(1),
  short: z.string().min(1),
  url,
  lean: z.string().min(1),
  axis,
  /** Light and dark chart colours; dark falls back to light. */
  color,
  colorDark: color.optional(),
}

/** [ballot number, name, sitting?] */
const slateRow = z
  .tuple([z.number().int().positive(), z.string().min(1)])
  .rest(z.number().int().min(0).max(1))

const atLargeParty = z.strictObject({
  ...partyBase,
  mayor: slateRow.nullable(),
  endorses: z.string().optional(),
  endorsesMayor: z.string().optional(),
  council: z.array(slateRow).default([]),
  park: z.array(slateRow).default([]),
  school: z.array(slateRow).default([]),
})

const districtParty = z.strictObject({
  ...partyBase,
  leader: z.string().optional(),
  leaderDistrict: z.string().optional(),
  candidates: z.number().int().nonnegative().optional(),
})

/** [name, party key or null, sitting?, affiliation label for null parties] */
const candidateRow = z
  .tuple([z.string().min(1), z.string().nullable()])
  .rest(z.union([z.number().int().min(0).max(1), z.string()]))

const district = z.strictObject({
  code: z.string().min(1),
  name: z.string().min(1),
  region: z.string().min(1),
  last: z
    .strictObject({
      party: z.string().nullable(),
      name: z.string(),
      pct: z.number(),
      margin: z.number(),
    })
    .nullable()
    .optional(),
  candidates: z.array(candidateRow).min(1),
})

export const AtLargeSchema = z.strictObject({
  ...head,
  ballot: z.literal('at-large'),
  ...header,
  offices: z.array(office).min(1),
  parties: z.array(atLargeParty).min(1),
  questions: z.array(compassQuestion).min(1),
  results: vancouverResults,
})

export const DistrictSchema = z.strictObject({
  ...head,
  ballot: z.literal('district'),
  ...header,
  /** The divisions on the results map; no map without it. */
  boundaries,
  seats: z.number().int().positive(),
  majority: z.number().int().positive(),
  facts: z
    .array(
      z.strictObject({
        n: z.union([z.number(), z.string()]),
        label: z.string().min(1),
      }),
    )
    .default([]),
  offices: z.array(office).min(1),
  parties: z.array(districtParty).min(1),
  affiliations: z.record(z.string(), z.string()),
  regions: z
    .array(z.strictObject({ key: z.string().min(1), label: z.string().min(1) }))
    .default([]),
  districts: z.array(district).min(1),
  questions: z.array(compassQuestion).min(1),
  results: enrResults,
})

const referendumOption = z.strictObject({
  t: z.string().min(1),
  full: z.string().optional(),
  match: z.string().min(1),
})

const poll = z.strictObject({
  by: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  pct: z.tuple([
    z.number().min(0).max(100).nullable(),
    z.number().min(0).max(100).nullable(),
  ]),
  url: url.optional(),
})

const referendumQuestion = z.strictObject({
  n: z.number().int().positive(),
  group: z.string().min(1),
  topic: z.string().min(1),
  short: z.string().min(1),
  q: z.string().min(1),
  options: z.tuple([referendumOption, referendumOption]),
  context: z.string().min(1),
  polls: z.array(poll).default([]),
})

export const ReferendumSchema = z.strictObject({
  ...head,
  ballot: z.literal('referendum'),
  ...header,
  /** The divisions on the results map; no map without it. */
  boundaries,
  groups: z
    .array(
      z.strictObject({
        key: z.string().min(1),
        label: z.string().min(1),
        order: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .min(1),
  questions: z.array(referendumQuestion).min(1),
  pollNote: z.string().optional(),
  /** Option colours for the two-option bars; app defaults when absent. */
  optionColors: z.tuple([cssColor, cssColor]).optional(),
  results: z.discriminatedUnion('format', [eabRefResults, eabDashResults]),
})

// ---- chambers (results only) -------------------------------------------------

/** A party on a results-only page: a name and colours, no compass position. */
const chamberParty = z.strictObject({
  key: partyBase.key,
  name: z.string().min(1),
  short: z.string().min(1),
  url: url.optional(),
  color,
  colorDark: color.optional(),
})

/**
 * One chamber (or a set of offices, like the governors): `seats` is the whole
 * body, `holdovers` the seats not up this time per party, and `divisions`
 * the contests the feed reports (code -> short name), so divisions + holdovers
 * = seats. `boundaries` names the map set whose codes are the division codes.
 */
const chamber = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9]*$/),
  label: z.string().min(1),
  short: z.string().min(1),
  seats: z.number().int().positive(),
  majority: z.number().int().positive().optional(),
  holdovers: z.record(z.string(), z.number().int().nonnegative()).default({}),
  boundaries,
  divisions: z.record(z.string().min(1), z.string().min(1)),
})

export const ChambersSchema = z.strictObject({
  ...head,
  ballot: z.literal('chambers'),
  ...header,
  parties: z.array(chamberParty).min(1),
  /** The feed's party labels to party keys; anything else stays unaffiliated. */
  affiliations: z.record(z.string(), z.string()),
  /** The states (or provinces): division codes are `<key>` or `<key>-<n>`. */
  regions: z
    .array(z.strictObject({ key: z.string().min(1), label: z.string().min(1) }))
    .min(1),
  chambers: z.array(chamber).min(1),
  results: civicapiResults,
})

export const ElectionSchema = z.discriminatedUnion('ballot', [
  AtLargeSchema,
  DistrictSchema,
  ReferendumSchema,
  ChambersSchema,
])

export type AtLargeElection = z.infer<typeof AtLargeSchema>
export type DistrictElection = z.infer<typeof DistrictSchema>
export type ReferendumElection = z.infer<typeof ReferendumSchema>
export type ChambersElection = z.infer<typeof ChambersSchema>
export type Election = z.infer<typeof ElectionSchema>
export type CompassElection = AtLargeElection | DistrictElection
/** Every mode with a parties list (everything but a referendum). */
export type PartyElection = CompassElection | ChambersElection
export type Results = z.infer<typeof ResultsSchema>
export type AtLargeParty = z.infer<typeof atLargeParty>
export type DistrictParty = z.infer<typeof districtParty>
export type ChamberParty = z.infer<typeof chamberParty>
export type Chamber = z.infer<typeof chamber>
export type Party = AtLargeParty | DistrictParty | ChamberParty
export type CompassQuestion = z.infer<typeof compassQuestion>
export type CompassOption = z.infer<typeof compassOption>
export type ReferendumQuestion = z.infer<typeof referendumQuestion>
export type District = z.infer<typeof district>
export type SlateRow = z.infer<typeof slateRow>
export type CandidateRow = z.infer<typeof candidateRow>
export type Office = z.infer<typeof office>
export type Link = z.infer<typeof link>

/** Cross-field checks the schema cannot express; each returns a problem list. */
export function electionProblems(e: Election): string[] {
  const problems: string[] = []
  const days = [...e.dates.advance, e.dates.final]
  if ([...days].sort().join() !== days.join())
    problems.push('dates: voting days are out of order')
  if (e.dates.final !== e.votingDay)
    problems.push('dates.final must equal votingDay')
  if (e.slug.endsWith('.md')) problems.push('slug must not end in .md')
  for (const s of [...e.sources, ...e.resources, ...e.results.alternatives]) {
    if (!/^https:\/\//.test(s.url))
      problems.push(`${s.label}: links must be https`)
  }
  if (
    e.results.source &&
    e.results.sourcePrefix &&
    !e.results.source.startsWith(e.results.sourcePrefix)
  ) {
    problems.push('results.source must start with results.sourcePrefix')
  }
  if (e.ballot === 'referendum') {
    const groups = new Set(e.groups.map((g) => g.key))
    const numbers = e.questions.map((q) => q.n)
    if (new Set(numbers).size !== numbers.length)
      problems.push('question numbers must be unique')
    for (const q of e.questions) {
      if (!groups.has(q.group))
        problems.push(`Q${q.n}: unknown group "${q.group}"`)
      for (const o of q.options) {
        try {
          new RegExp(o.match, 'i')
        } catch {
          problems.push(`Q${q.n} ${o.t}: match is not a regular expression`)
        }
      }
    }
    const r = e.results
    if (r.format === 'eab-ref' && r.pages) {
      if (r.pages.length !== e.questions.length)
        problems.push('results.pages: one page per question')
      for (const page of r.pages)
        if (!numbers.includes(page.n))
          problems.push(`results.pages: no question ${page.n}`)
    }
    if (r.format === 'eab-dash' && r.questionIds) {
      const keys = Object.keys(r.questionIds)
        .map(Number)
        .sort((a, b) => a - b)
      if (keys.join() !== [...numbers].sort((a, b) => a - b).join())
        problems.push('results.questionIds: a feed id per question')
    }
    return problems
  }
  const keys = new Set(e.parties.map((p) => p.key))
  if (keys.size !== e.parties.length) problems.push('party keys must be unique')
  if (e.ballot === 'chambers') {
    const chamberKeys = e.chambers.map((c) => c.key)
    if (new Set(chamberKeys).size !== chamberKeys.length)
      problems.push('chamber keys must be unique')
    const raceKeys = Object.keys(e.results.races).sort()
    if (raceKeys.join() !== [...chamberKeys].sort().join())
      problems.push('results.races: a race id per chamber')
    for (const key of Object.values(e.affiliations))
      if (!keys.has(key)) problems.push(`affiliations: unknown party "${key}"`)
    for (const p of e.parties) {
      if (!Object.values(e.affiliations).includes(p.key))
        problems.push(`${p.key}: no feed affiliation maps to it`)
    }
    const regions = new Set(e.regions.map((r) => r.key))
    for (const c of e.chambers) {
      let held = 0
      for (const [key, n] of Object.entries(c.holdovers)) {
        if (!keys.has(key))
          problems.push(`${c.key}: holdover party "${key}" is unknown`)
        held += n
      }
      const divisions = Object.keys(c.divisions)
      if (divisions.length !== c.seats - held)
        problems.push(
          `${c.key}: ${divisions.length} divisions for ${c.seats} seats less ${held} holdovers`,
        )
      if (c.majority != null && c.majority > c.seats)
        problems.push(`${c.key}: majority exceeds seats`)
      for (const code of divisions) {
        if (!regions.has(code.split('-')[0]))
          problems.push(`${c.key}: division ${code} is in no region`)
      }
    }
    return problems
  }
  let withAxis = 0
  for (const q of e.questions) {
    for (const o of q.opts) {
      if (o.axis) withAxis++
      for (const k of Object.keys(o.pts))
        if (!keys.has(k)) problems.push(`${q.topic}: unknown party "${k}"`)
    }
  }
  if (withAxis < e.questions.length * 2)
    problems.push('most compass options should carry axis values')
  if (e.ballot === 'at-large') {
    const ballots: number[] = []
    for (const p of e.parties) {
      if (
        p.endorsesMayor &&
        !e.parties.some((x) => x.key === p.endorsesMayor && x.mayor)
      )
        problems.push(
          `${p.key}: endorsesMayor must name a party with a mayoral candidate`,
        )
      for (const row of [p.mayor, ...p.council, ...p.park, ...p.school])
        if (row) ballots.push(row[0])
    }
    if (new Set(ballots).size !== ballots.length)
      problems.push('ballot numbers must be unique')
    const kinds = new Set(e.offices.map((o) => o.key))
    for (const rule of e.results.contests)
      if (!kinds.has(rule.kind))
        problems.push(`results.contests: unknown office "${rule.kind}"`)
    return problems
  }
  const regions = new Set(e.regions.map((r) => r.key))
  if (e.districts.length !== e.seats)
    problems.push(
      `districts: ${e.districts.length} listed for ${e.seats} seats`,
    )
  if (new Set(e.districts.map((d) => d.code)).size !== e.districts.length)
    problems.push('district codes must be unique')
  if (new Set(e.districts.map((d) => d.name)).size !== e.districts.length)
    problems.push('district names must be unique')
  for (const key of Object.values(e.affiliations))
    if (!keys.has(key)) problems.push(`affiliations: unknown party "${key}"`)
  for (const p of e.parties) {
    if (!Object.values(e.affiliations).includes(p.key))
      problems.push(`${p.key}: no page affiliation maps to it`)
    if (
      p.leaderDistrict &&
      !e.districts.some((d) => d.code === p.leaderDistrict)
    )
      problems.push(
        `${p.key}: leaderDistrict ${p.leaderDistrict} does not exist`,
      )
    if (p.candidates != null) {
      const running = e.districts.reduce(
        (n, d) => n + d.candidates.filter((c) => c[1] === p.key).length,
        0,
      )
      if (running !== p.candidates)
        problems.push(
          `${p.key}: candidates says ${p.candidates}, districts list ${running}`,
        )
    }
  }
  for (const d of e.districts) {
    if (!regions.has(d.region))
      problems.push(`${d.code}: unknown region "${d.region}"`)
    if (d.last && d.last.party !== null && !keys.has(d.last.party))
      problems.push(`${d.code}: last winner party "${d.last.party}" is unknown`)
    if (d.candidates.length < 2)
      problems.push(`${d.code}: a riding needs a contest`)
    const names = d.candidates.map((c) => c[0])
    if (new Set(names).size !== names.length)
      problems.push(`${d.code}: candidate names must be unique`)
    for (const c of d.candidates) {
      if (c[1] !== null && !keys.has(c[1]))
        problems.push(`${d.code}: ${c[0]} has unknown party "${c[1]}"`)
      if (c[1] === null && typeof c[3] !== 'string')
        problems.push(`${d.code}: ${c[0]} needs an affiliation label`)
      if (c[1] && d.candidates.filter((x) => x[1] === c[1]).length > 1)
        problems.push(`${d.code}: one candidate per party`)
    }
  }
  return problems
}

/** Parse and cross-check a document; throws with every problem listed. */
export function parseElection(input: unknown): Election {
  const parsed = ElectionSchema.safeParse(input)
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
    )
    throw new Error(`invalid election document:\n  ${lines.join('\n  ')}`)
  }
  const problems = electionProblems(parsed.data)
  if (problems.length)
    throw new Error(`invalid election document:\n  ${problems.join('\n  ')}`)
  return parsed.data
}
