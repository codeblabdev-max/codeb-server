# CodeB v7.0 - Skills 사용 가이드

> Skills 시스템을 통한 배포 및 인프라 관리
>
> **문서 버전**: 8.0.0
> **최종 업데이트**: 2026-02-06

---

## 목차

1. [Skills 개요](#1-skills-개요)
2. [사용 가능한 Skills](#2-사용-가능한-skills)
3. [올바른 사용법](#3-올바른-사용법)
4. [알려진 문제점](#4-알려진-문제점)
5. [프로젝트별 배포 방법](#5-프로젝트별-배포-방법)

---

## 1. Skills 개요

### 1.1 Skills 시스템이란?

Skills는 Claude Code 2.1의 자동 활성화 명령 시스템입니다. 특정 키워드를 입력하면 관련 스킬이 자동으로 활성화됩니다.

```
사용자: "배포해줘"
→ we:deploy 스킬 자동 활성화
→ MCP API 호출
→ Blue-Green 배포 실행
```

### 1.2 Skills 위치

```
cli/skills/we/
├── init.md       # /we:init - 프로젝트 초기화
├── quick.md      # /we:quick - One-Shot 설정
├── deploy.md     # /we:deploy - 배포
├── domain.md     # /we:domain - 도메인 관리
├── rollback.md   # /we:rollback - 롤백
├── health.md     # /we:health - 헬스체크
└── workflow.md   # /we:workflow - CI/CD 워크플로우
```

---

## 2. 사용 가능한 Skills

### 2.1 `/we:init` - 프로젝트 초기화

**활성화 키워드**: 초기화, init, 새 프로젝트, 인프라 생성

**사용 도구**:
- `mcp__codeb-deploy__workflow_init`
- `mcp__codeb-deploy__workflow_scan`
- `mcp__codeb-deploy__health_check`

**생성되는 리소스**:
- DB SSOT 등록 (projects 테이블)
- Blue-Green 슬롯 (blue/green)
- 포트 자동 할당 (3001~9999)
- 환경변수 파일 (.env)
- Caddy 리버스 프록시 설정
- PowerDNS A 레코드 (*.codeb.kr)

**사용 예시**:
```
/we:init
또는
"새 프로젝트 초기화해줘"
```

---

### 2.2 `/we:quick` - One-Shot 설정

**활성화 키워드**: 퀵, quick, 원샷, 빠른 설정

**흐름**:
```
헬스체크 → SSOT 확인 → 인프라 초기화 → 배포
```

> **⚠️ 알려진 문제**: `domain_setup` 단계가 포함되어 있으나, 슬롯 정보가 없어 실패합니다.
> `workflow_init`이 이미 도메인 설정을 처리하므로 `domain_setup`은 불필요합니다.
> 자세한 내용은 [KNOWN-ISSUES.md](./KNOWN-ISSUES.md#2-wequick-스킬-순서-문제) 참조.

**사용 예시**:
```
/we:quick
또는
"한번에 설정해줘"
```

---

### 2.3 `/we:deploy` - 배포

**활성화 키워드**: 배포, deploy, 릴리즈, 프로덕션 올려

**사용 도구**:
- `mcp__codeb-deploy__deploy_project`
- `mcp__codeb-deploy__slot_promote`
- `mcp__codeb-deploy__slot_status`

> **⚠️ 중요**: GitHub Actions가 있는 프로젝트(workb, heeling 등)는 `/we:deploy` 대신 `git push`를 사용하세요!

**프로젝트 유형별 사용법**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    /we:deploy 사용 시 주의사항                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GitHub Actions 워크플로우가 있는 프로젝트 (workb, heeling)      │
│  ───────────────────────────────────────────────────────────    │
│  ❌ /we:deploy 사용하지 마세요!                                 │
│  ✅ git push origin main 사용                                   │
│     → GitHub Actions가 자동으로 빌드 & 배포                     │
│     → Preview URL 반환 후 /we:promote                          │
│                                                                 │
│  GitHub Actions가 없는 프로젝트                                  │
│  ───────────────────────────────────────────────────────────    │
│  ✅ /we:deploy 사용 가능                                        │
│     → 단, image 파라미터 필요                                   │
│     → 또는 /we:workflow로 워크플로우 생성 후 git push 사용      │
│                                                                 │
│  codeb-server (인프라 자체)                                     │
│  ───────────────────────────────────────────────────────────    │
│  ❌ /we:deploy 사용하지 마세요!                                 │
│  ✅ ./scripts/deploy-all.sh 사용                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**사용 예시**:
```
/we:deploy
또는
"프로덕션에 배포해줘"
```

---

### 2.4 `/we:promote` - 트래픽 전환

**활성화 키워드**: 프로모트, promote, 전환, 라이브

**설명**: 비활성 슬롯(Preview)의 트래픽을 프로덕션으로 전환합니다.

**사용 예시**:
```
/we:promote projectName
또는
"워크비 프로모트해줘"
```

---

### 2.5 `/we:rollback` - 롤백

**활성화 키워드**: 롤백, rollback, 되돌려

**설명**: Grace 슬롯 (이전 버전)으로 즉시 롤백합니다.

**사용 예시**:
```
/we:rollback projectName
또는
"워크비 롤백해줘"
```

---

### 2.6 `/we:domain` - 도메인 관리

**활성화 키워드**: 도메인, domain, DNS, SSL

**사용 도구**:
- `mcp__codeb-deploy__domain_setup`
- `mcp__codeb-deploy__domain_list`
- `mcp__codeb-deploy__domain_delete`

> **⚠️ 알려진 문제**: `domain_setup`은 슬롯 정보가 필요합니다. 배포 전에는 동작하지 않습니다.
> 자세한 내용은 [KNOWN-ISSUES.md](./KNOWN-ISSUES.md#4-domain_setup-의존성-문제) 참조.

**지원 도메인**:
- `*.codeb.kr` - 자동 DNS + PowerDNS
- 커스텀 도메인 - 수동 DNS 설정 필요

**사용 예시**:
```
/we:domain setup myapp.codeb.kr
또는
"도메인 설정해줘"
```

---

### 2.7 `/we:health` - 헬스체크

**활성화 키워드**: 헬스, health, 상태, 점검

**사용 도구**:
- `mcp__codeb-deploy__health_check`

**사용 예시**:
```
/we:health
또는
"시스템 상태 확인해줘"
```

---

### 2.8 `/we:workflow` - CI/CD 워크플로우

**활성화 키워드**: 워크플로우, workflow, CI/CD, 액션

**설명**: GitHub Actions 워크플로우 파일을 생성합니다.

**사용 예시**:
```
/we:workflow init myproject
또는
"CI/CD 설정해줘"
```

---

## 3. 올바른 사용법

### 3.1 신규 프로젝트 설정

```bash
# 1단계: 프로젝트 초기화
/we:init
→ 서버 리소스 생성 (포트, DB, Redis, ENV, Caddy, DNS)

# 2단계: GitHub Actions 워크플로우 생성
/we:workflow init myproject
→ .github/workflows/deploy.yml 생성

# 3단계: GitHub Secrets 설정
- CODEB_API_KEY
- MINIO_ACCESS_KEY
- MINIO_SECRET_KEY

# 4단계: git push로 배포
git add -A && git commit -m "feat: initial deploy" && git push

# 5단계: Preview URL 확인 후 프로모트
/we:promote myproject
```

### 3.2 기존 프로젝트 배포 (GitHub Actions 있음)

```bash
# 1단계: 코드 수정 후 푸시
git add -A && git commit -m "feat: new feature" && git push

# GitHub Actions가 자동으로:
# - Self-Hosted Runner에서 빌드
# - Private Registry에 푸시
# - MCP API로 배포
# - Preview URL 반환

# 2단계: Preview URL 확인 후 프로모트
/we:promote myproject

# 문제 발생 시 롤백
/we:rollback myproject
```

### 3.3 커스텀 도메인 추가

```bash
# 배포가 완료된 후에만 가능!
/we:domain setup custom.example.com

# 외부 DNS 설정 필요:
# A 레코드: 158.247.203.55
# 또는 CNAME: app.codeb.kr
```

---

## 4. 알려진 문제점

| 문제 | 설명 | 해결 방안 |
|------|------|----------|
| **we:quick 순서 오류** | domain_setup이 배포 전에 호출되어 실패 | workflow_init이 이미 도메인 처리 |
| **we:deploy 이미지 없음** | GitHub Actions 없이 deploy_project 호출 시 이미지 없음 | git push로 빌드 트리거 |
| **domain_setup 의존성** | 슬롯 정보 없이 동작하지 않음 | 배포 후에만 사용 |

자세한 내용은 [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) 참조.

---

## 5. 프로젝트별 배포 방법

### 5.1 배포 방법 요약

| 프로젝트 | 배포 방법 | Skills 사용 |
|----------|----------|------------|
| **workb** | `git push` | `/we:promote`, `/we:rollback` 만 |
| **heeling** | `git push` | `/we:promote`, `/we:rollback` 만 |
| **codeb-server** | `./deploy-all.sh` | 사용 금지 |
| **신규 프로젝트** | `/we:init` → `git push` | 초기화 시만 |

### 5.2 workb/heeling 배포

```bash
# 배포
git push origin main
# GitHub Actions가 자동으로 빌드 & 배포

# 프로모트
/we:promote workb

# 롤백
/we:rollback workb
```

### 5.3 codeb-server 배포

```bash
# 수동 배포만 사용!
./scripts/deploy-all.sh

# Skills 사용 금지
# ❌ /we:deploy
# ❌ /we:init
```

---

## 관련 문서

- [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) - 알려진 문제점 및 해결 방안
- [deployment-guide.md](./deployment-guide.md) - 배포 가이드
- [DEPLOY-FLOW.md](./DEPLOY-FLOW.md) - 배포 플로우 상세
- [../CLAUDE.md](../CLAUDE.md) - Claude Code 규칙
