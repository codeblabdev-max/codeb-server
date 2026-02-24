# CodeB Hybrid Deployment - 배포 타입 상세 문서

> 3가지 배포 타입의 아키텍처, 설정, 사용법 상세 가이드

---

## 목차

1. [개요](#1-개요)
2. [공통 단계 (로컬 MCP)](#2-공통-단계-로컬-mcp)
3. [Type 1: Self-hosted Runner](#3-type-1-self-hosted-runner)
4. [Type 2: GitHub-hosted + SSH](#4-type-2-github-hosted--ssh)
5. [Type 3: GitHub-hosted + API](#5-type-3-github-hosted--api)
6. [비교표](#6-비교표)
7. [트러블슈팅](#7-트러블슈팅)

---

## 1. 개요

### 1.1 하이브리드 배포 전략

```
┌─────────────────────────────────────────────────────────────────┐
│                    하이브리드 배포 아키텍처                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  공통 (로컬 MCP)                                                 │
│  ├─→ workflow_init: 프로젝트 초기화, SSOT 등록                  │
│  ├─→ env_sync: 환경변수 동기화                                   │
│  └─→ domain_setup: 도메인 설정                                   │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ GitHub Actions (3가지 배포 타입 선택)                        ││
│  │                                                             ││
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   ││
│  │  │ Self-hosted   │  │ SSH           │  │ API           │   ││
│  │  │               │  │               │  │               │   ││
│  │  │ 관리자        │  │ admin         │  │ 팀원          │   ││
│  │  └───────────────┘  └───────────────┘  └───────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 권한 매트릭스

| 역할 | Self-hosted | SSH | API |
|------|:-----------:|:---:|:---:|
| **owner** | ✅ | ✅ | ✅ |
| **admin** | ✅ | ✅ | ✅ |
| **member** | ❌ | ❌ | ✅ |
| **viewer** | ❌ | ❌ | ❌ |

---

## 2. 공통 단계 (로컬 MCP)

모든 배포 타입에서 공통으로 실행해야 하는 초기 설정:

### 2.1 프로젝트 초기화

```bash
# Claude Code에서 실행
/we:workflow init myapp
```

이 명령은:
- SSOT에 프로젝트 등록 (`/opt/codeb/registry/ssot.json`)
- Blue/Green 포트 할당 (예: 4100, 4101)
- PostgreSQL 데이터베이스 생성
- Redis DB 번호 할당
- 초기 슬롯 레지스트리 생성

### 2.2 환경변수 동기화

```bash
# 로컬 .env.production → 서버 동기화
/we:env sync
```

환경변수는 서버의 `/opt/codeb/projects/{project}/.env.production`에 저장됩니다.

### 2.3 도메인 설정

```bash
# 도메인 설정 및 SSL 인증서 발급
/we:domain setup myapp.codeb.kr
```

---

## 3. Type 1: Self-hosted Runner

### 3.1 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    Self-hosted Runner 방식                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GitHub                              App Server (158.247.203.55)│
│  ┌──────────────┐                   ┌──────────────────────────┐│
│  │ Workflow     │                   │ Self-hosted Runner       ││
│  │ Trigger      │ ──runs-on───────→ │ ├─ docker build         ││
│  │              │                   │ ├─ docker push (GHCR)   ││
│  │              │                   │ ├─ docker pull          ││
│  │              │                   │ ├─ docker run           ││
│  │              │                   │ └─ Caddy reload         ││
│  └──────────────┘                   └──────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 장점

- ✅ 서버에서 직접 실행 - 가장 빠른 배포
- ✅ Docker 소켓 직접 접근
- ✅ SSOT 파일 직접 읽기/쓰기
- ✅ Secrets가 서버에서만 존재
- ✅ 복잡한 커스텀 로직 가능

### 3.3 단점

- ⚠️ Runner 프로세스 관리 필요
- ⚠️ Runner 업데이트 필요
- ⚠️ 서버 리소스 사용
- ⚠️ Runner 장애 시 배포 불가

### 3.4 설정

**Runner 설치** (서버에서):

```bash
# GitHub → Settings → Actions → Runners → New self-hosted runner

# 다운로드 및 설치
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-2.xxx.tar.gz -L https://github.com/actions/runner/releases/download/v2.xxx/...
tar xzf ./actions-runner-linux-x64-2.xxx.tar.gz

# 구성
./config.sh --url https://github.com/org/repo --token XXXXX

# 서비스로 실행
sudo ./svc.sh install
sudo ./svc.sh start
```

**워크플로우 생성**:

```bash
./hybrid/scripts/generate-workflow.sh myapp self-hosted
```

### 3.5 필요한 Secrets

| Secret | 필수 | 설명 |
|--------|:----:|------|
| `GHCR_TOKEN` | ❌ | GITHUB_TOKEN 사용 가능 |

---

## 4. Type 2: GitHub-hosted + SSH

### 4.1 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│              GitHub-hosted Runner + SSH 방식                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GitHub (Ubuntu Runner)              App Server                 │
│  ┌──────────────────────────┐       ┌──────────────────────────┐│
│  │ 1. Checkout              │       │                          ││
│  │ 2. npm build             │       │                          ││
│  │ 3. docker build          │       │                          ││
│  │ 4. docker push (GHCR)    │       │                          ││
│  │ 5. SSH ──────────────────────→   │ docker pull & run       ││
│  │    appleboy/ssh-action   │       │                          ││
│  └──────────────────────────┘       └──────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 장점

- ✅ Self-hosted Runner 관리 불필요
- ✅ GitHub 무료 분수 활용 (월 2000분)
- ✅ 서버 직접 제어 가능
- ✅ SSOT 파일 접근 가능
- ✅ 커스텀 스크립트 실행 가능

### 4.3 단점

- ⚠️ SSH 키 관리 필요
- ⚠️ 네트워크 레이턴시
- ⚠️ SSH 포트 노출 (방화벽 필요)
- ⚠️ admin 권한만 사용 가능

### 4.4 설정

**SSH 키 생성**:

```bash
# Ed25519 키 생성 (권장)
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github-deploy

# 서버에 공개키 추가
ssh-copy-id -i ~/.ssh/github-deploy.pub deploy@158.247.203.55
```

**GitHub Secrets 설정**:

```bash
# 방법 1: gh CLI
gh secret set SERVER_HOST <<< "158.247.203.55"
gh secret set SERVER_USER <<< "deploy"
gh secret set SSH_PRIVATE_KEY < ~/.ssh/github-deploy

# 방법 2: 대화형
./hybrid/scripts/setup-secrets.sh myapp ssh --set
```

**워크플로우 생성**:

```bash
./hybrid/scripts/generate-workflow.sh myapp ssh
```

### 4.5 필요한 Secrets

| Secret | 필수 | 설명 | 예시 |
|--------|:----:|------|------|
| `SERVER_HOST` | ✅ | 서버 IP | `158.247.203.55` |
| `SERVER_USER` | ✅ | SSH 사용자 | `deploy` |
| `SSH_PRIVATE_KEY` | ✅ | SSH 개인키 | `-----BEGIN OPENSSH...` |

---

## 5. Type 3: GitHub-hosted + API

### 5.1 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│              GitHub-hosted Runner + CodeB API 방식               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GitHub (Ubuntu)      CodeB API      App Server                 │
│  ┌────────────────┐  ┌────────────┐  ┌──────────────────────────┐│
│  │ 1. Checkout    │  │            │  │                          ││
│  │ 2. npm build   │  │   MCP      │  │                          ││
│  │ 3. docker push │  │   API      │  │                          ││
│  │ 4. curl ───────────→ 9101 ───────→│ docker pull & run       ││
│  │    deploy_project  │            │  │                          ││
│  └────────────────┘  └────────────┘  └──────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 장점

- ✅ 가장 간단한 설정
- ✅ SSH 키 관리 불필요
- ✅ Blue-Green 배포 완벽 지원 (API 내장)
- ✅ 롤백 한 줄로 가능
- ✅ Team RBAC 자동 적용
- ✅ CodeB 대시보드 모니터링

### 5.3 단점

- ⚠️ API 서버 장애 시 배포 불가
- ⚠️ SSOT 직접 접근 불가 (API 경유)
- ⚠️ 복잡한 커스텀 로직 제한

### 5.4 설정

**API 키 발급**:

```bash
# Claude Code에서 실행
/we:token create myapp member
```

**GitHub Secrets 설정**:

```bash
# gh CLI
gh secret set CODEB_API_KEY

# 또는 대화형
./hybrid/scripts/setup-secrets.sh myapp api --set
```

**워크플로우 생성**:

```bash
./hybrid/scripts/generate-workflow.sh myapp api
```

### 5.5 필요한 Secrets

| Secret | 필수 | 설명 | 예시 |
|--------|:----:|------|------|
| `CODEB_API_KEY` | ✅ | CodeB API 키 | `codeb_team123_member_abc...` |

### 5.6 API 엔드포인트

| 도구 | 설명 |
|------|------|
| `deploy_project` | 비활성 슬롯에 배포 |
| `slot_promote` | 트래픽 전환 |
| `rollback` | 이전 버전 복원 |
| `slot_status` | 슬롯 상태 조회 |

---

## 6. 비교표

### 6.1 기능 비교

| 기능 | Self-hosted | SSH | API |
|------|:-----------:|:---:|:---:|
| **배포** | ✅ | ✅ | ✅ |
| **프로모트** | ✅ | ✅ | ✅ |
| **롤백** | ✅ | ✅ | ✅ |
| **Blue-Green** | ✅ 직접 구현 | ✅ 스크립트 | ✅ 내장 |
| **SSOT 접근** | ✅ 직접 | ✅ SSH | ❌ API |
| **커스텀 로직** | ✅ 완전 | ✅ 가능 | ⚠️ 제한 |
| **Health Check** | ✅ 직접 | ✅ SSH | ✅ 내장 |

### 6.2 운영 비교

| 항목 | Self-hosted | SSH | API |
|------|:-----------:|:---:|:---:|
| **설정 복잡도** | 높음 | 중간 | 낮음 |
| **유지보수** | 높음 | 낮음 | 낮음 |
| **배포 속도** | 빠름 | 중간 | 빠름 |
| **보안 수준** | 높음 | 중간 | 높음 |
| **장애 대응** | 직접 | SSH | 제한 |

### 6.3 비용 비교

| 항목 | Self-hosted | SSH | API |
|------|:-----------:|:---:|:---:|
| **GitHub Actions** | 무료 | 월 2000분 무료 | 월 2000분 무료 |
| **서버 리소스** | Runner 사용 | 없음 | 없음 |

### 6.4 권장 사용 시나리오

| 시나리오 | 권장 타입 |
|---------|----------|
| 인프라팀 관리 | Self-hosted |
| admin 긴급 배포 | SSH |
| 팀원 일상 배포 | API |
| API 장애 시 fallback | SSH |
| 복잡한 마이그레이션 | Self-hosted |

---

## 7. 트러블슈팅

### 7.1 Self-hosted Runner 문제

**Runner가 Offline 상태**:
```bash
# 서버에서 확인
cd ~/actions-runner
./svc.sh status

# 재시작
./svc.sh stop
./svc.sh start
```

**Runner 업데이트 필요**:
```bash
# 최신 버전 다운로드 및 설치
./svc.sh stop
# GitHub 안내에 따라 업데이트
./svc.sh start
```

### 7.2 SSH 연결 문제

**Permission denied**:
```bash
# 키 권한 확인
ls -la ~/.ssh/github-deploy
# -rw------- 이어야 함

chmod 600 ~/.ssh/github-deploy
```

**Host key verification failed**:
```bash
# known_hosts에 추가
ssh-keyscan 158.247.203.55 >> ~/.ssh/known_hosts
```

### 7.3 API 호출 문제

**401 Unauthorized**:
- API 키가 올바른지 확인
- API 키 만료 여부 확인
- 역할 권한 확인 (member 이상 필요)

**Connection refused**:
```bash
# API 서버 상태 확인
curl https://api.codeb.kr/health
```

### 7.4 배포 실패

**Health check 실패**:
```bash
# 컨테이너 로그 확인
docker logs myapp-blue

# 포트 확인
curl http://localhost:4100/health
```

**이미지 pull 실패**:
```bash
# GHCR 로그인 확인
docker login ghcr.io

# 이미지 존재 확인
docker pull ghcr.io/org/myapp:latest
```

---

## 부록: 워크플로우 커스터마이징

### A. 다중 환경 배포

```yaml
# staging과 production 분리
jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    # ...

  deploy-production:
    if: github.ref == 'refs/heads/main'
    # ...
```

### B. 자동 프로모트

```yaml
# 배포 후 자동 프로모트
deploy:
  # ...

promote:
  needs: deploy
  if: success() && github.event.inputs.auto_promote == 'true'
  # ...
```

### C. Slack 알림

```yaml
- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    channel-id: 'C0XXXXXXX'
    slack-message: 'Deployed ${{ env.PROJECT_NAME }} v${{ needs.build.outputs.version }}'
  env:
    SLACK_BOT_TOKEN: ${{ secrets.SLACK_TOKEN }}
```

---

> **문서 끝** | 버전: VERSION 파일 참조
