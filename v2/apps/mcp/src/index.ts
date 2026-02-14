/**
 * @codeb/mcp - MCP Stdio Server
 *
 * Claude Code ↔ MCP Stdio ↔ HTTP API (api.codeb.kr)
 * Based on cli/src/mcp/index.js (lines 325-413)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { getVersion, checkServerVersion } from '@codeb/shared';

import { callApi } from './api-client.js';
import { TOOLS, API_TOOL_MAP } from './tools.js';

// ============================================================================
// Version (SSOT from @codeb/shared → VERSION file)
// ============================================================================

const VERSION = getVersion();

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server(
  { name: 'codeb-deploy', version: VERSION },
  { capabilities: { tools: {} } },
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Execute tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    const apiTool = API_TOOL_MAP[name] || name;
    const result = await callApi(apiTool, args as Record<string, unknown>);

    if (!result.success) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${result.error || 'Unknown error'}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ============================================================================
// Start Server
// ============================================================================

export async function startMcpServer(): Promise<void> {
  // Server version check (API 서버가 SSOT)
  const check = await checkServerVersion(VERSION);

  if (!check.compatible) {
    console.error(`FATAL: Version mismatch - server v${check.serverVersion} vs MCP v${check.clientVersion}`);
    console.error(check.message || 'Update required');
    process.exit(1);
  }

  if (check.updateRequired) {
    console.error(`[WARN] Update available: MCP v${check.clientVersion} -> v${check.serverVersion}`);
    console.error(check.message || '');
  }

  if (check.serverUnreachable) {
    console.error('[WARN] API server unreachable - some tools may fail');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`CodeB MCP Server v${VERSION} running on stdio (server: v${check.serverVersion})`);
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startMcpServer().catch((error: Error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}
