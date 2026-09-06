# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:26-trixie-slim AS build

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY public ./public
RUN npm run build
RUN npm prune --omit=dev

FROM node:26-trixie-slim AS runtime

LABEL org.opencontainers.image.title="ProofGate" \
      org.opencontainers.image.description="Read-only release and experiment control room built with concurrent Mozaik agents" \
      org.opencontainers.image.url="https://github.com/fortemate/proofgate" \
      org.opencontainers.image.source="https://github.com/fortemate/proofgate" \
      org.opencontainers.image.documentation="https://github.com/fortemate/proofgate#readme" \
      org.opencontainers.image.vendor="Fortemate" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.authors="Jegors Čemisovs" \
      org.opencontainers.image.base.name="docker.io/library/node:26-trixie-slim"

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app app

WORKDIR /app

COPY --from=build --chown=app:app /build/package.json /build/package-lock.json ./
COPY --from=build --chown=app:app /build/node_modules ./node_modules
COPY --from=build --chown=app:app /build/dist ./dist
COPY --from=build --chown=app:app /build/public ./public

USER app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    MAX_CONCURRENT_RUNS=2

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "dist/server.js"]
