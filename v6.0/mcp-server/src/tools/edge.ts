/**
 * CodeB v6.0 - Edge Function Management Tools
 * Deploy, manage, and monitor edge functions
 */

import { z } from 'zod';
import type { AuthContext } from '../lib/types.js';
import type {
  EdgeDeployResult,
  EdgeFunctionManifest,
} from '../lib/edge-types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS } from '../lib/servers.js';

// ============================================================================
// Constants
// ============================================================================

const EDGE_RUNTIME_PORT = 9200;
const EDGE_FUNCTIONS_BASE = '/opt/codeb/edge-functions';
const EDGE_MANIFEST_PATH = (project: string) =>
  `${EDGE_FUNCTIONS_BASE}/${project}/manifest.json`;

// ============================================================================
// Input Schemas
// ============================================================================

export const edgeDeploySchema = z.object({
  projectName: z.string().min(1).max(50).describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).default('staging'),
  functions: z.array(
    z.object({
      name: z.string().min(1).max(50).describe('Function name'),
      code: z.string().min(1).describe('TypeScript/JavaScript code'),
      routes: z.array(z.string()).min(1).describe('Routes to handle'),
      type: z.enum(['middleware', 'api', 'rewrite', 'redirect']).default('api'),
      timeout: z.number().min(1).max(30000).default(10000),
      memory: z.number().min(16).max(128).default(64),
    })
  ),
});

export const edgeListSchema = z.object({
  projectName: z.string().describe('Project name'),
});

export const edgeLogsSchema = z.object({
  projectName: z.string().describe('Project name'),
  functionName: z.string().optional().describe('Filter by function name'),
  tail: z.number().min(1).max(1000).default(100),
});

export const edgeDeleteSchema = z.object({
  projectName: z.string().describe('Project name'),
  functionName: z.string().describe('Function name to delete'),
});

export const edgeInvokeSchema = z.object({
  projectName: z.string().describe('Project name'),
  functionName: z.string().describe('Function name'),
  path: z.string().default('/'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
});

// ============================================================================
// Edge Deploy
// ============================================================================

interface EdgeDeployParams {
  projectName: string;
  environment: 'staging' | 'production' | 'preview';
  functions: Array<{
    name: string;
    code: string;
    routes: string[];
    type?: 'middleware' | 'api' | 'rewrite' | 'redirect';
    timeout?: number;
    memory?: number;
  }>;
}

async function executeEdgeDeploy(
  params: EdgeDeployParams,
  auth: AuthContext
): Promise<EdgeDeployResult> {
  const { projectName, environment, functions } = params;
  const startTime = Date.now();

  // Validate team access
  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  return withSSH(SERVERS.app.ip, async (ssh) => {
    try {
      const deployedFunctions: EdgeDeployResult['functions'] = [];
      const projectDir = `${EDGE_FUNCTIONS_BASE}/${projectName}`;

      // Step 1: Ensure directories exist
      await ssh.exec(`mkdir -p ${projectDir}/functions`);

      // Step 2: Deploy each function
      for (const fn of functions) {
        const functionPath = `${projectDir}/functions/${fn.name}.ts`;

        try {
          // Write function code
          await ssh.writeFile(functionPath, fn.code);

          deployedFunctions.push({
            name: fn.name,
            status: 'deployed',
            url: `https://${projectName}.codeb.dev${fn.routes[0]}`,
          });
        } catch (error) {
          deployedFunctions.push({
            name: fn.name,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Step 3: Generate manifest
      const manifest: EdgeFunctionManifest = {
        version: '1.0',
        projectId: projectName,
        functions: functions.map((fn) => ({
          name: fn.name,
          type: fn.type || 'api',
          routes: fn.routes,
          runtime: 'edge' as const,
          timeout: fn.timeout || 10000,
          memory: fn.memory || 64,
        })),
        routes: functions.flatMap((fn) =>
          fn.routes.map((route) => ({
            src: route,
            dest: fn.name,
          }))
        ),
        updatedAt: new Date().toISOString(),
      };

      await ssh.writeFile(
        EDGE_MANIFEST_PATH(projectName),
        JSON.stringify(manifest, null, 2)
      );

      // Step 4: Generate Caddy config for edge routing
      const caddyConfig = generateEdgeCaddyConfig(projectName, environment, functions);
      const caddyPath = `/etc/caddy/edge/${projectName}.caddy`;
      await ssh.mkdir('/etc/caddy/edge');
      await ssh.writeFile(caddyPath, caddyConfig);

      // Step 5: Reload Caddy
      await ssh.exec('systemctl reload caddy');

      // Step 6: Signal edge runtime to reload
      await ssh.exec(
        `curl -sf -X POST http://localhost:${EDGE_RUNTIME_PORT}/reload?project=${projectName} || true`
      );

      const deploymentId = `edge_${Date.now().toString(36)}`;

      return {
        success: true,
        deploymentId,
        functions: deployedFunctions,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  });
}

// ============================================================================
// Edge List
// ============================================================================

interface EdgeListResult {
  success: boolean;
  functions?: Array<{
    name: string;
    type: string;
    routes: string[];
    runtime: string;
    timeout: number;
    memory: number;
    deployedAt?: string;
    invocations?: number;
  }>;
  error?: string;
}

async function executeEdgeList(
  params: { projectName: string },
  auth: AuthContext
): Promise<EdgeListResult> {
  const { projectName } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  return withSSH(SERVERS.app.ip, async (ssh) => {
    try {
      const manifestPath = EDGE_MANIFEST_PATH(projectName);
      const content = await ssh.readFile(manifestPath);

      if (!content.trim()) {
        return {
          success: true,
          functions: [],
        };
      }

      const manifest: EdgeFunctionManifest = JSON.parse(content);

      return {
        success: true,
        functions: manifest.functions.map((fn) => ({
          name: fn.name,
          type: fn.type,
          routes: fn.routes,
          runtime: fn.runtime,
          timeout: fn.timeout,
          memory: fn.memory,
          deployedAt: manifest.updatedAt,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// ============================================================================
// Edge Logs
// ============================================================================

interface EdgeLogsResult {
  success: boolean;
  logs?: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    functionName: string;
    message: string;
    duration?: number;
    requestId?: string;
  }>;
  error?: string;
}

async function executeEdgeLogs(
  params: { projectName: string; functionName?: string; tail?: number },
  auth: AuthContext
): Promise<EdgeLogsResult> {
  const { projectName, functionName, tail = 100 } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  return withSSH(SERVERS.app.ip, async (ssh) => {
    try {
      const logPath = `/var/log/codeb/edge/${projectName}.log`;
      let cmd = `tail -n ${tail} ${logPath}`;

      if (functionName) {
        cmd += ` | grep '"function":"${functionName}"'`;
      }

      const result = await ssh.exec(cmd);

      if (!result.stdout.trim()) {
        return { success: true, logs: [] };
      }

      const logs = result.stdout
        .trim()
        .split('\n')
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return {
              timestamp: new Date().toISOString(),
              level: 'info' as const,
              functionName: 'unknown',
              message: line,
            };
          }
        });

      return { success: true, logs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// ============================================================================
// Edge Delete
// ============================================================================

interface EdgeDeleteResult {
  success: boolean;
  deleted?: string;
  error?: string;
}

async function executeEdgeDelete(
  params: { projectName: string; functionName: string },
  auth: AuthContext
): Promise<EdgeDeleteResult> {
  const { projectName, functionName } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  return withSSH(SERVERS.app.ip, async (ssh) => {
    try {
      // Read manifest
      const manifestPath = EDGE_MANIFEST_PATH(projectName);
      const content = await ssh.readFile(manifestPath);
      const manifest: EdgeFunctionManifest = JSON.parse(content);

      // Find and remove function
      const fnIndex = manifest.functions.findIndex((f) => f.name === functionName);
      if (fnIndex === -1) {
        return {
          success: false,
          error: `Function ${functionName} not found`,
        };
      }

      // Remove function file
      const functionPath = `${EDGE_FUNCTIONS_BASE}/${projectName}/functions/${functionName}.ts`;
      await ssh.exec(`rm -f ${functionPath}`);

      // Update manifest
      manifest.functions.splice(fnIndex, 1);
      manifest.routes = manifest.routes.filter((r) => r.dest !== functionName);
      manifest.updatedAt = new Date().toISOString();

      await ssh.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Reload edge runtime
      await ssh.exec(
        `curl -sf -X POST http://localhost:${EDGE_RUNTIME_PORT}/reload?project=${projectName} || true`
      );

      return {
        success: true,
        deleted: functionName,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// ============================================================================
// Edge Invoke (for testing)
// ============================================================================

interface EdgeInvokeResult {
  success: boolean;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  duration?: number;
  error?: string;
}

async function executeEdgeInvoke(
  params: {
    projectName: string;
    functionName: string;
    path?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
  auth: AuthContext
): Promise<EdgeInvokeResult> {
  const { projectName, functionName, path = '/', method = 'GET', headers = {}, body } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  return withSSH(SERVERS.app.ip, async (ssh) => {
    try {
      const startTime = Date.now();

      // Build curl command
      const headerArgs = Object.entries(headers)
        .map(([k, v]) => `-H '${k}: ${v}'`)
        .join(' ');

      const bodyArg = body ? `-d '${body}'` : '';

      const cmd = `curl -sf -X ${method} ${headerArgs} ${bodyArg} \
        -w '\\n%{http_code}' \
        http://localhost:${EDGE_RUNTIME_PORT}/${projectName}/${functionName}${path}`;

      const result = await ssh.exec(cmd);
      const lines = result.stdout.trim().split('\n');
      const statusCode = parseInt(lines.pop() || '0', 10);
      const responseBody = lines.join('\n');

      return {
        success: statusCode >= 200 && statusCode < 400,
        status: statusCode,
        body: responseBody,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// ============================================================================
// Edge Metrics
// ============================================================================

interface EdgeMetricsResult {
  success: boolean;
  data?: {
    functionName: string;
    period: string;
    invocations: number;
    errors: number;
    avgDuration: number;
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    coldStarts: number;
    memoryAvg: number;
    memoryMax: number;
  };
  error?: string;
}

async function executeEdgeMetrics(
  params: { projectName: string; functionName: string; period?: string },
  auth: AuthContext
): Promise<EdgeMetricsResult> {
  const { projectName, functionName, period = '1h' } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  // Query Prometheus for edge function metrics
  const prometheusUrl = `http://${SERVERS.backup.ip}:9090`;

  try {
    const queries = {
      invocations: `sum(increase(codeb_edge_invocations_total{project="${projectName}",function="${functionName}"}[${period}]))`,
      errors: `sum(increase(codeb_edge_invocations_total{project="${projectName}",function="${functionName}",status="error"}[${period}]))`,
      avgDuration: `avg(rate(codeb_edge_duration_seconds_sum{project="${projectName}",function="${functionName}"}[${period}]) / rate(codeb_edge_duration_seconds_count{project="${projectName}",function="${functionName}"}[${period}]))`,
      p50Duration: `histogram_quantile(0.50, rate(codeb_edge_duration_seconds_bucket{project="${projectName}",function="${functionName}"}[${period}]))`,
      p95Duration: `histogram_quantile(0.95, rate(codeb_edge_duration_seconds_bucket{project="${projectName}",function="${functionName}"}[${period}]))`,
      p99Duration: `histogram_quantile(0.99, rate(codeb_edge_duration_seconds_bucket{project="${projectName}",function="${functionName}"}[${period}]))`,
      coldStarts: `sum(increase(codeb_edge_cold_starts_total{project="${projectName}",function="${functionName}"}[${period}]))`,
    };

    const results: Record<string, number> = {};

    for (const [key, query] of Object.entries(queries)) {
      const response = await fetch(
        `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`
      );
      const data = (await response.json()) as {
        data?: { result?: Array<{ value?: [number, string] }> };
      };
      results[key] = parseFloat(data.data?.result?.[0]?.value?.[1] || '0');
    }

    return {
      success: true,
      data: {
        functionName,
        period,
        invocations: Math.round(results.invocations || 0),
        errors: Math.round(results.errors || 0),
        avgDuration: Math.round((results.avgDuration || 0) * 1000),
        p50Duration: Math.round((results.p50Duration || 0) * 1000),
        p95Duration: Math.round((results.p95Duration || 0) * 1000),
        p99Duration: Math.round((results.p99Duration || 0) * 1000),
        coldStarts: Math.round(results.coldStarts || 0),
        memoryAvg: 0,
        memoryMax: 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateEdgeCaddyConfig(
  projectName: string,
  environment: string,
  functions: Array<{ name: string; routes: string[] }>
): string {
  const timestamp = new Date().toISOString();
  const domain =
    environment === 'production'
      ? `${projectName}.codeb.dev`
      : `${projectName}-${environment}.codeb.dev`;

  const routeMatchers = functions
    .flatMap((fn) =>
      fn.routes.map((route) => {
        // Convert glob to Caddy path matcher
        const caddyRoute = route.replace(/\*/g, '*');
        return `        path ${caddyRoute}`;
      })
    )
    .join('\n');

  return `# CodeB v6.0 - Edge Functions Config
# Project: ${projectName}
# Environment: ${environment}
# Generated: ${timestamp}

${domain} {
    # Edge function routes
    @edge {
${routeMatchers}
    }

    handle @edge {
        reverse_proxy localhost:${EDGE_RUNTIME_PORT} {
            header_up X-Edge-Project ${projectName}
            header_up X-Edge-Environment ${environment}
            header_up X-Original-Host {host}
            header_up X-Request-Start {time.now.unix_ms}

            transport http {
                read_timeout 30s
                dial_timeout 5s
            }
        }
    }

    # Non-edge routes handled by main app
    handle {
        # Import main project config
        import /etc/caddy/sites/${projectName}-${environment}.caddy
    }
}
`;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const edgeDeployTool = {
  name: 'edge_deploy',
  description: 'Deploy edge functions for a project (Vercel-style edge runtime)',
  inputSchema: edgeDeploySchema,

  async execute(params: z.infer<typeof edgeDeploySchema>, auth: AuthContext) {
    return executeEdgeDeploy(params, auth);
  },
};

export const edgeListTool = {
  name: 'edge_list',
  description: 'List all edge functions for a project',
  inputSchema: edgeListSchema,

  async execute(params: z.infer<typeof edgeListSchema>, auth: AuthContext) {
    return executeEdgeList(params, auth);
  },
};

export const edgeLogsTool = {
  name: 'edge_logs',
  description: 'View edge function logs',
  inputSchema: edgeLogsSchema,

  async execute(params: z.infer<typeof edgeLogsSchema>, auth: AuthContext) {
    return executeEdgeLogs(params, auth);
  },
};

export const edgeDeleteTool = {
  name: 'edge_delete',
  description: 'Delete an edge function',
  inputSchema: edgeDeleteSchema,

  async execute(params: z.infer<typeof edgeDeleteSchema>, auth: AuthContext) {
    return executeEdgeDelete(params, auth);
  },
};

export const edgeInvokeTool = {
  name: 'edge_invoke',
  description: 'Invoke an edge function for testing',
  inputSchema: edgeInvokeSchema,

  async execute(params: z.infer<typeof edgeInvokeSchema>, auth: AuthContext) {
    return executeEdgeInvoke(params, auth);
  },
};

export const edgeMetricsTool = {
  name: 'edge_metrics',
  description: 'Get edge function metrics and performance data',
  inputSchema: z.object({
    projectName: z.string(),
    functionName: z.string(),
    period: z.string().optional(),
  }),

  async execute(
    params: { projectName: string; functionName: string; period?: string },
    auth: AuthContext
  ) {
    return executeEdgeMetrics(params, auth);
  },
};
