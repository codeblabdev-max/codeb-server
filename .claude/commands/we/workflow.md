---
allowed-tools: [Read, Write, Edit, Bash, Glob, TodoWrite, mcp__codeb-deploy__workflow_init, mcp__codeb-deploy__workflow_scan, mcp__codeb-deploy__scan]
description: "Quadlet 및 GitHub Actions CI/CD 워크플로우 생성"
---

# /we:workflow - CI/CD 워크플로우 생성 (v6.0)

## 🎯 목적
CodeB v6.0 인프라에 Blue-Green 배포를 위한 GitHub Actions CI/CD 워크플로우를 **자동으로** 생성합니다.

## ⚠️ 중요: MCP API 배포 방식 (v6.0)
- **GitHub Actions**: ubuntu-latest에서 빌드 → GHCR 푸시
- **배포**: MCP API (`https://api.codeb.kr/api/tool`) 호출
- **인증**: `X-API-Key` 헤더 사용
- **SSH 직접 접속 안함**: MCP API가 서버 작업 대행

## 📌 중요 규칙
- **모든 응답은 한글로 작성**
- **사용자에게 묻지 말고 자동으로 진행**
- 프로젝트 타입 미지정 시 **nextjs**를 기본값으로 사용
- **반드시 아래 v6.0 템플릿 사용** (slot_deploy, project 파라미터 사용 금지!)

## ⚡ 자동 실행 플로우 (반드시 따를 것)

### Step 1: 프로젝트 스캔
```
mcp__codeb-deploy__workflow_scan 호출
- projectName: 현재 디렉토리명 또는 인자로 받은 프로젝트명
```

### Step 2: 워크플로우 초기화 (서버 Registry 등록)
```
mcp__codeb-deploy__workflow_init 호출
- projectName: 프로젝트명
- type: "nextjs" (기본값) 또는 인자로 받은 타입
- database: true (기본값)
- redis: true (기본값)
- environment: "both" (staging + production)
```

### Step 3: GitHub Actions 워크플로우 생성
`.github/workflows/deploy.yml` 파일을 아래 **v6.0 템플릿**으로 생성

### Step 4: 결과 확인
```
mcp__codeb-deploy__scan 호출
- projectName: 프로젝트명
```

## 사용법
```
/we:workflow [액션] [프로젝트]
```

## 액션
- `init` - 전체 워크플로우 초기화 (기본값)
- `scan` - 현재 상태 스캔

## 생성되는 파일
```
├── .github/workflows/
│   └── deploy.yml                    # GitHub Actions (MCP API 배포)
└── Dockerfile                        # 최적화된 멀티스테이지 Dockerfile (없으면 생성)
```

## 필수 GitHub Secrets
- `CODEB_API_KEY`: CodeB MCP API Key (`codeb_{teamId}_{role}_{token}` 형식)
- `GHCR_PAT`: GitHub Container Registry PAT (또는 GITHUB_TOKEN 사용)

---

## 🔴 v6.0 API 규칙 (필수!)

| 항목 | 올바른 값 (v6.0) | 잘못된 값 (사용 금지) |
|------|------------------|---------------------|
| **API URL** | `https://api.codeb.kr/api/tool` | `https://app.codeb.kr/api` |
| **인증 헤더** | `X-API-Key: ${{ secrets.CODEB_API_KEY }}` | `Authorization: Bearer` |
| **Deploy 도구** | `deploy` 또는 `deploy_project` | `slot_deploy` |
| **Promote 도구** | `promote` 또는 `slot_promote` | - |
| **Rollback 도구** | `rollback` | `slot_rollback` |
| **프로젝트 파라미터** | `projectName` | `project` |

---

## 📋 v6.0 deploy.yml 템플릿 (반드시 이 템플릿 사용!)

```yaml
# CodeB v6.0 - Blue-Green 배포 워크플로우
# GitHub Actions → MCP API → 서버 배포

name: CodeB Deploy

on:
  push:
    branches: [main]
    paths-ignore:
      - '**.md'
      - 'docs/**'
  workflow_dispatch:
    inputs:
      environment:
        description: '배포 환경'
        required: true
        default: 'production'
        type: choice
        options:
          - staging
          - production
      action:
        description: '배포 액션'
        required: true
        default: 'deploy'
        type: choice
        options:
          - deploy
          - promote
          - rollback

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  PROJECT_NAME: # 프로젝트명으로 교체
  MCP_API_URL: https://api.codeb.kr/api/tool

jobs:
  # ============================================
  # Build & Push to GHCR
  # ============================================
  build:
    name: Build & Push
    runs-on: ubuntu-latest
    if: github.event.inputs.action != 'promote' && github.event.inputs.action != 'rollback'
    permissions:
      contents: read
      packages: write
    outputs:
      image: ${{ steps.meta.outputs.tags }}
      version: ${{ steps.version.outputs.version }}
      environment: ${{ steps.vars.outputs.environment }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set variables
        id: vars
        run: |
          SHORT_SHA=$(git rev-parse --short HEAD)
          echo "short_sha=$SHORT_SHA" >> $GITHUB_OUTPUT
          if [ "${{ github.ref }}" = "refs/heads/main" ]; then
            echo "environment=production" >> $GITHUB_OUTPUT
          else
            echo "environment=staging" >> $GITHUB_OUTPUT
          fi

      - name: Get version
        id: version
        run: |
          VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "v0.0.0-$(git rev-parse --short HEAD)")
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
            type=sha,prefix=,format=short

      - name: Build and Push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ============================================
  # Deploy to Server via MCP API
  # ============================================
  deploy:
    name: Deploy to Slot
    runs-on: ubuntu-latest
    needs: build
    if: github.event.inputs.action != 'promote' && github.event.inputs.action != 'rollback'
    environment: ${{ needs.build.outputs.environment }}
    outputs:
      slot: ${{ steps.deploy.outputs.slot }}
      preview_url: ${{ steps.deploy.outputs.preview_url }}

    steps:
      - name: Deploy via MCP API
        id: deploy
        run: |
          ENVIRONMENT="${{ github.event.inputs.environment || needs.build.outputs.environment }}"
          IMAGE="${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest"
          VERSION="${{ needs.build.outputs.version }}"

          echo "========================================"
          echo " Blue-Green Deployment (v6.0)"
          echo "========================================"
          echo "Project:     ${{ env.PROJECT_NAME }}"
          echo "Environment: $ENVIRONMENT"
          echo "Image:       $IMAGE"
          echo "Version:     $VERSION"
          echo "========================================"

          # Deploy via MCP API (v6.0)
          RESPONSE=$(curl -sf -X POST "${{ env.MCP_API_URL }}" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d "{
              \"tool\": \"deploy\",
              \"params\": {
                \"projectName\": \"${{ env.PROJECT_NAME }}\",
                \"environment\": \"$ENVIRONMENT\",
                \"image\": \"$IMAGE\",
                \"version\": \"$VERSION\"
              }
            }")

          echo "API Response: $RESPONSE"

          SLOT=$(echo "$RESPONSE" | jq -r '.slot // "unknown"')
          PREVIEW_URL=$(echo "$RESPONSE" | jq -r '.previewUrl // ""')
          SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

          echo "slot=$SLOT" >> $GITHUB_OUTPUT
          echo "preview_url=$PREVIEW_URL" >> $GITHUB_OUTPUT

          if [ "$SUCCESS" != "true" ]; then
            ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
            echo "❌ 배포 실패: $ERROR"
            exit 1
          fi

          echo "✅ Deployed to $SLOT slot"
          echo "🔗 Preview URL: $PREVIEW_URL"

      - name: Health Check
        run: |
          PREVIEW_URL="${{ steps.deploy.outputs.preview_url }}"
          if [ -n "$PREVIEW_URL" ] && [ "$PREVIEW_URL" != "null" ]; then
            echo "🔍 헬스체크: $PREVIEW_URL/health"
            sleep 30
            for i in {1..6}; do
              if curl -sf "$PREVIEW_URL/health" > /dev/null 2>&1; then
                echo "✅ 헬스체크 통과!"
                exit 0
              fi
              echo "  대기 중... ($i/6)"
              sleep 10
            done
            echo "⚠️ 헬스체크 타임아웃 - 수동 확인 필요"
          fi

  # ============================================
  # Auto Promote
  # ============================================
  promote:
    name: Promote to Active
    runs-on: ubuntu-latest
    needs: [build, deploy]
    if: success() && github.event.inputs.action != 'promote' && github.event.inputs.action != 'rollback'
    environment: ${{ needs.build.outputs.environment }}

    steps:
      - name: Promote via MCP API
        run: |
          ENVIRONMENT="${{ github.event.inputs.environment || needs.build.outputs.environment }}"

          echo "🚀 Promoting to $ENVIRONMENT..."

          RESPONSE=$(curl -sf -X POST "${{ env.MCP_API_URL }}" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d "{
              \"tool\": \"promote\",
              \"params\": {
                \"projectName\": \"${{ env.PROJECT_NAME }}\",
                \"environment\": \"$ENVIRONMENT\"
              }
            }")

          echo "API Response: $RESPONSE"

          if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
            echo "✅ 트래픽 전환 완료!"
          else
            ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
            echo "❌ Promote 실패: $ERROR"
            exit 1
          fi

  # ============================================
  # Manual Promote (workflow_dispatch)
  # ============================================
  manual-promote:
    name: Manual Promote
    runs-on: ubuntu-latest
    if: github.event.inputs.action == 'promote'

    steps:
      - name: Promote via MCP API
        run: |
          RESPONSE=$(curl -sf -X POST "${{ env.MCP_API_URL }}" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d "{
              \"tool\": \"promote\",
              \"params\": {
                \"projectName\": \"${{ env.PROJECT_NAME }}\",
                \"environment\": \"${{ github.event.inputs.environment }}\"
              }
            }")

          echo "$RESPONSE" | jq .

  # ============================================
  # Rollback (workflow_dispatch)
  # ============================================
  rollback:
    name: Rollback
    runs-on: ubuntu-latest
    if: github.event.inputs.action == 'rollback'

    steps:
      - name: Rollback via MCP API
        run: |
          RESPONSE=$(curl -sf -X POST "${{ env.MCP_API_URL }}" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d "{
              \"tool\": \"rollback\",
              \"params\": {
                \"projectName\": \"${{ env.PROJECT_NAME }}\",
                \"environment\": \"${{ github.event.inputs.environment }}\"
              }
            }")

          echo "$RESPONSE" | jq .

          if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
            echo "✅ 롤백 완료!"
          else
            echo "❌ 롤백 실패"
            exit 1
          fi
```

---

## 예제
```
/we:workflow init myapp              # myapp 프로젝트 초기화
/we:workflow scan myapp              # myapp 상태 스캔
/we:workflow                         # 현재 디렉토리 초기화
```

## 관련 명령어
- `/we:deploy` - 프로젝트 배포
- `/we:domain` - 도메인 설정
