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

Party colours are per election (`color`, `colorDark`), so a new election
never needs a stylesheet change.

District and referendum elections draw a results map when `boundaries`
names a set in `src/geo/` (`ab-2017`, `bc-2023`). The templates start with
their province's set; delete the key for a place without one. The set's division codes
must be the results' codes: `districts[].code` for a district election, the
`results.divisions` keys for Alberta's dashboard feed (a test checks both).
A new boundary set is an entry in `scripts/geo/build.ts` (its source, the
field that becomes the code, the province frame and the city insets), a
key in `BOUNDARY_SETS` in `shared/schema/election.ts`, then `pnpm geo`;
commit the generated `src/geo/<set>.json`, never edit it by hand.

## 3. Results

`results.format` names the feed parser in `shared/parsers/`:

| format      | source                                                                                 | server fetch |
| ----------- | -------------------------------------------------------------------------------------- | ------------ |
| `vancouver` | City of Vancouver `arearesults.json` (403 to non-browsers, so the relay drives Chrome) | no           |
| `ebc-enr`   | Elections BC election-night HTML page                                                  | yes          |
| `eab-ref`   | Elections Alberta per-question result pages                                            | yes          |
| `eab-dash`  | Elections Alberta results dashboard JSON                                               | yes          |

A new source needs a new parser: add `shared/parsers/<name>.ts` producing
the `Payload` shape in `shared/payload.ts`, a format in the schema's
`ResultsSchema`, a case in `normalize()`, a fixture night in
`scripts/fixtures/fixture.ts`, and tests. The views, markdown and MCP tools
read the payload, not the feed.

`serverFetch: true` lets the hooks pull the source themselves inside
`fetchHours` after `pollsClose` (every minute, throttled to
`throttleSeconds`), once `results_source` is set on the row:

```sh
curl -X POST -H "Authorization: Bearer $VOTING_INGEST_TOKEN" \
  "https://voting.lgtm.page/_voting/source/<slug>?url=<results page>"
```

`sourcePrefix` and `eventMatch` restrict what that URL may be. Without a
server fetch, run `pnpm relay --election <slug> --source <url>` on the
night; it posts each new snapshot to `/_voting/ingest/<slug>`.

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

Set `"published": true`, then:

```sh
PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... pnpm elections:push --url https://voting.pockethost.io
```

The page is live at `https://voting.lgtm.page/<slug>` immediately: the
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
   which marks winners (or referendum majorities) and stops the fetch.
