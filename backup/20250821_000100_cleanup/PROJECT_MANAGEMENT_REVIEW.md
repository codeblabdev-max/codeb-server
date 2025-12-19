# 프로젝트 관리 시스템 검토 및 개선안

## 📊 현재 시스템 분석

### 🏗️ 아키텍처 현황

#### 1. API 서버 (codeb-api-server.js)
- **포트**: 3008
- **데이터베이스**: JSON 파일 (/var/lib/codeb/projects.json)
- **포트 할당**: 4000-4999 범위 자동 할당
- **컨테이너 엔진**: Podman Pod 기반

#### 2. 프로젝트 구조
```
Pod: project-{name}
├── {name}-app (애플리케이션, 포트 매핑: {port}:3000)
├── {name}-postgres (PostgreSQL 15)
└── {name}-redis (Redis 7)
```

#### 3. 현재 배포된 프로젝트
- **test-nextjs**: 포트 4001, 상태 Created (중지됨)
- **video-platform**: 포트 4002, 상태 Running
- **celly-creative**: 포트 4000, 방금 생성됨

## 🔍 문제점 분석

### 1. 프로젝트 생성 프로세스
**현재 문제점**:
- ❌ Caddy 설정 자동화 실패 (수동 설정 필요)
- ❌ DNS 레코드 자동 추가 미구현
- ❌ 템플릿별 차이점 처리 부족
- ❌ 빈 컨테이너 생성 (실제 코드 배포 별도)

**개선 필요사항**:
- ✅ Caddy 자동 리로드 수정
- ✅ DNS 자동 등록 구현
- ✅ 프로젝트 템플릿 시스템 강화

### 2. 빌드 및 배포 파이프라인
**현재 상태**:
- ❌ 자동화된 빌드 시스템 없음
- ❌ Git 기반 배포 미완성
- ❌ 환경변수 관리 분산
- ❌ 의존성 설치 수동 처리

**현재 배포 방식**:
```bash
# 수동 배포 과정
1. 프로젝트 생성 (API)
2. 코드 수동 복사
3. package.json 수동 생성
4. 의존성 설치
5. 빌드 및 실행
```

### 3. 프로젝트 라이프사이클 관리
**미비점**:
- 🔄 프로젝트 업데이트 프로세스 부재
- 📊 상태 모니터링 제한적
- 🗑️ 완전한 삭제 프로세스 필요
- 🔄 롤백 메커니즘 없음

### 4. 도메인 및 SSL 관리
**Caddy 설정 문제**:
```bash
Error: no config file to load
Job for caddy.service failed
```
- Caddy 설정 파일 경로 문제
- SSL 인증서 자동 발급 실패
- 도메인 자동 등록 미구현

## 🛠️ 개선 제안사항

### 1. 통합 배포 시스템 구축

#### A. 프로젝트 생성 API 개선
```javascript
// 개선된 프로젝트 생성
POST /api/projects
{
  "name": "project-name",
  "template": "nextjs|nodejs|python|static",
  "gitUrl": "https://github.com/user/repo.git",
  "branch": "main",
  "envVars": {
    "NODE_ENV": "production",
    "DATABASE_URL": "auto-generated"
  },
  "buildCommand": "npm run build",
  "startCommand": "npm start"
}
```

#### B. 자동 배포 파이프라인
```bash
프로젝트 생성
    ↓
Git Clone & 환경설정
    ↓
의존성 설치
    ↓
빌드 실행
    ↓
컨테이너 시작
    ↓
도메인/SSL 설정
    ↓
상태 검증
```

### 2. 프로젝트 템플릿 시스템

#### Next.js 템플릿
```json
{
  "template": "nextjs",
  "runtime": "node:20-alpine",
  "buildCommand": "npm run build",
  "startCommand": "npm start",
  "port": 3000,
  "dependencies": ["tailwindcss", "postcss", "autoprefixer"],
  "envTemplate": {
    "NODE_ENV": "production",
    "PORT": "3000"
  }
}
```

#### Python/Django 템플릿
```json
{
  "template": "django",
  "runtime": "python:3.11-alpine",
  "buildCommand": "pip install -r requirements.txt",
  "startCommand": "gunicorn app.wsgi:application",
  "port": 8000
}
```

### 3. 개선된 API 엔드포인트 설계

```javascript
// 현재 API
GET /api/projects              // 프로젝트 목록
POST /api/projects             // 프로젝트 생성
DELETE /api/projects/:name     // 프로젝트 삭제
GET /api/projects/:name/status // 상태 확인
GET /api/projects/:name/logs   // 로그 조회

// 추가 필요 API
PUT /api/projects/:name        // 프로젝트 설정 수정
POST /api/projects/:name/deploy // Git에서 재배포
POST /api/projects/:name/rebuild // 전체 리빌드
POST /api/projects/:name/rollback // 이전 버전 롤백
GET /api/projects/:name/metrics // 리소스 사용량
```

### 4. 환경변수 관리 시스템

#### 환경변수 저장 구조
```
/var/lib/codeb/projects/{name}/
├── config/
│   ├── .env.production       # 프로덕션 환경변수
│   ├── .env.local           # 로컬 오버라이드
│   ├── postgres_password    # DB 비밀번호
│   └── redis_password       # Redis 비밀번호
```

#### API 환경변수 관리
```javascript
// 환경변수 관리 API
GET /api/projects/:name/env     // 환경변수 목록
POST /api/projects/:name/env    // 환경변수 추가/수정
DELETE /api/projects/:name/env/:key // 환경변수 삭제
```

### 5. 도메인 및 SSL 자동화

#### DNS 자동 등록 시스템
```bash
# DNS 레코드 자동 추가
echo "${name}.codeb    IN    A    141.164.60.51" >> /etc/bind/db.one-q.xyz
systemctl reload bind9
```

#### Caddy 자동 설정
```bash
# /etc/caddy/sites-enabled/{name}.conf
cat > /etc/caddy/sites-enabled/${name}.conf << EOF
${name}.codeb.one-q.xyz {
    reverse_proxy localhost:${port}
    encode gzip
    log {
        output file /var/log/caddy/${name}.log
    }
}
EOF

caddy reload --config /etc/caddy/Caddyfile
```

## 🚀 구현 우선순위

### Phase 1: 긴급 수정 (1-2일)
1. **Caddy 설정 수정** - 현재 배포 실패 원인
2. **DNS 레코드 수동 추가** - celly-creative 도메인 활성화
3. **Next.js 배포 스크립트** - 표준화된 배포 과정

### Phase 2: 자동화 구축 (3-5일)
1. **프로젝트 템플릿 시스템** - 프레임워크별 자동 설정
2. **Git 기반 배포** - 저장소에서 직접 배포
3. **환경변수 관리 API** - 웹 인터페이스 통한 설정

### Phase 3: 고도화 (1-2주)
1. **모니터링 시스템** - 리소스 사용량, 성능 메트릭
2. **롤백 시스템** - 이전 버전 복구 기능
3. **스케일링** - 멀티 인스턴스 지원

## 📝 즉시 실행 가능한 개선사항

### 1. Caddy 설정 수정
```bash
# Caddy 설정 파일 확인 및 수정
sudo systemctl status caddy
sudo mkdir -p /etc/caddy/sites-enabled
sudo systemctl restart caddy
```

### 2. 표준 배포 스크립트 생성
```bash
#!/bin/bash
# deploy-standard.sh
PROJECT_NAME=$1
GIT_URL=$2
PORT=$(curl -s http://localhost:3008/api/projects/$PROJECT_NAME | jq '.appPort')

# 코드 배포
curl -X POST http://localhost:3008/api/projects/$PROJECT_NAME/deploy \
  -H "Content-Type: application/json" \
  -d "{\"gitUrl\": \"$GIT_URL\"}"
```

### 3. 환경변수 템플릿
```bash
# 프로젝트별 환경변수 템플릿 생성
mkdir -p /var/lib/codeb/templates/
cat > /var/lib/codeb/templates/nextjs.env << EOF
NODE_ENV=production
PORT=3000
NEXT_TELEMETRY_DISABLED=1
EOF
```

## 🎯 성공 지표

1. **배포 성공률**: 95% 이상 자동 배포 성공
2. **배포 시간**: 평균 5분 이내 완료
3. **관리 효율성**: 수동 개입 최소화
4. **안정성**: 서비스 중단 없는 업데이트

이러한 개선을 통해 **celly-creative** 같은 프로젝트를 안정적으로 관리하고, 향후 추가 프로젝트의 배포를 자동화할 수 있습니다.