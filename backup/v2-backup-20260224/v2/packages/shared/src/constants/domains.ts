/**
 * @codeb/shared - Domain Constants
 */

/** All supported domain zones managed by CodeB */
export const SUPPORTED_DOMAINS = [
  'codeb.kr',
  'workb.net',
  'workb.xyz',
  'one-q.xyz',
  'vsvs.kr',
  'wdot.kr',
  'w-w-w.kr',
] as const;

/** Default base domain for CodeB services */
export const BASE_DOMAIN = 'codeb.kr' as const;

export type SupportedDomain = (typeof SUPPORTED_DOMAINS)[number];
