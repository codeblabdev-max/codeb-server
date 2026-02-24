/**
 * @codeb/api - Tool Registry & Router
 *
 * Maps MCP tool names to feature service handlers with permission requirements.
 * Services are lazily instantiated with their dependencies on each call.
 *
 * Refactored from mcp-server/src/index.ts TOOLS registry.
 */

import { Router } from 'express';
import type { AuthContext } from '@codeb/shared';

// ============================================================================
// Tool Handler Type
// ============================================================================

export interface ToolDefinition {
  handler: (params: Record<string, unknown>, auth: AuthContext) => Promise<ToolResult | any>;
  permission: string;
  description?: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  [key: string]: unknown;
}

// ============================================================================
// Lazy Dependency Helpers
// ============================================================================

async function getCoreDeps() {
  const db = await import('@codeb/db');
  const ssh = await import('@codeb/ssh');
  const logMod = await import('@codeb/logger');
  return {
    ProjectRepo: db.ProjectRepo,
    SlotRepo: db.SlotRepo,
    DeploymentRepo: db.DeploymentRepo,
    ProjectEnvRepo: db.ProjectEnvRepo,
    DomainRepo: db.DomainRepo,
    TeamRepo: db.TeamRepo,
    appSSH: ssh.getSSHClient(),
    storageSSH: ssh.getSSHClientForServer('storage'),
    logger: logMod.logger,
  };
}

async function getLogger() {
  const logMod = await import('@codeb/logger');
  return logMod.logger;
}

// ============================================================================
// Tool Registry
// ============================================================================

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  // ==========================================================================
  // Blue-Green Deployment (core)
  // ==========================================================================
  deploy: {
    handler: async (params, auth) => {
      const { DeployService } = await import('@codeb/feature-deployment');
      const d = await getCoreDeps();
      const svc = new DeployService(d.ProjectRepo, d.SlotRepo, d.DeploymentRepo, d.ProjectEnvRepo, d.appSSH, d.logger);
      return svc.execute(params as any, auth);
    },
    permission: 'deploy.create',
    description: 'Deploy to inactive slot',
  },
  deploy_project: {
    handler: async (params, auth) => {
      const { DeployService } = await import('@codeb/feature-deployment');
      const d = await getCoreDeps();
      const svc = new DeployService(d.ProjectRepo, d.SlotRepo, d.DeploymentRepo, d.ProjectEnvRepo, d.appSSH, d.logger);
      return svc.execute(params as any, auth);
    },
    permission: 'deploy.create',
    description: 'Deploy project to inactive slot (alias)',
  },
  promote: {
    handler: async (params, auth) => {
      const { PromoteService } = await import('@codeb/feature-deployment');
      const d = await getCoreDeps();
      const svc = new PromoteService(d.SlotRepo, d.appSSH, d.logger);
      return svc.execute(params as any, auth);
    },
    permission: 'deploy.promote',
    description: 'Promote deployed slot to active',
  },
  slot_promote: {
    handler: async (params, auth) => {
      const { PromoteService } = await import('@codeb/feature-deployment');
      const d = await getCoreDeps();
      const svc = new PromoteService(d.SlotRepo, d.appSSH, d.logger);
      return svc.execute(params as any, auth);
    },
    permission: 'deploy.promote',
    description: 'Promote deployed slot to active (alias)',
  },
  rollback: {
    handler: async (params, auth) => {
      const { RollbackService } = await import('@codeb/feature-deployment');
      const d = await getCoreDeps();
      const svc = new RollbackService(d.SlotRepo, d.appSSH, d.logger);
      return svc.execute(params as any, auth);
    },
    permission: 'deploy.rollback',
    description: 'Rollback to previous slot',
  },

  // ==========================================================================
  // Slot Management
  // ==========================================================================
  slot_status: {
    handler: async (params, auth) => {
      const { SlotService } = await import('@codeb/feature-deployment');
      const d = await getCoreDeps();
      const svc = new SlotService(d.SlotRepo, d.appSSH, d.logger);
      return svc.getStatus(params as any, auth);
    },
    permission: 'slot.view',
    description: 'View slot status for a project',
  },
  slot_cleanup: {
    handler: async (params, auth) => {
      const { SlotService } = await import('@codeb/feature-deployment');
      const d = await getCoreDeps();
      const svc = new SlotService(d.SlotRepo, d.appSSH, d.logger);
      return svc.cleanup(params as any, auth);
    },
    permission: 'slot.cleanup',
    description: 'Cleanup grace-period slots',
  },
  slot_list: {
    handler: async (_params, auth) => {
      const { SlotService } = await import('@codeb/feature-deployment');
      const d = await getCoreDeps();
      const svc = new SlotService(d.SlotRepo, d.appSSH, d.logger);
      return svc.list(auth);
    },
    permission: 'slot.view',
    description: 'List all project slots',
  },

  // ==========================================================================
  // Domain Management
  // ==========================================================================
  domain_setup: {
    handler: async (params, auth) => {
      const { DomainService } = await import('@codeb/feature-domain');
      const d = await getCoreDeps();
      const svc = new DomainService(d.DomainRepo, d.SlotRepo, d.appSSH, d.logger);
      return svc.setup(params as any, auth);
    },
    permission: 'domain.setup',
    description: 'Setup domain with DNS and SSL',
  },
  domain_list: {
    handler: async (params, auth) => {
      const { DomainService } = await import('@codeb/feature-domain');
      const d = await getCoreDeps();
      const svc = new DomainService(d.DomainRepo, d.SlotRepo, d.appSSH, d.logger);
      return svc.list(params as any, auth);
    },
    permission: 'domain.view',
    description: 'List all domains',
  },
  domain_delete: {
    handler: async (params, auth) => {
      const { DomainService } = await import('@codeb/feature-domain');
      const d = await getCoreDeps();
      const svc = new DomainService(d.DomainRepo, d.SlotRepo, d.appSSH, d.logger);
      return svc.delete(params as any, auth);
    },
    permission: 'domain.delete',
    description: 'Delete a domain configuration',
  },

  // ==========================================================================
  // Project (Initialization & Scan)
  // ==========================================================================
  workflow_init: {
    handler: async (params, auth) => {
      const { InitService } = await import('@codeb/feature-project');
      const d = await getCoreDeps();
      const svc = new InitService(d.ProjectRepo, d.SlotRepo, d.TeamRepo, d.appSSH, d.storageSSH, d.logger);
      return svc.execute(params as any, auth);
    },
    permission: 'deploy.create',
    description: 'Initialize project with Quadlet containers and workflow',
  },
  workflow_scan: {
    handler: async (params, auth) => {
      const { ScanService } = await import('@codeb/feature-project');
      const d = await getCoreDeps();
      const svc = new ScanService(d.ProjectRepo, d.SlotRepo, d.appSSH, d.logger);
      return svc.execute((params as any).projectName, auth);
    },
    permission: 'project.view',
    description: 'Scan project for configuration issues',
  },
  workflow_generate: {
    handler: async (params, auth) => {
      const { WorkflowService } = await import('@codeb/feature-project');
      const d = await getCoreDeps();
      const svc = new WorkflowService(d.ProjectRepo, d.logger);
      return svc.generate(params as any, auth);
    },
    permission: 'project.view',
    description: 'Generate CI/CD workflow files',
  },
  scan: {
    handler: async (params, auth) => {
      const { ScanService } = await import('@codeb/feature-project');
      const d = await getCoreDeps();
      const svc = new ScanService(d.ProjectRepo, d.SlotRepo, d.appSSH, d.logger);
      return svc.execute((params as any).projectName, auth);
    },
    permission: 'project.view',
    description: 'Scan project (alias for workflow_scan)',
  },

  // ==========================================================================
  // Environment Variables
  // ==========================================================================
  env_sync: {
    handler: async (params, auth) => {
      const { EnvService, SyncService } = await import('@codeb/feature-env');
      const d = await getCoreDeps();
      const envSvc = new EnvService(d.ProjectRepo, d.ProjectEnvRepo, d.appSSH, d.logger);
      const syncSvc = new SyncService(envSvc, d.appSSH, d.logger);
      return syncSvc.push(params as any, auth);
    },
    permission: 'env.write',
    description: 'Sync environment variables to server',
  },
  env_get: {
    handler: async (params, auth) => {
      const { EnvService } = await import('@codeb/feature-env');
      const d = await getCoreDeps();
      const svc = new EnvService(d.ProjectRepo, d.ProjectEnvRepo, d.appSSH, d.logger);
      return svc.get(params as any, auth);
    },
    permission: 'env.read',
    description: 'Get environment variables from server',
  },
  env_scan: {
    handler: async (params, auth) => {
      const { EnvService } = await import('@codeb/feature-env');
      const d = await getCoreDeps();
      const svc = new EnvService(d.ProjectRepo, d.ProjectEnvRepo, d.appSSH, d.logger);
      return svc.scan(params as any, auth);
    },
    permission: 'env.read',
    description: 'Compare local and server environment variables',
  },
  env_restore: {
    handler: async (params, auth) => {
      const { EnvService, BackupService } = await import('@codeb/feature-env');
      const d = await getCoreDeps();
      const envSvc = new EnvService(d.ProjectRepo, d.ProjectEnvRepo, d.appSSH, d.logger);
      const backupSvc = new BackupService(d.ProjectRepo, d.ProjectEnvRepo, envSvc, d.appSSH, d.logger);
      return backupSvc.restore(params as any, auth);
    },
    permission: 'env.write',
    description: 'Restore environment variables from backup',
  },

  // ==========================================================================
  // Team Management
  // ==========================================================================
  team_create: {
    handler: async (params, auth) => {
      const { TeamService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new TeamService(logger);
      return svc.create(params as any, auth);
    },
    permission: 'team.create',
    description: 'Create a new team',
  },
  team_list: {
    handler: async (_params, auth) => {
      const { TeamService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new TeamService(logger);
      return svc.list(auth);
    },
    permission: 'team.view',
    description: 'List all teams',
  },
  team_get: {
    handler: async (params, auth) => {
      const { TeamService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new TeamService(logger);
      return svc.get((params as any).teamId, auth);
    },
    permission: 'team.view',
    description: 'Get team details',
  },
  team_delete: {
    handler: async (params, auth) => {
      const { TeamService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new TeamService(logger);
      return svc.delete((params as any).teamId, auth);
    },
    permission: 'team.delete',
    description: 'Delete a team',
  },
  team_settings: {
    handler: async (params, auth) => {
      const { TeamService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new TeamService(logger);
      return svc.updateSettings((params as any).teamId, (params as any).settings, auth);
    },
    permission: 'team.admin',
    description: 'Update team settings',
  },
  member_invite: {
    handler: async (params, auth) => {
      const { MemberService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new MemberService(logger);
      return svc.invite(params as any, auth);
    },
    permission: 'member.invite',
    description: 'Invite a member to team',
  },
  member_remove: {
    handler: async (params, auth) => {
      const { MemberService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new MemberService(logger);
      return svc.remove(params as any, auth);
    },
    permission: 'member.remove',
    description: 'Remove a member from team',
  },
  member_list: {
    handler: async (params, auth) => {
      const { MemberService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new MemberService(logger);
      return svc.list((params as any).teamId, auth);
    },
    permission: 'member.view',
    description: 'List team members',
  },
  token_create: {
    handler: async (params, auth) => {
      const { TokenService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new TokenService(logger);
      return svc.create(params as any, auth);
    },
    permission: 'token.create',
    description: 'Create an API token',
  },
  token_revoke: {
    handler: async (params, auth) => {
      const { TokenService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new TokenService(logger);
      return svc.revoke((params as any).tokenId, auth);
    },
    permission: 'token.revoke',
    description: 'Revoke an API token',
  },
  token_list: {
    handler: async (params, auth) => {
      const { TokenService } = await import('@codeb/feature-team');
      const logger = await getLogger();
      const svc = new TokenService(logger);
      return svc.list((params as any).teamId, auth);
    },
    permission: 'token.view',
    description: 'List API tokens',
  },

  // ==========================================================================
  // Monitoring & Health
  // ==========================================================================
  health_check: {
    handler: async (params) => {
      const { HealthService } = await import('@codeb/feature-monitoring');
      const ssh = await import('@codeb/ssh');
      const logger = await getLogger();
      const svc = new HealthService(ssh.getSSHClient(), logger);
      return svc.check((params as any).server);
    },
    permission: 'project.view',
    description: 'Check infrastructure health status',
  },
};

// ============================================================================
// Express Router (REST-style alternative routes)
// ============================================================================

export function createRouter(): Router {
  const router = Router();

  router.post('/deploy', async (req, res, next) => {
    try {
      const auth = (req as any).auth as AuthContext;
      const result = await TOOL_REGISTRY.deploy.handler(req.body, auth);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/promote', async (req, res, next) => {
    try {
      const auth = (req as any).auth as AuthContext;
      const result = await TOOL_REGISTRY.promote.handler(req.body, auth);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/rollback', async (req, res, next) => {
    try {
      const auth = (req as any).auth as AuthContext;
      const result = await TOOL_REGISTRY.rollback.handler(req.body, auth);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/slots', async (req, res, next) => {
    try {
      const auth = (req as any).auth as AuthContext;
      const result = await TOOL_REGISTRY.slot_list.handler(req.query as any, auth);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/slots/:project', async (req, res, next) => {
    try {
      const auth = (req as any).auth as AuthContext;
      const result = await TOOL_REGISTRY.slot_status.handler(
        { projectName: req.params.project, ...req.query },
        auth,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/domains', async (req, res, next) => {
    try {
      const auth = (req as any).auth as AuthContext;
      const result = await TOOL_REGISTRY.domain_list.handler(req.query as any, auth);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/domains', async (req, res, next) => {
    try {
      const auth = (req as any).auth as AuthContext;
      const result = await TOOL_REGISTRY.domain_setup.handler(req.body, auth);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
