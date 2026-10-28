# Spec 05 — Release pipeline

**Goal:** multi-arch (`linux/arm64` + `linux/amd64`) container images for `backend` and `frontend`. They are built on every
PR and published to GitHub Container Registry (GHCR) on merge to `main` and on `v*` tags, with no emulation.

**Depends on:** 03. **Branch:** `spec/05-release-pipeline`. Shared contract: [`docs/PLAN.md`](../PLAN.md) (§CI/CD).

## In scope

`.github/workflows/docker.yml`.

## Out of scope

Deploying anywhere, signing, and SBOM/provenance attestations beyond the buildx defaults.

## Requirements

**Triggers and permissions**
- Runs on `pull_request`, on push to `main`, and on tags matching `v*`.
- Concurrency per ref, cancelling in-progress runs.
- Permissions: `contents: read`, `packages: write`. Authenticate with the built-in `GITHUB_TOKEN`; no extra secrets.

**Native parallel builds**
- One build job per app × platform:
  - `linux/arm64` on GitHub's native ARM runner (`ubuntu-24.04-arm`)
  - `linux/amd64` on `ubuntu-latest`
- No QEMU anywhere.
- Each build job pushes its image **by digest only** (no tags) and hands the digest to the merge step (e.g. via a
  short-lived artifact).
- Build cache: the GitHub Actions cache, scoped per app **and** architecture, so the platforms don't evict each other.

**Merge into one manifest**
- One merge job per app, after all its platform builds finish.
- It combines the digests into a single multi-arch manifest list under the final tags (`docker buildx imagetools create`).
- It then inspects the result and fails if either platform is missing.

**Image names and tags**
- Names: `ghcr.io/<owner>/<repo>-backend` and `ghcr.io/<owner>/<repo>-frontend`, **lowercased**, because GHCR requires lowercase.
- Tags, computed with `docker/metadata-action`:
  - short commit SHA, always
  - `latest` on the default branch
  - `X.Y.Z` and `X.Y` on `vX.Y.Z` tags
- OCI labels come from the metadata action.

**Pull requests**
- Both platforms build, which proves each Dockerfile works on both architectures.
- No login, no push, no merge. This means PRs from forks work without credentials.

**Implementation guidance**
- Follow Docker's documented "distribute build across multiple runners" pattern for GitHub Actions.
- Use the current major version of every action. Look them up; don't copy versions from memory.

## Done when

- Both images still build locally for the host architecture.
- better-sqlite3 loads inside the backend image.
- The workflow passes `actionlint` (install it with `brew install actionlint` or use the `rhysd/actionlint` image).
  Otherwise review it carefully by hand. It first runs on GitHub once the repo is pushed.
- After the first `main` run, inspecting each published image shows both `linux/arm64` and `linux/amd64`. Record this as
  pending until the user pushes.
- The README (spec 06) documents image names, tags, supported platforms, how to cut a release (push a `vX.Y.Z` tag) and
  that GHCR packages start private.

## Verify

```bash
docker build -f backend/Dockerfile -t test-backend . && docker build -f frontend/Dockerfile -t test-frontend .
docker run --rm test-backend node -e "require('better-sqlite3')"
actionlint .github/workflows/*.yml
```
