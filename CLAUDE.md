# Clinic Booking

A small app for booking medical appointments. It prevents overlaps per doctor and per patient, offers a form-based
booking flow, and includes a chat assistant that finds real free slots and books the one the user picks through the same
domain logic as the form. It's a pnpm workspace with two deployables: `backend/` (API) and `frontend/` (SPA).

## Stack

- **Backend:** Node 24, TypeScript, Fastify 5 + `fastify-type-provider-zod`, zod 4, Drizzle ORM + better-sqlite3,
  Vercel AI SDK via AI Gateway. Built with tsdown, run in dev with tsx, tested with Vitest + `app.inject()`.
- **Frontend:** Vite + React 19, Tailwind v4, shadcn/ui, TanStack Query + TanStack Form. Tested with Vitest, Testing
  Library and jsdom.
- **Tooling:** pnpm 12 (`minimumReleaseAge: 2880`), Biome (one root `biome.jsonc`), GitHub Actions.

## Commands

```bash
pnpm dev            # backend :3000, frontend :5173 (proxies /api to the backend)
pnpm lint           # biome check .
pnpm lint:fix       # biome check --write .
pnpm typecheck
pnpm test
pnpm build
docker compose up --build
```

## Conventions

- Import from `src/` with the `~` alias (`~/routes/health`, `~/components/ui/button`), never `../../`.
- Biome style: tabs, line width 120, single quotes, arrow parentheses only when needed. Run `pnpm lint:fix` after any
  generator (`shadcn add`, …).
- Domain rules live in `backend/src/domain`. Every appointment write goes through `createAppointment()`, for both the
  form and the assistant.
- Tests sit next to the code as `*.test.ts` / `*.test.tsx`.

## Docs

The shared contract (decisions, domain, API, layout) is in [`docs/PLAN.md`](docs/PLAN.md). Implementation is split into
ordered specs in [`docs/specs/`](docs/specs).
