# CodeB Project Generator - Quick Start (5분 완성)

## Step 1: API 서버 시작 (30초)

```bash
cd /Users/admin/new_project/codeb-server/api
npm install
npm start
```

**확인:**
```
✓ Server running on http://localhost:3200
  OpenAPI docs: http://localhost:3200/api/docs
  Health check: http://localhost:3200/api/health
```

## Step 2: 프로젝트 생성 (1분)

### 방법 A: CLI 사용 (추천)

```bash
we project create my-app --type nextjs --database --redis
```

### 방법 B: API 직접 호출

```bash
curl -X POST http://localhost:3200/api/project/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "type": "nextjs",
    "database": true,
    "redis": true
  }'
```

**생성되는 파일:**
```
✓ Dockerfile
✓ .github/workflows/deploy.yml
✓ .env.example
✓ quadlet/production/app.container
✓ quadlet/production/postgres.container
✓ quadlet/production/redis.container
✓ quadlet/staging/app.container
✓ quadlet/staging/postgres.container
✓ quadlet/staging/redis.container
```

## Step 3: Git 리포지토리 설정 (1분)

```bash
cd my-app

# Git 초기화
git init

# GitHub 리포지토리 생성 (GitHub CLI 사용)
gh repo create my-app --public --source=. --remote=origin

# 파일 추가 및 커밋
git add .
git commit -m "Add CodeB infrastructure"

# Push
git push -u origin main
```

## Step 4: GitHub Secrets 설정 (1분)

```bash
# 데이터베이스 비밀번호 설정
gh secret set DB_PASSWORD --body "your_secure_password"

# API 키 설정 (필요시)
gh secret set API_KEY --body "your_api_key"
```

## Step 5: Self-hosted Runner 설정 (1분)

### 서버에서 실행:

```bash
# SSH 접속
ssh root@158.247.203.55

# Runner 디렉토리 생성
mkdir -p /opt/codeb/actions-runner
cd /opt/codeb/actions-runner

# GitHub Actions Runner 다운로드 및 설치
# (GitHub 리포지토리 Settings → Actions → Runners → New self-hosted runner 참고)
```

## Step 6: 배포 확인 (30초)

### GitHub Actions 진행 상황 확인

```bash
# CLI에서 확인
gh run list

# 특정 실행 상태 확인
gh run watch
```

### 배포 URL 확인

```
Staging:    https://my-app-staging.codeb.kr
Production: https://my-app.codeb.kr
```

## 완료!

프로젝트가 자동으로 배포되었습니다.

---

## 추가 명령어

### 프로젝트 목록 보기

```bash
we project list
```

### 프로젝트 상세 정보

```bash
we project info my-app
```

### 사용 가능한 프로젝트 타입

```bash
we project types
```

### 로그 확인

```bash
# GitHub Actions 로그
gh run view --log

# 서버 컨테이너 로그 (SSH 접속 후)
ssh root@158.247.203.55 "podman logs my-app-production -f"
```

### 환경 변수 관리

```bash
# 서버에서 환경 변수 가져오기
we env pull my-app

# 로컬 환경 변수 서버에 업로드
we env push my-app
```

---

## 문제 해결

### API 서버가 시작되지 않을 때

```bash
# 포트 확인
lsof -i :3200

# 강제 종료 후 재시작
pkill -f project-generator
npm start
```

### 빌드 실패

```bash
# GitHub Actions 로그 확인
gh run view --log-failed

# 로컬에서 Docker 빌드 테스트
docker build -t my-app .
```

### 배포 실패

```bash
# Self-hosted runner 상태 확인
ssh root@158.247.203.55 "systemctl status actions.runner.*"

# Runner 재시작
ssh root@158.247.203.55 "systemctl restart actions.runner.*"
```

---

## 다음 단계

1. **커스텀 도메인 설정**
   ```bash
   we domain setup myapp.com --project my-app --ssl
   ```

2. **데이터베이스 마이그레이션**
   ```bash
   ssh root@158.247.203.55
   podman exec my-app-production npm run migrate
   ```

3. **모니터링 설정**
   ```bash
   we monitor --project my-app
   ```

4. **백업 설정**
   ```bash
   we workflow add-resource my-app --backup
   ```

---

**총 소요 시간: 약 5분**

**다음 배포부터는: git push만 하면 자동 배포!**
