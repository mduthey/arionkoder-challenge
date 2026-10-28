# Spec 01 — Booking backend

**Goal:** a working booking API: doctors, availability, create/list/cancel appointments, with every rule from PLAN.md
§Domain enforced in one domain service and covered by tests.

**Depends on:** 00. **Branch:** `spec/01-booking-backend`. Shared contract: [`docs/PLAN.md`](../PLAN.md) (§Domain, §API).

## In scope

Drizzle schema and migrations, the migrate + seed entry, the domain layer (time, availability, appointments, errors),
the doctors and appointments routes, `/api/config` (without `aiEnabled` yet), and tests.

## Out of scope

Frontend, Docker, AI, auth.

## Dependencies

- `drizzle-orm` and `better-sqlite3`, plus `date-fns` and `@date-fns/tz`.
- devDependencies: `drizzle-kit` and `@types/better-sqlite3`.
- If `pnpm install` blocks a build script, check why. better-sqlite3 13 ships prebuilt binaries, so it shouldn't need one.

## Config (extend `src/config.ts`)

- `DATABASE_URL`, default `./data/app.db`. `:memory:` is allowed.
- `MIGRATIONS_DIR`, default `resolve(process.cwd(), 'drizzle')`.
- `CLINIC_TIMEZONE`, default `America/Argentina/Buenos_Aires`. Validate it with `Intl.supportedValuesOf('timeZone')` or a
  `try { new Intl.DateTimeFormat('en', { timeZone }) }`.

## Files

### `src/db/schema.ts`

Self-contained, with no `~` imports, because drizzle-kit loads it.
- `doctors`: `id` (integer pk autoincrement), `name`, `specialty`, `workStartMinute`, `workEndMinute`.
- `appointments`:
  - `id` (pk), `doctorId` (FK → doctors)
  - `patientName`, `patientEmail` (stored lowercase)
  - `startsAt`, `endsAt`: `integer` with `mode: 'timestamp_ms'`, or plain integer ms (pick one and use it consistently)
  - `reason` (nullable), `status` (text enum `scheduled | cancelled`, default `scheduled`), `createdAt`
  - indexes on `(doctorId, startsAt)` and `(patientEmail, startsAt)`

### `drizzle.config.ts` and migrations

`drizzle.config.ts` sets:
- the SQLite dialect
- the schema at `src/db/schema.ts`
- output to `drizzle/`
- the local dev DB (`data/app.db`) as credentials

Run `pnpm --filter backend exec drizzle-kit generate --name init` and commit `drizzle/`.

### `src/db/client.ts`

`createDb(url)`:
- `mkdirSync(dirname(url), { recursive: true })` unless the url is `:memory:`.
- Open `new Database(url)` and set the pragmas `journal_mode = WAL`, `foreign_keys = ON` and `busy_timeout = 5000`.
- Return `drizzle(sqlite, { schema })`.

Export `type Db`.

### Migrations and seed

- `src/db/migrations.ts`: `runMigrations(db, dir)` wraps `migrate()` from `drizzle-orm/better-sqlite3/migrator`.
- `src/db/seed.ts`: `seed(db, { now, tz })` is idempotent: it returns early if any doctor exists.
  - 4 doctors: General Practice, Dermatology, Cardiology and Pediatrics, with realistic names. Hours are 09:00–17:00, and one doctor works 08:00–14:00.
  - About 6 scheduled appointments on the next 3 weekdays after `now`, at clinic-local times inside working hours, so
    conflicts are easy to demo.
  - Insert them through the same insert helpers. Skip the "future" rule only if `now` makes a slot invalid; the
    simplest approach is to always seed future weekdays.
- `src/db/migrate.ts`: CLI entry. It runs `loadConfig()` → `createDb` → `runMigrations` → `seed`, logs what it did and
  exits 0. Add it to `tsdown.config.ts` entries as `migrate`, which outputs `dist/migrate.js`.

### `src/domain/errors.ts`

`class DomainError extends Error { code; status; details }`, with these codes:
- `not_found` → 404
- `invalid_time` → 422 (past, wrong boundary, bad duration)
- `outside_hours` → 422
- `doctor_conflict` → 409
- `patient_conflict` → 409

`details` carries `suggestions` for the conflict codes.

### `src/domain/time.ts`

Pure functions only: no DB, and no `Date.now()` (callers pass `now`).
- `DURATIONS = [15, 30, 45, 60] as const` and `SLOT_STEP = 15`.
- `overlaps(a, b)`: `a.start < b.end && a.end > b.start`.
- `clinicToUtc(date: string, time: string, tz): Date` via `TZDate`.
- `utcToClinic(ms, tz)` → `{ date, time, weekday (1–7), minuteOfDay }`.
- `isWeekday(weekday)`.

### `src/domain/availability.ts`

- `findFreeSlots(db, { doctorId, date, durationMinutes, now, tz, partOfDay? })` → `Slot[]`:
  - Generate candidates from the doctor's working window in `SLOT_STEP` increments where `start + duration <= workEnd`.
  - Drop past candidates and any that overlap the doctor's scheduled appointments that day (one query).
  - `partOfDay` is `morning` (< 12:00) or `afternoon` (≥ 12:00).
  - Returns `[]` on weekends.
- `Slot = { doctorId, date, startTime, durationMinutes, startsAt (ISO) }`.
- `suggestSlots(db, { doctorId, from, durationMinutes, now, tz, count = 3 })`: next free slots starting at the requested
  day and scanning up to 7 days ahead. Used for 409 bodies and AI tool results.

### `src/domain/appointments.ts`

- `createAppointment(db, input, { now, tz })`:
  - `input = { doctorId, date, startTime, durationMinutes, patientName, patientEmail, reason? }`.
  - Validate in this order: the doctor exists (404) → duration and 15-min boundary (422 `invalid_time`) → in the future
    (422) → weekday and working hours (422 `outside_hours`).
  - Then, inside `db.transaction(tx => { … }, { behavior: 'immediate' })` (a **sync** callback): doctor overlap
    (409 `doctor_conflict`), then patient overlap by lowercase email (409 `patient_conflict`), then insert.
  - Compute the suggestions for a 409 after the transaction.
  - Returns an `AppointmentDto`.
- `cancelAppointment(db, id)`: 404 if missing; idempotent if already cancelled. Returns the DTO.
- `listAppointments(db, { doctorId?, from, to? })`: scheduled appointments only, ordered by `startsAt`, limit 100,
  joined with the doctor name.
- `AppointmentDto` fields: `id`, `doctorId`, `doctorName`, `specialty`, `patientName`, `patientEmail`, `startsAt`, `endsAt`
  (both ISO strings), `reason`, `status`.

### Routes

- `src/routes/doctors.ts`:
  - `GET /doctors` → `Doctor[]`, where a doctor is `{ id, name, specialty, workStart: 'HH:mm', workEnd: 'HH:mm' }`.
  - `GET /doctors/:id/availability?date=YYYY-MM-DD&duration=30` → `{ date, durationMinutes, slots }`.
- `src/routes/appointments.ts`:
  - `GET /appointments?doctorId&from&to`: `from` defaults to `now`.
  - `POST /appointments` → 201 with the DTO.
  - `POST /appointments/:id/cancel`.
- `src/routes/config.ts`: `GET /config` → `{ clinicTimezone }`. Spec 04 adds `aiEnabled`.
- Every route uses zod schemas for params, querystring and body. Use regexes for `date` (`^\d{4}-\d{2}-\d{2}$`) and
  `startTime` (`^\d{2}:\d{2}$`), `z.email()` for the email, and trim and cap lengths on names and reason.
- Error handler: `DomainError` → `reply.status(err.status).send({ error: err.code, message, ...details })`.

### `src/app.ts` and `src/index.ts`

- `AppDeps = { config, db, now: () => Date }`. `now` is injectable so tests are deterministic.
- `index.ts` builds the db from config, then runs `runMigrations` and `seed` on boot only when `NODE_ENV !== 'production'`,
  so local `pnpm dev` just works. In Docker the `migrate` service does it.
- Backend dev script: `"dev": "tsx watch src/index.ts"` (unchanged). Add `"db:generate": "drizzle-kit generate"` and
  `"db:migrate": "tsx src/db/migrate.ts"`.

## Tests

- `src/test/helpers.ts`: `createTestApp({ now })` creates a `:memory:` db, runs `runMigrations` with the real `drizzle/`
  folder and inserts 2 doctors. It returns `{ app, db }`. Use a fixed `now`: Monday 2026-11-02 08:00 in
  `America/Argentina/Buenos_Aires`.
- `src/domain/time.test.ts`:
  - `overlaps`: touching is false; contained, partial and identical are true.
  - `clinicToUtc` and `utcToClinic` round-trip.
- `src/domain/availability.test.ts`:
  - window boundaries (the last slot ends exactly at `workEnd`)
  - an existing appointment removes the overlapping candidates
  - past slots are removed
  - weekends return `[]`
- `src/routes/appointments.test.ts` (`app.inject`):
  - 201 on create, and the appointment then appears in `GET /appointments`
  - same doctor with an overlapping time → 409 `doctor_conflict` with non-empty `suggestions`
  - same patient email (different case) with another doctor at the same time → 409 `patient_conflict`
  - 18:00 → 422 `outside_hours`; Saturday → 422; 10:07 → 422 `invalid_time`; past → 422
  - invalid body → 400
  - cancel → 200, and re-booking the same slot → 201
  - unknown id → 404

## Done when

- All backend tests pass, and lint, typecheck and build pass at the root.
- `pnpm --filter backend dev` with a fresh `data/` migrates and seeds, and the curl flow below behaves as expected.
- `node dist/migrate.js`, run from `backend/` after `pnpm build`, works against a new DB file and is safe to re-run.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
rm -rf backend/data && pnpm --filter backend dev &
curl -s localhost:3000/api/doctors
curl -s "localhost:3000/api/doctors/1/availability?date=<next weekday>&duration=30"
# POST /api/appointments twice with the same slot → 201 then 409 with suggestions
```
