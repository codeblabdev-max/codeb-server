/**
 * CodeB v6.0 - Edge Function Types
 * Vercel-style Edge Runtime with Deno
 */

// ============================================================================
// Edge Function Types
// ============================================================================

export type EdgeFunctionType = 'middleware' | 'api' | 'rewrite' | 'redirect';

export type EdgeRegion =
  | 'iad1' // US East (Virginia)
  | 'sfo1' // US West (California)
  | 'hnd1' // Asia (Tokyo)
  | 'icn1' // Asia (Seoul)
  | 'sin1' // Asia (Singapore)
  | 'fra1' // Europe (Frankfurt)
  | 'lhr1' // Europe (London)
  | 'syd1' // Australia (Sydney)
  | 'gru1' // South America (Sao Paulo)
  | 'all'; // Global (all regions)

export interface EdgeFunctionConfig {
  name: string;
  type: EdgeFunctionType;
  routes: string[];                    // Glob patterns: '/api/*', '/dashboard/*'
  runtime: 'edge';
  timeout: number;                     // Max 30000ms for edge
  memory: number;                      // Max 128MB
  regions?: EdgeRegion[];              // Deploy regions (default: 'all')
  env?: Record<string, string>;        // Environment variables
  cron?: string;                       // Cron schedule for scheduled functions
}

export interface EdgeFunctionManifest {
  version: '1.0';
  projectId: string;
  functions: EdgeFunctionConfig[];
  routes: EdgeRouteMapping[];
  updatedAt: string;
}

export interface EdgeRouteMapping {
  src: string;                         // Route pattern (regex supported)
  dest: string;                        // Function name or upstream
  methods?: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS')[];
  headers?: Record<string, string>;
  continue?: boolean;                  // Continue to next route after handling
}

// ============================================================================
// Edge Request/Response Types
// ============================================================================

export interface EdgeGeoInfo {
  country?: string;                    // ISO 3166-1 alpha-2 code
  countryName?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

export interface EdgeFunctionRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: ReadableStream<Uint8Array>;
  geo?: EdgeGeoInfo;
  ip?: string;

  // Request metadata
  nextUrl?: {
    pathname: string;
    search: string;
    searchParams: URLSearchParams;
  };
}

export interface EdgeFunctionResponse {
  status: number;
  headers: Record<string, string>;
  body?: ReadableStream<Uint8Array> | string;
}

// ============================================================================
// Middleware Types
// ============================================================================

export type EdgeMiddlewareResult =
  | { type: 'next'; headers?: Record<string, string> }
  | { type: 'rewrite'; destination: string }
  | { type: 'redirect'; destination: string; status: 301 | 302 | 307 | 308 }
  | { type: 'response'; response: EdgeFunctionResponse };

export interface EdgeMiddleware {
  (request: EdgeFunctionRequest): Promise<EdgeMiddlewareResult>;
}

// ============================================================================
// Edge API Handler Types
// ============================================================================

export interface EdgeAPIHandler {
  (request: EdgeFunctionRequest): Promise<EdgeFunctionResponse>;
}

export interface EdgeAPIConfig {
  runtime: 'edge';
  regions?: EdgeRegion[];
  maxDuration?: number;                // in seconds
}

// ============================================================================
// Edge Deployment Types
// ============================================================================

export interface EdgeDeployInput {
  projectName: string;
  environment: 'staging' | 'production' | 'preview';
  functions: Array<{
    name: string;
    code: string;                      // TypeScript/JavaScript code
    config: EdgeFunctionConfig;
  }>;
}

export interface EdgeDeployResult {
  success: boolean;
  deploymentId?: string;
  functions?: Array<{
    name: string;
    status: 'deployed' | 'failed';
    url?: string;
    error?: string;
  }>;
  duration?: number;
  error?: string;
}

export interface EdgeInvocationMetric {
  functionName: string;
  projectId: string;
  region: EdgeRegion;
  timestamp: string;
  duration: number;                    // in ms
  coldStart: boolean;
  status: 'success' | 'error';
  errorType?: string;
  memory: number;                      // Peak memory in bytes
}

// ============================================================================
// Edge Runtime Container Types
// ============================================================================

export interface EdgeRuntimeConfig {
  host: string;
  port: number;
  maxConcurrent: number;               // Max concurrent function invocations
  isolateTimeout: number;              // Isolate timeout in ms
  memoryLimit: number;                 // Per-isolate memory limit in MB
}

export interface EdgeIsolate {
  id: string;
  functionName: string;
  createdAt: number;
  lastUsedAt: number;
  invocations: number;
  memory: number;
  status: 'idle' | 'running' | 'terminated';
}

// ============================================================================
// Edge Cache Types
// ============================================================================

export interface EdgeCacheConfig {
  enabled: boolean;
  ttl: number;                         // Default TTL in seconds
  staleWhileRevalidate?: number;       // SWR duration
  tags?: string[];                     // Cache tags for invalidation
}

export interface EdgeCacheEntry {
  key: string;
  value: Uint8Array;
  headers: Record<string, string>;
  createdAt: number;
  expiresAt: number;
  tags: string[];
}
