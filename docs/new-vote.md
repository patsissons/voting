# Adding an election

An election is one JSON document, `elections/<slug>.json`, pushed into the
`elections` collection with a script. No deploy, migration or restart is
needed to add or change one.

## 1. Scaffold

```sh
pnpm new-vote toronto-2026 --ballot at-large --title "Toronto Votes 2026" \
  --day 2026-10-26 --tz America/Toronto --place Toronto
```

`--ballot` picks the template under `scripts/templates/`:

| ballot       | what the voter does                          | compass tab           | default results format |
| ------------ | -------------------------------------------- | --------------------- | ---------------------- |
| `at-large`   | one city-wide ballot; parties run slates     | compass + ballot card | `vancouver`            |
| `district`   | one vote for one seat in the voter's riding  | compass + riding card | `ebc-enr`              |
| `referendum` | yes/no (or two-option) questions, no parties | the voter's ballot    | `eab-dash`             |
| `chambers`   | one seat per division, grouped by chamber    | none: results only    | `civicapi`             |

The scaffold fills the header (slug, title, voting day, polls-close time
with the zone's offset, eyebrow) and leaves `TODO` wherever the editorial
work goes. It writes the document with `published: false`.

## 2. Fill in the document

Every field is validated by `shared/schema/election.ts` (strict: unknown
keys fail) and cross-checked by `electionProblems` (dates in order, unique
ballot numbers, every riding's region known, one candidate per party per
riding, and so on). Run `pnpm elections:check` as you go; `--write`
reformats the file into the canonical compact layout.

What each ballot mode needs:

- **Common:** `description` (index card and link previews), `lede` and
  `intro` (above the compass), `dates` (advance days, final day, hours,
  mail-by, where-to-vote URL), `sources` (where positions came from) and
  `resources` (voter information links), `results` (below).
- **at-large:** `offices` (key, label, votes, a fact for the intro),
  `parties` with `color`/`colorDark`, `axis` (economic -1..1, social -1..1),
  `lean`, and slates per office as `[ballotNumber, name, sitting?]`; a party
  with no mayoral candidate can `endorsesMayor` another; `questions` with
  `opts[].pts` (0 to 3 per party key) and `axis`.
- **district:** `seats`, `majority`, `facts`, `parties` with `leader`,
  `leaderDistrict`, `candidates` (count), `affiliations` (the results
  page's party labels to party keys), `regions`, `districts` with `last`
  (last winner, pct, margin) and `candidates` as
  `[name, partyKey|null, sitting?, labelForIndependents?]`, and the same
  compass `questions`.
- **referendum:** `groups`, `questions` with `n` (the ballot number),
  `short`, the official `q`, two `options` with `match` patterns the parser
  uses to find the columns, `context`, `polls`; `pollNote`; optional
  `optionColors`.
- **chambers** (results only, no compass): `parties` with `color`/`colorDark`
  (no axis), `affiliations` (the feed's party labels to party keys; anything
  else stays under its own label), `regions` (the states: division codes are
  `<key>` or `<key>-<n>`), and `chambers`, each with `seats`, `majority`
  (omit for offices with no control line, like governors), `holdovers`
  (seats not up this year, per party), an optional `boundaries` set and
  `divisions` (the feed's region keys to short names; divisions plus
  holdovers equal `seats`). `us-2026`'s divisions were derived once from the
  three civicAPI documents with a throwaway script (House `<State> <n>` or
  `<State> at-large`, Senate and governors the state name); the keys do not
  change during a cycle.

Party colours are per election (`color`, `colorDark`), so a new election
never needs a stylesheet change.

District and referendum elections draw a results map when `boundaries`
names a set in `src/geo/` (`ab-2017`, `bc-2023`); a chambers election names
one per chamber (`us-cd120` for the House, `us-state` for the Senate and
the governors). The templates start with their province's set; delete the
key for a place without one. The set's division codes must be the results'
codes: `districts[].code` for a district election, the `results.divisions`
keys for Alberta's dashboard feed, and a chamber's `divisions` keys, which
may be a subset of the set (the state map serves 35 Senate races); a test
checks all three. Frame 0 of every set is keyed `province`, the whole area,
whatever the jurisdiction calls itself.
A new boundary set is an entry in `scripts/geo/build.ts` (its `inputs`,
one or several files merged into one layer, the field that becomes the
code, an optional `filter`, a `proj` for a long/lat source such as the
Census files, an optional `land` clip for divisions that run into the water
and a `presimplify` pass for a full-resolution source, the province frame
and the city insets), a key in `BOUNDARY_SETS` in `shared/schema/election.ts`,
then `pnpm geo`; commit the generated `src/geo/<set>.json`, never edit it by
hand. `us-cd120` merges the Census TIGER/Line file of every state (the
districts drawn for 2026 have no national file yet) and clips them to the
cartographic state shoreline.

## 3. Results

`results.format` names the feed parser in `shared/parsers/`:

| format      | source                                                                                 | server fetch |
| ----------- | -------------------------------------------------------------------------------------- | ------------ |
| `vancouver` | City of Vancouver `arearesults.json` (403 to non-browsers, so the relay drives Chrome) | no           |
| `ebc-enr`   | Elections BC election-night HTML page                                                  | yes          |
| `eab-ref`   | Elections Alberta per-question result pages                                            | yes          |
| `eab-dash`  | Elections Alberta results dashboard JSON                                               | yes          |
| `civicapi`  | civicAPI race documents, `https://civicapi.org/api/v2/race/<id>`, one per chamber      | yes          |

A new source needs a new parser: add `shared/parsers/<name>.ts` producing
the `Payload` shape in `shared/payload.ts`, a format in the schema's
`ResultsSchema`, a case in `normalize()`, a fixture night in
`scripts/fixtures/fixture.ts`, and tests. The views, markdown and MCP tools
read the payload, not the feed.

`serverFetch: true` lets the hooks pull the source themselves inside
`fetchHours` after `pollsClose` (every minute, throttled to
`throttleSeconds`), once `results_source` is set on the row. Size
`fetchHours` for the whole count, with room to spare: a hand count can run
days past the authority's estimate (Alberta's 2026 referendum said 48 hours
and was still reporting polls five days on), and once the window closes the
page freezes on its last snapshot, still saying "Counting". Extending it
later is a document change; the next fetch catches up to the feed's current
state, not the steps in between. For a
`civicapi` election the source is the base URL
(`https://civicapi.org/api/v2/race/`) and the fetch appends each id in
`results.races`, storing the chambers together or not at all:

```sh
curl -X POST -H "Authorization: Bearer $VOTING_INGEST_TOKEN" \
  "https://voting.lgtm.page/_voting/source/<slug>?url=<results page>"
```

`sourcePrefix` and `eventMatch` restrict what that URL may be. Without a
server fetch, run `pnpm relay --election <slug> --source <url>` on the
night; it posts each new snapshot to `/_voting/ingest/<slug>`.

### Early vote turnout (optional)

Before voting day, the results tab can show ballots cast so far instead of
an empty "No results yet". Add `earlyVote` to the results block; `format`
names the feed, and the counts land in the row's `early_vote` column (the
document only says where from). Once the first contests arrive the panel
folds into a section under the results, and the markdown table moves after
them; the MCP `earlyVoteTurnout` stays.

**`ufel-csv`** (the default): the UF Election Lab's per-state CSV, for an
election with `regions` (US states):

```json
"earlyVote": {
  "format": "ufel-csv",
  "source": "https://election.lab.ufl.edu/data-downloads/earlyvote/2026/US.csv",
  "page": { "label": "UF Election Lab, 2026 early voting", "url": "https://election.lab.ufl.edu/early-vote/2026-early-voting/" },
  "boundaries": "us-state"
}
```

The hooks pull the CSV (`shared/parsers/early-vote.ts` reads the UF
Election Lab's columns). The panel shows the totals, a turnout map (ballots
as a share of the 2022 count), and, for the states that register by party,
the Dem/GOP/other totals (all ballots, by mail, in person where reported), a
margin map of each state's lead and a bar per state. The margin map and the
totals take their colours and names from the document's first two
`parties`. After the merge, prime it with
`curl https://voting.lgtm.page/_voting/early-vote` and add a PocketHost
webhook on `GET https://voting.pockethost.io/_voting/early-vote?slug=<slug>`,
four times a day (`7 */6 * * *`), until the polls close (`slug` only names
the webhook; every call pulls every election with a source). The data is
CC BY-NC-ND 4.0: keep the credit link.

**`ebc-advance`**: Elections BC's advance voting turnout table, a PDF with a
row per riding (voters per advance voting day, the total, registered
voters), for a `district` election whose `districts[].code` are the ED
codes the table uses. `prior` is the same table for the last election, the
baseline for the "vs 2024" tile, the by-day comparison and the riding map:

```json
"earlyVote": {
  "format": "ebc-advance",
  "source": "https://elections.bc.ca/2026election/2026-advance-voting-turnout.pdf",
  "prior": { "source": "https://elections.bc.ca/2024election/2024-advance-voting-turnout.pdf", "label": "2024 advance voting" },
  "page": { "label": "Elections BC, advance voting turnout", "url": "https://elections.bc.ca/2026-provincial-election/" },
  "boundaries": "bc-2023"
}
```

The hooks cannot read a PDF, so this feed is pushed by
`pnpm early-vote:push`, which needs `pdftotext` (poppler). CI runs it with
`--all` after every deploy of main, so merging the document is enough; by
hand:

```sh
pnpm early-vote:push --election bc-2026 --dry-run          # parse and print
PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... pnpm early-vote:push --election bc-2026 --url https://voting.pockethost.io
```

It downloads both PDFs, parses the text (`shared/parsers/ebc-advance.ts`
checks that every riding's days sum to its total and the ridings to the
provincial total), and writes the column unless the counts and the PDF's
Last-Modified are unchanged (`--force` writes anyway; `--out` saves the
JSON; `--pdf`/`--prior-pdf` read local files). If Elections BC amends the
table, the next merge to main picks it up, or run the script by hand; the
pull tick skips the election.

## 4. Try it locally

```sh
pnpm dev -- --seed                      # PocketBase + Vite, documents and fixture nights loaded
pnpm elections:push --local             # push just the documents again after an edit
VOTING_INGEST_TOKEN=local-ingest-token pnpm relay --fixture --election <slug> --target http://127.0.0.1:8090
```

A fixture night exists per format, built from the election's own slates or
ridings, so a new election of an existing format gets a synthetic count
for free.

## 5. Publish

Set `"published": true` and merge to main: CI pushes the changed documents
after the deploy. To push without a merge:

```sh
PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... pnpm elections:push --url https://voting.pockethost.io
```

Either way, the page is live at `https://voting.lgtm.page/<slug>` immediately: the
index, the OG tags, the markdown page, `llms.txt` and the MCP tools all
read the row.

## Election night

1. Set the results source (above) once the source publishes its URL, or
   start the relay.
2. For a hibernating PocketHost instance, add a webhook that hits
   `GET https://voting.lgtm.page/_voting/fetch` every minute for the night
   (the route is public and idempotent), and delete it afterwards.
3. Watch `phio logs`; every stored snapshot logs one line.
4. After the official count: `pnpm relay --election <slug> --source <url> --official --once`,
   which marks winners (or referendum majorities) and stops the fetch. A
   `civicapi` election has no official step: its winners are the feed's race
   calls, so either leave it unofficial or run the same command once every
   race is called (it only sets the flag).

## Afterwards: an analysis (optional)

An Analysis tab is never part of setting up a vote. Once the count is in,
one can be written by hand for the election: a module under
`src/views/analysis/<slug>/` registered in `src/views/analysis/index.tsx`
(see the Analysis tabs note in `AGENTS.md`; `alberta-2026` and `bc-2026` are
the examples).
