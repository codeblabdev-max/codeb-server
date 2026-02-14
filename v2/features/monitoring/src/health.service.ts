/**
 * HealthService - Infrastructure health checks
 *
 * Checks Docker containers, slot registry, images, and port usage.
 * Refactored from mcp-server/src/index.ts (executeInfraStatus)
 */

import type { SSHClientWrapper } from '@codeb/ssh';

interface LoggerLike {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Types
// ============================================================================

export interface ContainerInfo {
  name: string;
  image: string;
  status: string;
  ports: string;
}

export interface SlotInfo {
  project: string;
  activeSlot: string;
  blue: { state: string; port: number; version: string };
  green: { state: string; port: number; version: string };
}

export interface InfraStatusResult {
  success: boolean;
  data: {
    api: {
      status: string;
      version: string;
      uptime: number;
    };
    containers: ContainerInfo[];
    slots: SlotInfo[];
    images: Array<{ repository: string; tag: string; size: string; created: string }>;
    ports: Array<{ port: string; process: string }>;
  };
  timestamp: string;
}

// ============================================================================
// Service
// ============================================================================

export class HealthService {
  constructor(
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
    private readonly version: string = '8.0.1',
  ) {}

  /**
   * Full infrastructure health check.
   * Gathers Docker container list, slot registry, images, and port usage.
   */
  async check(server?: 'app' | 'streaming' | 'storage' | 'backup' | 'all'): Promise<InfraStatusResult> {
    try {
      // 1. Docker containers
      const containersResult = await this.ssh.exec(
        `docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>/dev/null | head -30`,
      );
      const containers: ContainerInfo[] = containersResult.stdout
        .split('\n')
        .filter(Boolean)
        .map((line: string) => {
          const [name, image, status, ports] = line.split('|');
          return {
            name,
            image: image?.split(':')[0] || image,
            status: status?.split(' ')[0] || status,
            ports: ports || '',
          };
        });

      // 2. SSOT Slot Registry (file-based fallback on app server)
      const slotsResult = await this.ssh.exec(`
        for f in /opt/codeb/registry/slots/*.json; do
          if [ -f "$f" ]; then
            PROJECT=$(basename $f .json)
            ACTIVE=$(jq -r '.activeSlot' $f 2>/dev/null)
            BLUE_STATE=$(jq -r '.blue.state' $f 2>/dev/null)
            BLUE_PORT=$(jq -r '.blue.port' $f 2>/dev/null)
            BLUE_VER=$(jq -r '.blue.version // "N/A"' $f 2>/dev/null)
            GREEN_STATE=$(jq -r '.green.state' $f 2>/dev/null)
            GREEN_PORT=$(jq -r '.green.port' $f 2>/dev/null)
            GREEN_VER=$(jq -r '.green.version // "N/A"' $f 2>/dev/null)
            echo "$PROJECT|$ACTIVE|$BLUE_STATE|$BLUE_PORT|$BLUE_VER|$GREEN_STATE|$GREEN_PORT|$GREEN_VER"
          fi
        done
      `);
      const slots: SlotInfo[] = slotsResult.stdout
        .split('\n')
        .filter(Boolean)
        .map((line: string) => {
          const [project, activeSlot, blueState, bluePort, blueVer, greenState, greenPort, greenVer] = line.split('|');
          return {
            project,
            activeSlot,
            blue: { state: blueState, port: parseInt(bluePort) || 0, version: blueVer },
            green: { state: greenState, port: parseInt(greenPort) || 0, version: greenVer },
          };
        });

      // 3. Docker images (project-related)
      const imagesResult = await this.ssh.exec(
        `docker images --format '{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedSince}}' | grep -E '(codeb|project|ghcr)' | head -15`,
      );
      const images = imagesResult.stdout
        .split('\n')
        .filter(Boolean)
        .map((line: string) => {
          const [repository, tag, size, created] = line.split('|');
          return {
            repository: repository?.split('/').pop() || repository,
            tag,
            size,
            created,
          };
        });

      // 4. Port usage (4000-4200, 9101)
      const portsResult = await this.ssh.exec(
        `ss -tlnp 2>/dev/null | grep -E ':(4[0-1][0-9]{2}|9101) ' | awk '{print $4 "|" $6}' | head -20`,
      );
      const ports = portsResult.stdout
        .split('\n')
        .filter(Boolean)
        .map((line: string) => {
          const [port, proc] = line.split('|');
          return {
            port: port?.replace('0.0.0.0:', '').replace('[::]:', '') || port,
            process: proc?.match(/\("([^"]+)"/)?.[1] || 'unknown',
          };
        });

      this.logger.debug('Health check completed', {
        containers: containers.length,
        slots: slots.length,
        server,
      });

      return {
        success: true,
        data: {
          api: {
            status: 'healthy',
            version: this.version,
            uptime: process.uptime(),
          },
          containers,
          slots,
          images,
          ports,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
        server,
      });

      return {
        success: false,
        data: {
          api: { status: 'healthy', version: this.version, uptime: process.uptime() },
          containers: [],
          slots: [],
          images: [],
          ports: [],
        },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
