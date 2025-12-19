# CodeB 작업 위임 시스템

복잡한 작업을 59+개 에이전트와 MCP sub-agents에게 지능적으로 위임합니다.

## 작업 위임 계층

### Level 1: Strategic Delegation (Claude Code 7개 에이전트)
- **master-orchestrator**: 복잡한 작업을 분석하고 전략적 분해
- **domain specialists**: 각 도메인별 세부 작업 계획 수립

### Level 2: Tactical Delegation (CodeB-1.0 49개 에이전트)  
- **Domain Leads**: 전략을 구체적인 실행 계획으로 변환
- **Specialists**: 전문 영역별 작업 실행
- **Workers**: 실제 코드 작성 및 처리

### Level 3: Unlimited Sub-Delegation (MCP Contest Continuity)
- **delegate_tasks**: 무제한 sub-agents에게 병렬 작업 위임
- **adaptive scaling**: 작업 복잡도에 따른 자동 스케일링
- **parallel processing**: 최대 성능을 위한 병렬 처리

## 지원되는 작업 유형

### 🔍 분석 작업
- **코드베이스 전체 분석**: 대규모 프로젝트 구조 분석
- **중복 패턴 탐지**: API, 컴포넌트, 유틸리티 중복 발견
- **성능 병목 분석**: 성능 저하 지점 식별
- **보안 취약점 스캔**: 전체 코드베이스 보안 검사

### 🛠️ 최적화 작업
- **중복 제거**: API 통합, 컴포넌트 통합, 코드 정리
- **성능 최적화**: 번들 크기 감소, 로딩 시간 개선
- **의존성 정리**: 중복 패키지 제거, 버전 충돌 해결
- **아키텍처 개선**: 구조적 문제 해결

### 🏗️ 구현 작업
- **대규모 리팩토링**: 전체 구조 변경
- **새 기능 구현**: 복잡한 기능 개발
- **테스트 작성**: 포괄적인 테스트 커버리지
- **문서화**: 자동 문서 생성 및 업데이트

## 위임 전략

### Parallel Processing (병렬 처리)
```typescript
delegate_tasks({
  operation: "delegate_task",
  task_description: "전체 프로젝트 중복 API 통합",
  delegation_options: {
    strategy: "parallel_focus",
    max_parallel_tasks: 15,
    split_strategy: "by_analysis_type"
  }
});
```

### Adaptive Scaling (적응형 스케일링)  
- **소규모 작업**: 3-5개 sub-agents
- **중간 규모 작업**: 10-15개 sub-agents  
- **대규모 작업**: 20+ sub-agents 자동 생성
- **복잡한 작업**: 무제한 확장 가능

### Load Balancing (부하 분산)
- **작업 분할**: 큰 작업을 작은 단위로 분할
- **우선순위 관리**: 중요한 작업 우선 처리
- **자원 최적화**: CPU, 메모리 사용량 최적화

## 사용 예시

### 기본 작업 위임
```
/codeb-delegate "전체 프로젝트에서 중복 API 제거" --priority high
```

### 복잡한 분석 작업
```  
/codeb-delegate "React 컴포넌트 패턴 분석 및 라이브러리화" --strategy parallel --depth comprehensive
```

### 성능 최적화 작업
```
/codeb-delegate "번들 크기 50% 감소 및 로딩 시간 최적화" --priority critical --auto-fix true
```

### 보안 감사 작업
```
/codeb-delegate "전체 보안 감사 및 취약점 수정" --focus security --validation required
```

## 매개변수

### 기본 매개변수
- `--priority`: 작업 우선순위 (low, medium, high, critical)
- `--strategy`: 위임 전략 (parallel, sequential, adaptive)
- `--depth`: 분석 깊이 (shallow, deep, comprehensive)
- `--auto-fix`: 자동 수정 여부 (true/false)

### 고급 매개변수  
- `--max-agents`: 최대 사용 에이전트 수
- `--timeout`: 작업 타임아웃 (초)
- `--validation`: 검증 필요 여부 (required, optional, none)
- `--rollback`: 실패 시 롤백 여부 (true/false)

## 작업 진행 모니터링

### 실시간 상태 확인
- 📊 **진행률**: 실시간 작업 진행률 표시
- 🤖 **활성 에이전트**: 현재 작업 중인 에이전트 수
- ⏱️ **예상 완료 시간**: AI 기반 완료 시간 예측
- 🎯 **품질 점수**: 작업 품질 실시간 평가

### 결과 보고서
- ✅ **완료된 작업**: 성공적으로 완료된 항목 
- ⚠️ **주의 필요**: 검토가 필요한 항목
- ❌ **실패한 작업**: 실패 원인 및 재시도 방법
- 💡 **개선 제안**: 추가 최적화 제안사항

## 고급 기능

### Context-Aware Delegation (컨텍스트 인식 위임)
- **프로젝트 히스토리**: 과거 작업 이력 기반 최적화
- **패턴 학습**: 이전 성공 패턴 재사용
- **자동 우선순위**: 중요도 자동 판단

### Cross-Project Learning (프로젝트 간 학습)
- **패턴 공유**: 다른 프로젝트 성공 패턴 적용
- **베스트 프랙티스**: 검증된 방법론 자동 적용
- **지식 축적**: 경험을 바탕으로 한 지능적 개선

### Quality Gates (품질 게이트)
- **코드 품질**: 최소 품질 기준 자동 검증
- **성능 기준**: 성능 저하 방지 검사
- **보안 검증**: 보안 기준 준수 확인
- **테스트 커버리지**: 최소 커버리지 보장