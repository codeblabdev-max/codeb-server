/**
 * Sync Projects Tool
 * 
 * 다중 프로젝트 동기화 도구
 */

import { MultiProjectSyncManager } from '../lib/multi-project-sync.js';

interface SyncProjectsArgs {
  operation: 'register' | 'sync' | 'share_context' | 'enable_network' | 'status';
  project_path?: string;
  project_name?: string;
  framework?: string;
  source_project_id?: string;
  target_project_id?: string;
  target_projects?: string[];
  context_type?: 'pattern' | 'configuration' | 'template' | 'workflow' | 'dependency';
  context_data?: any;
  sync_options?: {
    includePatterns?: boolean;
    includeConfigurations?: boolean;
    includeTemplates?: boolean;
    autoResolveConflicts?: boolean;
    syncStrategy?: 'push' | 'pull' | 'bidirectional';
  };
  network_id?: string;
}

export class SyncProjectsTool {
  private syncManager: MultiProjectSyncManager;

  constructor() {
    this.syncManager = new MultiProjectSyncManager();
  }

  async execute(args: SyncProjectsArgs) {
    try {
      // 동기화 매니저 초기화
      await this.syncManager.initialize();

      switch (args.operation) {
        case 'register':
          return await this.registerProject(args);
        
        case 'sync':
          return await this.syncProjects(args);
        
        case 'share_context':
          return await this.shareContext(args);
        
        case 'enable_network':
          return await this.enableNetworkSync(args);
        
        case 'status':
          return await this.getStatus();
        
        default:
          throw new Error(`Unknown operation: ${args.operation}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  private async registerProject(args: SyncProjectsArgs) {
    if (!args.project_path) {
      throw new Error('project_path is required for register operation');
    }

    console.log(`[SyncProjects] Registering project: ${args.project_path}`);

    const projectId = await this.syncManager.registerProject(
      args.project_path,
      args.project_name,
      args.framework
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'register',
            results: {
              project_id: projectId,
              project_path: args.project_path,
              project_name: args.project_name,
              framework: args.framework
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async syncProjects(args: SyncProjectsArgs) {
    if (!args.source_project_id || !args.target_project_id) {
      throw new Error('source_project_id and target_project_id are required for sync operation');
    }

    console.log(`[SyncProjects] Syncing ${args.source_project_id} → ${args.target_project_id}`);

    const syncResult = await this.syncManager.syncProjects(
      args.source_project_id,
      args.target_project_id,
      args.sync_options || {}
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'sync',
            results: {
              source_project_id: args.source_project_id,
              target_project_id: args.target_project_id,
              sync_result: syncResult,
              sync_options: args.sync_options
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async shareContext(args: SyncProjectsArgs) {
    if (!args.source_project_id || !args.context_type || !args.context_data) {
      throw new Error('source_project_id, context_type, and context_data are required for share_context operation');
    }

    console.log(`[SyncProjects] Sharing context from ${args.source_project_id}`);

    const contextId = await this.syncManager.shareContext(
      args.source_project_id,
      args.context_type,
      args.context_data,
      args.target_projects || [],
      {
        description: `Shared ${args.context_type} context`,
        tags: [args.context_type],
        sync_strategy: 'auto',
        conflict_resolution: 'newest'
      }
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'share_context',
            results: {
              context_id: contextId,
              source_project_id: args.source_project_id,
              context_type: args.context_type,
              target_projects: args.target_projects,
              shared_at: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async enableNetworkSync(args: SyncProjectsArgs) {
    if (!args.network_id) {
      throw new Error('network_id is required for enable_network operation');
    }

    console.log(`[SyncProjects] Enabling network sync for: ${args.network_id}`);

    await this.syncManager.enableNetworkSync(args.network_id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'enable_network',
            results: {
              network_id: args.network_id,
              enabled_at: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async getStatus() {
    // 동기화 매니저의 상태 정보를 반환
    const status = {
      initialized: true,
      active_projects: 0, // 실제 구현에서는 registry에서 가져와야 함
      active_networks: 0,
      recent_syncs: [],
      system_health: 'healthy'
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'status',
            results: status,
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }
}