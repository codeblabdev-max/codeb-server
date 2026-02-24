/**
 * ScanService - Project status verification
 *
 * Checks ports, domains, containers, ENV status.
 * Refactored from mcp-server/src/tools/project.ts (executeWorkflowScan)
 */

import type { ProjectRepo, SlotRepo } from '@codeb/db';
import type { SSHClientWrapper } from '@codeb/ssh';
import type { AuthContext } from '@codeb/shared';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}

export interface ScanResult {
  success: boolean;
  projectName: string;
  registered: boolean;
  hasDockerfile: boolean;
  hasDockerContainer: boolean;
  hasGitHubActions: boolean;
  hasEnv: boolean;
  ports: { blue: number; green: number };
  slotStatus?: {
    activeSlot: string;
    blueState: string;
    greenState: string;
  };
  issues: string[];
  teamProjects?: string[];
  suggestedProject?: string;
}

export class ScanService {
  constructor(
    private readonly projectRepo: typeof ProjectRepo,
    private readonly slotRepo: typeof SlotRepo,
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {}

  async execute(projectName: string, auth: AuthContext): Promise<ScanResult> {
    const issues: string[] = [];
    let ports = { blue: 0, green: 0 };
    let slotStatus: ScanResult['slotStatus'];
    let teamProjects: string[] = [];
    let suggestedProject: string | undefined;

    try {
      // Step 1: DB project check
      const project = await this.projectRepo.findByName(projectName);
      const registered = !!project;

      // Step 1.5: Team projects for suggestions
      try {
        const allTeamProjects = await this.projectRepo.findByTeam(auth.teamId);
        teamProjects = allTeamProjects.map((p: any) => p.name);

        if (!registered && teamProjects.length > 0) {
          const similar = this.findSimilarProject(projectName, teamProjects);
          if (similar) {
            suggestedProject = similar;
            issues.push(`Project '${projectName}' not found. Did you mean '${similar}'?`);
          }
        }
      } catch (teamError) {
        this.logger.warn('Failed to fetch team projects', {
          teamId: auth.teamId,
          error: String(teamError),
        });
      }

      if (!registered) {
        issues.push('Project not registered in DB. Run project init first.');
        if (teamProjects.length > 0) {
          issues.push(`Team projects: ${teamProjects.join(', ')}`);
        }
      }

      // Step 2: Slot check
      const slots = await this.slotRepo.findByProject(projectName, 'production');
      if (slots) {
        ports = { blue: slots.blue.port, green: slots.green.port };
        slotStatus = {
          activeSlot: slots.activeSlot,
          blueState: slots.blue.state,
          greenState: slots.green.state,
        };
      } else if (registered) {
        issues.push('Slot registry not found');
      }

      // Step 3: App server status
      let hasDockerfile = false;
      let hasDockerContainer = false;
      let hasEnv = false;

      try {
        const dockerfileCheck = await this.ssh.exec(
          `test -f /opt/codeb/projects/${projectName}/Dockerfile && echo "OK" || echo "MISS"`,
        );
        hasDockerfile = dockerfileCheck.stdout.trim() === 'OK';
      } catch {
        // no dockerfile
      }

      try {
        const containerCheck = await this.ssh.exec(
          `docker ps -a --format '{{.Names}}' | grep -c "^${projectName}-" || echo "0"`,
        );
        hasDockerContainer = parseInt(containerCheck.stdout.trim()) > 0;
      } catch {
        // no docker containers
      }

      try {
        const envCheck = await this.ssh.exec(
          `test -f /opt/codeb/env/${projectName}/.env && echo "OK" || echo "MISS"`,
        );
        hasEnv = envCheck.stdout.trim() === 'OK';
      } catch {
        // no env
      }

      if (!hasDockerContainer) issues.push('No Docker containers (first deploy needed)');
      if (!hasEnv) issues.push('No ENV file found');

      this.logger.debug('Project scan completed', { projectName, registered, issues });

      return {
        success: true,
        projectName,
        registered,
        hasDockerfile,
        hasDockerContainer,
        hasGitHubActions: false,
        hasEnv,
        ports,
        slotStatus,
        issues,
        teamProjects: teamProjects.length > 0 ? teamProjects : undefined,
        suggestedProject,
      };
    } catch (error) {
      this.logger.error('Project scan failed', {
        projectName,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        projectName,
        registered: false,
        hasDockerfile: false,
        hasDockerContainer: false,
        hasGitHubActions: false,
        hasEnv: false,
        ports,
        issues: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private findSimilarProject(input: string, projects: string[]): string | undefined {
    const inputLower = input.toLowerCase();
    let bestMatch: string | undefined;
    let bestDistance = Infinity;

    for (const proj of projects) {
      const projLower = proj.toLowerCase();
      if (projLower.includes(inputLower) || inputLower.includes(projLower)) return proj;

      const distance = this.levenshteinDistance(inputLower, projLower);
      if (distance < bestDistance && distance <= 3) {
        bestDistance = distance;
        bestMatch = proj;
      }
    }

    return bestMatch;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}
