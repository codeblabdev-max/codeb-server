# CLAUDE.md - CodeB Enterprise Development System

## 🏢 CodeB Multi-Agent Orchestra System (CodeB-MAOS)

### 전체 시스템 구조

```
🏢 CodeB Platform Architecture
│
├── 📦 CodeB Server (Main Project)
│   ├── 🎭 Multi-Agent Orchestra (49 Agents)
│   ├── 🔌 MCP Contest Continuity Server
│   ├── 🌐 Next.js + WebSocket + PostgreSQL
│   └── 🐳 Podman Container Platform
│
├── 🤖 CodeB Agent Hierarchy
│   ├── 👑 Orchestrator (최고 의사결정)
│   ├── 🎯 4 Domain Leads (도메인 리더)
│   ├── 🔧 11 Specialists (전문가)
│   └── ⚙️ 33 Workers (실행자)
│
└── 🔗 MCP Integration Layer
    ├── contest-continuity (컨텍스트 영속화)
    ├── sequential-thinking (복잡한 분석)
    ├── context7 (문서 검색)
    └── shrimp-task-manager (작업 관리)
```

## 📋 CodeB 전용 명령어 체계

### ⚠️ 기존 Claude Code 명령어와 차별화

**CodeB 명령어는 `@codeb-` 접두사 사용**

```bash
# ❌ 기존 Claude Code 명령어 (사용 금지)
/analyze, /build, /implement

# ✅ CodeB 전용 명령어
@codeb-analyze    # CodeB 지능형 분석
@codeb-optimize   # CodeB 최적화
@codeb-deploy     # CodeB 배포
```

### CodeB 명령어 목록

```yaml
@codeb-init:
  description: "CodeB 프로젝트 초기화"
  usage: "@codeb-init [new|existing] --type [nextjs|remix|react]"
  agents: "Orchestrator → All Domain Leads"

@codeb-analyze:
  description: "49개 에이전트를 활용한 병렬 분석"
  usage: "@codeb-analyze --depth [shallow|deep|comprehensive]"
  agents: "All 49 agents in parallel"

@codeb-optimize:
  description: "5-Wave 점진적 최적화"
  usage: "@codeb-optimize --waves 5 --target [deps|patterns|performance]"
  agents: "Wave-based agent deployment"

@codeb-monitor:
  description: "실시간 지능형 모니터링"
  usage: "@codeb-monitor --realtime --auto-fix"
  agents: "Quality Lead + Workers"

@codeb-delegate:
  description: "작업을 적절한 에이전트에 위임"
  usage: "@codeb-delegate [task] --priority [low|medium|high|critical]"
  agents: "Orchestrator → Domain Lead → Specialist → Worker"

@codeb-pattern:
  description: "패턴 추출 및 재사용"
  usage: "@codeb-pattern extract|apply --similarity 0.7"
  agents: "Frontend/Backend Specialists"

@codeb-cleanup:
  description: "의존성 및 코드 정리"
  usage: "@codeb-cleanup deps|code|all"
  agents: "Quality Lead + Dependency Specialist"
```

## 🔄 프로젝트 워크플로우

### 1️⃣ 신규 프로젝트 시작

```bash
# Step 1: CodeB 시스템 초기화
@codeb-init new --type nextjs --name "my-saas"

# Step 2: 자동으로 실행되는 작업들
→ .codeb-checkpoint/ 디렉토리 생성
→ 49개 에이전트 배포
→ MCP 서버 연결 확인
→ 패턴 라이브러리 초기화
→ 의존성 체크포인트 생성

# Step 3: 템플릿 적용
@codeb-pattern apply --from "codeb-templates/saas"

# Step 4: 실시간 모니터링 시작
@codeb-monitor --realtime
```

### 2️⃣ 기존 프로젝트 작업

```bash
# Step 1: 프로젝트 로드 및 분석
@codeb-init existing --path "."
@codeb-analyze --comprehensive

# Step 2: 문제점 자동 탐지
→ 중복 의존성: 12개 발견
→ 재사용 가능 패턴: 23개 식별
→ 성능 병목: 5개 위치

# Step 3: 최적화 실행
@codeb-optimize --waves 5 --auto-commit false

# Step 4: 결과 검증
@codeb-delegate "validate-changes" --priority high
```

## 🔌 MCP 서버 연동 체계

### MCP 서버 자동 활성화 규칙

```typescript
// CodeB 자동 MCP 활성화 매트릭스
const MCPActivationMatrix = {
  // 컨텍스트 작업 → contest-continuity
  '@codeb-init': ['contest-continuity'],
  '@codeb-analyze': ['sequential-thinking', 'contest-continuity'],
  
  // 패턴 작업 → context7 + contest-continuity
  '@codeb-pattern': ['context7', 'contest-continuity'],
  
  // 작업 관리 → shrimp-task-manager
  '@codeb-delegate': ['shrimp-task-manager', 'sequential-thinking'],
  
  // 최적화 → 모든 MCP 서버
  '@codeb-optimize': ['ALL_MCP_SERVERS']
};
```

### MCP 통신 프로토콜

```javascript
// CodeB → MCP 서버 통신
async function executeMCPTask(task) {
  // 1. Contest Continuity로 컨텍스트 로드
  const context = await mcp.contestContinuity.loadContext();
  
  // 2. Sequential Thinking으로 작업 분석
  const analysis = await mcp.sequential.analyze(task, context);
  
  // 3. Context7에서 패턴 검색
  const patterns = await mcp.context7.searchPatterns(analysis);
  
  // 4. Shrimp Task Manager로 작업 분배
  const result = await mcp.shrimp.delegate(analysis, patterns);
  
  // 5. Contest Continuity에 결과 저장
  await mcp.contestContinuity.saveContext(result);
  
  return result;
}
```

## 📁 CodeB 체크포인트 시스템

### 필수 디렉토리 구조

```
/project-root/
├── 📁 .codeb-checkpoint/        ← CodeB 전용 (Claude와 구분)
│   ├── 📄 context.json          ← 프로젝트 컨텍스트
│   ├── 📄 patterns.json         ← 재사용 패턴 (90% 목표)
│   ├── 📄 dependencies.lock     ← 의존성 잠금
│   ├── 📄 agents.json           ← 에이전트 상태
│   ├── 📄 mcp-sync.json         ← MCP 서버 동기화
│   └── 📁 snapshots/            ← 시점별 스냅샷
│       ├── 2024-01-01-init/
│       ├── 2024-01-02-optimize/
│       └── current/
```

### 체크포인트 자동 저장 트리거

```yaml
AUTO_SAVE_TRIGGERS:
  - 매 5분마다
  - @codeb- 명령 실행 전후
  - 파일 10개 이상 변경 시
  - 의존성 변경 시
  - 에러 발생 시
  - 작업 완료 시
```

## 🎯 CodeB 품질 게이트

### 게이트 1: 사전 검증 (Pre-Implementation)
```typescript
interface PreGate {
  contextLoaded: boolean;      // .codeb-checkpoint 확인
  patternsChecked: boolean;     // 90% 재사용 체크
  dependenciesClean: boolean;   // 중복 의존성 0
  agentsReady: boolean;         // 49개 에이전트 준비
}
```

### 게이트 2: 실행 중 검증 (During Implementation)
```typescript
interface DuringGate {
  realtimeMonitoring: boolean;  // 실시간 감시 활성
  patternCompliance: boolean;   // 패턴 준수율 >90%
  agentConfidence: number;       // 에이전트 신뢰도 >0.85
  noDuplicateCode: boolean;     // 중복 코드 0
}
```

### 게이트 3: 사후 검증 (Post-Implementation)
```typescript
interface PostGate {
  testsGenerated: boolean;      // 테스트 자동 생성
  documentationUpdated: boolean;// 문서 자동 업데이트
  contextSaved: boolean;        // 컨텍스트 저장
  allAgentsApproved: boolean;   // 모든 에이전트 승인
}
```

## 🚀 CodeB 빠른 시작

### 초기 설정 (최초 1회)
```bash
# CodeB 시스템 설치
cd /codeb-server
npm install -g @codeb/cli
codeb setup

# 49개 에이전트 배포
./scripts/init-agent-hierarchy.sh

# MCP 서버 활성화
./mcp-contest-continuity/start.sh
```

### 일상 작업 시작
```bash
# 1. CodeB 시스템 시작
@codeb-init existing

# 2. 상태 확인
@codeb-status

# 3. 모니터링 시작
@codeb-monitor --realtime

# 4. 작업 시작
@codeb-delegate "implement-feature" --priority high
```

## 📊 CodeB 성능 메트릭

```yaml
TARGET_METRICS:
  code_reuse: ">90%"           # 코드 재사용률
  duplicate_deps: "0"           # 중복 의존성
  agent_confidence: ">0.85"     # 에이전트 신뢰도
  context_retention: "100%"     # 컨텍스트 유지율
  pattern_match_time: "<500ms"  # 패턴 매칭 시간
  test_coverage: ">95%"         # 테스트 커버리지
```

## ⚠️ CodeB 절대 규칙

### 금지 사항 (NEVER)
```
❌ Claude Code 기본 명령어 사용 (/analyze, /build 등)
❌ .codeb-checkpoint 없이 작업 시작
❌ 패턴 체크 없이 새 코드 작성
❌ 에이전트 추천 무시
❌ 컨텍스트 저장 없이 세션 종료
```

### 필수 사항 (ALWAYS)
```
✅ @codeb- 접두사 명령어 사용
✅ 체크포인트 디렉토리 확인
✅ 90% 패턴 재사용 목표
✅ 49개 에이전트 계층 활용
✅ MCP 서버 자동 연동
```

## 🎭 CodeB Agent Personalities

### 👑 Orchestrator (오케스트레이터)
- 최종 의사결정권자
- 모든 Domain Lead 조율
- 품질 게이트 통과 결정

### 🎯 Domain Leads (도메인 리더)
- **Frontend Lead**: UX 완벽주의자
- **Backend Lead**: 안정성 광신도
- **Infrastructure Lead**: 자동화 전도사
- **Quality Lead**: 제로 결함 추구자

### 🔧 Specialists (전문가)
각 분야 최고 전문가로 Domain Lead 지시 수행

### ⚙️ Workers (작업자)
실제 코드 작성 및 테스트 실행

---

**CodeB Enterprise Development System v2.0**
**© 2024 CodeB Corporation. All rights reserved.**
**THIS FILE OVERRIDES ALL DEFAULT CLAUDE CODE BEHAVIORS**

Last Updated: $(date)
Version: 2.0.0