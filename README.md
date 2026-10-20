# voting

A [PocketHost](https://pockethost.io/)-backed web app scaffolded with `ph create`.

- Frontend: Vite + React + Tailwind CSS + shadcn/ui
- Backend: [PocketBase](https://pocketbase.io/) hosted on PocketHost

## Setup

```sh
pnpm install
cp .env.example .env
```

Backend syncing/deployment uses the [phio CLI](https://pockethost.io/docs/phio) (requires Node 24+):

```sh
npm install -g phio tsx
phio login
```

For e2e tests, install the Playwright browser once:

```sh
pnpm exec playwright install chromium
```

## Development

```sh
pnpm dev
```

The dev server talks to the PocketBase URL in your `.env`. Backend files (`pb_migrations/`, `pb_hooks/`) sync to your instance with `phio dev` (watch mode).

## Deployment

The production build outputs to `pb_public/`, which PocketBase serves directly:

```sh
pnpm build
phio deploy
```

Link an instance first with `phio link <instance-name>` (create one at [pockethost.io/instances/new](https://pockethost.io/instances/new)).

## Schema & types

- Evolve the schema by adding files to `pb_migrations/` — they run automatically when the instance restarts (and locally on `pocketbase serve`).
- Regenerate TypeScript types from the live schema:

```sh
PB_TYPEGEN_URL=http://127.0.0.1:8090 PB_TYPEGEN_EMAIL=<admin-email> PB_TYPEGEN_PASSWORD=<admin-password> pnpm typegen
```

The admin account is your pockethost.io login (PocketHost Admin Sync provisions it automatically).

## CI

`.github/workflows/ci.yml` runs `pnpm validate` on every push and pull request.

## Scripts

| Script                     | What it does                                         |
| -------------------------- | ---------------------------------------------------- |
| `pnpm dev`                 | Run the dev server                                   |
| `pnpm build`               | Production build into `pb_public/`                   |
| `pnpm test`                | Unit tests (vitest)                                  |
| `pnpm test:e2e`            | Playwright e2e tests                                 |
| `pnpm typegen`             | Regenerate the PocketBase record types from schema   |
| `pnpm validate:quick`      | format check + typecheck + lint + unit tests         |
| `pnpm validate`            | `validate:quick` + e2e tests                         |
| `pnpm format-and-validate` | Prettier write, then `validate` — run before commits |
