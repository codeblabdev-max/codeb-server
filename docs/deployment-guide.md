# CodeB 배포 가이드

> **문서 버전**: 8.0.0
> **최종 업데이트**: 2026-02-06

---

## 목차

1. [프로젝트별 배포 방식](#1-프로젝트별-배포-방식)
2. [일반 프로젝트 배포 (GitHub Actions)](#2-일반-프로젝트-배포-github-actions)
3. [codeb-server 배포 (수동)](#3-codeb-server-배포-수동)
4. [버전 관리](#4-버전-관리)
5. [트러블슈팅](#5-트러블슈팅)

---

## 1. 프로젝트별 배포 방식

### 1.1 배포 방식 비교

| 프로젝트 | 배포 방식 | 트리거 | 빌드 위치 | 캐시 |
|----------|----------|--------|----------|------|
| **codeb-server** | 수동 (`deploy-all.sh`) | 직접 실행 | 로컬 | 없음 |
| **workb** | GitHub Actions | `git push` | Self-Hosted Runner | Minio S3 |
| **heeling** | GitHub Actions | `git push` | Self-Hosted Runner | Minio S3 |
| **기타 프로젝트** | GitHub Actions | `git push` | Self-Hosted Runner | Minio S3 |

### 1.2 핵심 차이점

```
┌─────────────────────────────────────────────────────────────────┐
│                     배포 방식 선택 기준                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  codeb-server (인프라 프로젝트)                                  │
│  └─→ 수동 배포만 사용 (deploy-all.sh)                           │
│  └─→ GitHub Actions 워크플로우 사용 금지                         │
│  └─→ 인프라 자체이므로 자기 자신을 배포할 수 없음                  │
│                                                                 │
│  일반 프로젝트 (workb, heeling 등)                               │
│  └─→ GitHub Actions 자동 배포                                   │
│  └─→ Self-Hosted Runner에서 빌드                                │
│  └─→ Minio S3 캐시로 빌드 속도 극대화                           │
│  └─→ MCP API로 Blue-Green 배포                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 일반 프로젝트 배포 (GitHub Actions)

### 2.1 배포 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│               일반 프로젝트 GitHub Actions CI/CD                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [로컬]                                                         │
│    │                                                            │
│    │ git push origin main                                       │
│    ▼                                                            │
│  [GitHub Actions]                                               │
│    │                                                            │
│    │ runs-on: [self-hosted, docker]                             │
│    ▼                                                            │
│  [Self-Hosted Runner] (App Server: 158.247.203.55)              │
│    │                                                            │
│    ├─→ Docker BuildKit + Minio S3 Cache                         │
│    │     --cache-from "type=s3,bucket=docker-cache,..."         │
│    │     --cache-to "type=s3,bucket=docker-cache,..."           │
│    │                                                            │
│    ├─→ Private Registry Push                                    │
│    │     64.176.226.119:5000/projectName:sha                    │
│    │                                                            │
│    └─→ MCP API 호출                                             │
│          POST https://api.codeb.kr/api/tool                     │
│          {"tool": "deploy", "params": {"image": "..."}}         │
│                                                                 │
│  [결과]                                                         │
│    └─→ Preview URL 반환 (비활성 슬롯)                           │
│    └─→ /we:promote로 트래픽 전환                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 워크플로우 예시 (workb)

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

env:
  REGISTRY: 64.176.226.119:5000
  IMAGE_NAME: ${{ github.event.repository.name }}
  MINIO_ENDPOINT: http://64.176.226.119:9000
  MINIO_BUCKET: docker-cache

jobs:
  build-and-deploy:
    runs-on: [self-hosted, docker]  # Self-Hosted Runner 필수!

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and Push with Minio S3 Cache
        run: |
          docker buildx build \
            --cache-from "type=s3,bucket=${{ env.MINIO_BUCKET }},endpoint_url=${{ env.MINIO_ENDPOINT }},access_key_id=${{ secrets.MINIO_ACCESS_KEY }},secret_access_key=${{ secrets.MINIO_SECRET_KEY }},region=us-east-1,name=${{ env.IMAGE_NAME }}" \
            --cache-to "type=s3,bucket=${{ env.MINIO_BUCKET }},endpoint_url=${{ env.MINIO_ENDPOINT }},access_key_id=${{ secrets.MINIO_ACCESS_KEY }},secret_access_key=${{ secrets.MINIO_SECRET_KEY }},region=us-east-1,mode=max,name=${{ env.IMAGE_NAME }}" \
            -t "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}" \
            -t "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest" \
            --push \
            .

      - name: Deploy to inactive slot
        run: |
          RESPONSE=$(curl -sf -X POST "https://api.codeb.kr/api/tool" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${{ env.IMAGE_NAME }}",
                "environment": "production",
                "image": "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}"
              }
            }')
          echo "$RESPONSE" | jq .
          echo "previewUrl=$(echo $RESPONSE | jq -r '.previewUrl')" >> $GITHUB_OUTPUT
```

### 2.3 필수 GitHub Secrets

| Secret | 설명 | 예시 |
|--------|------|------|
| `CODEB_API_KEY` | MCP API 인증 키 | `codeb_team1_admin_xxxxx` |
| `MINIO_ACCESS_KEY` | Minio 접근 키 | (Storage 서버에서 발급) |
| `MINIO_SECRET_KEY` | Minio 시크릿 키 | (Storage 서버에서 발급) |

### 2.4 배포 순서

```bash
# 1. 코드 수정 후 커밋 & 푸시 (자동 배포)
git add -A && git commit -m "feat: 새로운 기능" && git push

# GitHub Actions가 자동으로:
# - Self-Hosted Runner에서 Docker 빌드 (Minio S3 캐시)
# - Private Registry에 이미지 푸시
# - MCP API 호출 → 비활성 슬롯에 배포
# - Preview URL 반환

# 2. Preview URL에서 확인 후 트래픽 전환
/we:promote projectName

# 3. 문제 발생 시 즉시 롤백
/we:rollback projectName
```

### 2.5 Skills 사용 시 주의사항

> **중요**: `/we:deploy` 스킬은 GitHub Actions가 없는 프로젝트용입니다.

```
┌─────────────────────────────────────────────────────────────────┐
│                /we:deploy 호출 시 동작                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  .github/workflows/*.yml 존재 여부 확인                          │
│                                                                 │
│  ✅ 있음 (workb 방식)                                           │
│  └─→ "git push로 배포하세요" 안내                               │
│  └─→ 워크플로우가 자동으로 빌드 & 배포                          │
│                                                                 │
│  ❌ 없음                                                        │
│  └─→ workflow_generate 호출 제안                                │
│  └─→ 또는 수동 이미지 지정 (--image 옵션)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. codeb-server 배포 (수동)

### 3.1 배포 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                 codeb-server 수동 배포 시스템                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [로컬] ./scripts/deploy-all.sh [version]                       │
│                                                                 │
│  배포 대상:                                                     │
│  ├── [1/5] 로컬 파일 버전 동기화                                │
│  │         package.json, CLAUDE.md 버전 업데이트                │
│  │                                                              │
│  ├── [2/5] Git 커밋 & 푸시 (백업용)                             │
│  │         "chore: release v7.0.x" 커밋                         │
│  │                                                              │
│  ├── [3/5] API Server (Docker → Systemd)                        │
│  │         TypeScript 빌드 → Docker 이미지 → 서버 배포          │
│  │                                                              │
│  ├── [4/5] CLI Package (tarball → Minio)                        │
│  │         codeb-cli-{version}.tar.gz 업로드                    │
│  │                                                              │
│  └── [5/5] SSOT Registry 업데이트                               │
│            /opt/codeb/registry/versions.json                    │
│                                                                 │
│  ⚠️ GitHub Actions 워크플로우 추가 금지!                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 배포 명령

```bash
# 현재 VERSION 파일 버전으로 배포
./scripts/deploy-all.sh

# 새 버전으로 배포 (VERSION 파일도 업데이트)
./scripts/deploy-all.sh 7.0.67
```

### 3.3 배포 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│              deploy-all.sh 실행 흐름                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [1/5] 로컬 파일 버전 동기화                                     │
│        ├─→ VERSION 파일 업데이트                                │
│        ├─→ package.json (루트) ← 현재 누락됨! (KNOWN-ISSUES #1) │
│        ├─→ mcp-server/package.json                              │
│        ├─→ cli/package.json                                     │
│        └─→ CLAUDE.md                                            │
│                                                                 │
│  [2/5] Git commit & push                                        │
│        └─→ "chore: release v7.0.x" 커밋                         │
│                                                                 │
│  [3/5] API Server Docker 배포                                   │
│        ├─→ TypeScript 빌드                                      │
│        ├─→ tarball 생성 및 서버 전송                            │
│        ├─→ Docker 이미지 빌드 및 컨테이너 실행                   │
│        └─→ 헬스체크 (api.codeb.kr/health)                       │
│                                                                 │
│  [4/5] CLI Package Minio 업로드                                 │
│        ├─→ tarball 생성 (bin, src, commands, rules)             │
│        ├─→ codeb-cli-{version}.tar.gz 업로드                    │
│        ├─→ codeb-cli-latest.tar.gz 심볼릭                       │
│        └─→ version.json, install.sh 업로드                      │
│                                                                 │
│  [5/5] SSOT Registry 업데이트                                   │
│        └─→ /opt/codeb/registry/versions.json                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 버전 확인

```bash
# 로컬 VERSION 파일
cat VERSION

# API Server 버전
curl -sf https://api.codeb.kr/health | jq '.version'

# CLI Package 버전
curl -sf https://releases.codeb.kr/cli/version.json | jq '.version'

# SSOT Registry
ssh root@158.247.203.55 "cat /opt/codeb/registry/versions.json"
```

---

## 4. 버전 관리

### 4.1 Single Source of Truth (SSOT)

```
VERSION 파일이 모든 버전의 기준
```

| 파일 | 역할 | 동기화 |
|------|------|--------|
| `VERSION` | **SSOT** - 단일 기준 | - |
| `package.json` (루트) | 프로젝트 버전 | 자동 (수정 필요) |
| `mcp-server/package.json` | API 서버 버전 | 자동 |
| `cli/package.json` | CLI 패키지 버전 | 자동 |
| `CLAUDE.md` | 문서 버전 | 자동 |

### 4.2 버전 형식

```
MAJOR.MINOR.PATCH
  7    .0   .66

MAJOR: 대규모 변경 (Breaking Changes)
MINOR: 기능 추가 (Features)
PATCH: 버그 수정, 소규모 개선 (Fixes)
```

### 4.3 버전 동기화 스크립트

```bash
# VERSION 파일 기준으로 모든 package.json 동기화
./scripts/sync-version.sh

# 새 버전으로 동기화
./scripts/sync-version.sh 7.0.67
```

---

## 5. 트러블슈팅

### 5.1 버전 불일치

```bash
# 현재 상태 확인
cat VERSION                                          # 7.0.66
curl -s https://api.codeb.kr/health | jq '.version'  # 실제 서버 버전

# 불일치 시 조치
./scripts/deploy-all.sh  # 전체 재배포
```

### 5.2 GitHub Actions 빌드 실패

```bash
# Self-Hosted Runner 상태 확인
ssh root@158.247.203.55 "systemctl status actions-runner"

# Minio 캐시 확인
mc ls minio/docker-cache/
```

### 5.3 MCP API 호출 실패

```bash
# API 헬스체크
curl -sf https://api.codeb.kr/health | jq .

# API 키 확인
echo $CODEB_API_KEY

# 수동 테스트
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CODEB_API_KEY" \
  -d '{"tool": "health_check", "params": {}}'
```

### 5.4 Docker 이미지 없음

```bash
# Private Registry 확인
curl -s http://64.176.226.119:5000/v2/_catalog | jq .
curl -s http://64.176.226.119:5000/v2/projectName/tags/list | jq .

# 해결: GitHub Actions가 빌드해야 이미지 존재
# → git push로 배포 트리거
```

---

## 관련 문서

- [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) - 알려진 문제점 및 해결 방안
- [DEPLOY-FLOW.md](./DEPLOY-FLOW.md) - 배포 플로우 상세
- [PRIVATE-REGISTRY.md](./PRIVATE-REGISTRY.md) - Private Registry 가이드
- [../CLAUDE.md](../CLAUDE.md) - Claude Code 규칙
