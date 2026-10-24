# Good People API (NestJS). Build from the repository root:
#
#   docker build -f apps/api/Dockerfile -t good-people-api .
#
# The same image runs the one-off database commands, because `pnpm deploy` ships the compiled
# @gp/db scripts and the SQL migrations inside node_modules (no tsx needed):
#
#   node node_modules/@gp/db/dist/scripts/setup.js     roles and databases (needs DATABASE_ADMIN_URL)
#   node node_modules/@gp/db/dist/scripts/migrate.js   migrations, as the owner role
#   node node_modules/@gp/db/dist/scripts/create-super-admin.js   plans and the first super admin
#   node node_modules/@gp/db/dist/scripts/seed.js      demo data: staging only, never production
#
# See docs/ops/runbook.md.

ARG NODE_VERSION=24

# ── Build: the whole workspace, then a production-only copy of the API ─────────────────────
FROM node:${NODE_VERSION}-slim AS build
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
# pnpm comes from the "packageManager" field of package.json.
RUN corepack enable pnpm
WORKDIR /repo

# Packages are fetched from the lockfile alone, so this layer is reused until the lockfile
# changes. The api and web Dockerfiles share these steps, and so the cached layers.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --prefer-offline
# The API and the workspace packages it depends on (@gp/shared, @gp/country-packs, @gp/db).
RUN pnpm exec turbo run build --filter=@gp/api...
# pnpm 12 builds a lockfile for the deployed project from the workspace lockfile, so the
# versions are the locked ones. Workspace packages are copied in (not linked), each limited
# to its "files": @gp/db brings dist/ and migrations/. No --legacy or inject-workspace-packages
# setting is needed.
RUN pnpm deploy --filter=@gp/api --prod /prod/api

# ── Runtime ───────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime

# Chromium renders letters, ID cards and service books to PDF (puppeteer-core starts it via
# CHROME_PATH). The API embeds the Bangla font itself; Liberation covers Latin text. tini runs
# as PID 1 so that Chromium's child processes are reaped and SIGTERM reaches Node.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation tini \
 && rm -rf /var/lib/apt/lists/* \
 && chromium --version

# Chrome's sandbox needs user namespaces or extra seccomp privileges that a default container
# does not grant. The API runs as an unprivileged user and starts Chromium through this
# wrapper, which turns the sandbox off and keeps shared memory out of the small /dev/shm.
# The trade-off is explained under "Chrome for PDFs" in docs/ops/runbook.md.
RUN printf '%s\n' '#!/bin/sh' \
      'exec /usr/bin/chromium --no-sandbox --disable-dev-shm-usage "$@"' \
      > /usr/local/bin/chromium-no-sandbox \
 && chmod 0755 /usr/local/bin/chromium-no-sandbox

ENV NODE_ENV=production \
    NO_COLOR=1 \
    PORT=4000 \
    CHROME_PATH=/usr/local/bin/chromium-no-sandbox \
    STORAGE_DIR=/data/documents

WORKDIR /app
# Owned by root, so the running API cannot change its own code.
COPY --from=build /prod/api/package.json ./package.json
COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /prod/api/dist ./dist

# The local document store (STORAGE_DRIVER=local). Mount a volume or a host directory here;
# it stays empty with STORAGE_DRIVER=s3. Files are encrypted before they are written.
RUN mkdir -p /data/documents && chown node:node /data/documents

USER node
EXPOSE 4000

# /health also checks the database (select 1).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
