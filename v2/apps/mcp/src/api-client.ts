/**
 * @codeb/mcp - HTTP API Proxy Client
 *
 * Loads API key and proxies requests to the CodeB HTTP API.
 * Based on cli/src/mcp/index.js (lines 61-141)
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ============================================================================
// API Key Loading
// ============================================================================

function loadApiKey(): string {
  // 1. Project .env file (highest priority)
  try {
    const projectEnvPath = join(process.cwd(), '.env');
    if (existsSync(projectEnvPath)) {
      const content = readFileSync(projectEnvPath, 'utf-8');
      const match = content.match(/^CODEB_API_KEY=(.+)$/m);
      if (match?.[1]) return match[1].trim();
    }
  } catch {
    // Ignore read errors
  }

  // 2. Environment variable
  if (process.env.CODEB_API_KEY) {
    return process.env.CODEB_API_KEY;
  }

  // 3. ~/.codeb/config.json (set by 'we init')
  try {
    const configPath = join(homedir(), '.codeb', 'config.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      // config.ts의 saveConfig()는 'apiKey' 필드명으로 저장
      if (typeof config.apiKey === 'string' && config.apiKey) return config.apiKey;
      // 하위 호환: 이전 버전에서 CODEB_API_KEY로 저장한 경우
      if (typeof config.CODEB_API_KEY === 'string') return config.CODEB_API_KEY;
    }
  } catch {
    // Ignore parse errors
  }

  // 4. ~/.codeb/.env (legacy)
  try {
    const envPath = join(homedir(), '.codeb', '.env');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      const match = content.match(/^CODEB_API_KEY=(.+)$/m);
      if (match?.[1]) return match[1].trim();
    }
  } catch {
    // Ignore read errors
  }

  return '';
}

// ============================================================================
// API Client
// ============================================================================

const rawApiUrl = process.env.CODEB_API_URL || 'https://api.codeb.kr';
const API_URL = rawApiUrl.replace(/\/api\/?$/, '');
const API_KEY = loadApiKey();

export interface ApiResponse {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function callApi(
  tool: string,
  params: Record<string, unknown> = {},
): Promise<ApiResponse> {
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

  return response.json() as Promise<ApiResponse>;
}
