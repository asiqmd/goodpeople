# Good People web app (Next.js). Build from the repository root:
#
#   docker build -f apps/web/Dockerfile -t good-people-web .
#
# Runtime settings: API_URL, the API's address as seen from this container (for example
# http://api:4000). The web app calls the API from the server only; browsers never do.
# GP_SUPPORT_EMAIL, the contact address in the public pages' footer.
#
# next.config.ts does not enable `output: 'standalone'`, so this image runs `next start` from
# a pruned production install (about 350 MB of node_modules). Standalone output would cut that
# to the files the server traces; see "Known gaps" in docs/ops/runbook.md.

ARG NODE_IMAGE=docker.io/library/node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d

# ── Build ─────────────────────────────────────────────────────────────────────────────────
ARG GP_RELEASE_VERSION=5.3.0-local
ARG GP_SOURCE_COMMIT=unrecorded
ARG GP_SOURCE_TREE_SHA256=unrecorded
ARG GP_SOURCE_DIRTY=true

FROM ${NODE_IMAGE} AS build
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
# pnpm comes from the "packageManager" field of package.json.
RUN corepack enable pnpm
WORKDIR /repo

# Same steps as apps/api/Dockerfile, so both images share these cached layers.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --prefer-offline
# next build downloads the Inter and Noto Sans Bengali fonts (next/font/google), so the build
# needs internet access; the running container does not.
RUN pnpm exec turbo run build --filter=@gp/web...
# A production-only copy with the locked versions (see apps/api/Dockerfile). The build cache
# in .next/cache is not needed to serve pages.
RUN pnpm deploy --filter=@gp/web --prod /prod/web \
 && rm -rf /prod/web/.next/cache

# ── Runtime ───────────────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ARG GP_RELEASE_VERSION
ARG GP_SOURCE_COMMIT
ARG GP_SOURCE_TREE_SHA256
ARG GP_SOURCE_DIRTY
LABEL org.opencontainers.image.version=$GP_RELEASE_VERSION \
      org.opencontainers.image.revision=$GP_SOURCE_COMMIT \
      org.goodpeople.source-tree-sha256=$GP_SOURCE_TREE_SHA256 \
      org.goodpeople.source-dirty=$GP_SOURCE_DIRTY
ENV RELEASE_VERSION=$GP_RELEASE_VERSION
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app
# `next start` needs the build output, next.config.ts (compiled in memory at start-up), the
# messages, the help and legal pages' Markdown (read at request time) and the production
# node_modules. All owned by root.
COPY --from=build /prod/web/package.json /prod/web/next.config.ts ./
COPY --from=build /prod/web/messages ./messages
COPY --from=build /prod/web/content ./content
COPY --from=build /prod/web/node_modules ./node_modules
COPY --from=build /prod/web/.next ./.next
# The only place Next.js writes at runtime.
RUN mkdir -p .next/cache && chown node:node .next/cache

USER node
EXPOSE 3000

# The web app has no health route; the sign-in page renders without calling the API.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/login').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Node directly (no pnpm, no shell), so SIGTERM from `docker stop` reaches Next.js.
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
