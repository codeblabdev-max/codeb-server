/**
 * @codeb/api - Health Check Handler
 *
 * GET /health - Returns server status, version, uptime.
 * Includes client version check: if caller sends X-Client-Version
 * header and it's older than server version, returns update notification.
 *
 * Refactored from mcp-server/src/index.ts GET /health route.
 */

import type { Request, Response } from 'express';

// ============================================================================
// Handler Factory
// ============================================================================

export function createHealthHandler(version: string) {
  return function healthHandler(req: Request, res: Response): void {
    const clientVersion =
      (req.headers['x-client-version'] as string) ||
      (req.query.v as string);

    let updateRequired = false;
    let updateMessage = '';

    if (clientVersion && clientVersion !== version) {
      const [cMajor = 0, cMinor = 0, cPatch = 0] = clientVersion.split('.').map(Number);
      const [sMajor = 0, sMinor = 0, sPatch = 0] = version.split('.').map(Number);

      if (
        sMajor > cMajor ||
        (sMajor === cMajor && sMinor > cMinor) ||
        (sMajor === cMajor && sMinor === cMinor && sPatch > cPatch)
      ) {
        updateRequired = true;
        updateMessage = `CLI update required: ${clientVersion} -> ${version}\ncurl -sSL https://releases.codeb.kr/cli/install.sh | bash`;
      }
    }

    res.json({
      status: 'healthy',
      version,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      ...(updateRequired
        ? {
            updateRequired,
            updateMessage,
            latestVersion: version,
            downloadUrl: 'https://releases.codeb.kr/cli/install.sh',
          }
        : {}),
    });
  };
}
