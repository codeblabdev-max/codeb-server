# Changelog

All notable changes to CodeB Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.0.0] - 2026-01-11

### Added
- **Claude Code 2.1 통합** (완전 지원)
  - **Skills System** (.claude/skills/) - Hot Reload 지원
    - `/deploy`, `/promote`, `/rollback` - 배포 관련 Skills
    - `/health`, `/monitor` - 모니터링 Skills
    - `/domain`, `/workflow` - 인프라 Skills
    - `/analyze`, `/optimize` - 분석 Skills
  - **Advanced Hooks** - 배포 라이프사이클 감사
    - `PreToolUse`: 배포 전 검증 (프로덕션 확인 등)
    - `PostToolUse`: 배포 후 감사 로깅 및 메트릭 수집
    - `Stop (once: true)`: 세션 요약 자동 생성
  - **Agent Hooks** - 에이전트 레벨 작업 모니터링
  - **context: fork** - 독립 컨텍스트 병렬 실행
  - **Wildcard Permissions** - `Bash(we *)` 패턴 지원

- **감사 로깅 시스템**
  - `~/.codeb/deploy-audit.log` - 배포 작업 로그
  - `~/.codeb/metrics/deploys.jsonl` - 배포 메트릭 (JSON Lines)
  - `~/.codeb/agent-audit.log` - 에이전트 액션 로그
  - `~/.codeb/sessions/*.md` - 세션별 요약

- **신규 Hook 스크립트**
  - `.claude/hooks/pre-deploy.py` - 배포 전 검증
  - `.claude/hooks/post-deploy.py` - 배포 후 알림/메트릭
  - `.claude/hooks/post-promote.py` - 프로모트 로깅
  - `.claude/hooks/post-rollback.py` - 롤백 로깅
  - `.claude/hooks/session-summary.py` - 세션 요약 (once: true)
  - `.claude/hooks/agent-audit.py` - 에이전트 감사

- **신규 문서**
  - `docs/CLAUDE-CODE-INTEGRATION.md` - Claude Code 2.1 통합 가이드

### Changed
- **패키지명 통일**: 모든 패키지 `@codeb-dev-run/*`로 변경
  - `@codeb/mcp-proxy` → `@codeb-dev-run/mcp-proxy`
  - `@codeb/analytics` → `@codeb-dev-run/analytics`
- **폴더 구조 변경**: `v6.0/` → `v7.0/`
- **문서 버전 업데이트**: 모든 docs/ 문서 v7.0으로 업데이트
- **settings.local.json 재구성**: Claude Code 2.1 기능 활성화

### Upgrade Notes
1. `v6.0/` 폴더를 `v7.0/`으로 마이그레이션 필요
2. `.claude/commands/` → `.claude/skills/` 마이그레이션 필요
3. 패키지명 변경으로 인한 import 경로 수정 필요

---

## [6.0.5] - 2026-01-11

### Added
- **Blue-Green Slot 기반 무중단 배포** (Vercel 스타일)
  - `deploy`: 새 Slot에 컨테이너 배포 (기존 유지)
  - `promote`: Caddy 설정만 변경하여 트래픽 전환 (다운타임 0)
  - `rollback`: 이전 Slot으로 즉시 롤백 (Grace Period 내)
  - Preview URL로 테스트 후 promote 가능

- **Grace Period 시스템** (기본 48시간)
  - Promote 후 이전 컨테이너 48시간 유지
  - 롤백 필요 시 컨테이너 재배포 없이 즉시 전환
  - `GRACE_PERIOD_HOURS` 환경변수로 조정 가능

- **Slot 관리 API**
  - `slot_list`: 프로젝트별 Slot 상태 조회
  - `slot_status`: Slot 상세 정보 (컨테이너 상태, Grace Period 남은 시간)
  - `slot_cleanup`: Grace Period 만료된 Slot 정리

- **자동 도메인 생성** - 배포 시 자동 도메인 설정
  - `deploy` 시 `{projectName}.codeb.kr` (production) 자동 생성
  - `deploy` 시 `{projectName}-staging.codeb.kr` (staging) 자동 생성
  - `autoPromote: true` 옵션으로 배포 후 자동 promote

- **도메인 관리 API** - 팀원도 API로 도메인 관리 가능
  - `domain_setup`: 프로젝트 도메인 설정 (DNS + Caddy + SSL)
  - `domain_status`: 도메인 상태 조회 (DNS, Caddy, SSL)
  - `domain_list`: 전체 도메인 목록 조회
  - `domain_connect`: 커스텀 도메인 연결 (외부 도메인)

- **커스텀 도메인 지원**
  - 외부 도메인을 프로젝트에 연결
  - CNAME → app.codeb.kr 또는 A → 158.247.203.55 설정 안내
  - Caddy 자동 설정 및 SSL 자동 발급

### Changed
- **배포 전략 변경**: 컨테이너 교체 → Slot 기반 Blue-Green
- **롤백 방식 변경**: 이미지 재배포 → Caddy 설정 전환
- Slot 상태 파일 추가: `/opt/codeb/registry/slots.json`

## [3.1.0] - 2025-01-05

### Added
- **팀원 전체 라이프사이클 API 지원**
  - `create_project`: 프로젝트 생성 + SSOT 등록 + ENV 디렉토리 자동 생성
  - `get_project`: 프로젝트 상세 조회 + 컨테이너 상태
  - `env_init`: ENV 초기화 (master.env 생성)
  - `env_push`: ENV 업데이트 (보호 변수 자동 유지)
  - `rollback`: 이전 버전으로 롤백

- **Developer 권한 확장** (SSH 없이 API로 모든 작업 가능)
  - 배포/롤백: `deploy`, `rollback`
  - 프로젝트 관리: `create_project`, `list_projects`, `get_project`
  - ENV 관리: `env_init`, `env_push`, `env_scan`, `env_pull`, `env_backups`
  - 모니터링: `full_health_check`, `analyze_server`, `check_domain_status`

- **ENV 보안 강화**
  - 보호 변수 자동 유지: `DATABASE_URL`, `POSTGRES_*`, `REDIS_URL`
  - master.env는 최초 생성 후 불변
  - 팀원이 env_push해도 보호 변수는 master.env에서 복원

- **버전 관리 시스템**
  - `VERSION` 파일로 단일 버전 소스 관리
  - `scripts/bump-version.js` 버전 업데이트 스크립트
  - 모든 패키지 버전 통합 관리

### Changed
- MCP HTTP API Server 버전 2.0.0으로 업그레이드
- 모든 패키지 버전 3.1.0으로 통합
  - Root: 3.1.0
  - CLI: 3.1.0
  - API: 3.1.0
  - Web-UI: 3.1.0
  - Security: 3.1.0
  - Server-Scripts: 3.1.0

### Security
- ENV placeholder 검증 (CHANGE_ME, your_, GENERATE_ 등 차단)
- 보호 변수 자동 복원으로 팀원 실수 방지

## [3.0.24] - 2025-01-03

### Added
- MCP HTTP API Server 기본 구현
- CI/CD 파이프라인 (GitHub Actions)
- GitHub Package Registry 배포

### Fixed
- npm publish 시 GHCR_PAT 사용
- Tag 트리거로 CI/CD 워크플로우 실행

## [3.0.0] - 2024-12-20

### Added
- we-cli 초기 릴리즈
- MCP-First 아키텍처 (scan → up → deploy)
- 7-Agent 분석 시스템
- 4계층 보안 시스템
- Centrifugo 실시간 통신 통합
- Next.js 대시보드 (Web-UI)

### Infrastructure
- 4-서버 아키텍처
  - App Server (158.247.203.55)
  - Streaming Server (141.164.42.213)
  - Storage Server (64.176.226.119)
  - Backup Server (141.164.37.63)

---

[Unreleased]: https://github.com/codeb-dev-run/codeb-server/compare/v7.0.0...HEAD
[7.0.0]: https://github.com/codeb-dev-run/codeb-server/compare/v6.0.5...v7.0.0
[6.0.5]: https://github.com/codeb-dev-run/codeb-server/compare/v3.1.0...v6.0.5
[3.1.0]: https://github.com/codeb-dev-run/codeb-server/compare/v3.0.24...v3.1.0
[3.0.24]: https://github.com/codeb-dev-run/codeb-server/compare/v3.0.0...v3.0.24
[3.0.0]: https://github.com/codeb-dev-run/codeb-server/releases/tag/v3.0.0
