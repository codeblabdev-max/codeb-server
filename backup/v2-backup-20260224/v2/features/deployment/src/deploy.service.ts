/**
 * DeployService - Blue-Green Docker deployment
 *
 * 10-step deployment flow:
 * 1. validateProject -> 2. getSlots -> 3. selectSlot -> 4. createDeploymentRecord
 * 5. pullImage -> 6. cleanupContainer -> 7. syncEnv -> 8. startContainer
 * 9. healthcheck -> 10. updateSlotRegistry
 *
 * Refactored from mcp-server/src/tools/deploy.ts
 */

import { randomBytes } from 'crypto';
import type { ProjectRepo, SlotRepo, DeploymentRepo, ProjectEnvRepo } from '@codeb/db';
import type { SSHClientWrapper } from '@codeb/ssh';
import type { SlotName, Environment, AuthContext } from '@codeb/shared';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}
import type { DeployInput, DeployResult, DeployStep } from './types.js';
import { SlotService } from './slot.service.js';

const PRIVATE_REGISTRY = '64.176.226.119:5000';
const GHCR_FALLBACK = 'ghcr.io/codeblabdev-max';
const PREVIEW_BASE_DOMAIN = 'preview.codeb.kr';
const CADDY_SITES_DIR = '/etc/caddy/sites';

export class DeployService {
  private readonly slotService: SlotService;

  constructor(
    private readonly projectRepo: typeof ProjectRepo,
    private readonly slotRepo: typeof SlotRepo,
    private readonly deploymentRepo: typeof DeploymentRepo,
    private readonly envRepo: typeof ProjectEnvRepo,
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {
    this.slotService = new SlotService(slotRepo, ssh, logger);
  }

  async execute(input: DeployInput, auth: AuthContext): Promise<DeployResult> {
    const {
      projectName,
      environment = 'production',
      version = 'latest',
      skipHealthcheck = false,
    } = input;

    const steps: DeployStep[] = [];
    const startTime = Date.now();
    const deploymentId = randomBytes(16).toString('hex');

    // Validate team access
    if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
      return {
        success: false,
        slot: 'blue',
        port: 0,
        previewUrl: '',
        steps: [],
        duration: 0,
        error: `Access denied: project ${projectName} not in team scope`,
      };
    }

    try {
      // Step 1: Verify project in DB
      const step1Start = Date.now();
      const project = await this.projectRepo.findByName(projectName);

      if (!project) {
        steps.push({
          name: 'verify_project',
          status: 'failed',
          duration: Date.now() - step1Start,
          error: `Project "${projectName}" not found in SSOT. Run project init first.`,
        });
        return this.buildResult(false, steps, startTime, 'blue', 0, projectName, environment);
      }

      if (project.teamId !== auth.teamId && auth.role !== 'owner') {
        steps.push({
          name: 'verify_project',
          status: 'failed',
          duration: Date.now() - step1Start,
          error: `Project "${projectName}" belongs to different team`,
        });
        return this.buildResult(false, steps, startTime, 'blue', 0, projectName, environment);
      }

      steps.push({
        name: 'verify_project',
        status: 'success',
        duration: Date.now() - step1Start,
        output: `Project verified: ${projectName} (type: ${project.type})`,
      });

      // Step 2: Get slot status
      const step2Start = Date.now();
      let slots = await this.slotRepo.findByProject(projectName, environment);

      if (!slots) {
        const basePort = await this.slotService.getAvailablePort(environment as Environment);
        slots = await this.slotService.initializeSlots(
          projectName,
          environment as Environment,
          basePort,
          auth.teamId,
        );
        steps.push({
          name: 'get_slot_status',
          status: 'success',
          duration: Date.now() - step2Start,
          output: `First deploy - initialized slots (blue: ${basePort}, green: ${basePort + 1})`,
        });
      } else {
        steps.push({
          name: 'get_slot_status',
          status: 'success',
          duration: Date.now() - step2Start,
          output: `Active slot: ${slots.activeSlot}, Blue: ${slots.blue.state}, Green: ${slots.green.state}`,
        });
      }

      // Step 3: Select inactive slot
      const step3Start = Date.now();
      const targetSlot: SlotName = slots.activeSlot === 'blue' ? 'green' : 'blue';
      const targetPort = slots[targetSlot].port;

      if (!targetPort) {
        steps.push({
          name: 'select_slot',
          status: 'failed',
          duration: Date.now() - step3Start,
          error: `No port assigned to ${targetSlot} slot. Re-initialize project.`,
        });
        return this.buildResult(false, steps, startTime, targetSlot, 0, projectName, environment);
      }

      steps.push({
        name: 'select_slot',
        status: 'success',
        duration: Date.now() - step3Start,
        output: `Target slot: ${targetSlot} (port ${targetPort})`,
      });

      // Step 4: Create deployment record (pending)
      await this.deploymentRepo.create({
        id: deploymentId,
        projectName,
        environment,
        slot: targetSlot,
        version,
        image: input.image,
        deployedBy: auth.keyId,
      });

      // Step 5: Pull Docker image
      const step5Start = Date.now();
      const containerName = `${projectName}-${environment}-${targetSlot}`;
      const imageUrl = input.image
        ? input.image
        : input.useGhcr
          ? `${GHCR_FALLBACK}/${projectName}:${version}`
          : `${PRIVATE_REGISTRY}/${projectName}:${version}`;

      try {
        await this.ssh.exec(`docker pull ${imageUrl}`, { timeout: 180000 });
        steps.push({
          name: 'pull_image',
          status: 'success',
          duration: Date.now() - step5Start,
          output: `Pulled ${imageUrl}`,
        });
      } catch (error) {
        steps.push({
          name: 'pull_image',
          status: 'failed',
          duration: Date.now() - step5Start,
          error: error instanceof Error ? error.message : String(error),
        });
        await this.deploymentRepo.updateStatus(deploymentId, 'failed', { steps, error: 'Image pull failed' });
        return this.buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
      }

      // Step 6: Cleanup existing container
      const step6Start = Date.now();
      try {
        await this.ssh.exec(`docker stop ${containerName} 2>/dev/null || true`);
        await this.ssh.exec(`docker rm ${containerName} 2>/dev/null || true`);
        steps.push({
          name: 'cleanup_container',
          status: 'success',
          duration: Date.now() - step6Start,
          output: 'Previous container cleaned up',
        });
      } catch (error) {
        steps.push({
          name: 'cleanup_container',
          status: 'failed',
          duration: Date.now() - step6Start,
          error: error instanceof Error ? error.message : String(error),
        });
        await this.deploymentRepo.updateStatus(deploymentId, 'failed', { steps, error: 'Cleanup failed' });
        return this.buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
      }

      // Step 7: Sync ENV from DB SSOT
      const step7Start = Date.now();
      const envFile = `/opt/codeb/env/${projectName}/.env`;
      const envAltFile = `/opt/codeb/projects/${projectName}/.env.${environment}`;
      const envBackupDir = `/opt/codeb/env-backup/${projectName}`;

      try {
        const dbEnv = await this.envRepo.getEnv(projectName, environment);

        if (dbEnv && Object.keys(dbEnv.envData).length > 0) {
          const envContent = Object.entries(dbEnv.envData)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

          await this.ssh.exec(`mkdir -p /opt/codeb/env/${projectName}`);
          const base64Content = Buffer.from(envContent).toString('base64');
          await this.ssh.exec(`echo "${base64Content}" | base64 -d > ${envFile}`);
          await this.ssh.exec(`chmod 600 ${envFile}`);
          await this.ssh.exec(`mkdir -p ${envBackupDir}`);
          await this.ssh.exec(`cp ${envFile} ${envBackupDir}/.env.${Date.now()}`);

          steps.push({
            name: 'sync_env',
            status: 'success',
            duration: Date.now() - step7Start,
            output: `ENV synced from DB SSOT (${Object.keys(dbEnv.envData).length} keys)`,
          });
        } else {
          const envCheck = await this.ssh.exec(
            `test -f ${envFile} && echo "OK" || test -f ${envAltFile} && echo "OK" || echo "MISSING"`,
          );

          if (envCheck.stdout.trim() === 'MISSING') {
            steps.push({
              name: 'sync_env',
              status: 'failed',
              duration: Date.now() - step7Start,
              error: 'No ENV in DB SSOT and no file on server. Use env_sync to upload.',
            });
            await this.deploymentRepo.updateStatus(deploymentId, 'failed', { error: 'ENV missing' });
            return this.buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
          }

          // Backup server ENV to DB
          const serverEnvContent = await this.ssh.exec(
            `cat ${envFile} 2>/dev/null || cat ${envAltFile} 2>/dev/null`,
          );
          if (serverEnvContent.stdout.trim()) {
            const envData = this.parseEnvContent(serverEnvContent.stdout);
            if (Object.keys(envData).length > 0) {
              await this.envRepo.saveEnv({
                projectName,
                environment,
                envData,
                createdBy: auth.teamId,
              });
            }
          }

          steps.push({
            name: 'sync_env',
            status: 'success',
            duration: Date.now() - step7Start,
            output: 'Using existing server ENV (backed up to DB)',
          });
        }
      } catch (error) {
        steps.push({
          name: 'sync_env',
          status: 'failed',
          duration: Date.now() - step7Start,
          error: error instanceof Error ? error.message : String(error),
        });
        await this.deploymentRepo.updateStatus(deploymentId, 'failed', { error: 'ENV sync failed' });
        return this.buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
      }

      // Step 8: Start container
      const step8Start = Date.now();
      const dockerLabels = [
        `codeb.project=${projectName}`,
        `codeb.environment=${environment}`,
        `codeb.slot=${targetSlot}`,
        `codeb.version=${version}`,
        `codeb.team=${auth.teamId}`,
        `codeb.deployment_id=${deploymentId}`,
        `codeb.deployed_at=${new Date().toISOString()}`,
      ].map((l) => `-l ${l}`).join(' ');

      const envFileToUse = await this.ssh.exec(
        `test -f ${envFile} && echo "${envFile}" || echo "${envAltFile}"`,
      );
      const actualEnvFile = envFileToUse.stdout.trim();

      try {
        const dockerCmd = `docker run -d \
          --name ${containerName} \
          --restart always \
          --env-file ${actualEnvFile} \
          -p ${targetPort}:3000 \
          --health-cmd="curl -sf http://localhost:3000/health || curl -sf http://localhost:3000/api/health || exit 1" \
          --health-interval=10s \
          --health-timeout=5s \
          --health-retries=3 \
          --health-start-period=30s \
          --memory=512m \
          --cpus=1 \
          ${dockerLabels} \
          ${imageUrl}`;

        await this.ssh.exec(dockerCmd, { timeout: 60000 });
        steps.push({
          name: 'start_container',
          status: 'success',
          duration: Date.now() - step8Start,
          output: `Started ${containerName} on port ${targetPort}`,
        });
      } catch (error) {
        steps.push({
          name: 'start_container',
          status: 'failed',
          duration: Date.now() - step8Start,
          error: error instanceof Error ? error.message : String(error),
        });
        await this.deploymentRepo.updateStatus(deploymentId, 'failed', { steps, error: 'Container start failed' });
        return this.buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
      }

      // Step 9: Healthcheck
      const step9Start = Date.now();
      if (!skipHealthcheck) {
        try {
          await this.waitForHealthy(targetPort, 60, containerName);
          steps.push({
            name: 'health_check',
            status: 'success',
            duration: Date.now() - step9Start,
            output: 'Container is healthy',
          });
        } catch (error) {
          await this.ssh.exec(`docker stop ${containerName} 2>/dev/null || true`);
          await this.ssh.exec(`docker rm ${containerName} 2>/dev/null || true`);
          steps.push({
            name: 'health_check',
            status: 'failed',
            duration: Date.now() - step9Start,
            error: error instanceof Error ? error.message : String(error),
          });
          await this.deploymentRepo.updateStatus(deploymentId, 'failed', { steps, error: 'Health check failed' });
          return this.buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
        }
      } else {
        steps.push({
          name: 'health_check',
          status: 'skipped',
          duration: 0,
          output: 'Skipped by user request',
        });
      }

      // Step 10: Update slot registry
      const step10Start = Date.now();
      try {
        slots[targetSlot] = {
          name: targetSlot,
          state: 'deployed',
          port: targetPort,
          version,
          image: imageUrl,
          deployedAt: new Date().toISOString(),
          deployedBy: auth.keyId,
          healthStatus: 'healthy',
        };
        slots.lastUpdated = new Date().toISOString();
        await this.slotService.updateRegistry(projectName, environment as Environment, slots);
        steps.push({
          name: 'update_registry',
          status: 'success',
          duration: Date.now() - step10Start,
          output: 'DB slot registry updated',
        });
      } catch (error) {
        steps.push({
          name: 'update_registry',
          status: 'failed',
          duration: Date.now() - step10Start,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Step 11: Setup unique preview domain (per-commit URL)
      const step11Start = Date.now();
      const previewId = this.generatePreviewId(version);
      const previewDomain = `${projectName}-${previewId}.${PREVIEW_BASE_DOMAIN}`;

      try {
        await this.setupPreviewCaddy(previewDomain, targetPort, projectName, version, auth.teamId);
        steps.push({
          name: 'setup_preview',
          status: 'success',
          duration: Date.now() - step11Start,
          output: `Preview domain ready: https://${previewDomain}`,
        });
      } catch (error) {
        // Preview setup failure is non-fatal — deployment still succeeded
        steps.push({
          name: 'setup_preview',
          status: 'failed',
          duration: Date.now() - step11Start,
          error: `Preview setup failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      const duration = Date.now() - startTime;
      await this.deploymentRepo.updateStatus(deploymentId, 'success', { steps, duration });
      return this.buildResult(true, steps, startTime, targetSlot, targetPort, projectName, environment, version, previewId);

    } catch (error) {
      await this.deploymentRepo.updateStatus(deploymentId, 'failed', {
        steps,
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => {});

      return {
        success: false,
        slot: 'blue',
        port: 0,
        previewUrl: '',
        steps,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private parseEnvContent(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();

        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        env[key] = value;
      }
    }

    return env;
  }

  private async waitForHealthy(
    port: number,
    timeoutSeconds: number,
    containerName?: string,
  ): Promise<void> {
    const maxAttempts = Math.ceil(timeoutSeconds / 5);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    for (let i = 0; i < maxAttempts; i++) {
      if (containerName) {
        const healthResult = await this.ssh.exec(
          `docker inspect ${containerName} --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown"`,
        );
        if (healthResult.stdout.trim() === 'healthy') return;
      }

      if (containerName) {
        const execResult = await this.ssh.exec(
          `docker exec ${containerName} sh -c 'curl -sf http://localhost:3000/health 2>/dev/null || curl -sf http://localhost:3000/api/health 2>/dev/null' && echo "OK" || echo "FAIL"`,
        );
        if (execResult.stdout.includes('OK')) return;
      }

      const result = await this.ssh.exec(
        `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${port}/health 2>/dev/null || curl -sf -o /dev/null -w '%{http_code}' http://localhost:${port}/api/health 2>/dev/null || echo "000"`,
      );
      if (result.stdout.trim().startsWith('2')) return;

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error(`Health check failed after ${timeoutSeconds}s`);
  }

  private buildResult(
    success: boolean,
    steps: DeployStep[],
    startTime: number,
    slot: SlotName,
    port: number,
    projectName: string,
    _environment: string,
    _version?: string,
    previewId?: string,
  ): DeployResult {
    const previewUrl = success && previewId
      ? `https://${projectName}-${previewId}.${PREVIEW_BASE_DOMAIN}`
      : '';

    return {
      success,
      slot,
      port,
      previewUrl,
      steps,
      duration: Date.now() - startTime,
      error: success ? undefined : steps.find((s) => s.status === 'failed')?.error,
    };
  }

  // ===========================================================================
  // Preview Domain Helpers
  // ===========================================================================

  /**
   * Generate a unique preview ID from the version/commit SHA.
   * Uses first 7 chars of commit SHA, or random 6-char hex if version is generic.
   */
  private generatePreviewId(version: string): string {
    // If version looks like a commit SHA (40 hex chars or 7+ hex chars), use short hash
    if (/^[0-9a-f]{7,40}$/i.test(version)) {
      return version.substring(0, 7).toLowerCase();
    }
    // If version is a semver or 'latest', generate random ID
    return randomBytes(3).toString('hex');
  }

  /**
   * Create a lightweight Caddy config for the preview domain.
   * Points directly to the deployed slot's port (single backend, no lb_policy).
   * Adds no-cache headers to prevent browser caching issues.
   *
   * Requires: *.preview.codeb.kr wildcard DNS A record → 158.247.203.55
   */
  private async setupPreviewCaddy(
    previewDomain: string,
    port: number,
    projectName: string,
    version: string,
    teamId: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const caddyContent = `# CodeB Preview - Auto-generated per-commit preview
# Project: ${projectName}
# Version: ${version}
# Team: ${teamId}
# Generated: ${timestamp}

${previewDomain} {
  reverse_proxy localhost:${port} {
    health_uri /health
    health_interval 30s
    health_timeout 5s
  }
  encode gzip
  header {
    X-CodeB-Project ${projectName}
    X-CodeB-Version ${version}
    X-CodeB-Preview true
    Cache-Control "no-store, no-cache, must-revalidate, max-age=0"
    Pragma no-cache
    -Server
  }
  log {
    output file /var/log/caddy/${projectName}-preview.log {
      roll_size 5mb
      roll_keep 2
    }
  }
}
`;

    // Safe filename from preview domain
    const safeFilename = previewDomain.replace(/\./g, '-');
    const caddyPath = `${CADDY_SITES_DIR}/${safeFilename}.caddy`;

    await this.ssh.exec(`mkdir -p ${CADDY_SITES_DIR}`);
    const base64Content = Buffer.from(caddyContent).toString('base64');
    await this.ssh.exec(`echo "${base64Content}" | base64 -d > ${caddyPath}`);

    // Validate and reload
    const validateResult = await this.ssh.exec(
      'caddy validate --config /etc/caddy/Caddyfile 2>&1',
    );
    if (validateResult.code !== 0 && !validateResult.stdout.includes('Valid')) {
      // Rollback: remove invalid config
      await this.ssh.exec(`rm -f ${caddyPath}`);
      throw new Error(`Caddy validation failed for preview: ${validateResult.stdout}`);
    }

    await this.ssh.exec('systemctl reload caddy');
  }
}
