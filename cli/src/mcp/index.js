#!/usr/bin/env node
/**
 * CodeB MCP Proxy Server v7.0
 *
 * This MCP server is a proxy to the CodeB HTTP API.
 * No SSH connections - all operations go through API with API Key authentication.
 *
 * Architecture:
 *   Claude Code → MCP Proxy → HTTP API (api.codeb.kr) → Server
 *
 * Benefits:
 *   - Team members don't need SSH access
 *   - API Key based authentication (like Vercel)
 *   - Centralized access control
 *   - Audit logging on API side
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let VERSION = '0.0.0';
try {
  // VERSION 파일에서 읽기 (SSOT)
  const versionPaths = [
    join(__dirname, '../../VERSION'),
    join(__dirname, '../../../VERSION'),
    join(process.cwd(), 'VERSION'),
  ];
  for (const p of versionPaths) {
    if (existsSync(p)) {
      VERSION = readFileSync(p, 'utf-8').trim();
      break;
    }
  }
  // VERSION 파일이 없으면 package.json에서 읽기
  if (VERSION === '0.0.0') {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
    VERSION = pkg.version;
  }
} catch {
  // Use default version
}

// ============================================================================
// Configuration
// ============================================================================

// Load API key from multiple sources (priority order)
function loadApiKey() {
  // 1. First check project .env file (highest priority - project specific)
  try {
    const projectEnvPath = join(process.cwd(), '.env');
    if (existsSync(projectEnvPath)) {
      const content = readFileSync(projectEnvPath, 'utf-8');
      const match = content.match(/^CODEB_API_KEY=(.+)$/m);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {
    // Ignore read errors
  }

  // 2. Then check environment variable
  if (process.env.CODEB_API_KEY) {
    return process.env.CODEB_API_KEY;
  }

  // 3. Then check ~/.codeb/config.json (set by 'we init')
  try {
    const configPath = join(homedir(), '.codeb', 'config.json');
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      if (config.CODEB_API_KEY) {
        return config.CODEB_API_KEY;
      }
    }
  } catch {
    // Ignore parse errors
  }

  // 4. Then check ~/.codeb/.env file (legacy)
  try {
    const envPath = join(homedir(), '.codeb', '.env');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      const match = content.match(/^CODEB_API_KEY=(.+)$/m);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {
    // Ignore read errors
  }

  return '';
}

// Normalize API URL - remove trailing /api if present
const rawApiUrl = process.env.CODEB_API_URL || 'https://api.codeb.kr';
const API_URL = rawApiUrl.replace(/\/api\/?$/, '');
const API_KEY = loadApiKey();

// ============================================================================
// HTTP API Client
// ============================================================================

async function callApi(tool, params = {}) {
  if (!API_KEY) {
    throw new Error('API Key not configured. Run: we init <YOUR_API_KEY>');
  }

  const response = await fetch(`${API_URL}/api/tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({ tool, params }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text || 'Unknown error'}`);
  }

  return response.json();
}

// ============================================================================
// MCP Tool Definitions
// ============================================================================

const TOOLS = [
  // ────────────────────────────────────────────────────────────────────────────
  // Core Deployment Tools
  // ────────────────────────────────────────────────────────────────────────────
  {
    name: 'deploy_project',
    description: 'Deploy a project to staging or production environment using Blue-Green deployment',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], description: 'Target environment' },
        version: { type: 'string', description: 'Version tag (optional)' },
        image: { type: 'string', description: 'Docker image to deploy (optional)' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'slot_promote',
    description: 'Promote the inactive slot to active (switch traffic)',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], description: 'Target environment' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rollback',
    description: 'Rollback to the previous version (switch back to grace slot)',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], description: 'Target environment' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'slot_status',
    description: 'Get the current status of Blue-Green deployment slots',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], description: 'Target environment' },
      },
      required: ['projectName'],
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Workflow Tools (CI/CD Generation)
  // ────────────────────────────────────────────────────────────────────────────
  {
    name: 'workflow_init',
    description: 'Initialize project with Quadlet containers, Dockerfile, and GitHub Actions workflow',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        type: { type: 'string', enum: ['nextjs', 'remix', 'nodejs', 'python', 'go'], default: 'nextjs' },
        database: { type: 'boolean', default: true, description: 'Include PostgreSQL database' },
        redis: { type: 'boolean', default: true, description: 'Include Redis cache' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'workflow_scan',
    description: 'Scan project for existing workflow configuration and resources',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
      },
      required: ['projectName'],
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Domain Management
  // ────────────────────────────────────────────────────────────────────────────
  {
    name: 'domain_setup',
    description: 'Setup domain with DNS and SSL certificate',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        domain: { type: 'string', description: 'Domain name (e.g., myapp.codeb.kr)' },
        environment: { type: 'string', enum: ['staging', 'production'], default: 'production' },
      },
      required: ['projectName', 'domain'],
    },
  },
  {
    name: 'domain_list',
    description: 'List all domains for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name (optional, lists all if not specified)' },
      },
    },
  },
  {
    name: 'domain_delete',
    description: 'Delete a domain configuration',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        domain: { type: 'string', description: 'Domain to delete' },
      },
      required: ['projectName', 'domain'],
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // Health & Monitoring
  // ────────────────────────────────────────────────────────────────────────────
  {
    name: 'health_check',
    description: 'Check health status of the CodeB infrastructure',
    inputSchema: {
      type: 'object',
      properties: {
        server: { type: 'string', enum: ['app', 'streaming', 'storage', 'backup', 'all'], default: 'all' },
      },
    },
  },
  {
    name: 'scan',
    description: 'Scan project for configuration issues and deployment readiness',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
      },
      required: ['projectName'],
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // ENV Management
  // ────────────────────────────────────────────────────────────────────────────
  {
    name: 'env_scan',
    description: 'Compare local and server environment variables',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'env_restore',
    description: 'Restore environment variables from backup',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], default: 'production' },
        version: { type: 'string', enum: ['master', 'current'], default: 'master' },
      },
      required: ['projectName'],
    },
  },
];

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server(
  {
    name: 'codeb-deploy',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Execute tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    // Map MCP tool names to API tool names
    const apiToolMap = {
      deploy_project: 'deploy',
      slot_promote: 'promote',
      workflow_init: 'workflow_init',
      workflow_scan: 'workflow_scan',
      scan: 'workflow_scan',
      health_check: 'health_check',
    };

    const apiTool = apiToolMap[name] || name;
    const result = await callApi(apiTool, args);

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${result.error || 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// ============================================================================
// Main
// ============================================================================

export async function startMcpServer() {
  // Start MCP server immediately - no blocking health checks
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr only after successful connection (like other MCP servers)
  console.error(`CodeB MCP Server v${VERSION} running on stdio`);
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startMcpServer().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}
