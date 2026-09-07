# Development

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **≥ 20** | from `package.json` `engines` |
| pnpm | **11** (`pnpm@11.18.0`) | `corepack enable` will provide the pinned version |
| PostgreSQL | any recent | local, Docker, or a hosted instance (e.g. Supabase) |
| Playwright browsers | — | installed on demand for the test suites |

`node_modules` is intentionally not committed.

## Install

```bash
corepack enable
pnpm install
```

## Environment setup

Copy the templates and fill in real values. `.env*` files are gitignored (except
`.env.example`).

```bash
cp apps/operator/.env.example apps/operator/.env.local
cp apps/backend/.env.example  apps/backend/.env
```

### `apps/operator/.env.local`

| Variable | Required | Purpose |
|---|---|---|
| `AUTH_SECRET` | yes | Auth.js session signing/encryption. Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `DATABASE_URL` | yes (for anything DB‑backed) | PostgreSQL connection string (a pooled URL is fine for the runtime adapter) |
| `GEMINI_API_KEY`, `GEMINI_2_API_KEY`, `GEMINI_3_API_KEY`, `GEMINI_4_API_KEY` | for AURA text/image/TTS | Google Gemini. Each additional key becomes an independent routing endpoint; leave unset to skip. |
| `OPENROUTER_API_KEY`, `OPENROUTER_2_API_KEY` … `_4_` | for AURA text | OpenRouter |
| `GROQ_API_KEY`, `GROQ_2_API_KEY` … `_4_` | for AURA text + voice STT | Groq (chat + Whisper) |
| `GROQ_MODEL` | optional | overrides the model used only on the OpenRouter→Groq fallback path |

AURA runs without any provider key configured — endpoints just show as "not configured"
in the AURA Router panel and are skipped. Auth and the database are required for the app
to be usable.

### `apps/backend/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | pooled Postgres URL (kept here so schema tooling has a consistent value) |
| `DIRECT_URL` | direct (non‑pooled) Postgres URL — used by the Prisma CLI. For a single non‑pooled DB, set it to the same value as `DATABASE_URL`. |
| `PORT` | optional; only relevant if the dormant NestJS process is ever started |

## Database & Prisma

The schema and migrations live in `apps/backend/prisma/`. The generated client is written
into `apps/operator`.

```bash
# generate the client (run after any schema change)
pnpm --filter backend db:generate

# apply migrations (run from apps/backend so the CLI picks up prisma.config.ts)
cd apps/backend
npx prisma migrate deploy        # apply existing migrations
npx prisma migrate dev           # create + apply a new migration during development
npx prisma studio                # browse the database
```

### Local seed data (optional)

`apps/operator/scripts/` holds one‑off dev seed scripts (not part of any build/deploy).
Run from `apps/operator` with a working `DATABASE_URL`:

```bash
cd apps/operator
npx tsx scripts/seed-alerts.ts
npx tsx scripts/seed-sensors.ts
npx tsx scripts/seed-plots.ts
npx tsx scripts/seed-fleet.ts
npx tsx scripts/phase1-seed-farmer-admin.ts   # backfills roles / demo Farmer+Operator account
```

## Development commands

Run from the repository root unless noted. Turborepo fans commands out across workspaces.

| Command | What it does |
|---|---|
| `pnpm dev` | `turbo run dev` — starts the operator dev server (Next.js + Turbopack) on `http://localhost:3000` |
| `pnpm build` | `turbo run build` — builds every workspace |
| `pnpm lint` | `turbo run lint` |
| `pnpm type-check` | `turbo run type-check` (`tsc --noEmit` per workspace) |
| `pnpm format` | Prettier write across `**/*.{ts,tsx,js,jsx,json,md}` |
| `pnpm format:check` | Prettier check |
| `pnpm clean` | `turbo run clean` |

### Per‑workspace

```bash
pnpm --filter operator dev            # next dev --turbopack
pnpm --filter operator build          # next build --turbopack
pnpm --filter operator start          # serve a production build
pnpm --filter operator type-check
pnpm --filter operator test:e2e       # Playwright

pnpm --filter backend build           # nest build (produces apps/backend/dist — not deployed)
pnpm --filter backend db:generate     # prisma generate
pnpm --filter backend type-check
```

> `apps/backend` also carries `start`/`start:dev` and a Jest configuration from its
> scaffold. There are no backend tests, and the NestJS process is not part of running the
> product.

## Design system / Storybook

`packages/ui` (`@agrinexus/ui`) is shipped as raw TypeScript source. The operator app
transpiles it (`next.config.ts` → `transpilePackages`). Its components have Storybook
stories:

```bash
pnpm --filter @agrinexus/ui storybook          # dev server on :6006
pnpm --filter @agrinexus/ui build-storybook     # static build (output is gitignored)
```

## Testing

```bash
pnpm --filter operator exec playwright install   # one-time: browser binaries
pnpm --filter operator test:e2e                  # runs tests/security + tests/smoke + tests/urdu
```

The Playwright config starts a dev server via `npm run dev` and points at
`http://localhost:3000` (a single `chromium-secure` project). The `tests/urdu` suite makes
**real** provider calls, so those tests need the relevant `GEMINI_*` / `GROQ_*` keys and a
reachable database; a provider timeout is reported as a limitation rather than retried.

The `tests/security` suite enforces a fail‑closed localhost‑only network policy — no
external requests or downloads occur during a test run.

Co‑located `apps/operator/src/lib/aura/**/*.test.mts` are standalone `tsx` scripts with no
runner configured. Run one directly:

```bash
cd apps/operator
npx tsx src/lib/aura/voice/language-detection.test.mts
```

## Build / type‑check without a database

`pnpm --filter operator type-check` requires the generated Prisma client to exist
(`pnpm --filter backend db:generate` — which needs the schema, not a live database).
`pnpm build` additionally needs the app's environment to resolve. The dev server and the
`tests/urdu` suite need a reachable database and, for AURA, provider keys.
