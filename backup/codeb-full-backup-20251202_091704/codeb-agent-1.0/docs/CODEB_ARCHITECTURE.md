# CodeB Enterprise Architecture Documentation

## 🏗️ 전체 시스템 아키텍처

```mermaid
graph TB
    subgraph "CodeB Platform"
        User[사용자/개발자]
        
        subgraph "Command Layer"
            CMD[@codeb- Commands]
            CC[Claude Code]
        end
        
        subgraph "Agent Orchestra (49 Agents)"
            ORC[👑 Orchestrator]
            
            subgraph "Domain Leads"
                FL[🎯 Frontend Lead]
                BL[🎯 Backend Lead]
                IL[🎯 Infrastructure Lead]
                QL[🎯 Quality Lead]
            end
            
            subgraph "Specialists (11)"
                RS[React Specialist]
                AS[API Specialist]
                DS[DB Specialist]
                PS[Podman Specialist]
                TS[Test Specialist]
                Others[+6 Others]
            end
            
            subgraph "Workers (33)"
                W1[Worker 1-33]
            end
        end
        
        subgraph "MCP Integration"
            MCC[Contest Continuity]
            SEQ[Sequential Thinking]
            C7[Context7]
            SHR[Shrimp Task Manager]
        end
        
        subgraph "Project Layer"
            CP[.codeb-checkpoint/]
            SRC[Source Code]
            SCRIPTS[Automation Scripts]
        end
    end
    
    User --> CMD
    CMD --> ORC
    ORC --> FL & BL & IL & QL
    FL --> RS
    BL --> AS & DS
    IL --> PS
    QL --> TS
    RS & AS & DS & PS & TS --> W1
    
    ORC <--> MCC
    FL & BL <--> SEQ
    RS & AS <--> C7
    QL <--> SHR
    
    MCC --> CP
    W1 --> SRC
```

## 📂 디렉토리 구조 상세

```
/codeb-server/
│
├── 📁 .codeb-checkpoint/              # CodeB 체크포인트 (필수)
│   ├── 📄 context.json                # 프로젝트 컨텍스트
│   ├── 📄 patterns.json               # 재사용 패턴 라이브러리
│   ├── 📄 dependencies.lock           # 의존성 잠금 파일
│   ├── 📄 agents.json                 # 에이전트 상태 추적
│   ├── 📄 mcp-sync.json              # MCP 서버 동기화 정보
│   ├── 📄 init.sh                    # 초기화 스크립트
│   ├── 📄 monitor.config.json        # 모니터링 설정
│   ├── 📄 quickstart.md              # 빠른 시작 가이드
│   └── 📁 snapshots/                 # 시점별 백업
│       ├── 2024-01-01-init/
│       ├── 2024-01-02-optimize/
│       └── current/
│
├── 📁 mcp-contest-continuity/         # MCP 서버
│   ├── 📁 src/
│   │   ├── index.ts                  # MCP 서버 메인
│   │   ├── 📁 lib/
│   │   │   ├── hierarchical-agent-system.ts  # 49개 에이전트 시스템
│   │   │   ├── context-manager.ts            # 컨텍스트 관리
│   │   │   ├── test-generator.ts             # 테스트 자동 생성
│   │   │   ├── version-manager.ts            # 버전 관리
│   │   │   ├── mcp-coordinator.ts            # MCP 조정
│   │   │   ├── development-tracker.ts        # 개발 추적
│   │   │   └── automation-engine.ts          # 자동화 엔진
│   │   └── 📁 tools/
│   │       ├── analyze-dependencies.ts       # 의존성 분석
│   │       ├── manage-patterns.ts            # 패턴 관리
│   │       ├── sync-projects.ts              # 프로젝트 동기화
│   │       ├── monitor-realtime.ts           # 실시간 모니터링
│   │       └── delegate-tasks.ts             # 작업 위임
│   ├── 📁 dist/                      # 빌드 결과물
│   └── package.json
│
├── 📁 scripts/                        # 자동화 스크립트
│   ├── init-agent-hierarchy.sh       # 에이전트 계층 초기화
│   ├── sub-agent-manager.sh          # Sub-Agent 관리
│   ├── intelligent-workflow.sh       # 지능형 워크플로우
│   └── claude-code-integration.md    # 통합 가이드
│
├── 📁 src/                           # 소스 코드
│   ├── 📁 frontend/                 # Next.js/React
│   ├── 📁 backend/                  # API/WebSocket
│   └── 📁 shared/                   # 공통 모듈
│
├── 📁 templates/                     # CodeB 템플릿
│   ├── 📁 saas/                     # SaaS 템플릿
│   ├── 📁 ecommerce/                # 이커머스 템플릿
│   └── 📁 enterprise/               # 엔터프라이즈 템플릿
│
├── 📄 CLAUDE.md                      # CodeB 규칙 (최우선)
├── 📄 CODEB_ARCHITECTURE.md          # 이 문서
├── 📄 package.json                   # 프로젝트 설정
└── 📄 docker-compose.yml             # Podman/Docker 설정
```

## 🔄 워크플로우 상세

### 신규 프로젝트 워크플로우

```bash
1. 초기화
   @codeb-init new --type nextjs --name "project-name"
   ↓
2. 에이전트 배포 (자동)
   - Orchestrator 활성화
   - 4 Domain Leads 준비
   - 11 Specialists 대기
   - 33 Workers 배치
   ↓
3. MCP 서버 연결 (자동)
   - Contest Continuity: 컨텍스트 생성
   - Sequential: 분석 준비
   - Context7: 패턴 검색 준비
   - Shrimp: 작업 관리 준비
   ↓
4. 체크포인트 생성
   - .codeb-checkpoint/ 디렉토리
   - 초기 context.json
   - 빈 patterns.json
   - dependencies.lock 초기화
   ↓
5. 템플릿 적용 (선택)
   @codeb-pattern apply --from "templates/saas"
   ↓
6. 모니터링 시작
   @codeb-monitor --realtime
```

### 기존 프로젝트 워크플로우

```bash
1. 프로젝트 로드
   @codeb-init existing --path "."
   ↓
2. 분석 실행
   @codeb-analyze --comprehensive
   - 49개 에이전트 병렬 분석
   - 중복 의존성 탐지
   - 패턴 식별
   - 성능 병목 발견
   ↓
3. 최적화 계획
   Orchestrator가 분석 결과 검토
   Domain Leads에게 작업 할당
   ↓
4. 5-Wave 최적화
   Wave 1: Context Capture
   Wave 2: Dependency Cleanup
   Wave 3: Pattern Extraction
   Wave 4: Code Refactoring
   Wave 5: Validation & Testing
   ↓
5. 결과 검증
   모든 에이전트 승인 필요
   품질 게이트 통과 확인
   ↓
6. 컨텍스트 저장
   자동으로 .codeb-checkpoint 업데이트
```

## 🔌 MCP 서버 연동 상세

### 1. Contest Continuity Server
```typescript
// 주요 기능
- Context 영속화: 개발 컨텍스트 완벽 보존
- 자동 트리거: 코드 변경 → 테스트 문서 생성
- 스냅샷: 5분마다 자동 저장

// 연동 포인트
@codeb-init     → capture_context
@codeb-analyze  → resume_context
@codeb-optimize → track_development
```

### 2. Sequential Thinking
```typescript
// 주요 기능
- 복잡한 문제 단계별 분석
- 논리적 사고 체인 구성
- 다단계 추론

// 연동 포인트
@codeb-analyze  → 심층 분석
@codeb-delegate → 작업 분해
```

### 3. Context7
```typescript
// 주요 기능
- 라이브러리 문서 검색
- 베스트 프랙티스 제공
- 코드 예제 검색

// 연동 포인트
@codeb-pattern → 패턴 검색
@codeb-optimize → 최적화 패턴
```

### 4. Shrimp Task Manager
```typescript
// 주요 기능
- 작업 계획 수립
- 진행 상황 추적
- 우선순위 관리

// 연동 포인트
@codeb-delegate → 작업 분배
@codeb-monitor → 진행 추적
```

## 🎯 에이전트 통신 프로토콜

### 계층 간 통신

```typescript
// Level 1: Worker → Specialist
interface WorkerReport {
  taskId: string;
  status: 'completed' | 'failed' | 'blocked';
  confidence: number;  // 0.0 ~ 1.0
  result: any;
  errors?: string[];
}

// Level 2: Specialist → Domain Lead
interface SpecialistReport {
  taskId: string;
  workerReports: WorkerReport[];
  aggregatedConfidence: number;
  needsReview: boolean;
  recommendations?: string[];
}

// Level 3: Domain Lead → Orchestrator
interface DomainReport {
  domain: 'frontend' | 'backend' | 'infrastructure' | 'quality';
  specialistReports: SpecialistReport[];
  overallStatus: 'success' | 'partial' | 'failure';
  criticalIssues?: string[];
  approvalRequired: boolean;
}

// Level 4: Orchestrator Decision
interface OrchestratorDecision {
  approved: boolean;
  feedback?: string[];
  nextSteps?: string[];
  escalation?: 'user' | 'retry' | 'abort';
}
```

### 에이전트 이벤트 시스템

```javascript
// 이벤트 타입
agentSystem.on('worker-started', (event) => {
  console.log(`Worker ${event.workerId} started ${event.task}`);
});

agentSystem.on('worker-completed', (event) => {
  console.log(`Worker ${event.workerId} completed with ${event.confidence}`);
});

agentSystem.on('specialist-review', (event) => {
  console.log(`Specialist ${event.specialistId} reviewing ${event.reports.length} reports`);
});

agentSystem.on('domain-escalation', (event) => {
  console.log(`Domain Lead ${event.domainId} escalating: ${event.reason}`);
});

agentSystem.on('orchestrator-decision', (event) => {
  console.log(`Orchestrator decision: ${event.approved ? 'APPROVED' : 'REJECTED'}`);
});
```

## 📊 메트릭스 및 모니터링

### 실시간 모니터링 대시보드

```yaml
System Health:
  agents:
    total: 49
    active: 12
    idle: 37
    blocked: 0
  
Performance Metrics:
  code_reuse_rate: 87%
  duplicate_dependencies: 0
  test_coverage: 92%
  agent_confidence_avg: 0.89
  
Resource Usage:
  cpu: 23%
  memory: 1.2GB
  disk: 45GB
  
Activity Log:
  - 10:23:45 Frontend Lead: Component analysis complete
  - 10:23:12 Worker-7: Test generation started
  - 10:22:58 Orchestrator: New task delegated
```

### 품질 게이트 체크리스트

```typescript
const qualityGates = {
  pre: {
    contextLoaded: true,        // ✅
    patternsChecked: true,       // ✅
    dependenciesClean: true,     // ✅
    agentsReady: true            // ✅
  },
  during: {
    realtimeMonitoring: true,    // ✅
    patternCompliance: 0.91,     // ✅ (>0.90)
    agentConfidence: 0.87,       // ✅ (>0.85)
    noDuplicateCode: true        // ✅
  },
  post: {
    testsGenerated: true,        // ✅
    documentationUpdated: true,  // ✅
    contextSaved: true,          // ✅
    allAgentsApproved: true      // ✅
  }
};
```

## 🚀 성능 최적화 전략

### 1. 병렬 처리
- 49개 에이전트 동시 작업
- 도메인별 독립 실행
- Worker 풀 관리

### 2. 캐싱 전략
- 패턴 매칭 결과 캐싱
- MCP 응답 캐싱
- 컨텍스트 인메모리 캐싱

### 3. 지연 로딩
- 필요한 에이전트만 활성화
- MCP 서버 온디맨드 연결
- 템플릿 지연 로딩

## 🔒 보안 고려사항

### 1. 에이전트 권한 관리
- Worker: 읽기/쓰기 제한
- Specialist: 도메인 내 권한
- Domain Lead: 도메인 전체 권한
- Orchestrator: 모든 권한

### 2. 데이터 보호
- 체크포인트 암호화
- 민감 정보 마스킹
- 로그 sanitization

### 3. 접근 제어
- .codeb-checkpoint 접근 제한
- MCP 서버 인증
- 에이전트 간 통신 검증

---

**CodeB Enterprise Architecture v2.0**
**최종 업데이트: 2024-01-01**