# GitHub Actions + Minio 캐시 연동 가이드

> 팀원용 단계별 캐시 설정 가이드

---

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [GitHub Secrets 설정](#2-github-secrets-설정)
3. [워크플로우 템플릿](#3-워크플로우-템플릿)
4. [프로젝트별 적용](#4-프로젝트별-적용)
5. [캐시 확인 및 관리](#5-캐시-확인-및-관리)

---

## 1. 사전 요구사항

### 1.1 팀 API 키 확인

```bash
# 팀 API 키가 있는지 확인
# 형식: codeb_{teamId}_{role}_{token}
echo $CODEB_API_KEY
```

### 1.2 Minio 접근 권한

Minio 캐시 서버는 **App Server (158.247.203.55)에서만** 접근 가능합니다.

- **Self-hosted Runner**: 자동으로 접근 가능
- **GitHub-hosted Runner**: SSH 또는 API를 통해 간접 접근

---

## 2. GitHub Secrets 설정

### 2.1 필요한 Secrets

| Secret 이름 | 설명 | 예시 |
|-------------|------|------|
| `MINIO_ENDPOINT` | Minio 서버 주소 | `http://64.176.226.119:9000` |
| `MINIO_ACCESS_KEY` | 접근 키 | `codeb-cache` |
| `MINIO_SECRET_KEY` | 비밀 키 | (관리자에게 문의) |

### 2.2 Secrets 설정 방법

**방법 1: GitHub UI**

1. Repository → Settings → Secrets and variables → Actions
2. "New repository secret" 클릭
3. 각 Secret 추가

**방법 2: GitHub CLI**

```bash
# gh CLI 사용
gh secret set MINIO_ENDPOINT --body "http://64.176.226.119:9000"
gh secret set MINIO_ACCESS_KEY --body "codeb-cache"
gh secret set MINIO_SECRET_KEY --body "<비밀키>"
```

**방법 3: /we:secrets 스킬 사용**

```bash
# Claude Code에서 실행
/we:secrets
```

---

## 3. 워크플로우 템플릿

### 3.1 Self-hosted Runner (캐시 최적화)

```yaml
# .github/workflows/deploy.yml
name: Deploy with Minio Cache

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: self-hosted

    steps:
      - uses: actions/checkout@v4

      # 캐시 해시 생성
      - name: Generate cache key
        id: cache
        run: |
          HASH=$(md5sum package-lock.json | cut -d' ' -f1 | head -c8)
          echo "hash=$HASH" >> $GITHUB_OUTPUT

      # npm 캐시 복원
      - name: Restore npm cache
        run: |
          /opt/codeb/scripts/cache-helper.sh restore npm ${{ github.event.repository.name }} ${{ steps.cache.outputs.hash }}

      # node_modules 캐시 복원
      - name: Restore node_modules
        run: |
          /opt/codeb/scripts/cache-helper.sh restore node-modules ${{ github.event.repository.name }} ${{ steps.cache.outputs.hash }}

      # 의존성 설치 (캐시 활용)
      - name: Install dependencies
        run: |
          if [ -d "node_modules" ]; then
            echo "✅ Using cached node_modules"
            npm ci --prefer-offline 2>/dev/null || npm ci
          else
            npm ci
          fi

      # 빌드
      - name: Build
        run: npm run build

      # 캐시 저장
      - name: Save caches
        if: always()
        run: |
          /opt/codeb/scripts/cache-helper.sh save npm ${{ github.event.repository.name }} ${{ steps.cache.outputs.hash }}
          /opt/codeb/scripts/cache-helper.sh save node-modules ${{ github.event.repository.name }} ${{ steps.cache.outputs.hash }}

      # 배포
      - name: Deploy
        run: |
          # 배포 로직...
```

### 3.2 GitHub-hosted + API (캐시 없음)

```yaml
# .github/workflows/deploy-api.yml
name: Deploy via API

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      # GitHub 기본 캐시 사용 (Minio 대신)
      - name: Cache npm
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
          restore-keys: ${{ runner.os }}-npm-

      # Docker 빌드 (멀티스테이지로 캐시 활용)
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # CodeB API로 배포
      - name: Deploy via CodeB API
        run: |
          curl -X POST "https://api.codeb.kr/api/tool" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -d '{
              "tool": "deploy_project",
              "params": {
                "projectName": "${{ github.event.repository.name }}",
                "image": "ghcr.io/${{ github.repository }}:latest"
              }
            }'
```

### 3.3 Next.js 프로젝트 (최적화)

```yaml
name: Deploy Next.js

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: self-hosted

    steps:
      - uses: actions/checkout@v4

      - name: Generate cache keys
        id: cache
        run: |
          NPM_HASH=$(md5sum package-lock.json | cut -d' ' -f1 | head -c8)
          NEXT_HASH=$(find src -type f -exec md5sum {} \; | md5sum | cut -d' ' -f1 | head -c8)
          echo "npm_hash=$NPM_HASH" >> $GITHUB_OUTPUT
          echo "next_hash=$NEXT_HASH" >> $GITHUB_OUTPUT

      # npm 캐시
      - name: Restore npm cache
        run: /opt/codeb/scripts/cache-helper.sh restore npm ${{ github.event.repository.name }} ${{ steps.cache.outputs.npm_hash }}

      # node_modules 캐시
      - name: Restore node_modules
        run: /opt/codeb/scripts/cache-helper.sh restore node-modules ${{ github.event.repository.name }} ${{ steps.cache.outputs.npm_hash }}

      # .next 빌드 캐시
      - name: Restore Next.js cache
        run: /opt/codeb/scripts/cache-helper.sh restore next ${{ github.event.repository.name }} ${{ steps.cache.outputs.next_hash }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install & Build
        run: |
          npm ci --prefer-offline 2>/dev/null || npm ci
          npm run build

      # 캐시 저장
      - name: Save all caches
        if: always()
        run: |
          /opt/codeb/scripts/cache-helper.sh save npm ${{ github.event.repository.name }} ${{ steps.cache.outputs.npm_hash }}
          /opt/codeb/scripts/cache-helper.sh save node-modules ${{ github.event.repository.name }} ${{ steps.cache.outputs.npm_hash }}
          /opt/codeb/scripts/cache-helper.sh save next ${{ github.event.repository.name }} ${{ steps.cache.outputs.next_hash }}
```

---

## 4. 프로젝트별 적용

### 4.1 새 프로젝트 설정

```bash
# 1. 워크플로우 생성
/we:workflow init <project-name>

# 2. 캐시 활성화 옵션 선택
#    - Self-hosted: Minio 캐시 자동 적용
#    - API: GitHub Cache 사용
```

### 4.2 기존 프로젝트 마이그레이션

```bash
# 기존 워크플로우 백업
cp .github/workflows/deploy.yml .github/workflows/deploy.yml.bak

# 템플릿 복사
cp /path/to/hybrid/templates/workflows/deploy-self-hosted.yml .github/workflows/deploy.yml

# 프로젝트 이름 교체
sed -i 's/{{PROJECT_NAME}}/your-project-name/g' .github/workflows/deploy.yml
```

### 4.3 캐시 키 전략

| 캐시 타입 | 키 생성 방법 | 무효화 시점 |
|-----------|--------------|-------------|
| npm | `package-lock.json` 해시 | 의존성 변경 시 |
| node-modules | `package-lock.json` 해시 | 의존성 변경 시 |
| next | `src/` 폴더 해시 | 소스 변경 시 |
| turbo | `.turbo/` 해시 | 빌드 설정 변경 시 |

---

## 5. 캐시 확인 및 관리

### 5.1 캐시 상태 확인

```bash
# SSH로 App Server 접속 후
ssh root@158.247.203.55

# 프로젝트별 캐시 목록
mc ls codeb/build-cache/<project-name>/

# 캐시 용량 확인
mc du codeb/build-cache/<project-name>/ --depth 1
```

### 5.2 캐시 수동 삭제

```bash
# 특정 프로젝트 캐시 삭제
mc rm --recursive --force codeb/build-cache/<project-name>/

# 특정 타입만 삭제
mc rm --recursive --force codeb/build-cache/<project-name>/npm-cache/

# 오래된 캐시만 삭제 (7일 이상)
mc rm --recursive --force --older-than 7d codeb/build-cache/
```

### 5.3 캐시 히트율 확인

GitHub Actions 로그에서 확인:

```
✅ Cache restored: npm-abc123.tar.gz     # 캐시 히트
⚠️ No cache found, will create new       # 캐시 미스
```

### 5.4 문제 해결

**캐시가 복원되지 않는 경우:**

1. `package-lock.json`이 변경되었는지 확인
2. 캐시 키 해시 값 비교
3. Minio 연결 상태 확인

```bash
# 캐시 키 확인
md5sum package-lock.json | head -c8

# Minio 연결 테스트
mc ls codeb/build-cache/
```

**빌드 시간이 줄지 않는 경우:**

1. 캐시 복원 로그 확인
2. `npm ci --prefer-offline` 사용 여부 확인
3. TypeScript incremental 빌드 활성화 확인

---

## 부록: 캐시 성능 비교

| 시나리오 | GitHub Cache | Minio Cache | 개선율 |
|----------|--------------|-------------|--------|
| npm 캐시 복원 | 30-60초 | 3-5초 | 90% ↓ |
| node_modules 복원 | 45-90초 | 5-10초 | 85% ↓ |
| Next.js 캐시 복원 | 20-40초 | 2-5초 | 85% ↓ |
| 전체 빌드 | 3-5분 | 30초-1분 | 80% ↓ |

---

> **문서 끝** | 버전: VERSION 파일 참조
