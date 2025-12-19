# 🚀 CodeB Agent 1.0 - Claude Code 실행 플로우

## 📌 전체 실행 구조

```
사용자 → Claude Code → @codeb-analyze → 49 Agents (7 Batches) → SQLite → Report → 사용자
```

## 1️⃣ Claude Code에서 명령 실행

### 방법 1: 직접 명령어 실행
```bash
# Claude Code 터미널에서
@codeb-analyze

# 또는 전체 경로 지정
@codeb-analyze /path/to/project
```

### 방법 2: Claude Code Task Tool 사용
```javascript
// Claude Code가 직접 실행
await Task({
  description: "CodeB 49-agent analysis",
  prompt: `
    Execute: ./scripts/codeb-agent-executor.sh
    Report back with results from SQLite
  `
});
```

### 방법 3: MCP Server 호출
```javascript
// MCP를 통한 실행
await mcp__codeb-agent__analyze_project({
  projectPath: "."
});
```

## 2️⃣ 49개 에이전트 배치 실행 로직

### 실제 제약사항 (Claude Code Task Tool)
- ✅ 최대 10개 병렬 실행
- ✅ subagent_type 파라미터 없음
- ✅ 배치 처리 필수
- ✅ 각 에이전트는 독립 컨텍스트

### 7-배치 실행 전략

```javascript
// Batch 1: Domain Leads (4 agents)
const batch1 = await Promise.all([
  Task({ description: "Frontend Lead" }),
  Task({ description: "Backend Lead" }),
  Task({ description: "Infrastructure Lead" }),
  Task({ description: "Quality Lead" })
]);

// Batch 2: Specialists 1-10 (10 agents)
const batch2 = await Promise.all(
  Array(10).fill().map((_, i) => 
    Task({ description: `Specialist ${i+1}` })
  )
);

// Batch 3: Specialist 11 (1 agent)
const batch3 = await Task({ 
  description: "Dependency Specialist" 
});

// Batch 4-6: Workers 1-30 (각 10 agents)
for (let batch = 4; batch <= 6; batch++) {
  await Promise.all(
    Array(10).fill().map((_, i) => 
      Task({ 
        description: `Worker ${(batch-4)*10 + i + 1}` 
      })
    )
  );
}

// Batch 7: Workers 31-33 (3 agents)
const batch7 = await Promise.all(
  Array(3).fill().map((_, i) => 
    Task({ description: `Worker ${i+31}` })
  )
);
```

## 3️⃣ 각 에이전트가 실행하는 실제 도구

### Domain Lead 에이전트 예시
```javascript
// Frontend Lead가 실행하는 명령
async function frontendLeadAnalysis() {
  // 1. 컴포넌트 파일 찾기
  const components = await Glob("src/**/*.tsx");
  
  // 2. 각 컴포넌트 읽기
  for (const file of components.slice(0, 10)) {
    const content = await Read(file);
    // 분석 로직
  }
  
  // 3. 중복 패턴 검색
  await Grep("export (default )?function", "src/");
  
  // 4. 결과 저장
  return {
    duplicates: 12,
    accessibility_issues: 8,
    prop_drilling: 5
  };
}
```

### Backend Lead 에이전트 예시
```javascript
async function backendLeadAnalysis() {
  // API 엔드포인트 검색
  await Grep("app\\.(get|post|put|delete)", "**/*.ts");
  
  // 데이터베이스 쿼리 분석
  await Grep("SELECT.*FROM", "**/*.ts");
  
  // N+1 쿼리 패턴 검색
  await Grep("forEach.*await.*query", "**/*.ts");
  
  return {
    n1_queries: 7,
    missing_indexes: 3,
    duplicate_apis: 15
  };
}
```

## 4️⃣ SQLite 데이터 저장 구조

```sql
-- 에이전트 결과 테이블
CREATE TABLE agent_results (
    id INTEGER PRIMARY KEY,
    batch_id INTEGER,        -- 1-7
    agent_name TEXT,          -- "Frontend Lead", "Worker 23"
    agent_type TEXT,          -- "domain_lead", "specialist", "worker"
    result TEXT,              -- JSON 결과
    timestamp DATETIME
);

-- 분석 요약 테이블
CREATE TABLE analysis_summary (
    id INTEGER PRIMARY KEY,
    total_agents INTEGER,     -- 49
    execution_time INTEGER,   -- seconds
    issues_found INTEGER,     -- total count
    timestamp DATETIME
);
```

## 5️⃣ 보고서 생성 및 전달

### 자동 생성되는 파일들
```
.codeb-checkpoint/
├── context.db              # SQLite 데이터베이스
├── analysis-report.md      # 마크다운 보고서
├── patterns.json           # 발견된 패턴
└── optimization-plan.json  # 최적화 계획
```

### 사용자에게 전달되는 보고

```markdown
✅ CodeB Agent 1.0 - Analysis Complete

📊 49 Agents Executed in 7 Batches:
  ✓ Batch 1: 4 Domain Leads
  ✓ Batch 2: 10 Specialists
  ✓ Batch 3: 1 Specialist
  ✓ Batch 4-7: 33 Workers

💾 Results saved to:
  • SQLite: .codeb-checkpoint/context.db
  • Report: .codeb-checkpoint/analysis-report.md

🔍 Critical Issues Found: 121
  • Frontend: 25 issues
  • Backend: 25 issues
  • Infrastructure: 47 issues
  • Quality: 54 issues

✨ Next Steps:
  1. @codeb-optimize - Auto-fix critical issues
  2. @codeb-cleanup deps - Remove duplicates
  3. @codeb-pattern extract - Build patterns
  4. @codeb-monitor - Start monitoring
```

## 6️⃣ 명령어 중복 방지

### @codeb- prefix 사용
```bash
# ✅ CodeB 명령어 (중복 없음)
@codeb-init
@codeb-analyze
@codeb-optimize
@codeb-cleanup
@codeb-pattern
@codeb-monitor
@codeb-delegate
@codeb-status
@codeb-help

# ❌ Claude Code 기본 명령어와 충돌하지 않음
/analyze   # Claude Code 기본
/build     # Claude Code 기본
/test      # Claude Code 기본
```

## 7️⃣ 실제 실행 예시

### Step 1: Claude Code에서 명령
```bash
user@machine:~/project$ @codeb-analyze
```

### Step 2: 49개 에이전트 배치 실행
```
👑 Phase 1: Orchestrator Planning
  Analyzing project structure...
  Found 247 source files

🎯 Phase 2: Domain Leads Analysis (Batch 1/7)
  Launching 4 Domain Lead agents...
  ✓ Domain Leads completed

🔧 Phase 3: Specialists Deep Dive
  Batch 2/7: Launching 10 Specialist agents...
  ✓ Batch 2 completed
  Batch 3/7: Launching 1 Specialist agent...
  ✓ Batch 3 completed

⚙️ Phase 4: Workers Processing
  Batch 4/7: Launching 10 Worker agents...
  ✓ Batch 4 completed
  Batch 5/7: Launching 10 Worker agents...
  ✓ Batch 5 completed
  Batch 6/7: Launching 10 Worker agents...
  ✓ Batch 6 completed
  Batch 7/7: Launching 3 Worker agents...
  ✓ Batch 7 completed

📊 Phase 5: Aggregating Results
📄 Phase 6: Generating Report
```

### Step 3: 결과 보고
```
✅ CodeB Agent 1.0 - Analysis Complete

49 Agents analyzed your project and found:
- 23 duplicate dependencies to remove
- 12 duplicate components to refactor
- 7 N+1 queries to optimize
- 2.3GB Docker image to reduce to 387MB

Ready to optimize? Run: @codeb-optimize
```

## 🎯 핵심 포인트

1. **Claude Code가 직접 실행**: Task Tool로 49개 에이전트 생성
2. **배치 처리**: 10개씩 병렬 실행 (7배치)
3. **실제 도구 사용**: Read, Grep, Glob, Bash 등
4. **SQLite 저장**: 모든 결과 영구 보존
5. **@codeb- prefix**: 명령어 충돌 방지
6. **보고서 자동 생성**: 마크다운 + JSON

이제 Claude Code에서 `@codeb-analyze` 명령 하나로 49개 에이전트가 프로젝트를 완벽하게 분석합니다!