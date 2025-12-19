# MCP Contest Continuity Server

**바이브 코딩 컨테스트 연속성을 위한 Model Context Protocol (MCP) 서버**

## 🎯 개요

이 MCP 서버는 코딩 컨테스트가 중단되었을 때도 마치 "컨테스트가 계속 진행되는 것처럼" 개발 Context를 완벽하게 보존하고 복원하는 시스템입니다.

### 핵심 기능

- **🔄 Context 영속화**: 개발 중 축적된 모든 Context 정보 보존
- **🤖 자동 트리거**: 코드 생성 → 테스트 문서 자동 업데이트 
- **🔗 MCP 통합**: Sequential, Context7 서버와 완벽 연동
- **⚡ 완전 자동화**: 수동 개입 없이 모든 시스템 자동 작동
- **🏆 컨테스트 연속성**: 언제든지 중단된 지점부터 즉시 재개

### 🚀 새로운 고급 기능

- **📦 의존성 분석**: 중복 패키지 탐지, 자동 정리, 버전 충돌 해결
- **🎨 패턴 라이브러리**: 자동 코드 패턴 추출 및 재사용 템플릿 생성
- **🔄 멀티 프로젝트 동기화**: 프로젝트 간 Context 공유 및 설정 동기화
- **👁️ 실시간 모니터링**: 코드 변경 감지, 복잡도 분석, 자동 문서화
- **🤝 Sub-Agent 위임**: 복잡한 작업을 여러 전문 에이전트에게 병렬 처리

## 📁 프로젝트 구조

```
mcp-contest-continuity/
├── package.json              # MCP 서버 설정
├── tsconfig.json             # TypeScript 설정
├── README.md                 # 프로젝트 문서
├── src/
│   ├── index.ts             # MCP 서버 메인 진입점
│   ├── types/
│   │   └── index.ts         # TypeScript 타입 정의
│   ├── lib/                 # 핵심 라이브러리
│   │   ├── context-manager.ts        # Context 영속화 시스템
│   │   ├── test-generator.ts         # 자동 테스트 문서 생성
│   │   ├── version-manager.ts        # 문서 버전 관리 (500줄 자동 분할)
│   │   ├── mcp-coordinator.ts        # MCP 서버 통합 조정
│   │   ├── development-tracker.ts    # 실시간 개발 추적
│   │   ├── automation-engine.ts      # 완전 자동화 엔진
│   │   ├── dependency-analyzer.ts    # 의존성 분석 및 정리
│   │   ├── pattern-library.ts        # 패턴 추출 및 라이브러리 관리
│   │   ├── multi-project-sync.ts     # 다중 프로젝트 동기화
│   │   ├── real-time-monitor.ts      # 실시간 코드 모니터링
│   │   └── sub-agent-delegation.ts   # Sub-Agent 작업 위임 시스템
│   └── tools/               # MCP 도구 구현
│       ├── index.ts         # 도구 내보내기
│       ├── capture-context.ts        # Context 캡처 도구
│       ├── resume-context.ts         # Context 복원 도구
│       ├── generate-test-document.ts # 테스트 문서 생성 도구
│       ├── track-development.ts      # 개발 추적 도구
│       ├── manage-document-versions.ts # 문서 버전 관리 도구
│       ├── coordinate-integration.ts # MCP 통합 조정 도구
│       ├── analyze-dependencies.ts  # 의존성 분석 도구
│       ├── manage-patterns.ts       # 패턴 라이브러리 도구
│       ├── sync-projects.ts         # 프로젝트 동기화 도구
│       ├── monitor-realtime.ts      # 실시간 모니터링 도구
│       └── delegate-tasks.ts        # Sub-Agent 위임 도구
└── dist/                    # 빌드 결과물
```

## 🚀 설치 및 실행

### 1. 의존성 설치

```bash
cd mcp-contest-continuity
npm install
```

### 2. TypeScript 컴파일

```bash
npm run build
```

### 3. MCP 서버 실행

```bash
npm start
```

### 4. Claude Desktop 설정

Claude Desktop의 `claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "contest-continuity": {
      "command": "node",
      "args": ["/path/to/mcp-contest-continuity/dist/index.js"],
      "env": {}
    }
  }
}
```

## 🛠️ MCP 도구

### 기본 Core 도구

### 1. capture_context
개발 Context를 캡처하고 영속화합니다.

```typescript
await capture_context({
  projectPath: "/path/to/project",
  contextName: "feature-implementation",
  includeTests: true,
  analyzePatterns: true
});
```

### 2. resume_context  
저장된 Context를 복원하고 개발을 재개합니다.

```typescript
await resume_context({
  contextId: "context_123456789",
  projectPath: "/path/to/project",
  generateRecommendations: true,
  updateContext: false
});
```

### 3. generate_test_document
Context 기반으로 포괄적인 테스트 문서를 생성합니다.

```typescript
await generate_test_document({
  contextId: "context_123456789", 
  outputPath: "./tests/generated-tests.md",
  testTypes: ["ui", "api", "integration"],
  includeSetup: true,
  generateMockData: true
});
```

### 4. track_development
실시간으로 개발 진행상황을 추적합니다.

```typescript
await track_development({
  projectPath: "/path/to/project",
  action: "start",
  contextId: "context_123456789",
  snapshotInterval: 300000
});
```

### 5. manage_document_versions
문서 버전을 관리하고 500줄 자동 분할을 수행합니다.

```typescript
await manage_document_versions({
  action: "backup",
  documentPath: "./docs/test-document.md",
  reason: "Before major changes",
  splitThreshold: 500
});
```

### 6. coordinate_integration
Sequential, Context7 등 다른 MCP 서버와 통합 작업을 조정합니다.

```typescript
await coordinate_integration({
  operation: "analyze",
  context: {
    projectPath: "/path/to/project",
    framework: "Next.js",
    description: "E-commerce application"
  },
  servers: ["sequential", "context7"]
});
```

### 🚀 새로운 고급 도구

### 7. analyze_dependencies
프로젝트 의존성을 분석하고 중복 제거, 버전 충돌 해결을 수행합니다.

```typescript
// 의존성 분석
await analyze_dependencies({
  operation: "analyze",
  project_path: "./my-project",
  analysis_options: {
    include_dev_deps: true,
    check_vulnerabilities: true,
    deep_analysis: true
  }
});

// 중복 패키지 탐지
await analyze_dependencies({
  operation: "detect_duplicates", 
  project_path: "./my-project"
});

// 자동 정리
await analyze_dependencies({
  operation: "cleanup",
  project_path: "./my-project",
  analysis_options: {
    auto_cleanup: true
  }
});
```

### 8. manage_patterns
코드 패턴을 자동 추출하고 재사용 가능한 템플릿을 관리합니다.

```typescript
// 패턴 추출
await manage_patterns({
  operation: "extract",
  project_path: "./my-project",
  pattern_types: ["component", "api", "hook"],
  extraction_options: {
    min_complexity: 5,
    include_tests: true,
    auto_categorize: true
  }
});

// 패턴 검색
await manage_patterns({
  operation: "search",
  search_query: "authentication hook",
  project_path: "./my-project"
});

// 패턴 적용
await manage_patterns({
  operation: "apply",
  project_path: "./new-project",
  pattern_types: ["component"]
});
```

### 9. sync_projects
여러 프로젝트 간의 Context와 설정을 동기화합니다.

```typescript
// 프로젝트 등록
await sync_projects({
  operation: "register",
  project_path: "./project-a",
  project_name: "E-commerce Frontend",
  framework: "Next.js"
});

// 프로젝트 동기화
await sync_projects({
  operation: "sync",
  source_project_id: "project_a",
  target_project_id: "project_b",
  sync_options: {
    include_patterns: true,
    include_configurations: true,
    auto_resolve_conflicts: false
  }
});

// Context 공유
await sync_projects({
  operation: "share_context",
  source_project_id: "project_a",
  target_projects: ["project_b", "project_c"],
  context_type: "pattern"
});
```

### 10. monitor_realtime
실시간으로 코드 변경을 감지하고 자동 분석을 수행합니다.

```typescript
// 모니터링 시작
await monitor_realtime({
  operation: "start",
  project_path: "./my-project",
  config: {
    watch_patterns: ["**/*.tsx", "**/*.ts", "**/*.js"],
    ignore_patterns: ["**/node_modules/**", "**/dist/**"],
    debounce_ms: 500,
    auto_actions: {
      generate_tests: true,
      update_documentation: true,
      extract_patterns: true
    }
  }
});

// 변경 히스토리 조회
await monitor_realtime({
  operation: "history",
  history_filter: {
    since: "2024-01-01",
    file_type: "code",
    limit: 100
  }
});

// 통계 조회
await monitor_realtime({
  operation: "statistics"
});
```

### 11. delegate_tasks
복잡한 작업을 전문 Sub-Agent들에게 병렬로 위임 처리합니다.

```typescript
// Agent 등록
await delegate_tasks({
  operation: "register_agent",
  agent_config: {
    name: "security-analyzer",
    type: "analyzer",
    specialization: ["security", "vulnerability"],
    capabilities: ["code-analysis", "threat-detection"]
  }
});

// 복잡한 작업 위임
await delegate_tasks({
  operation: "delegate_task", 
  task_description: "Comprehensive security audit of authentication system",
  task_input: {
    project_path: "./my-project",
    focus_areas: ["auth", "api", "database"]
  },
  delegation_options: {
    strategy: "parallel_focus",
    max_parallel_tasks: 5,
    timeout: 300000
  }
});

// 결과 조회
await delegate_tasks({
  operation: "get_results",
  task_group_id: "task_group_12345"
});

// 시스템 상태 확인
await delegate_tasks({
  operation: "get_status"
});
```

## 🎪 바이브 컨테스트 연속성

### 핵심 개념
- **Context Database**: 모든 개발 Context가 JSON 파일로 영속화
- **Pattern Recognition**: 코드 패턴과 아키텍처 자동 인식
- **Auto-Restoration**: 프로젝트 상태를 정확히 복원
- **Workflow Automation**: 개발 → 테스트 → 문서화 자동화

### 사용 시나리오

#### 1. 컨테스트 중단 시
```typescript
// Context 자동 캡처 (개발 추적 중이면 자동 실행)
await capture_context({
  projectPath: "./my-project",
  contextName: "contest-checkpoint-1"
});
```

#### 2. 컨테스트 재개 시  
```typescript
// Context 복원으로 즉시 재개
await resume_context({
  contextId: "contest-checkpoint-1",
  projectPath: "./my-project",
  generateRecommendations: true
});
```

#### 3. 자동 테스트 문서 업데이트
```typescript
// 코드 변경 시 자동 트리거됨
await generate_test_document({
  contextId: "contest-checkpoint-1",
  outputPath: "./docs/tests.md",
  testTypes: ["ui", "api", "integration"]
});
```

## 🔧 설정

### 환경 변수

```bash
# Context 저장 경로
MCP_CONTEXT_DB_PATH="./data/contexts"

# 버전 관리 디렉토리  
MCP_VERSIONS_PATH="./data/versions"

# 스냅샷 저장 경로
MCP_SNAPSHOTS_PATH="./data/snapshots"

# 자동화 활성화
MCP_ENABLE_AUTOMATION="true"

# 디버그 모드
MCP_DEBUG_MODE="false"
```

### 기본 워크플로우

서버는 다음 자동화 워크플로우를 제공합니다:

1. **코드→테스트 자동화**: 코드 변경 감지 → 테스트 문서 업데이트
2. **Context 영속화**: 정기적 Context 스냅샷 및 백업
3. **MCP 통합**: Sequential, Context7과의 자동 협업
4. **문서 관리**: 500줄 초과 시 자동 문서 분할

## 🤝 MCP 서버 연동

### Sequential 연동
- 복잡한 분석 작업 위임
- 시스템적 사고가 필요한 Context 복원
- 단계별 문제 해결 과정

### Context7 연동  
- 프레임워크 패턴 및 베스트 프랙티스
- 라이브러리 문서 참조
- 코드 예제 및 구현 가이드

### 통합 워크플로우
```typescript
// 여러 MCP 서버와 협업하여 종합적인 분석 수행
await coordinate_integration({
  operation: "implement",
  context: { 
    projectPath: "./project",
    framework: "Next.js"
  },
  servers: ["sequential", "context7", "magic"]
});
```

## 📊 모니터링 및 로깅

서버는 다음 메트릭스를 추적합니다:

- Context 캡처/복원 성공률
- 테스트 문서 생성 통계  
- MCP 서버 연동 성능
- 자동화 워크플로우 실행 현황
- 평균 응답 시간
- 의존성 분석 및 정리 통계
- 패턴 추출 및 재사용률
- 프로젝트 동기화 성공률
- 실시간 모니터링 이벤트 수
- Sub-Agent 작업 위임 처리량

## 🔍 문제 해결

### 자주 발생하는 문제

1. **Context 캡처 실패**
   - 프로젝트 경로 확인
   - 파일 시스템 권한 검증
   - 디스크 공간 확인

2. **MCP 서버 연동 오류**
   - 다른 MCP 서버 실행 상태 확인
   - 네트워크 연결 상태 점검
   - 타임아웃 설정 조정

3. **자동화 워크플로우 중단**
   - 로그 파일 확인 (`./logs/automation.log`)
   - 환경 변수 설정 검증
   - 의존성 설치 상태 점검

## 📄 라이센스

MIT License

## 👥 기여

Issue와 PR을 환영합니다!

---

**🏆 바이브 코딩 컨테스트의 연속성을 완벽하게 보장하는 고급 MCP 서버입니다!**

이제 11개의 강력한 도구로 컨테스트 연속성, 의존성 관리, 패턴 라이브러리, 멀티 프로젝트 동기화, 실시간 모니터링, Sub-Agent 병렬 처리까지 모든 개발 워크플로우를 자동화합니다.