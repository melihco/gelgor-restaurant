# Smart Agency Web — Next.js standalone (no Chromium / Remotion)
# Build context must be the repo root (see render.yaml dockerContext) so tsconfig extends
# and @smartagency/contracts path aliases resolve.
FROM node:20-bookworm-slim AS build

WORKDIR /repo

COPY apps/web/package.json apps/web/package-lock.json apps/web/.npmrc ./apps/web/
WORKDIR /repo/apps/web
RUN npm ci

WORKDIR /repo
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web

WORKDIR /repo/apps/web

ENV NODE_OPTIONS=--max-old-space-size=6144
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=1024
ENV HOSTNAME=0.0.0.0

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./.next/static
COPY --from=build /repo/apps/web/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
