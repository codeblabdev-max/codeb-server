# CodeB 빌드 캐시 최적화 가이드

> Self-hosted Minio S3 캐시를 활용한 빌드 시간 최적화

---

## 목차

1. [개요](#1-개요)
2. [아키텍처](#2-아키텍처)
3. [Minio 설치](#3-minio-설치)
4. [GitHub Actions 연동](#4-github-actions-연동)
5. [빌드 최적화 적용](#5-빌드-최적화-적용)
6. [모니터링](#6-모니터링)
7. [트러블슈팅](#7-트러블슈팅)

---

## 1. 개요

### 1.1 문제점

```
┌─────────────────────────────────────────────────────────────────┐
│                    현재 빌드 병목 지점                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  App Server (한국)                      GitHub Cache (미국)     │
│  ┌──────────────────┐                  ┌──────────────────────┐ │
│  │ Self-hosted      │  ← 30-60초 →    │ actions/cache        │ │
│  │ Runner           │  (대서양 횡단)   │                      │ │
│  │                  │                  │ npm cache            │ │
│  │ npm ci (45초)    │  ← 45-90초 →    │ .next/cache          │ │
│  │ build (120초)    │                  │                      │ │
│  └──────────────────┘                  └──────────────────────┘ │
│                                                                 │
│  문제:                                                          │
│  • GitHub 캐시 서버가 미국에 있어 네트워크 지연                  │
│  • 캐시 다운로드/업로드에 전체 빌드 시간의 30% 소요              │
│  • 10GB 캐시 제한 (초과 시 오래된 캐시 자동 삭제)               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 해결책: Self-hosted Minio Cache

```
┌─────────────────────────────────────────────────────────────────┐
│                    최적화된 캐시 아키텍처                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  App Server (158.247.203.55)     Storage Server (64.176.226.119)│
│  ┌──────────────────┐           ┌──────────────────────────────┐│
│  │ Self-hosted      │           │ Minio (S3 호환)              ││
│  │ Runner           │  ← 3초 → │ ├─ npm-cache/                ││
│  │                  │ (내부망)  │ ├─ next-cache/               ││
│  │ npm ci (8초)     │           │ ├─ node-modules/             ││
│  │ build (15초)     │           │ └─ turbo-cache/              ││
│  └──────────────────┘           │                              ││
│                                 │ 용량: 무제한 (디스크 크기)    ││
│                                 │ 속도: 1GB/s (내부 네트워크)   ││
│                                 └──────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 예상 효과

| 항목 | Before (GitHub) | After (Minio) | 개선율 |
|------|-----------------|---------------|--------|
| **npm 캐시 복원** | 30-60초 | 3-5초 | 90% ↓ |
| **.next 캐시 복원** | 45-90초 | 5-10초 | 85% ↓ |
| **npm ci** | 45초 | 8초 | 80% ↓ |
| **next build** | 120초 | 15-30초 | 75% ↓ |
| **전체 빌드** | 3-5분 | 30초-1분 | 80% ↓ |

---

## 2. 아키텍처

### 2.1 서버 구성

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB 4-Server + Minio                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ App Server  │     │  Streaming  │     │   Storage   │       │
│  │ 158.247.    │     │ 141.164.    │     │  64.176.    │       │
│  │   203.55    │     │   42.213    │     │   226.119   │       │
│  │             │     │             │     │             │       │
│  │ • Runner    │     │ • Centri-   │     │ • Postgres  │       │
│  │ • MCP API   │     │   fugo      │     │ • Redis     │       │
│  │ • Docker    │     │             │     │ • Minio ←── │ NEW   │
│  └──────┬──────┘     └─────────────┘     └──────┬──────┘       │
│         │                                       │               │
│         │         내부 네트워크 (1GB/s)          │               │
│         └───────────────────────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 캐시 종류

| 캐시 타입 | 경로 | 용도 | 크기 (예상) |
|-----------|------|------|-------------|
| **npm-cache** | `~/.npm` | npm 패키지 캐시 | 500MB-2GB |
| **node-modules** | `node_modules.tar.gz` | 압축된 의존성 | 200MB-1GB |
| **next-cache** | `.next/cache` | Next.js 빌드 캐시 | 100MB-500MB |
| **turbo-cache** | `.turbo` | Turborepo 캐시 | 50MB-200MB |
| **docker-layers** | Docker BuildKit | Docker 레이어 캐시 | 1GB-5GB |

### 2.3 캐시 키 전략

```bash
# 캐시 키 형식
{project}-{type}-{hash}

# 예시
myapp-npm-abc123def        # package-lock.json 해시
myapp-next-def456ghi       # src/ 디렉토리 해시
myapp-node-modules-abc123  # package-lock.json 해시
```

---

## 3. Minio 설치

### 3.1 Storage Server에 Minio 설치

```bash
# SSH 접속
ssh root@64.176.226.119

# 데이터 디렉토리 생성
mkdir -p /opt/codeb/minio/data

# Minio 컨테이너 실행
docker run -d \
  --name minio \
  --restart always \
  -p 9000:9000 \
  -p 9001:9001 \
  -v /opt/codeb/minio/data:/data \
  -e MINIO_ROOT_USER=codeb-cache \
  -e MINIO_ROOT_PASSWORD=$(openssl rand -base64 32) \
  minio/minio server /data --console-address ":9001"

# 비밀번호 확인 (GitHub Secrets에 저장)
docker logs minio 2>&1 | grep "RootPass"
```

### 3.2 Minio 초기 설정

```bash
# Minio Client (mc) 설치
curl -O https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
mv mc /usr/local/bin/

# Minio 서버 등록
mc alias set codeb http://localhost:9000 codeb-cache <PASSWORD>

# 캐시 버킷 생성
mc mb codeb/build-cache
mc mb codeb/npm-cache
mc mb codeb/next-cache
mc mb codeb/turbo-cache

# 버킷 정책 설정 (내부망 전용)
mc anonymous set none codeb/build-cache
```

### 3.3 방화벽 설정

```bash
# Storage Server에서 실행
# App Server(158.247.203.55)에서만 접근 허용

# UFW 사용 시
ufw allow from 158.247.203.55 to any port 9000
ufw allow from 158.247.203.55 to any port 9001

# iptables 사용 시
iptables -A INPUT -p tcp -s 158.247.203.55 --dport 9000 -j ACCEPT
iptables -A INPUT -p tcp -s 158.247.203.55 --dport 9001 -j ACCEPT
iptables -A INPUT -p tcp --dport 9000 -j DROP
iptables -A INPUT -p tcp --dport 9001 -j DROP
```

### 3.4 연결 테스트

```bash
# App Server에서 실행
ssh root@158.247.203.55

# Minio 연결 테스트
curl -I http://64.176.226.119:9000/minio/health/live

# mc 설치 및 테스트
mc alias set codeb http://64.176.226.119:9000 codeb-cache <PASSWORD>
mc ls codeb/

# 테스트 파일 업로드/다운로드
echo "test" > /tmp/test.txt
mc cp /tmp/test.txt codeb/build-cache/
mc cat codeb/build-cache/test.txt
mc rm codeb/build-cache/test.txt
```

---

## 4. GitHub Actions 연동

### 4.1 GitHub Secrets 설정

```bash
# 필요한 Secrets
MINIO_ENDPOINT=http://64.176.226.119:9000
MINIO_ACCESS_KEY=codeb-cache
MINIO_SECRET_KEY=<생성된 비밀번호>
```

### 4.2 캐시 복원/저장 스크립트

**App Server에 스크립트 설치:**

```bash
# /opt/codeb/scripts/cache-helper.sh 생성
cat > /opt/codeb/scripts/cache-helper.sh << 'EOF'
#!/bin/bash
# CodeB Build Cache Helper
# Usage: cache-helper.sh <restore|save> <type> <project> [hash]

set -e

ACTION=$1
TYPE=$2      # npm, next, node-modules, turbo
PROJECT=$3
HASH=$4

MINIO_ALIAS="codeb"
BUCKET="build-cache"

case "$TYPE" in
  npm)
    LOCAL_PATH="$HOME/.npm"
    REMOTE_PATH="${PROJECT}/npm-cache"
    ;;
  next)
    LOCAL_PATH=".next/cache"
    REMOTE_PATH="${PROJECT}/next-cache"
    ;;
  node-modules)
    LOCAL_PATH="node_modules"
    REMOTE_PATH="${PROJECT}/node-modules"
    ;;
  turbo)
    LOCAL_PATH=".turbo"
    REMOTE_PATH="${PROJECT}/turbo-cache"
    ;;
  *)
    echo "Unknown type: $TYPE"
    exit 1
    ;;
esac

CACHE_FILE="${TYPE}-${HASH:-latest}.tar.gz"

case "$ACTION" in
  restore)
    echo "🔄 Restoring $TYPE cache for $PROJECT..."
    if mc stat ${MINIO_ALIAS}/${BUCKET}/${REMOTE_PATH}/${CACHE_FILE} > /dev/null 2>&1; then
      mc cp ${MINIO_ALIAS}/${BUCKET}/${REMOTE_PATH}/${CACHE_FILE} /tmp/
      mkdir -p "$LOCAL_PATH"
      tar -xzf /tmp/${CACHE_FILE} -C "$LOCAL_PATH" --strip-components=1 2>/dev/null || \
      tar -xzf /tmp/${CACHE_FILE} -C "$(dirname $LOCAL_PATH)" 2>/dev/null || true
      rm -f /tmp/${CACHE_FILE}
      echo "✅ Cache restored: ${CACHE_FILE}"
    else
      echo "⚠️ No cache found, will create new"
    fi
    ;;

  save)
    echo "💾 Saving $TYPE cache for $PROJECT..."
    if [ -d "$LOCAL_PATH" ] || [ -f "$LOCAL_PATH" ]; then
      tar -czf /tmp/${CACHE_FILE} -C "$(dirname $LOCAL_PATH)" "$(basename $LOCAL_PATH)"
      mc cp /tmp/${CACHE_FILE} ${MINIO_ALIAS}/${BUCKET}/${REMOTE_PATH}/
      rm -f /tmp/${CACHE_FILE}
      echo "✅ Cache saved: ${CACHE_FILE}"
    else
      echo "⚠️ Path not found: $LOCAL_PATH"
    fi
    ;;

  *)
    echo "Usage: $0 <restore|save> <type> <project> [hash]"
    exit 1
    ;;
esac
EOF

chmod +x /opt/codeb/scripts/cache-helper.sh
```

### 4.3 GitHub Actions 워크플로우 수정

**deploy-api.yml 수정:**

```yaml
name: Deploy API Server

on:
  push:
    branches: [main]
    paths:
      - 'mcp-server/**'
      - 'VERSION'

env:
  NODE_VERSION: '20.x'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/codeb-api

jobs:
  build:
    name: Build & Deploy (with Minio Cache)
    runs-on: self-hosted
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Read version
        id: version
        run: |
          VERSION=$(cat VERSION | tr -d '\n')
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Generate cache hash
        id: cache
        run: |
          NPM_HASH=$(md5sum mcp-server/package-lock.json | cut -d' ' -f1 | head -c8)
          SRC_HASH=$(find mcp-server/src -type f -exec md5sum {} \; | md5sum | cut -d' ' -f1 | head -c8)
          echo "npm_hash=$NPM_HASH" >> $GITHUB_OUTPUT
          echo "src_hash=$SRC_HASH" >> $GITHUB_OUTPUT

      # ============================================
      # Minio 캐시 복원
      # ============================================
      - name: Setup Minio CLI
        run: |
          if ! command -v mc &> /dev/null; then
            curl -sO https://dl.min.io/client/mc/release/linux-amd64/mc
            chmod +x mc && sudo mv mc /usr/local/bin/
          fi
          mc alias set codeb ${{ secrets.MINIO_ENDPOINT }} \
            ${{ secrets.MINIO_ACCESS_KEY }} ${{ secrets.MINIO_SECRET_KEY }} --api S3v4

      - name: Restore npm cache
        run: |
          /opt/codeb/scripts/cache-helper.sh restore npm codeb-api ${{ steps.cache.outputs.npm_hash }}

      - name: Restore node_modules cache
        run: |
          cd mcp-server
          /opt/codeb/scripts/cache-helper.sh restore node-modules codeb-api ${{ steps.cache.outputs.npm_hash }}

      # ============================================
      # 빌드 (캐시 활용)
      # ============================================
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install dependencies
        run: |
          cd mcp-server
          # node_modules 캐시가 있으면 npm ci 스킵
          if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
            echo "✅ Using cached node_modules"
            npm ci --prefer-offline || npm ci
          else
            npm ci
          fi

      - name: Build TypeScript
        run: |
          cd mcp-server
          npm run build
          echo "✅ Build complete"

      # ============================================
      # Minio 캐시 저장
      # ============================================
      - name: Save npm cache
        if: always()
        run: |
          /opt/codeb/scripts/cache-helper.sh save npm codeb-api ${{ steps.cache.outputs.npm_hash }}

      - name: Save node_modules cache
        if: always()
        run: |
          cd mcp-server
          /opt/codeb/scripts/cache-helper.sh save node-modules codeb-api ${{ steps.cache.outputs.npm_hash }}

      # ============================================
      # Docker 빌드 & 배포 (기존 로직)
      # ============================================
      - name: Prepare production dependencies
        run: |
          cd mcp-server
          rm -rf node_modules
          npm ci --omit=dev

      - name: Build Docker image
        run: |
          VERSION="${{ steps.version.outputs.version }}"
          cd mcp-server

          cat > Dockerfile.prod << 'EOF'
          FROM node:20-alpine
          RUN addgroup -g 1001 -S nodejs && adduser -S codeb -u 1001 -G nodejs
          WORKDIR /app
          COPY --chown=codeb:nodejs dist ./dist
          COPY --chown=codeb:nodejs node_modules ./node_modules
          COPY --chown=codeb:nodejs package.json VERSION ./
          RUN mkdir -p /app/logs && chown codeb:nodejs /app/logs
          ENV NODE_ENV=production PORT=9101
          HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:9101/health || exit 1
          USER codeb
          EXPOSE 9101
          CMD ["node", "dist/index.js"]
          EOF

          docker build \
            -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:$VERSION \
            -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest \
            -f Dockerfile.prod .

          rm Dockerfile.prod

      - name: Login and push
        run: |
          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          VERSION="${{ steps.version.outputs.version }}"
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:$VERSION
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

      - name: Deploy
        run: |
          VERSION="${{ steps.version.outputs.version }}"

          docker stop codeb-mcp-api || true
          docker rm codeb-mcp-api || true

          docker run -d \
            --name codeb-mcp-api \
            --restart always \
            --network host \
            -e NODE_ENV=production \
            -e PORT=9101 \
            -e LOG_DIR=/app/logs \
            -e SSH_PRIVATE_KEY_PATH=/app/ssh/id_rsa \
            --env-file /opt/codeb/mcp-server/.env \
            -v /opt/codeb/logs:/app/logs \
            -v /opt/codeb/registry:/opt/codeb/registry \
            -v /opt/codeb/ssh:/app/ssh:ro \
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:$VERSION

      - name: Health check
        run: |
          sleep 5
          for i in 1 2 3 4 5; do
            if curl -sf http://localhost:9101/health; then
              echo "✅ Health check passed!"
              exit 0
            fi
            echo "Retry $i/5..."
            sleep 2
          done
          exit 1
```

---

## 5. 빌드 최적화 적용

### 5.1 TypeScript Incremental Build

**mcp-server/tsconfig.json 수정:**

```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### 5.2 Docker BuildKit Cache Mount

**Dockerfile (멀티스테이지 + 캐시 마운트):**

```dockerfile
# syntax=docker/dockerfile:1.4

FROM node:20-alpine AS builder

WORKDIR /app

# BuildKit 캐시 마운트로 npm 캐시 재사용
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN --mount=type=cache,target=/app/dist/.tsbuildinfo \
    npm run build

# Production 이미지
FROM node:20-alpine

RUN addgroup -g 1001 -S nodejs && adduser -S codeb -u 1001 -G nodejs
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

RUN mkdir -p /app/logs && chown codeb:nodejs /app/logs

ENV NODE_ENV=production PORT=9101
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:9101/health || exit 1

USER codeb
EXPOSE 9101
CMD ["node", "dist/index.js"]
```

### 5.3 Next.js 프로젝트용 최적화

**next.config.js:**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone 빌드 (Docker 최적화)
  output: 'standalone',

  // 실험적 기능
  experimental: {
    // Turbopack (개발 모드)
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },

  // 캐시 설정
  cacheMaxMemorySize: 0, // 메모리 캐시 비활성화 (디스크 캐시 사용)

  // 빌드 최적화
  swcMinify: true,

  // Webpack 캐시
  webpack: (config, { isServer }) => {
    config.cache = {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename],
      },
    };
    return config;
  },
};

module.exports = nextConfig;
```

---

## 6. 모니터링

### 6.1 Minio 대시보드

```
URL: http://64.176.226.119:9001
Username: codeb-cache
Password: <설정한 비밀번호>
```

### 6.2 캐시 사용량 확인

```bash
# 버킷별 용량
mc du codeb/build-cache --depth 2

# 예시 출력:
# 1.2GiB  codeb-api/npm-cache
# 800MiB  codeb-api/node-modules
# 200MiB  codeb-api/next-cache
```

### 6.3 캐시 적중률 모니터링

```bash
# GitHub Actions 로그에서 확인
# ✅ Cache restored: npm-abc123.tar.gz  → 캐시 히트
# ⚠️ No cache found, will create new    → 캐시 미스
```

### 6.4 캐시 정리 (Lifecycle Policy)

```bash
# 30일 이상 된 캐시 자동 삭제
mc ilm rule add codeb/build-cache \
  --expire-days 30 \
  --prefix ""

# 수동 정리
mc rm --recursive --force --older-than 7d codeb/build-cache/
```

---

## 7. 트러블슈팅

### 7.1 Minio 연결 실패

```bash
# 증상: mc: <ERROR> Unable to connect

# 해결:
# 1. Minio 컨테이너 상태 확인
docker ps | grep minio
docker logs minio

# 2. 포트 확인
netstat -tlnp | grep 9000

# 3. 방화벽 확인
ufw status | grep 9000
```

### 7.2 캐시 복원 실패

```bash
# 증상: tar: Error opening archive

# 해결:
# 1. 캐시 파일 존재 확인
mc ls codeb/build-cache/codeb-api/

# 2. 캐시 파일 무결성 확인
mc cat codeb/build-cache/codeb-api/npm-xxx.tar.gz | tar -tzf - | head

# 3. 캐시 재생성
/opt/codeb/scripts/cache-helper.sh save npm codeb-api $(md5sum package-lock.json | cut -d' ' -f1 | head -c8)
```

### 7.3 빌드 시간이 줄지 않음

```bash
# 확인사항:
# 1. 캐시 히트 확인
grep "Cache restored" /path/to/workflow.log

# 2. 해시값 확인 (package-lock.json 변경 여부)
md5sum package-lock.json

# 3. node_modules 캐시 확인
ls -la node_modules/.package-lock.json
```

### 7.4 디스크 공간 부족

```bash
# Storage Server에서 확인
df -h /opt/codeb/minio

# 오래된 캐시 정리
mc rm --recursive --force --older-than 14d codeb/build-cache/

# Docker 정리
docker system prune -a --volumes
```

---

## 부록: 빠른 설치 스크립트

```bash
#!/bin/bash
# CodeB Minio Cache Server 설치 스크립트
# 사용법: curl -sSL https://raw.githubusercontent.com/.../install-minio.sh | bash

set -e

echo "🚀 CodeB Minio Cache Server 설치 시작..."

# 1. 디렉토리 생성
mkdir -p /opt/codeb/minio/data

# 2. 비밀번호 생성
MINIO_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c24)
echo "MINIO_PASSWORD=$MINIO_PASSWORD" > /opt/codeb/minio/.env

# 3. Minio 컨테이너 실행
docker run -d \
  --name minio \
  --restart always \
  -p 9000:9000 \
  -p 9001:9001 \
  -v /opt/codeb/minio/data:/data \
  -e MINIO_ROOT_USER=codeb-cache \
  -e MINIO_ROOT_PASSWORD=$MINIO_PASSWORD \
  minio/minio server /data --console-address ":9001"

# 4. mc 설치
curl -sO https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc && mv mc /usr/local/bin/

# 5. 버킷 생성
sleep 5
mc alias set codeb http://localhost:9000 codeb-cache $MINIO_PASSWORD
mc mb codeb/build-cache

# 6. 결과 출력
echo ""
echo "✅ Minio 설치 완료!"
echo ""
echo "📋 GitHub Secrets에 추가할 값:"
echo "  MINIO_ENDPOINT=http://$(hostname -I | awk '{print $1}'):9000"
echo "  MINIO_ACCESS_KEY=codeb-cache"
echo "  MINIO_SECRET_KEY=$MINIO_PASSWORD"
echo ""
echo "🌐 Minio Console: http://$(hostname -I | awk '{print $1}'):9001"
```

---

> **문서 끝** | 버전: VERSION 파일 참조
