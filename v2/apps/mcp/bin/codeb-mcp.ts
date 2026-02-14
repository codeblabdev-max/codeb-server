#!/usr/bin/env tsx
/**
 * CodeB MCP Server - Entrypoint
 * Usage: tsx bin/codeb-mcp.ts
 */

import { startMcpServer } from '../src/index.js';

startMcpServer().catch((error: Error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
