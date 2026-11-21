# The site, as one container: used by Fly.io (see fly.toml and docs/DEPLOY_FLY.md).
#
# Data (candidates, chats, team, settings) is written to DATA_DIR, which is a
# persistent volume mounted at /data. Uploaded files live in Cloudflare R2.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Read at build time: the Content Security Policy pins the R2 storage
# origin the browser uploads to (see next.config.mjs). Not secret.
ARG R2_ACCOUNT_ID=""
ARG R2_ENDPOINT=""
ENV R2_ACCOUNT_ID=$R2_ACCOUNT_ID
ENV R2_ENDPOINT=$R2_ENDPOINT
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    DATA_DIR=/data
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/next.config.mjs ./next.config.mjs
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "scripts/start.mjs"]
