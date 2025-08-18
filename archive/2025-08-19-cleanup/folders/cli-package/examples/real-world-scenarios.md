# 🌍 실제 사용 시나리오

## 시나리오 1: 스타트업 MVP 개발

### 상황
- Next.js 프론트엔드 + Express.js API
- PostgreSQL 데이터베이스 필요
- 빠른 프로토타입 배포

### 해결
```bash
# 1. 프론트엔드 배포
codeb deploy startup-web https://github.com/startup/web-app \
  --env NEXT_PUBLIC_API_URL=https://startup-api.one-q.xyz

# 2. API 서버 배포
codeb deploy startup-api https://github.com/startup/api-server \
  --db postgresql \
  --env NODE_ENV=production \
  --env JWT_SECRET=your-jwt-secret \
  --env CORS_ORIGIN=https://startup-web.one-q.xyz

# 결과
# 프론트엔드: https://startup-web.one-q.xyz
# API: https://startup-api.one-q.xyz
# 데이터베이스: PostgreSQL 자동 연결
```

## 시나리오 2: 개발/스테이징/프로덕션 환경

### 상황
- 3단계 배포 환경 필요
- 각 환경별 다른 설정

### 해결
```bash
# 개발 환경
codeb deploy myapp-dev https://github.com/company/myapp \
  --branch develop \
  --db postgresql redis \
  --env NODE_ENV=development \
  --env DEBUG=true

# 스테이징 환경  
codeb deploy myapp-staging https://github.com/company/myapp \
  --branch staging \
  --db postgresql redis \
  --env NODE_ENV=staging \
  --env DEBUG=false

# 프로덕션 환경
codeb deploy myapp-prod https://github.com/company/myapp \
  --branch main \
  --db postgresql redis mongodb \
  --env NODE_ENV=production \
  --env DEBUG=false \
  --env MONITORING=true

# 결과
# 개발: https://myapp-dev.one-q.xyz
# 스테이징: https://myapp-staging.one-q.xyz  
# 프로덕션: https://myapp-prod.one-q.xyz
```

## 시나리오 3: 마이크로서비스 아키텍처

### 상황
- 여러 개의 독립적인 서비스
- 각 서비스별 다른 데이터베이스

### 해결
```bash
# 1. 사용자 서비스 (PostgreSQL)
codeb deploy user-service https://github.com/company/user-service \
  --port 3001 \
  --db postgresql \
  --env SERVICE_NAME=user

# 2. 주문 서비스 (MySQL)
codeb deploy order-service https://github.com/company/order-service \
  --port 3002 \
  --db mysql \
  --env SERVICE_NAME=order

# 3. 알림 서비스 (Redis)
codeb deploy notification-service https://github.com/company/notification-service \
  --port 3003 \
  --db redis \
  --env SERVICE_NAME=notification

# 4. 로그 서비스 (MongoDB)
codeb deploy log-service https://github.com/company/log-service \
  --port 3004 \
  --db mongodb \
  --env SERVICE_NAME=log

# 5. API 게이트웨이
codeb deploy api-gateway https://github.com/company/api-gateway \
  --port 3000 \
  --env USER_SERVICE_URL=https://user-service.one-q.xyz \
  --env ORDER_SERVICE_URL=https://order-service.one-q.xyz \
  --env NOTIFICATION_SERVICE_URL=https://notification-service.one-q.xyz
```

## 시나리오 4: 오픈소스 프로젝트 데모

### 상황
- GitHub 오픈소스 프로젝트
- 빠른 데모 사이트 필요

### 해결
```bash
# README에 추가할 내용
## 🚀 빠른 데모

1. CodeB CLI 설치:
   ```bash
   npm install -g codeb-cli
   ```

2. 이 프로젝트 배포:
   ```bash
   codeb deploy my-awesome-demo https://github.com/username/awesome-project
   ```

3. 2분 후 접속: https://my-awesome-demo.one-q.xyz

# 실제 배포
codeb deploy awesome-demo https://github.com/username/awesome-project \
  --env DEMO_MODE=true \
  --env SAMPLE_DATA=true
```

## 시나리오 5: 클라이언트 프로젝트 납품

### 상황
- 클라이언트에게 완성된 웹사이트 납품
- 빠른 배포와 시연 필요

### 해결
```bash
# 클라이언트 프로젝트 배포
codeb deploy client-website https://github.com/agency/client-project \
  --db postgresql \
  --env COMPANY_NAME="클라이언트 회사명" \
  --env CONTACT_EMAIL="client@company.com" \
  --env GOOGLE_ANALYTICS_ID="GA-XXXXXX"

# 관리자 대시보드 (필요시)
codeb deploy client-admin https://github.com/agency/client-admin \
  --env MAIN_SITE_URL=https://client-website.one-q.xyz \
  --env ADMIN_EMAIL="admin@company.com"

# 클라이언트에게 전달
echo "
🎉 웹사이트 배포 완료!

메인 사이트: https://client-website.one-q.xyz
관리자: https://client-admin.one-q.xyz

✅ SSL 인증서 자동 적용
✅ 데이터베이스 설정 완료  
✅ 백업 시스템 가동

📋 관리 명령어:
codeb status client-website
codeb logs client-website
"
```

## 시나리오 6: 교육용 실습 환경

### 상황
- 개발 부트캠프 or 대학교 강의
- 학생들이 쉽게 배포할 수 있는 환경

### 해결
```bash
# 강사가 준비하는 베이스 프로젝트
codeb deploy bootcamp-template https://github.com/bootcamp/base-template

# 학생별 개별 배포 (학생 이름으로)
codeb deploy student-john https://github.com/students/john-project
codeb deploy student-jane https://github.com/students/jane-project
codeb deploy student-bob https://github.com/students/bob-project

# 결과
# https://student-john.one-q.xyz
# https://student-jane.one-q.xyz  
# https://student-bob.one-q.xyz

# 전체 상태 확인
codeb status | grep "student-"
```

## 자동화 스크립트 예제

### 배치 배포 스크립트
```bash
#!/bin/bash
# batch-deploy.sh

PROJECTS=(
  "user-service:https://github.com/company/user-service:postgresql"
  "order-service:https://github.com/company/order-service:mysql"  
  "notification-service:https://github.com/company/notification-service:redis"
)

for project in "${PROJECTS[@]}"; do
  IFS=':' read -r name repo db <<< "$project"
  echo "🚀 배포 중: $name"
  
  codeb deploy "$name" "$repo" --db "$db" --env NODE_ENV=production
  
  echo "✅ 완료: $name"
  echo "---"
done

echo "🎉 전체 배포 완료!"
codeb status
```

### 환경별 배포 스크립트
```bash
#!/bin/bash
# deploy-environments.sh

PROJECT_NAME="myapp"
REPO_URL="https://github.com/company/myapp"

# 개발 환경
echo "🔧 개발 환경 배포..."
codeb deploy "${PROJECT_NAME}-dev" "$REPO_URL" \
  --branch develop \
  --db postgresql \
  --env NODE_ENV=development

# 스테이징 환경
echo "🎭 스테이징 환경 배포..."
codeb deploy "${PROJECT_NAME}-staging" "$REPO_URL" \
  --branch staging \
  --db postgresql redis \
  --env NODE_ENV=staging

# 프로덕션 확인 후 배포
read -p "프로덕션 배포를 진행하시겠습니까? (y/N): " confirm
if [[ $confirm == [yY] ]]; then
  echo "🚀 프로덕션 환경 배포..."
  codeb deploy "${PROJECT_NAME}-prod" "$REPO_URL" \
    --branch main \
    --db postgresql redis mongodb \
    --env NODE_ENV=production \
    --env MONITORING=true
fi

echo "✅ 배포 완료"
codeb status
```