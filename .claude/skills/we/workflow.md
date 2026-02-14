---
name: we:workflow
description: "워크플로우", "workflow", "CI/CD", "GitHub Actions" 등의 요청 시 자동 활성화. Minio S3 캐시 + Private Registry 기반 CI/CD 워크플로우를 생성합니다.
---

# we:workflow - CI/CD 워크플로우 생성 (Minio S3 캐시)

## 활성화 키워드
- 워크플로우, workflow, CI/CD
- GitHub Actions, 깃헙 액션
- 프로젝트 초기화, 인프라 설정

## 사용 도구
- `mcp__codeb-deploy__workflow_init` - 서버 인프라 초기화 (신규 프로젝트)
- `mcp__codeb-deploy__workflow_scan` - 기존 설정 스캔

## CI/CD 아키텍처
```
git push main
  → GitHub Actions (self-hosted runner: [self-hosted, docker])
  → Docker Buildx + Minio S3 캐시 (64.176.226.119:9000)
  → 이미지 Push → Private Registry (64.176.226.119:5000)
  → curl MCP API → Blue-Green 배포
  → Preview URL 반환
```

## 워크플로우 생성 절차

### 1단계: 기존 설정 스캔
```
mcp__codeb-deploy__workflow_scan { "projectName": "프로젝트명" }
```
- 프로젝트가 DB SSOT에 등록되어 있는지 확인
- 미등록 시 `we:init` 먼저 실행

### 2단계: 서버 인프라 초기화
```
mcp__codeb-deploy__workflow_init {
  "projectName": "프로젝트명",
  "type": "nextjs",
  "database": true,
  "redis": true
}
```

### 3단계: 워크플로우 파일 생성
`.github/workflows/deploy.yml` 생성 (아래 템플릿 기반)

## 워크플로우 템플릿 (Minio S3 캐시)

```yaml
name: CI/CD

on:
  push:
    branches: [main]
    paths:
      - 'src/**'       # 프로젝트 구조에 맞게 수정
      - 'package.json'
  workflow_dispatch:
    inputs:
      action:
        description: 'Action'
        required: true
        default: 'deploy'
        type: choice
        options:
          - deploy
          - promote
          - rollback

env:
  REGISTRY: 64.176.226.119:5000
  IMAGE_NAME: <프로젝트명>
  MINIO_ENDPOINT: http://64.176.226.119:9000
  MINIO_BUCKET: docker-cache

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-and-deploy:
    name: Build & Deploy
    runs-on: [self-hosted, docker]
    if: github.event_name == 'push' || github.event.inputs.action == 'deploy'
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        with:
          config-inline: |
            [registry."64.176.226.119:5000"]
              http = true
              insecure = true

      - name: Build and Push (Minio S3 Cache)
        run: |
          IMAGE_TAG="${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}"
          docker buildx build \
            --cache-from "type=s3,region=us-east-1,bucket=${{ env.MINIO_BUCKET }},name=${{ env.IMAGE_NAME }},endpoint_url=${{ env.MINIO_ENDPOINT }},access_key_id=${{ secrets.MINIO_ACCESS_KEY }},secret_access_key=${{ secrets.MINIO_SECRET_KEY }}" \
            --cache-to "type=s3,region=us-east-1,bucket=${{ env.MINIO_BUCKET }},name=${{ env.IMAGE_NAME }},mode=max,endpoint_url=${{ env.MINIO_ENDPOINT }},access_key_id=${{ secrets.MINIO_ACCESS_KEY }},secret_access_key=${{ secrets.MINIO_SECRET_KEY }}" \
            -t "$IMAGE_TAG" \
            -t "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest" \
            --push \
            -f Dockerfile .

      - name: Deploy to inactive slot
        timeout-minutes: 5
        run: |
          RESPONSE=$(curl -sf --max-time 180 -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${{ env.IMAGE_NAME }}",
                "environment": "production",
                "image": "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}"
              }
            }')
          echo "$RESPONSE" | jq .
          PREVIEW=$(echo "$RESPONSE" | jq -r '.previewUrl // "N/A"')
          echo "Preview: $PREVIEW"

      - name: Cleanup
        if: always()
        run: docker image prune -f 2>/dev/null || true

  promote:
    runs-on: [self-hosted, docker]
    if: github.event.inputs.action == 'promote'
    steps:
      - name: Promote
        run: |
          curl -sf -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"tool": "slot_promote", "params": {"projectName": "${{ env.IMAGE_NAME }}", "environment": "production"}}'

  rollback:
    runs-on: [self-hosted, docker]
    if: github.event.inputs.action == 'rollback'
    steps:
      - name: Rollback
        run: |
          curl -sf -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"tool": "rollback", "params": {"projectName": "${{ env.IMAGE_NAME }}", "environment": "production"}}'
```

## 필수 GitHub Secrets
| Secret | 설명 |
|--------|------|
| `CODEB_API_KEY` | MCP API 키 |
| `MINIO_ACCESS_KEY` | Minio S3 Access Key |
| `MINIO_SECRET_KEY` | Minio S3 Secret Key |

## 모노레포 프로젝트
모노레포의 경우 `paths`와 Dockerfile 경로를 조정:
```yaml
paths:
  - 'apps/web/**'
  - 'packages/**'
# ...
-f apps/web/Dockerfile apps/web
```

## 4-Server 아키텍처
| 서버 | IP | 역할 |
|------|-----|------|
| App | 158.247.203.55 | Docker, Caddy, MCP API, Self-Hosted Runner |
| Storage | 64.176.226.119 | PostgreSQL, Redis, Private Registry, Minio |
| Streaming | 141.164.42.213 | Centrifugo WebSocket |
| Backup | 141.164.37.63 | Prometheus, Grafana |

## 관련 스킬
- `we:deploy` - Git Push 기반 배포
- `we:health` - 시스템 상태 확인
- `we:domain` - 도메인 설정
