/**
 * @codeb/api - Rate Limiting Middleware
 *
 * In-memory sliding window rate limiter per API key.
 * Uses @codeb/auth checkRateLimit when available,
 * falls back to a simple built-in limiter.
 */

import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';

// ============================================================================
// Built-in Rate Limiter (Fallback)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 120; // 120 requests per minute

const limitStore = new Map<string, RateLimitEntry>();

function builtInRateLimit(keyId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = limitStore.get(keyId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    limitStore.set(keyId, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - entry.count),
    resetAt: entry.resetAt,
  };
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limitStore.entries()) {
    if (now > entry.resetAt) {
      limitStore.delete(key);
    }
  }
}, 60_000);

// ============================================================================
// Middleware Factory
// ============================================================================

export function createRateLimitMiddleware() {
  return async function rateLimitMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.auth) {
      next();
      return;
    }

    let rateLimit: { allowed: boolean; remaining: number; resetAt: number };

    try {
      const authModule = await import('@codeb/auth');
      rateLimit = authModule.checkRateLimit(req.auth.keyId);
    } catch {
      // Fallback to built-in rate limiter
      rateLimit = builtInRateLimit(req.auth.keyId);
    }

    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', rateLimit.resetAt.toString());

    if (!rateLimit.allowed) {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
      });
      return;
    }

    next();
  };
}
