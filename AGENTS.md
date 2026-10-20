# Agent Working Rules

## Before every commit

After making changes from a prompt and BEFORE committing:

1. Author new tests covering the changes being made.
2. Update any documentation affected by the changes (README.md, this file).
3. Run `pnpm format-and-validate` and repair any regressions in-line. This includes the Playwright e2e suite — never skip it; web apps regress on e2e easily.

If Playwright's browser is missing, install it with `pnpm exec playwright install chromium` rather than skipping e2e.

## Git conventions

- Small, modular commits: one logical unit per commit.
- Never commit `.env`, `pb_data/`, or `pb_public/` (build artifact).

## Architecture

- **Frontend**: Vite + React SPA. The production build outputs to `pb_public/`, which PocketBase serves directly (with `index.html` fallback for client-side routing).
- **Backend**: PocketBase hosted on PocketHost. There is no custom server — server-side logic lives in `pb_hooks/` (PocketBase JSVM) and schema in `pb_migrations/`.
- The PocketBase client singleton is `src/lib/pocketbase.ts`; generated record types are `src/lib/pocketbase-types.ts`.
- UI primitives live at `src/components/ui/` (button, input, label, card). Pages import from there — keep that contract if you add or swap components.

## PocketHost workflow

phio is the PocketHost CLI (`npm install -g phio tsx`; requires Node 24+ — phio's launcher needs a global tsx).

- `phio dev` — watch-sync `pb_*` files to the instance while developing.
- `pnpm build && phio deploy` — build and deploy.
- `phio logs` — stream instance logs.
- Schema changes go in `pb_migrations/` (auto-run on instance restart). After schema changes, run `pnpm typegen` (needs `PB_TYPEGEN_URL`, `PB_TYPEGEN_EMAIL`, `PB_TYPEGEN_PASSWORD` env vars) and commit the regenerated types.
- Secrets (OAuth client IDs, API keys) belong in the PocketHost dashboard (Secrets), surfaced to hooks/migrations via `$os.getenv(...)`. Never hardcode them.
- CI deploys use `PHIO_USERNAME`, `PHIO_PASSWORD`, `PHIO_INSTANCE_NAME` env vars with `phio deploy`.

## Constraints

- PocketHost serves only static files (`pb_public/`), hooks (`pb_hooks/`), and migrations (`pb_migrations/`) — no custom server processes. Don't add SSR or API routes that assume a Node server.
- `pb_hooks/` runs in PocketBase's JSVM (ES5-ish + PocketBase globals, no npm imports). Keep hooks dependency-free.
