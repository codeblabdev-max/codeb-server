/**
 * CodeB v5.0 - Blue-Green Deploy Tool
 * Self-hosted Runner + Quadlet + systemd + Podman
 */

import { z } from 'zod';
import type {
  DeployInput,
  DeployResult,
  DeployStep,
  SlotName,
  Environment,
  ProjectSlots,
} from '../lib/types.js';
import { getSSHClient } from '../lib/ssh.js';
import { getSlotPorts } from '../lib/servers.js';
import { getSlotRegistry, updateSlotRegistry } from './slot.js';

// Input schema
export const deployInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
  version: z.string().optional().describe('Version/commit SHA (default: latest)'),
  image: z.string().optional().describe('Local image name (default: localhost/{project}:{version})'),
  skipHealthcheck: z.boolean().optional().describe('Skip health check'),
});

/**
 * Execute Blue-Green Deploy with Quadlet + systemd
 *
 * Flow:
 * 1. Get current slot status
 * 2. Select inactive slot (blue or green)
 * 3. Generate Quadlet container file
 * 4. systemctl --user daemon-reload
 * 5. systemctl --user start {container}
 * 6. Health check
 * 7. Return preview URL (NOT switch traffic yet)
 */
export async function executeDeploy(input: DeployInput): Promise<DeployResult> {
  const {
    projectName,
    environment,
    version = 'latest',
    skipHealthcheck = false,
  } = input;

  const ssh = getSSHClient();
  const steps: DeployStep[] = [];
  const startTime = Date.now();

  try {
    await ssh.connect();

    // Step 1: Get current slot status
    const step1Start = Date.now();
    let slots: ProjectSlots;
    try {
      slots = await getSlotRegistry(projectName, environment);
      steps.push({
        name: 'get_slot_status',
        status: 'success',
        duration: Date.now() - step1Start,
        output: `Active slot: ${slots.activeSlot}`,
      });
    } catch {
      // First deploy - initialize slots
      const basePort = await allocateBasePort(environment);
      const slotPorts = getSlotPorts(basePort);

      slots = {
        projectName,
        environment,
        activeSlot: 'blue',
        blue: { name: 'blue', state: 'empty', port: slotPorts.blue },
        green: { name: 'green', state: 'empty', port: slotPorts.green },
        lastUpdated: new Date().toISOString(),
      };

      steps.push({
        name: 'get_slot_status',
        status: 'success',
        duration: Date.now() - step1Start,
        output: 'First deploy - initialized slots',
      });
    }

    // Step 2: Select inactive slot
    const step2Start = Date.now();
    const targetSlot: SlotName = slots.activeSlot === 'blue' ? 'green' : 'blue';
    const targetPort = slots[targetSlot].port;

    steps.push({
      name: 'select_slot',
      status: 'success',
      duration: Date.now() - step2Start,
      output: `Target slot: ${targetSlot} (port ${targetPort})`,
    });

    // Step 3: Generate Quadlet container file
    const step3Start = Date.now();
    const containerName = `${projectName}-${environment}-${targetSlot}`;
    const image = input.image || `localhost/${projectName}:${version}`;
    const quadletPath = `~/.config/containers/systemd/${containerName}.container`;
    const envFile = `/opt/codeb/projects/${projectName}/.env.${environment}`;

    const quadletContent = generateQuadletFile({
      containerName,
      image,
      port: targetPort,
      envFile,
      projectName,
      environment,
      slot: targetSlot,
      version,
    });

    try {
      await ssh.exec(`mkdir -p ~/.config/containers/systemd`);
      await ssh.writeFile(quadletPath, quadletContent);
      steps.push({
        name: 'generate_quadlet',
        status: 'success',
        duration: Date.now() - step3Start,
        output: `Generated ${quadletPath}`,
      });
    } catch (error) {
      steps.push({
        name: 'generate_quadlet',
        status: 'failed',
        duration: Date.now() - step3Start,
        error: error instanceof Error ? error.message : String(error),
      });
      return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
    }

    // Step 4: systemctl daemon-reload
    const step4Start = Date.now();
    try {
      await ssh.exec(`systemctl --user daemon-reload`);
      steps.push({
        name: 'daemon_reload',
        status: 'success',
        duration: Date.now() - step4Start,
        output: 'systemd daemon reloaded',
      });
    } catch (error) {
      steps.push({
        name: 'daemon_reload',
        status: 'failed',
        duration: Date.now() - step4Start,
        error: error instanceof Error ? error.message : String(error),
      });
      return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
    }

    // Step 5: Start container via systemd
    const step5Start = Date.now();
    const serviceName = containerName; // Quadlet generates service with same name

    try {
      // Stop if running, then start fresh
      await ssh.exec(`systemctl --user stop ${serviceName} 2>/dev/null || true`);
      await ssh.exec(`systemctl --user start ${serviceName}`, { timeout: 120000 });

      steps.push({
        name: 'start_container',
        status: 'success',
        duration: Date.now() - step5Start,
        output: `Started ${serviceName} on port ${targetPort}`,
      });
    } catch (error) {
      steps.push({
        name: 'start_container',
        status: 'failed',
        duration: Date.now() - step5Start,
        error: error instanceof Error ? error.message : String(error),
      });
      return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
    }

    // Step 6: Health check
    const step6Start = Date.now();
    if (!skipHealthcheck) {
      try {
        await waitForHealthy(ssh, targetPort, 60);
        steps.push({
          name: 'health_check',
          status: 'success',
          duration: Date.now() - step6Start,
          output: 'Container is healthy',
        });
      } catch (error) {
        // Rollback: stop failed container
        await ssh.exec(`systemctl --user stop ${serviceName} 2>/dev/null || true`);

        steps.push({
          name: 'health_check',
          status: 'failed',
          duration: Date.now() - step6Start,
          error: error instanceof Error ? error.message : String(error),
        });
        return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
      }
    } else {
      steps.push({
        name: 'health_check',
        status: 'skipped',
        duration: 0,
        output: 'Skipped',
      });
    }

    // Step 7: Update slot registry
    const step7Start = Date.now();
    try {
      slots[targetSlot] = {
        name: targetSlot,
        state: 'deployed',
        port: targetPort,
        version,
        image,
        deployedAt: new Date().toISOString(),
        healthStatus: 'healthy',
      };
      slots.lastUpdated = new Date().toISOString();

      await updateSlotRegistry(projectName, environment, slots);

      steps.push({
        name: 'update_registry',
        status: 'success',
        duration: Date.now() - step7Start,
        output: 'Slot registry updated',
      });
    } catch (error) {
      steps.push({
        name: 'update_registry',
        status: 'failed',
        duration: Date.now() - step7Start,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return buildResult(true, steps, startTime, targetSlot, targetPort, projectName, environment, version);

  } finally {
    ssh.disconnect();
  }
}

/**
 * Generate Quadlet container file
 */
function generateQuadletFile(config: {
  containerName: string;
  image: string;
  port: number;
  envFile: string;
  projectName: string;
  environment: string;
  slot: string;
  version: string;
}): string {
  return `# CodeB v5.0 - Quadlet Container
# Generated: ${new Date().toISOString()}

[Unit]
Description=${config.projectName} ${config.environment} ${config.slot}
After=network-online.target

[Container]
Image=${config.image}
ContainerName=${config.containerName}
PublishPort=${config.port}:3000
EnvironmentFile=${config.envFile}
Label=project=${config.projectName}
Label=environment=${config.environment}
Label=slot=${config.slot}
Label=version=${config.version}
Label=deployed_at=${new Date().toISOString()}
HealthCmd=curl -f http://localhost:3000/health || exit 1
HealthInterval=10s
HealthTimeout=5s
HealthRetries=3

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=default.target
`;
}

/**
 * Wait for container to become healthy
 */
async function waitForHealthy(
  ssh: ReturnType<typeof getSSHClient>,
  port: number,
  timeoutSeconds: number
): Promise<void> {
  const maxAttempts = Math.ceil(timeoutSeconds / 5);

  // Initial wait for container to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  for (let i = 0; i < maxAttempts; i++) {
    const result = await ssh.exec(
      `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${port}/health 2>/dev/null || echo "000"`
    );

    const statusCode = result.stdout.trim();
    if (statusCode.startsWith('2')) {
      return; // Healthy
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error(`Health check failed after ${timeoutSeconds}s`);
}

/**
 * Allocate base port for new project
 */
async function allocateBasePort(environment: Environment): Promise<number> {
  // TODO: Read from SSOT registry and find next available
  const ranges = {
    staging: 3000,
    production: 4000,
    preview: 5000,
  };
  return ranges[environment];
}

/**
 * Build result object
 */
function buildResult(
  success: boolean,
  steps: DeployStep[],
  startTime: number,
  slot: SlotName,
  port: number,
  projectName: string,
  environment: Environment,
  version?: string
): DeployResult {
  const previewUrl = `https://${projectName}-${slot}.preview.codeb.dev`;

  return {
    success,
    slot,
    port,
    previewUrl: success ? previewUrl : '',
    steps,
    duration: Date.now() - startTime,
    error: success ? undefined : steps.find(s => s.status === 'failed')?.error,
  };
}

/**
 * Deploy tool definition
 */
export const deployTool = {
  name: 'deploy',
  description: 'Deploy to inactive Blue-Green slot using Quadlet + systemd. Returns preview URL for testing before promote.',
  inputSchema: deployInputSchema,
  execute: executeDeploy,
};
