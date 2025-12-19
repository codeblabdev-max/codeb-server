# CodeB API Server v2 Dockerfile
# Multi-stage build for production deployment

FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Final stage
FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    git \
    && rm -rf /var/cache/apk/*

# Create app user
RUN addgroup -g 1001 -S codeb && \
    adduser -S codeb -u 1001

# Create directories
RUN mkdir -p /opt/projects /opt/codeb-backups /opt/codeb && \
    chown -R codeb:codeb /opt/projects /opt/codeb-backups /opt/codeb

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY --chown=codeb:codeb . .

# Make server.js executable
RUN chmod +x server.js

# Switch to non-root user
USER codeb

# Expose port
EXPOSE 3020

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3020/health', (r) => {if(r.statusCode !== 200) process.exit(1)})" || exit 1

# Start server
CMD ["node", "server.js"]
