# Security

An overview of the security posture actually implemented in this repository.

## Secret handling

- **Server‑only by construction.** Every module that touches a provider API key or the
  database URL begins with `import "server-only"` — the Prisma client, all
  `lib/**/*-service.ts`, `lib/weather/weather-provider.ts`, and every file under
  `lib/aura/providers/` and `lib/aura/router/`. If any is pulled into a client bundle the
  build fails.
- **No `NEXT_PUBLIC_` credentials.** Provider keys and `DATABASE_URL` are never prefixed
  for client exposure.
- **`.env` files are gitignored.** `.gitignore` ignores `.env` and `.env.*` and
  re‑includes only `.env.example`. The two `.env.example` files contain placeholder names
  and empty values, no real secrets.
- **Diagnostics never carry secrets.** `/api/aura/status` reports only whether each
  provider is reachable. Routing failure logs record each attempt's endpoint and reason —
  never a key, never a raw response body, never a message body. The AURA `AuraRouteEndpoint`
  table stores a credential **environment‑variable name**, never a key value; the key is
  read from `process.env` at request time.

## Authentication & access control

- **Auth.js v5** (`next-auth` 5 beta), **Credentials provider only**. Passwords are stored
  as **bcrypt hashes** on `User.passwordHash`; `lib/auth/user-source.ts` is the only
  module that reads them. A row created before a real hash is set defaults to an
  intentionally unmatchable placeholder — **fail‑closed**, never fail‑open. A `disabled`
  user is rejected at sign‑in.
- **Role model.** A user has a default `role` and a `roles: Role[]` authorized set
  (`admin` / `operator` / `farmer`); multi‑role accounts are supported.
- **Edge middleware RBAC.** `middleware.ts` runs a second, Edge‑safe Auth.js instance that
  verifies the session JWT without the Credentials provider or database, and gates
  sections:
  - Operator (unprefixed) routes → `admin` or `operator`
  - `/farmer/**` → `farmer`
  - `/admin/**` → `admin`
  - unauthenticated → `/login` (with `callbackUrl`); wrong role → `/unauthorized`.
- **Defense in depth.** API routes re‑check authorization themselves rather than trusting
  the section gate alone (e.g. `/api/admin/users` re‑verifies operator/admin;
  `/api/aura/router/**` re‑verifies operator/admin).
- **Farm scoping.** Every farm‑scoped query derives the farm from the authenticated
  session (`getFarmForSession` — owner‑based for admin/operator, via `FarmMembership` for
  farmer). The client never supplies a `farmId`. Cross‑tenant lookups return a
  non‑distinguishing 404 ("doesn't exist" and "not yours" look identical to an
  unauthorized caller).
- **AURA conversations** are scoped by **both** `userId` and `farmId` — stricter than the
  per‑farm boundary elsewhere — so two farmers on one farm cannot read each other's
  conversations.

## Input handling

- **Client‑supplied hints are re‑derived server‑side.** The AURA chat route recomputes the
  task category, context needs, and detected language from the actual message text — a
  client cannot spoof a larger‑than‑necessary context or force an incorrect answer
  language.
- **Image attachments are re‑validated server‑side** regardless of any client‑side check,
  before command parsing begins. Validation failures return pre‑written, farmer‑safe
  strings — never a raw provider error, a stack trace, or the image bytes. Image bytes are
  never logged.
- **Explicit language choice for image analysis** is validated server‑side against a
  fixed allowlist (`en` / `ur` and their full‑word spellings); anything else normalizes
  to "unset" and changes nothing.

## Test security harness

`apps/operator/tests/security/` enforces a **fail‑closed, localhost‑only network policy**
during Playwright runs (`localhost-policy.ts`):

- An **allowlist** of exactly two origins (`http://localhost:3000`,
  `http://127.0.0.1:3000`). Everything else — a different port, `https:`, `file:`,
  `data:`, `javascript:`, `ws:`/`wss:`, an unparseable string, any external domain — is
  denied. A `URL` parse failure is treated as "not allowed."
- A context‑wide route interceptor aborts any non‑allowed request **before** DNS or TCP,
  including redirect hops and popup navigations; a WebSocket handshake to a non‑local
  origin is closed immediately; downloads are cancelled; a `data:`/`blob:` navigation that
  bypasses the route layer is evicted back to `about:blank`.
- No external or malicious infrastructure is ever contacted; "external" test destinations
  use the reserved `example.invalid` domain or a locally‑fulfilled `page.route()`.
- Blocked URLs are recorded in `safeDescribe` form — method + host + path only, no
  headers, bodies, or cookies.
- Tests use only dedicated demo/test accounts; `.env` secrets are never read for test
  convenience.

There are 11 security tests plus application smoke checks.

## Database

- Prisma 7 with an explicit `@prisma/adapter-pg` driver adapter and `DATABASE_URL`
  (no implicit URL parsing).
- The Prisma CLI uses a separate `DIRECT_URL` (non‑pooled).
- Only `prisma migrate deploy` should run against a shared database.
- No raw SQL string interpolation in application code; all access is through the typed
  Prisma client and `*-service.ts` modules.

## Security headers

Beyond Next.js defaults, no custom security‑header configuration is present in
`next.config.ts` today. Adding CSP / HSTS / frame‑ancestors headers is a reasonable
hardening step for a real deployment and is noted as future work.

## Responsible disclosure

This repository is published for review and evaluation. If you believe you have found a
security issue, please report it privately to the maintainers rather than opening a public
issue, and allow reasonable time to respond before any disclosure. Do not include working
exploit code or step‑by‑step extraction paths in the initial report.
