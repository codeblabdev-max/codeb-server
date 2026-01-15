# CodeB Hybrid Deployment System

> 3가지 배포 타입을 지원하는 하이브리드 배포 시스템

## 폴더 구조

```
hybrid/
├── README.md                          # 이 파일
├── templates/
│   └── workflows/
│       ├── deploy-self-hosted.yml     # Type 1: Self-hosted Runner
│       ├── deploy-ssh.yml             # Type 2: GitHub-hosted + SSH
│       └── deploy-api.yml             # Type 3: GitHub-hosted + API
├── scripts/
│   ├── generate-workflow.sh           # 워크플로우 생성 스크립트
│   └── setup-secrets.sh               # GitHub Secrets 설정 가이드
└── docs/
    └── DEPLOY-TYPES.md                # 배포 타입 상세 문서
```

## 3가지 배포 타입

| 타입 | Runner | 권한 | 필요 Secrets |
|------|--------|------|--------------|
| **self-hosted** | `[self-hosted, docker]` | 관리자 | `GHCR_TOKEN` |
| **ssh** | `ubuntu-latest` + SSH | admin | `GHCR_TOKEN`, `SSH_*` |
| **api** | `ubuntu-latest` + curl | 팀원 | `GHCR_TOKEN`, `CODEB_API_KEY` |

## 사용법

### 1. 워크플로우 생성

```bash
# API 타입 (권장 - 팀원용)
./hybrid/scripts/generate-workflow.sh myapp api

# SSH 타입 (admin용)
./hybrid/scripts/generate-workflow.sh myapp ssh

# Self-hosted 타입 (관리자용)
./hybrid/scripts/generate-workflow.sh myapp self-hosted
```

### 2. GitHub Secrets 설정

```bash
# 필요한 Secrets 확인
./hybrid/scripts/setup-secrets.sh myapp api
```

### 3. 배포 실행

```bash
# git push로 자동 배포
git push origin main

# 또는 수동 트리거
gh workflow run deploy.yml
```

## 공통 단계 (모든 타입)

배포 전 로컬에서 MCP로 처리:

```bash
# 1. 프로젝트 초기화 (SSOT 등록, 포트 할당)
/we:workflow init myapp

# 2. 환경변수 동기화
/we:env sync

# 3. 도메인 설정
/we:domain setup myapp.codeb.kr
```

## 버전

버전은 `VERSION` 파일에서 관리됩니다 (SSOT).

```bash
cat VERSION
```
