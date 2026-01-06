# CodeB API Server v6.0
# Multi-stage build for minimal image size

# ============================================================================
# Stage 1: Build
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production=false

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

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
