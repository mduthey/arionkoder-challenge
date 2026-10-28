# Spec 06 — Docs

**Goal:** someone who has never seen the repo can understand what it is, run it (Docker or local), and find their way
around, all from the README.

**Depends on:** all previous specs. **Branch:** `spec/06-docs`.

## In scope

`README.md`, a final pass on `CLAUDE.md`, and checking that `docs/PLAN.md` still matches what was built (update it where
the implementation deliberately diverged).

## Out of scope

New features. Any gap found here goes into *Limitations & roadmap*, not into code.

## README outline

1. **Title + one-liner**, plus CI and Docker workflow badges (use the `<owner>/<repo>` placeholder until the remote exists, or
   badges that resolve relative to the repo).
2. **What it does**: 4–6 bullets (form booking with overlap prevention, availability, conflict suggestions, AI assistant
   that books the slot you pick, one-command Docker setup).
3. **Quick start (Docker)**:
   ```bash
   cp .env.example .env    # optional: add AI_GATEWAY_API_KEY to enable the assistant
   docker compose up --build
   # → http://localhost:8080
   ```
4. **Local development**: prerequisites (Node 24, pnpm 12), then `pnpm install` and `pnpm dev` (the backend migrates and seeds
   on start; frontend on :5173, API on :3000, proxied). A scripts table: `dev`, `lint`, `lint:fix`, `typecheck`, `test`,
   `build`, `--filter backend db:generate`.
5. **Configuration**: an env var table (`PORT`, `DATABASE_URL`, `MIGRATIONS_DIR`, `CLINIC_TIMEZONE`, `AI_GATEWAY_API_KEY`,
   `AI_MODEL`, `LOG_LEVEL`) with defaults.
6. **Architecture**: a short repo tree, then the request flow (browser → nginx → Fastify → domain → SQLite), then a
   Mermaid sequence diagram of the assistant flow (message → tools → slot cards → click with `selection` →
   `createAppointment` → confirmation).
7. **Design decisions**: concise bullets with the *why*:
   - Fastify + zod type provider
   - Drizzle + SQLite, with an `IMMEDIATE` transaction for race-free booking
   - the overlap rule (half-open intervals) and the patient overlap rule
   - clinic-local input with UTC storage
   - a single write path shared by the form and the AI
   - the AI guards (booking tool only on a selection turn, args must match the selection, patient details never from the model, success read from the tool result)
   - TanStack Query + Form, and no router
   - Biome
   - pnpm `minimumReleaseAge`
8. **Testing**: what's covered and how to run it.
9. **CI/CD**: what each workflow does, the image names and tags, how to cut a release, and the note that GHCR packages start private.
10. **Limitations & roadmap**: the PLAN.md §Out of scope list, plus anything discovered during implementation.

## Also

- `CLAUDE.md`: make sure the commands and conventions match reality.
- `docs/PLAN.md`: fix anything that drifted (paths, endpoint shapes, script names).

## Done when

- Following only the README on a clean clone, both the Docker and local paths work. Re-run both.
- Every command in the README has actually been run.
- Lint, typecheck, test and build all pass.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose down -v && docker compose up --build -d && curl -s localhost:8080/api/health && docker compose down
```
