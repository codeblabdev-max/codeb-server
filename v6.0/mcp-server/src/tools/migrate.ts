/**
 * CodeB v6.0 - Migration Tools
 * 레거시 시스템(v3.x/v5.x)에서 v6.0 Blue-Green 슬롯 시스템으로 마이그레이션
 */

import { z } from 'zod';
import { randomBytes } from 'crypto';
import type { AuthContext } from '../lib/types.js';
import type {
  LegacySSOT,
  LegacyDetectionResult,
  LegacyProjectInfo,
  LegacyContainerInfo,
  LegacyCaddyConfig,
  LegacySystemType,
  MigrationPlan,
  MigrationResult,
  MigrationStep,
} from '../lib/legacy-types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS } from '../lib/servers.js';
import { updateSlotRegistry } from './slot.js';
import type { ProjectSlots, SlotState } from '../lib/types.js';

// ============================================================================
// Constants
// ============================================================================

const LEGACY_SSOT_PATH = '/opt/codeb/registry/ssot.json';
const LEGACY_PROJECTS_PATH = '/opt/codeb/projects';
const V6_REGISTRY_PATH = '/opt/codeb/registry/slots';
const MIGRATION_LOG_PATH = '/opt/codeb/logs/migrations';

// Port ranges
const PORT_RANGES = {
  staging: { blue: { start: 3000, end: 3249 }, green: { start: 3250, end: 3499 } },
  production: { blue: { start: 4000, end: 4249 }, green: { start: 4250, end: 4499 } },
  preview: { blue: { start: 5000, end: 5499 }, green: { start: 5500, end: 5999 } },
};

// ============================================================================
// Input Schemas
// ============================================================================

export const detectInputSchema = z.object({
  serverIp: z.string().optional().describe('Server IP (default: app server)'),
});

export const planInputSchema = z.object({
  projects: z.array(z.string()).optional().describe('Specific projects to migrate (default: all)'),
  dryRun: z.boolean().optional().describe('Preview migration without executing'),
});

export const executeInputSchema = z.object({
  migrationId: z.string().describe('Migration plan ID'),
  force: z.boolean().optional().describe('Force migration even with warnings'),
});

export const rollbackInputSchema = z.object({
  migrationId: z.string().describe('Migration ID to rollback'),
});

// ============================================================================
// Detect Legacy System
// ============================================================================

/**
 * 서버의 레거시 시스템을 감지
 */
export async function detectLegacySystem(
  auth: AuthContext
): Promise<LegacyDetectionResult> {
  return withSSH(SERVERS.app.ip, async (ssh) => {
    const result: LegacyDetectionResult = {
      systemType: 'unknown',
      hasSSOT: false,
      projects: [],
      containers: [],
      caddyConfigs: [],
      portMappings: [],
      detectedAt: new Date().toISOString(),
      warnings: [],
      errors: [],
    };

    try {
      // 1. SSOT 파일 확인
      const ssotExists = await ssh.exec(`test -f ${LEGACY_SSOT_PATH} && echo "yes" || echo "no"`);
      result.hasSSOT = ssotExists.stdout.trim() === 'yes';

      if (result.hasSSOT) {
        const ssotContent = await ssh.readFile(LEGACY_SSOT_PATH);
        const ssot: LegacySSOT = JSON.parse(ssotContent);
        result.ssotVersion = ssot.version;
        result.systemType = 'ssot-v1';

        // SSOT에서 프로젝트 정보 추출
        for (const [projectId, project] of Object.entries(ssot.projects)) {
          const projectInfo: LegacyProjectInfo = {
            name: projectId,
            path: `${LEGACY_PROJECTS_PATH}/${projectId}`,
            source: 'ssot',
            environments: [],
            type: project.type,
            repository: project.repository,
            canMigrate: true,
          };

          // Staging
          if (project.environments.staging) {
            const env = project.environments.staging;
            projectInfo.environments.push({
              name: 'staging',
              port: env.ports.app,
              domain: env.domain,
              containerName: env.containerName,
              status: env.status === 'running' ? 'running' : 'stopped',
              version: env.lastVersion,
            });

            result.portMappings.push({
              port: env.ports.app,
              project: projectId,
              environment: 'staging',
              service: 'app',
              source: 'ssot',
            });
          }

          // Production
          if (project.environments.production) {
            const env = project.environments.production;
            projectInfo.environments.push({
              name: 'production',
              port: env.ports.app,
              domain: env.domain,
              containerName: env.containerName,
              status: env.status === 'running' ? 'running' : 'stopped',
              version: env.lastVersion,
            });

            result.portMappings.push({
              port: env.ports.app,
              project: projectId,
              environment: 'production',
              service: 'app',
              source: 'ssot',
            });
          }

          result.projects.push(projectInfo);
        }
      }

      // 2. 실행 중인 컨테이너 스캔
      const containersCmd = await ssh.exec(
        `podman ps -a --format '{{.Names}}|{{.ID}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>/dev/null || ` +
        `docker ps -a --format '{{.Names}}|{{.ID}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>/dev/null || echo ""`
      );

      if (containersCmd.stdout.trim()) {
        const runtime = containersCmd.stdout.includes('podman') ? 'podman' : 'docker';

        for (const line of containersCmd.stdout.split('\n').filter(Boolean)) {
          const [name, id, image, status, portsStr] = line.split('|');

          // 포트 파싱
          const ports: LegacyContainerInfo['ports'] = [];
          const portMatches = portsStr?.matchAll(/(\d+):(\d+)\/(tcp|udp)/g) || [];
          for (const match of portMatches) {
            ports.push({
              host: parseInt(match[1], 10),
              container: parseInt(match[2], 10),
              protocol: match[3] as 'tcp' | 'udp',
            });
          }

          // Quadlet 확인 (systemd 서비스)
          const systemdCheck = await ssh.exec(
            `systemctl --user list-units --type=service | grep -q "${name}" && echo "yes" || echo "no"`
          );
          const isQuadlet = systemdCheck.stdout.trim() === 'yes';

          const container: LegacyContainerInfo = {
            name,
            id,
            image,
            status: status.toLowerCase().includes('up') ? 'running' : 'stopped',
            ports,
            runtime: runtime as 'podman' | 'docker',
            isQuadlet,
            systemdService: isQuadlet ? `${name}.service` : undefined,
          };

          result.containers.push(container);

          // 포트 매핑 추가
          for (const port of ports) {
            const existingMapping = result.portMappings.find(m => m.port === port.host);
            if (!existingMapping) {
              result.portMappings.push({
                port: port.host,
                project: inferProjectFromContainer(name),
                environment: inferEnvironmentFromContainer(name),
                service: 'app',
                source: 'container',
              });
            }
          }

          // SSOT에 없는 프로젝트 추가
          const projectName = inferProjectFromContainer(name);
          if (projectName && !result.projects.find(p => p.name === projectName)) {
            result.projects.push({
              name: projectName,
              path: `${LEGACY_PROJECTS_PATH}/${projectName}`,
              source: 'container',
              environments: [{
                name: inferEnvironmentFromContainer(name) as 'staging' | 'production',
                port: ports[0]?.host,
                containerName: name,
                status: container.status === 'running' ? 'running' : 'stopped',
              }],
              canMigrate: true,
            });
          }
        }
      }

      // 3. Caddy 설정 스캔
      const caddyFiles = await ssh.exec(`ls /etc/caddy/Caddyfile.d/*.caddy 2>/dev/null || ls /etc/caddy/sites/*.caddy 2>/dev/null || echo ""`);

      if (caddyFiles.stdout.trim()) {
        for (const file of caddyFiles.stdout.split('\n').filter(Boolean)) {
          try {
            const content = await ssh.readFile(file);

            // 도메인과 포트 추출
            const domainMatch = content.match(/^([a-zA-Z0-9.-]+)\s*\{/m);
            const portMatch = content.match(/localhost:(\d+)/);

            if (domainMatch && portMatch) {
              const config: LegacyCaddyConfig = {
                path: file,
                domain: domainMatch[1],
                targetPort: parseInt(portMatch[1], 10),
                inferredProject: inferProjectFromDomain(domainMatch[1]),
                inferredEnvironment: inferEnvironmentFromDomain(domainMatch[1]),
              };
              result.caddyConfigs.push(config);
            }
          } catch {
            result.warnings.push(`Failed to parse Caddy config: ${file}`);
          }
        }
      }

      // 4. v6.0 슬롯 시스템 확인
      const v6Exists = await ssh.exec(`test -d ${V6_REGISTRY_PATH} && ls ${V6_REGISTRY_PATH}/*.json 2>/dev/null | wc -l || echo "0"`);
      const v6Count = parseInt(v6Exists.stdout.trim(), 10);

      if (v6Count > 0) {
        result.systemType = 'quadlet-v6';
        result.warnings.push(`Found ${v6Count} projects already using v6.0 slot system`);
      } else if (!result.hasSSOT && result.containers.length > 0) {
        // Quadlet 사용 여부로 판단
        const quadletCount = result.containers.filter(c => c.isQuadlet).length;
        if (quadletCount > result.containers.length / 2) {
          result.systemType = 'quadlet-v6';
        } else {
          result.systemType = 'podman-direct';
        }
      }

      // 5. 마이그레이션 가능 여부 판단
      for (const project of result.projects) {
        // 이미 v6.0 사용 중인지 확인
        const slotFile = `${V6_REGISTRY_PATH}/${project.name}-staging.json`;
        const slotExists = await ssh.exec(`test -f ${slotFile} && echo "yes" || echo "no"`);

        if (slotExists.stdout.trim() === 'yes') {
          project.canMigrate = false;
          project.migrationBlocker = 'Already migrated to v6.0 slot system';
        }

        // 포트 충돌 확인
        for (const env of project.environments) {
          if (env.port) {
            const inBlueRange = isPortInRange(env.port, PORT_RANGES[env.name]?.blue);
            const inGreenRange = isPortInRange(env.port, PORT_RANGES[env.name]?.green);

            if (!inBlueRange && !inGreenRange) {
              result.warnings.push(
                `${project.name}/${env.name}: Port ${env.port} is outside v6.0 slot ranges. Will be reassigned.`
              );
            }
          }
        }
      }

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  });
}

// ============================================================================
// Create Migration Plan
// ============================================================================

/**
 * 마이그레이션 계획 생성
 */
export async function createMigrationPlan(
  detection: LegacyDetectionResult,
  projectFilter?: string[],
  auth?: AuthContext
): Promise<MigrationPlan> {
  const migrationId = `mig_${randomBytes(8).toString('hex')}`;
  const projects = detection.projects.filter(p => {
    if (!p.canMigrate) return false;
    if (projectFilter && projectFilter.length > 0) {
      return projectFilter.includes(p.name);
    }
    return true;
  });

  const plan: MigrationPlan = {
    id: migrationId,
    createdAt: new Date().toISOString(),
    sourceSystem: detection.systemType,
    projects: [],
    estimatedDowntime: '< 30 seconds per project',
    canRollback: true,
    steps: [],
    status: 'pending',
  };

  // 사용 중인 포트 추적
  const usedPorts = new Set(detection.portMappings.map(m => m.port));

  for (const project of projects) {
    for (const env of project.environments) {
      if (env.name === 'preview') continue; // Preview는 별도 처리

      const environment = env.name as 'staging' | 'production';
      const currentPort = env.port || 0;

      // Blue/Green 포트 할당
      const bluePort = findAvailablePort(PORT_RANGES[environment].blue, usedPorts);
      const greenPort = findAvailablePort(PORT_RANGES[environment].green, usedPorts);

      usedPorts.add(bluePort);
      usedPorts.add(greenPort);

      plan.projects.push({
        name: project.name,
        current: {
          port: currentPort,
          domain: env.domain,
          containerName: env.containerName || `${project.name}-${environment}`,
          version: env.version,
        },
        target: {
          bluePort,
          greenPort,
          domain: env.domain,
          activeSlot: 'blue', // 기존 컨테이너를 blue로 마이그레이션
        },
        environments: [{
          name: environment,
          action: 'migrate',
        }],
      });
    }
  }

  // 마이그레이션 단계 생성
  let stepOrder = 0;

  // Step 1: 백업
  plan.steps.push({
    id: `step_${++stepOrder}`,
    name: 'backup_current_state',
    description: 'Backup current SSOT and container states',
    order: stepOrder,
    status: 'pending',
    canRollback: false,
  });

  // Step 2: v6.0 디렉토리 구조 생성
  plan.steps.push({
    id: `step_${++stepOrder}`,
    name: 'create_v6_structure',
    description: 'Create v6.0 registry directories',
    order: stepOrder,
    status: 'pending',
    canRollback: true,
    rollbackCommand: `rm -rf ${V6_REGISTRY_PATH}`,
  });

  // 프로젝트별 단계
  for (const projectPlan of plan.projects) {
    // Step: Quadlet 생성
    plan.steps.push({
      id: `step_${++stepOrder}`,
      name: `create_quadlet_${projectPlan.name}`,
      description: `Generate Quadlet files for ${projectPlan.name}`,
      order: stepOrder,
      status: 'pending',
      canRollback: true,
    });

    // Step: 슬롯 레지스트리 생성
    plan.steps.push({
      id: `step_${++stepOrder}`,
      name: `create_slot_registry_${projectPlan.name}`,
      description: `Create slot registry for ${projectPlan.name}`,
      order: stepOrder,
      status: 'pending',
      canRollback: true,
    });

    // Step: 컨테이너 마이그레이션
    plan.steps.push({
      id: `step_${++stepOrder}`,
      name: `migrate_container_${projectPlan.name}`,
      description: `Migrate container to Blue slot for ${projectPlan.name}`,
      order: stepOrder,
      status: 'pending',
      canRollback: true,
    });

    // Step: Caddy 업데이트
    plan.steps.push({
      id: `step_${++stepOrder}`,
      name: `update_caddy_${projectPlan.name}`,
      description: `Update Caddy config for ${projectPlan.name}`,
      order: stepOrder,
      status: 'pending',
      canRollback: true,
    });
  }

  // Step: 검증
  plan.steps.push({
    id: `step_${++stepOrder}`,
    name: 'verify_migration',
    description: 'Verify all services are healthy',
    order: stepOrder,
    status: 'pending',
    canRollback: false,
  });

  // Step: 레거시 정리 (선택적)
  plan.steps.push({
    id: `step_${++stepOrder}`,
    name: 'cleanup_legacy',
    description: 'Mark legacy SSOT as migrated (preserves for rollback)',
    order: stepOrder,
    status: 'pending',
    canRollback: true,
  });

  return plan;
}

// ============================================================================
// Execute Migration
// ============================================================================

/**
 * 마이그레이션 실행
 */
export async function executeMigration(
  plan: MigrationPlan,
  auth: AuthContext
): Promise<MigrationResult> {
  const startTime = Date.now();
  const migratedProjects: string[] = [];
  const failedProjects: Array<{ name: string; error: string }> = [];
  const warnings: string[] = [];

  return withSSH(SERVERS.app.ip, async (ssh) => {
    plan.status = 'in_progress';

    try {
      // 마이그레이션 로그 디렉토리 생성
      await ssh.mkdir(MIGRATION_LOG_PATH);

      for (const step of plan.steps) {
        step.status = 'running';
        const stepStart = Date.now();

        try {
          await executeStep(ssh, step, plan, auth);
          step.status = 'completed';
          step.duration = Date.now() - stepStart;
          step.result = { success: true };

          // 프로젝트별 성공 추적
          const projectMatch = step.name.match(/^[a-z_]+_(.+)$/);
          if (projectMatch && step.name.includes('migrate_container')) {
            migratedProjects.push(projectMatch[1]);
          }

        } catch (error) {
          step.status = 'failed';
          step.duration = Date.now() - stepStart;
          step.result = {
            success: false,
            message: error instanceof Error ? error.message : String(error),
          };

          // 프로젝트별 실패 추적
          const projectMatch = step.name.match(/^[a-z_]+_(.+)$/);
          if (projectMatch) {
            failedProjects.push({
              name: projectMatch[1],
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // 중요 단계 실패 시 중단
          if (!step.name.includes('cleanup') && !step.name.includes('verify')) {
            throw error;
          }
        }
      }

      plan.status = 'completed';

      // 마이그레이션 로그 저장
      const logFile = `${MIGRATION_LOG_PATH}/${plan.id}.json`;
      await ssh.writeFile(logFile, JSON.stringify(plan, null, 2));

    } catch (error) {
      plan.status = 'failed';
      warnings.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);

      // 롤백 시도
      if (plan.canRollback) {
        warnings.push('Attempting automatic rollback...');
        try {
          await rollbackMigration(plan, auth);
          warnings.push('Rollback completed successfully');
        } catch (rollbackError) {
          warnings.push(`Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
      }
    }

    return {
      success: plan.status === 'completed',
      migrationId: plan.id,
      migratedProjects,
      failedProjects,
      duration: Date.now() - startTime,
      nextSteps: plan.status === 'completed' ? [
        'Run "we slot status <project>" to verify slot states',
        'Test deployments with "we deploy <project>"',
        'Run "we promote <project>" to switch traffic',
      ] : [
        'Check migration logs for details',
        'Fix issues and retry migration',
      ],
      warnings,
    };
  });
}

/**
 * 개별 단계 실행
 */
async function executeStep(
  ssh: ReturnType<typeof import('../lib/ssh.js').getSSHClient>,
  step: MigrationStep,
  plan: MigrationPlan,
  auth: AuthContext
): Promise<void> {
  switch (true) {
    case step.name === 'backup_current_state':
      await backupCurrentState(ssh, plan);
      break;

    case step.name === 'create_v6_structure':
      await ssh.mkdir(V6_REGISTRY_PATH);
      break;

    case step.name.startsWith('create_quadlet_'):
      const quadletProject = step.name.replace('create_quadlet_', '');
      await createQuadletFiles(ssh, plan, quadletProject);
      break;

    case step.name.startsWith('create_slot_registry_'):
      const registryProject = step.name.replace('create_slot_registry_', '');
      await createSlotRegistry(ssh, plan, registryProject, auth);
      break;

    case step.name.startsWith('migrate_container_'):
      const containerProject = step.name.replace('migrate_container_', '');
      await migrateContainer(ssh, plan, containerProject);
      break;

    case step.name.startsWith('update_caddy_'):
      const caddyProject = step.name.replace('update_caddy_', '');
      await updateCaddyForSlot(ssh, plan, caddyProject);
      break;

    case step.name === 'verify_migration':
      await verifyMigration(ssh, plan);
      break;

    case step.name === 'cleanup_legacy':
      await markLegacyAsMigrated(ssh, plan);
      break;
  }
}

// ============================================================================
// Step Implementations
// ============================================================================

async function backupCurrentState(
  ssh: ReturnType<typeof import('../lib/ssh.js').getSSHClient>,
  plan: MigrationPlan
): Promise<void> {
  const backupDir = `/opt/codeb/backups/migration-${plan.id}`;
  await ssh.mkdir(backupDir);

  // SSOT 백업
  await ssh.exec(`cp ${LEGACY_SSOT_PATH} ${backupDir}/ssot.json 2>/dev/null || true`);

  // Caddy 설정 백업
  await ssh.exec(`cp -r /etc/caddy/Caddyfile.d ${backupDir}/caddy-backup 2>/dev/null || true`);
  await ssh.exec(`cp -r /etc/caddy/sites ${backupDir}/caddy-sites-backup 2>/dev/null || true`);
}

async function createQuadletFiles(
  ssh: ReturnType<typeof import('../lib/ssh.js').getSSHClient>,
  plan: MigrationPlan,
  projectName: string
): Promise<void> {
  const projectPlan = plan.projects.find(p => p.name === projectName);
  if (!projectPlan) return;

  for (const env of projectPlan.environments) {
    if (env.action !== 'migrate') continue;

    const quadletDir = `/opt/codeb/projects/${projectName}/.config/containers/systemd`;
    await ssh.mkdir(quadletDir);

    // Blue slot Quadlet
    const blueQuadlet = generateQuadletFile({
      projectName,
      environment: env.name,
      slot: 'blue',
      port: projectPlan.target.bluePort,
      image: projectPlan.current.containerName, // 기존 이미지 사용
    });
    await ssh.writeFile(`${quadletDir}/${projectName}-${env.name}-blue.container`, blueQuadlet);

    // Green slot Quadlet (비어있음)
    const greenQuadlet = generateQuadletFile({
      projectName,
      environment: env.name,
      slot: 'green',
      port: projectPlan.target.greenPort,
      image: '', // 비어있음
    });
    await ssh.writeFile(`${quadletDir}/${projectName}-${env.name}-green.container`, greenQuadlet);
  }
}

function generateQuadletFile(config: {
  projectName: string;
  environment: string;
  slot: 'blue' | 'green';
  port: number;
  image: string;
}): string {
  return `# CodeB v6.0 - Auto-generated Quadlet
# Project: ${config.projectName}
# Environment: ${config.environment}
# Slot: ${config.slot}
# Generated during migration

[Unit]
Description=${config.projectName} ${config.environment} (${config.slot} slot)
After=network-online.target

[Container]
Image=${config.image || 'placeholder:latest'}
PublishPort=${config.port}:3000
Environment=NODE_ENV=${config.environment === 'production' ? 'production' : 'development'}
Environment=PORT=3000
EnvironmentFile=/opt/codeb/projects/${config.projectName}/.env.${config.environment}
HealthCmd=curl -sf http://localhost:3000/health || exit 1
HealthInterval=30s
HealthTimeout=10s
HealthRetries=3
AutoUpdate=registry

[Service]
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
`;
}

async function createSlotRegistry(
  ssh: ReturnType<typeof import('../lib/ssh.js').getSSHClient>,
  plan: MigrationPlan,
  projectName: string,
  auth: AuthContext
): Promise<void> {
  const projectPlan = plan.projects.find(p => p.name === projectName);
  if (!projectPlan) return;

  for (const env of projectPlan.environments) {
    if (env.action !== 'migrate') continue;

    const slots: ProjectSlots = {
      projectName,
      environment: env.name as 'staging' | 'production',
      activeSlot: 'blue',
      blue: {
        name: 'blue',
        state: 'active' as SlotState,
        port: projectPlan.target.bluePort,
        version: projectPlan.current.version,
        image: projectPlan.current.containerName,
        deployedAt: new Date().toISOString(),
        deployedBy: auth.keyId,
        healthStatus: 'unknown',
      },
      green: {
        name: 'green',
        state: 'empty' as SlotState,
        port: projectPlan.target.greenPort,
      },
      lastUpdated: new Date().toISOString(),
    };

    await updateSlotRegistry(projectName, env.name as 'staging' | 'production', slots);
  }
}

async function migrateContainer(
  ssh: ReturnType<typeof import('../lib/ssh.js').getSSHClient>,
  plan: MigrationPlan,
  projectName: string
): Promise<void> {
  const projectPlan = plan.projects.find(p => p.name === projectName);
  if (!projectPlan) return;

  for (const env of projectPlan.environments) {
    if (env.action !== 'migrate') continue;

    const oldContainerName = projectPlan.current.containerName;
    const newContainerName = `${projectName}-${env.name}-blue`;

    // 기존 컨테이너가 실행 중이면 정지
    await ssh.exec(`podman stop ${oldContainerName} 2>/dev/null || true`);

    // 컨테이너 이름 변경 (또는 새로 시작)
    await ssh.exec(`podman rename ${oldContainerName} ${newContainerName} 2>/dev/null || true`);

    // systemd 리로드
    await ssh.exec('systemctl --user daemon-reload');

    // 새 슬롯 컨테이너 시작
    await ssh.exec(`systemctl --user start ${newContainerName} 2>/dev/null || true`);
  }
}

async function updateCaddyForSlot(
  ssh: ReturnType<typeof import('../lib/ssh.js').getSSHClient>,
  plan: MigrationPlan,
  projectName: string
): Promise<void> {
  const projectPlan = plan.projects.find(p => p.name === projectName);
  if (!projectPlan || !projectPlan.current.domain) return;

  for (const env of projectPlan.environments) {
    if (env.action !== 'migrate') continue;

    const caddyConfig = `# CodeB v6.0 - Migrated Caddy Config
# Project: ${projectName}
# Environment: ${env.name}
# Active Slot: blue
# Migrated: ${new Date().toISOString()}

${projectPlan.current.domain} {
    reverse_proxy localhost:${projectPlan.target.bluePort} {
        health_uri /health
        health_interval 10s
        health_timeout 5s
        health_status 2xx
    }

    encode gzip zstd

    header {
        X-CodeB-Project ${projectName}
        X-CodeB-Environment ${env.name}
        X-CodeB-Slot blue
        X-CodeB-Migrated true
        -Server
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }

    log {
        output file /var/log/caddy/${projectName}-${env.name}.log {
            roll_size 10mb
            roll_keep 5
            roll_keep_for 720h
        }
        format json
    }
}
`;

    const caddyPath = `/etc/caddy/sites/${projectName}-${env.name}.caddy`;
    await ssh.writeFile(caddyPath, caddyConfig);
  }

  // Caddy 리로드
  await ssh.exec('systemctl reload caddy');
}

async function verifyMigration(
  ssh: ReturnType<typeof import('../lib/ssh.js').getSSHClient>,
  plan: MigrationPlan
): Promise<void> {
  for (const projectPlan of plan.projects) {
    for (const env of projectPlan.environments) {
      if (env.action !== 'migrate') continue;

      // 헬스체크
      const healthResult = await ssh.exec(
        `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${projectPlan.target.bluePort}/health 2>/dev/null || echo "000"`
      );

      if (!healthResult.stdout.trim().startsWith('2')) {
        throw new Error(
          `Health check failed for ${projectPlan.name}/${env.name} on port ${projectPlan.target.bluePort}`
        );
      }
    }
  }
}

async function markLegacyAsMigrated(
  ssh: ReturnType<typeof import('../lib/ssh.js').getSSHClient>,
  plan: MigrationPlan
): Promise<void> {
  // SSOT에 마이그레이션 마커 추가
  const ssotExists = await ssh.exec(`test -f ${LEGACY_SSOT_PATH} && echo "yes" || echo "no"`);

  if (ssotExists.stdout.trim() === 'yes') {
    const ssotContent = await ssh.readFile(LEGACY_SSOT_PATH);
    const ssot = JSON.parse(ssotContent);

    ssot._migrated = {
      at: new Date().toISOString(),
      migrationId: plan.id,
      projects: plan.projects.map(p => p.name),
    };

    await ssh.writeFile(LEGACY_SSOT_PATH, JSON.stringify(ssot, null, 2));
  }
}

// ============================================================================
// Rollback Migration
// ============================================================================

export async function rollbackMigration(
  plan: MigrationPlan,
  auth: AuthContext
): Promise<void> {
  return withSSH(SERVERS.app.ip, async (ssh) => {
    const backupDir = `/opt/codeb/backups/migration-${plan.id}`;

    // SSOT 복원
    await ssh.exec(`cp ${backupDir}/ssot.json ${LEGACY_SSOT_PATH} 2>/dev/null || true`);

    // Caddy 설정 복원
    await ssh.exec(`cp -r ${backupDir}/caddy-backup/* /etc/caddy/Caddyfile.d/ 2>/dev/null || true`);
    await ssh.exec(`cp -r ${backupDir}/caddy-sites-backup/* /etc/caddy/sites/ 2>/dev/null || true`);
    await ssh.exec('systemctl reload caddy');

    // 슬롯 레지스트리 삭제
    for (const projectPlan of plan.projects) {
      for (const env of projectPlan.environments) {
        await ssh.exec(`rm -f ${V6_REGISTRY_PATH}/${projectPlan.name}-${env.name}.json`);
      }
    }

    // Quadlet 파일 삭제
    for (const projectPlan of plan.projects) {
      const quadletDir = `/opt/codeb/projects/${projectPlan.name}/.config/containers/systemd`;
      await ssh.exec(`rm -rf ${quadletDir}/*.container 2>/dev/null || true`);
    }

    // 기존 컨테이너 재시작
    for (const projectPlan of plan.projects) {
      await ssh.exec(`podman start ${projectPlan.current.containerName} 2>/dev/null || true`);
    }

    plan.status = 'rolled_back';
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function inferProjectFromContainer(name: string): string | undefined {
  // 예: workb-cms-staging -> workb-cms
  const match = name.match(/^(.+?)-(staging|production|preview|blue|green)/);
  return match ? match[1] : undefined;
}

function inferEnvironmentFromContainer(name: string): string | undefined {
  if (name.includes('production')) return 'production';
  if (name.includes('staging')) return 'staging';
  if (name.includes('preview')) return 'preview';
  return 'staging'; // 기본값
}

function inferProjectFromDomain(domain: string): string | undefined {
  // 예: myapp.codeb.dev -> myapp
  // 예: myapp-staging.codeb.dev -> myapp
  const match = domain.match(/^([a-zA-Z0-9-]+?)(?:-(staging|production|preview))?\.codeb\.dev$/);
  return match ? match[1] : undefined;
}

function inferEnvironmentFromDomain(domain: string): 'staging' | 'production' | 'preview' | undefined {
  if (domain.includes('-staging.')) return 'staging';
  if (domain.includes('-preview.')) return 'preview';
  if (!domain.includes('-staging.') && !domain.includes('-preview.')) return 'production';
  return undefined;
}

function isPortInRange(port: number, range?: { start: number; end: number }): boolean {
  if (!range) return false;
  return port >= range.start && port <= range.end;
}

function findAvailablePort(
  range: { start: number; end: number },
  usedPorts: Set<number>
): number {
  for (let port = range.start; port <= range.end; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }
  throw new Error(`No available port in range ${range.start}-${range.end}`);
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const migrateDetectTool = {
  name: 'migrate_detect',
  description: 'Detect legacy system (v3.x/v5.x SSOT, containers, Caddy configs)',
  inputSchema: detectInputSchema,

  async execute(_params: unknown, auth: AuthContext): Promise<LegacyDetectionResult> {
    return detectLegacySystem(auth);
  },
};

export const migratePlanTool = {
  name: 'migrate_plan',
  description: 'Create migration plan from legacy to v6.0 slot system',
  inputSchema: planInputSchema,

  async execute(params: { projects?: string[]; dryRun?: boolean }, auth: AuthContext) {
    const detection = await detectLegacySystem(auth);
    const plan = await createMigrationPlan(detection, params.projects, auth);

    return {
      success: true,
      plan,
      dryRun: params.dryRun || false,
    };
  },
};

export const migrateExecuteTool = {
  name: 'migrate_execute',
  description: 'Execute migration from legacy to v6.0 slot system',
  inputSchema: executeInputSchema,

  async execute(params: { migrationId: string; force?: boolean }, auth: AuthContext) {
    // 먼저 계획 생성
    const detection = await detectLegacySystem(auth);
    const plan = await createMigrationPlan(detection, undefined, auth);

    // ID 매칭 확인 또는 새 마이그레이션 실행
    if (plan.projects.length === 0) {
      return {
        success: false,
        error: 'No projects to migrate',
      };
    }

    return executeMigration(plan, auth);
  },
};

export const migrateRollbackTool = {
  name: 'migrate_rollback',
  description: 'Rollback a failed or completed migration',
  inputSchema: rollbackInputSchema,

  async execute(params: { migrationId: string }, auth: AuthContext) {
    return withSSH(SERVERS.app.ip, async (ssh) => {
      // 마이그레이션 로그에서 계획 로드
      const logFile = `${MIGRATION_LOG_PATH}/${params.migrationId}.json`;
      const content = await ssh.readFile(logFile);
      const plan: MigrationPlan = JSON.parse(content);

      await rollbackMigration(plan, auth);

      return {
        success: true,
        message: `Migration ${params.migrationId} rolled back successfully`,
      };
    });
  },
};
