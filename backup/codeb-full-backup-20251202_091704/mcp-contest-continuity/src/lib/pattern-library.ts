/**
 * Pattern Library Manager
 * 
 * 개발 패턴 라이브러리 관리 시스템
 * - 코드 패턴 자동 추출 및 분류
 * - 재사용 가능한 패턴 템플릿 생성
 * - 패턴 기반 코드 생성 지원
 * - 프로젝트 간 패턴 공유
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { z } from 'zod';
import crypto from 'crypto';

// 패턴 스키마 정의
const CodePatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum([
    'ui-component', 'api-endpoint', 'database-model', 'middleware', 
    'hook', 'utility', 'service', 'test', 'configuration', 'workflow'
  ]),
  framework: z.string(), // 'react', 'vue', 'nextjs', 'remix', 'express', etc.
  description: z.string(),
  tags: z.array(z.string()),
  complexity: z.enum(['simple', 'moderate', 'complex']),
  template: z.object({
    files: z.array(z.object({
      path: z.string(),
      content: z.string(),
      type: z.enum(['code', 'test', 'config', 'style', 'doc'])
    })),
    variables: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
      default: z.string().optional(),
      required: z.boolean()
    })),
    dependencies: z.array(z.string()).optional()
  }),
  usage_count: z.number(),
  success_rate: z.number(), // 0-1
  created_at: z.string(),
  updated_at: z.string(),
  source_projects: z.array(z.string()),
  examples: z.array(z.object({
    project: z.string(),
    file_path: z.string(),
    context: z.string().optional()
  }))
});

export type CodePattern = z.infer<typeof CodePatternSchema>;

const PatternLibrarySchema = z.object({
  version: z.string(),
  patterns: z.array(CodePatternSchema),
  categories: z.record(z.object({
    name: z.string(),
    description: z.string(),
    pattern_count: z.number()
  })),
  frameworks: z.record(z.object({
    name: z.string(),
    version: z.string(),
    pattern_count: z.number()
  })),
  last_updated: z.string()
});

export type PatternLibrary = z.infer<typeof PatternLibrarySchema>;

interface PatternExtractionConfig {
  frameworks: string[];
  include_tests: boolean;
  min_complexity: 'simple' | 'moderate' | 'complex';
  extract_from: ('components' | 'hooks' | 'utilities' | 'services' | 'apis')[];
}

interface PatternMatchResult {
  pattern: CodePattern;
  confidence: number; // 0-1
  adaptations_needed: string[];
}

export class PatternLibraryManager {
  private libraryPath: string;
  private library: PatternLibrary;

  constructor(libraryPath = '.mcp-cache/pattern-library.json') {
    this.libraryPath = libraryPath;
    this.library = {
      version: '1.0.0',
      patterns: [],
      categories: {},
      frameworks: {},
      last_updated: new Date().toISOString()
    };
  }

  /**
   * 패턴 라이브러리 초기화 및 로드
   */
  async initialize(): Promise<void> {
    try {
      if (await fs.pathExists(this.libraryPath)) {
        const data = await fs.readJson(this.libraryPath);
        this.library = PatternLibrarySchema.parse(data);
        console.log(`[PatternLibrary] Loaded ${this.library.patterns.length} patterns`);
      } else {
        await this.save();
        console.log('[PatternLibrary] Initialized new pattern library');
      }
    } catch (error) {
      console.warn('[PatternLibrary] Failed to load library, starting fresh:', error);
      this.library = {
        version: '1.0.0',
        patterns: [],
        categories: {},
        frameworks: {},
        last_updated: new Date().toISOString()
      };
    }
  }

  /**
   * 프로젝트에서 패턴 자동 추출
   */
  async extractPatterns(
    projectPath: string, 
    config: PatternExtractionConfig
  ): Promise<CodePattern[]> {
    console.log(`[PatternLibrary] Extracting patterns from: ${projectPath}`);

    const extractedPatterns: CodePattern[] = [];

    // React 컴포넌트 패턴 추출
    if (config.frameworks.includes('react') && config.extract_from.includes('components')) {
      const componentPatterns = await this.extractReactComponentPatterns(projectPath);
      extractedPatterns.push(...componentPatterns);
    }

    // API 엔드포인트 패턴 추출
    if (config.extract_from.includes('apis')) {
      const apiPatterns = await this.extractAPIPatterns(projectPath);
      extractedPatterns.push(...apiPatterns);
    }

    // 커스텀 훅 패턴 추출
    if (config.frameworks.includes('react') && config.extract_from.includes('hooks')) {
      const hookPatterns = await this.extractHookPatterns(projectPath);
      extractedPatterns.push(...hookPatterns);
    }

    // 유틸리티 함수 패턴 추출
    if (config.extract_from.includes('utilities')) {
      const utilityPatterns = await this.extractUtilityPatterns(projectPath);
      extractedPatterns.push(...utilityPatterns);
    }

    // 서비스 클래스 패턴 추출
    if (config.extract_from.includes('services')) {
      const servicePatterns = await this.extractServicePatterns(projectPath);
      extractedPatterns.push(...servicePatterns);
    }

    // 추출된 패턴을 라이브러리에 추가
    for (const pattern of extractedPatterns) {
      await this.addPattern(pattern);
    }

    console.log(`[PatternLibrary] Extracted ${extractedPatterns.length} new patterns`);
    return extractedPatterns;
  }

  /**
   * React 컴포넌트 패턴 추출
   */
  private async extractReactComponentPatterns(projectPath: string): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];
    
    // React 컴포넌트 파일 찾기
    const componentFiles = await glob(
      path.join(projectPath, '**/*.{jsx,tsx}'),
      { ignore: ['**/node_modules/**', '**/dist/**'] }
    );

    for (const file of componentFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        
        // 함수형 컴포넌트 패턴 매칭
        const functionComponentRegex = /(?:export\s+(?:default\s+)?)?(?:const|function)\s+(\w+)\s*[=:]\s*(?:\([^)]*\)\s*=>\s*{|function[^{]*{)/g;
        let match;

        while ((match = functionComponentRegex.exec(content)) !== null) {
          const componentName = match[1];
          
          // JSX 리턴이 있는지 확인 (실제 React 컴포넌트인지)
          if (content.includes('return (') || content.includes('return <')) {
            const pattern = await this.createComponentPattern(
              componentName,
              file,
              content,
              projectPath
            );
            
            if (pattern) {
              patterns.push(pattern);
            }
          }
        }
      } catch (error) {
        console.warn(`[PatternLibrary] Failed to analyze ${file}:`, error);
      }
    }

    return patterns;
  }

  /**
   * API 엔드포인트 패턴 추출
   */
  private async extractAPIPatterns(projectPath: string): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];
    
    // API 파일 찾기
    const apiFiles = await glob(
      path.join(projectPath, '**/{api,routes,controllers}/**/*.{js,ts}'),
      { ignore: ['**/node_modules/**', '**/dist/**'] }
    );

    for (const file of apiFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        
        // Express/Next.js API 패턴 매칭
        const apiPatterns = [
          /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g, // Express
          /export\s+(?:default\s+)?(?:async\s+)?function\s+handler/g, // Next.js API
        ];

        for (const regex of apiPatterns) {
          let match;
          while ((match = regex.exec(content)) !== null) {
            const pattern = await this.createAPIPattern(
              match[2] || 'handler',
              file,
              content,
              projectPath,
              match[1] || 'handler'
            );
            
            if (pattern) {
              patterns.push(pattern);
            }
          }
        }
      } catch (error) {
        console.warn(`[PatternLibrary] Failed to analyze ${file}:`, error);
      }
    }

    return patterns;
  }

  /**
   * 커스텀 훅 패턴 추출
   */
  private async extractHookPatterns(projectPath: string): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];
    
    const hookFiles = await glob(
      path.join(projectPath, '**/use*.{js,ts,jsx,tsx}'),
      { ignore: ['**/node_modules/**', '**/dist/**'] }
    );

    for (const file of hookFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        
        // 커스텀 훅 패턴 매칭
        const hookRegex = /(?:export\s+(?:default\s+)?)?(?:const|function)\s+(use\w+)/g;
        let match;

        while ((match = hookRegex.exec(content)) !== null) {
          const hookName = match[1];
          
          if (content.includes('useState') || content.includes('useEffect') || content.includes('useCallback')) {
            const pattern = await this.createHookPattern(
              hookName,
              file,
              content,
              projectPath
            );
            
            if (pattern) {
              patterns.push(pattern);
            }
          }
        }
      } catch (error) {
        console.warn(`[PatternLibrary] Failed to analyze ${file}:`, error);
      }
    }

    return patterns;
  }

  /**
   * 유틸리티 함수 패턴 추출
   */
  private async extractUtilityPatterns(projectPath: string): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];
    
    const utilFiles = await glob(
      path.join(projectPath, '**/{utils,utilities,helpers}/**/*.{js,ts}'),
      { ignore: ['**/node_modules/**', '**/dist/**'] }
    );

    for (const file of utilFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        
        // 유틸리티 함수 패턴 매칭
        const funcRegex = /(?:export\s+(?:default\s+)?)?(?:const|function)\s+(\w+)\s*[=:]\s*(?:\([^)]*\)\s*=>\s*{|function[^{]*{)/g;
        let match;

        while ((match = funcRegex.exec(content)) !== null) {
          const funcName = match[1];
          
          const pattern = await this.createUtilityPattern(
            funcName,
            file,
            content,
            projectPath
          );
          
          if (pattern) {
            patterns.push(pattern);
          }
        }
      } catch (error) {
        console.warn(`[PatternLibrary] Failed to analyze ${file}:`, error);
      }
    }

    return patterns;
  }

  /**
   * 서비스 클래스 패턴 추출
   */
  private async extractServicePatterns(projectPath: string): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];
    
    const serviceFiles = await glob(
      path.join(projectPath, '**/{services,service}/**/*.{js,ts}'),
      { ignore: ['**/node_modules/**', '**/dist/**'] }
    );

    for (const file of serviceFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        
        // 클래스 패턴 매칭
        const classRegex = /(?:export\s+(?:default\s+)?)?class\s+(\w+)/g;
        let match;

        while ((match = classRegex.exec(content)) !== null) {
          const className = match[1];
          
          const pattern = await this.createServicePattern(
            className,
            file,
            content,
            projectPath
          );
          
          if (pattern) {
            patterns.push(pattern);
          }
        }
      } catch (error) {
        console.warn(`[PatternLibrary] Failed to analyze ${file}:`, error);
      }
    }

    return patterns;
  }

  /**
   * 컴포넌트 패턴 생성
   */
  private async createComponentPattern(
    name: string,
    filePath: string,
    content: string,
    projectPath: string
  ): Promise<CodePattern | null> {
    try {
      // 패턴 분석
      const hasProps = content.includes('props') || /\(\s*{\s*[^}]+\s*}\s*\)/.test(content);
      const hasState = content.includes('useState');
      const hasEffects = content.includes('useEffect');
      const hasStyles = content.includes('className') || content.includes('style=');
      
      // 복잡도 평가
      let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
      if (hasState && hasEffects) complexity = 'complex';
      else if (hasState || hasEffects || hasProps) complexity = 'moderate';

      // 변수 추출
      const variables = this.extractVariablesFromContent(content, 'component');

      const pattern: CodePattern = {
        id: this.generatePatternId(name, 'ui-component'),
        name,
        category: 'ui-component',
        framework: this.detectFramework(content, projectPath),
        description: `React component: ${name}`,
        tags: this.generateTags(content, 'component'),
        complexity,
        template: {
          files: [{
            path: `${name}.tsx`,
            content: this.templateizeContent(content, variables),
            type: 'code'
          }],
          variables,
          dependencies: this.extractDependencies(content)
        },
        usage_count: 0,
        success_rate: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_projects: [path.basename(projectPath)],
        examples: [{
          project: path.basename(projectPath),
          file_path: filePath,
          context: 'Original implementation'
        }]
      };

      return pattern;
    } catch (error) {
      console.warn(`[PatternLibrary] Failed to create component pattern for ${name}:`, error);
      return null;
    }
  }

  /**
   * API 패턴 생성
   */
  private async createAPIPattern(
    name: string,
    filePath: string,
    content: string,
    projectPath: string,
    method: string
  ): Promise<CodePattern | null> {
    try {
      const variables = this.extractVariablesFromContent(content, 'api');
      
      const pattern: CodePattern = {
        id: this.generatePatternId(name, 'api-endpoint'),
        name: `${method.toUpperCase()} ${name}`,
        category: 'api-endpoint',
        framework: this.detectFramework(content, projectPath),
        description: `API endpoint: ${method.toUpperCase()} ${name}`,
        tags: [method, 'api', 'endpoint'],
        complexity: this.assessComplexity(content),
        template: {
          files: [{
            path: `${name.replace(/[^\w]/g, '_')}.ts`,
            content: this.templateizeContent(content, variables),
            type: 'code'
          }],
          variables,
          dependencies: this.extractDependencies(content)
        },
        usage_count: 0,
        success_rate: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_projects: [path.basename(projectPath)],
        examples: [{
          project: path.basename(projectPath),
          file_path: filePath
        }]
      };

      return pattern;
    } catch (error) {
      console.warn(`[PatternLibrary] Failed to create API pattern for ${name}:`, error);
      return null;
    }
  }

  /**
   * 훅 패턴 생성
   */
  private async createHookPattern(
    name: string,
    filePath: string,
    content: string,
    projectPath: string
  ): Promise<CodePattern | null> {
    try {
      const variables = this.extractVariablesFromContent(content, 'hook');
      
      const pattern: CodePattern = {
        id: this.generatePatternId(name, 'hook'),
        name,
        category: 'hook',
        framework: 'react',
        description: `Custom React hook: ${name}`,
        tags: ['hook', 'react', 'custom'],
        complexity: this.assessComplexity(content),
        template: {
          files: [{
            path: `${name}.ts`,
            content: this.templateizeContent(content, variables),
            type: 'code'
          }],
          variables,
          dependencies: this.extractDependencies(content)
        },
        usage_count: 0,
        success_rate: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_projects: [path.basename(projectPath)],
        examples: [{
          project: path.basename(projectPath),
          file_path: filePath
        }]
      };

      return pattern;
    } catch (error) {
      console.warn(`[PatternLibrary] Failed to create hook pattern for ${name}:`, error);
      return null;
    }
  }

  /**
   * 유틸리티 패턴 생성
   */
  private async createUtilityPattern(
    name: string,
    filePath: string,
    content: string,
    projectPath: string
  ): Promise<CodePattern | null> {
    try {
      const variables = this.extractVariablesFromContent(content, 'utility');
      
      const pattern: CodePattern = {
        id: this.generatePatternId(name, 'utility'),
        name,
        category: 'utility',
        framework: 'generic',
        description: `Utility function: ${name}`,
        tags: ['utility', 'function', 'helper'],
        complexity: this.assessComplexity(content),
        template: {
          files: [{
            path: `${name}.ts`,
            content: this.templateizeContent(content, variables),
            type: 'code'
          }],
          variables,
          dependencies: this.extractDependencies(content)
        },
        usage_count: 0,
        success_rate: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_projects: [path.basename(projectPath)],
        examples: [{
          project: path.basename(projectPath),
          file_path: filePath
        }]
      };

      return pattern;
    } catch (error) {
      console.warn(`[PatternLibrary] Failed to create utility pattern for ${name}:`, error);
      return null;
    }
  }

  /**
   * 서비스 패턴 생성
   */
  private async createServicePattern(
    name: string,
    filePath: string,
    content: string,
    projectPath: string
  ): Promise<CodePattern | null> {
    try {
      const variables = this.extractVariablesFromContent(content, 'service');
      
      const pattern: CodePattern = {
        id: this.generatePatternId(name, 'service'),
        name,
        category: 'service',
        framework: 'generic',
        description: `Service class: ${name}`,
        tags: ['service', 'class', 'business-logic'],
        complexity: this.assessComplexity(content),
        template: {
          files: [{
            path: `${name}.ts`,
            content: this.templateizeContent(content, variables),
            type: 'code'
          }],
          variables,
          dependencies: this.extractDependencies(content)
        },
        usage_count: 0,
        success_rate: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_projects: [path.basename(projectPath)],
        examples: [{
          project: path.basename(projectPath),
          file_path: filePath
        }]
      };

      return pattern;
    } catch (error) {
      console.warn(`[PatternLibrary] Failed to create service pattern for ${name}:`, error);
      return null;
    }
  }

  /**
   * 패턴 ID 생성
   */
  private generatePatternId(name: string, category: string): string {
    const hash = crypto.createHash('md5').update(`${category}_${name}_${Date.now()}`).digest('hex');
    return `${category}_${name.toLowerCase()}_${hash.substring(0, 8)}`;
  }

  /**
   * 프레임워크 감지
   */
  private detectFramework(content: string, projectPath: string): string {
    if (content.includes('from "react"') || content.includes("from 'react'")) return 'react';
    if (content.includes('from "vue"')) return 'vue';
    if (content.includes('from "next')) return 'nextjs';
    if (content.includes('@remix-run')) return 'remix';
    if (content.includes('express')) return 'express';
    
    // package.json 확인
    try {
      const packagePath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        
        if (deps.next) return 'nextjs';
        if (deps.react) return 'react';
        if (deps.vue) return 'vue';
        if (deps['@remix-run/dev']) return 'remix';
        if (deps.express) return 'express';
      }
    } catch (error) {
      // ignore
    }
    
    return 'generic';
  }

  /**
   * 태그 생성
   */
  private generateTags(content: string, type: string): string[] {
    const tags = [type];
    
    if (content.includes('useState')) tags.push('state');
    if (content.includes('useEffect')) tags.push('effect');
    if (content.includes('useCallback')) tags.push('callback');
    if (content.includes('useMemo')) tags.push('memo');
    if (content.includes('async')) tags.push('async');
    if (content.includes('await')) tags.push('async');
    if (content.includes('try') && content.includes('catch')) tags.push('error-handling');
    if (content.includes('className')) tags.push('styled');
    if (content.includes('onClick')) tags.push('interactive');
    if (content.includes('onSubmit')) tags.push('form');
    
    return [...new Set(tags)];
  }

  /**
   * 복잡도 평가
   */
  private assessComplexity(content: string): 'simple' | 'moderate' | 'complex' {
    let score = 0;
    
    // 라인 수
    const lines = content.split('\n').length;
    if (lines > 100) score += 2;
    else if (lines > 50) score += 1;
    
    // 복잡한 패턴들
    if (content.includes('useEffect')) score += 1;
    if (content.includes('useCallback')) score += 1;
    if (content.includes('useMemo')) score += 1;
    if (content.includes('async') && content.includes('await')) score += 1;
    if (content.includes('try') && content.includes('catch')) score += 1;
    if ((content.match(/if\s*\(/g) || []).length > 3) score += 1;
    if ((content.match(/for\s*\(/g) || []).length > 1) score += 1;
    if ((content.match(/\?\s*:/g) || []).length > 2) score += 1;
    
    if (score >= 4) return 'complex';
    if (score >= 2) return 'moderate';
    return 'simple';
  }

  /**
   * 변수 추출
   */
  private extractVariablesFromContent(content: string, type: string): CodePattern['template']['variables'] {
    const variables: CodePattern['template']['variables'] = [];
    
    // 컴포넌트 이름 추출
    const nameMatch = content.match(/(?:const|function)\s+(\w+)/);
    if (nameMatch) {
      variables.push({
        name: 'componentName',
        type: 'string',
        description: 'The name of the component/function',
        default: nameMatch[1],
        required: true
      });
    }

    // Props 인터페이스 추출
    const interfaceMatch = content.match(/interface\s+(\w+Props)/);
    if (interfaceMatch) {
      variables.push({
        name: 'propsInterface',
        type: 'string',
        description: 'Props interface name',
        default: interfaceMatch[1],
        required: false
      });
    }

    // 기본 변수들 추가
    if (type === 'api') {
      variables.push(
        {
          name: 'httpMethod',
          type: 'string',
          description: 'HTTP method (GET, POST, PUT, DELETE)',
          default: 'GET',
          required: true
        },
        {
          name: 'endpoint',
          type: 'string',
          description: 'API endpoint path',
          default: '/api/example',
          required: true
        }
      );
    }

    return variables;
  }

  /**
   * 의존성 추출
   */
  private extractDependencies(content: string): string[] {
    const deps: string[] = [];
    
    // import 문에서 패키지 추출
    const importRegex = /import.*from\s+['"`]([^'"`]+)['"`]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const pkg = match[1];
      if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
        // 외부 패키지만 추출
        const packageName = pkg.startsWith('@') ? 
          pkg.split('/').slice(0, 2).join('/') : 
          pkg.split('/')[0];
        
        if (!deps.includes(packageName)) {
          deps.push(packageName);
        }
      }
    }

    return deps;
  }

  /**
   * 콘텐츠 템플릿화
   */
  private templateizeContent(content: string, variables: CodePattern['template']['variables']): string {
    let templated = content;
    
    // 변수로 치환
    for (const variable of variables) {
      if (variable.default) {
        const regex = new RegExp(variable.default, 'g');
        templated = templated.replace(regex, `{{${variable.name}}}`);
      }
    }

    return templated;
  }

  /**
   * 패턴 추가
   */
  async addPattern(pattern: CodePattern): Promise<void> {
    // 중복 확인
    const existingIndex = this.library.patterns.findIndex(p => p.id === pattern.id);
    
    if (existingIndex >= 0) {
      // 업데이트
      this.library.patterns[existingIndex] = {
        ...pattern,
        updated_at: new Date().toISOString()
      };
    } else {
      // 새로 추가
      this.library.patterns.push(pattern);
    }

    // 메타데이터 업데이트
    this.updateMetadata();
    await this.save();
  }

  /**
   * 패턴 검색
   */
  searchPatterns(query: {
    category?: CodePattern['category'];
    framework?: string;
    tags?: string[];
    complexity?: CodePattern['complexity'];
    text?: string;
  }): PatternMatchResult[] {
    let results = this.library.patterns;

    // 필터링
    if (query.category) {
      results = results.filter(p => p.category === query.category);
    }

    if (query.framework) {
      results = results.filter(p => p.framework === query.framework);
    }

    if (query.complexity) {
      results = results.filter(p => p.complexity === query.complexity);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(p => 
        query.tags!.some(tag => p.tags.includes(tag))
      );
    }

    if (query.text) {
      const searchText = query.text.toLowerCase();
      results = results.filter(p => 
        p.name.toLowerCase().includes(searchText) ||
        p.description.toLowerCase().includes(searchText) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchText))
      );
    }

    // 신뢰도 계산
    return results.map(pattern => ({
      pattern,
      confidence: this.calculateMatchConfidence(pattern, query),
      adaptations_needed: this.calculateAdaptations(pattern, query)
    })).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 매치 신뢰도 계산
   */
  private calculateMatchConfidence(pattern: CodePattern, query: any): number {
    let confidence = pattern.success_rate;

    // 정확한 매치에 보너스
    if (query.category === pattern.category) confidence += 0.1;
    if (query.framework === pattern.framework) confidence += 0.1;
    if (query.complexity === pattern.complexity) confidence += 0.05;

    // 태그 매치
    if (query.tags) {
      const matchedTags = query.tags.filter(tag => pattern.tags.includes(tag));
      confidence += (matchedTags.length / query.tags.length) * 0.2;
    }

    // 사용 빈도
    confidence += Math.min(pattern.usage_count / 100, 0.1);

    return Math.min(confidence, 1.0);
  }

  /**
   * 필요한 적응사항 계산
   */
  private calculateAdaptations(pattern: CodePattern, query: any): string[] {
    const adaptations: string[] = [];

    if (query.framework && query.framework !== pattern.framework) {
      adaptations.push(`Adapt from ${pattern.framework} to ${query.framework}`);
    }

    if (query.category && query.category !== pattern.category) {
      adaptations.push(`Convert from ${pattern.category} to ${query.category} pattern`);
    }

    return adaptations;
  }

  /**
   * 패턴으로부터 코드 생성
   */
  async generateCode(
    patternId: string,
    variables: Record<string, string>,
    outputPath: string
  ): Promise<{ files: string[], success: boolean }> {
    const pattern = this.library.patterns.find(p => p.id === patternId);
    
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    const generatedFiles: string[] = [];

    try {
      for (const file of pattern.template.files) {
        let content = file.content;
        
        // 변수 치환
        for (const [key, value] of Object.entries(variables)) {
          const regex = new RegExp(`{{${key}}}`, 'g');
          content = content.replace(regex, value);
        }

        // 파일 경로 생성
        let filePath = file.path;
        for (const [key, value] of Object.entries(variables)) {
          filePath = filePath.replace(`{{${key}}}`, value);
        }

        const fullPath = path.join(outputPath, filePath);
        
        // 디렉토리 생성
        await fs.ensureDir(path.dirname(fullPath));
        
        // 파일 생성
        await fs.writeFile(fullPath, content);
        generatedFiles.push(fullPath);
      }

      // 사용 통계 업데이트
      pattern.usage_count++;
      await this.save();

      return { files: generatedFiles, success: true };
    } catch (error) {
      console.error('[PatternLibrary] Code generation failed:', error);
      return { files: generatedFiles, success: false };
    }
  }

  /**
   * 메타데이터 업데이트
   */
  private updateMetadata(): void {
    // 카테고리 통계
    this.library.categories = {};
    for (const pattern of this.library.patterns) {
      if (!this.library.categories[pattern.category]) {
        this.library.categories[pattern.category] = {
          name: pattern.category,
          description: `Patterns for ${pattern.category}`,
          pattern_count: 0
        };
      }
      this.library.categories[pattern.category].pattern_count++;
    }

    // 프레임워크 통계
    this.library.frameworks = {};
    for (const pattern of this.library.patterns) {
      if (!this.library.frameworks[pattern.framework]) {
        this.library.frameworks[pattern.framework] = {
          name: pattern.framework,
          version: 'latest',
          pattern_count: 0
        };
      }
      this.library.frameworks[pattern.framework].pattern_count++;
    }

    this.library.last_updated = new Date().toISOString();
  }

  /**
   * 라이브러리 저장
   */
  private async save(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.libraryPath));
      await fs.writeJson(this.libraryPath, this.library, { spaces: 2 });
    } catch (error) {
      console.error('[PatternLibrary] Failed to save library:', error);
    }
  }

  /**
   * 패턴 통계
   */
  getStatistics() {
    return {
      total_patterns: this.library.patterns.length,
      categories: Object.keys(this.library.categories).length,
      frameworks: Object.keys(this.library.frameworks).length,
      most_used: this.library.patterns
        .sort((a, b) => b.usage_count - a.usage_count)
        .slice(0, 5),
      success_rates: {
        high: this.library.patterns.filter(p => p.success_rate > 0.8).length,
        medium: this.library.patterns.filter(p => p.success_rate > 0.5 && p.success_rate <= 0.8).length,
        low: this.library.patterns.filter(p => p.success_rate <= 0.5).length
      }
    };
  }
}