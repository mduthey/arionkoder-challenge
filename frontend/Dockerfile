# Build context: repo root (the lockfile lives there).
# The output is static, so build natively and never under emulation.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
RUN npm i -g pnpm@12.16.1
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter=frontend

COPY frontend/ frontend/
RUN pnpm --filter=frontend build

# Unprivileged variant: runs as the non-root nginx user and listens on 8080.
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
