/**
 * Multi-Project Context Synchronization
 * 
 * 다중 프로젝트 간 컨텍스트 공유 및 동기화 시스템
 * - 프로젝트 간 패턴 및 설정 공유
 * - 실시간 컨텍스트 동기화
 * - 분산 컨텍스트 관리
 * - 충돌 해결 및 버전 관리
 */

import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';
import { z } from 'zod';
import chokidar from 'chokidar';
import { glob } from 'glob';

// 공유 컨텍스트 스키마
const SharedContextSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['pattern', 'configuration', 'template', 'workflow', 'dependency']),
  version: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  source_project: z.string(),
  shared_to: z.array(z.string()),
  data: z.record(z.any()),
  metadata: z.object({
    description: z.string(),
    tags: z.array(z.string()),
    framework: z.string().optional(),
    compatibility: z.record(z.boolean()).optional(),
    sync_strategy: z.enum(['auto', 'manual', 'on-demand']),
    conflict_resolution: z.enum(['newest', 'manual', 'merge'])
  })
});

export type SharedContext = z.infer<typeof SharedContextSchema>;

// 동기화 상태 스키마
const SyncStateSchema = z.object({
  project_id: z.string(),
  last_sync: z.string(),
  sync_version: z.string(),
  pending_changes: z.array(z.object({
    context_id: z.string(),
    operation: z.enum(['create', 'update', 'delete']),
    timestamp: z.string(),
    resolved: z.boolean()
  })),
  conflicts: z.array(z.object({
    context_id: z.string(),
    conflict_type: z.enum(['version', 'content', 'metadata']),
    local_version: z.string(),
    remote_version: z.string(),
    resolution_strategy: z.string().optional(),
    resolved: z.boolean()
  }))
});

export type SyncState = z.infer<typeof SyncStateSchema>;

// 프로젝트 레지스트리
const ProjectRegistrySchema = z.object({
  projects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    framework: z.string(),
    last_seen: z.string(),
    status: z.enum(['active', 'inactive', 'offline']),
    shared_contexts: z.array(z.string()),
    sync_preferences: z.object({
      auto_sync: z.boolean(),
      sync_patterns: z.boolean(),
      sync_configurations: z.boolean(),
      conflict_resolution: z.enum(['newest', 'manual', 'merge'])
    })
  })),
  sync_networks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    projects: z.array(z.string()),
    sync_strategy: z.enum(['star', 'mesh', 'hierarchical'])
  }))
});

export type ProjectRegistry = z.infer<typeof ProjectRegistrySchema>;

interface SyncOptions {
  includePatterns?: boolean;
  includeConfigurations?: boolean;
  includeTemplates?: boolean;
  autoResolveConflicts?: boolean;
  syncStrategy?: 'push' | 'pull' | 'bidirectional';
}

export class MultiProjectSyncManager extends EventEmitter {
  private syncDir: string;
  private registryPath: string;
  private registry: ProjectRegistry;
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private syncStates: Map<string, SyncState> = new Map();
  private sharedContexts: Map<string, SharedContext> = new Map();

  constructor(syncDir = '.mcp-sync') {
    super();
    this.syncDir = syncDir;
    this.registryPath = path.join(syncDir, 'registry.json');
    this.registry = { projects: [], sync_networks: [] };
  }

  /**
   * 초기화
   */
  async initialize(): Promise<void> {
    await fs.ensureDir(this.syncDir);
    
    try {
      if (await fs.pathExists(this.registryPath)) {
        const data = await fs.readJson(this.registryPath);
        this.registry = ProjectRegistrySchema.parse(data);
      }
      
      // 공유 컨텍스트 로드
      await this.loadSharedContexts();
      
      // 각 프로젝트의 동기화 상태 로드
      for (const project of this.registry.projects) {
        await this.loadSyncState(project.id);
      }

      console.log('[MultiProjectSync] Initialized with', this.registry.projects.length, 'projects');
    } catch (error) {
      console.warn('[MultiProjectSync] Failed to initialize:', error);
    }
  }

  /**
   * 프로젝트 등록
   */
  async registerProject(
    projectPath: string,
    name?: string,
    framework?: string
  ): Promise<string> {
    const projectId = this.generateProjectId(projectPath);
    
    // 프로젝트 정보 자동 감지
    const projectInfo = await this.detectProjectInfo(projectPath);
    
    const project = {
      id: projectId,
      name: name || projectInfo.name || path.basename(projectPath),
      path: path.resolve(projectPath),
      framework: framework || projectInfo.framework || 'generic',
      last_seen: new Date().toISOString(),
      status: 'active' as const,
      shared_contexts: [],
      sync_preferences: {
        auto_sync: true,
        sync_patterns: true,
        sync_configurations: true,
        conflict_resolution: 'newest' as const
      }
    };

    // 기존 프로젝트 확인
    const existingIndex = this.registry.projects.findIndex(p => p.id === projectId);
    if (existingIndex >= 0) {
      this.registry.projects[existingIndex] = project;
    } else {
      this.registry.projects.push(project);
    }

    // 동기화 상태 초기화
    const syncState: SyncState = {
      project_id: projectId,
      last_sync: new Date().toISOString(),
      sync_version: '1.0.0',
      pending_changes: [],
      conflicts: []
    };
    
    this.syncStates.set(projectId, syncState);

    // 파일 워처 설정 (자동 동기화가 활성화된 경우)
    if (project.sync_preferences.auto_sync) {
      await this.setupProjectWatcher(project);
    }

    await this.saveRegistry();
    
    this.emit('project_registered', { projectId, project });
    
    console.log(`[MultiProjectSync] Registered project: ${project.name} (${projectId})`);
    return projectId;
  }

  /**
   * 컨텍스트 공유
   */
  async shareContext(
    sourceProjectId: string,
    contextType: SharedContext['type'],
    contextData: any,
    targetProjects: string[] = [],
    metadata?: Partial<SharedContext['metadata']>
  ): Promise<string> {
    const contextId = this.generateContextId(sourceProjectId, contextType);
    
    const sharedContext: SharedContext = {
      id: contextId,
      name: metadata?.description || `${contextType} from ${sourceProjectId}`,
      type: contextType,
      version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source_project: sourceProjectId,
      shared_to: targetProjects,
      data: contextData,
      metadata: {
        description: metadata?.description || `Shared ${contextType}`,
        tags: metadata?.tags || [contextType],
        framework: metadata?.framework,
        compatibility: metadata?.compatibility,
        sync_strategy: metadata?.sync_strategy || 'auto',
        conflict_resolution: metadata?.conflict_resolution || 'newest'
      }
    };

    this.sharedContexts.set(contextId, sharedContext);
    
    // 소스 프로젝트에 공유 컨텍스트 추가
    const sourceProject = this.registry.projects.find(p => p.id === sourceProjectId);
    if (sourceProject && !sourceProject.shared_contexts.includes(contextId)) {
      sourceProject.shared_contexts.push(contextId);
    }

    // 대상 프로젝트들에 동기화 스케줄링
    for (const targetProjectId of targetProjects) {
      await this.scheduleSyncOperation(targetProjectId, {
        context_id: contextId,
        operation: 'create',
        timestamp: new Date().toISOString(),
        resolved: false
      });
    }

    await this.saveSharedContexts();
    await this.saveRegistry();

    this.emit('context_shared', { contextId, sourceProjectId, targetProjects });

    console.log(`[MultiProjectSync] Shared context: ${contextId} to ${targetProjects.length} projects`);
    return contextId;
  }

  /**
   * 프로젝트 간 동기화
   */
  async syncProjects(
    sourceProjectId: string,
    targetProjectId: string,
    options: SyncOptions = {}
  ): Promise<{ 
    synced: number,
    conflicts: number,
    skipped: number,
    details: string[]
  }> {
    const sourceProject = this.registry.projects.find(p => p.id === sourceProjectId);
    const targetProject = this.registry.projects.find(p => p.id === targetProjectId);

    if (!sourceProject || !targetProject) {
      throw new Error('Source or target project not found');
    }

    console.log(`[MultiProjectSync] Syncing ${sourceProject.name} → ${targetProject.name}`);

    const result = {
      synced: 0,
      conflicts: 0,
      skipped: 0,
      details: []
    };

    // 공유된 컨텍스트들 동기화
    const sharedContextsToSync = Array.from(this.sharedContexts.values()).filter(
      ctx => ctx.source_project === sourceProjectId && 
             (ctx.shared_to.includes(targetProjectId) || ctx.shared_to.length === 0)
    );

    for (const sharedContext of sharedContextsToSync) {
      try {
        const syncResult = await this.syncSharedContext(sharedContext, targetProject, options);
        
        if (syncResult.status === 'synced') {
          result.synced++;
          result.details.push(`✅ Synced ${sharedContext.name}`);
        } else if (syncResult.status === 'conflict') {
          result.conflicts++;
          result.details.push(`⚠️ Conflict in ${sharedContext.name}: ${syncResult.reason}`);
        } else {
          result.skipped++;
          result.details.push(`⏭️ Skipped ${sharedContext.name}: ${syncResult.reason}`);
        }
      } catch (error) {
        result.skipped++;
        result.details.push(`❌ Failed to sync ${sharedContext.name}: ${error}`);
      }
    }

    // 동기화 상태 업데이트
    const targetSyncState = this.syncStates.get(targetProjectId);
    if (targetSyncState) {
      targetSyncState.last_sync = new Date().toISOString();
      targetSyncState.sync_version = this.incrementVersion(targetSyncState.sync_version);
    }

    await this.saveSyncState(targetProjectId);

    this.emit('projects_synced', { 
      sourceProjectId, 
      targetProjectId, 
      result 
    });

    return result;
  }

  /**
   * 단일 공유 컨텍스트 동기화
   */
  private async syncSharedContext(
    sharedContext: SharedContext,
    targetProject: ProjectRegistry['projects'][0],
    options: SyncOptions
  ): Promise<{ status: 'synced' | 'conflict' | 'skipped', reason?: string }> {
    const targetPath = targetProject.path;
    
    // 타입별 동기화 로직
    switch (sharedContext.type) {
      case 'pattern':
        if (!options.includePatterns) {
          return { status: 'skipped', reason: 'Patterns not included in sync' };
        }
        return await this.syncPattern(sharedContext, targetPath);

      case 'configuration':
        if (!options.includeConfigurations) {
          return { status: 'skipped', reason: 'Configurations not included in sync' };
        }
        return await this.syncConfiguration(sharedContext, targetPath);

      case 'template':
        if (!options.includeTemplates) {
          return { status: 'skipped', reason: 'Templates not included in sync' };
        }
        return await this.syncTemplate(sharedContext, targetPath);

      default:
        return await this.syncGenericContext(sharedContext, targetPath);
    }
  }

  /**
   * 패턴 동기화
   */
  private async syncPattern(
    sharedContext: SharedContext,
    targetPath: string
  ): Promise<{ status: 'synced' | 'conflict' | 'skipped', reason?: string }> {
    try {
      const pattern = sharedContext.data;
      const patternDir = path.join(targetPath, '.mcp-patterns');
      
      await fs.ensureDir(patternDir);
      
      const patternFile = path.join(patternDir, `${sharedContext.id}.json`);
      
      // 충돌 검사
      if (await fs.pathExists(patternFile)) {
        const existing = await fs.readJson(patternFile);
        if (existing.version !== sharedContext.version) {
          // 충돌 해결 전략 적용
          return await this.resolvePatternConflict(sharedContext, existing, patternFile);
        }
      }

      // 패턴 파일 저장
      await fs.writeJson(patternFile, {
        ...pattern,
        synced_from: sharedContext.source_project,
        synced_at: new Date().toISOString()
      }, { spaces: 2 });

      return { status: 'synced' };
    } catch (error) {
      return { status: 'skipped', reason: `Pattern sync failed: ${error}` };
    }
  }

  /**
   * 설정 동기화
   */
  private async syncConfiguration(
    sharedContext: SharedContext,
    targetPath: string
  ): Promise<{ status: 'synced' | 'conflict' | 'skipped', reason?: string }> {
    try {
      const config = sharedContext.data;
      const configDir = path.join(targetPath, '.mcp-config');
      
      await fs.ensureDir(configDir);
      
      const configFile = path.join(configDir, `${sharedContext.id}.json`);
      
      // 설정별 병합 로직
      if (await fs.pathExists(configFile)) {
        const existing = await fs.readJson(configFile);
        const merged = await this.mergeConfigurations(existing, config);
        
        await fs.writeJson(configFile, {
          ...merged,
          synced_from: sharedContext.source_project,
          synced_at: new Date().toISOString()
        }, { spaces: 2 });
      } else {
        await fs.writeJson(configFile, {
          ...config,
          synced_from: sharedContext.source_project,
          synced_at: new Date().toISOString()
        }, { spaces: 2 });
      }

      return { status: 'synced' };
    } catch (error) {
      return { status: 'skipped', reason: `Configuration sync failed: ${error}` };
    }
  }

  /**
   * 템플릿 동기화
   */
  private async syncTemplate(
    sharedContext: SharedContext,
    targetPath: string
  ): Promise<{ status: 'synced' | 'conflict' | 'skipped', reason?: string }> {
    try {
      const template = sharedContext.data;
      const templateDir = path.join(targetPath, '.mcp-templates');
      
      await fs.ensureDir(templateDir);
      
      // 템플릿 파일들 생성
      for (const file of template.files || []) {
        const filePath = path.join(templateDir, file.path);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, file.content);
      }

      // 메타데이터 저장
      const metadataFile = path.join(templateDir, `${sharedContext.id}.meta.json`);
      await fs.writeJson(metadataFile, {
        ...sharedContext.metadata,
        synced_from: sharedContext.source_project,
        synced_at: new Date().toISOString()
      }, { spaces: 2 });

      return { status: 'synced' };
    } catch (error) {
      return { status: 'skipped', reason: `Template sync failed: ${error}` };
    }
  }

  /**
   * 일반 컨텍스트 동기화
   */
  private async syncGenericContext(
    sharedContext: SharedContext,
    targetPath: string
  ): Promise<{ status: 'synced' | 'conflict' | 'skipped', reason?: string }> {
    try {
      const contextDir = path.join(targetPath, '.mcp-contexts');
      await fs.ensureDir(contextDir);
      
      const contextFile = path.join(contextDir, `${sharedContext.id}.json`);
      await fs.writeJson(contextFile, {
        ...sharedContext,
        synced_at: new Date().toISOString()
      }, { spaces: 2 });

      return { status: 'synced' };
    } catch (error) {
      return { status: 'skipped', reason: `Context sync failed: ${error}` };
    }
  }

  /**
   * 네트워크 자동 동기화
   */
  async enableNetworkSync(networkId: string): Promise<void> {
    const network = this.registry.sync_networks.find(n => n.id === networkId);
    
    if (!network) {
      throw new Error(`Sync network not found: ${networkId}`);
    }

    console.log(`[MultiProjectSync] Enabling network sync for: ${network.name}`);

    // 네트워크 내 모든 프로젝트에 워처 설정
    for (const projectId of network.projects) {
      const project = this.registry.projects.find(p => p.id === projectId);
      if (project) {
        await this.setupNetworkWatcher(project, network);
      }
    }

    this.emit('network_sync_enabled', { networkId, network });
  }

  /**
   * 프로젝트 정보 자동 감지
   */
  private async detectProjectInfo(projectPath: string): Promise<{
    name: string;
    framework: string;
    dependencies: string[];
  }> {
    const result = {
      name: path.basename(projectPath),
      framework: 'generic',
      dependencies: []
    };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        
        result.name = packageJson.name || result.name;
        result.dependencies = Object.keys({
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        });

        // 프레임워크 감지
        if (result.dependencies.includes('next')) result.framework = 'nextjs';
        else if (result.dependencies.includes('react')) result.framework = 'react';
        else if (result.dependencies.includes('vue')) result.framework = 'vue';
        else if (result.dependencies.includes('@remix-run/dev')) result.framework = 'remix';
        else if (result.dependencies.includes('express')) result.framework = 'express';
      }
    } catch (error) {
      console.warn(`[MultiProjectSync] Failed to detect project info for ${projectPath}:`, error);
    }

    return result;
  }

  /**
   * 프로젝트 워처 설정
   */
  private async setupProjectWatcher(
    project: ProjectRegistry['projects'][0]
  ): Promise<void> {
    if (this.watchers.has(project.id)) {
      this.watchers.get(project.id)?.close();
    }

    const watcher = chokidar.watch([
      path.join(project.path, '.mcp-patterns/**/*'),
      path.join(project.path, '.mcp-config/**/*'),
      path.join(project.path, '.mcp-templates/**/*')
    ], {
      ignored: /node_modules/,
      persistent: true
    });

    watcher.on('change', (filePath) => {
      this.handleFileChange(project.id, filePath, 'change');
    });

    watcher.on('add', (filePath) => {
      this.handleFileChange(project.id, filePath, 'add');
    });

    watcher.on('unlink', (filePath) => {
      this.handleFileChange(project.id, filePath, 'delete');
    });

    this.watchers.set(project.id, watcher);
  }

  /**
   * 네트워크 워처 설정
   */
  private async setupNetworkWatcher(
    project: ProjectRegistry['projects'][0],
    network: ProjectRegistry['sync_networks'][0]
  ): Promise<void> {
    // 기본 프로젝트 워처 설정
    await this.setupProjectWatcher(project);

    // 네트워크 동기화를 위한 추가 이벤트 핸들러
    this.on('file_changed', async (data) => {
      if (data.projectId === project.id) {
        // 네트워크 내 다른 프로젝트들에 변경사항 전파
        for (const otherProjectId of network.projects) {
          if (otherProjectId !== project.id) {
            await this.propagateChange(data, otherProjectId);
          }
        }
      }
    });
  }

  /**
   * 파일 변경 처리
   */
  private async handleFileChange(
    projectId: string,
    filePath: string,
    changeType: 'add' | 'change' | 'delete'
  ): Promise<void> {
    console.log(`[MultiProjectSync] File ${changeType} in ${projectId}: ${filePath}`);

    const changeData = {
      projectId,
      filePath,
      changeType,
      timestamp: new Date().toISOString()
    };

    // 동기화 변경사항 스케줄링
    await this.scheduleSyncOperation(projectId, {
      context_id: this.extractContextIdFromPath(filePath),
      operation: changeType === 'delete' ? 'delete' : 'update',
      timestamp: changeData.timestamp,
      resolved: false
    });

    this.emit('file_changed', changeData);
  }

  /**
   * 변경사항 전파
   */
  private async propagateChange(
    changeData: any,
    targetProjectId: string
  ): Promise<void> {
    const targetProject = this.registry.projects.find(p => p.id === targetProjectId);
    
    if (!targetProject || !targetProject.sync_preferences.auto_sync) {
      return;
    }

    // 자동 동기화 수행
    try {
      console.log(`[MultiProjectSync] Propagating change to ${targetProject.name}`);
      
      // 실제 동기화 로직은 변경 타입에 따라 구현
      // 여기서는 기본적인 파일 복사 예시
      
      this.emit('change_propagated', {
        sourceProjectId: changeData.projectId,
        targetProjectId,
        changeData
      });
    } catch (error) {
      console.error(`[MultiProjectSync] Failed to propagate change to ${targetProjectId}:`, error);
    }
  }

  /**
   * 유틸리티 메서드들
   */
  private generateProjectId(projectPath: string): string {
    return path.resolve(projectPath).replace(/[^\w]/g, '_').toLowerCase();
  }

  private generateContextId(projectId: string, type: string): string {
    return `${projectId}_${type}_${Date.now()}`;
  }

  private extractContextIdFromPath(filePath: string): string {
    const basename = path.basename(filePath, path.extname(filePath));
    return basename.includes('.') ? basename.split('.')[0] : basename;
  }

  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0', 10) + 1;
    return `${parts[0] || '1'}.${parts[1] || '0'}.${patch}`;
  }

  private async scheduleSyncOperation(
    projectId: string,
    operation: SyncState['pending_changes'][0]
  ): Promise<void> {
    let syncState = this.syncStates.get(projectId);
    
    if (!syncState) {
      syncState = {
        project_id: projectId,
        last_sync: new Date().toISOString(),
        sync_version: '1.0.0',
        pending_changes: [],
        conflicts: []
      };
      this.syncStates.set(projectId, syncState);
    }

    syncState.pending_changes.push(operation);
    await this.saveSyncState(projectId);
  }

  /**
   * 충돌 해결
   */
  private async resolvePatternConflict(
    sharedContext: SharedContext,
    existing: any,
    filePath: string
  ): Promise<{ status: 'synced' | 'conflict' | 'skipped', reason?: string }> {
    const strategy = sharedContext.metadata.conflict_resolution;

    switch (strategy) {
      case 'newest':
        const sharedDate = new Date(sharedContext.updated_at);
        const existingDate = new Date(existing.updated_at || existing.synced_at);
        
        if (sharedDate > existingDate) {
          await fs.writeJson(filePath, {
            ...sharedContext.data,
            synced_from: sharedContext.source_project,
            synced_at: new Date().toISOString()
          }, { spaces: 2 });
          
          return { status: 'synced' };
        } else {
          return { status: 'skipped', reason: 'Existing version is newer' };
        }

      case 'merge':
        // 간단한 병합 로직 (실제로는 더 복잡해야 함)
        const merged = { ...existing, ...sharedContext.data };
        await fs.writeJson(filePath, merged, { spaces: 2 });
        return { status: 'synced' };

      case 'manual':
      default:
        return { 
          status: 'conflict', 
          reason: 'Manual resolution required' 
        };
    }
  }

  private async mergeConfigurations(existing: any, incoming: any): Promise<any> {
    // 깊은 병합 로직
    const result = { ...existing };
    
    for (const [key, value] of Object.entries(incoming)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = await this.mergeConfigurations(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 저장 메서드들
   */
  private async saveRegistry(): Promise<void> {
    await fs.writeJson(this.registryPath, this.registry, { spaces: 2 });
  }

  private async saveSharedContexts(): Promise<void> {
    const contextsPath = path.join(this.syncDir, 'shared-contexts.json');
    const contextsArray = Array.from(this.sharedContexts.values());
    await fs.writeJson(contextsPath, contextsArray, { spaces: 2 });
  }

  private async loadSharedContexts(): Promise<void> {
    try {
      const contextsPath = path.join(this.syncDir, 'shared-contexts.json');
      if (await fs.pathExists(contextsPath)) {
        const contextsArray = await fs.readJson(contextsPath);
        for (const context of contextsArray) {
          this.sharedContexts.set(context.id, context);
        }
      }
    } catch (error) {
      console.warn('[MultiProjectSync] Failed to load shared contexts:', error);
    }
  }

  private async saveSyncState(projectId: string): Promise<void> {
    const syncState = this.syncStates.get(projectId);
    if (syncState) {
      const statePath = path.join(this.syncDir, 'states', `${projectId}.json`);
      await fs.ensureDir(path.dirname(statePath));
      await fs.writeJson(statePath, syncState, { spaces: 2 });
    }
  }

  private async loadSyncState(projectId: string): Promise<void> {
    try {
      const statePath = path.join(this.syncDir, 'states', `${projectId}.json`);
      if (await fs.pathExists(statePath)) {
        const syncState = await fs.readJson(statePath);
        this.syncStates.set(projectId, SyncStateSchema.parse(syncState));
      }
    } catch (error) {
      console.warn(`[MultiProjectSync] Failed to load sync state for ${projectId}:`, error);
    }
  }

  /**
   * 정리
   */
  async cleanup(): Promise<void> {
    // 모든 워처 정리
    for (const watcher of this.watchers.values()) {
      await watcher.close();
    }
    this.watchers.clear();

    console.log('[MultiProjectSync] Cleanup completed');
  }
}