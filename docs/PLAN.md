# Clinic Booking — roadmap

A small, self-contained app for booking medical appointments.

- **Overlap prevention** per doctor and per patient.
- **Form-based booking** flow.
- **Chat assistant** ("dermatologist next Tuesday afternoon"): an LLM uses tools to find real free slots, the user picks
  one, and the assistant books it through the same domain logic the form uses.
- The whole system starts with `docker compose up` (migrations and seed included). CI runs on push/PR, and container
  images are published on merge to `main` and on version tags.

This document is the shared contract. The work itself is split into specs under [`docs/specs/`](./specs), executed in order.

## Decisions

| Area | Choice | Why |
|---|---|---|
| Repo | pnpm 12 workspace monorepo: `backend/`, `frontend/` | Two deployables, one lockfile, one CI |
| Backend | Node 24 + TypeScript, **Fastify 5** + `fastify-type-provider-zod` | `app.inject()` route tests without a running server; zod schemas are the single source for validation and types; pino logging built in |
| DB | SQLite via **better-sqlite3** + **Drizzle ORM 0.45** (stable line) + drizzle-kit migrations (committed SQL) | Zero-ops database; better-sqlite3 ships prebuilt binaries (no compiler in Docker) and gives synchronous `IMMEDIATE` transactions for race-free booking |
| Validation | zod 4 everywhere (env, request bodies, AI output, frontend forms) | One schema library |
| AI | Vercel **AI SDK 7** through **AI Gateway**; model id from env, default `anthropic/claude-haiku-5.5` | Provider-agnostic; the model can be swapped with `AI_MODEL` |
| Frontend | Vite 8 + React 19 + TypeScript + Tailwind v4 + shadcn/ui; **TanStack Query** (server state) + **TanStack Form** (forms) | No global state library: Query and Form cover all state. No router: it's a single page |
| Dev networking | Vite dev server proxies `/api` → `localhost:3000`; nginx does the same in Docker | Same-origin everywhere, so no CORS configuration |
| Lint/format | **Biome** (latest, pinned exactly), one root `biome.jsonc` | One fast tool for lint + format across both packages |
| Aliases | `~/*` → `src/*` in both packages | No `../../` imports |
| Tests | Vitest in both packages; Testing Library + jsdom in the frontend | Critical paths only |
| Containers | One Dockerfile per package; compose runs a one-shot `migrate` service → `api` → `web` (nginx) | Migrations and seed are explicit, ordered steps |
| CI/CD | `ci.yml` (lint, typecheck, test, build) on push/PR; `docker.yml` builds images on PR and pushes to **GHCR** on `main` and `v*` tags | GHCR only needs the built-in `GITHUB_TOKEN` |
| Supply chain | `minimumReleaseAge: 2880` (2 days) in `pnpm-workspace.yaml` | Freshly published (possibly compromised) versions are never installed |

## Repo layout

```
.
├─ backend/
│  ├─ src/
│  │  ├─ index.ts              # boot: read config, open db, buildApp(), listen
│  │  ├─ app.ts                # buildApp({ db, config, model, now }) — Fastify + zod type provider, routes under /api, error handler
│  │  ├─ config.ts             # zod-parsed env
│  │  ├─ db/                   # schema.ts, client.ts, migrate.ts (migrations + seed), seed.ts
│  │  ├─ domain/               # time.ts, availability.ts, appointments.ts, errors.ts
│  │  ├─ routes/               # health.ts, doctors.ts, appointments.ts, assistant.ts
│  │  └─ ai/                   # assistant.ts, tools.ts, prompt.ts, schemas.ts
│  ├─ drizzle/                 # generated migrations (committed)
│  └─ drizzle.config.ts  tsconfig.json  tsdown.config.ts  vitest.config.ts  Dockerfile
├─ frontend/
│  ├─ src/
│  │  ├─ main.tsx  App.tsx  index.css
│  │  ├─ lib/                  # api.ts, queries.ts, format.ts, utils.ts
│  │  ├─ components/ui/        # shadcn (generated)
│  │  └─ features/             # booking/ (BookingForm, SlotPicker, AppointmentList), assistant/ (AssistantPanel)
│  └─ components.json  vite.config.ts  nginx.conf  Dockerfile
├─ .github/workflows/          # ci.yml, docker.yml
├─ docker-compose.yml  biome.jsonc  pnpm-workspace.yaml  package.json  .node-version  .env.example
└─ README.md  CLAUDE.md  docs/
```

## Domain

**Tables**
- `doctors`: `id`, `name`, `specialty`, `work_start_minute`, `work_end_minute` (e.g. 540–1020 = 09:00–17:00), working Mon–Fri.
- `appointments`: `id`, `doctor_id` (FK), `patient_name`, `patient_email`, `starts_at`, `ends_at` (UTC epoch ms),
  `reason` (nullable), `status` (`scheduled | cancelled`), `created_at`. Index on `(doctor_id, starts_at)`.

**Rules.** These live in `domain/appointments.ts`, the single write path for both the form and the assistant.
1. Duration ∈ {15, 30, 45, 60}; start on a 15-minute boundary; must be in the future.
2. Inside the doctor's working hours on a weekday, evaluated in `CLINIC_TIMEZONE`. Otherwise **422**.
3. No overlap with the same doctor's scheduled appointments. Otherwise **409**, with `suggestions` (next free slots).
4. No overlap with the same patient's (by email) scheduled appointments with any doctor. Otherwise **409**.
5. Overlap means `a.start < b.end && a.end > b.start`, so back-to-back appointments are allowed.
6. The check and the insert run in one `IMMEDIATE` transaction, so concurrent requests can't double-book.
7. Cancelling sets `status = cancelled`, and the slot becomes free.

**Timezones.** The API accepts clinic-local `date` (`YYYY-MM-DD`) and `startTime` (`HH:mm`), and the backend converts them to UTC with `@date-fns/tz`.
Responses carry ISO UTC timestamps, which the frontend formats with `Intl` in the clinic timezone from `/api/config`. All
timezone math lives in `backend/src/domain/time.ts`. Default: `CLINIC_TIMEZONE=America/Argentina/Buenos_Aires`.

**Seed.** Idempotent: skipped if doctors already exist. It creates 4 doctors (General Practice, Dermatology, Cardiology, Pediatrics) and
about 6 appointments over the next few weekdays, relative to "now".

## API (`/api`)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok: true }`, used by the compose healthcheck |
| GET | `/config` | `{ clinicTimezone, aiEnabled }`; the frontend hides the assistant when AI is disabled |
| GET | `/doctors` | list |
| GET | `/doctors/:id/availability?date&duration` | free slots (shared by the form, the 409 suggestions and the AI tool) |
| GET | `/appointments?doctorId&from&to` | upcoming scheduled appointments |
| POST | `/appointments` | 201 / 400 / 409 (+ `suggestions`) / 422 |
| POST | `/appointments/:id/cancel` | 200 / 404 |
| POST | `/assistant/chat` | `{ messages, patient, selection? }` → `{ message, slots?, appointment? }`; 503 if AI is not configured |

## AI assistant (chat → pick a slot → assistant books it)

**Flow**
1. The user types a request. The model uses `listDoctors` / `findAvailableSlots` and answers with a short message plus
   **slot options**, rendered as clickable cards.
2. The user clicks a card. The client sends it as a user message ("Book Dr. X, Tue 3 Nov 14:30, 30 min") **plus** a
   structured `selection` (`{ doctorId, date, startTime, durationMinutes }`).
3. On that turn only, the model also gets `createAppointment` and calls it; on success it confirms. If booking fails
   (409/422), the tool result carries the error and `suggestions`, and the model offers them as new cards.

**Endpoint.** `POST /assistant/chat` is stateless. The client keeps the history and sends:
- `messages`: the last ~20, each length-capped.
- `patient`: `{ name, email }` from the panel fields, required to book.
- `selection`: optional.

It's a single `generateText` call with tools, `activeTools`, structured `output` and a bounded step count. The output is
`{ message: string, slots?: SlotOption[] }`.

**Tools.** `ai/tools.ts` builds them per request with `createTools({ db, config, now, patient, selection })`.
- `listDoctors({ specialty? })` and `findAvailableSlots({ doctorId, date, durationMinutes, partOfDay? })` are read-only
  wrappers over `domain/availability.ts`.
- `createAppointment({ doctorId, date, startTime, durationMinutes, reason? })` calls the **same**
  `domain/appointments.ts#createAppointment()` as `POST /appointments` (the domain service, not the HTTP controller).

**Guards.** The server never trusts the model.
- `createAppointment` is in `activeTools` **only when the request carries a `selection`**. On a plain text turn the model can't book.
- Its `execute` rejects arguments that differ from `selection` (`{ ok: false, error: 'selection_mismatch' }`).
- The patient's name and email come from the request, **never from model arguments**.
- The response's `appointment` is read from the tool's actual result in `result.steps`, not from the model's text.
- Slots in the structured output are re-checked against availability before returning; stale ones are dropped.
- The instructions include today's date and weekday in the clinic timezone, the working hours and the rules. They tell the
  model to offer only slots returned by `findAvailableSlots`.

The model is injected into `buildApp`, so tests use the SDK's mock model. With no API key the endpoint returns 503 and the
UI hides the panel.

## Frontend (single page)

- Header, then two cards:
  - **Book an appointment**: the form.
  - **Assistant**: patient name/email fields, a message list and an input. Slot cards render under assistant messages;
    clicking one sends the selection turn.
- Below them: **Upcoming appointments**, with Cancel.
- Forms use TanStack Form with zod schemas as validators and shadcn `Field` components. Writes go through TanStack Query
  mutations, which invalidate `['appointments']` and `['availability', …]` on success.
- The booking form has: doctor, date, start time (15-minute step), duration, patient name/email and reason. Available slots appear
  as chips (click to fill). Free time entry is kept on purpose, so a 409 shows the conflict message and suggestion chips.

## Docker

- `backend/Dockerfile` (build context is the repo root):
  - Base `node:24-bookworm-slim`, because the better-sqlite3 binaries need glibc ≥ 2.34. pnpm 12 is installed with npm.
  - Filtered install, `tsdown` build, then `pnpm --filter=backend --prod deploy` into a slim runtime stage that ships
    `dist/` and `drizzle/`.
  - Runs as a non-root user, with `CMD node dist/index.js`.
- `frontend/Dockerfile`: a build stage, then `nginx:alpine` serving `dist/`. `nginx.conf` adds the SPA fallback and proxies `/api` to `api:3000`.
- `docker-compose.yml` uses the volume `db-data:/data` (`DATABASE_URL=/data/app.db`) and three services, started in order:
  - `migrate`: the backend image running `node dist/migrate.js` (migrations + seed), then exits.
  - `api`: starts after `migrate` completes successfully; healthcheck on `/api/health`; optional `.env`.
  - `web`: starts once `api` is healthy; served on host port 8080.

## CI/CD

- **`ci.yml`**, on `push` and `pull_request`:
  - Frozen install, then `biome ci`, typecheck, test and build, on Node 24 with pnpm caching.
- **`docker.yml`**: on PRs it builds only; on push to `main` and on `v*` tags it publishes to GHCR.
  - Multi-arch without emulation: `linux/arm64` builds on `ubuntu-24.04-arm` and `linux/amd64` on `ubuntu-latest`, in
    parallel, each pushing by digest.
  - A merge step joins them into one manifest list per tag.
  - Tags: short SHA; `latest` on `main`; `X.Y.Z` and `X.Y` on version tags.
  - Details are in [spec 05](./specs/05-release-pipeline.md).

## Biome config (`biome.jsonc`)

A single root config. It must express these settings; the implementer writes the file.

- **Schema:** `$schema` points at the same Biome version that's pinned exactly in the root `package.json`, which is the
  latest at install time.
- **Files included:**
  - `backend/src/**`, `frontend/src/**`
  - the root-level `*.ts` / `*.json` of each package
  - root `*.json` and `*.jsonc`
- **Files excluded:**
  - `backend/drizzle` (generated migrations)
  - `node_modules`, `dist`, `coverage`
- **Formatter:** enabled, tabs, line width 120.
- **JavaScript formatter:** single quotes, arrow parentheses "as needed".
- **CSS parser:** Tailwind directives enabled. Tailwind v4 config lives in CSS (`@theme`, `@source`,
  `@custom-variant`), and Biome rejects it otherwise.
- **Assist:** organize imports on.
- **Linter:**
  - Recommended preset.
  - `noFloatingPromises` (a nursery rule) set to **error**. Re-check it whenever the Biome pin moves: if the rule leaves
    nursery, the old key silently stops enforcing. Fastify handlers, AI SDK calls and TanStack mutations are all promises.
- **Override:** the linter is disabled for `frontend/src/components/ui/**` (generated shadcn code), which stays formatted.

## Tests (minimal, critical paths)

**Backend**
- `domain/time.test.ts` and `domain/availability.test.ts`:
  - overlap edge cases: touching, contained, partial
  - slot generation respects working hours, existing appointments and "now"
- `routes/appointments.test.ts`, using `app.inject()` against in-memory SQLite migrated with the real migrations:
  - 201
  - doctor-overlap 409, with suggestions
  - patient-overlap 409
  - outside-hours 422
  - cancel frees the slot
- `ai/assistant.test.ts`, using `MockLanguageModelV4` + `app.inject()`:
  - a selection turn books
  - mismatched arguments are rejected
  - no `selection` means `createAppointment` is not offered to the model
  - booking a taken slot returns suggestions
  - no key gives 503

**Frontend**
- `BookingForm.test.tsx`: required-field validation; a 409 renders the conflict and the suggestion chips.
- `AssistantPanel.test.tsx`:
  - slot cards render
  - clicking one posts `selection` + `patient`
  - an `appointment` in the response shows the confirmation

## Spec series

| # | Spec | Depends on |
|---|---|---|
| 00 | [Foundation](./specs/00-foundation.md) | — |
| 01 | [Booking backend](./specs/01-booking-backend.md) | 00 |
| 02 | [Booking frontend](./specs/02-booking-frontend.md) | 01 |
| 03 | [Containers](./specs/03-containers.md) | 01, 02 |
| 04 | [AI assistant](./specs/04-ai-assistant.md) | 01, 02 |
| 05 | [Release pipeline](./specs/05-release-pipeline.md) | 03 |
| 06 | [Docs](./specs/06-docs.md) | all |

Workflow per spec:
1. Branch `spec/NN-<name>` from `main`.
2. Implement.
3. Run the same checks CI runs: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `docker build` where relevant.
4. Commit, then `git merge --no-ff` into `main`, so history keeps one merge per spec.

## Out of scope

- Auth/roles and patient accounts.
- Doctor schedule/holiday management, and recurring appointments.
- Notifications.
- Rate limiting and cost caps on the AI endpoint.
- Streaming responses and server-side conversation persistence.
- A DB-level overlap guard (SQLite trigger).
- A shared API-contract package or OpenAPI codegen.
- E2E tests (Playwright) and a compose smoke test in CI.
- Actual deployment (only images are published).
- i18n and observability.

## Implementation notes

- **pnpm 12**:
  - Root `package.json` pins `"packageManager": "pnpm@12.16.1"`.
  - `pnpm-workspace.yaml` sets `packages`, `allowBuilds: { esbuild: true }` and `minimumReleaseAge: 2880`.
  - Unknown workspace settings are errors.
  - Boolean flags take no separate value (`--frozen-lockfile`).
- **ESM everywhere**: `"type": "module"` in both packages. AI SDK 7 is ESM-only.
- **TypeScript 7** (native compiler):
  - `paths` without `baseUrl`.
  - `@types/node@24` to match the runtime.
  - If a tool turns out to be incompatible with TS 7, pin `typescript@6` and say why in the commit.
- **Backend build/dev**: `tsdown` bundles `src/index.ts` and `src/db/migrate.ts` and resolves the `~` alias. Dev runs with `tsx watch`.
- **Migrations folder**: `MIGRATIONS_DIR` env, defaulting to `<cwd>/drizzle`. Scripts always run with cwd = `backend/`
  (pnpm `--filter`) or `/app` (Docker), which avoids `import.meta.url` differences between `src/` and bundled chunks.
- **Fastify**:
  - Create the app with `Fastify().withTypeProvider<ZodTypeProvider>()`, then call `setValidatorCompiler(validatorCompiler)` and `setSerializerCompiler(serializerCompiler)`.
  - In `setErrorHandler`:
    - `hasZodFastifySchemaValidationErrors(err)` → 400
    - `isResponseSerializationError(err)` → 500
    - `DomainError` → its status
  - `fastify-type-provider-zod` declares `@fastify/swagger` and `openapi-types` as peers (type-only imports). Add
    `openapi-types` as a devDependency; silence a swagger peer warning via `peerDependencyRules` if needed.
- **Drizzle + better-sqlite3**:
  - Migrate with `migrate(db, { migrationsFolder })` from `drizzle-orm/better-sqlite3/migrator`.
  - Book inside `db.transaction(tx => { … }, { behavior: 'immediate' })`. The callback must be **synchronous**.
  - Tests use `:memory:` with the same migrator.
- **AI SDK 7**:
  - Call `generateText({ model, instructions, messages, tools, activeTools, output: Output.object({ schema }), stopWhen: isStepCount(6) })`.
  - `system` is deprecated in favour of `instructions`; `experimental_output` is gone (use `output`).
  - `result.output` throws `NoOutputGeneratedError` / `NoObjectGeneratedError`; map both to 502.
  - A plain model string routes through AI Gateway using `AI_GATEWAY_API_KEY`.
  - Tests use `MockLanguageModelV4` from `ai/test`.
- **Frontend**:
  - Vite 8 resolves tsconfig paths natively (`resolve: { tsconfigPaths: true }`), so no plugin is needed. If the option
    doesn't apply to tests, fall back to `resolve.alias` in the Vitest config.
  - `"~/*": ["./src/*"]` goes in both `tsconfig.json` and `tsconfig.app.json` before `shadcn init`.
  - `components.json` aliases use `~/…`.
- **Docker + pnpm**:
  - Install pnpm with `npm i -g pnpm@12.16.1`.
  - `pnpm deploy` no longer needs `injectWorkspacePackages` or `--legacy`.
