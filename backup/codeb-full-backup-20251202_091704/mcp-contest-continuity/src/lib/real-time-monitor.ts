/**
 * Real-Time Code Monitor
 * 
 * 실시간 코드 변경 감지 및 자동 문서화 시스템
 * - 파일 시스템 변경 실시간 감지
 * - 코드 변경 분석 및 자동 문서화
 * - 테스트 케이스 자동 업데이트
 * - 컨텍스트 기반 인사이트 생성
 */

import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';
import { z } from 'zod';
import chokidar from 'chokidar';
import { glob } from 'glob';

// 코드 변경 이벤트 스키마
const CodeChangeEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  file_path: z.string(),
  change_type: z.enum(['create', 'modify', 'delete', 'rename']),
  old_path: z.string().optional(),
  file_type: z.enum(['code', 'test', 'config', 'doc', 'asset']),
  language: z.string().optional(),
  size_change: z.number(),
  lines_added: z.number(),
  lines_deleted: z.number(),
  content_analysis: z.object({
    functions_added: z.array(z.string()),
    functions_removed: z.array(z.string()),
    functions_modified: z.array(z.string()),
    imports_added: z.array(z.string()),
    imports_removed: z.array(z.string()),
    exports_added: z.array(z.string()),
    exports_removed: z.array(z.string()),
    comments_added: z.number(),
    complexity_change: z.number()
  }),
  context_impact: z.object({
    related_files: z.array(z.string()),
    affected_tests: z.array(z.string()),
    documentation_updates_needed: z.array(z.string()),
    pattern_matches: z.array(z.string())
  }),
  auto_actions: z.array(z.object({
    type: z.enum(['generate_test', 'update_docs', 'create_pattern', 'validate_deps']),
    status: z.enum(['pending', 'completed', 'failed']),
    result: z.string().optional()
  }))
});

export type CodeChangeEvent = z.infer<typeof CodeChangeEventSchema>;

// 모니터링 설정
const MonitorConfigSchema = z.object({
  watch_patterns: z.array(z.string()),
  ignore_patterns: z.array(z.string()),
  debounce_ms: z.number(),
  analysis_depth: z.enum(['basic', 'detailed', 'comprehensive']),
  auto_actions: z.object({
    generate_tests: z.boolean(),
    update_documentation: z.boolean(),
    extract_patterns: z.boolean(),
    validate_dependencies: z.boolean()
  }),
  notification_settings: z.object({
    real_time: z.boolean(),
    batch_summary: z.boolean(),
    batch_interval_minutes: z.number()
  })
});

export type MonitorConfig = z.infer<typeof MonitorConfigSchema>;

// 문서 생성 템플릿
interface DocumentationTemplate {
  type: 'function' | 'class' | 'component' | 'api' | 'generic';
  template: string;
  variables: string[];
}

interface AnalysisResult {
  file_path: string;
  functions: Array<{
    name: string;
    type: 'function' | 'method' | 'arrow' | 'async';
    params: string[];
    return_type?: string;
    complexity: number;
    lines: { start: number; end: number };
  }>;
  imports: Array<{
    source: string;
    specifiers: string[];
    type: 'import' | 'require';
  }>;
  exports: Array<{
    name: string;
    type: 'default' | 'named';
  }>;
  comments: Array<{
    type: 'single' | 'multi' | 'jsdoc';
    content: string;
    line: number;
  }>;
  complexity_metrics: {
    cyclomatic: number;
    cognitive: number;
    lines_of_code: number;
    maintainability_index: number;
  };
}

export class RealTimeCodeMonitor extends EventEmitter {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private changeQueue: Map<string, NodeJS.Timeout> = new Map();
  private config: MonitorConfig;
  private eventHistory: CodeChangeEvent[] = [];
  private documentationTemplates: Map<string, DocumentationTemplate> = new Map();

  constructor(config?: Partial<MonitorConfig>) {
    super();
    
    this.config = {
      watch_patterns: ['**/*.{js,ts,jsx,tsx,vue,py,go,rs}'],
      ignore_patterns: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      debounce_ms: 500,
      analysis_depth: 'detailed',
      auto_actions: {
        generate_tests: true,
        update_documentation: true,
        extract_patterns: true,
        validate_dependencies: true
      },
      notification_settings: {
        real_time: true,
        batch_summary: true,
        batch_interval_minutes: 15
      },
      ...config
    };

    this.initializeTemplates();
  }

  /**
   * 프로젝트 모니터링 시작
   */
  async startMonitoring(projectPath: string): Promise<void> {
    console.log(`[RealTimeMonitor] Starting monitoring for: ${projectPath}`);

    const watcherId = path.resolve(projectPath);
    
    // 기존 워처가 있으면 정리
    if (this.watchers.has(watcherId)) {
      await this.watchers.get(watcherId)?.close();
    }

    // 감시할 파일 패턴 생성
    const watchPatterns = this.config.watch_patterns.map(pattern => 
      path.join(projectPath, pattern)
    );

    // 워처 생성
    const watcher = chokidar.watch(watchPatterns, {
      ignored: this.config.ignore_patterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    // 이벤트 핸들러 설정
    watcher.on('add', (filePath) => this.handleFileEvent(filePath, 'create'));
    watcher.on('change', (filePath) => this.handleFileEvent(filePath, 'modify'));
    watcher.on('unlink', (filePath) => this.handleFileEvent(filePath, 'delete'));
    watcher.on('addDir', (dirPath) => this.handleDirectoryEvent(dirPath, 'create'));
    watcher.on('unlinkDir', (dirPath) => this.handleDirectoryEvent(dirPath, 'delete'));

    this.watchers.set(watcherId, watcher);

    // 배치 요약 스케줄링
    if (this.config.notification_settings.batch_summary) {
      this.scheduleBatchSummary();
    }

    this.emit('monitoring_started', { projectPath, config: this.config });
  }

  /**
   * 파일 이벤트 처리
   */
  private async handleFileEvent(
    filePath: string,
    changeType: 'create' | 'modify' | 'delete'
  ): Promise<void> {
    const fileKey = filePath;

    // 디바운싱 적용
    if (this.changeQueue.has(fileKey)) {
      clearTimeout(this.changeQueue.get(fileKey)!);
    }

    const debounceTimeout = setTimeout(async () => {
      try {
        await this.processFileChange(filePath, changeType);
        this.changeQueue.delete(fileKey);
      } catch (error) {
        console.error(`[RealTimeMonitor] Error processing ${filePath}:`, error);
      }
    }, this.config.debounce_ms);

    this.changeQueue.set(fileKey, debounceTimeout);
  }

  /**
   * 디렉토리 이벤트 처리
   */
  private async handleDirectoryEvent(
    dirPath: string,
    changeType: 'create' | 'delete'
  ): Promise<void> {
    console.log(`[RealTimeMonitor] Directory ${changeType}: ${dirPath}`);
    
    this.emit('directory_changed', {
      path: dirPath,
      type: changeType,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 파일 변경 처리
   */
  private async processFileChange(
    filePath: string,
    changeType: 'create' | 'modify' | 'delete'
  ): Promise<void> {
    console.log(`[RealTimeMonitor] Processing ${changeType}: ${filePath}`);

    // 이전 상태 로드 (수정/삭제의 경우)
    let previousAnalysis: AnalysisResult | null = null;
    if (changeType !== 'create') {
      previousAnalysis = await this.loadPreviousAnalysis(filePath);
    }

    // 현재 상태 분석 (생성/수정의 경우)
    let currentAnalysis: AnalysisResult | null = null;
    if (changeType !== 'delete' && await fs.pathExists(filePath)) {
      currentAnalysis = await this.analyzeFile(filePath);
      await this.savePreviousAnalysis(filePath, currentAnalysis);
    }

    // 변경 이벤트 생성
    const changeEvent = await this.createChangeEvent(
      filePath,
      changeType,
      previousAnalysis,
      currentAnalysis
    );

    // 이벤트 히스토리에 추가
    this.eventHistory.push(changeEvent);

    // 실시간 알림
    if (this.config.notification_settings.real_time) {
      this.emit('code_changed', changeEvent);
    }

    // 자동 액션 실행
    await this.executeAutoActions(changeEvent);

    // 컨텍스트 업데이트
    await this.updateContext(changeEvent);
  }

  /**
   * 파일 분석
   */
  private async analyzeFile(filePath: string): Promise<AnalysisResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);

    return {
      file_path: filePath,
      functions: this.extractFunctions(content, language),
      imports: this.extractImports(content, language),
      exports: this.extractExports(content, language),
      comments: this.extractComments(content, language),
      complexity_metrics: this.calculateComplexityMetrics(content, language)
    };
  }

  /**
   * 언어 감지
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.vue': 'vue',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c'
    };

    return langMap[ext] || 'text';
  }

  /**
   * 함수 추출
   */
  private extractFunctions(content: string, language: string): AnalysisResult['functions'] {
    const functions: AnalysisResult['functions'] = [];

    if (language === 'javascript' || language === 'typescript') {
      // 함수 선언
      const functionRegex = /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
      let match;

      while ((match = functionRegex.exec(content)) !== null) {
        const lines = this.getLineNumbers(content, match.index);
        functions.push({
          name: match[1],
          type: content.includes('async') ? 'async' : 'function',
          params: match[2].split(',').map(p => p.trim()).filter(p => p),
          complexity: this.calculateFunctionComplexity(match[0]),
          lines
        });
      }

      // 화살표 함수
      const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)\s*)?=>\s*{/g;
      while ((match = arrowRegex.exec(content)) !== null) {
        const lines = this.getLineNumbers(content, match.index);
        functions.push({
          name: match[1],
          type: 'arrow',
          params: [],
          complexity: this.calculateFunctionComplexity(match[0]),
          lines
        });
      }

      // 메서드
      const methodRegex = /(\w+)\s*\([^)]*\)\s*{/g;
      while ((match = methodRegex.exec(content)) !== null) {
        const lines = this.getLineNumbers(content, match.index);
        functions.push({
          name: match[1],
          type: 'method',
          params: [],
          complexity: this.calculateFunctionComplexity(match[0]),
          lines
        });
      }
    }

    return functions;
  }

  /**
   * Import 추출
   */
  private extractImports(content: string, language: string): AnalysisResult['imports'] {
    const imports: AnalysisResult['imports'] = [];

    if (language === 'javascript' || language === 'typescript') {
      // ES6 imports
      const importRegex = /import\s+(?:{[^}]+}|\w+|\*\s+as\s+\w+)\s+from\s+['"`]([^'"`]+)['"`]/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        imports.push({
          source: match[1],
          specifiers: [], // 간단화
          type: 'import'
        });
      }

      // CommonJS requires
      const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        imports.push({
          source: match[1],
          specifiers: [],
          type: 'require'
        });
      }
    }

    return imports;
  }

  /**
   * Export 추출
   */
  private extractExports(content: string, language: string): AnalysisResult['exports'] {
    const exports: AnalysisResult['exports'] = [];

    if (language === 'javascript' || language === 'typescript') {
      // Default exports
      if (content.includes('export default')) {
        exports.push({
          name: 'default',
          type: 'default'
        });
      }

      // Named exports
      const namedExportRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
      let match;

      while ((match = namedExportRegex.exec(content)) !== null) {
        exports.push({
          name: match[1],
          type: 'named'
        });
      }
    }

    return exports;
  }

  /**
   * 코멘트 추출
   */
  private extractComments(content: string, language: string): AnalysisResult['comments'] {
    const comments: AnalysisResult['comments'] = [];

    if (language === 'javascript' || language === 'typescript') {
      // 단일 라인 코멘트
      const singleLineRegex = /\/\/(.*)$/gm;
      let match;

      while ((match = singleLineRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        comments.push({
          type: 'single',
          content: match[1].trim(),
          line: lineNum
        });
      }

      // 멀티 라인 코멘트
      const multiLineRegex = /\/\*([\s\S]*?)\*\//g;
      while ((match = multiLineRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const isJSDoc = match[0].startsWith('/**');
        
        comments.push({
          type: isJSDoc ? 'jsdoc' : 'multi',
          content: match[1].trim(),
          line: lineNum
        });
      }
    }

    return comments;
  }

  /**
   * 복잡도 메트릭 계산
   */
  private calculateComplexityMetrics(content: string, language: string): AnalysisResult['complexity_metrics'] {
    const lines = content.split('\n');
    const linesOfCode = lines.filter(line => 
      line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('/*')
    ).length;

    // 순환복잡도 (Cyclomatic Complexity)
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(content);

    // 인지복잡도 (Cognitive Complexity)
    const cognitiveComplexity = this.calculateCognitiveComplexity(content);

    // 유지보수성 지수 (Maintainability Index)
    const maintainabilityIndex = this.calculateMaintainabilityIndex(
      linesOfCode,
      cyclomaticComplexity,
      content
    );

    return {
      cyclomatic: cyclomaticComplexity,
      cognitive: cognitiveComplexity,
      lines_of_code: linesOfCode,
      maintainability_index: maintainabilityIndex
    };
  }

  /**
   * 순환복잡도 계산
   */
  private calculateCyclomaticComplexity(content: string): number {
    // 기본 복잡도는 1에서 시작
    let complexity = 1;

    // 결정 포인트들을 카운트
    const decisionPoints = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /while\s*\(/g,
      /for\s*\(/g,
      /case\s+/g,
      /catch\s*\(/g,
      /&&/g,
      /\|\|/g,
      /\?\s*:/g // 삼항 연산자
    ];

    for (const pattern of decisionPoints) {
      const matches = content.match(pattern);
      complexity += matches ? matches.length : 0;
    }

    return complexity;
  }

  /**
   * 인지복잡도 계산 (간단화된 버전)
   */
  private calculateCognitiveComplexity(content: string): number {
    let complexity = 0;
    let nestingLevel = 0;

    // 간단화된 인지복잡도 계산
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // 중첩 증가
      if (trimmed.includes('{')) {
        nestingLevel++;
      }

      // 중첩 감소
      if (trimmed.includes('}')) {
        nestingLevel = Math.max(0, nestingLevel - 1);
      }

      // 인지복잡도 증가 조건들
      if (/^if\s*\(/.test(trimmed)) {
        complexity += 1 + nestingLevel;
      } else if (/^else\s+if\s*\(/.test(trimmed)) {
        complexity += 1 + nestingLevel;
      } else if (/^while\s*\(/.test(trimmed) || /^for\s*\(/.test(trimmed)) {
        complexity += 1 + nestingLevel;
      }
    }

    return complexity;
  }

  /**
   * 유지보수성 지수 계산
   */
  private calculateMaintainabilityIndex(
    linesOfCode: number,
    complexity: number,
    content: string
  ): number {
    // Halstead Volume 간단화 계산
    const operands = (content.match(/\w+/g) || []).length;
    const operators = (content.match(/[+\-*\/=<>!&|?:]/g) || []).length;
    const halsteadVolume = Math.max(1, (operands + operators) * Math.log2(operands + operators));

    // 유지보수성 지수 공식 (0-100)
    const maintainabilityIndex = Math.max(
      0,
      171 - 5.2 * Math.log(halsteadVolume) - 0.23 * complexity - 16.2 * Math.log(linesOfCode)
    );

    return Math.round(maintainabilityIndex * 100) / 100;
  }

  /**
   * 변경 이벤트 생성
   */
  private async createChangeEvent(
    filePath: string,
    changeType: 'create' | 'modify' | 'delete',
    previousAnalysis: AnalysisResult | null,
    currentAnalysis: AnalysisResult | null
  ): Promise<CodeChangeEvent> {
    const fileStats = changeType !== 'delete' ? await fs.stat(filePath) : null;
    const language = this.detectLanguage(filePath);

    // 변경 분석
    const contentAnalysis = this.analyzeContentChanges(previousAnalysis, currentAnalysis);
    const contextImpact = await this.analyzeContextImpact(filePath, contentAnalysis);

    const event: CodeChangeEvent = {
      id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      file_path: filePath,
      change_type: changeType,
      file_type: this.classifyFileType(filePath),
      language,
      size_change: this.calculateSizeChange(previousAnalysis, currentAnalysis),
      lines_added: contentAnalysis.lines_added,
      lines_deleted: contentAnalysis.lines_deleted,
      content_analysis: contentAnalysis,
      context_impact: contextImpact,
      auto_actions: []
    };

    return event;
  }

  /**
   * 콘텐츠 변경 분석
   */
  private analyzeContentChanges(
    previous: AnalysisResult | null,
    current: AnalysisResult | null
  ): CodeChangeEvent['content_analysis'] {
    const previousFunctions = previous?.functions.map(f => f.name) || [];
    const currentFunctions = current?.functions.map(f => f.name) || [];
    
    const previousImports = previous?.imports.map(i => i.source) || [];
    const currentImports = current?.imports.map(i => i.source) || [];
    
    const previousExports = previous?.exports.map(e => e.name) || [];
    const currentExports = current?.exports.map(e => e.name) || [];

    return {
      functions_added: currentFunctions.filter(f => !previousFunctions.includes(f)),
      functions_removed: previousFunctions.filter(f => !currentFunctions.includes(f)),
      functions_modified: [], // 간단화 - 실제로는 더 정교한 비교 필요
      imports_added: currentImports.filter(i => !previousImports.includes(i)),
      imports_removed: previousImports.filter(i => !currentImports.includes(i)),
      exports_added: currentExports.filter(e => !previousExports.includes(e)),
      exports_removed: previousExports.filter(e => !currentExports.includes(e)),
      comments_added: (current?.comments.length || 0) - (previous?.comments.length || 0),
      complexity_change: (current?.complexity_metrics.cyclomatic || 0) - 
                        (previous?.complexity_metrics.cyclomatic || 0)
    };
  }

  /**
   * 컨텍스트 임팩트 분석
   */
  private async analyzeContextImpact(
    filePath: string,
    contentAnalysis: CodeChangeEvent['content_analysis']
  ): Promise<CodeChangeEvent['context_impact']> {
    const projectRoot = await this.findProjectRoot(filePath);
    
    // 관련 파일 찾기
    const relatedFiles = await this.findRelatedFiles(filePath, projectRoot);
    
    // 영향받는 테스트 찾기
    const affectedTests = await this.findAffectedTests(filePath, projectRoot);
    
    // 문서화 업데이트 필요 파일
    const docsToUpdate = await this.findDocsToUpdate(filePath, contentAnalysis);
    
    // 패턴 매치
    const patternMatches = await this.findPatternMatches(filePath, contentAnalysis);

    return {
      related_files: relatedFiles,
      affected_tests: affectedTests,
      documentation_updates_needed: docsToUpdate,
      pattern_matches: patternMatches
    };
  }

  /**
   * 자동 액션 실행
   */
  private async executeAutoActions(event: CodeChangeEvent): Promise<void> {
    if (this.config.auto_actions.generate_tests) {
      await this.scheduleTestGeneration(event);
    }

    if (this.config.auto_actions.update_documentation) {
      await this.scheduleDocumentationUpdate(event);
    }

    if (this.config.auto_actions.extract_patterns) {
      await this.schedulePatternExtraction(event);
    }

    if (this.config.auto_actions.validate_dependencies) {
      await this.scheduleDependencyValidation(event);
    }
  }

  /**
   * 테스트 생성 스케줄링
   */
  private async scheduleTestGeneration(event: CodeChangeEvent): Promise<void> {
    if (event.content_analysis.functions_added.length > 0 || 
        event.content_analysis.functions_modified.length > 0) {
      
      event.auto_actions.push({
        type: 'generate_test',
        status: 'pending'
      });

      // 실제 테스트 생성 로직 (비동기)
      setTimeout(async () => {
        try {
          await this.generateTests(event);
          const action = event.auto_actions.find(a => a.type === 'generate_test');
          if (action) {
            action.status = 'completed';
            action.result = 'Tests generated successfully';
          }
        } catch (error) {
          const action = event.auto_actions.find(a => a.type === 'generate_test');
          if (action) {
            action.status = 'failed';
            action.result = `Test generation failed: ${error}`;
          }
        }
        
        this.emit('auto_action_completed', { event, action: 'generate_test' });
      }, 1000);
    }
  }

  /**
   * 문서화 업데이트 스케줄링
   */
  private async scheduleDocumentationUpdate(event: CodeChangeEvent): Promise<void> {
    if (event.context_impact.documentation_updates_needed.length > 0) {
      event.auto_actions.push({
        type: 'update_docs',
        status: 'pending'
      });

      setTimeout(async () => {
        try {
          await this.updateDocumentation(event);
          const action = event.auto_actions.find(a => a.type === 'update_docs');
          if (action) {
            action.status = 'completed';
            action.result = 'Documentation updated successfully';
          }
        } catch (error) {
          const action = event.auto_actions.find(a => a.type === 'update_docs');
          if (action) {
            action.status = 'failed';
            action.result = `Documentation update failed: ${error}`;
          }
        }
        
        this.emit('auto_action_completed', { event, action: 'update_docs' });
      }, 2000);
    }
  }

  /**
   * 유틸리티 메서드들
   */
  private getLineNumbers(content: string, index: number): { start: number; end: number } {
    const beforeIndex = content.substring(0, index);
    const start = beforeIndex.split('\n').length;
    
    // 간단화 - 실제로는 함수의 끝을 정확히 찾아야 함
    return { start, end: start + 10 };
  }

  private calculateFunctionComplexity(functionContent: string): number {
    return this.calculateCyclomaticComplexity(functionContent);
  }

  private classifyFileType(filePath: string): CodeChangeEvent['file_type'] {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath);
    
    if (fileName.includes('.test.') || fileName.includes('.spec.')) return 'test';
    if (fileName.includes('.config.') || fileName === 'package.json') return 'config';
    if (ext === '.md' || ext === '.txt') return 'doc';
    if (['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs'].includes(ext)) return 'code';
    
    return 'asset';
  }

  private calculateSizeChange(
    previous: AnalysisResult | null,
    current: AnalysisResult | null
  ): number {
    const previousSize = previous?.complexity_metrics.lines_of_code || 0;
    const currentSize = current?.complexity_metrics.lines_of_code || 0;
    return currentSize - previousSize;
  }

  private async findProjectRoot(filePath: string): Promise<string> {
    let dir = path.dirname(filePath);
    
    while (dir !== path.dirname(dir)) {
      if (await fs.pathExists(path.join(dir, 'package.json'))) {
        return dir;
      }
      dir = path.dirname(dir);
    }
    
    return path.dirname(filePath);
  }

  private async findRelatedFiles(filePath: string, projectRoot: string): Promise<string[]> {
    // 간단화된 관련 파일 찾기
    const fileName = path.basename(filePath, path.extname(filePath));
    const relatedPatterns = [
      `**/${fileName}.test.*`,
      `**/${fileName}.spec.*`,
      `**/${fileName}.*.ts`,
      `**/${fileName}.*.js`
    ];

    const related: string[] = [];
    for (const pattern of relatedPatterns) {
      const matches = await glob(path.join(projectRoot, pattern));
      related.push(...matches.filter(f => f !== filePath));
    }

    return related;
  }

  private async findAffectedTests(filePath: string, projectRoot: string): Promise<string[]> {
    // 테스트 파일 찾기
    const testFiles = await glob(path.join(projectRoot, '**/*.{test,spec}.{js,ts,jsx,tsx}'));
    
    // 간단화 - 실제로는 import 관계를 분석해야 함
    const fileName = path.basename(filePath, path.extname(filePath));
    return testFiles.filter(testFile => {
      const testContent = fs.readFileSync(testFile, 'utf-8');
      return testContent.includes(fileName);
    });
  }

  private async findDocsToUpdate(
    filePath: string,
    contentAnalysis: CodeChangeEvent['content_analysis']
  ): Promise<string[]> {
    // 함수가 추가/제거/수정된 경우 문서 업데이트 필요
    if (contentAnalysis.functions_added.length > 0 ||
        contentAnalysis.functions_removed.length > 0 ||
        contentAnalysis.functions_modified.length > 0) {
      
      const projectRoot = await this.findProjectRoot(filePath);
      const readmeFiles = await glob(path.join(projectRoot, '**/README.md'));
      const docFiles = await glob(path.join(projectRoot, 'docs/**/*.md'));
      
      return [...readmeFiles, ...docFiles];
    }

    return [];
  }

  private async findPatternMatches(
    filePath: string,
    contentAnalysis: CodeChangeEvent['content_analysis']
  ): Promise<string[]> {
    // 패턴 매칭 로직 (간단화)
    const patterns: string[] = [];
    
    if (contentAnalysis.functions_added.some(f => f.startsWith('use'))) {
      patterns.push('react-hook');
    }
    
    if (contentAnalysis.imports_added.some(i => i.includes('api'))) {
      patterns.push('api-integration');
    }

    return patterns;
  }

  /**
   * 실제 액션 실행 메서드들 (스텁)
   */
  private async generateTests(event: CodeChangeEvent): Promise<void> {
    // 테스트 생성 로직 구현
    console.log(`[RealTimeMonitor] Generating tests for ${event.file_path}`);
  }

  private async updateDocumentation(event: CodeChangeEvent): Promise<void> {
    // 문서 업데이트 로직 구현
    console.log(`[RealTimeMonitor] Updating documentation for ${event.file_path}`);
  }

  private async schedulePatternExtraction(event: CodeChangeEvent): Promise<void> {
    // 패턴 추출 로직 구현
    console.log(`[RealTimeMonitor] Extracting patterns from ${event.file_path}`);
  }

  private async scheduleDependencyValidation(event: CodeChangeEvent): Promise<void> {
    // 의존성 검증 로직 구현
    console.log(`[RealTimeMonitor] Validating dependencies for ${event.file_path}`);
  }

  /**
   * 분석 결과 저장/로드
   */
  private async savePreviousAnalysis(filePath: string, analysis: AnalysisResult): Promise<void> {
    const cacheDir = '.mcp-cache/analysis';
    const fileName = path.relative(process.cwd(), filePath).replace(/[^\w]/g, '_') + '.json';
    const cachePath = path.join(cacheDir, fileName);
    
    await fs.ensureDir(path.dirname(cachePath));
    await fs.writeJson(cachePath, analysis);
  }

  private async loadPreviousAnalysis(filePath: string): Promise<AnalysisResult | null> {
    try {
      const cacheDir = '.mcp-cache/analysis';
      const fileName = path.relative(process.cwd(), filePath).replace(/[^\w]/g, '_') + '.json';
      const cachePath = path.join(cacheDir, fileName);
      
      if (await fs.pathExists(cachePath)) {
        return await fs.readJson(cachePath);
      }
    } catch (error) {
      // 무시
    }
    
    return null;
  }

  /**
   * 템플릿 초기화
   */
  private initializeTemplates(): void {
    // 기본 문서화 템플릿들
    this.documentationTemplates.set('function', {
      type: 'function',
      template: `
/**
 * {{description}}
 * 
 * @param {{{param_types}}} {{param_names}} - {{param_descriptions}}
 * @returns {{{return_type}}} {{return_description}}
 * 
 * @example
 * {{example_usage}}
 */`,
      variables: ['description', 'param_types', 'param_names', 'param_descriptions', 'return_type', 'return_description', 'example_usage']
    });
  }

  /**
   * 배치 요약 스케줄링
   */
  private scheduleBatchSummary(): void {
    const intervalMs = this.config.notification_settings.batch_interval_minutes * 60 * 1000;
    
    setInterval(() => {
      this.generateBatchSummary();
    }, intervalMs);
  }

  /**
   * 배치 요약 생성
   */
  private generateBatchSummary(): void {
    const now = new Date();
    const cutoff = new Date(now.getTime() - (this.config.notification_settings.batch_interval_minutes * 60 * 1000));
    
    const recentEvents = this.eventHistory.filter(event => 
      new Date(event.timestamp) > cutoff
    );

    if (recentEvents.length > 0) {
      const summary = {
        period: `${this.config.notification_settings.batch_interval_minutes} minutes`,
        total_changes: recentEvents.length,
        changes_by_type: this.groupBy(recentEvents, 'change_type'),
        files_by_type: this.groupBy(recentEvents, 'file_type'),
        auto_actions_completed: recentEvents.reduce((sum, event) => 
          sum + event.auto_actions.filter(action => action.status === 'completed').length, 0
        ),
        top_files: this.getTopChangedFiles(recentEvents)
      };

      this.emit('batch_summary', summary);
    }
  }

  /**
   * 유틸리티: 그룹화
   */
  private groupBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce((groups, item) => {
      const value = String(item[key]);
      groups[value] = (groups[value] || 0) + 1;
      return groups;
    }, {} as Record<string, number>);
  }

  /**
   * 유틸리티: 자주 변경된 파일
   */
  private getTopChangedFiles(events: CodeChangeEvent[]): Array<{file: string, changes: number}> {
    const fileCounts = this.groupBy(events, 'file_path');
    return Object.entries(fileCounts)
      .map(([file, changes]) => ({ file, changes }))
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 5);
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

    // 대기 중인 타이머 정리
    for (const timeout of this.changeQueue.values()) {
      clearTimeout(timeout);
    }
    this.changeQueue.clear();

    console.log('[RealTimeMonitor] Cleanup completed');
  }

  /**
   * 통계 조회
   */
  getStatistics() {
    return {
      total_events: this.eventHistory.length,
      monitored_projects: this.watchers.size,
      events_by_type: this.groupBy(this.eventHistory, 'change_type'),
      files_by_type: this.groupBy(this.eventHistory, 'file_type'),
      auto_actions_summary: {
        total: this.eventHistory.reduce((sum, event) => sum + event.auto_actions.length, 0),
        completed: this.eventHistory.reduce((sum, event) => 
          sum + event.auto_actions.filter(action => action.status === 'completed').length, 0),
        failed: this.eventHistory.reduce((sum, event) => 
          sum + event.auto_actions.filter(action => action.status === 'failed').length, 0)
      }
    };
  }
}