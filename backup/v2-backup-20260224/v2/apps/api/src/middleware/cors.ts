/**
 * @codeb/api - CORS Configuration Middleware
 *
 * Development: allow all origins
 * Production: restrict to known CodeB domains
 */

import cors from 'cors';

// ============================================================================
// Allowed Origins
// ============================================================================

const PRODUCTION_ORIGINS = [
  'https://codeb.kr',
  'https://api.codeb.kr',
  'https://app.codeb.kr',
  'https://workb.net',
  /\.codeb\.kr$/,
  /\.workb\.net$/,
];

// ============================================================================
// Middleware Factory
// ============================================================================

export function createCorsMiddleware() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    return cors({
      origin: PRODUCTION_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Client-Version', 'X-Correlation-ID'],
      exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
      credentials: true,
      maxAge: 86400,
    });
  }

  // Development: allow all
  return cors();
}
