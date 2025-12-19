/**
 * Development Tracker
 * 
 * 실시간 개발 Context 추적 및 기록
 * - 파일 변경 사항 모니터링
 * - 개발 패턴 자동 인식
 * - Context 스냅샷 생성
 */

import fs from 'fs-extra';
import path from 'path';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';

interface FileChange {
  file_path: string;
  change_type: 'create' | 'modify' | 'delete';
  content_summary: string;
  timestamp: string;
  metadata?: any;
}

interface DevelopmentContext {
  session_id: string;
  started_at: string;
  last_activity: string;
  project_path: string;
  changes: FileChange[];
  patterns_detected: string[];
  context_snapshots: ContextSnapshot[];
  active_features: string[];
}

interface ContextSnapshot {
  snapshot_id: string;
  timestamp: string;
  trigger_event: string;
  project_state: any;
  extracted_patterns: string[];
  test_opportunities: any[];
}

interface TrackingOptions {
  auto_categorize: boolean;
  extract_patterns: boolean;
  update_tests: boolean;
  watch_patterns: string[];
  ignore_patterns: string[];
}

export class DevelopmentTracker extends EventEmitter {
  private watcher?: chokidar.FSWatcher;
  private currentSession?: DevelopmentContext;
  private trackingOptions: TrackingOptions;
  private contextHistory: DevelopmentContext[] = [];

  constructor(options: Partial<TrackingOptions> = {}) {
    super();
    
    this.trackingOptions = {
      auto_categorize: true,
      extract_patterns: true, 
      update_tests: true,
      watch_patterns: ['**/*.{js,ts,jsx,tsx,vue,py,md}'],
      ignore_patterns: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
      ...options
    };

    console.log('[Development Tracker] Initialized with tracking options:', this.trackingOptions);
  }

  /**
   * 개발 추적 세션 시작
   */
  async startTracking(projectPath: string): Promise<string> {
    if (this.currentSession) {
      await this.stopTracking();
    }

    const sessionId = this.generateSessionId();
    this.currentSession = {
      session_id: sessionId,
      started_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      project_path: projectPath,
      changes: [],
      patterns_detected: [],
      context_snapshots: [],
      active_features: []
    };

    // 파일 시스템 감시 시작
    await this.setupFileWatcher(projectPath);
    
    // 초기 Context 스냅샷 생성
    await this.captureContextSnapshot('session_start', 'Development tracking session started');

    console.log(`[Development Tracker] Started tracking session: ${sessionId} for ${projectPath}`);
    this.emit('tracking_started', { session_id: sessionId, project_path: projectPath });

    return sessionId;
  }

  /**
   * 개발 추적 세션 종료
   */
  async stopTracking(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    // 파일 감시 중단
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    // 최종 Context 스냅샷
    await this.captureContextSnapshot('session_end', 'Development tracking session ended');

    // 세션 히스토리에 저장
    this.contextHistory.push({ ...this.currentSession });
    
    const sessionId = this.currentSession.session_id;
    this.currentSession = undefined;

    console.log(`[Development Tracker] Stopped tracking session: ${sessionId}`);
    this.emit('tracking_stopped', { session_id: sessionId });
  }

  /**
   * 파일 변경 사항 추적
   */
  async trackFileChanges(fileChanges: FileChange[], contextSnapshot?: any): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active tracking session');
    }

    console.log(`[Development Tracker] Tracking ${fileChanges.length} file changes`);

    for (const change of fileChanges) {
      // 변경 사항 기록
      this.currentSession.changes.push({
        ...change,
        timestamp: change.timestamp || new Date().toISOString()
      });

      // 패턴 자동 감지
      if (this.trackingOptions.auto_categorize) {
        const detectedPatterns = await this.analyzeChangePatterns(change);
        this.currentSession.patterns_detected.push(...detectedPatterns);
      }

      // 컴포넌트/기능 추가 감지
      const newFeatures = await this.detectNewFeatures(change);
      this.currentSession.active_features.push(...newFeatures);

      // 테스트 업데이트 기회 감지
      if (this.trackingOptions.update_tests) {
        const testOpportunities = await this.identifyTestOpportunities(change);
        if (testOpportunities.length > 0) {
          this.emit('test_opportunities', {
            change,
            opportunities: testOpportunities
          });
        }
      }
    }

    this.currentSession.last_activity = new Date().toISOString();

    // 중요한 변경사항이 있으면 Context 스냅샷 생성
    const significantChanges = fileChanges.filter(this.isSignificantChange.bind(this));
    if (significantChanges.length > 0) {
      await this.captureContextSnapshot(
        'significant_changes',
        `${significantChanges.length} significant changes detected`,
        { changes: significantChanges }
      );
    }

    this.emit('changes_tracked', { 
      session_id: this.currentSession.session_id,
      changes: fileChanges 
    });
  }

  /**
   * Context 스냅샷 캡처
   */
  async captureContextSnapshot(
    triggerEvent: string, 
    description: string, 
    additionalData?: any
  ): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active tracking session');
    }

    const snapshotId = this.generateSnapshotId();
    const timestamp = new Date().toISOString();

    // 현재 프로젝트 상태 분석
    const projectState = await this.analyzeCurrentProjectState();
    
    // 패턴 추출
    const extractedPatterns = this.trackingOptions.extract_patterns 
      ? await this.extractCurrentPatterns()
      : [];

    // 테스트 기회 식별
    const testOpportunities = await this.identifyCurrentTestOpportunities();

    const snapshot: ContextSnapshot = {
      snapshot_id: snapshotId,
      timestamp,
      trigger_event: triggerEvent,
      project_state: {
        ...projectState,
        description,
        additional_data: additionalData
      },
      extracted_patterns: extractedPatterns,
      test_opportunities: testOpportunities
    };

    this.currentSession.context_snapshots.push(snapshot);

    console.log(`[Development Tracker] Context snapshot captured: ${snapshotId} (${triggerEvent})`);
    this.emit('context_snapshot', { snapshot_id: snapshotId, snapshot });

    return snapshotId;
  }

  /**
   * 파일 시스템 감시 설정
   */
  private async setupFileWatcher(projectPath: string): Promise<void> {
    const watchPatterns = this.trackingOptions.watch_patterns.map(pattern => 
      path.join(projectPath, pattern)
    );

    this.watcher = chokidar.watch(watchPatterns, {
      ignored: this.trackingOptions.ignore_patterns.map(pattern => 
        path.join(projectPath, pattern)
      ),
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('add', (filePath) => this.handleFileChange(filePath, 'create'))
      .on('change', (filePath) => this.handleFileChange(filePath, 'modify'))
      .on('unlink', (filePath) => this.handleFileChange(filePath, 'delete'))
      .on('error', (error) => {
        console.error('[Development Tracker] File watcher error:', error);
        this.emit('watcher_error', { error: error.message });
      });

    console.log(`[Development Tracker] File watcher setup for: ${projectPath}`);
  }

  /**
   * 파일 변경 핸들러
   */
  private async handleFileChange(filePath: string, changeType: 'create' | 'modify' | 'delete'): Promise<void> {
    try {
      let contentSummary = '';
      let metadata = {};

      if (changeType !== 'delete') {
        const content = await fs.readFile(filePath, 'utf-8');
        contentSummary = this.generateContentSummary(content, filePath);
        metadata = await this.extractFileMetadata(filePath, content);
      }

      const fileChange: FileChange = {
        file_path: filePath,
        change_type: changeType,
        content_summary: contentSummary,
        timestamp: new Date().toISOString(),
        metadata
      };

      await this.trackFileChanges([fileChange]);

    } catch (error) {
      console.error(`[Development Tracker] Error handling file change: ${filePath}`, error);
    }
  }

  /**
   * 변경 사항 패턴 분석
   */
  private async analyzeChangePatterns(change: FileChange): Promise<string[]> {
    const patterns = [];
    const { file_path, content_summary, change_type } = change;
    const fileExtension = path.extname(file_path);

    // 파일 타입별 패턴
    switch (fileExtension) {
      case '.tsx':
      case '.jsx':
        if (content_summary.includes('component')) patterns.push('ui_component_development');
        if (content_summary.includes('hook')) patterns.push('custom_hook_development');
        if (content_summary.includes('context')) patterns.push('context_api_usage');
        break;
      
      case '.ts':
      case '.js':
        if (file_path.includes('/api/')) patterns.push('api_endpoint_development');
        if (content_summary.includes('util')) patterns.push('utility_function_development');
        if (content_summary.includes('service')) patterns.push('service_layer_development');
        break;
      
      case '.md':
        if (file_path.includes('test')) patterns.push('test_documentation');
        if (content_summary.includes('api')) patterns.push('api_documentation');
        break;
    }

    // 변경 타입별 패턴
    if (change_type === 'create') {
      patterns.push('new_file_creation');
    } else if (change_type === 'modify') {
      patterns.push('iterative_development');
    }

    return patterns;
  }

  /**
   * 새로운 기능 감지
   */
  private async detectNewFeatures(change: FileChange): Promise<string[]> {
    const features = [];
    const { file_path, content_summary, change_type } = change;

    if (change_type === 'create') {
      // 새 컴포넌트
      if (file_path.includes('components/') && content_summary.includes('export')) {
        const componentName = path.basename(file_path, path.extname(file_path));
        features.push(`ui_component_${componentName}`);
      }

      // 새 API 엔드포인트
      if (file_path.includes('/api/')) {
        const endpointName = path.basename(file_path, path.extname(file_path));
        features.push(`api_endpoint_${endpointName}`);
      }

      // 새 유틸리티
      if (file_path.includes('utils/') || file_path.includes('lib/')) {
        const utilName = path.basename(file_path, path.extname(file_path));
        features.push(`utility_${utilName}`);
      }
    }

    return features;
  }

  /**
   * 테스트 기회 식별
   */
  private async identifyTestOpportunities(change: FileChange): Promise<any[]> {
    const opportunities = [];
    const { file_path, content_summary, change_type } = change;

    // UI 컴포넌트 테스트 기회
    if (file_path.match(/\.(tsx|jsx)$/) && content_summary.includes('component')) {
      opportunities.push({
        type: 'ui_component_test',
        component_name: path.basename(file_path, path.extname(file_path)),
        file_path,
        suggested_tests: [
          'rendering_test',
          'props_handling',
          'event_handlers',
          'accessibility'
        ]
      });
    }

    // API 엔드포인트 테스트 기회
    if (file_path.includes('/api/') && change_type === 'create') {
      opportunities.push({
        type: 'api_endpoint_test',
        endpoint_name: path.basename(file_path, path.extname(file_path)),
        file_path,
        suggested_tests: [
          'http_methods',
          'parameter_validation',
          'response_format',
          'error_handling'
        ]
      });
    }

    // 데이터베이스 스키마 변경 테스트 기회
    if (file_path.includes('prisma/schema') || file_path.includes('migrations/')) {
      opportunities.push({
        type: 'database_test',
        schema_change: true,
        file_path,
        suggested_tests: [
          'schema_validation',
          'data_integrity',
          'relationship_constraints',
          'migration_rollback'
        ]
      });
    }

    return opportunities;
  }

  /**
   * 현재 프로젝트 상태 분석
   */
  private async analyzeCurrentProjectState(): Promise<any> {
    if (!this.currentSession) {
      return {};
    }

    const { project_path, changes, patterns_detected, active_features } = this.currentSession;

    // 파일 통계
    const fileStats = await this.generateFileStatistics(project_path);
    
    // 최근 활동 분석
    const recentActivity = this.analyzeRecentActivity(changes);
    
    // 개발 속도 메트릭
    const velocityMetrics = this.calculateDevelopmentVelocity(changes);

    return {
      project_path,
      file_statistics: fileStats,
      recent_activity: recentActivity,
      development_velocity: velocityMetrics,
      patterns_detected: [...new Set(patterns_detected)],
      active_features: [...new Set(active_features)],
      total_changes: changes.length
    };
  }

  /**
   * 현재 패턴 추출
   */
  private async extractCurrentPatterns(): Promise<string[]> {
    if (!this.currentSession) {
      return [];
    }

    const patterns = new Set(this.currentSession.patterns_detected);
    
    // 파일 구조 패턴 분석
    const structurePatterns = await this.analyzeProjectStructurePatterns(
      this.currentSession.project_path
    );
    structurePatterns.forEach(pattern => patterns.add(pattern));

    // 코딩 패턴 분석
    const codingPatterns = this.analyzeCodingPatterns(this.currentSession.changes);
    codingPatterns.forEach(pattern => patterns.add(pattern));

    return Array.from(patterns);
  }

  /**
   * 현재 테스트 기회 식별
   */
  private async identifyCurrentTestOpportunities(): Promise<any[]> {
    if (!this.currentSession) {
      return [];
    }

    const opportunities = [];
    
    for (const feature of this.currentSession.active_features) {
      if (feature.startsWith('ui_component_')) {
        opportunities.push({
          type: 'ui_test',
          feature,
          priority: 'high',
          auto_generate: true
        });
      } else if (feature.startsWith('api_endpoint_')) {
        opportunities.push({
          type: 'api_test',
          feature,
          priority: 'high',
          auto_generate: true
        });
      }
    }

    return opportunities;
  }

  /**
   * 헬퍼 메서드들
   */
  private generateSessionId(): string {
    return `session_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSnapshotId(): string {
    return `snapshot_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateContentSummary(content: string, filePath: string): string {
    const lines = content.split('\n');
    const fileExtension = path.extname(filePath);
    
    // 파일 타입별 요약 생성
    switch (fileExtension) {
      case '.tsx':
      case '.jsx':
        return this.summarizeReactFile(content, lines);
      case '.ts':
      case '.js':
        return this.summarizeJavaScriptFile(content, lines);
      case '.md':
        return this.summarizeMarkdownFile(content, lines);
      default:
        return `${lines.length} lines, ${content.length} characters`;
    }
  }

  private summarizeReactFile(content: string, lines: string[]): string {
    const summary = [`${lines.length} lines`];
    
    if (content.includes('export default')) summary.push('default export');
    if (content.includes('useState')) summary.push('state hooks');
    if (content.includes('useEffect')) summary.push('effect hooks');
    if (content.includes('interface')) summary.push('TypeScript interfaces');
    if (content.includes('className')) summary.push('styled component');
    
    return summary.join(', ');
  }

  private summarizeJavaScriptFile(content: string, lines: string[]): string {
    const summary = [`${lines.length} lines`];
    
    if (content.includes('export')) summary.push('exports');
    if (content.includes('async')) summary.push('async functions');
    if (content.includes('class ')) summary.push('class definitions');
    if (content.includes('interface')) summary.push('TypeScript types');
    
    return summary.join(', ');
  }

  private summarizeMarkdownFile(content: string, lines: string[]): string {
    const summary = [`${lines.length} lines`];
    
    const headings = content.match(/^#{1,6} .+$/gm);
    if (headings) summary.push(`${headings.length} headings`);
    
    const codeBlocks = content.match(/```[\s\S]*?```/g);
    if (codeBlocks) summary.push(`${codeBlocks.length} code blocks`);
    
    const tasks = content.match(/- \[ \] .+/g);
    if (tasks) summary.push(`${tasks.length} task items`);
    
    return summary.join(', ');
  }

  private async extractFileMetadata(filePath: string, content: string): Promise<any> {
    const stats = await fs.stat(filePath);
    const metadata = {
      file_size: stats.size,
      line_count: content.split('\n').length,
      extension: path.extname(filePath),
      directory: path.dirname(filePath)
    };

    // 추가 메타데이터 추출
    if (filePath.match(/\.(tsx|jsx|ts|js)$/)) {
      metadata['has_exports'] = content.includes('export');
      metadata['has_imports'] = content.includes('import');
      metadata['has_hooks'] = content.includes('use');
    }

    return metadata;
  }

  private isSignificantChange(change: FileChange): boolean {
    // 중요한 변경사항 판단 기준
    if (change.change_type === 'create') return true;
    if (change.file_path.includes('/api/')) return true;
    if (change.file_path.includes('components/')) return true;
    if (change.content_summary.includes('export')) return true;
    
    return false;
  }

  private async generateFileStatistics(projectPath: string): Promise<any> {
    try {
      const stats = {
        total_files: 0,
        by_extension: {},
        by_directory: {},
        total_size: 0
      };

      const files = await this.getProjectFiles(projectPath);
      
      for (const file of files) {
        const ext = path.extname(file) || 'no_extension';
        const dir = path.dirname(file).split(path.sep)[0] || 'root';
        
        stats.total_files++;
        stats.by_extension[ext] = (stats.by_extension[ext] || 0) + 1;
        stats.by_directory[dir] = (stats.by_directory[dir] || 0) + 1;
        
        try {
          const fileStats = await fs.stat(path.join(projectPath, file));
          stats.total_size += fileStats.size;
        } catch (error) {
          // 파일이 존재하지 않을 수 있음 (삭제된 파일)
        }
      }

      return stats;
    } catch (error) {
      console.error('[Development Tracker] Error generating file statistics:', error);
      return { error: error.message };
    }
  }

  private async getProjectFiles(projectPath: string): Promise<string[]> {
    // 간단한 파일 목록 생성 (실제로는 더 정교한 로직 필요)
    const files = [];
    
    try {
      const items = await fs.readdir(projectPath, { withFileTypes: true });
      
      for (const item of items) {
        if (!this.shouldIgnoreFile(item.name)) {
          if (item.isFile()) {
            files.push(item.name);
          } else if (item.isDirectory()) {
            const subFiles = await this.getProjectFiles(path.join(projectPath, item.name));
            files.push(...subFiles.map(f => path.join(item.name, f)));
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory: ${projectPath}`, error);
    }
    
    return files;
  }

  private shouldIgnoreFile(fileName: string): boolean {
    const ignorePatterns = ['node_modules', '.git', 'dist', 'build', '.next'];
    return ignorePatterns.some(pattern => fileName.includes(pattern));
  }

  private analyzeRecentActivity(changes: FileChange[]): any {
    const recentChanges = changes.slice(-10); // 최근 10개 변경사항
    
    const activity = {
      recent_changes_count: recentChanges.length,
      file_types: {},
      change_types: { create: 0, modify: 0, delete: 0 },
      activity_timeline: []
    };

    for (const change of recentChanges) {
      const ext = path.extname(change.file_path) || 'no_extension';
      activity.file_types[ext] = (activity.file_types[ext] || 0) + 1;
      activity.change_types[change.change_type]++;
      
      activity.activity_timeline.push({
        timestamp: change.timestamp,
        type: change.change_type,
        file: path.basename(change.file_path)
      });
    }

    return activity;
  }

  private calculateDevelopmentVelocity(changes: FileChange[]): any {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentHour = changes.filter(c => new Date(c.timestamp) > oneHourAgo);
    const recentDay = changes.filter(c => new Date(c.timestamp) > oneDayAgo);

    return {
      changes_per_hour: recentHour.length,
      changes_per_day: recentDay.length,
      average_time_between_changes: this.calculateAverageTimeBetweenChanges(changes.slice(-10)),
      development_intensity: this.calculateDevelopmentIntensity(changes)
    };
  }

  private calculateAverageTimeBetweenChanges(changes: FileChange[]): number {
    if (changes.length < 2) return 0;
    
    let totalDiff = 0;
    for (let i = 1; i < changes.length; i++) {
      const current = new Date(changes[i].timestamp);
      const previous = new Date(changes[i-1].timestamp);
      totalDiff += current.getTime() - previous.getTime();
    }
    
    return totalDiff / (changes.length - 1) / 1000 / 60; // 분 단위
  }

  private calculateDevelopmentIntensity(changes: FileChange[]): string {
    const recentChanges = changes.filter(c => 
      new Date(c.timestamp) > new Date(Date.now() - 60 * 60 * 1000)
    );
    
    if (recentChanges.length > 10) return 'high';
    if (recentChanges.length > 5) return 'medium';
    if (recentChanges.length > 0) return 'low';
    return 'idle';
  }

  private async analyzeProjectStructurePatterns(projectPath: string): Promise<string[]> {
    const patterns = [];
    
    try {
      const items = await fs.readdir(projectPath, { withFileTypes: true });
      const directories = items.filter(item => item.isDirectory()).map(item => item.name);
      
      if (directories.includes('components')) patterns.push('component_architecture');
      if (directories.includes('pages')) patterns.push('page_based_routing');
      if (directories.includes('api')) patterns.push('api_routes');
      if (directories.includes('utils')) patterns.push('utility_organization');
      if (directories.includes('lib')) patterns.push('library_structure');
      if (directories.includes('hooks')) patterns.push('custom_hooks_pattern');
      
    } catch (error) {
      console.error('Error analyzing project structure:', error);
    }
    
    return patterns;
  }

  private analyzeCodingPatterns(changes: FileChange[]): string[] {
    const patterns = [];
    const recentChanges = changes.slice(-20); // 최근 20개 변경사항 분석
    
    // 파일 생성 패턴
    const createdFiles = recentChanges.filter(c => c.change_type === 'create');
    if (createdFiles.length > 5) patterns.push('rapid_prototyping');
    
    // 반복적 수정 패턴
    const modifiedFiles = recentChanges.filter(c => c.change_type === 'modify');
    if (modifiedFiles.length > 10) patterns.push('iterative_refinement');
    
    // 테스트 관련 패턴
    const testFiles = recentChanges.filter(c => 
      c.file_path.includes('test') || c.file_path.includes('spec')
    );
    if (testFiles.length > 2) patterns.push('test_driven_development');
    
    return patterns;
  }

  /**
   * 공개 API 메서드들
   */
  getCurrentSession(): DevelopmentContext | undefined {
    return this.currentSession;
  }

  getSessionHistory(limit?: number): DevelopmentContext[] {
    const history = [...this.contextHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  getTrackingOptions(): TrackingOptions {
    return { ...this.trackingOptions };
  }

  updateTrackingOptions(options: Partial<TrackingOptions>): void {
    this.trackingOptions = { ...this.trackingOptions, ...options };
    console.log('[Development Tracker] Tracking options updated:', this.trackingOptions);
  }
}