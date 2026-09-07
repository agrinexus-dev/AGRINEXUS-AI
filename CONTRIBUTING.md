# Contributing to AgriNexus AI

Thanks for taking a look. These are the conventions the codebase follows; they exist to
keep it consistent as it grows.

## Repository layout

```
apps/operator/     the product — Operator + Farmer + the HTTP API
apps/backend/      NestJS scaffold; hosts prisma/schema.prisma + migrations only
packages/ui/       @agrinexus/ui design system + Storybook
packages/config/   shared tsconfig / eslint / prettier
docs/              project documentation
```

New folders live within this structure, not as new top‑level siblings, unless there is a
deliberate architectural reason. Folder names are lowercase `kebab-case`
(`digital-twin`, `mock-data`) and describe *what* they contain, not *how*.

## Getting set up

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for prerequisites, install, environment
setup, database/Prisma, Storybook, and test commands.

## Code conventions

- **TypeScript everywhere.** Source files follow their framework's naming ecosystem,
  applied consistently within each package.
- **Server‑only code** (anything touching a secret or the database) must
  `import "server-only"`. Do not add secret‑touching logic to client components.
- **State** goes through the domain's single Zustand store; UI does not keep private
  copies of farm state.
- **Reasoning is separated from action.** Operational mutations run through the
  deterministic command / action layer, never through a language model.
- **Reuse before adding.** Check `packages/ui` before creating a new component. Shared
  behavior belongs in `packages/`, never duplicated across `apps/`.
- Match the design language in [`docs/PRODUCT.md`](docs/PRODUCT.md) (the "Design language"
  section). State is never communicated by color alone; the Farmer surface re‑values
  shared tokens rather than forking the design system.

## Branches & commits

```
feature/<short-description>   fix/<short-description>   docs/<short-description>
chore/<short-description>     refactor/<short-description>   test/<short-description>
```

Commits follow Conventional Commits — `<type>(<optional scope>): <summary>` — and describe
intent, not a narration of the diff. Keep each commit a coherent, reviewable unit.

## Pull requests

- Every change is reviewed before merging; no direct commits to the default branch.
- Reviewers evaluate correctness, fit with the architecture and design principles, and
  long‑term maintainability — not just "does it work".
- Keep changes scoped and reviewable; split large, unrelated changes.
- Address or explicitly discuss feedback before merge.

## Documentation

- A change to the architecture, data model, or AURA behavior updates the corresponding
  file under `docs/` in the same PR.
- Documentation describes the **current** implementation. Planned or future capabilities
  are labelled as such — never presented as implemented.
- No internal milestone / task / audit terminology in code comments or docs.

## Tests

- Playwright suites live in `apps/operator/tests/` (`security` / `smoke` / `urdu`).
- The security suite must stay fail‑closed (localhost‑only network policy); do not add
  tests that reach external services.
- Prefer testing through the real user flow over calling internal endpoints directly.
