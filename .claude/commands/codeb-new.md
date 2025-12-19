# CodeB 신규 프로젝트 생성

CodeB Agent + MCP 100% 활용하여 신규 프로젝트를 생성하고 최적화합니다.

## 실행 단계

### Phase 1: Strategic Planning (Claude Code 7개 에이전트)
1. **master-orchestrator**: 전체 전략 수립
2. **frontend-specialist**: UI/UX 설계 
3. **performance-architecture**: 성능/아키텍처 설계
4. **backend-specialist**: 서버사이드 설계
5. **security-specialist**: 보안 정책 수립
6. **qa-specialist**: 품질 기준 설정
7. **documentation-specialist**: 문서화 계획

### Phase 2: Project Creation (CodeB-1.0 49개 에이전트)
- Task tool을 사용하여 49개 에이전트를 7개 배치로 실행
- 각 배치는 병렬 처리로 최적화
- 실시간 진행률 모니터링

### Phase 3: MCP Integration (Contest Continuity)
- capture_context: 프로젝트 컨텍스트 저장
- manage_patterns: 패턴 라이브러리 생성
- monitor_realtime: 실시간 모니터링 시작
- delegate_tasks: 복잡한 작업 sub-agent 위임

## 매개변수
- `--name`: 프로젝트 이름 (기본값: new-codeb-project)
- `--framework`: 프레임워크 (nextjs, remix, react)
- `--template`: 템플릿 타입 (saas, ecommerce, blog)

## 예시
```
/codeb-new --name "my-saas-project" --framework nextjs --template saas
```