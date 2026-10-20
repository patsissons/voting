# Agent Working Rules

Voting is a standalone PocketHost app: vote compasses and live election
results for Vancouver, British Columbia and Alberta, moving out of cubby.fyi to
https://voting.lgtm.page. The plan of record is in the user's
`~/.claude/plans/` (ask for the path); work lands as one PR per round.

## Before every commit

After making changes from a prompt and BEFORE committing:

1. Author new tests covering the changes being made.
2. Update any documentation affected by the changes (README.md, this file).
3. Run `pnpm format-and-validate` and repair any regressions in-line. This
   includes the Playwright e2e suite — never skip it; web apps regress on e2e
   easily. If a browser is missing, `pnpm exec playwright install chromium webkit`
   rather than skipping.

## Git conventions

- Start every round from a fresh `origin/main` (`git fetch origin`, fast-forward
  `main`, then branch) in the main working tree; no worktrees.
- Small, modular commits: one logical unit per commit.
- Never commit `.env`, `pb_data/`, `pb_public/` (Vite output), `pb_hooks/lib/`
  (bundled hooks), `.pb/` (local PocketBase) or `data/export/`.
- Commit messages are sentence-case summaries; conventional prefixes
  (`feat:`, `chore:`, `docs:`, `ci:`) are fine.

## Stack

- pnpm (version pinned in `packageManager`), TypeScript, React 19, Vite,
  Tailwind v4, shadcn/ui (add components with `pnpm dlx shadcn@latest add`),
  Geist via `@fontsource-variable/geist`, lucide icons.
- Vitest with globals OFF: tests import from `vitest`. `vitest.setup.ts`
  registers Testing Library `cleanup`, an in-memory `localStorage`, a
  `matchMedia` stub and a `ResizeObserver` stub; keep them.
- Playwright projects `desktop-chrome` and `mobile-safari` (iPhone 14) with
  reduced motion, against `vite dev` on port 5198.
- Prettier: no semicolons, single quotes. ESLint flat config with
  `eslint-config-prettier` last.

## Architecture

- **Frontend** (`src/`): a single-page app. The path names the election
  (`/<slug>`) and the hash names the view (`#/compass`, `#/compass/<code>`,
  `#/results`); the hash grammar is frozen because shared cubby.fyi links are
  301-redirected here and browsers carry the fragment. There is no router
  library: `src/lib/use-hash.ts` plus `location.pathname`.
- **Theme**: `src/lib/theme.ts` + `src/components/theme-toggle.tsx`; the
  visitor's choice is `localStorage` `voting:theme`, otherwise the system
  setting. `public/theme-init.js` applies it before first paint and mirrors the
  key, media query and `theme-color` values: change both together.
- **Backend**: PocketBase on PocketHost (instance `voting`, see `.phioconfig`).
  Schema lives in `pb_migrations/` (schema only, no seed rows). Server logic is
  TypeScript under `server/` and `shared/`, bundled by esbuild into
  `pb_hooks/lib/voting.js`; the committed `pb_hooks/*.pb.js` files are thin and
  `require` that bundle inside each handler. (Arrives in the backend round.)
- **Election config** is authored as `elections/<slug>.json`, validated by a
  zod schema in `shared/`, and pushed into the `elections.config` column with a
  script; the runtime reads the DB only. (Arrives in the shared-core round.)
- **OG tags**: `index.html` carries absolute `og:*` tags for the site;
  `pnpm og` regenerates `public/og.png` and `public/apple-touch-icon.png` from
  `scripts/og/render.ts` (never edit the PNGs by hand). A hook later rewrites
  the tags per election on `GET /<slug>`.
- The PocketBase client singleton is `src/lib/pocketbase.ts`
  (`VITE_POCKETBASE_URL` in dev, the page origin in production).

## PocketHost workflow

- CI deploys `main` with `phio deploy` after `pnpm validate` and `pnpm build`
  (secrets `PHIO_USERNAME`, `PHIO_PASSWORD`, base64 `PHIO_DEPLOY_KEY`,
  `PHIO_DEPLOY_KEY_PUB`). Locally: `phio login` once, then
  `pnpm build && phio deploy`.
- **phio never deletes remote files.** Removing a file needs a manual delete
  over SFTP (`ftp.pockethost.io:2222`); verify by content, not status code.
- **Hook and migration changes need a dashboard power cycle** after the
  deploy; static `pb_public` changes do not, but the CDN caches them for about
  4 hours (Vite's hashed asset names cover that; `index.html` itself can lag).
- Secrets (`VOTING_INGEST_TOKEN`) live in the dashboard and reach hooks via
  `$os.getenv`. Never hardcode them.
- The instance hibernates when idle. In-process cron is unreliable while it
  sleeps, so election-night fetching is also driven by a PocketHost webhook on
  `GET /_voting/fetch`, added for the night and deleted afterwards.
- PocketHost rate-limits `/api`: 50 requests per 10 s per IP and 1,000 per
  hour. Scripts that write many rows must pace themselves and honor
  `Retry-After`.

## JSVM constraints (hooks)

- `pb_hooks` runs in PocketBase's goja JSVM: no npm at runtime, no event loop,
  modules are cached until restart, every handler runs in its own context (so
  `require` inside the handler).
- Code under `shared/` and `server/` must stay goja-clean: no `async`/`await`
  or generators, no `Intl`, `toLocaleString`, `URL`, `fetch`, `TextEncoder`,
  `structuredClone` or `Array.prototype.at`. Target es2020 (optional chaining
  and `??` are fine). Browser-only formatting belongs in `src/`.
- Brace one-line `if (...) for (...)` bodies (goja syntax error). PocketBase
  filters have no unary `!`. Never register a route PocketBase already owns
  (`/api/health`): the instance panics at boot.
- Hooks bypass collection rules: every public read in a hook or MCP tool must
  filter `published = true` itself.
