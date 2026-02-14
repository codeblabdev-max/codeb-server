/**
 * @codeb/shared - Constants
 * Re-export all constants
 */

export {
  SERVERS,
  PORT_RANGES,
  getSlotPorts,
  getServer,
  generateSecurePassword,
  generateConnectionStrings,
} from './servers.js';

export {
  SUPPORTED_DOMAINS,
  BASE_DOMAIN,
  type SupportedDomain,
} from './domains.js';

export { getVersion, checkServerVersion, type VersionCheckResult } from './version.js';
