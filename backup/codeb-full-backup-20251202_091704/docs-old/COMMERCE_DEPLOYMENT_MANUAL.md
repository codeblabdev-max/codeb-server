# Commerce 프로젝트 배포 메뉴얼

> CodeB CLI 3.0 기반 중고상품 커머스 플랫폼 배포 가이드

## 📋 목차
1. [시스템 요구사항](#시스템-요구사항)
2. [로컬 개발 환경](#로컬-개발-환경)
3. [서버 배포](#서버-배포)
4. [데이터베이스 관리](#데이터베이스-관리)
5. [도메인 및 SSL](#도메인-및-ssl)
6. [모니터링 및 관리](#모니터링-및-관리)
7. [문제 해결](#문제-해결)

---

## 🔧 시스템 요구사항

### 로컬 환경
- **Podman**: v5.0+ 설치 완료
- **PostgreSQL**: Podman 컨테이너로 실행
- **Redis**: Podman 컨테이너로 실행  
- **Node.js**: 20.x (컨테이너 내부)
- **Git**: 최신 버전

### 서버 환경
- **OS**: Ubuntu/CentOS Linux
- **RAM**: 4GB 이상 권장
- **Storage**: 50GB 이상 권장
- **Podman**: 서버에 설치 완료
- **도메인**: `*.one-q.xyz` 서브도메인 사용

---

## 🏠 로컬 개발 환경

### 1. 로컬 Podman 환경 확인
```bash
# Podman 상태 확인
podman version
podman pod ls
podman ps -a

# Commerce pod 상태 확인
podman ps --filter name=commerce
```

### 2. 로컬 프로젝트 구조
```
~/new_project/commerce-nextjs/
├── database/
│   ├── schema.sql          # 메인 스키마
│   └── sample-data.sql     # 샘플 데이터
├── migrations/             # DB 마이그레이션
├── app/                    # Next.js 애플리케이션
├── components/             # React 컴포넌트
├── lib/                    # 유틸리티 라이브러리
└── .env                    # 환경 설정
```

### 3. 로컬 환경변수 설정
```env
# .env 파일 예시
PORT=3000
NODE_ENV=development

# PostgreSQL 연결
DB_HOST=localhost
DB_PORT=5432
DB_NAME=commerce_plugin
DB_USER=admin
DB_PASSWORD=admin123

# Redis 연결
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT 설정
JWT_SECRET=commerce_jwt_secret_2024
```

### 4. 로컬 개발 서버 실행
```bash
# 로컬 개발용 (CLI 3.0 사용 시)
cd ~/codeb-projects
./codeb local create commerce nodejs
./codeb local start commerce

# 또는 기존 방식
cd ~/new_project/commerce-nextjs
npm run dev
```

---

## 🚀 서버 배포

### 1. 기본 배포 명령어
```bash
# CodeB CLI v2.0 사용
./codeb-cli-v2.sh deploy commerce https://github.com/dungeun/e-market.git main
```

### 2. 단계별 배포 프로세스

#### Step 1: 프로젝트 생성
```bash
# 서버에 프로젝트 생성 (최초 1회만)
./codeb-cli-v2.sh create commerce nodejs

# 출력 예시:
# ✅ 프로젝트 생성 완료!
# • 이름: commerce
# • 포트: 4001
# • 도메인: commerce.codeb.one-q.xyz
# • 접속: http://141.164.60.51:4001
```

#### Step 2: 코드 배포
```bash
# Git 저장소에서 코드 배포
./codeb-cli-v2.sh deploy commerce https://github.com/dungeun/e-market.git main

# 배포 과정:
# 1. Git clone/pull 실행
# 2. npm install --legacy-peer-deps
# 3. PostgreSQL 스키마 생성
# 4. 샘플 데이터 삽입
# 5. Next.js 빌드
# 6. PM2로 앱 시작
```

#### Step 3: 배포 상태 확인
```bash
# 프로젝트 상태 확인
./codeb-cli-v2.sh status commerce

# 실시간 로그 확인
./codeb-cli-v2.sh tail commerce app

# 진단 실행
./codeb-cli-v2.sh diagnose commerce
```

### 3. 고급 배포 옵션

#### 데이터베이스 백업과 함께 배포
```bash
# 로컬 DB 백업 생성
./codeb-cli-v2.sh db backup commerce

# 백업과 함께 배포
./codeb-cli-v2.sh deploy commerce https://github.com/dungeun/e-market.git main --db-backup http://example.com/backup.sql
```

#### 특정 브랜치 배포
```bash
# 개발 브랜치 배포
./codeb-cli-v2.sh deploy commerce https://github.com/dungeun/e-market.git develop

# 태그 기반 배포
./codeb-cli-v2.sh deploy commerce https://github.com/dungeun/e-market.git v1.0.0
```

---

## 🗄️ 데이터베이스 관리

### 1. 스키마 구조
```sql
-- 주요 테이블
categories          -- 상품 카테고리
products            -- 상품 정보
users               -- 사용자 관리
orders              -- 주문 관리
payments            -- 결제 정보
language_packs      -- 다국어 지원
ui_sections         -- UI 구성요소
```

### 2. 데이터베이스 백업/복원
```bash
# 백업 생성
./codeb-cli-v2.sh db backup commerce
# → commerce_20250903_123456.sql 파일 생성

# 백업 복원
./codeb-cli-v2.sh db restore commerce commerce_backup.sql

# 테이블 목록 확인
./codeb-cli-v2.sh db tables commerce

# SQL 쿼리 실행
./codeb-cli-v2.sh db query commerce "SELECT COUNT(*) FROM products;"
```

### 3. 마이그레이션 관리
```bash
# 마이그레이션 파일 직접 실행
./codeb-cli-v2.sh db push commerce migrations/001_create_language_settings.sql

# 모든 마이그레이션 실행
for file in migrations/*.sql; do
  ./codeb-cli-v2.sh db push commerce "$file"
done
```

---

## 🌐 도메인 및 SSL

### 1. 자동 도메인 설정
```bash
# 프로젝트 생성 시 자동 설정
# 도메인: {프로젝트명}.codeb.one-q.xyz
# SSL: Let's Encrypt 자동 인증서

# 예시:
# commerce.codeb.one-q.xyz
# https://commerce.codeb.one-q.xyz
```

### 2. Caddy 설정 확인
```bash
# 서버에서 Caddy 설정 확인
cat /etc/caddy/Caddyfile

# Caddy 재시작 (필요 시)
sudo systemctl restart caddy
```

### 3. DNS 설정
```bash
# DNS 레코드 확인
nslookup commerce.codeb.one-q.xyz

# SSL 인증서 상태 확인
curl -I https://commerce.codeb.one-q.xyz
```

---

## 📊 모니터링 및 관리

### 1. 실시간 모니터링
```bash
# 앱 로그 모니터링
./codeb-cli-v2.sh tail commerce app

# PM2 프로세스 모니터링
./codeb-cli-v2.sh tail commerce pm2

# 빌드 로그 확인
./codeb-cli-v2.sh logs commerce build 100
```

### 2. 성능 진단
```bash
# 종합 진단 실행
./codeb-cli-v2.sh diagnose commerce

# 출력 예시:
# 건강 점수: 95%
# 전체 상태: 🟢 healthy
# • 컨테이너: Running (실행중: true)
# • package.json: OK
# • node_modules: OK
# • 포트 4001: listening=true
# • PM2: 실행중=true
```

### 3. 프로젝트 제어
```bash
# 프로젝트 중지
./codeb-cli-v2.sh stop commerce

# 프로젝트 시작
./codeb-cli-v2.sh start commerce

# 프로젝트 재시작
./codeb-cli-v2.sh restart commerce
```

### 4. 빌드 관리
```bash
# 개발 모드 빌드
./codeb-cli-v2.sh build commerce dev

# 프로덕션 빌드
./codeb-cli-v2.sh build commerce build

# 앱 시작 (빌드 후)
./codeb-cli-v2.sh build commerce start
```

---

## 🛠️ 문제 해결

### 1. 일반적인 문제

#### 포트 충돌
```bash
# 포트 사용 확인
netstat -tlnp | grep :4001

# 프로젝트 재시작
./codeb-cli-v2.sh restart commerce
```

#### 데이터베이스 연결 실패
```bash
# PostgreSQL 컨테이너 상태 확인
podman ps --filter name=commerce-postgres

# 컨테이너 재시작
podman restart commerce-postgres

# 연결 테스트
./codeb-cli-v2.sh db query commerce "SELECT 1;"
```

#### 빌드 실패
```bash
# 빌드 로그 확인
./codeb-cli-v2.sh logs commerce build

# node_modules 재설치
podman exec commerce-app rm -rf node_modules package-lock.json
./codeb-cli-v2.sh deploy commerce https://github.com/dungeun/e-market.git main
```

### 2. 성능 최적화

#### 메모리 사용량 확인
```bash
# 컨테이너 리소스 사용량
podman stats commerce-app

# PM2 메모리 모니터링
podman exec commerce-app pm2 monit
```

#### 캐시 설정
```bash
# Redis 상태 확인
podman exec commerce-redis redis-cli ping

# Redis 캐시 클리어
podman exec commerce-redis redis-cli FLUSHALL
```

### 3. 로그 분석

#### 에러 로그 필터링
```bash
# 에러만 필터링
./codeb-cli-v2.sh logs commerce app 200 | grep -i error

# 특정 시간대 로그
./codeb-cli-v2.sh logs commerce app | grep "2025-01-09"
```

#### 로그 레벨 설정
```env
# .env에서 로그 레벨 조정
LOG_LEVEL=debug
NODE_ENV=production
```

### 4. 백업 및 복구

#### 전체 백업 스크립트
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)

# 데이터베이스 백업
./codeb-cli-v2.sh db backup commerce

# 파일 백업
podman exec commerce-app tar -czf /tmp/commerce_files_$DATE.tar.gz /app

# 백업 파일 다운로드
podman cp commerce-app:/tmp/commerce_files_$DATE.tar.gz ./
```

#### 재해 복구
```bash
# 1. 새 프로젝트 생성
./codeb-cli-v2.sh create commerce-recovery nodejs

# 2. 백업 복원
./codeb-cli-v2.sh db restore commerce-recovery commerce_backup.sql

# 3. 코드 재배포
./codeb-cli-v2.sh deploy commerce-recovery https://github.com/dungeun/e-market.git main
```

---

## 📚 추가 리소스

### 1. CLI 명령어 참조
```bash
# 전체 도움말
./codeb-cli-v2.sh help

# 특정 명령어 도움말
./codeb-cli-v2.sh db help
```

### 2. API 엔드포인트
```
관리자: https://commerce.codeb.one-q.xyz/admin
API: https://commerce.codeb.one-q.xyz/api
Health Check: https://commerce.codeb.one-q.xyz/api/health
```

### 3. 환경별 설정
```bash
# 개발 환경
NODE_ENV=development
DB_NAME=commerce_dev

# 스테이징 환경  
NODE_ENV=staging
DB_NAME=commerce_staging

# 프로덕션 환경
NODE_ENV=production
DB_NAME=commerce
```

---

## 🎯 빠른 시작 체크리스트

- [ ] Podman 설치 및 확인
- [ ] Git 저장소 준비
- [ ] 로컬 환경변수 설정
- [ ] 프로젝트 생성: `./codeb-cli-v2.sh create commerce nodejs`
- [ ] 코드 배포: `./codeb-cli-v2.sh deploy commerce {git-url} main`
- [ ] 상태 확인: `./codeb-cli-v2.sh status commerce`
- [ ] 도메인 접속: `https://commerce.codeb.one-q.xyz`
- [ ] 관리자 접속: `https://commerce.codeb.one-q.xyz/admin`

---

**📞 지원**: 배포 관련 문제 발생 시 로그와 함께 문의해 주세요.