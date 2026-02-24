/**
 * @codeb/auth - Rate Limiter
 * In-memory sliding window rate limiter
 * Based on mcp-server/src/lib/auth.ts
 */

// ============================================================================
// Types
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitConfig {
  requests: number;
  window: number; // seconds
}

// ============================================================================
// Store
// ============================================================================

export const rateLimitStore: Map<string, RateLimitEntry> = new Map();

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requests: 100,
  window: 60, // 1 minute
};

// ============================================================================
// Rate Limit Check
// ============================================================================

/** Check rate limit for a given key (typically API key ID) */
export function checkRateLimit(
  keyId: string,
  customLimit?: RateLimitConfig,
): RateLimitResult {
  const limit = customLimit || DEFAULT_RATE_LIMIT;
  const now = Date.now();
  const windowMs = limit.window * 1000;

  let entry = rateLimitStore.get(keyId);

  // Reset if window expired
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitStore.set(keyId, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= limit.requests,
    remaining: Math.max(0, limit.requests - entry.count),
    resetAt: entry.resetAt,
  };
}
