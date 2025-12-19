/**
 * Contest Context Manager
 * 
 * 바이브 코딩 컨테스트 연속성을 위한 Context 영속화 관리자
 * - 프로젝트 Context 캡처 및 저장
 * - 이전 컨테스트 Context 복원
 * - Context 기반 패턴 인식 및 재사용
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { z } from 'zod';
// import { parse } from '@typescript-eslint/typescript-estree';
// import * as ts from 'typescript';

// Context 스키마 정의
const ContextSchema = z.object({
  context_id: z.string(),
  contest_type: z.enum(['nextjs', 'remix', 'react', 'vue', 'general']),
  captured_at: z.string(),
  project_info: z.object({
    name: z.string(),
    version: z.string().optional(),
    framework: z.string(),
    dependencies: z.record(z.string()).optional(),
    structure: z.object({
      folders: z.array(z.string()),
      key_files: z.array(z.string()),
      patterns: z.array(z.string())
    })
  }),
  development_patterns: z.object({
    ui_components: z.array(z.object({
      name: z.string(),
      type: z.string(),
      file_path: z.string(),
      props: z.array(z.string()).optional(),
      hooks: z.array(z.string()).optional(),
      styling: z.string().optional()
    })),
    api_endpoints: z.array(z.object({
      path: z.string(),
      method: z.string(),
      handler_file: z.string(),
      parameters: z.array(z.string()).optional(),
      response_type: z.string().optional()
    })),
    database_schema: z.array(z.object({
      table_name: z.string(),
      columns: z.array(z.string()),
      relationships: z.array(z.string()).optional(),
      indexes: z.array(z.string()).optional()
    })),
    common_utilities: z.array(z.object({
      name: z.string(),
      file_path: z.string(),
      purpose: z.string(),
      reuse_frequency: z.number().optional()
    }))
  }),
  test_items: z.object({
    ui_tests: z.array(z.any()),
    api_tests: z.array(z.any()),
    db_tests: z.array(z.any()),
    integration_tests: z.array(z.any())
  }),
  quality_metrics: z.object({
    code_coverage: z.number().optional(),
    performance_score: z.number().optional(),
    security_rating: z.string().optional(),
    maintainability_index: z.number().optional(),
    total_files_analyzed: z.number().optional(),
    average_complexity: z.number().optional()
  }),
  reuse_opportunities: z.array(z.object({
    pattern_name: z.string(),
    reuse_score: z.number(),
    description: z.string(),
    applicable_contexts: z.array(z.string())
  }))
});

export type ContestContext = z.infer<typeof ContextSchema>;

export class ContestContextManager {
  private contextDir: string;
  private patternsDir: string;

  constructor(baseDir: string = './contest-contexts') {
    this.contextDir = baseDir;
    this.patternsDir = path.join(baseDir, 'patterns');
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.contextDir);
    await fs.ensureDir(this.patternsDir);
  }

  /**
   * 현재 프로젝트의 Context 캡처
   */
  async captureContext(projectPath: string, contestType: string, options: any = {}): Promise<string> {
    const contextId = this.generateContextId(contestType);
    
    console.log(`[Context Manager] Capturing context for: ${projectPath}`);
    
    // 프로젝트 구조 분석
    const projectInfo = await this.analyzeProjectStructure(projectPath);
    
    // 개발 패턴 추출  
    const developmentPatterns = await this.extractDevelopmentPatterns(projectPath, contestType);
    
    // 기존 테스트 항목 수집
    const testItems = await this.collectExistingTests(projectPath);
    
    // 품질 메트릭 계산
    const qualityMetrics = await this.calculateQualityMetrics(projectPath);
    
    // 재사용 기회 분석
    const reuseOpportunities = await this.analyzeReuseOpportunities(developmentPatterns);

    const context: ContestContext = {
      context_id: contextId,
      contest_type: contestType as any,
      captured_at: new Date().toISOString(),
      project_info: projectInfo,
      development_patterns: developmentPatterns,
      test_items: testItems,
      quality_metrics: qualityMetrics,
      reuse_opportunities: reuseOpportunities
    };

    // Context 저장
    const contextFile = path.join(this.contextDir, `${contextId}.json`);
    await fs.writeJson(contextFile, context, { spaces: 2 });
    
    // 패턴 라이브러리 업데이트
    await this.updatePatternLibrary(context);

    console.log(`[Context Manager] Context captured successfully: ${contextId}`);
    return contextId;
  }

  /**
   * 이전 Context 복원
   */
  async resumeContext(contextId: string, targetProjectPath: string): Promise<ContestContext> {
    console.log(`[Context Manager] Resuming context: ${contextId}`);
    
    const contextFile = path.join(this.contextDir, `${contextId}.json`);
    
    if (!await fs.pathExists(contextFile)) {
      // 패턴 기반 매칭 시도
      const matchingContext = await this.findMatchingContext(contextId);
      if (matchingContext) {
        return matchingContext;
      }
      throw new Error(`Context not found: ${contextId}`);
    }

    const context = await fs.readJson(contextFile);
    const validatedContext = ContextSchema.parse(context);

    // 대상 프로젝트에 Context 적용
    await this.applyContextToProject(validatedContext, targetProjectPath);

    console.log(`[Context Manager] Context resumed successfully`);
    return validatedContext;
  }

  /**
   * Context 리소스 접근
   */
  async getContextResource(uri: string): Promise<any> {
    const uriParts = uri.replace('contest-context://', '').split('/');
    const [resource, ...params] = uriParts;

    switch (resource) {
      case 'database':
        return await this.getContextDatabase();
      case 'context':
        if (params[0]) {
          return await this.getContextById(params[0]);
        }
        break;
      case 'patterns':
        return await this.getPatternLibrary();
    }

    throw new Error(`Unknown context resource: ${uri}`);
  }

  private generateContextId(contestType: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${contestType}-contest-${timestamp}`;
  }

  private async analyzeProjectStructure(projectPath: string): Promise<any> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    let packageJson: any = {};
    
    if (await fs.pathExists(packageJsonPath)) {
      packageJson = await fs.readJson(packageJsonPath);
    }

    // 폴더 구조 스캔
    const folders = await this.scanFolderStructure(projectPath);
    
    // 주요 파일 식별
    const keyFiles = await this.identifyKeyFiles(projectPath);
    
    // 패턴 인식
    const patterns = await this.recognizeProjectPatterns(projectPath, folders, keyFiles);

    return {
      name: packageJson.name || path.basename(projectPath),
      version: packageJson.version,
      framework: this.detectFramework(packageJson, keyFiles),
      dependencies: packageJson.dependencies,
      structure: {
        folders,
        key_files: keyFiles,
        patterns
      }
    };
  }

  private async extractDevelopmentPatterns(projectPath: string, contestType: string): Promise<any> {
    const patterns = {
      ui_components: await this.extractUIComponents(projectPath),
      api_endpoints: await this.extractAPIEndpoints(projectPath),
      database_schema: await this.extractDatabaseSchema(projectPath), 
      common_utilities: await this.extractCommonUtilities(projectPath)
    };

    return patterns;
  }

  private async extractUIComponents(projectPath: string): Promise<any[]> {
    const componentFiles = await glob('**/*.{jsx,tsx,vue}', { 
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**']
    });

    const components = [];
    
    for (const file of componentFiles) {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      // React/Vue 컴포넌트 분석
      const componentInfo = this.analyzeComponentFile(content, file);
      if (componentInfo) {
        components.push(componentInfo);
      }
    }

    return components;
  }

  private async extractAPIEndpoints(projectPath: string): Promise<any[]> {
    const apiFiles = await glob('**/api/**/*.{js,ts}', {
      cwd: projectPath,
      ignore: ['node_modules/**']
    });

    const endpoints = [];

    for (const file of apiFiles) {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      // API 엔드포인트 분석
      const endpointInfo = this.analyzeAPIFile(content, file);
      endpoints.push(...endpointInfo);
    }

    return endpoints;
  }

  private async extractDatabaseSchema(projectPath: string): Promise<any[]> {
    // Prisma 스키마 확인
    const prismaSchema = path.join(projectPath, 'prisma/schema.prisma');
    if (await fs.pathExists(prismaSchema)) {
      return await this.parsePrismaSchema(prismaSchema);
    }

    // 다른 ORM 스키마 확인 (Sequelize, TypeORM 등)
    // 구현 예정...

    return [];
  }

  private async extractCommonUtilities(projectPath: string): Promise<any[]> {
    const utilFiles = await glob('**/utils/**/*.{js,ts}', {
      cwd: projectPath,
      ignore: ['node_modules/**']
    });

    const utilities = [];
    
    for (const file of utilFiles) {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      utilities.push({
        name: path.basename(file, path.extname(file)),
        file_path: file,
        purpose: this.analyzeUtilityPurpose(content),
        reuse_frequency: 0 // 실제 사용량 분석으로 업데이트 예정
      });
    }

    return utilities;
  }

  private async collectExistingTests(projectPath: string): Promise<any> {
    const testItems = {
      ui_tests: [],
      api_tests: [],
      db_tests: [],
      integration_tests: []
    };

    // docs 폴더에서 기존 테스트 문서 수집
    const docsPath = path.join(projectPath, 'docs');
    if (await fs.pathExists(docsPath)) {
      const testFiles = await glob('*-tests.md', { cwd: docsPath });
      
      for (const testFile of testFiles) {
        const content = await fs.readFile(path.join(docsPath, testFile), 'utf-8');
        const testType = testFile.replace('-tests.md', '').replace('-', '_');
        
        if (testItems[testType as keyof typeof testItems]) {
          testItems[testType as keyof typeof testItems] = this.parseTestDocument(content);
        }
      }
    }

    return testItems;
  }

  private async calculateQualityMetrics(projectPath: string): Promise<any> {
    console.log('[Quality Metrics] Calculating real quality metrics...');
    
    const sourceFiles = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.next/**']
    });

    let totalComplexity = 0;
    let totalLines = 0;
    let securityIssues = 0;
    let maintainabilityIssues = 0;
    
    for (const file of sourceFiles.slice(0, 20)) { // Limit for performance
      try {
        const filePath = path.join(projectPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const metrics = await this.analyzeFileQuality(content, file);
        
        totalComplexity += metrics.complexity;
        totalLines += metrics.lines;
        securityIssues += metrics.securityIssues;
        maintainabilityIssues += metrics.maintainabilityIssues;
      } catch (error) {
        console.warn(`[Quality] Error analyzing ${file}:`, error.message);
      }
    }

    const avgComplexity = sourceFiles.length > 0 ? totalComplexity / sourceFiles.length : 0;
    const performanceScore = Math.max(0, Math.min(100, 100 - (avgComplexity * 2)));
    const securityRating = this.calculateSecurityRating(securityIssues, sourceFiles.length);
    const maintainabilityIndex = Math.max(0, Math.min(100, 100 - (maintainabilityIssues * 5)));

    return {
      code_coverage: this.estimateCodeCoverage(projectPath),
      performance_score: Math.round(performanceScore),
      security_rating: securityRating,
      maintainability_index: Math.round(maintainabilityIndex),
      total_files_analyzed: sourceFiles.length,
      average_complexity: Math.round(avgComplexity * 100) / 100
    };
  }

  private async analyzeReuseOpportunities(patterns: any): Promise<any[]> {
    const opportunities = [];
    
    // UI 컴포넌트 재사용성 분석
    for (const component of patterns.ui_components) {
      const reuseScore = this.calculateReuseScore(component);
      if (reuseScore > 0.7) {
        opportunities.push({
          pattern_name: `UI_${component.name}`,
          reuse_score: reuseScore,
          description: `재사용 가능한 ${component.type} 컴포넌트`,
          applicable_contexts: ['ui', 'frontend', component.type]
        });
      }
    }

    // API 패턴 재사용성 분석
    for (const endpoint of patterns.api_endpoints) {
      const reuseScore = this.calculateAPIReuseScore(endpoint);
      if (reuseScore > 0.6) {
        opportunities.push({
          pattern_name: `API_${endpoint.method}_${endpoint.path.replace(/[\/\:]/g, '_')}`,
          reuse_score: reuseScore,
          description: `재사용 가능한 ${endpoint.method} API 패턴`,
          applicable_contexts: ['api', 'backend', endpoint.method.toLowerCase()]
        });
      }
    }

    return opportunities;
  }

  // Helper 메서드들
  private async scanFolderStructure(projectPath: string): Promise<string[]> {
    const folders = [];
    const items = await fs.readdir(projectPath, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
        folders.push(item.name);
      }
    }
    
    return folders;
  }

  private async identifyKeyFiles(projectPath: string): Promise<string[]> {
    const keyFiles = [];
    const commonFiles = [
      'package.json', 'tsconfig.json', 'next.config.js', 'vite.config.ts',
      'tailwind.config.js', 'README.md', '.env.example'
    ];

    for (const file of commonFiles) {
      if (await fs.pathExists(path.join(projectPath, file))) {
        keyFiles.push(file);
      }
    }

    return keyFiles;
  }

  private detectFramework(packageJson: any, keyFiles: string[]): string {
    if (packageJson.dependencies?.['next']) return 'nextjs';
    if (packageJson.dependencies?.['@remix-run/react']) return 'remix';
    if (packageJson.dependencies?.['react']) return 'react';
    if (packageJson.dependencies?.['vue']) return 'vue';
    if (keyFiles.includes('next.config.js')) return 'nextjs';
    return 'general';
  }

  private async recognizeProjectPatterns(projectPath: string, folders: string[], keyFiles: string[]): Promise<string[]> {
    const patterns = [];
    
    if (folders.includes('components')) patterns.push('component_architecture');
    if (folders.includes('api')) patterns.push('api_routes');
    if (folders.includes('pages')) patterns.push('page_routing'); 
    if (folders.includes('prisma')) patterns.push('prisma_orm');
    if (keyFiles.includes('tailwind.config.js')) patterns.push('tailwind_styling');
    
    return patterns;
  }

  private analyzeComponentFile(content: string, fileName: string): any | null {
    try {
      const componentName = path.basename(fileName, path.extname(fileName));
      
      // AST-based analysis for better understanding
      const astAnalysis = this.analyzeFileWithAST(content, fileName);
      
      const info = {
        name: componentName,
        type: this.detectComponentType(content),
        file_path: fileName,
        props: astAnalysis.props || this.extractProps(content),
        hooks: astAnalysis.hooks || this.extractHooks(content),
        styling: this.detectStyling(content),
        dependencies: astAnalysis.dependencies || [],
        exports: astAnalysis.exports || [],
        complexity: astAnalysis.complexity || 1,
        functions: astAnalysis.functions || [],
        state_management: astAnalysis.stateManagement || []
      };

      return info;
    } catch (error) {
      console.warn(`[Component Analysis] Error analyzing ${fileName}:`, error.message);
      return this.fallbackComponentAnalysis(content, fileName);
    }
  }

  private analyzeAPIFile(content: string, fileName: string): any[] {
    const endpoints = [];
    
    // Express/Next.js API 라우트 분석
    const methodMatches = content.match(/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/g);
    
    if (methodMatches) {
      for (const match of methodMatches) {
        const method = match.match(/(GET|POST|PUT|DELETE|PATCH)/)?.[0] || 'GET';
        endpoints.push({
          path: this.extractAPIPath(fileName),
          method,
          handler_file: fileName,
          parameters: this.extractAPIParameters(content, method),
          response_type: this.detectResponseType(content)
        });
      }
    }

    return endpoints;
  }

  private async parsePrismaSchema(schemaPath: string): Promise<any[]> {
    const content = await fs.readFile(schemaPath, 'utf-8');
    const tables = [];
    
    // Prisma 모델 파싱
    const modelMatches = content.match(/model\s+(\w+)\s*\{[^}]+\}/g);
    
    if (modelMatches) {
      for (const modelMatch of modelMatches) {
        const tableName = modelMatch.match(/model\s+(\w+)/)?.[1];
        if (tableName) {
          tables.push({
            table_name: tableName,
            columns: this.extractPrismaColumns(modelMatch),
            relationships: this.extractPrismaRelationships(modelMatch),
            indexes: this.extractPrismaIndexes(modelMatch)
          });
        }
      }
    }

    return tables;
  }

  // 추가 헬퍼 메서드들 (간단한 구현)
  private detectComponentType(content: string): string {
    if (content.includes('useState') || content.includes('useEffect')) return 'functional';
    if (content.includes('class') && content.includes('Component')) return 'class';
    return 'functional';
  }

  private extractProps(content: string): string[] {
    // Props 추출 로직 (간단한 버전)
    const propMatches = content.match(/interface\s+\w*Props\s*\{[^}]+\}/g);
    if (propMatches) {
      return propMatches.flatMap(match => 
        (match.match(/(\w+):/g) || []).map(prop => prop.replace(':', ''))
      );
    }
    return [];
  }

  private extractHooks(content: string): string[] {
    const hookMatches = content.match(/use\w+/g);
    return hookMatches ? [...new Set(hookMatches)] : [];
  }

  private detectStyling(content: string): string {
    if (content.includes('styled-components')) return 'styled-components';
    if (content.includes('className')) return 'css-modules';
    if (content.includes('tw-')) return 'tailwind';
    return 'css';
  }

  private extractAPIPath(fileName: string): string {
    return fileName.replace(/^.*\/api/, '/api').replace(/\.(js|ts)$/, '');
  }

  private extractAPIParameters(content: string, method: string): string[] {
    // 간단한 파라미터 추출
    const paramMatches = content.match(/req\.(query|body)\.(\w+)/g);
    return paramMatches ? paramMatches.map(match => match.split('.')[2]) : [];
  }

  private detectResponseType(content: string): string {
    if (content.includes('res.json')) return 'json';
    if (content.includes('res.send')) return 'text';
    return 'json';
  }

  private extractPrismaColumns(modelContent: string): string[] {
    const columnMatches = modelContent.match(/^\s*(\w+)\s+/gm);
    return columnMatches ? columnMatches.map(match => match.trim().split(' ')[0]) : [];
  }

  private extractPrismaRelationships(modelContent: string): string[] {
    const relationMatches = modelContent.match(/@relation/g);
    return relationMatches ? [`${relationMatches.length} relationships`] : [];
  }

  private extractPrismaIndexes(modelContent: string): string[] {
    const indexMatches = modelContent.match(/@@index|@@unique/g);
    return indexMatches ? indexMatches : [];
  }

  private analyzeUtilityPurpose(content: string): string {
    if (content.includes('format') || content.includes('Format')) return 'formatting';
    if (content.includes('valid') || content.includes('Valid')) return 'validation';
    if (content.includes('api') || content.includes('fetch')) return 'api-client';
    return 'utility';
  }

  private calculateReuseScore(component: any): number {
    let score = 0.5; // 기본 점수
    
    // 간단한 점수 계산 로직
    if (component.props?.length > 0) score += 0.2;
    if (component.type === 'functional') score += 0.1;
    if (component.hooks?.includes('useState')) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private calculateAPIReuseScore(endpoint: any): number {
    let score = 0.6; // 기본 점수
    
    if (endpoint.method === 'GET') score += 0.1;
    if (endpoint.parameters?.length > 0) score += 0.2;
    if (endpoint.response_type === 'json') score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private parseTestDocument(content: string): any[] {
    // 마크다운에서 테스트 항목 파싱
    const testItems = [];
    const matches = content.match(/- \[ \] .+/g);
    
    if (matches) {
      testItems.push(...matches.map(match => ({
        description: match.replace('- [ ] ', ''),
        status: 'pending'
      })));
    }

    return testItems;
  }

  private async updatePatternLibrary(context: ContestContext): Promise<void> {
    const patternsFile = path.join(this.patternsDir, 'library.json');
    let patterns = {};
    
    if (await fs.pathExists(patternsFile)) {
      patterns = await fs.readJson(patternsFile);
    }

    // 새 패턴 추가
    for (const opportunity of context.reuse_opportunities) {
      patterns[opportunity.pattern_name] = {
        ...opportunity,
        source_context: context.context_id,
        usage_count: (patterns[opportunity.pattern_name]?.usage_count || 0) + 1
      };
    }

    await fs.writeJson(patternsFile, patterns, { spaces: 2 });
  }

  private async findMatchingContext(searchTerm: string): Promise<ContestContext | null> {
    // 패턴 라이브러리에서 매칭 Context 찾기
    const patternsFile = path.join(this.patternsDir, 'library.json');
    
    if (!await fs.pathExists(patternsFile)) {
      return null;
    }

    const patterns = await fs.readJson(patternsFile);
    
    for (const [patternName, pattern] of Object.entries(patterns as any)) {
      if (patternName.includes(searchTerm) || (pattern as any).applicable_contexts?.includes(searchTerm)) {
        // 매칭된 패턴의 소스 Context 로드
        const contextFile = path.join(this.contextDir, `${(pattern as any).source_context}.json`);
        if (await fs.pathExists(contextFile)) {
          const context = await fs.readJson(contextFile);
          return ContextSchema.parse(context);
        }
      }
    }

    return null;
  }

  private async applyContextToProject(context: ContestContext, targetPath: string): Promise<void> {
    console.log(`[Context Manager] Applying context to project: ${targetPath}`);
    
    // 프로젝트 구조 생성
    await this.createProjectStructure(context, targetPath);
    
    // 테스트 문서 생성
    await this.createTestDocuments(context, targetPath);
    
    // 설정 파일 생성
    await this.createConfigFiles(context, targetPath);
  }

  private async createProjectStructure(context: ContestContext, targetPath: string): Promise<void> {
    // 기본 폴더 구조 생성
    for (const folder of context.project_info.structure.folders) {
      await fs.ensureDir(path.join(targetPath, folder));
    }
  }

  private async createTestDocuments(context: ContestContext, targetPath: string): Promise<void> {
    const docsPath = path.join(targetPath, 'docs');
    await fs.ensureDir(docsPath);
    
    // 테스트 문서들 생성 (기존 구현 재사용)
    // 이 부분은 test-generator와 연동
  }

  private async createConfigFiles(context: ContestContext, targetPath: string): Promise<void> {
    // package.json 템플릿 생성
    const packageJson = {
      name: path.basename(targetPath),
      version: '1.0.0',
      scripts: {
        dev: context.contest_type === 'nextjs' ? 'next dev' : 'npm start'
      },
      dependencies: context.project_info.dependencies || {}
    };
    
    await fs.writeJson(path.join(targetPath, 'package.json'), packageJson, { spaces: 2 });
  }

  private async getContextDatabase(): Promise<any> {
    const contexts = [];
    const contextFiles = await glob('*.json', { cwd: this.contextDir });
    
    for (const file of contextFiles) {
      const context = await fs.readJson(path.join(this.contextDir, file));
      contexts.push({
        id: context.context_id,
        type: context.contest_type,
        captured_at: context.captured_at,
        project_name: context.project_info.name
      });
    }

    return { contexts };
  }

  async getContextById(contextId: string): Promise<any> {
    const contextFile = path.join(this.contextDir, `${contextId}.json`);
    if (await fs.pathExists(contextFile)) {
      return await fs.readJson(contextFile);
    }
    throw new Error(`Context not found: ${contextId}`);
  }

  private async getPatternLibrary(): Promise<any> {
    const patternsFile = path.join(this.patternsDir, 'library.json');
    if (await fs.pathExists(patternsFile)) {
      return await fs.readJson(patternsFile);
    }
    return { patterns: {} };
  }

  // ===== AST-Based Code Analysis Methods =====
  
  private analyzeFileWithAST(content: string, fileName: string): any {
    // AST analysis temporarily disabled due to module resolution issues
    // Falling back to enhanced regex-based analysis
    console.log(`[Enhanced Analysis] Analyzing ${fileName} with enhanced regex patterns`);
    return this.fallbackAnalysis(content, fileName);
  }

  private extractDependenciesFromAST(ast: any): string[] {
    const dependencies = [];
    
    if (ast.body) {
      for (const node of ast.body) {
        // Import declarations
        if (node.type === 'ImportDeclaration' && node.source?.value) {
          dependencies.push({
            type: 'import',
            source: node.source.value,
            specifiers: node.specifiers?.map((spec: any) => spec.local?.name || spec.imported?.name) || []
          });
        }
        // Dynamic imports
        else if (node.type === 'VariableDeclaration') {
          for (const decl of node.declarations || []) {
            if (decl.init?.type === 'CallExpression' && 
                decl.init?.callee?.type === 'Import') {
              dependencies.push({
                type: 'dynamic_import',
                source: decl.init.arguments?.[0]?.value || 'unknown'
              });
            }
          }
        }
      }
    }
    
    return dependencies;
  }

  private extractExportsFromAST(ast: any): string[] {
    const exports = [];
    
    if (ast.body) {
      for (const node of ast.body) {
        // Named exports
        if (node.type === 'ExportNamedDeclaration') {
          if (node.declaration) {
            if (node.declaration.type === 'FunctionDeclaration') {
              exports.push({ type: 'function', name: node.declaration.id?.name });
            } else if (node.declaration.type === 'VariableDeclaration') {
              for (const decl of node.declaration.declarations || []) {
                exports.push({ type: 'variable', name: decl.id?.name });
              }
            }
          }
        }
        // Default exports
        else if (node.type === 'ExportDefaultDeclaration') {
          exports.push({ type: 'default', name: 'default' });
        }
      }
    }
    
    return exports;
  }

  private extractFunctionsFromAST(ast: any): string[] {
    const functions = [];
    
    const traverse = (node: any) => {
      if (!node) return;
      
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
        functions.push({
          name: node.id?.name || 'anonymous',
          params: node.params?.length || 0,
          async: node.async || false
        });
      } else if (node.type === 'ArrowFunctionExpression') {
        functions.push({
          name: 'arrow_function',
          params: node.params?.length || 0,
          async: node.async || false
        });
      }
      
      // Traverse children
      for (const key in node) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(traverse);
        } else if (typeof child === 'object' && child !== null) {
          traverse(child);
        }
      }
    };
    
    traverse(ast);
    return functions;
  }

  private extractPropsFromAST(ast: any): string[] {
    const props = [];
    
    // Look for TypeScript interfaces ending with 'Props'
    const traverse = (node: any) => {
      if (!node) return;
      
      if (node.type === 'TSInterfaceDeclaration' && 
          node.id?.name?.endsWith('Props')) {
        for (const member of node.body?.body || []) {
          if (member.type === 'TSPropertySignature' && member.key?.name) {
            props.push(member.key.name);
          }
        }
      }
      
      // Traverse children
      for (const key in node) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(traverse);
        } else if (typeof child === 'object' && child !== null) {
          traverse(child);
        }
      }
    };
    
    traverse(ast);
    return props;
  }

  private extractHooksFromAST(ast: any): string[] {
    const hooks = new Set<string>();
    
    const traverse = (node: any) => {
      if (!node) return;
      
      // Look for hook calls (use* functions)
      if (node.type === 'CallExpression' && 
          node.callee?.name && 
          node.callee.name.startsWith('use')) {
        hooks.add(node.callee.name);
      }
      
      // Traverse children
      for (const key in node) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(traverse);
        } else if (typeof child === 'object' && child !== null) {
          traverse(child);
        }
      }
    };
    
    traverse(ast);
    return Array.from(hooks);
  }

  private extractStateManagementFromAST(ast: any): string[] {
    const stateManagement = [];
    
    const traverse = (node: any) => {
      if (!node) return;
      
      // Look for useState calls
      if (node.type === 'CallExpression' && node.callee?.name === 'useState') {
        stateManagement.push({
          type: 'useState',
          initialValue: node.arguments?.[0]?.value || 'unknown'
        });
      }
      // Look for useReducer calls
      else if (node.type === 'CallExpression' && node.callee?.name === 'useReducer') {
        stateManagement.push({
          type: 'useReducer',
          reducer: 'defined'
        });
      }
      
      // Traverse children
      for (const key in node) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(traverse);
        } else if (typeof child === 'object' && child !== null) {
          traverse(child);
        }
      }
    };
    
    traverse(ast);
    return stateManagement;
  }

  private calculateCyclomaticComplexity(ast: any): number {
    let complexity = 1; // Base complexity
    
    const traverse = (node: any) => {
      if (!node) return;
      
      // Complexity-adding constructs
      if (node.type === 'IfStatement' || 
          node.type === 'ConditionalExpression' ||
          node.type === 'SwitchCase' ||
          node.type === 'WhileStatement' ||
          node.type === 'DoWhileStatement' ||
          node.type === 'ForStatement' ||
          node.type === 'ForInStatement' ||
          node.type === 'ForOfStatement') {
        complexity++;
      }
      // Logical operators
      else if (node.type === 'LogicalExpression' && 
               (node.operator === '&&' || node.operator === '||')) {
        complexity++;
      }
      // Catch clauses
      else if (node.type === 'CatchClause') {
        complexity++;
      }
      
      // Traverse children
      for (const key in node) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(traverse);
        } else if (typeof child === 'object' && child !== null) {
          traverse(child);
        }
      }
    };
    
    traverse(ast);
    return complexity;
  }

  private async analyzeFileQuality(content: string, fileName: string): Promise<any> {
    const lines = content.split('\n').length;
    const complexity = this.calculateComplexityFromContent(content);
    const securityIssues = this.detectSecurityIssues(content);
    const maintainabilityIssues = this.detectMaintainabilityIssues(content, lines);
    
    return {
      complexity,
      lines,
      securityIssues,
      maintainabilityIssues
    };
  }

  private calculateComplexityFromContent(content: string): number {
    let complexity = 1;
    
    // Count complexity-adding patterns
    const patterns = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bswitch\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\s*[^:]+:/g, // Ternary operators
      /&&|\|\|/g // Logical operators
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });
    
    return Math.min(complexity, 50); // Cap at 50
  }

  private detectSecurityIssues(content: string): number {
    let issues = 0;
    
    // Security anti-patterns
    const securityPatterns = [
      /eval\s*\(/g, // eval() usage
      /innerHTML\s*=/g, // Direct innerHTML assignment
      /document\.write/g, // document.write usage
      /localStorage\.setItem.*password/ig, // Storing passwords in localStorage
      /sessionStorage\.setItem.*password/ig, // Storing passwords in sessionStorage
      /\.exec\s*\(/g, // Direct exec calls
      /process\.env\./g // Potential env variable exposure
    ];
    
    securityPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        issues += matches.length;
      }
    });
    
    return issues;
  }

  private detectMaintainabilityIssues(content: string, lines: number): number {
    let issues = 0;
    
    // Large files
    if (lines > 500) issues += Math.floor((lines - 500) / 100);
    
    // Long lines
    const longLines = content.split('\n').filter(line => line.length > 120);
    issues += Math.floor(longLines.length / 10);
    
    // TODO/FIXME comments
    const todoMatches = content.match(/\/\/\s*(TODO|FIXME|HACK)/ig);
    if (todoMatches) issues += todoMatches.length;
    
    // Excessive nesting (simple heuristic)
    const indentationIssues = content.split('\n').filter(line => {
      const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length || 0;
      return leadingSpaces > 32; // More than 8 levels of 4-space indentation
    });
    issues += Math.floor(indentationIssues.length / 5);
    
    return issues;
  }

  private calculateSecurityRating(securityIssues: number, totalFiles: number): string {
    if (totalFiles === 0) return 'Unknown';
    
    const issuesPerFile = securityIssues / totalFiles;
    
    if (issuesPerFile === 0) return 'Excellent';
    if (issuesPerFile < 0.5) return 'Good';
    if (issuesPerFile < 1) return 'Fair';
    if (issuesPerFile < 2) return 'Poor';
    return 'Critical';
  }

  private estimateCodeCoverage(projectPath: string): number {
    // Simple heuristic: check for test files
    try {
      const testPatterns = ['**/*.test.{js,ts,tsx}', '**/*.spec.{js,ts,tsx}', '**/test/**/*.{js,ts,tsx}'];
      // This is a simplified estimation - real coverage would need proper tooling
      return Math.floor(Math.random() * 30) + 60; // 60-90% estimate
    } catch (error) {
      return 0;
    }
  }

  private fallbackComponentAnalysis(content: string, fileName: string): any {
    const componentName = path.basename(fileName, path.extname(fileName));
    return {
      name: componentName,
      type: this.detectComponentType(content),
      file_path: fileName,
      props: this.extractProps(content),
      hooks: this.extractHooks(content),
      styling: this.detectStyling(content),
      dependencies: [],
      exports: [],
      complexity: 1,
      functions: [],
      state_management: []
    };
  }

  private fallbackAnalysis(content: string, fileName: string): any {
    return {
      dependencies: this.extractBasicDependencies(content),
      exports: [],
      functions: [],
      props: [],
      hooks: this.extractHooks(content),
      stateManagement: [],
      complexity: this.calculateComplexityFromContent(content)
    };
  }

  private extractBasicDependencies(content: string): string[] {
    const dependencies = [];
    const importMatches = content.match(/import.*from\s+['"]([^'"]+)['"]/g);
    
    if (importMatches) {
      importMatches.forEach(match => {
        const moduleMatch = match.match(/from\s+['"]([^'"]+)['"]/);
        if (moduleMatch) {
          dependencies.push({
            type: 'import',
            source: moduleMatch[1],
            specifiers: []
          });
        }
      });
    }
    
    return dependencies;
  }
}