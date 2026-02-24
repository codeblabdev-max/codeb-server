# CLAUDE.md v8.0.0 -- CodeB Project Rules

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
# 배포 (git push 기반 — deploy_project MCP 직접 호출 금지)
/we:deploy                     # git commit & push → Actions 모니터링
/we:deploy myapp               # 특정 프로젝트 배포

# 트래픽 전환 & 롤백 (MCP 직접 호출 OK)
/we:promote myapp              # 트래픽 전환 (무중단)
/we:rollback myapp             # 즉시 롤백

# 모니터링
/we:health                     # 전체 시스템 헬스체크
/we:monitor myapp              # 실시간 모니터링

# 인프라
/we:domain setup myapp.codeb.kr   # 도메인 설정
/we:workflow init myapp           # CI/CD 워크플로우 생성 (Minio S3 캐시)

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

### Tool 목록 (39개)

| 카테고리 | Tool | 설명 |
|---------|------|------|
| **Deploy** | deploy, deploy_project, promote, slot_promote, rollback | Blue-Green 배포 |
| **Slot** | slot_status, slot_cleanup, slot_list | Slot 관리 |
| **Domain** | domain_setup, domain_list, domain_delete, domain_verify, ssl_status | 도메인 + DNS + SSL |
| **Project** | workflow_init, workflow_scan, workflow_generate, scan | 프로젝트 초기화 |
| **ENV** | env_sync, env_get, env_scan, env_restore | 환경변수 관리 |
| **Team** | team_create, team_list, team_get, team_delete, team_settings | 팀 관리 |
| **Member** | member_invite, member_remove, member_list | 멤버 관리 |
| **Token** | token_create, token_revoke, token_list | API 토큰 관리 |
| **Task** | task_create, task_list, task_get, task_update, task_check, task_complete | 작업 관리 + 충돌 방지 |
| **Utility** | health_check | 인프라 상태

---

## 작업 관리 시스템 (Task + Worktree)

> **Hook이 자동 강제합니다. CLAUDE.md 규칙이 아닌 시스템 레벨 차단.**

### 작업 플로우

```
┌─────────────────────────────────────────────────────────────────┐
│              팀원 작업 플로우 (Task + Worktree)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 작업 시작 (충돌 검증 먼저)                                    │
│     └─→ task_create (MCP) → DB에서 기존 작업과 비교              │
│         ├─→ 충돌 있음 → ⛔ 등록 거부 (작업 불가)                │
│         └─→ 충돌 없음 → ✅ 등록 + 파일 잠금                    │
│              └─→ claude --worktree task-<ID> 로 독립 작업        │
│                                                                 │
│  2. 작업 중 (Hook 이중 검증)                                      │
│     └─→ Edit/Write 시 PreToolUse Hook 자동 실행                  │
│     └─→ task_check → DB 실시간 조회 → 충돌 시 차단              │
│                                                                 │
│  3. 작업 완료 → git push (worktree 브랜치)                       │
│     └─→ PostToolUse Hook → status: "pushed"                     │
│                                                                 │
│  4. GitHub Actions 자동 배포                                      │
│     └─→ Build → Deploy → 성공 시:                               │
│         ├─→ task_complete → 파일 잠금 해제                       │
│         └─→ worktree 브랜치 → main 자동 merge                   │
│                                                                 │
│  5. 다음 팀원                                                    │
│     └─→ task_create → 충돌 없음 → 작업 가능                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Claude Code 필수 규칙

```
1. 파일 수정 전 → task_check 자동 실행 (Hook 강제, 우회 불가)
2. 작업 시작 시 → task_create로 DB 등록 (충돌 시 등록 거부)
3. 작업은 반드시 worktree에서 → claude --worktree task-<ID>
4. push는 worktree 브랜치로 → git push origin worktree-task-<ID>
5. main 직접 push 금지 → GitHub Actions가 auto merge 처리
```

### CLI 명령어

```bash
# 작업 관리
we task create "제목" --project myapp --files src/auth.ts
we task list                   # 진행중 작업 + 잠금 파일 확인
we task check --files src/auth.ts,src/db.ts  # 충돌 사전 확인
we task status <id>            # 상세 조회 (MD 문서 포함)
we task update <id> --note "auth.ts 수정 완료"
we task done <id>              # 수동 완료 (배포 후 자동 완료 권장)
```

### Worktree 사용법

```bash
# 작업 시작 (task_create 후)
claude --worktree task-1111    # .claude/worktrees/task-1111/ 에서 독립 작업

# 여러 팀원 동시 작업
# 터미널 1: claude --worktree task-1111  (팀원A: 인증)
# 터미널 2: claude --worktree task-2222  (팀원B: API)
# 터미널 3: claude --worktree task-3333  (팀원C: UI)

# 작업 완료 후
git push origin worktree-task-1111  # GitHub Actions 자동 배포 + merge
```

---

## Critical Rules

### Git 협업 규칙 (필수)

```bash
# Worktree 브랜치에서 작업 (main 직접 push 금지)
claude --worktree task-<ID>           # worktree에서 작업
git push origin worktree-task-<ID>    # worktree 브랜치로 push
# → GitHub Actions가 배포 성공 후 자동 merge to main

# main 직접 작업 시 (worktree 없이)
git pull origin main                  # 항상 먼저 실행
git add <파일>
git commit -m "[이름] type: 설명"
git push origin main
```

> **Claude Code는 커밋 요청 시 반드시 `git pull origin main`을 먼저 실행한다.**
> 충돌 발생 시 사용자에게 알리고 해결 후 커밋한다.

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

# 작업 관리
we task create "제목" --project <name> --files <paths>
we task list
we task check --files <paths>

# 상태 확인
/we:health                     # 전체 시스템 헬스체크
```

---

## CI/CD 배포 시스템 (GitHub Actions + Minio S3 캐시)

### 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│          GitHub Actions CI/CD (Minio S3 Cache)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [로컬] ──git push──→ [GitHub Actions] ──→ [Self-Hosted Runner] │
│                                                    │            │
│                                             ┌──────┴──────┐     │
│                                             │   Docker    │     │
│                                             │   Buildx    │     │
│                                             └──────┬──────┘     │
│                                                    │            │
│                                     ┌──────────────┼──────────┐ │
│                                     │ Minio S3     │ Private  │ │
│                                     │ Cache        │ Registry │ │
│                                     │ :9000        │ :5000    │ │
│                                     └──────────────┼──────────┘ │
│                                                    │            │
│                                                    ▼            │
│                              ┌─────────────────────────────┐    │
│                              │ curl MCP API → Blue-Green   │    │
│                              │ Deploy (커밋 SHA 이미지)     │    │
│                              └─────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 핵심 원칙

- **배포 = git push**. `deploy_project` MCP를 직접 호출하지 않는다.
- GHCR이 아닌 **Private Registry** (64.176.226.119:5000)
- 빌드 캐시는 **Minio S3** (64.176.226.119:9000)

### 배포 방법 (Git Push = 자동 배포)

```bash
# 코드 수정 후 커밋 & 푸시 (자동 배포)
git add <파일> && git commit -m "feat: 새로운 기능" && git push

# GitHub Actions가 자동으로:
# 1. Docker Buildx + Minio S3 캐시로 빌드
# 2. Private Registry (64.176.226.119:5000)에 푸시
# 3. curl MCP API → Blue-Green 배포 (커밋 SHA 태그)
# 4. Preview URL 반환 → promote 대기
```

### Minio S3 캐시 전략

```
┌─────────────────────────────────────────────────────────────────┐
│                    Minio S3 캐시 빌드                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  docker buildx build                                            │
│    --cache-from type=s3,bucket=docker-cache,name=<프로젝트>     │
│    --cache-to type=s3,bucket=docker-cache,name=<프로젝트>,max   │
│    -t 64.176.226.119:5000/<프로젝트>:<커밋SHA>                  │
│    -t 64.176.226.119:5000/<프로젝트>:latest                     │
│    --push                                                       │
│                                                                 │
│  Minio S3: 64.176.226.119:9000 (bucket: docker-cache)          │
│  Registry: 64.176.226.119:5000 (HTTP, insecure)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 워크플로우 생성

```bash
# /we:workflow 명령으로 자동 생성
/we:workflow init <project-name>

# 생성되는 파일:
# .github/workflows/deploy.yml (Minio S3 캐시 포함)
```

### 워크플로우 액션

| 액션 | 트리거 | 설명 |
|------|--------|------|
| **deploy** | git push / workflow_dispatch | Docker Buildx → Registry Push → 비활성 Slot 배포 |
| **promote** | workflow_dispatch / MCP 직접호출 | 트래픽 전환 |
| **rollback** | workflow_dispatch / MCP 직접호출 | 즉시 롤백 |

### 수동 트리거

```bash
# GitHub CLI로 수동 배포
gh workflow run deploy.yml -f action=deploy

# promote / rollback
gh workflow run deploy.yml -f action=promote
gh workflow run deploy.yml -f action=rollback
```

### 필수 GitHub Secrets

| Secret | 설명 |
|--------|------|
| `CODEB_API_KEY` | MCP API 키 |
| `MINIO_ACCESS_KEY` | Minio S3 Access Key |
| `MINIO_SECRET_KEY` | Minio S3 Secret Key |

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
your-project/
├── .github/
│   └── workflows/
│       └── deploy.yml         # GitHub Actions CI/CD
├── src/                       # 소스코드
├── Dockerfile                 # Docker 빌드 설정
└── package.json

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

---

## 팀원 온보딩 (Git + Claude Code + MCP)

### Git 협업 규칙

> **main 브랜치에 직접 push 불가 (브랜치 보호 규칙 적용됨)**
> 반드시 **feature 브랜치 -> PR -> Merge** 순서로 진행
> 상세 가이드: [CONTRIBUTING.md](CONTRIBUTING.md)

```bash
# 작업 순서
git checkout main && git pull                    # 최신 코드
git checkout -b feature/이름-작업내용            # 브랜치 생성
# ... 코드 수정 ...
git commit -m "[이름] feat: 작업 내용"           # 커밋
git push -u origin feature/이름-작업내용         # 푸시
# GitHub에서 PR 생성 -> Merge
```

### 커밋 메시지 형식

```
[이름] type: 설명

type: feat | fix | refactor | style | docs | chore | test
```

### Claude Code CLI 설치

```bash
# Step 1: Claude Code 설치
npm install -g @anthropic-ai/claude-code

# Step 2: CodeB CLI + MCP 서버 설치
npm install -g @codeblabdev-max/we-cli

# Step 3: MCP 서버 글로벌 등록
claude mcp add codeb-deploy \
  --command node \
  --args "/opt/homebrew/lib/node_modules/@codeblabdev-max/we-cli/bin/codeb-mcp.js" \
  --env CODEB_API_URL=https://api.codeb.kr

# Step 4: API 키 설정 (팀 리드에게 발급받기)
# ~/.claude/settings.json 또는 환경변수로 설정
export CODEB_API_KEY=codeb_팀ID_역할_토큰

# Step 5: 확인
claude              # Claude Code 실행
/we:health          # MCP 연결 테스트
```

### MCP 서버 설정 (수동)

`~/.claude/settings.json`에 아래 내용 추가:

```json
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["/opt/homebrew/lib/node_modules/@codeblabdev-max/we-cli/bin/codeb-mcp.js"],
      "env": {
        "CODEB_API_URL": "https://api.codeb.kr"
      }
    }
  }
}
```

### 팀원 CLI 명령어 (Quick Reference)

```bash
# 배포 (git push 기반)
/we:deploy                     # 현재 프로젝트 배포
/we:deploy myapp               # 특정 프로젝트 배포

# 운영
/we:promote myapp              # 트래픽 전환 (무중단)
/we:rollback myapp             # 즉시 롤백
/we:health                     # 시스템 상태 확인

# 도메인
/we:domain setup myapp.codeb.kr

# 분석
/cb-analyze                    # 코드 분석
/cb-optimize                   # 최적화
```

### API 키 발급 (팀 리드)

```bash
# 팀원 초대 (관리자가 실행)
# MCP tool: member_invite
# 역할: admin | member | viewer

# API 토큰 생성
# MCP tool: token_create
# name: "팀원이름-dev"
# role: member
```
