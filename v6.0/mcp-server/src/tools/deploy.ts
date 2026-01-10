/**
 * CodeB v6.0 - Blue-Green Deploy Tool
 * Unified HTTP API + Team-based Authentication
 */

import { z } from 'zod';
import type {
  DeployInput,
  DeployResult,
  DeployStep,
  SlotName,
  Environment,
  ProjectSlots,
  AuthContext,
} from '../lib/types.js';
import { getSSHClient, withSSH } from '../lib/ssh.js';
import { getSlotPorts, SERVERS } from '../lib/servers.js';
import { getSlotRegistry, updateSlotRegistry } from './slot.js';

// ============================================================================
// Input Schema
// ============================================================================

export const deployInputSchema = z.object({
  projectName: z.string().min(1).max(50).describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
  version: z.string().optional().describe('Version/commit SHA (default: latest)'),
  image: z.string().optional().describe('Container image (default: ghcr.io/{org}/{project}:{version})'),
  skipHealthcheck: z.boolean().optional().describe('Skip health check'),
});

// ============================================================================
// Deploy Execution
// ============================================================================

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
export async function executeDeploy(
  input: DeployInput,
  auth: AuthContext
): Promise<DeployResult> {
  const {
    projectName,
    environment,
    version = 'latest',
    skipHealthcheck = false,
  } = input;

  // Validate team has access to project
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

  return withSSH(SERVERS.app.ip, async (ssh) => {
    const steps: DeployStep[] = [];
    const startTime = Date.now();

    try {
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
        const basePort = await allocateBasePort(ssh, environment, projectName);
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
          output: `First deploy - initialized slots (blue: ${slotPorts.blue}, green: ${slotPorts.green})`,
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
      const imageUrl = input.image || `ghcr.io/codeb/${projectName}:${version}`;
      const quadletDir = `/opt/codeb/projects/${projectName}/.config/containers/systemd`;
      const quadletPath = `${quadletDir}/${containerName}.container`;
      const envFile = `/opt/codeb/projects/${projectName}/.env.${environment}`;

      const quadletContent = generateQuadletFile({
        containerName,
        image: imageUrl,
        port: targetPort,
        envFile,
        projectName,
        environment,
        slot: targetSlot,
        version,
        teamId: auth.teamId,
      });

      try {
        await ssh.mkdir(quadletDir);
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
        await ssh.exec(`systemctl --user daemon-reload`, { timeout: 30000 });

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
      const serviceName = containerName;

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
          output: 'Skipped by user request',
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
          image: imageUrl,
          deployedAt: new Date().toISOString(),
          deployedBy: auth.keyId,
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

    } catch (error) {
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
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

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
  teamId: string;
}): string {
  const timestamp = new Date().toISOString();

  return `# CodeB v6.0 - Quadlet Container
# Generated: ${timestamp}
# Team: ${config.teamId}

[Unit]
Description=${config.projectName} ${config.environment} ${config.slot}
After=network-online.target

[Container]
Image=${config.image}
ContainerName=${config.containerName}
PublishPort=${config.port}:3000
EnvironmentFile=${config.envFile}

# Labels for management
Label=codeb.project=${config.projectName}
Label=codeb.environment=${config.environment}
Label=codeb.slot=${config.slot}
Label=codeb.version=${config.version}
Label=codeb.team=${config.teamId}
Label=codeb.deployed_at=${timestamp}

# Health check
HealthCmd=curl -f http://localhost:3000/health || exit 1
HealthInterval=10s
HealthTimeout=5s
HealthRetries=3
HealthStartPeriod=30s

# Resource limits
PodmanArgs=--memory=512m --cpus=1

[Service]
Restart=always
RestartSec=5
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
 * Checks both SSOT registry AND actual running containers
 */
async function allocateBasePort(
  ssh: ReturnType<typeof getSSHClient>,
  environment: Environment,
  _projectName: string
): Promise<number> {
  const ranges: Record<Environment, { start: number; end: number }> = {
    staging: { start: 3000, end: 3499 },
    production: { start: 4000, end: 4499 },
    preview: { start: 5000, end: 5999 },
  };

  const range = ranges[environment];

  // Read SSOT to find registered ports
  const ssotPath = '/opt/codeb/registry/ssot.json';
  const ssotResult = await ssh.exec(`cat ${ssotPath} 2>/dev/null || echo "{}"`);

  let ssot: { ports?: { used: number[] } } = {};
  try {
    ssot = JSON.parse(ssotResult.stdout);
  } catch {
    ssot = {};
  }

  const registeredPorts = new Set(ssot.ports?.used || []);

  // Get actual ports in use by running containers (podman)
  const portsResult = await ssh.exec(
    `podman ps --format '{{.Ports}}' 2>/dev/null | grep -oE '[0-9]+->3000' | cut -d'-' -f1 | sort -u || true`
  );
  const runningPorts = new Set(
    portsResult.stdout
      .split('\n')
      .filter(Boolean)
      .map((p: string) => parseInt(p.trim(), 10))
      .filter((p: number) => !isNaN(p))
  );

  // Also check ports via ss/netstat for any service
  const listeningResult = await ssh.exec(
    `ss -tlnp 2>/dev/null | awk '{print $4}' | grep -oE ':([0-9]+)$' | cut -d':' -f2 | sort -u || true`
  );
  const listeningPorts = new Set(
    listeningResult.stdout
      .split('\n')
      .filter(Boolean)
      .map((p: string) => parseInt(p.trim(), 10))
      .filter((p: number) => !isNaN(p) && p >= range.start && p <= range.end)
  );

  // Combine all used ports
  const usedPorts = new Set([...registeredPorts, ...runningPorts, ...listeningPorts]);

  // Find next available even port (blue gets even, green gets odd)
  for (let port = range.start; port <= range.end; port += 2) {
    if (!usedPorts.has(port) && !usedPorts.has(port + 1)) {
      // Reserve both ports in SSOT
      const updatedUsed = [...(ssot.ports?.used || []), port, port + 1];
      const updatedSsot = {
        ...ssot,
        ports: { ...ssot.ports, used: updatedUsed },
      };

      await ssh.writeFile(ssotPath, JSON.stringify(updatedSsot, null, 2));
      return port;
    }
  }

  throw new Error(`No available ports in ${environment} range (${range.start}-${range.end})`);
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
  _projectName: string,
  _environment: Environment,
  _version?: string
): DeployResult {
  const previewUrl = success
    ? `https://${_projectName}-${slot}.preview.codeb.dev`
    : '';

  return {
    success,
    slot,
    port,
    previewUrl,
    steps,
    duration: Date.now() - startTime,
    error: success ? undefined : steps.find(s => s.status === 'failed')?.error,
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const deployTool = {
  name: 'deploy',
  description: 'Deploy to inactive Blue-Green slot using Quadlet + systemd. Returns preview URL for testing.',
  inputSchema: deployInputSchema,

  async execute(params: DeployInput, auth: AuthContext): Promise<DeployResult> {
    return executeDeploy(params, auth);
  },
};
