# CodeB 기존 프로젝트 최적화

CodeB Agent + MCP 100% 활용하여 기존 프로젝트를 분석하고 최적화합니다.

## 실행 단계

### Phase 1: Strategic Analysis (Claude Code 7개 에이전트)
1. **master-orchestrator**: 프로젝트 전체 분석 및 최적화 전략 수립
2. **frontend-specialist**: UI/UX 문제점 분석 및 개선 방안
3. **performance-architecture**: 성능 병목 및 아키텍처 개선점 도출
4. **backend-specialist**: 서버사이드 최적화 방안
5. **security-specialist**: 보안 취약점 분석
6. **qa-specialist**: 품질 이슈 및 테스트 개선 방안
7. **documentation-specialist**: 문서 정리 및 개선 계획

### Phase 2: Mass Optimization (CodeB-1.0 49개 에이전트)

#### Batch 1: Domain Leads (4개 에이전트)
- Frontend Lead: UI 중복 컴포넌트 분석
- Backend Lead: API 중복 엔드포인트 분석  
- Infrastructure Lead: 설정 중복 분석
- Quality Lead: 코드 품질 문제 분석

#### Batch 2-7: Specialists + Workers (45개 에이전트)
- **중복 제거**: API, 컴포넌트, 유틸리티 함수
- **패턴 추출**: 재사용 가능한 코드 패턴 90%+ 달성
- **성능 최적화**: 번들 크기, 로딩 시간, 메모리 사용량
- **의존성 정리**: 중복 패키지 제거, 버전 충돌 해결

### Phase 3: MCP Automation (Contest Continuity)
- **analyze_dependencies**: 의존성 중복 자동 분석 및 정리
- **manage_patterns**: 코드 패턴 자동 추출 및 라이브러리 생성
- **delegate_tasks**: 복잡한 최적화 작업을 무제한 sub-agents에 위임
- **monitor_realtime**: 실시간 코드 변경 감지 및 자동 최적화
- **sync_projects**: 다른 프로젝트와 패턴 동기화

## 매개변수
- `--focus`: 최적화 포커스 (duplicates, performance, dependencies, patterns)
- `--depth`: 분석 깊이 (shallow, deep, comprehensive)
- `--target`: 특정 대상 (api, components, utils, deps)
- `--auto-fix`: 자동 수정 여부 (true/false)

## 예시
```
/codeb-optimize --focus duplicates --depth comprehensive --auto-fix true
```

## 예상 결과
- 🎯 중복 제거: 60-90% 감소
- ⚡ 성능 향상: 30-70% 개선  
- 📦 번들 크기: 50-70% 감소
- 🔄 코드 재사용: 90%+ 달성
- 🤖 바이브 코딩: 완전 자동화