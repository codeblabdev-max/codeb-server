# Multi-stage build for CodeB Server
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY . .

# Production stage
FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    podman \
    git \
    openssh-client \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S codeb && \
    adduser -u 1001 -S codeb -G codeb

WORKDIR /app

# Copy from builder
COPY --from=builder --chown=codeb:codeb /app/node_modules ./node_modules
COPY --chown=codeb:codeb . .

# Create necessary directories
RUN mkdir -p /app/data /app/logs /app/.codeb-checkpoint && \
    chown -R codeb:codeb /app

# Switch to non-root user
USER codeb

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if(r.statusCode !== 200) process.exit(1)})" || exit 1

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "codeb-unified-server.js"]