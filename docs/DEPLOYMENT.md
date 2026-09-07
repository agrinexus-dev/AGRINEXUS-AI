# Deployment

> **No environment is currently live.** This describes how the application is structured
> to deploy, not an existing deployment.

## What deploys

Only **`apps/operator`**. It is a standard Next.js 15 App Router application — pages,
server components, and the HTTP API (Route Handlers) all in one deployable unit.

**`apps/backend` is not deployed.** It is a schema host (see
[`DATA-MODEL.md`](DATA-MODEL.md)); its `nest build` output (`apps/backend/dist`) is
gitignored and unused.

## Target platform

Any host that runs a Next.js App Router app with Node.js server functions. **Vercel** is
the natural fit (first‑party Next.js support, per‑route serverless functions, Edge
middleware). Self‑hosting via `next build` + `next start` behind a reverse proxy also
works.

In a monorepo deploy, point the platform at `apps/operator` as the project root (or set
the appropriate root/build settings) and install from the workspace root so
`@agrinexus/ui` and `@agrinexus/config` resolve.

## Prerequisites for a deploy

1. **A reachable PostgreSQL database.** The runtime uses the `@prisma/adapter-pg` driver
   adapter with `DATABASE_URL`; a pooled connection string (e.g. a Supabase pooler URL,
   transaction mode) works for the runtime.
2. **A generated Prisma client.** Run `pnpm --filter backend db:generate` as part of the
   build so `apps/operator/src/lib/prisma/generated` exists (it is gitignored). A typical
   build command:
   ```bash
   pnpm --filter backend db:generate && pnpm --filter operator build
   ```
3. **Applied migrations.** Run against the target database before or during release:
   ```bash
   cd apps/backend && npx prisma migrate deploy
   ```
   This uses `DIRECT_URL` (a direct, non‑pooled connection) via `prisma.config.ts`.
4. **Environment variables** set on the platform (below). Never commit real values.

## Environment variables

Server‑only. Placeholder names — see `apps/operator/.env.example` and
`apps/backend/.env.example` for the full list and inline notes.

### Required for `apps/operator`

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Auth.js session signing/encryption. Generate with `openssl rand -base64 32` or the Node one‑liner in `.env.example`. |
| `DATABASE_URL` | PostgreSQL connection string (pooled is fine). |

### Required for the build / migration step

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | as above |
| `DIRECT_URL` | direct (non‑pooled) connection for `prisma migrate deploy` |

### AURA providers (optional, feature‑gated)

| Variable(s) | Enables |
|---|---|
| `GEMINI_API_KEY` (+ `GEMINI_2_API_KEY` … `_4_`) | Gemini text / image / TTS |
| `OPENROUTER_API_KEY` (+ `_2_` … `_4_`) | OpenRouter text |
| `GROQ_API_KEY` (+ `_2_` … `_4_`) | Groq text + Whisper STT |
| `GROQ_MODEL` | optional model override for the fallback path |

Each additional numbered key becomes an independent routing endpoint. With no provider
keys, AURA's conversational features are unavailable but the rest of the app works.

### Not needed unless you run the dormant NestJS process

| Variable | Purpose |
|---|---|
| `PORT` | listen port for `nest start` (not part of the product) |

`NEXT_PUBLIC_`‑prefixed variables are **not** used for any credential — provider keys and
the database URL must never be exposed to the client.

## Deployment considerations

- **Prisma generate must run in the build.** The generated client is not committed, so a
  clean build environment needs `db:generate` before `next build`.
- **`server-only` modules.** The Prisma client, every `*-service.ts`, the weather
  provider, and all AURA provider code import `server-only`; the build fails if any of
  them end up in a client bundle. Keep new secret‑touching code server‑side.
- **Edge middleware.** `middleware.ts` runs on the Edge runtime and only needs the shared
  Auth.js config (it never touches the Credentials provider or the database).
- **Weather** uses Open‑Meteo and requires no key or signup; farm coordinates are resolved
  server‑side from the session.
- **Region / latency.** Put the deployment and the database in the same region; the
  serverless functions open Postgres connections per invocation (mitigated by the
  `globalThis` client cache in development and by a pooled `DATABASE_URL` in production).
- **Migrations vs. schema drift.** Only `prisma migrate deploy` should touch a shared
  database; `migrate dev` / `db push` are for local development.

## Rough first‑deploy checklist

1. Provision PostgreSQL; note the pooled and direct URLs.
2. Set `AUTH_SECRET`, `DATABASE_URL` (operator) and `DATABASE_URL`, `DIRECT_URL` (build).
3. Add whichever AURA provider keys you have.
4. Build: `pnpm --filter backend db:generate && pnpm --filter operator build`.
5. Migrate: `cd apps/backend && npx prisma migrate deploy`.
6. Create at least one user (via a seed script or directly) with an appropriate role.
7. Deploy `apps/operator`; verify `/login`, then a workspace, then AURA.
