/**
 * CodeB v5.0 - MCP Server
 * Blue-Green Deployment System
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Tools
import { deployTool, executeDeploy } from './tools/deploy.js';
import { promoteTool, executePromote } from './tools/promote.js';
import { rollbackTool, executeRollback } from './tools/rollback.js';
import {
  slotStatusTool,
  slotCleanupTool,
  slotListTool,
  executeSlotStatus,
  executeSlotCleanup,
  executeSlotList,
} from './tools/slot.js';
import {
  envGetTool,
  envSetTool,
  envRestoreTool,
  envHistoryTool,
  executeEnvGet,
  executeEnvSet,
  executeEnvRestore,
  executeEnvHistory,
} from './tools/env.js';

// ============================================================================
// Tool Registry
// ============================================================================

const TOOLS = {
  deploy: { definition: deployTool, execute: executeDeploy },
  promote: { definition: promoteTool, execute: executePromote },
  rollback: { definition: rollbackTool, execute: executeRollback },
  slot_status: { definition: slotStatusTool, execute: executeSlotStatus },
  slot_cleanup: { definition: slotCleanupTool, execute: executeSlotCleanup },
  slot_list: { definition: slotListTool, execute: executeSlotList },
  env_get: { definition: envGetTool, execute: executeEnvGet },
  env_set: { definition: envSetTool, execute: executeEnvSet },
  env_restore: { definition: envRestoreTool, execute: executeEnvRestore },
  env_history: { definition: envHistoryTool, execute: executeEnvHistory },
};

// ============================================================================
// Server Setup
// ============================================================================

const server = new Server(
  {
    name: 'codeb-mcp-server',
    version: '5.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// List Tools Handler
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.values(TOOLS).map(({ definition }) => ({
      name: definition.name,
      description: definition.description,
      inputSchema: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(definition.inputSchema.shape || {}).map(([key, value]) => [
            key,
            {
              type: getZodType(value),
              description: (value as any)?.description || '',
            },
          ])
        ),
        required: Object.keys(definition.inputSchema.shape || {}).filter(
          (key) => !(definition.inputSchema.shape as any)?.[key]?.isOptional?.()
        ),
      },
    })),
  };
});

// ============================================================================
// Call Tool Handler
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = TOOLS[name as keyof typeof TOOLS];

  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `Unknown tool: ${name}` }),
        },
      ],
    };
  }

  try {
    const result = await tool.execute(args as any);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
    };
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function getZodType(zodSchema: any): string {
  if (!zodSchema) return 'string';

  const typeName = zodSchema._def?.typeName;
  switch (typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodArray':
      return 'array';
    case 'ZodObject':
      return 'object';
    case 'ZodEnum':
      return 'string';
    case 'ZodOptional':
      return getZodType(zodSchema._def?.innerType);
    default:
      return 'string';
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CodeB MCP Server v5.0 running...');
}

main().catch(console.error);
