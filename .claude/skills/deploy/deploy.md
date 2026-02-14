---
name: deploy
description: "Git Push 기반 CI/CD Blue-Green 배포"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Edit
  - Bash
  - Glob
  - mcp__codeb-deploy__slot_status
  - mcp__codeb-deploy__slot_promote
  - mcp__codeb-deploy__health_check
  - mcp__codeb-deploy__workflow_scan
---

# /we:deploy - Git Push 기반 Blue-Green 배포

## 목적
Git Push → GitHub Actions → Docker Buildx (Minio S3 캐시) → Private Registry → MCP API 배포
의 자동화된 파이프라인을 통해 Blue-Green 배포를 수행합니다.

## 핵심 원칙
- **배포 = git push**. `deploy_project` MCP를 직접 호출하지 않는다.
- **모든 응답은 한글로 작성**
- 코드 수정 시 임시 해결책 금지 → 근본 원인 파악 후 수정
- 동일한 빌드 에러가 5회 반복되면 반드시 보고

## 자동 실행 플로우 (반드시 따를 것)

### Step 1: 변경사항 확인
```bash
git status
git diff --stat HEAD
```
- 변경사항이 없으면 "배포할 변경사항이 없습니다" 안내
- 이미 커밋 & 푸시된 상태면 Step 3로 이동

### Step 2: 커밋 & 푸시
```bash
git add <변경된 파일들>
git commit -m "<conventional commit 메시지>"
git push origin main
```
- push 시 GitHub Actions가 자동 트리거됨
- 워크플로우의 `paths` 필드에 매칭되는 변경이 있어야 트리거

### Step 3: GitHub Actions 모니터링
```bash
gh run list --limit 3
gh run watch <run-id>
```
- 빌드 진행 상태 실시간 추적
- 실패 시 `gh run view <run-id> --log-failed`로 로그 확인

### Step 4: 배포 결과 확인
```
mcp__codeb-deploy__slot_status
- projectName: 프로젝트명
- environment: production
```
- 비활성 슬롯에 새 커밋 SHA 이미지가 배포되었는지 확인
- Preview URL 안내

### Step 5: 결과 보고
- 배포된 슬롯, 이미지 태그(커밋 SHA), Preview URL
- 사용자가 promote 요청 시 `slot_promote` 실행

## CI/CD 파이프라인 구조
```
git push main
  → GitHub Actions (self-hosted runner)
  → Docker Buildx + Minio S3 캐시 (64.176.226.119:9000)
  → 이미지 Push → Private Registry (64.176.226.119:5000)
  → curl MCP API /api/tool (deploy)
  → 비활성 슬롯에 배포 + Preview URL
```

## 수동 트리거 (workflow_dispatch)
```bash
# 배포
gh workflow run <workflow>.yml -f action=deploy

# force build (캐시 무시)
gh workflow run <workflow>.yml -f action=deploy -f force_build=true

# promote
gh workflow run <workflow>.yml -f action=promote

# rollback
gh workflow run <workflow>.yml -f action=rollback
```

## 주의사항
- **`mcp__codeb-deploy__deploy_project`를 직접 호출하면 안 됨**
  - 이유: 새 이미지 빌드 없이 기존 `latest` 태그로 배포되어 변경 미반영
- promote, rollback은 MCP 직접 호출 OK (이미지 빌드 불필요)

## 서버 정보
- **App 서버**: 158.247.203.55 (api.codeb.kr)
- **Private Registry**: 64.176.226.119:5000
- **Minio S3 캐시**: 64.176.226.119:9000
- **컨테이너 런타임**: Docker
- **Self-Hosted Runner**: App 서버

## 관련 명령어
- `/we:promote` - Production 트래픽 전환 (MCP 직접 호출)
- `/we:rollback` - 이전 버전으로 롤백 (MCP 직접 호출)
- `/we:health` - 시스템 상태 확인
- `/we:workflow` - CI/CD 워크플로우 생성/수정
