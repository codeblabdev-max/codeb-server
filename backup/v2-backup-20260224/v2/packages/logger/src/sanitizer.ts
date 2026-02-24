/**
 * @codeb/logger - Sensitive Data Sanitizer
 * Masks sensitive fields in log output
 */

export const SENSITIVE_KEYS = [
  'password',
  'apiKey',
  'api_key',
  'secret',
  'token',
  'authorization',
  'x-api-key',
  'database_url',
  'redis_url',
  'private_key',
] as const;

/**
 * Recursively mask sensitive data in objects.
 * Partially reveals long values (first 4 and last 4 chars).
 */
export function maskSensitiveData(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(maskSensitiveData);
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
      if (typeof value === 'string' && value.length > 8) {
        masked[key] = `${value.slice(0, 4)}****${value.slice(-4)}`;
      } else {
        masked[key] = '****';
      }
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
