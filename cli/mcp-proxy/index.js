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
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
// ============================================================================
// Configuration
// ============================================================================
// Load API key from multiple sources (priority order)
function loadApiKey() {
    // 1. First check project .env file (highest priority - project specific)
    const projectEnvPath = join(process.cwd(), '.env');
    if (existsSync(projectEnvPath)) {
        try {
            const content = readFileSync(projectEnvPath, 'utf-8');
            const match = content.match(/^CODEB_API_KEY=(.+)$/m);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        catch {
            // Ignore read errors
        }
    }
    // 2. Then check environment variable
    if (process.env.CODEB_API_KEY) {
        return process.env.CODEB_API_KEY;
    }
    // 3. Then check ~/.codeb/config.json (set by 'we init')
    const configPath = join(homedir(), '.codeb', 'config.json');
    if (existsSync(configPath)) {
        try {
            const content = readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content);
            if (config.CODEB_API_KEY) {
                return config.CODEB_API_KEY;
            }
        }
        catch {
            // Ignore parse errors
        }
    }
    // 4. Then check ~/.codeb/.env file (legacy)
    const envPath = join(homedir(), '.codeb', '.env');
    if (existsSync(envPath)) {
        try {
            const content = readFileSync(envPath, 'utf-8');
            const match = content.match(/^CODEB_API_KEY=(.+)$/m);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        catch {
            // Ignore read errors
        }
    }
    return '';
}
const API_URL = process.env.CODEB_API_URL || 'https://api.codeb.kr';
const API_KEY = loadApiKey();
if (!API_KEY) {
    console.error('═'.repeat(60));
    console.error('❌ ERROR: CodeB API Key가 설정되지 않았습니다');
    console.error('═'.repeat(60));
    console.error('');
    console.error('🔑 API 키 설정 방법 (우선순위 순):');
    console.error('');
    console.error('   1. 프로젝트 .env 파일에 추가 (권장):');
    console.error('      echo "CODEB_API_KEY=codeb_팀ID_역할_토큰" >> .env');
    console.error('');
    console.error('   2. 환경변수로 설정:');
    console.error('      export CODEB_API_KEY=codeb_팀ID_역할_토큰');
    console.error('');
    console.error('   3. we init 명령어 실행 (글로벌 설정):');
    console.error('      npx @codeblabdev-max/we-cli init codeb_팀ID_역할_토큰');
    console.error('');
    console.error('═'.repeat(60));
    process.exit(1);
}
async function callApi(tool, params = {}) {
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
        throw new Error(`API request failed: ${response.status} - ${text}`);
    }
    return response.json();
}
async function checkHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        return data.success === true || data.status === 'healthy';
    }
    catch {
        return false;
    }
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
                domain: { type: 'string', description: 'Domain name (e.g., myapp.codeb.dev)' },
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
const server = new Server({
    name: 'codeb-deploy',
    version: '7.0.8',
}, {
    capabilities: {
        tools: {},
    },
});
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
            health_check: 'slot_list', // Returns system status
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
    }
    catch (error) {
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
async function main() {
    // Check API health before starting
    const healthy = await checkHealth();
    if (!healthy) {
        console.error(`WARNING: CodeB API at ${API_URL} is not responding`);
        console.error('The MCP server will start but API calls may fail');
    }
    // Start MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`CodeB MCP Proxy v7.0.8 started`);
    console.error(`API URL: ${API_URL}`);
    console.error(`API Key: ${API_KEY.slice(0, 20)}...`);
}
main().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
});
