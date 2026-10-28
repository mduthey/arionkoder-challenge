# Build context: repo root (the lockfile lives there).
FROM node:24-bookworm-slim AS build
RUN npm i -g pnpm@12.16.1
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter=backend

COPY backend/ backend/
RUN pnpm --filter=backend build \
	&& pnpm --filter=backend --prod deploy /out

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
	PORT=3000 \
	DATABASE_URL=/data/app.db \
	MIGRATIONS_DIR=/app/drizzle
WORKDIR /app

COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules node_modules/
COPY --from=build /out/dist dist/
COPY --from=build /out/drizzle drizzle/
RUN mkdir /data && chown node:node /data

USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "dist/index.js"]
