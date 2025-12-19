# 📦 CodeB - Container-Based Project Management System

> **현재 상태**: 서버 141.164.60.51에 설치 완료  
> **관리자 API 키**: `cb_9H2h-toJyAsJBVfBCattelw46jdufVyQ8ttR7YRr6Kw`

CodeB는 Podman 컨테이너와 Caddy 리버스 프록시를 활용한 종합적인 프로젝트 관리 시스템입니다.

## 🎯 빠른 시작

**서버가 이미 설치되어 있습니다!** 바로 사용하세요:

```bash
# 1. CLI 설정
codeb config init
# API URL: http://141.164.60.51:3000
# API Key: cb_9H2h-toJyAsJBVfBCattelw46jdufVyQ8ttR7YRr6Kw

# 2. 첫 프로젝트 생성
codeb project create myapp

# 3. 프로젝트 시작
codeb project start myapp
```

## 📚 사용자 가이드

### 🎯 핵심 문서 (이것만 보세요!)
- **[👉 사용자 메뉴얼](USER_MANUAL.md)** - 일상적인 사용법
- **[🚀 빠른 시작](QUICK_START_GUIDE.md)** - 5분 만에 시작하기
- **[❗ 문제 해결](TROUBLESHOOTING.md)** - 오류 해결법

### 📖 상세 문서
- **[API 참조서](API_REFERENCE.md)** - API 사용법
- **[상세 메뉴얼](docs/MANUAL.md)** - 완전한 기능 설명

## 🏗️ 폴더 구조

### ✨ 중요한 것들
```
codeb-remix/          # 웹 서버 (메인)
codeb-cli/            # CLI 도구
USER_MANUAL.md        # 사용자 메뉴얼 ← 여기 보세요!
```

### 📁 기타 파일들 (참고용)
```
docs/                 # 문서들
scripts/              # 스크립트들
infrastructure/       # 인프라 코드
templates/            # 템플릿들
```

## 🛠️ 주요 기능

- **컨테이너 기반 배포**: Podman으로 안전한 컨테이너 관리
- **자동 SSL**: Caddy가 자동으로 SSL 인증서 관리
- **멀티 사용자**: API 키 기반 권한 관리
- **Git 통합**: Git 저장소에서 직접 배포
- **환경 관리**: 프로젝트별 환경 변수 관리
- **실시간 모니터링**: 프로젝트 상태 및 로그 모니터링

## 🚨 현재 설치된 서버 정보

**서버**: 141.164.60.51  
**관리자 API 키**: `cb_9H2h-toJyAsJBVfBCattelw46jdufVyQ8ttR7YRr6Kw`  
**키 저장 위치**: `/root/codeb-admin-key.txt`

### 서버 관리 명령어
```bash
# 서버 상태 확인
ssh root@141.164.60.51 "pm2 status"

# 서버 재시작
ssh root@141.164.60.51 "pm2 restart codeb-server"

# 로그 확인
ssh root@141.164.60.51 "pm2 logs codeb-server"
```

## 🔧 개발 환경

로컬 개발을 위한 Docker Compose 환경도 준비되어 있습니다:

```bash
# 로컬 개발 시작
make setup
make dev

# Docker로 전체 환경 시작
make docker-up
```

## 📞 지원

문제가 발생하면:
1. **[USER_MANUAL.md](USER_MANUAL.md)** 먼저 확인
2. **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** 문제 해결 가이드 참조
3. 서버 로그 확인: `ssh root@141.164.60.51 "pm2 logs codeb-server"`

## 📁 정리된 폴더 구조

### ✨ 핵심 파일들 (깔끔하게 정리됨!)
```
codeb-server/
├── 📘 USER_MANUAL.md           ← 🌟 사용자 메뉴얼 (가장 중요!)
├── 📗 QUICK_START_GUIDE.md     ← 빠른 시작 가이드
├── 📕 TROUBLESHOOTING.md       ← 문제 해결 가이드
├── 📙 API_REFERENCE.md         ← API 사용법
├── 🔧 codeb-remix/             ← 웹 서버 (메인)
├── 💻 codeb-cli/               ← CLI 도구
├── 🐳 docker-compose.yml       ← 로컬 개발용
├── 🛠️ Makefile                ← 편의 명령어들
├── 📦 install.sh               ← 서버 설치 스크립트
└── 🗃️ archive/                ← 백업된 파일들 (2025-08-19 정리)
```

### 🗃️ 백업된 파일들
복잡했던 모든 파일들이 `archive/2025-08-19-cleanup/`로 깔끔하게 정리되었습니다:
```
archive/2025-08-19-cleanup/
├── folders/                    ← 이동된 폴더들
│   ├── docs/                   ← 상세 문서들
│   ├── scripts/                ← 자동화 스크립트들
│   ├── infrastructure/         ← Terraform 코드
│   ├── server-api/             ← 테스트 API들
│   ├── cli-package/            ← 패키징 파일들
│   ├── templates/              ← 템플릿들
│   └── backups/                ← 이전 백업들
└── docs/                       ← 이동된 문서들
    ├── COMPLETE_PROJECT_DOCUMENTATION.md
    ├── DEPLOYMENT_REPORT.md
    └── PROJECT_SUMMARY.md
```

**복원이 필요한 경우**: `archive/` 폴더에서 필요한 파일들을 복원할 수 있습니다.

---

*최종 업데이트: 2025-08-19 - 서버 설치 완료, 사용자 메뉴얼 추가*