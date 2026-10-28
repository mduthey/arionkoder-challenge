# Spec 03 — Containers

**Goal:** `docker compose up --build`, run on a clean machine, migrates and seeds the database and serves the whole app at
http://localhost:8080.

**Depends on:** 01, 02. **Branch:** `spec/03-containers`. Shared contract: [`docs/PLAN.md`](../PLAN.md) (§Docker).

## In scope

`backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.yml`, the root `.dockerignore` and
`.env.example`.

## Out of scope

Image publishing (spec 05), TLS, and production hardening beyond a non-root user and healthchecks.

## Requirements

### Shared

- The build context for both images is the repo root, because the single `pnpm-lock.yaml` lives there.
- **Each image only sees its own package.** Copy the root workspace files plus that package's `package.json` first, so
  dependency installation stays cached; copy the package source after that.
  - Changes to `frontend/` must never invalidate the backend's layers, and vice versa.
  - If pnpm refuses a frozen, filtered install with the other package's manifest absent, fall back in this order and
    record which was needed in the commit message:
    1. `pnpm fetch` (needs only the lockfile), then an offline filtered install.
    2. Also copy the other package's manifest only (never its source) into the build stage.
- Install pnpm 12 with `npm i -g pnpm@<pinned version>`, because corepack support for pnpm 12 is unverified.
- Use frozen-lockfile installs.
- `.dockerignore` excludes:
  - `node_modules`, build output, coverage
  - local DB files and `data/`
  - `.git`, `.github`, `.wolf`, `.claude`, `.env`
  - PDFs, `docs/`

### Backend image

- Multi-stage. The build stage installs dependencies, builds with `tsdown`, then produces a production-only bundle with
  `pnpm --filter=backend --prod deploy <dir>`.
  - The backend `package.json` `"files"` field (`dist`, `drizzle`) is what makes deploy include the build output and the
    migrations.
- Base image `node:24-bookworm-slim` for build and runtime. better-sqlite3's prebuilt binaries need glibc ≥ 2.34, so no Alpine.
- Runtime stage:
  - Contains only the deploy output: `dist/`, `drizzle/` and production `node_modules`.
  - Defaults: `NODE_ENV=production`, `PORT=3000`, `DATABASE_URL=/data/app.db`, `MIGRATIONS_DIR` pointing at the bundled
    `drizzle/`.
  - A `/data` directory owned by the non-root `node` user, which runs the process.
  - Default command starts the API (`dist/index.js`). The same image can run the migrations (`dist/migrate.js`).

### Frontend image

- The build stage runs the Vite build. It must use `--platform=$BUILDPLATFORM`: the output is static, so the build never
  needs emulation on other architectures.
- Runtime: `nginx` (Alpine variant) serving the built files.
- `nginx.conf`:
  - SPA fallback to `index.html`
  - `/api/` proxied to the `api` service on port 3000, with the usual forwarding headers and a read timeout of at least
    60s (assistant calls can take a few seconds)
  - long-lived immutable caching for hashed `/assets/`

### Compose

- Project name `clinic-booking`, a named volume for the database mounted at `/data`, and these services:
  - `migrate`: backend image running the migrations + seed, then exiting.
  - `api`: backend image. Starts only after `migrate` **completed successfully**. Its healthcheck calls `/api/health` with
    Node's `fetch`, because the slim image has no curl.
  - `web`: frontend image. Starts only after `api` is **healthy**. Published on host port `8080`.
- `migrate` and `api` load `.env` if it exists, so the file is optional.
- The backend image is built once and reused by both `migrate` and `api`.

### `.env.example`

Documents the optional variables, each with a one-line comment:
- `AI_GATEWAY_API_KEY`, empty by default; the assistant is disabled without it.
- `AI_MODEL`, default `anthropic/claude-haiku-5.5`.
- `CLINIC_TIMEZONE`, default `America/Argentina/Buenos_Aires`.

## Done when

- From an empty volume, `docker compose up --build`:
  - `migrate` logs migrations and seed, then exits 0
  - `api` becomes healthy
  - http://localhost:8080 shows seeded doctors and appointments
  - booking and cancelling work end to end
- A second `up` with the volume kept: `migrate` is a no-op and the data persists.
- Both runtime containers run as non-root.
- The backend runtime image contains no frontend files and no dev dependencies.

## Verify

```bash
docker compose down -v && docker compose up --build -d
docker compose ps
curl -s localhost:8080/api/health && curl -s localhost:8080/api/doctors
docker compose logs migrate
docker compose exec api id
docker compose down
```
