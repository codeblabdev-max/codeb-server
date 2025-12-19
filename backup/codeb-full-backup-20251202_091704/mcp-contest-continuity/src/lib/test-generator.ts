/**
 * Test Document Generator
 * 
 * Context 유지 상태에서 자동 테스트 문서 생성
 * - UI/API/DB/통합 테스트 항목 자동 생성
 * - Context 기반 테스트 케이스 추천
 * - 마크다운 형식 테스트 문서 출력
 */

import fs from 'fs-extra';
import path from 'path';
import { ContestContext } from './context-manager.js';

interface ComponentInfo {
  type: 'ui' | 'api' | 'database' | 'integration';
  name: string;
  file_path?: string;
  metadata?: any;
}

interface TestGenerationOptions {
  test_type: 'unit' | 'integration' | 'e2e' | 'comprehensive';
  include_examples: boolean;
  context_aware: boolean;
  auto_update: boolean;
}

export class TestDocumentGenerator {
  private templatesDir: string;

  constructor(templatesDir: string = './test-templates') {
    this.templatesDir = templatesDir;
    this.ensureTemplates();
  }

  private async ensureTemplates(): Promise<void> {
    await fs.ensureDir(this.templatesDir);
    await this.createDefaultTemplates();
  }

  /**
   * Context 유지 상태에서 테스트 문서 자동 생성
   */
  async generateTestDocument(
    componentInfo: ComponentInfo, 
    contextData?: any,
    options: Partial<TestGenerationOptions> = {}
  ): Promise<string> {
    const opts: TestGenerationOptions = {
      test_type: 'comprehensive',
      include_examples: true,
      context_aware: true,
      auto_update: true,
      ...options
    };

    console.log(`[Test Generator] Generating ${componentInfo.type} tests for: ${componentInfo.name}`);

    switch (componentInfo.type) {
      case 'ui':
        return await this.generateUITests(componentInfo, contextData, opts);
      case 'api':
        return await this.generateAPITests(componentInfo, contextData, opts);
      case 'database':
        return await this.generateDatabaseTests(componentInfo, contextData, opts);
      case 'integration':
        return await this.generateIntegrationTests(componentInfo, contextData, opts);
      default:
        throw new Error(`Unknown component type: ${componentInfo.type}`);
    }
  }

  /**
   * UI 컴포넌트 테스트 생성
   */
  private async generateUITests(
    componentInfo: ComponentInfo, 
    contextData: any, 
    options: TestGenerationOptions
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const contextInfo = this.extractUIContextInfo(componentInfo, contextData);
    
    let testDocument = `# UI 컴포넌트 테스트 - ${componentInfo.name}

## 🎯 테스트 항목 자동 생성
**생성 시점**: ${timestamp}  
**Context 정보**: ${contextInfo.description}
- 컴포넌트 타입: ${contextInfo.component_type}
- 파일 경로: ${componentInfo.file_path || 'N/A'}
- CSS 클래스: ${contextInfo.css_classes.join(', ') || 'N/A'}
- 이벤트 핸들러: ${contextInfo.event_handlers.join(', ') || 'N/A'}
- 상태 관리: ${contextInfo.state_management.join(', ') || 'N/A'}

## 📋 테스트 케이스

### 렌더링 테스트
- [ ] 컴포넌트 기본 렌더링 확인
- [ ] Props 전달 시 올바른 렌더링
- [ ] 조건부 렌더링 동작 확인
- [ ] 기본 CSS 클래스 적용 확인`;

    // CSS 클래스별 테스트 추가
    if (contextInfo.css_classes.length > 0) {
      testDocument += `\n\n### CSS 클래스 테스트`;
      for (const cssClass of contextInfo.css_classes) {
        testDocument += `\n- [ ] ${cssClass} 클래스 적용 확인`;
        testDocument += `\n- [ ] ${cssClass} 스타일 동작 검증`;
      }
    }

    // 이벤트 핸들러 테스트 추가
    if (contextInfo.event_handlers.length > 0) {
      testDocument += `\n\n### 이벤트 핸들러 테스트`;
      for (const handler of contextInfo.event_handlers) {
        testDocument += `\n- [ ] ${handler} 이벤트 핸들러 동작`;
        testDocument += `\n- [ ] ${handler} 콜백 함수 실행 확인`;
      }
    }

    // 상태 관리 테스트 추가
    if (contextInfo.state_management.length > 0) {
      testDocument += `\n\n### 상태 관리 테스트`;
      for (const stateItem of contextInfo.state_management) {
        testDocument += `\n- [ ] ${stateItem} 상태 초기화`;
        testDocument += `\n- [ ] ${stateItem} 상태 업데이트`;
        testDocument += `\n- [ ] ${stateItem} 상태 변경 시 리렌더링`;
      }
    }

    // 접근성 테스트
    testDocument += `\n\n### 접근성 테스트
- [ ] ARIA 라벨 적용 확인
- [ ] 키보드 네비게이션 지원
- [ ] 스크린 리더 호환성
- [ ] 색상 대비 기준 준수
- [ ] 포커스 관리 확인`;

    // 반응형 테스트
    if (contextInfo.responsive_indicators.length > 0) {
      testDocument += `\n\n### 반응형 테스트
- [ ] 모바일 뷰포트 (320px-768px)
- [ ] 태블릿 뷰포트 (768px-1024px) 
- [ ] 데스크톱 뷰포트 (1024px+)
- [ ] 브레이크포인트 전환 동작`;
    }

    // Context 기반 추가 테스트
    if (options.context_aware && contextData?.related_components) {
      testDocument += `\n\n### 컴포넌트 통합 테스트`;
      for (const relatedComponent of contextData.related_components) {
        testDocument += `\n- [ ] ${relatedComponent} 와의 상호작용`;
      }
    }

    testDocument += `\n\n---
**자동 생성**: MCP Context 유지 상태에서 자동 생성  
**마지막 업데이트**: ${timestamp}  
**테스트 타입**: ${options.test_type}`;

    return testDocument;
  }

  /**
   * API 엔드포인트 테스트 생성  
   */
  private async generateAPITests(
    componentInfo: ComponentInfo,
    contextData: any,
    options: TestGenerationOptions
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const contextInfo = this.extractAPIContextInfo(componentInfo, contextData);

    let testDocument = `# API 엔드포인트 테스트 - ${componentInfo.name}

## 🎯 테스트 항목 자동 생성
**생성 시점**: ${timestamp}  
**Context 정보**: 
- 엔드포인트: ${contextInfo.endpoint}
- HTTP 메서드: ${contextInfo.methods.join(', ')}
- 파라미터: ${contextInfo.parameters.join(', ') || 'N/A'}
- 응답 형식: ${contextInfo.response_format}
- 인증 필요: ${contextInfo.requires_auth ? 'Yes' : 'No'}

## 📋 테스트 케이스`;

    // HTTP 메서드별 테스트 생성
    for (const method of contextInfo.methods) {
      testDocument += `\n\n### ${method} ${contextInfo.endpoint}`;
      
      // 기본 테스트
      testDocument += `\n- [ ] ${method} 요청 처리 확인`;
      testDocument += `\n- [ ] 올바른 상태 코드 응답 (200/201)`;
      testDocument += `\n- [ ] 응답 헤더 확인`;
      testDocument += `\n- [ ] 응답 본문 구조 검증`;

      // 파라미터 테스트
      if (contextInfo.parameters.length > 0) {
        testDocument += `\n\n#### 파라미터 테스트`;
        for (const param of contextInfo.parameters) {
          testDocument += `\n- [ ] ${param} 파라미터 필수 여부 확인`;
          testDocument += `\n- [ ] ${param} 파라미터 유효성 검사`;
          testDocument += `\n- [ ] ${param} 파라미터 타입 검증`;
        }
      }

      // 에러 케이스 테스트
      testDocument += `\n\n#### 에러 케이스 테스트`;
      testDocument += `\n- [ ] 잘못된 파라미터 (400 Bad Request)`;
      testDocument += `\n- [ ] 존재하지 않는 리소스 (404 Not Found)`;
      testDocument += `\n- [ ] 서버 에러 처리 (500 Internal Server Error)`;

      // 인증 테스트
      if (contextInfo.requires_auth) {
        testDocument += `\n\n#### 인증/권한 테스트`;
        testDocument += `\n- [ ] 인증 토큰 없이 요청 (401 Unauthorized)`;
        testDocument += `\n- [ ] 유효하지 않은 토큰 (401 Unauthorized)`;
        testDocument += `\n- [ ] 권한 부족 (403 Forbidden)`;
        testDocument += `\n- [ ] 유효한 토큰으로 요청 성공`;
      }
    }

    // 성능 테스트
    testDocument += `\n\n### 성능 테스트
- [ ] 응답 시간 기준 (< 200ms)
- [ ] 대용량 요청 처리
- [ ] 동시 요청 처리 능력
- [ ] 메모리 사용량 모니터링`;

    // 보안 테스트
    testDocument += `\n\n### 보안 테스트
- [ ] SQL Injection 방어
- [ ] XSS 공격 방어  
- [ ] CSRF 토큰 검증
- [ ] Rate Limiting 확인
- [ ] 입력 데이터 검증`;

    // Context 기반 추가 테스트
    if (options.context_aware && contextData?.database_operations) {
      testDocument += `\n\n### 데이터베이스 연동 테스트`;
      for (const operation of contextData.database_operations) {
        testDocument += `\n- [ ] ${operation} 데이터베이스 작업 확인`;
      }
    }

    testDocument += `\n\n---
**자동 생성**: MCP Context 유지 상태에서 자동 생성  
**마지막 업데이트**: ${timestamp}  
**테스트 타입**: ${options.test_type}`;

    return testDocument;
  }

  /**
   * 데이터베이스 테스트 생성
   */
  private async generateDatabaseTests(
    componentInfo: ComponentInfo,
    contextData: any,
    options: TestGenerationOptions
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const contextInfo = this.extractDatabaseContextInfo(componentInfo, contextData);

    let testDocument = `# 데이터베이스 테스트 - ${componentInfo.name}

## 🎯 테스트 항목 자동 생성
**생성 시점**: ${timestamp}  
**Context 정보**:
- 테이블명: ${componentInfo.name}
- 컬럼: ${contextInfo.columns.join(', ') || 'N/A'}
- 인덱스: ${contextInfo.indexes.join(', ') || 'N/A'}
- 관계: ${contextInfo.relationships.join(', ') || 'N/A'}

## 📋 테스트 케이스

### 스키마 테스트
- [ ] 테이블 생성 확인
- [ ] 필수 컬럼 존재 확인`;

    // 컬럼별 테스트
    if (contextInfo.columns.length > 0) {
      testDocument += `\n\n### 컬럼 테스트`;
      for (const column of contextInfo.columns) {
        testDocument += `\n- [ ] ${column} 컬럼 타입 검증`;
        testDocument += `\n- [ ] ${column} 컬럼 제약조건 확인`;
      }
    }

    // 인덱스 테스트
    if (contextInfo.indexes.length > 0) {
      testDocument += `\n\n### 인덱스 테스트`;
      for (const index of contextInfo.indexes) {
        testDocument += `\n- [ ] ${index} 인덱스 생성 확인`;
        testDocument += `\n- [ ] ${index} 인덱스 성능 검증`;
      }
    }

    // CRUD 테스트
    testDocument += `\n\n### CRUD 작업 테스트
- [ ] CREATE: 새 레코드 생성
- [ ] READ: 레코드 조회 (단일/복수)
- [ ] UPDATE: 레코드 수정
- [ ] DELETE: 레코드 삭제`;

    // 관계 테스트
    if (contextInfo.relationships.length > 0) {
      testDocument += `\n\n### 관계 테스트`;
      for (const relationship of contextInfo.relationships) {
        testDocument += `\n- [ ] ${relationship} 관계 데이터 조회`;
        testDocument += `\n- [ ] ${relationship} 외래키 제약조건`;
      }
    }

    // 데이터 무결성 테스트
    testDocument += `\n\n### 데이터 무결성 테스트
- [ ] 중복 데이터 방지
- [ ] NULL 값 처리
- [ ] 기본값 설정 확인
- [ ] 데이터 타입 검증`;

    // 성능 테스트
    testDocument += `\n\n### 성능 테스트
- [ ] 대용량 데이터 조회 성능
- [ ] 복합 쿼리 실행 시간
- [ ] 인덱스 효율성 검증
- [ ] 동시성 제어 확인`;

    testDocument += `\n\n---
**자동 생성**: MCP Context 유지 상태에서 자동 생성  
**마지막 업데이트**: ${timestamp}  
**테스트 타입**: ${options.test_type}`;

    return testDocument;
  }

  /**
   * 통합 테스트 생성
   */
  private async generateIntegrationTests(
    componentInfo: ComponentInfo,
    contextData: any,
    options: TestGenerationOptions
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const contextInfo = this.extractIntegrationContextInfo(componentInfo, contextData);

    let testDocument = `# 통합 테스트 - ${componentInfo.name}

## 🎯 테스트 항목 자동 생성
**생성 시점**: ${timestamp}  
**Context 정보**:
- 통합 플로우: ${componentInfo.name}
- 관련 컴포넌트: ${contextInfo.components.join(', ') || 'N/A'}
- 관련 API: ${contextInfo.apis.join(', ') || 'N/A'}
- 관련 DB: ${contextInfo.database_tables.join(', ') || 'N/A'}

## 📋 E2E 테스트 시나리오

### 메인 사용자 플로우`;

    // 사용자 플로우 단계별 테스트
    if (contextInfo.user_journey.length > 0) {
      for (let i = 0; i < contextInfo.user_journey.length; i++) {
        const step = contextInfo.user_journey[i];
        testDocument += `\n${i + 1}. [ ] ${step}`;
      }
    } else {
      testDocument += `\n1. [ ] 초기 페이지 로드 확인
2. [ ] 사용자 입력 처리
3. [ ] API 요청 실행  
4. [ ] 데이터베이스 업데이트
5. [ ] 결과 표시 확인`;
    }

    // 컴포넌트 통합 테스트
    if (contextInfo.components.length > 0) {
      testDocument += `\n\n### 컴포넌트 통합 테스트`;
      for (const component of contextInfo.components) {
        testDocument += `\n- [ ] ${component} 컴포넌트 렌더링`;
        testDocument += `\n- [ ] ${component} 이벤트 처리`;
      }
    }

    // API 통합 테스트
    if (contextInfo.apis.length > 0) {
      testDocument += `\n\n### API 통합 테스트`;
      for (const api of contextInfo.apis) {
        testDocument += `\n- [ ] ${api} API 호출 성공`;
        testDocument += `\n- [ ] ${api} 응답 데이터 처리`;
      }
    }

    // 데이터베이스 통합 테스트
    if (contextInfo.database_tables.length > 0) {
      testDocument += `\n\n### 데이터베이스 통합 테스트`;
      for (const table of contextInfo.database_tables) {
        testDocument += `\n- [ ] ${table} 테이블 데이터 일관성`;
        testDocument += `\n- [ ] ${table} 트랜잭션 처리`;
      }
    }

    // 에러 시나리오 테스트
    testDocument += `\n\n### 에러 시나리오 테스트
- [ ] 네트워크 오류 처리
- [ ] API 서버 오류 응답
- [ ] 데이터베이스 연결 실패
- [ ] 사용자 입력 오류 처리
- [ ] 세션 만료 처리`;

    // 성능 통합 테스트
    testDocument += `\n\n### 성능 통합 테스트
- [ ] 전체 플로우 완료 시간 측정
- [ ] 메모리 사용량 모니터링
- [ ] 네트워크 요청 최적화 확인
- [ ] 동시 사용자 처리 능력`;

    testDocument += `\n\n---
**자동 생성**: MCP Context 유지 상태에서 자동 생성  
**마지막 업데이트**: ${timestamp}  
**테스트 타입**: ${options.test_type}`;

    return testDocument;
  }

  /**
   * 테스트 템플릿 리소스 접근
   */
  async getTemplateResource(uri: string): Promise<any> {
    const uriParts = uri.replace('test-templates://', '').split('/');
    const [templateType, ...params] = uriParts;

    switch (templateType) {
      case 'ui':
        return await this.getUITemplate(params[0]);
      case 'api':
        return await this.getAPITemplate(params[0]);
      case 'database':
        return await this.getDatabaseTemplate(params[0]);
      case 'integration':
        return await this.getIntegrationTemplate(params[0]);
      default:
        return await this.getAllTemplates();
    }
  }

  // Context 정보 추출 헬퍼 메서드들
  private extractUIContextInfo(componentInfo: ComponentInfo, contextData: any): any {
    return {
      description: `${componentInfo.name} UI 컴포넌트`,
      component_type: contextData?.component_type || 'functional',
      css_classes: contextData?.css_classes || [],
      event_handlers: contextData?.event_handlers || [],
      state_management: contextData?.state_management || [],
      responsive_indicators: contextData?.responsive_indicators || []
    };
  }

  private extractAPIContextInfo(componentInfo: ComponentInfo, contextData: any): any {
    return {
      endpoint: contextData?.endpoint || `/api/${componentInfo.name}`,
      methods: contextData?.methods || ['GET', 'POST'],
      parameters: contextData?.parameters || [],
      response_format: contextData?.response_format || 'json',
      requires_auth: contextData?.requires_auth || false
    };
  }

  private extractDatabaseContextInfo(componentInfo: ComponentInfo, contextData: any): any {
    return {
      columns: contextData?.columns || [],
      indexes: contextData?.indexes || [],
      relationships: contextData?.relationships || []
    };
  }

  private extractIntegrationContextInfo(componentInfo: ComponentInfo, contextData: any): any {
    return {
      components: contextData?.components || [],
      apis: contextData?.apis || [],
      database_tables: contextData?.database_tables || [],
      user_journey: contextData?.user_journey || []
    };
  }

  // 템플릿 관련 메서드들
  private async createDefaultTemplates(): Promise<void> {
    const templates = {
      ui: 'UI 컴포넌트 테스트 템플릿',
      api: 'API 엔드포인트 테스트 템플릿', 
      database: '데이터베이스 테스트 템플릿',
      integration: '통합 테스트 템플릿'
    };

    for (const [type, description] of Object.entries(templates)) {
      const templateFile = path.join(this.templatesDir, `${type}-template.md`);
      if (!await fs.pathExists(templateFile)) {
        await fs.writeFile(templateFile, `# ${description}\n\n기본 템플릿 내용...`);
      }
    }
  }

  private async getUITemplate(componentName?: string): Promise<any> {
    const templateFile = path.join(this.templatesDir, 'ui-template.md');
    if (await fs.pathExists(templateFile)) {
      const content = await fs.readFile(templateFile, 'utf-8');
      return { 
        content: componentName ? content.replace(/\{component_name\}/g, componentName) : content,
        mimeType: 'text/markdown'
      };
    }
    return { content: '# UI 테스트 템플릿\n\n기본 템플릿...', mimeType: 'text/markdown' };
  }

  private async getAPITemplate(endpointName?: string): Promise<any> {
    const templateFile = path.join(this.templatesDir, 'api-template.md');
    if (await fs.pathExists(templateFile)) {
      const content = await fs.readFile(templateFile, 'utf-8');
      return { 
        content: endpointName ? content.replace(/\{endpoint_name\}/g, endpointName) : content,
        mimeType: 'text/markdown'
      };
    }
    return { content: '# API 테스트 템플릿\n\n기본 템플릿...', mimeType: 'text/markdown' };
  }

  private async getDatabaseTemplate(tableName?: string): Promise<any> {
    const templateFile = path.join(this.templatesDir, 'database-template.md');
    if (await fs.pathExists(templateFile)) {
      const content = await fs.readFile(templateFile, 'utf-8');
      return { 
        content: tableName ? content.replace(/\{table_name\}/g, tableName) : content,
        mimeType: 'text/markdown'
      };
    }
    return { content: '# 데이터베이스 테스트 템플릿\n\n기본 템플릿...', mimeType: 'text/markdown' };
  }

  private async getIntegrationTemplate(flowName?: string): Promise<any> {
    const templateFile = path.join(this.templatesDir, 'integration-template.md');
    if (await fs.pathExists(templateFile)) {
      const content = await fs.readFile(templateFile, 'utf-8');
      return { 
        content: flowName ? content.replace(/\{flow_name\}/g, flowName) : content,
        mimeType: 'text/markdown'
      };
    }
    return { content: '# 통합 테스트 템플릿\n\n기본 템플릿...', mimeType: 'text/markdown' };
  }

  private async getAllTemplates(): Promise<any> {
    const templates = {};
    const templateFiles = await fs.readdir(this.templatesDir);
    
    for (const file of templateFiles) {
      if (file.endsWith('.md')) {
        const templateName = file.replace('-template.md', '');
        const content = await fs.readFile(path.join(this.templatesDir, file), 'utf-8');
        templates[templateName] = content;
      }
    }
    
    return { templates, mimeType: 'application/json' };
  }
}