# Voting

Vote compasses and live election results, served from a single
[PocketHost](https://pockethost.io/) instance at https://voting.lgtm.page.
It is the standalone successor of the voting app inside
[cubby.fyi](https://cubby.fyi): three elections so far (Vancouver 2026, BC
2026, Alberta 2026 referendum), four results-feed parsers, a two-axis compass
and election-night charts, plus a markdown and MCP surface for agents.

- Frontend: Vite + React + Tailwind CSS + shadcn/ui, built into `pb_public/`
- Backend: PocketBase (JS hooks + migrations) hosted on PocketHost

## Setup

```sh
pnpm install
cp .env.example .env
pnpm exec playwright install chromium webkit
```

Deploys use the [phio CLI](https://pockethost.io/docs/phio) (Node 24+):

```sh
npm install -g phio tsx
phio login
```

## Development

```sh
pnpm dev
```

The dev server talks to the PocketBase URL in `.env` (`VITE_POCKETBASE_URL`,
a local PocketBase on `127.0.0.1:8090` by default). A local PocketBase runner
arrives with the backend round.

## Deployment

CI deploys `main` to the `voting` instance (see `.phioconfig`) after the
validation job passes. By hand:

```sh
pnpm build
phio deploy
```

Hook and migration changes need a power cycle in the PocketHost dashboard
afterwards; see `AGENTS.md` for the other PocketHost rules.

## Scripts

| Script                     | What it does                                                 |
| -------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                 | Run the Vite dev server                                      |
| `pnpm build`               | Production build into `pb_public/`                           |
| `pnpm og`                  | Regenerate `public/og.png` and `public/apple-touch-icon.png` |
| `pnpm test`                | Unit tests (vitest)                                          |
| `pnpm test:e2e`            | Playwright e2e tests (desktop Chrome + mobile Safari)        |
| `pnpm typegen`             | Regenerate `src/lib/pocketbase-types.ts` from a live schema  |
| `pnpm validate:quick`      | format check + typecheck + lint + unit tests                 |
| `pnpm validate`            | `validate:quick` + e2e tests                                 |
| `pnpm format-and-validate` | Prettier write, then `validate` — run before commits         |
