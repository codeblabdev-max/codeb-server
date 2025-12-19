# 배포 아키텍처 - celly-creative.codeb.one-q.xyz

## 🏗️ 시스템 구조

### 서버 정보
- **서버 IP**: 141.164.60.51
- **메인 도메인**: codeb.one-q.xyz
- **프로젝트 도메인**: celly-creative.codeb.one-q.xyz
- **포트 할당**: 4000-4999 범위 자동 할당

### 핵심 컴포넌트
1. **DNS 서버 (BIND9)**: 도메인 자동 등록
2. **웹 서버 (Caddy)**: 리버스 프록시 및 SSL 자동 발급
3. **컨테이너 (Podman)**: Pod 기반 프로젝트 격리
4. **API 서버**: 3008 포트에서 프로젝트 관리

## 🚀 배포 프로세스

### 1. 프로젝트 생성 흐름
```
클라이언트 요청
    ↓
API 서버 (3008)
    ↓
Podman Pod 생성 (project-{name})
    ↓
컨테이너 생성 (App + PostgreSQL + Redis)
    ↓
포트 할당 (자동)
    ↓
DNS 레코드 추가
    ↓
Caddy 설정 업데이트
    ↓
SSL 인증서 발급 (Let's Encrypt)
```

### 2. 컨테이너 구조
```
project-{name} (Pod)
├── {name}-app (Node.js 애플리케이션)
├── {name}-postgres (PostgreSQL 15)
└── {name}-redis (Redis 7)
```

### 3. 디렉토리 구조
```
/var/lib/codeb/projects/{project-name}/
├── app/          # 애플리케이션 코드
├── config/       # 설정 파일 (DB 비밀번호 등)
├── data/         # 영구 데이터
│   ├── postgres/ # PostgreSQL 데이터
│   └── redis/    # Redis 데이터
└── logs/         # 로그 파일
```

## 📡 API 엔드포인트

### 프로젝트 관리 API (포트 3008)
- `GET /api/health` - 헬스체크
- `GET /api/projects` - 프로젝트 목록
- `POST /api/projects` - 프로젝트 생성
- `DELETE /api/projects/:name` - 프로젝트 삭제
- `POST /api/projects/:name/:action` - 시작/중지/재시작
- `GET /api/projects/:name/status` - 상태 확인
- `GET /api/projects/:name/logs` - 로그 조회
- `POST /api/projects/:name/deploy` - 코드 배포

## 🔐 보안 설정

### SSL/TLS
- **자동 HTTPS**: Caddy가 Let's Encrypt 통해 자동 발급
- **HTTP → HTTPS**: 자동 리다이렉트
- **인증서 갱신**: 만료 30일 전 자동 갱신

### 컨테이너 격리
- 각 프로젝트는 독립된 Pod에서 실행
- 프로젝트 간 네트워크 격리
- 리소스 제한 가능

### 데이터베이스 보안
- PostgreSQL: 프로젝트별 독립 인스턴스, 랜덤 비밀번호
- Redis: requirepass 설정, 랜덤 비밀번호
- 비밀번호는 `/var/lib/codeb/projects/{name}/config/`에 저장

## 🌐 도메인 및 네트워크

### DNS 설정
```bind
; 와일드카드 도메인
*.codeb    IN    A    141.164.60.51

; 개별 프로젝트 (선택사항)
celly-creative.codeb    IN    A    141.164.60.51
```

### Caddy 프록시 설정
```caddyfile
celly-creative.codeb.one-q.xyz {
    reverse_proxy localhost:4001
    encode gzip
    header {
        X-Real-IP {remote_host}
        X-Forwarded-For {remote_host}
        X-Forwarded-Proto {scheme}
    }
}
```

## 📦 배포 스크립트

### 주요 스크립트
1. **codeb-api-server.js**: 메인 API 서버
2. **deploy-video-platform.sh**: 프로젝트 배포 자동화
3. **project-manager.sh**: 프로젝트 관리 CLI
4. **setup-project-api.js**: API 통한 프로젝트 설정

### 배포 절차
```bash
# 1. API로 프로젝트 생성
curl -X POST http://141.164.60.51:3008/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "celly-creative", "template": "nodejs"}'

# 2. 코드 배포
curl -X POST http://141.164.60.51:3008/api/projects/celly-creative/deploy \
  -H "Content-Type: application/json" \
  -d '{"gitUrl": "https://github.com/user/repo.git"}'

# 3. 상태 확인
curl http://141.164.60.51:3008/api/projects/celly-creative/status
```

## 🔄 프로젝트 라이프사이클

### 생성
1. Pod 생성 (격리된 네트워크 환경)
2. 컨테이너 시작 (App, DB, Cache)
3. 포트 할당 및 프록시 설정
4. DNS 및 SSL 설정

### 운영
- 실시간 로그 모니터링
- 자동 재시작 정책
- 리소스 사용량 추적
- 백업 스케줄링

### 삭제
1. Pod 중지
2. 컨테이너 및 볼륨 제거
3. DNS 레코드 정리
4. 포트 할당 해제

## 🛠️ 트러블슈팅

### 일반적인 문제
1. **502 Bad Gateway**: 애플리케이션 미실행 → 컨테이너 재시작
2. **SSL 인증서 오류**: Caddy 재시작 필요
3. **DNS 미응답**: BIND9 재시작 또는 캐시 초기화
4. **포트 충돌**: 자동 포트 재할당

### 모니터링 명령어
```bash
# Pod 상태
podman pod ps --filter name=project-celly-creative

# 컨테이너 로그
podman logs celly-creative-app

# 리소스 사용량
podman stats --no-stream

# 네트워크 상태
netstat -tlnp | grep 4001
```

## 📊 성능 최적화

### 캐싱
- Caddy: HTTP 캐싱 헤더 자동 관리
- Redis: 세션 및 애플리케이션 캐시
- PostgreSQL: 쿼리 캐시 튜닝

### 스케일링
- 수직 스케일링: 컨테이너 리소스 제한 조정
- 수평 스케일링: 로드밸런서 추가 가능
- 자동 스케일링: CPU/메모리 기반 정책

## 🔗 접속 정보

### celly-creative 프로젝트
- **도메인**: https://celly-creative.codeb.one-q.xyz
- **직접 접속**: http://141.164.60.51:4001
- **API 상태**: http://141.164.60.51:3008/api/projects/celly-creative/status
- **로그 조회**: http://141.164.60.51:3008/api/projects/celly-creative/logs

### 데이터베이스 접속
- **PostgreSQL**: `postgres://celly-creative:***@localhost:5432/celly-creative`
- **Redis**: `redis://:***@localhost:6379`
- 비밀번호는 서버의 `/var/lib/codeb/projects/celly-creative/config/` 참조