# Agent Working Rules

Voting is a standalone PocketHost app: vote compasses and live election
results, moving out of cubby.fyi to https://voting.lgtm.page. The plan of
record is in the user's `~/.claude/plans/` (ask for the path); work lands as
one PR per round.

## Before every commit

After making changes from a prompt and BEFORE committing:

1. Author new tests covering the changes being made.
2. Update any documentation affected by the changes (README.md, this file,
   `docs/new-vote.md`).
3. Run `pnpm format-and-validate` and repair any regressions in-line. This
   includes the Playwright e2e suite — never skip it; web apps regress on e2e
   easily. If a browser is missing, `pnpm exec playwright install chromium webkit`
   rather than skipping. The e2e run needs port 8090 free (stop `pnpm dev`).

## Git conventions

- Start every round from a fresh `origin/main` (`git fetch origin`, fast-forward
  `main`, then branch) in the main working tree; no worktrees.
- Small, modular commits: one logical unit per commit.
- Never commit `.env`, `pb_data/`, `pb_public/` (Vite output), `pb_hooks/lib/`
  (bundled hooks) or `.pb/` (local PocketBase).
- Commit messages are sentence-case summaries; conventional prefixes
  (`feat:`, `chore:`, `docs:`, `ci:`) are fine.

## Stack

- pnpm (version pinned in `packageManager`), TypeScript, React 19, Vite,
  Tailwind v4, shadcn/ui (add components with `pnpm dlx shadcn@latest add`,
  then point their `cn` import at `@/lib/utils`), Geist via
  `@fontsource-variable/geist`, lucide icons, zod (Node and browser only).
- Node runs the scripts unbundled (type stripping), so relative imports in
  `shared/`, `server/` and `scripts/` carry `.ts` extensions (lint enforces).
- Vitest with globals OFF: tests import from `vitest`. `vitest.setup.ts`
  registers Testing Library `cleanup`, an in-memory `localStorage`, and
  `matchMedia`, `ResizeObserver`, `IntersectionObserver` and `scrollIntoView`
  stubs; keep them. Component tests give charts a width by redefining
  `clientWidth`.
- Playwright projects `desktop-chrome` and `mobile-safari` (iPhone 14) with
  reduced motion, against the built app served by `scripts/pb.ts --e2e`
  (a throwaway data dir seeded from `elections/*.json` and the fixture nights).
- Prettier: no semicolons, single quotes. ESLint flat config with
  `eslint-config-prettier` last; the React hooks rules forbid setState in
  effect bodies and ref reads during render (key state by its input instead).

## Architecture

- **Election documents** (`elections/<slug>.json`): the source of truth for
  everything but results. `shared/schema/election.ts` is strict (zod) with
  cross-checks in `electionProblems`; `pnpm elections:check` validates and
  `--write` canonicalizes the compact layout (`scripts/lib/json.ts`; the
  directory is in `.prettierignore`). The row columns (slug, title,
  description, voting_day, published, ballot) split off in
  `shared/election-row.ts`; everything else is the `config` column.
  `pnpm elections:push` upserts by slug; CI runs it against production after
  the deploy when a merge to main changes `elections/`, so merging a document
  change makes it live. New elections: `docs/new-vote.md`.
- **Shared code** (`shared/`): parsers (one per feed format; the cubby-era
  ones deep-equal cubby's output: `scripts/fixtures/golden/payloads.json`),
  stats for the four ballot modes, the compass scoring and ballot/riding cards, the
  frozen hash grammar (`permalink.ts`), the fetch policy, hand-rolled
  formatting. No DOM, no Node, no Intl: `tsconfig.server.json` typechecks it
  without the DOM lib and eslint restricts the globals.
- **Hooks** (`server/`): one `Db` interface (`db.ts`) with a PocketBase
  implementation and an in-memory one for tests. `store.ts` is the only
  writer of `results`; a new row strips the previous one's detail
  (`stripDetail` is format-aware: referendum division rows, every contest
  of a civicapi row) so the history the page loads stays small. `routes.ts` (ingest, source, fetch), `pages.ts`
  (`GET /{slug}`, markdown, `llms.txt`), `mcp/` (rpc core, tools, serve).
  `scripts/build-hooks.ts` bundles `server/lib.ts` into
  `pb_hooks/lib/voting.js`; the committed `pb_hooks/*.pb.js` are one-line
  requires. Every public read in a hook filters `published = true` itself.
- **Frontend** (`src/`): no router. `App.tsx` reads the slug from the path;
  `src/lib/use-hash.ts` tracks the hash. `views/election-page.tsx` owns the
  tabs and the compass/ballot state the results view needs; the compass
  (`views/compass/`), the referendum ballot (`views/ballot/`) and the four
  results views (`views/results/`) sit on the shared stats. A `chambers`
  election (results only, e.g. `us-2026`) shows no tabs and always carries
  `#/results`. Charts are `components/charts/` (one tooltip context,
  `useMeasure` for width).
- **Results maps**: `pnpm geo` (`scripts/geo/build.ts`, mapshaper) turns the
  official boundary files into `src/geo/<set>.json` (generated and
  committed; never edit by hand; sources cached in the ignored
  `.geo-cache/`): a `province` frame (the whole area) plus city insets, one
  projected SVG path per division code (the Census files are projected with
  Albers USA on the way). An election opts in with `boundaries`, a
  chambers election per chamber. The geometry
  loads lazily into its own hashed chunk (`components/charts/choropleth.tsx`).
  Fills blend the choice colours with nested CSS `color-mix` over the page
  tokens (`src/lib/blend.ts`) using `shared/stats/blend.ts`, which cubes the
  shares and holds a sole leader at 75% or more so it reads first.
- **Theme**: `src/lib/theme.ts` + `src/components/theme-toggle.tsx`; the
  visitor's choice is `localStorage` `voting:theme`, otherwise the system
  setting. `public/theme-init.js` applies it before first paint and mirrors the
  key, media query and `theme-color` values: change both together. Party
  colours come from each election document (`src/lib/party.ts` emits
  `--party-<key>` tokens, light and dark, scoped to the page).
- **localStorage keys** are cubby's and must stay: `voting:<slug>:compass`,
  `:district`, `:omit`, `:ballot`, `:ed`. The origins differ, so cubby's
  values move in the hash: answers and ballot marks in the permalink, the
  rest in an import link, `#/compass/import/<rest>?d=<riding>&o=<n,n>&e=<division>`
  (`parseImport` in `shared/permalink.ts`, `consumeImport` in
  `src/lib/storage.ts`), which stores them and becomes the plain permalink.
- **OG tags**: `index.html` carries absolute `og:*` tags for the site;
  `pnpm og` regenerates `public/og.png` and `public/apple-touch-icon.png` from
  `scripts/og/render.ts` (never edit the PNGs by hand). `server/pages.ts`
  rewrites the tags per election on `GET /<slug>`; `server/pages.test.ts`
  pins the tags the rewrite targets.
- The PocketBase client singleton is `src/lib/pocketbase.ts`
  (`VITE_POCKETBASE_URL` in dev, the page origin in production).

## PocketHost workflow

- CI deploys `main` with `phio deploy` after `pnpm validate` and `pnpm build`
  (secrets `PHIO_USERNAME`, `PHIO_PASSWORD`, base64 `PHIO_DEPLOY_KEY`,
  `PHIO_DEPLOY_KEY_PUB`). Locally: `phio login` once, then
  `pnpm build && phio deploy`.
- **phio never deletes remote files.** Removing a file needs a manual delete
  over SFTP (`ftp.pockethost.io:2222`); verify by content, not status code.
- **Hook and migration changes need a power cycle** after the deploy. CI does
  it after every deploy (mothership `PUT /api/instance/{id}`, then a health
  poll); a manual `phio deploy` needs one from the dashboard. Static
  `pb_public` changes need none, but the CDN caches them for about
  4 hours (Vite's hashed asset names cover that; `index.html` itself can lag).
- Secrets (`VOTING_INGEST_TOKEN`) live in the dashboard and reach hooks via
  `$os.getenv`. Never hardcode them.
- The instance hibernates when idle. In-process cron is unreliable while it
  sleeps, so election-night fetching is also driven by a PocketHost webhook on
  `GET /_voting/fetch`, added for the night and deleted afterwards.
- **Early vote**: an election whose results block has `earlyVote` (a CSV
  source, the page to credit, a map set) gets its turnout pulled by
  `server/early-vote.ts` into the row's `early_vote` column (hidden
  `early_vote_checked` / `early_vote_error` hold the pull state), never
  into `config`, which `elections:push` rewrites whole. Triggers: a cron
  four times a day (`7 */6 * * *`) and a PocketHost webhook on
  `GET /_voting/early-vote?slug=<slug>` (on the same schedule, from when
  early voting opens until polls close; delete it after). As with the fetch
  webhook, `slug` only tells webhooks apart: every call pulls every election
  with an early vote source. us-2026's webhook is live (2026-10-23). At most one
  pull per election per 15 minutes; a failed pull keeps the last counts.
  Each state keeps its ballots cast, the in-person/mail split and, where the
  state registers by party, `party`, `partyMail` and `partyInPerson`
  (dem/gop/other). The waiting screen, the markdown page and the MCP tools
  show it until the first contests arrive: totals, a one-hue turnout map
  (share of 2022), the party registration summed over the reporting states
  (`partyTotals` in `shared/stats/early-vote.ts`, also in the markdown
  paragraph and the MCP `earlyVoteTurnout.partyTotals`), and a diverging
  margin map (`partyMargin`, `marginStep`: grey within 5 points, three bands
  a side, hatched where a state does not register by party).
- PocketHost rate-limits `/api`: 50 requests per 10 s per IP and 1,000 per
  hour. Scripts that write many rows pace themselves and honor `Retry-After`
  (`scripts/lib/pb-client.ts`).

## Election-night runbook

1. Source known: `curl -X POST -H "Authorization: Bearer $VOTING_INGEST_TOKEN"
"https://voting.lgtm.page/_voting/source/<slug>?url=<page>"` (the document's
   `sourcePrefix` and `eventMatch` gate it). Vancouver has no server fetch:
   run `pnpm relay --election vancouver-2026` (drives Chrome) instead.
2. Add the PocketHost webhook on `GET /_voting/fetch?slug=<slug>` for the
   night; delete it after. PocketHost allows one webhook per route, so the
   `slug` param only tells them apart: every call checks every election
   with a source.
3. `phio logs`: every stored snapshot logs `[voting] <slug> snapshot ...`;
   `GET /_voting/fetch` answers with per-election outcomes. If the server
   fetch keeps failing, `pnpm relay --election <slug> --source <url>` pushes
   from a laptop instead.
4. Official count: `pnpm relay --election <slug> --source <url> --official --once`.
   `us-2026` (civicAPI, three race documents per fetch) has no official
   step: the winners are civicAPI's calls. Its source is the base URL,
   `POST /_voting/source/us-2026?url=https://civicapi.org/api/v2/race/`;
   the fetch starts at pollsClose (23:00 UTC Nov 3) and runs 96 hours, so
   the webhook `GET /_voting/fetch?slug=us-2026` should cover at least
   23:00 UTC Nov 3 to 06:00 UTC Nov 4 (Alaska closes), ideally the window.
5. This instance is the system of record for every election; cubby.fyi
   ingests nothing. Alberta moved here on 2026-10-20 (cubby's source
   cleared, then a last sync) and BC night runs only here. The one-off
   export/import tooling is gone; cubby's final export is kept, unpublished,
   as the `cubby-archive-2026-10-20` draft release.

## JSVM constraints (hooks)

- `pb_hooks` runs in PocketBase's goja JSVM: no npm at runtime, no event loop,
  modules are cached until restart, every handler runs in its own context (so
  `require` inside the handler).
- Code under `shared/` and `server/` must stay goja-clean: no `async`/`await`
  or generators, no `Intl`, `toLocaleString`, `URL`, `fetch`, `TextEncoder`,
  `structuredClone`, `Array.prototype.at` or `replaceAll`. Target es2020
  (optional chaining and `??` are fine). Browser-only formatting belongs in
  `src/`. The esbuild plugin refuses npm imports in the bundle.
- Brace one-line `if (...) for (...)` bodies (goja syntax error). PocketBase
  filters have no unary `!`. Never register a route PocketBase already owns
  (`/api/health`): the instance panics at boot. Only `GET /{slug}` is
  registered for pages, never `GET /` or `GET /{slug}/`.
- Hooks bypass collection rules: every public read in a hook or MCP tool must
  filter `published = true` itself.
- JSON columns read back through `getString` + `JSON.parse`, and the API
  returns them with sorted keys (compare with `stableJson`).
