# Build the agent first: pnpm --filter @gp/edge-agent build
# Then: docker build -t gp-edge-agent apps/edge-agent
FROM node:24-slim

ENV NODE_ENV=production \
    GP_DATA_DIR=/data \
    GP_PORT=8081

WORKDIR /app
# No runtime dependencies, so no install step: package.json is needed only for "type": "module".
COPY package.json ./
COPY dist ./dist

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8081

# Run node directly so SIGTERM from `docker stop` reaches the agent's graceful shutdown.
CMD ["node", "dist/main.js"]
