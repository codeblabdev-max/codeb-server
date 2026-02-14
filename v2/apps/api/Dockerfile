# ============================================================================
# CodeB API Server - Multi-stage Monorepo Build
# ============================================================================
# Build from v2/ root: docker build -f apps/api/Dockerfile .
# ============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./

# Copy all package/feature package.json files for dependency resolution
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/ssh/package.json packages/ssh/
COPY packages/auth/package.json packages/auth/
COPY packages/logger/package.json packages/logger/
COPY features/deployment/package.json features/deployment/
COPY features/domain/package.json features/domain/
COPY features/environment/package.json features/environment/
COPY features/project/package.json features/project/
COPY features/team/package.json features/team/
COPY features/monitoring/package.json features/monitoring/
COPY apps/api/package.json apps/api/

# Install all dependencies (monorepo-aware)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/ packages/
COPY features/ features/
COPY apps/api/ apps/api/

# Build all packages in dependency order
RUN pnpm --filter @codeb/api... build

# Prune to production dependencies
RUN pnpm --filter @codeb/api --prod deploy /app/pruned

# ============================================================================
# Stage 2: Production
# ============================================================================
FROM node:20-alpine AS runner

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S codeb -u 1001 -G nodejs

WORKDIR /app

# Copy pruned production build
COPY --from=builder --chown=codeb:nodejs /app/pruned ./

# Copy built dist files from each package
COPY --from=builder --chown=codeb:nodejs /app/packages/shared/dist packages/shared/dist
COPY --from=builder --chown=codeb:nodejs /app/packages/db/dist packages/db/dist
COPY --from=builder --chown=codeb:nodejs /app/packages/ssh/dist packages/ssh/dist
COPY --from=builder --chown=codeb:nodejs /app/packages/auth/dist packages/auth/dist
COPY --from=builder --chown=codeb:nodejs /app/packages/logger/dist packages/logger/dist
COPY --from=builder --chown=codeb:nodejs /app/features/deployment/dist features/deployment/dist
COPY --from=builder --chown=codeb:nodejs /app/features/domain/dist features/domain/dist
COPY --from=builder --chown=codeb:nodejs /app/features/environment/dist features/environment/dist
COPY --from=builder --chown=codeb:nodejs /app/features/project/dist features/project/dist
COPY --from=builder --chown=codeb:nodejs /app/features/team/dist features/team/dist
COPY --from=builder --chown=codeb:nodejs /app/features/monitoring/dist features/monitoring/dist
COPY --from=builder --chown=codeb:nodejs /app/apps/api/dist apps/api/dist

# Copy VERSION file
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

CMD ["node", "apps/api/dist/index.js"]
