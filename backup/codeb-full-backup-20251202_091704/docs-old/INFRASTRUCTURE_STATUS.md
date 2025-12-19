# CodeB 서버 인프라 현황 문서
> 최종 업데이트: 2025-08-25

## 📌 개요

CodeB 프로젝트는 단일 Vultr 서버에서 운영되는 통합 개발-배포 플랫폼입니다.
API 서버, CLI 도구, 컨테이너 기반 프로젝트 호스팅을 제공합니다.

## 🖥️ 서버 인프라

### 메인 서버
- **IP 주소**: 141.164.60.51
- **도메인**: one-q.xyz
- **운영체제**: Ubuntu 22.04 LTS (Kernel 5.15.0-151)
- **하드웨어**: 
  - CPU: 2 vCPU
  - RAM: 16GB
  - 메인 디스크: 94GB SSD
  - 추가 스토리지: 98GB Block Storage
- **월 비용**: $82.45 (서버 $80 + Block Storage $2.45)

### 스토리지 구성
```
/dev/vda2 (94GB) - 메인 시스템
├── 사용: 39GB (44%)
└── 가용: 51GB

/dev/vdb (98GB) - Block Storage
├── 사용: 2.1GB (3%)
└── 가용: 91GB
└── 마운트: /mnt/blockstorage
```

## 🔧 서비스 아키텍처

### 1. API 서버 (포트 3008)
- **서비스명**: CodeB API Server v2.0
- **프로세스 관리**: PM2 (codeb-api)
- **상태**: 정상 작동 중
- **메모리 사용**: ~61MB
- **실행 시간**: 4일+

### 2. 컨테이너 런타임 (Podman)
- **엔진**: Podman (Docker 대체)
- **네트워크**: Pod 기반 격리
- **포트 범위**: 4000-4999

### 3. 프로세스 관리 (PM2)
```
활성 프로세스:
- codeb-api (포트 3008) - 메인 API
- final-api - 보조 API

비활성 프로세스:
- codeb-app (errored)
- deploy-api (stopped)
- fixed-api (stopped)
```

## 🐳 프로젝트 컨테이너 현황

| 프로젝트 | 포트 | 컨테이너 | 상태 |
|---------|------|---------|------|
| test-nextjs-app | 4001 | Next.js 앱 | ✅ Running |
| video-platform | 4002 | 비디오 플랫폼 + PostgreSQL + Redis | ✅ Running |
| test-cli-project | 4003 | CLI 테스트 + PostgreSQL + Redis | ✅ Running |

## 📁 디렉토리 구조

### Block Storage (/mnt/blockstorage)
```
/mnt/blockstorage/
├── backups/          # 프로젝트 백업
├── docker-volumes/   # 컨테이너 볼륨
├── logs/            # 시스템 로그
├── postgres/        # PostgreSQL 데이터
├── projects/        # 프로젝트 소스코드
├── redis/           # Redis 데이터
├── snapshots/       # 시스템 스냅샷
└── projects.json    # 프로젝트 메타데이터
```

### 루트 디렉토리 (/root)
```
주요 실행 파일:
- codeb-api-server.js      # 메인 API 서버
- codeb-api-server-v2.js   # v2 API 서버
- codeb-cli-v2.sh          # CLI 도구 v2
```

## 🌐 네트워크 구성

### 활성 포트
- **3008**: CodeB API Server
- **4001**: test-nextjs-app
- **4002**: video-platform  
- **4003**: test-cli-project
- **5433**: PostgreSQL (video-platform)
- **53**: DNS (BIND9)

### 비활성/미사용 포트
- **80, 443**: HTTP/HTTPS (설정 필요)
- **8000**: Coolify (제거됨)
- **4004-4999**: 추가 프로젝트용 예약

## 🔐 보안 설정

### 방화벽
- UFW 활성화
- SSH (22) 허용
- API 포트 (3008) 허용
- 프로젝트 포트 (4000-4999) 허용

### 인증
- SSH 키 기반 인증
- API 키 인증 (codeb-admin-key.txt)

## 📊 시스템 리소스

### CPU 및 메모리
```
CPU: 2 vCPU (사용률 낮음)
RAM: 16GB 총량
├── 사용: 1.9GB (12%)
├── 버퍼/캐시: 13GB
└── 가용: 13GB

Swap: 8GB (거의 미사용)
```

### 프로세스별 메모리
- codeb-api: 61.4MB
- final-api: 65.2MB
- Podman 컨테이너: 각 ~50-100MB

## 🚀 CLI 도구

### 버전 관리
```
/Users/admin/new_project/codeb-server/
├── codeb-cli.sh (v3.0)      # 통합 관리 도구
├── codeb-cli-v2.sh (v2.0)   # API 전용 버전
└── codeb-cli/                # 모듈화 버전
    ├── commands/
    └── lib/
```

### 주요 기능
- 프로젝트 생성/삭제
- 컨테이너 관리
- 데이터베이스 작업
- 로그 조회
- 진단 도구

## 🔄 변경 이력

### 2025-08-24
- 서버 2 (158.247.233.83) 삭제
- Coolify 서비스 제거
- DNS 서버 교체

### 2025-08-21
- Block Storage 추가 (98GB)
- PM2 프로세스 관리 도입

### 2025-08-19
- CodeB API Server v2.0 배포
- Podman 기반 컨테이너 전환

## ⚠️ 알려진 이슈

1. **systemd 서비스 재시작 루프**
   - codeb-api-server.service가 자동 재시작 중
   - PM2로 실행 중이므로 systemd 서비스 비활성화 권장

2. **PM2 프로세스 정리 필요**
   - errored/stopped 상태 프로세스 제거 필요

3. **HTTP/HTTPS 미설정**
   - 웹 서버(Nginx/Caddy) 설정 필요
   - SSL 인증서 설정 필요

## 📝 권장 조치사항

### 즉시 조치
1. systemd 서비스 중복 실행 해결
2. PM2 프로세스 정리
3. 로그 로테이션 설정

### 단기 개선
1. HTTP/HTTPS 서비스 활성화
2. 자동 백업 스크립트 구성
3. 모니터링 시스템 구축

### 장기 계획
1. CI/CD 파이프라인 구축
2. 로드 밸런싱 고려
3. 재해 복구 계획 수립

## 📞 연락처

기술 지원이 필요한 경우:
- API 서버 로그: `/mnt/blockstorage/logs/`
- PM2 로그: `pm2 logs`
- 시스템 로그: `journalctl -f`

---

*이 문서는 실제 서버 상태를 기반으로 작성되었습니다.*
*최종 검증: 2025-08-25 01:30 KST*