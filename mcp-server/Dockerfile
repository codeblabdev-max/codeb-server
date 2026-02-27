# CodeB API Server v9.0
# VERSION은 루트 VERSION 파일이 SSOT — 빌드 전 cp ../VERSION . 실행 필요
# Multi-stage build for minimal image size

# ============================================================================
# Stage 1: Build
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with retry logic for npm issues
RUN for i in 1 2 3; do \
      npm install 2>&1 && break || sleep 5; \
    done && \
    ls -la node_modules/.bin/ && \
    node_modules/.bin/tsc --version

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN node_modules/.bin/tsc

# Prune dev dependencies
RUN npm prune --omit=dev

# ============================================================================
# Stage 2: Production
# ============================================================================
FROM node:20-alpine AS production

# Install Docker CLI (deploy/promote/rollback에서 호스트 Docker 제어 필요)
RUN apk add --no-cache docker-cli

# Security: non-root user (UID/GID 997 = 호스트 codeb 유저와 일치)
RUN addgroup -g 997 -S codeb && \
    adduser -S codeb -u 997 -G codeb

WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder --chown=codeb:codeb /app/dist ./dist
COPY --from=builder --chown=codeb:codeb /app/node_modules ./node_modules
COPY --from=builder --chown=codeb:codeb /app/package.json ./

# Copy VERSION file (copied from parent dir before build)
COPY --chown=codeb:codeb VERSION ./VERSION

# Create logs directory
RUN mkdir -p /app/logs && chown codeb:codeb /app/logs

# Environment
ENV NODE_ENV=production
ENV PORT=9101

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:9101/health || exit 1

# Run as non-root
USER codeb

EXPOSE 9101

CMD ["node", "dist/index.js"]
