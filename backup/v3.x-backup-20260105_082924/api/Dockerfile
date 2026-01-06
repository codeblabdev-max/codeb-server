FROM node:20-alpine

WORKDIR /app

# Install SSH client for server communication
RUN apk add --no-cache openssh-client curl jq

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source files
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV MCP_HTTP_PORT=9100

# Expose MCP HTTP API port
EXPOSE 9100

CMD ["node", "mcp-http-api.js"]
