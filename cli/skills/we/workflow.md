---
name: we:workflow
description: "워크플로우", "workflow", "CI/CD", "GitHub Actions" 등의 요청 시 자동 활성화. 프로젝트 인프라 초기화 및 CI/CD 워크플로우를 생성합니다.
---

# we:workflow - 프로젝트 인프라 초기화 및 CI/CD 워크플로우 생성

## 활성화 키워드
- 워크플로우, workflow, CI/CD
- GitHub Actions, 깃헙 액션
- 프로젝트 초기화, 인프라 설정

## 사용 도구
- `mcp__codeb-deploy__workflow_init` - 서버 인프라 초기화 (신규 프로젝트)
- `mcp__codeb-deploy__workflow_scan` - 기존 설정 스캔
- `mcp__codeb-deploy__workflow_generate` - Private Registry 워크플로우 생성 (기존 프로젝트)

## 초기화 절차

### 1단계: 기존 설정 스캔
```
mcp__codeb-deploy__workflow_scan { "projectName": "프로젝트명" }
```
- 프로젝트가 DB SSOT에 등록되어 있는지 확인
- 미등록 시 팀 프로젝트 목록과 유사한 이름 제안

### 2단계: 워크플로우 초기화
```
mcp__codeb-deploy__workflow_init {
  "projectName": "프로젝트명",
  "type": "nextjs",
  "database": true,
  "redis": true
}
```

## 생성되는 리소스
- Blue-Green 슬롯 등록 (production)
- 포트 자동 할당
- DB SSOT 등록
- `.github/workflows/deploy.yml` (선택)

## 4-Server 아키텍처
| 서버 | IP | 역할 |
|------|-----|------|
| App | 158.247.203.55 | Docker, Caddy, MCP API |
| Storage | 64.176.226.119 | PostgreSQL, Redis |
| Streaming | 141.164.42.213 | Centrifugo WebSocket |
| Backup | 141.164.37.63 | Prometheus, Grafana |

## 관련 스킬
- `we:deploy` - Blue-Green 배포
- `we:health` - 시스템 상태 확인
- `we:domain` - 도메인 설정
