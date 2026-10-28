# Spec 00 — Foundation

**Goal:** a pnpm workspace with `backend/` and `frontend/` where lint, typecheck, test and build all pass, with
CI defined. No product features yet.

**Depends on:** nothing. **Branch:** `spec/00-foundation`. Shared contract: [`docs/PLAN.md`](../PLAN.md).

## In scope

- Root workspace: `package.json`, `pnpm-workspace.yaml`, `.node-version`, `.gitignore`, `biome.jsonc`, `CLAUDE.md`.
- Backend skeleton: Fastify app factory, `/api/health`, config, one `inject()` test, tsdown build, tsx dev.
- Frontend skeleton: Vite React TS, Tailwind v4, shadcn initialised with the `~` alias, `/api` dev proxy, one test.
- `.github/workflows/ci.yml`.
- `docs/` is already committed; keep it up to date if anything here diverges.

## Out of scope

DB, domain logic, real UI, Docker, AI, release workflow.

## Steps

### 1. Root

- `package.json`:
  - `"name": "clinic-booking"`, `"private": true`, `"type": "module"`
  - `"packageManager": "pnpm@12.16.1"`, `"engines": { "node": ">=24" }`
  - scripts:
    - `"dev": "pnpm -r --parallel dev"`
    - `"lint": "biome check ."`
    - `"lint:fix": "biome check --write ."`
    - `"typecheck": "pnpm -r typecheck"`
    - `"test": "pnpm -r test"`
    - `"build": "pnpm -r build"`
- `pnpm-workspace.yaml`:
  - lists the `backend` and `frontend` packages
  - allows only `esbuild`'s build script, via pnpm 12's `allowBuilds` setting
  - sets `minimumReleaseAge` to 2880 minutes

  Add other `allowBuilds` entries only if `pnpm install` names them, and only after checking why the package needs a build script.
- `.node-version`: `24`.
- `.gitignore`:
  - `node_modules/`, `dist/`, `coverage/`
  - `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm`, `backend/data/`
  - `.env`, `.env.*` (but keep `!.env.example`)
  - `.DS_Store`, `*.log`
  - `.wolf/`, `.claude/`
- Biome: `pnpm add -Dw -E @biomejs/biome@latest`. Write `biome.jsonc` exactly as in PLAN.md and set `$schema` to the installed version.
  Then:
  - Confirm `"preset": "recommended"` and `nursery.noFloatingPromises` are valid for that version (`pnpm lint` must
    report no configuration errors). If either key moved, use the version's equivalent and note it in the commit.
  - Run `pnpm lint:fix` after every generator (`create vite`, `shadcn add`).
- `CLAUDE.md`: replace the current content with a project guide:
  - one-paragraph overview
  - stack
  - commands (`pnpm dev/lint/lint:fix/typecheck/test/build`, `docker compose up --build`)
  - conventions: `~` alias, Biome style, domain rules live in `backend/src/domain`, every write goes through `createAppointment()`, tests next to code as `*.test.ts(x)`
  - pointer to `docs/PLAN.md` and `docs/specs/`

  Keep it short. OpenWolf keeps working locally through `.claude/rules/`, which is gitignored.

### 2. Backend (`backend/`)

- `package.json`:
  - `"name": "backend"`, `"private": true`, `"type": "module"`, `"files": ["dist", "drizzle"]`
  - scripts:
    - `"dev": "tsx watch src/index.ts"`
    - `"build": "tsdown"`
    - `"start": "node dist/index.js"`
    - `"typecheck": "tsc --noEmit"`
    - `"test": "vitest run"`
- Dependencies: `fastify`, `fastify-type-provider-zod`, `zod`.
- devDependencies: `typescript`, `@types/node@24`, `tsx`, `tsdown`, `vitest`, `openapi-types`.
  If pnpm warns about the missing `@fastify/swagger` peer, add `peerDependencyRules.ignoreMissing: ['@fastify/swagger']` to `pnpm-workspace.yaml`.
- `tsconfig.json`:
  - `target`/`lib`: `ES2024`
  - `module: "ESNext"`, `moduleResolution: "Bundler"`
  - `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`
  - `types: ["node"]`
  - `paths: { "~/*": ["./src/*"] }` (no `baseUrl`)
  - `include: ["src", "*.ts"]`
- `src/config.ts`: `loadConfig(env = process.env)` parses `PORT` (default 3000), `HOST` (default `0.0.0.0`) and
  `LOG_LEVEL` (default `info`) with zod and returns a typed `Config`. Later specs extend this schema.
- `src/app.ts`: `buildApp(deps: AppDeps)`:
  - `AppDeps = { config: Config }` for now; later specs add `db`, `model`, `now`.
  - Creates `Fastify({ logger })` with the type provider and both compilers.
  - Registers the error handler: zod validation → 400 `{ error: 'validation', issues }`; Fastify's own 4xx errors
    (malformed JSON, oversized body) keep their status as `{ error: 'bad_request', message }`; anything else → 500
    `{ error: 'internal' }`, logged.
  - Registers `routes/health.ts` under prefix `/api`.
- `src/routes/health.ts`: `GET /health` → `{ ok: true }`, with a zod response schema.
- `src/index.ts`: `loadConfig()`, `buildApp()`, then `listen({ port, host })`. Close the app cleanly on `SIGINT` and `SIGTERM`.
- `src/app.test.ts`: `inject` `GET /api/health` → 200 `{ ok: true }`; `app.close()` in `afterEach`.
- `tsdown.config.ts`: `defineConfig({ entry: { index: 'src/index.ts' }, platform: 'node', format: 'esm', fixedExtension: false })`
  (`fixedExtension: false` makes the output `index.js` instead of `index.mjs`). Spec 01 adds
  `migrate`. Confirm the `~` alias is resolved in `dist/`: `grep -r "~/" dist` must find nothing.
- `vitest.config.ts`: `resolve: { tsconfigPaths: true }`, falling back to `alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) }`;
  `test: { environment: 'node' }`.

### 3. Frontend (`frontend/`)

- Scaffold with `pnpm create vite@latest frontend --template react-ts --no-interactive --no-immediate`.
  - Delete the template's linter (current create-vite ships Oxlint: `.oxlintrc.json` + the `oxlint` devDep), its
    `.gitignore`/README and the demo assets/CSS.
  - Align `typescript` with the backend (TS 7) and turn on `strict` in `tsconfig.app.json`/`tsconfig.node.json`.
  - Rename the package to `"frontend"` and keep `"type": "module"`.
- Tailwind: `pnpm add tailwindcss @tailwindcss/vite`. `src/index.css` starts with `@import "tailwindcss";`.
- Paths: add `"paths": { "~/*": ["./src/*"] }` to **both** `tsconfig.json` and `tsconfig.app.json`, without `baseUrl`.
- `vite.config.ts`: plugins `react()` and `tailwindcss()`; `resolve: { tsconfigPaths: true }`;
  `server.proxy: { '/api': 'http://localhost:3000' }`.
- shadcn: `pnpm dlx shadcn@latest init -t vite -b radix -p nova --no-monorepo --css-variables --no-rtl -y` (the Nova
  preset uses the neutral base color). It also adds `button` and `src/lib/utils.ts`, which re-exports `cn` from
  shadcn's `cn` package (replaces clsx + tailwind-merge).
  - Verify that `components.json` aliases are `~/components`, `~/components/ui`, `~/lib`, `~/lib/utils` and `~/hooks`; fix them by hand if needed.
  - `shadcn add button` (already added by `init` with the Nova preset).
  - Run `pnpm lint:fix`.
- `src/App.tsx`: minimal page with a "Clinic Booking" heading and a shadcn `Button`, which proves Tailwind, shadcn and the alias work.
- Tests: devDeps `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`.
  - Add a `test` block in `vite.config.ts` (or a `vitest.config.ts` that merges it): `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`.
  - `src/test/setup.ts` imports `@testing-library/jest-dom/vitest`.
  - Include it in `tsconfig.app.json` types if needed.
- `src/App.test.tsx`: renders the heading.
- Scripts:
  - `"dev": "vite"`
  - `"build": "tsc -b && vite build"`
  - `"typecheck": "tsc -b"`
  - `"test": "vitest run"`
  - `"preview": "vite preview"`

### 4. CI (`.github/workflows/ci.yml`)

- Runs on every `push` and `pull_request`, with concurrency per ref (cancelling in-progress runs) and read-only `contents`
  permission.
- A single job on `ubuntu-latest`:
  1. Checks out the code.
  2. Installs pnpm with `pnpm/action-setup`, which reads the version from `packageManager` (don't repeat the version).
  3. Sets up Node from `.node-version` with pnpm caching.
  4. Runs a frozen-lockfile install.
  5. Runs `biome ci .`, then typecheck, test and build, in that order.
- Use the current major version of every action. Look them up; don't copy versions from memory.

## Done when

- `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes from the repo root.
- `pnpm dev` starts both apps. `curl localhost:5173/api/health` returns `{"ok":true}` through the Vite proxy, and
  the page shows the heading and button.
- `backend/dist/index.js` runs with `node` and has no `~/` imports.

## Verify

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
grep -r '"~/' backend/dist || echo "alias resolved"
pnpm dev   # then: curl -s localhost:5173/api/health
```
