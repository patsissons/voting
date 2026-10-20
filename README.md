# Voting

Vote compasses and live election results, served from a single
[PocketHost](https://pockethost.io/) instance at https://voting.lgtm.page.
It is the standalone successor of the voting app inside
[cubby.fyi](https://cubby.fyi): three elections so far (Vancouver 2026, BC
2026, the Alberta 2026 referendum), four results-feed parsers, a two-axis
compass, election-night charts, and a markdown and MCP surface for agents.

- Frontend: Vite + React + Tailwind CSS + shadcn/ui, built into `pb_public/`
- Backend: PocketBase (JS hooks + migrations) on PocketHost; the hook logic
  is TypeScript under `server/` and `shared/`, bundled by esbuild
- Elections are documents: `elections/<slug>.json`, validated by a zod
  schema and pushed into the database (`docs/new-vote.md`)

## Setup

```sh
pnpm install
pnpm exec playwright install chromium webkit
```

Deploys use the [phio CLI](https://pockethost.io/docs/phio) (Node 24+):

```sh
npm install -g phio tsx
phio login
```

## Development

```sh
pnpm dev            # local PocketBase on :8090 (downloaded into .pb/ once) + hooks watch build + Vite on :5173
pnpm dev -- --seed  # the same, after loading the election documents and a synthetic night per election
```

Vite proxies `/api`, `/_/`, `/mcp`, `/_voting`, `/llms.txt` and `/<slug>.md`
to the local PocketBase (admin UI at http://127.0.0.1:8090/_/, superuser
`local@voting.test` / `voting-local-dev`; ingest token `local-ingest-token`).
The OG rewrite on `/<slug>` only runs on the built app (Vite's SPA fallback
answers it in dev); `pnpm pb --e2e` serves the built app the way the
instance does.

## URLs

| URL                                | What it serves                                                             |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `/`                                | the index of published elections                                           |
| `/<slug>`                          | an election; `#/compass`, `#/compass/<code>` and `#/results` name the view |
| `/<slug>.md`                       | the election as markdown (also `Accept: text/markdown` on `/<slug>`)       |
| `/llms.txt`                        | the agent index                                                            |
| `POST /mcp`                        | a public, read-only MCP server (streamable HTTP, JSON-RPC)                 |
| `POST /_voting/ingest/{slug}`      | push a raw results document (bearer `VOTING_INGEST_TOKEN`; `?official=1`)  |
| `POST /_voting/source/{slug}?url=` | set or clear the page the server-side fetch pulls (bearer token)           |
| `GET /_voting/fetch`               | run one fetch tick (public; the election-night webhook target)             |

The hash grammar is frozen because cubby.fyi links 301 here:
`#/compass/<code>` is one character per question (`-` skipped, `0`-`9` the
option, `A`-`J` the option counted double), `/q<i>` or `/r<i>` mid-quiz.

## Deployment

CI deploys `main` to the `voting` instance (see `.phioconfig`) after the
validation job passes: `pnpm build` (Vite plus the hooks bundle), then
`phio deploy`. By hand:

```sh
pnpm build
phio deploy
```

CI power cycles the instance after each deploy so hook and migration changes
load; after a manual deploy, power cycle it in the PocketHost dashboard.
`AGENTS.md` has the other PocketHost rules. Election documents
need no deploy: `pnpm elections:push --url https://voting.pockethost.io`
with `PB_SUPERUSER_EMAIL` and `PB_SUPERUSER_PASSWORD` set.

## Scripts

| Script                     | What it does                                                                    |
| -------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                 | Local PocketBase + hooks watch build + Vite (`-- --seed` loads fixture data)    |
| `pnpm dev:web`             | Vite alone (against a PocketBase on :8090)                                      |
| `pnpm pb`                  | Local PocketBase alone (`--seed`; `--e2e` for a throwaway, seeded data dir)     |
| `pnpm build`               | Vite build into `pb_public/` and the hooks bundle into `pb_hooks/lib/voting.js` |
| `pnpm og`                  | Regenerate `public/og.png` and `public/apple-touch-icon.png`                    |
| `pnpm test`                | Unit tests (vitest): parsers, stats, schema, store, MCP, components             |
| `pnpm test:e2e`            | Playwright against the built app under a seeded local PocketBase                |
| `pnpm smoke`               | Hit the admin routes, the ingest and the public API of a running instance       |
| `pnpm elections:check`     | Validate `elections/*.json` (`--write` reformats)                               |
| `pnpm elections:push`      | Upsert the documents into an instance (`--local` or `--url` + superuser env)    |
| `pnpm new-vote`            | Scaffold a new election document (`docs/new-vote.md`)                           |
| `pnpm relay`               | The election-night relay (`--fixture` posts a synthetic night)                  |
| `pnpm data:export`         | Export the cubby.fyi elections and results (superuser env)                      |
| `pnpm data:transform`      | Transform an export into `elections/*.json` and `data/import/results.jsonl`     |
| `pnpm data:import`         | Import the transformed rows into an instance, idempotently                      |
| `pnpm typegen`             | Regenerate `src/lib/pocketbase-types.ts` from a live schema                     |
| `pnpm validate:quick`      | format check + typecheck + lint + election check + unit tests                   |
| `pnpm validate`            | `validate:quick` + e2e tests                                                    |
| `pnpm format-and-validate` | Prettier write, then `validate`: run before commits                             |

## Layout

```
elections/      the election documents (source of truth for config)
shared/         runtime-neutral TypeScript: schema, parsers, stats, permalinks
server/         hook logic (store, fetch, pages, markdown, MCP), bundled to pb_hooks/lib/voting.js
pb_hooks/       the committed one-line .pb.js files; lib/ is built
pb_migrations/  the two collections
src/            the React app
scripts/        local PocketBase, build, push, relay, data tooling, fixtures
e2e/            Playwright
```
