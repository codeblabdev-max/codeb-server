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

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S codeb -u 1001 -G nodejs

WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder --chown=codeb:nodejs /app/dist ./dist
COPY --from=builder --chown=codeb:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=codeb:nodejs /app/package.json ./

# Copy VERSION file (copied from parent dir before build)
COPY --chown=codeb:nodejs VERSION ./VERSION

# Create logs directory
RUN mkdir -p /app/logs && chown codeb:nodejs /app/logs

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
