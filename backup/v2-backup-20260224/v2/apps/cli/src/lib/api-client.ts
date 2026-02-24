/**
 * @codeb/cli - HTTP API Client
 *
 * Communicates with the CodeB API server (POST /api/tool).
 * Handles authentication, error handling, and version checking.
 *
 * Refactored from cli/src/lib/mcp-client.js
 */

import { loadConfig } from './config.js';

// ============================================================================
// Types
// ============================================================================

export interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  duration?: number;
  timestamp?: string;
  correlationId?: string;
  versionWarning?: string;
  latestVersion?: string;
  [key: string]: unknown;
}

// ============================================================================
// API Client
// ============================================================================

/**
 * Call a tool on the CodeB API server.
 *
 * @param tool - Tool name (e.g., 'deploy_project', 'slot_status')
 * @param params - Tool parameters
 * @returns API response
 */
export async function callApi(
  tool: string,
  params: Record<string, unknown>,
): Promise<ApiResponse> {
  const config = await loadConfig();
  const url = `${config.apiUrl}/api/tool`;

  if (!config.apiKey) {
    throw new Error('API key not configured. Run: we init <apiKey>');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
      'X-Client-Version': config.version || '0.0.0',
    },
    body: JSON.stringify({ tool, params }),
    signal: AbortSignal.timeout(120_000), // 2 minute timeout
  });

  if (!response.ok) {
    const body = await response.text();
    let errorMessage: string;

    try {
      const json = JSON.parse(body);
      errorMessage = json.error || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${body.slice(0, 200)}`;
    }

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as ApiResponse;

  // Print version warning if present
  if (result.versionWarning) {
    const chalk = await import('chalk');
    console.log(chalk.default.yellow(`\n  ${result.versionWarning}\n`));
  }

  return result;
}

/**
 * Fetch health check endpoint (no auth required).
 */
export async function fetchHealth(): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  const url = `${config.apiUrl}/health`;

  const headers: Record<string, string> = {};
  if (config.version) {
    headers['X-Client-Version'] = config.version;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}
