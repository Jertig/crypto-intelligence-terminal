FROM node:24-alpine AS dependencies
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS web-build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @terminal/web build

FROM dependencies AS worker-build
COPY . .
RUN pnpm --filter @terminal/worker build

FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:24-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=worker-build --chown=node:node /workspace/apps/worker/dist ./dist
COPY --from=worker-build --chown=node:node /workspace/packages/db/migrations ./migrations
USER node
EXPOSE 3001
CMD ["sh", "-c", "node dist/migrate.mjs && exec node dist/index.mjs"]
