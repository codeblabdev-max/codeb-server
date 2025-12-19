# CodeB 완전 가이드

> Git 배포부터 도메인 설정까지 모든 것

## 목차

1. [시스템 개요](#시스템-개요)
2. [빠른 시작](#빠른-시작)
3. [프로젝트 배포 전체 과정](#프로젝트-배포-전체-과정)
4. [실전 예제](#실전-예제)
5. [관리 및 운영](#관리-및-운영)
6. [트러블슈팅](#트러블슈팅)

---

## 시스템 개요

### 아키텍처
```
[GitHub] → [CodeB API Server] → [Podman Containers]
                ↓                        ↓
           [BIND9 DNS]            [PostgreSQL/Redis]
                ↓                        ↓
           [Caddy Proxy] → [HTTPS://your-app.codeb.one-q.xyz]
```

### 핵심 구성 요소

| 구성 요소 | 역할 | 포트 |
|----------|------|------|
| CodeB API | 프로젝트 관리 | 3008 |
| Caddy | 리버스 프록시 & SSL | 80/443 |
| BIND9 | DNS 서버 | 53 |
| Podman | 컨테이너 관리 | - |
| PostgreSQL | 데이터베이스 | 5432+ |
| Redis | 캐싱/세션 | 6379+ |

---

## 빠른 시작

### 1분 배포
```bash
# GitHub 저장소에서 바로 배포
curl -X POST http://141.164.60.51:3008/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-awesome-app",
    "template": "nextjs",
    "gitUrl": "https://github.com/vercel/next-learn-starter.git"
  }'

# 30초 후 접속
open https://my-awesome-app.codeb.one-q.xyz
```

---

## 프로젝트 배포 전체 과정

### Step 1: 프로젝트 생성

#### API 사용
```bash
curl -X POST http://141.164.60.51:3008/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "video-platform",
    "template": "nextjs",
    "gitUrl": "https://github.com/dungeun/video_platform.git",
    "enablePostgres": true,
    "enableRedis": true
  }'
```

#### CLI 사용
```bash
codeb create video-platform \
  --template nextjs \
  --git https://github.com/dungeun/video_platform.git \
  --postgres --redis
```

### Step 2: 자동 처리 과정

1. **컨테이너 생성**
   ```
   video-platform-app     # Node.js 애플리케이션
   video-platform-postgres # PostgreSQL 데이터베이스
   video-platform-redis    # Redis 캐시
   ```

2. **Git 클론 및 빌드**
   ```bash
   git clone [repository]
   npm install
   npm run build
   ```

3. **데이터베이스 설정**
   ```bash
   # Prisma 자동 감지 시
   npx prisma generate
   npx prisma db push
   ```

4. **환경변수 자동 설정**
   ```env
   DATABASE_URL=postgresql://postgres:pass@localhost:5432/video_platform
   REDIS_URL=redis://localhost:6379
   NODE_ENV=production
   PORT=3000
   ```

5. **DNS 레코드 추가**
   ```bind
   video-platform.codeb IN A 141.164.60.51
   ```

6. **Caddy 프록시 설정**
   ```caddyfile
   video-platform.codeb.one-q.xyz {
       reverse_proxy localhost:3000
   }
   ```

7. **SSL 인증서 발급**
   - Let's Encrypt 자동 발급
   - HTTPS 자동 활성화

### Step 3: 애플리케이션 시작
```bash
npm start
# 또는
npm run dev  # 개발 모드
```

---

## 실전 예제

### 예제 1: Next.js + Prisma + PostgreSQL

#### 1. 프로젝트 구조
```
my-app/
├── prisma/
│   └── schema.prisma
├── pages/
├── package.json
└── .env.example
```

#### 2. 배포 명령
```bash
# 프로젝트 생성
codeb create my-app --template nextjs --postgres

# Git 저장소 연결
codeb deploy my-app --git https://github.com/user/my-app.git

# 환경변수 설정
codeb env my-app set JWT_SECRET=secret123
codeb env my-app set NEXTAUTH_URL=https://my-app.codeb.one-q.xyz
```

#### 3. 데이터베이스 마이그레이션
```bash
# Prisma 스키마 푸시
codeb exec my-app "npx prisma db push"

# 시드 데이터
codeb exec my-app "npx prisma db seed"
```

### 예제 2: 기존 프로젝트 마이그레이션

#### 1. 로컬 프로젝트 준비
```bash
# package.json 확인
{
  "scripts": {
    "build": "next build",
    "start": "next start"
  }
}

# .env.example 생성
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
```

#### 2. 배포
```bash
# GitHub에 푸시
git push origin main

# CodeB로 배포
codeb create my-project --git https://github.com/user/my-project.git
```

### 예제 3: Python Django 프로젝트

#### 1. requirements.txt
```txt
Django==4.2.0
psycopg2-binary==2.9.6
redis==4.5.4
gunicorn==20.1.0
```

#### 2. 배포 스크립트
```bash
#!/bin/bash
# deploy.sh
python manage.py migrate
python manage.py collectstatic --noinput
gunicorn myproject.wsgi:application --bind 0.0.0.0:3000
```

#### 3. 배포
```bash
codeb create django-app --template python \
  --git https://github.com/user/django-app.git \
  --postgres --redis
```

---

## 관리 및 운영

### 로그 모니터링
```bash
# 애플리케이션 로그
codeb logs my-app --follow

# 데이터베이스 로그
codeb logs my-app --container postgres

# Redis 로그
codeb logs my-app --container redis
```

### 상태 확인
```bash
# 프로젝트 상태
codeb status my-app

# 모든 프로젝트
codeb list

# 시스템 상태
curl http://141.164.60.51:3008/health
```

### 백업 및 복원
```bash
# 데이터베이스 백업
codeb db my-app backup > backup.sql

# 전체 프로젝트 백업
codeb backup my-app

# 복원
codeb restore my-app backup-20250820.tar.gz
```

### 스케일링
```bash
# 리소스 증가
codeb scale my-app --memory 2G --cpu 2

# 레플리카 추가
codeb scale my-app --replicas 3
```

---

## 트러블슈팅

### 일반적인 문제

#### 1. DNS가 작동하지 않음
```bash
# DNS 서버 직접 테스트
nslookup my-app.codeb.one-q.xyz 141.164.60.51

# 해결: DNS 캐시 초기화
sudo dscacheutil -flushcache  # macOS
```

#### 2. 502 Bad Gateway
```bash
# 애플리케이션 상태 확인
ssh root@141.164.60.51 "podman ps | grep my-app"

# 해결: 컨테이너 재시작
codeb restart my-app
```

#### 3. 빌드 실패
```bash
# 로그 확인
codeb logs my-app | grep ERROR

# 해결: 수동 빌드
codeb exec my-app "npm install && npm run build"
```

#### 4. 데이터베이스 연결 실패
```bash
# DATABASE_URL 확인
codeb env my-app

# 해결: PostgreSQL 재시작
ssh root@141.164.60.51 "podman restart my-app-postgres"
```

#### 5. SSL 인증서 오류
```bash
# Caddy 로그 확인
ssh root@141.164.60.51 "journalctl -u caddy -n 50"

# 해결: Caddy 재시작
ssh root@141.164.60.51 "systemctl restart caddy"
```

### 고급 디버깅

#### 컨테이너 직접 접속
```bash
ssh root@141.164.60.51
podman exec -it my-app-app /bin/sh
```

#### 네트워크 디버깅
```bash
# 포트 확인
netstat -tlnp | grep 3000

# 프로세스 확인
ps aux | grep node
```

#### 로그 상세 분석
```bash
# 모든 로그 수집
codeb logs my-app --all > debug.log

# 에러만 필터링
grep -i error debug.log
```

---

## 부록

### 포트 할당 표
| 포트 | 프로젝트 |
|------|----------|
| 3000 | video-platform (현재) |
| 4001 | test-nextjs |
| 4002 | video-platform (원래) |
| 4003+ | 새 프로젝트용 |

### 환경변수 참조
```env
# 자동 제공
DATABASE_URL      # PostgreSQL 연결
REDIS_URL         # Redis 연결  
NODE_ENV          # production/development
PORT              # 애플리케이션 포트
DOMAIN            # 프로젝트 도메인

# 자주 사용하는 커스텀 변수
JWT_SECRET        # 인증 토큰 시크릿
NEXTAUTH_URL      # NextAuth 콜백 URL
NEXT_PUBLIC_*     # 클라이언트 공개 변수
```

### 유용한 명령어 모음
```bash
# 프로젝트 관리
codeb create [name] --template [type] --git [url]
codeb deploy [name]
codeb delete [name]

# 운영 관리
codeb logs [name] --follow
codeb exec [name] "[command]"
codeb env [name] set KEY=value

# 데이터베이스
codeb db [name] push
codeb db [name] migrate
codeb db [name] studio

# 디버깅
codeb status [name]
codeb restart [name]
codeb backup [name]
```

---

## 연락처 및 지원

- **서버 관리자**: root@141.164.60.51
- **API 엔드포인트**: http://141.164.60.51:3008
- **시스템 상태**: http://141.164.60.51:3008/health

문제 발생 시:
1. 이 가이드의 트러블슈팅 섹션 확인
2. `codeb logs` 로 로그 확인
3. SSH로 서버 직접 접속하여 디버깅