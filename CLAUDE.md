# CLAUDE.md v7.0.59 - CodeB Project Rules

> 버전은 VERSION 파일에서 관리됩니다 (SSOT)

> **Claude Code 2.1 100% Integration + Blue-Green Deployment + Skills System + Advanced Hooks**

---

## v7.0 Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  CodeB v7.0 vs Vercel 비교                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Feature              │ Vercel │ CodeB v7.0 │ Rating            │
│  ─────────────────────┼────────┼────────────┼─────────────────  │
│  Blue-Green Deploy    │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  Zero-Downtime        │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  Instant Rollback     │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  Team RBAC            │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  Preview URL          │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  Edge Functions       │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  Analytics/Vitals     │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  CLI DX               │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  Claude Code 2.1      │   ❌   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  Skills System        │   ❌   │     ✅     │ ⭐⭐⭐⭐⭐        │
│  Advanced Hooks       │   ❌   │     ✅     │ ⭐⭐⭐⭐⭐        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## v7.0 주요 변경사항

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB v7.0 New Features                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Claude Code 2.1 100% Integration                            │
│     └─→ Skills System (Hot Reload 지원)                        │
│     └─→ PostToolUse / Stop / Agent Hooks                       │
│     └─→ context: fork (독립 컨텍스트 실행)                      │
│     └─→ once: true (세션당 1회 실행)                            │
│     └─→ Wildcard Bash Permissions                              │
│                                                                 │
│  2. Skills 시스템 (Commands 대체)                               │
│     └─→ .claude/skills/ 폴더 구조                              │
│     └─→ agent 필드로 실행 에이전트 지정                         │
│     └─→ Hook 연동 (PreToolUse, PostToolUse, Stop)              │
│     └─→ Hot Reload - 파일 수정 시 즉시 반영                     │
│                                                                 │
│  3. Advanced Hook System                                        │
│     └─→ pre-deploy.py - 배포 전 검증                           │
│     └─→ post-deploy.py - 배포 후 알림/메트릭                   │
│     └─→ post-promote.py - 트래픽 전환 후 알림                  │
│     └─→ post-rollback.py - 롤백 후 알림                        │
│     └─→ session-summary.py - 세션 종료 요약 (once)             │
│     └─→ agent-audit.py - 에이전트 감사 로깅                    │
│                                                                 │
│  4. Timeout 연장 (2.1 지원)                                     │
│     └─→ Hook timeout: 60초 → 600초 (10분)                      │
│     └─→ 대용량 출력 디스크 저장 (절단 없음)                     │
│                                                                 │
│  5. 언어 설정                                                   │
│     └─→ "language": "ko" - 한글 응답 기본                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Skills System (Claude Code 2.1)

### Skills 폴더 구조

```
.claude/skills/
├── deploy/
│   ├── deploy.md         # /we:deploy
│   ├── promote.md        # /we:promote
│   └── rollback.md       # /we:rollback
├── monitoring/
│   ├── health.md         # /we:health
│   └── monitor.md        # /we:monitor
└── infrastructure/
    ├── domain.md         # /we:domain
    └── workflow.md       # /we:workflow
```

### Skill 파일 형식 (v7.0)

```yaml
---
name: deploy
description: "Blue-Green 배포"
agent: Bash                    # 실행 에이전트 지정
context: fork                  # 독립 컨텍스트
allowed-tools:
  - mcp__codeb-deploy__*
hooks:
  PreToolUse:
    - matcher: mcp__codeb-deploy__deploy_project
      hooks:
        - type: command
          command: "python3 .claude/hooks/pre-deploy.py"
  PostToolUse:
    - matcher: mcp__codeb-deploy__deploy_project
      hooks:
        - type: command
          command: "python3 .claude/hooks/post-deploy.py"
---

# Skill 내용...
```

### Hot Reload

Skills 파일 수정 시 Claude Code 재시작 없이 즉시 반영됩니다.

```
09:00 - /we:deploy myapp (버전 1)
09:05 - skills/deploy/deploy.md 수정
09:06 - Claude Code 로그: "Skill 'deploy' reloaded"
09:07 - /we:deploy myapp (버전 2, 변경사항 적용됨)
```

---

## Hook System (Claude Code 2.1)

### Hook 구조

```
.claude/hooks/
├── pre-bash.py           # PreToolUse - 보안 검증
├── pre-deploy.py         # PreToolUse - 배포 전 검증
├── post-deploy.py        # PostToolUse - 배포 후 알림
├── post-promote.py       # PostToolUse - 프로모트 후 알림
├── post-rollback.py      # PostToolUse - 롤백 후 알림
├── session-summary.py    # Stop (once: true) - 세션 종료 요약
└── agent-audit.py        # Agent Hook - 에이전트 감사
```

### settings.local.json (v7.0)

```json
{
  "language": "ko",
  "permissions": {
    "allow": [
      "Bash(we *)",
      "Bash(docker *)",
      "Bash(git *)",
      "Bash(npm *)",
      "mcp__codeb-deploy__*"
    ],
    "deny": [
      "Bash(docker system prune -a *)",
      "Bash(docker volume prune -a *)",
      "Bash(rm -rf /opt/codeb *)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "python3 .claude/hooks/pre-bash.py",
          "timeout": 600
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__codeb-deploy__deploy_project",
        "hooks": [{
          "type": "command",
          "command": "python3 .claude/hooks/post-deploy.py",
          "timeout": 60
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "python3 .claude/hooks/session-summary.py",
          "once": true
        }]
      }
    ]
  }
}
```

---

## Blue-Green 배포

### 배포 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB v7.0 배포 흐름                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. /we:deploy myapp                                            │
│     └─→ PreToolUse Hook → pre-deploy.py 실행                   │
│     └─→ 비활성 Slot에 배포 → Preview URL 반환                   │
│     └─→ PostToolUse Hook → post-deploy.py (알림, 메트릭)       │
│                                                                 │
│  2. /we:promote myapp                                           │
│     └─→ Caddy 설정만 변경 → 무중단 트래픽 전환                   │
│     └─→ PostToolUse Hook → post-promote.py                     │
│     └─→ 이전 Slot → grace 상태 (48시간 유지)                    │
│                                                                 │
│  3. /we:rollback myapp                                          │
│     └─→ 즉시 이전 버전으로 롤백 (grace Slot 활성화)             │
│     └─→ PostToolUse Hook → post-rollback.py                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Slot 상태 다이어그램

```
┌──────────┐    deploy    ┌──────────┐   promote   ┌──────────┐
│  empty   │ ──────────→  │ deployed │ ─────────→  │  active  │
└──────────┘              └──────────┘             └──────────┘
                                                        │
                                                        │ promote (다른 slot)
                                                        ▼
                                                  ┌──────────┐
                                                  │  grace   │
                                                  │ (48시간) │
                                                  └──────────┘
```

---

## CLI Quick Reference (v7.0)

```bash
# Blue-Green 배포
/we:deploy                     # 현재 프로젝트 → Preview URL
/we:deploy myapp production    # 특정 프로젝트/환경
/we:promote myapp              # 트래픽 전환 (무중단)
/we:rollback myapp             # 즉시 롤백

# 모니터링
/we:health                     # 전체 시스템 헬스체크
/we:monitor myapp              # 실시간 모니터링

# 인프라
/we:domain setup myapp.codeb.kr   # 도메인 설정
/we:workflow init myapp           # CI/CD 워크플로우 생성

# 분석
/we:analyze                    # 전체 프로젝트 분석
/we:optimize                   # 프로젝트 최적화
```

---

## 4-Server Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CodeB 4-Server Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ App Server  │     │  Streaming  │     │   Storage   │       │
│  │ 158.247.    │     │ 141.164.    │     │  64.176.    │       │
│  │   203.55    │     │   42.213    │     │   226.119   │       │
│  │             │     │             │     │             │       │
│  │ • MCP API   │     │ • Centri-   │     │ • Postgres  │       │
│  │ • Caddy     │     │   fugo      │     │ • Redis     │       │
│  │ • Docker    │     │ • WebSocket │     │             │       │
│  │ • Edge RT   │     │             │     │             │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                   │
│                     ┌─────────────┐                             │
│                     │   Backup    │                             │
│                     │ 141.164.    │                             │
│                     │   37.63     │                             │
│                     │ • Prometheus│                             │
│                     │ • Grafana   │                             │
│                     └─────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| 역할 | IP | 도메인 | 서비스 |
|------|-----|--------|--------|
| **App** | 158.247.203.55 | api.codeb.kr | MCP API v7.0, Caddy, Docker |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket) |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis |
| **Backup** | 141.164.37.63 | backup.codeb.kr | Prometheus, Grafana |

---

## MCP API v7.0

### 엔드포인트

```
Primary:  https://api.codeb.kr/api
Health:   https://api.codeb.kr/health
```

### 인증

```bash
# API Key 형식
X-API-Key: codeb_{teamId}_{role}_{randomToken}

# 역할 계층
owner  - 팀 삭제, 모든 작업
admin  - 멤버 관리, 토큰 관리
member - 배포, promote, rollback
viewer - 조회만
```

### Tool 목록 (16개)

| 카테고리 | Tool | 설명 |
|---------|------|------|
| **Deploy** | deploy, deploy_project, promote, slot_promote, rollback | Blue-Green 배포 |
| **Slot** | slot_status, slot_cleanup, slot_list | Slot 관리 |
| **Domain** | domain_setup, domain_list, domain_delete | 도메인 관리 |
| **Project** | workflow_init, workflow_scan, scan | 프로젝트 초기화 |
| **Utility** | health_check | 인프라 상태

---

## Critical Rules

### 절대 금지 명령어

```bash
# Hooks가 자동 차단
docker system prune -a         # Docker 전체 정리
docker volume prune -a         # Docker 볼륨 전체 삭제
rm -rf /opt/codeb/*            # 프로젝트 폴더 삭제
rm -rf /var/lib/docker/*       # Docker 데이터 삭제
```

### 올바른 CLI 명령어

```bash
# Blue-Green 배포
/we:deploy <project>           # 비활성 Slot에 배포
/we:promote <project>          # 트래픽 전환
/we:rollback <project>         # 즉시 롤백

# 상태 확인
/we:health                     # 전체 시스템 헬스체크
```

---

## codeb-server 프로젝트 배포 (본 프로젝트 전용)

### 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                 codeb-server 수동 배포 시스템                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [로컬] ──./scripts/deploy-all.sh──→ [App Server + Storage]    │
│                                                                 │
│  배포 대상:                                                     │
│  ├── [1/5] 로컬 파일 버전 동기화 (package.json, CLAUDE.md)     │
│  ├── [2/5] Git 커밋 & 푸시 (백업용)                            │
│  ├── [3/5] API Server (Docker → Systemd)                       │
│  ├── [4/5] CLI Package (tarball → Minio)                       │
│  └── [5/5] SSOT Registry 업데이트                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 배포 방법 (수동 통합 배포)

```bash
# 단일 명령으로 API + CLI + Registry 모두 배포
./scripts/deploy-all.sh

# 버전 지정 배포
./scripts/deploy-all.sh 7.0.65
```

### 배포 규칙

> **중요**: codeb-server는 GitHub Actions 자동 배포를 사용하지 않습니다.
>
> - GitHub Actions 워크플로우 파일을 추가하지 마세요
> - `deploy-all.sh` 스크립트만 사용하세요
> - Git push는 백업 목적으로만 수행됩니다

### 버전 확인 방법

```bash
# 1. 로컬 VERSION 파일
cat VERSION

# 2. API Server 버전
curl -sf https://api.codeb.kr/health | jq '.version'

# 3. CLI Package 버전
curl -sf https://releases.codeb.kr/cli/version.json | jq '.version'

# 4. SSOT Registry
ssh root@158.247.203.55 "cat /opt/codeb/registry/versions.json"
```

### 버전 불일치 시 조치

1. **API 버전 불일치**: Docker 컨테이너 재배포
2. **CLI 버전 불일치**: Minio tarball 재업로드
3. **Git 버전 불일치**: 커밋 & 푸시

### 단일 버전 소스 (SSOT)

```
VERSION              # 루트의 VERSION 파일이 기준
```

### 동기화 대상 파일

| 파일 | 용도 |
|------|------|
| VERSION | SSOT 기준 |
| mcp-server/package.json | API 서버 |
| cli/package.json | CLI 패키지 |
| CLAUDE.md | 규칙 문서 |
| cli/rules/CLAUDE.md | 배포용 규칙 |

---

## 다른 프로젝트 배포 (workb, heeling 등)

### GitHub Actions CI/CD 방식

> **중요**: codeb-server 외의 모든 프로젝트는 GitHub Actions CI/CD를 사용합니다.

```
┌─────────────────────────────────────────────────────────────────┐
│               일반 프로젝트 GitHub Actions CI/CD                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [로컬] ──git push──→ [GitHub Actions] ──→ [Self-Hosted Runner] │
│                                                    │            │
│                                             ┌──────┴──────┐     │
│                                             │ Incremental │     │
│                                             │    Build    │     │
│                                             └──────┬──────┘     │
│                                                    │            │
│                                                    ▼            │
│                              ┌─────────────────────────────┐    │
│                              │ Docker Build → GHCR Push    │    │
│                              │ MCP API → Blue-Green Deploy │    │
│                              └─────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 배포 흐름

```bash
# 코드 수정 후 커밋 & 푸시 (자동 배포)
git add -A && git commit -m "feat: 새로운 기능" && git push

# GitHub Actions가 자동으로:
# 1. Incremental Build (GHCR 캐시 활용)
# 2. Docker 이미지 빌드 & GHCR 푸시
# 3. MCP API 호출 → Blue-Green 배포
# 4. Preview URL 반환 → promote 대기
```

### Incremental Build (캐시 최적화)

```yaml
# .github/workflows/deploy.yml 핵심 구조
- name: Calculate cache hashes
  run: |
    NPM_HASH=$(sha256sum package-lock.json | head -c 16)
    SRC_HASH=$(find src -type f | xargs cat | sha256sum | head -c 16)

- name: Check cache
  run: |
    # GHCR에서 캐시된 이미지 확인
    if docker manifest inspect "cache-${CACHE_KEY}" > /dev/null 2>&1; then
      echo "cache_hit=true"  # 빌드 스킵!
    fi

- name: Use cached image (skip build)
  if: cache_hit == 'true'
  run: |
    docker pull "$CACHED_IMAGE"
    docker tag "$CACHED_IMAGE" "$IMAGE_TAG"
    docker push "$IMAGE_TAG"
```

### 워크플로우 생성 방법

```bash
# /we:workflow 명령으로 자동 생성
/we:workflow init myproject

# 생성되는 파일:
# .github/workflows/deploy.yml (Incremental Build 포함)
```

### 프로젝트별 배포 방식 비교

| 프로젝트 | 배포 방식 | 트리거 | 캐시 |
|----------|----------|--------|------|
| **codeb-server** | 수동 (`deploy-all.sh`) | 직접 실행 | 없음 |
| **workb** | GitHub Actions | git push | GHCR |
| **heeling** | GitHub Actions | git push | GHCR |
| **기타 프로젝트** | GitHub Actions | git push | GHCR |

---

## Version

버전은 `VERSION` 파일에서 관리됩니다 (SSOT).

```bash
# 버전 확인
cat VERSION
curl -s https://api.codeb.kr/health | jq '.version'
```

- **Claude Code**: 2.1.x (Skills + Advanced Hooks)
- **CLI**: @codeblabdev-max/we-cli
- **MCP Server**: @codeblabdev-max/mcp-server
- **API Endpoint**: https://api.codeb.kr (16 tools)
- **CLI Download**: https://releases.codeb.kr/cli/install.sh
- **Container Runtime**: Docker

### 프로젝트 구조

```
codeb-server/
├── VERSION                    # SSOT (Single Source of Truth)
├── mcp-server/                # TypeScript MCP API Server
├── cli/                       # we CLI
│   └── mcp-proxy/             # MCP Proxy for Claude Code
└── scripts/                   # 배포 스크립트 (deploy-all.sh)
    # 주의: .github/workflows/ 사용하지 않음 (수동 배포만)

.claude/
├── settings.local.json        # v7.0 설정 (Docker 기반)
├── skills/                    # Skills 시스템
│   ├── deploy/
│   ├── monitoring/
│   ├── infrastructure/
│   └── analysis/
└── hooks/                     # Hook 시스템
    └── pre-bash.py            # 보안 검증
```

> 이 파일은 CLI 설치/업데이트 시 자동으로 최신 버전으로 교체됩니다.
