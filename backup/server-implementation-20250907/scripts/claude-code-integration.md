# Claude Code와 MCP Sub-Agent 통합 가이드

## 🎯 핵심 개념

Claude Code에서 MCP 서버와 Sub-Agent를 활용하여 복잡한 작업을 효율적으로 처리하는 방법입니다.

## 📋 사용 가능한 명령어

### 1. MCP 서버 직접 호출

```bash
# 컨텍스트 캡처
mcp__contest-continuity__capture_context \
  --projectPath "." \
  --contextName "my-project"

# 의존성 분석
mcp__contest-continuity__analyze_dependencies \
  --projectPath "." \
  --action "analyze"

# 패턴 관리
mcp__contest-continuity__manage_patterns \
  --action "extract" \
  --projectPath "."

# 실시간 모니터링
mcp__contest-continuity__monitor_realtime \
  --projectPath "." \
  --action "start"

# 작업 위임
mcp__contest-continuity__delegate_tasks \
  --tasks ["task1", "task2"] \
  --strategy "parallel"
```

### 2. Sub-Agent 스크립트 활용

```bash
# 의존성 정리 (3개 Agent 병렬)
./scripts/sub-agent-manager.sh . cleanup-deps

# 패턴 추출 (Wave 방식)
./scripts/sub-agent-manager.sh . pattern-extract

# 실시간 모니터링 시작
./scripts/sub-agent-manager.sh . realtime-monitor

# 전체 최적화
./scripts/sub-agent-manager.sh . full-optimization

# 모니터링 중지
./scripts/sub-agent-manager.sh . stop-monitor
```

## 🔧 Claude Code 명령어 조합

### 복잡한 분석 작업

```bash
# Step 1: Wave 모드로 전체 분석
/analyze @project --wave-mode --delegate folders --concurrency 7

# Step 2: 중복 제거
/cleanup --persona-refactorer --validate

# Step 3: 패턴 추출
/improve --wave-strategy systematic --focus patterns
```

### 의존성 최적화

```bash
# 병렬 Agent로 의존성 분석
/spawn cleanup-deps --parallel-focus
  - Frontend deps (React/Next.js)
  - Backend deps (Socket.io)
  - DB deps (PostgreSQL)
  - Container deps (Podman)
```

### 실시간 개발 추적

```bash
# 개발 추적 시작
/task track --seq --delegate files

# 자동 테스트 문서 생성
/document tests --auto-update --monitor
```

## 📊 작업 분할 전략

### 1. 파일 기반 분할
```yaml
strategy: files
agents: 5
distribution:
  - Agent 1: components/*.tsx
  - Agent 2: pages/*.tsx  
  - Agent 3: api/*.ts
  - Agent 4: utils/*.ts
  - Agent 5: tests/*.test.ts
```

### 2. 디렉토리 기반 분할
```yaml
strategy: folders
agents: 3
distribution:
  - Agent 1: src/frontend/
  - Agent 2: src/backend/
  - Agent 3: src/shared/
```

### 3. 작업 유형 기반 분할
```yaml
strategy: task-type
agents: 4
distribution:
  - Agent 1: security analysis
  - Agent 2: performance optimization
  - Agent 3: quality assessment
  - Agent 4: documentation generation
```

## 🌊 Wave 실행 패턴

### Progressive Wave (점진적 개선)
```bash
Wave 1: 현재 상태 분석
Wave 2: 개선 기회 식별
Wave 3: 우선순위 설정
Wave 4: 점진적 적용
Wave 5: 검증 및 롤백
```

### Systematic Wave (체계적 분석)
```bash
Wave 1: 구조 분석
Wave 2: 패턴 인식
Wave 3: 의존성 매핑
Wave 4: 최적화 계획
Wave 5: 실행 및 검증
```

### Adaptive Wave (적응형 처리)
```bash
Wave 1: 초기 평가
Wave 2-N: 동적 조정 (복잡도에 따라)
Final Wave: 통합 및 검증
```

## 💡 Best Practices

### 1. 컨텍스트 유지
```bash
# 작업 시작 시 항상 컨텍스트 캡처
mcp__contest-continuity__capture_context --contextName "work-$(date +%Y%m%d)"

# 작업 종료 시 컨텍스트 저장
mcp__contest-continuity__track_development --action "snapshot"
```

### 2. 병렬 처리 활용
```bash
# 독립적인 작업은 항상 병렬로
--delegate files --concurrency 7

# 의존성 있는 작업은 Wave로
--wave-mode --wave-strategy systematic
```

### 3. 자동화 설정
```bash
# 실시간 모니터링 활성화
./scripts/sub-agent-manager.sh . realtime-monitor

# 자동 테스트 문서 생성
--auto-update --monitor
```

## 🔍 문제 해결

### MCP 서버 연결 실패
```bash
# MCP 서버 상태 확인
ps aux | grep mcp-contest-continuity

# 서버 재시작
npm start --prefix /path/to/mcp-contest-continuity
```

### Sub-Agent 응답 없음
```bash
# 프로세스 확인
ps aux | grep agent

# 로그 확인
tail -f /tmp/monitor.log
```

### 메모리 부족
```bash
# 동시 실행 Agent 수 줄이기
--concurrency 3

# Wave 크기 조정
--wave-size small
```

## 📈 성능 최적화 팁

1. **작업 크기 조정**: 각 Agent가 5-10분 내 완료 가능한 크기로
2. **캐싱 활용**: 반복 작업은 컨텍스트 캐시 활용
3. **선택적 분석**: 전체 분석보다 타겟 분석 우선
4. **점진적 처리**: 한 번에 모든 것보다 단계별 처리

## 🎯 실전 시나리오

### 시나리오 1: 레거시 프로젝트 현대화
```bash
# 1. 전체 분석
./scripts/sub-agent-manager.sh ./legacy-app full-optimization

# 2. 패턴 추출
mcp__contest-continuity__manage_patterns --action extract

# 3. 새 프로젝트에 적용
mcp__contest-continuity__resume_context --contextId "legacy-patterns"
```

### 시나리오 2: 대규모 리팩토링
```bash
# 1. Wave 모드로 분석
/analyze --wave-mode --wave-strategy systematic

# 2. 병렬 리팩토링
/improve --delegate folders --parallel-focus

# 3. 검증
/test --validate --coverage
```

### 시나리오 3: 성능 최적화
```bash
# 1. 병목 지점 찾기
/analyze --focus performance --delegate files

# 2. 최적화 적용
/improve --persona-performance --validate

# 3. 벤치마크
/test --benchmark --compare
```

---

**이 가이드를 참고하여 Claude Code에서 MCP 서버와 Sub-Agent를 효과적으로 활용하세요!**