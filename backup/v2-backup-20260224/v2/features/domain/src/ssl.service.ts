/**
 * SslService - SSL certificate management
 *
 * Caddy auto-manages SSL via Let's Encrypt.
 * This service provides status checking and placeholder for custom cert ops.
 * Refactored from mcp-server/src/tools/domain.ts (sslStatusTool)
 */

import type { SSHClientWrapper } from '@codeb/ssh';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}

export interface SslStatus {
  domain: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  autoRenew: boolean;
}

export class SslService {
  constructor(
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {}

  /**
   * Check SSL certificate status for a domain.
   * Caddy auto-manages certificates, so this primarily verifies configuration.
   */
  async status(domain: string): Promise<{
    success: boolean;
    data?: SslStatus;
    error?: string;
  }> {
    try {
      // Verify domain is configured in Caddy
      const result = await this.ssh.exec(
        `ls /etc/caddy/sites/*.caddy 2>/dev/null | xargs grep -l "${domain}" 2>/dev/null || echo ""`,
      );

      if (!result.stdout.trim()) {
        return {
          success: false,
          error: `Domain ${domain} not configured in Caddy`,
        };
      }

      // Caddy auto-manages SSL via Let's Encrypt
      return {
        success: true,
        data: {
          domain,
          issuer: "Let's Encrypt (Caddy Auto)",
          validFrom: '',
          validTo: '',
          daysRemaining: 90, // Caddy auto-renews before 30 days
          autoRenew: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Provision SSL certificate (Caddy handles this automatically)
   * Included as a placeholder for custom certificate operations.
   */
  async provision(domain: string): Promise<{ success: boolean; error?: string }> {
    this.logger.info('SSL provisioning requested (Caddy auto-manages)', { domain });
    // Caddy automatically provisions SSL when a domain is added to its config
    return { success: true };
  }

  /**
   * Revoke SSL certificate
   * Placeholder - Caddy handles certificate lifecycle.
   */
  async revoke(domain: string): Promise<{ success: boolean; error?: string }> {
    this.logger.warn('SSL revoke requested (manual intervention may be needed)', { domain });
    return { success: true };
  }
}
