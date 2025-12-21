---
allowed-tools: [Read, Write, Edit, Bash, Glob, TodoWrite, mcp__codeb-deploy__workflow_init, mcp__codeb-deploy__workflow_scan, mcp__codeb-deploy__scan]
description: "Quadlet 및 GitHub Actions CI/CD 워크플로우 생성"
---

# /we:workflow - CI/CD 워크플로우 생성

## 🎯 목적
CodeB 인프라에 자동 배포를 위한 Quadlet 컨테이너 파일과 GitHub Actions CI/CD 워크플로우를 **자동으로** 생성합니다.

## ⚠️ 중요: SSH 배포 방식 (Self-hosted Runner 미사용)
- **GitHub Actions**: ubuntu-latest (GitHub-hosted)에서 빌드
- **배포**: `appleboy/ssh-action@v1.2.0`으로 SSH 직접 배포
- **Self-hosted Runner 사용 안 함**: 서버에 Runner 설치 불필요

## 📌 중요 규칙
- **모든 응답은 한글로 작성**
- **사용자에게 묻지 말고 자동으로 진행**
- 프로젝트 타입 미지정 시 **nextjs**를 기본값으로 사용

## ⚡ 자동 실행 플로우 (반드시 따를 것)

### Step 1: 프로젝트 스캔
```
mcp__codeb-deploy__workflow_scan 호출
- projectName: 현재 디렉토리명 또는 인자로 받은 프로젝트명
```

### Step 2: 워크플로우 초기화
```
mcp__codeb-deploy__workflow_init 호출
- projectName: 프로젝트명
- type: "nextjs" (기본값) 또는 인자로 받은 타입
- database: true (기본값)
- redis: true (기본값)
```

### Step 3: 결과 확인
```
mcp__codeb-deploy__scan 호출
- projectName: 프로젝트명
```

### Step 4: 생성된 파일 목록 보고

## 사용법
```
/we:workflow [액션] [프로젝트]
```

## 액션
- `init` - 전체 워크플로우 초기화 (기본값)
- `scan` - 현재 상태 스캔

## 생성되는 파일
```
├── quadlet/
│   ├── <프로젝트>.container          # Production Quadlet
│   └── <프로젝트>-staging.container  # Staging Quadlet
├── .github/workflows/
│   └── deploy.yml                    # GitHub Actions (SSH 배포)
└── Dockerfile                        # 최적화된 멀티스테이지 Dockerfile
```

## GitHub Actions 배포 전략
```
[Build] ubuntu-latest → Docker 빌드 → GHCR 푸시
    ↓
[Deploy] ubuntu-latest → appleboy/ssh-action
    ↓
[서버] podman pull → systemctl restart
```

## 필수 GitHub Secrets
- `SSH_HOST`: 서버 IP (158.247.203.55)
- `SSH_USER`: SSH 사용자 (root)
- `SSH_PRIVATE_KEY`: SSH 개인키

## MCP 도구 (정확한 이름)
- `mcp__codeb-deploy__workflow_init` - 프로젝트 초기화
- `mcp__codeb-deploy__workflow_scan` - 리소스 상태 스캔
- `mcp__codeb-deploy__scan` - 전체 스캔

## 예제
```
/we:workflow init myapp              # myapp 프로젝트 초기화
/we:workflow scan myapp              # myapp 상태 스캔
/we:workflow                         # 현재 디렉토리 초기화
```

## 관련 명령어
- `/we:deploy` - 프로젝트 배포
- `/we:domain` - 도메인 설정
