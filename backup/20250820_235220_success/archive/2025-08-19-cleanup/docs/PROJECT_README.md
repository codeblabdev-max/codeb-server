# CodeB - Project Management System

완전한 프로젝트 관리 시스템 with Podman + Caddy + PostgreSQL + Redis

## 🚀 프로젝트 구조

```
codeb-server/
├── codeb-cli/              # 로컬 CLI 도구
│   ├── bin/               # CLI 실행 파일
│   ├── src/               
│   │   ├── commands/      # CLI 명령어 구현
│   │   ├── lib/          # API 클라이언트, 설정
│   │   └── utils/        # 유틸리티 함수
│   └── package.json
│
├── codeb-server/          # 서버 API
│   ├── src/
│   │   ├── controllers/  # 비즈니스 로직
│   │   ├── routes/       # API 라우트
│   │   ├── models/       # 데이터 모델
│   │   ├── services/     # Podman, Caddy 서비스
│   │   ├── middleware/   # 인증, 검증
│   │   └── utils/        # 유틸리티
│   └── package.json
│
└── docs/                  # 문서
    ├── planning/         # 기획 문서
    ├── podman/          # Podman 설계
    └── lxd/             # LXD 설계 (참고용)
```

## 📋 기능

### CLI 명령어
```bash
# 프로젝트 관리
codeb list                     # 프로젝트 목록
codeb create <name>            # 프로젝트 생성
codeb delete <name>            # 프로젝트 삭제
codeb clone <source> <target>  # 프로젝트 복사
codeb status [name]            # 프로젝트 상태

# 프로젝트 제어
codeb start <name>             # 시작
codeb stop <name>              # 중지
codeb restart <name>           # 재시작
codeb logs <name>              # 로그 보기

# 배포
codeb deploy <name>            # 배포
codeb rollback <name>          # 롤백

# 데이터베이스
codeb db:backup <name>         # DB 백업
codeb db:restore <name>        # DB 복원
codeb db:shell <name>          # DB 접속

# 환경 변수
codeb env:list <name>          # 환경변수 목록
codeb env:set <name> KEY=val   # 환경변수 설정
```

## 🔧 설치

### 1. 서버 설치 (141.164.60.51)

```bash
# 서버 API 설치
cd codeb-server
npm install
npm start

# Podman 설치
sudo apt install -y podman podman-compose

# Caddy 설치
sudo apt install -y caddy
```

### 2. 로컬 CLI 설치

```bash
# CLI 설치
cd codeb-cli
npm install
npm link  # 전역 명령어로 등록

# 서버 연결 설정
codeb config:init
codeb config --server http://141.164.60.51:3000
```

## 💻 사용 예시

### 새 프로젝트 생성
```bash
# Node.js 프로젝트 생성
codeb create myapp \
  --git https://github.com/user/myapp \
  --domain myapp.com \
  --template node

# 상태 확인
codeb status myapp

# 로그 보기
codeb logs myapp -f
```

### 배포
```bash
# 프로덕션 배포
codeb deploy myapp --env production

# 롤백
codeb rollback myapp
```

## 🏗️ 아키텍처

### Pod 구조
각 프로젝트는 독립된 Pod로 운영:
- App Container (Node.js/Python/Go)
- PostgreSQL Container
- Redis Container

### 네트워크
- Caddy: 리버스 프록시 + 자동 SSL
- 프로젝트별 격리된 네트워크

### 스토리지
- `/mnt/blockstorage/projects/`: 프로젝트 데이터
- `/mnt/blockstorage/postgres/`: DB 데이터
- `/mnt/blockstorage/redis/`: 캐시 데이터

## 📁 파일 구조

### 로컬 설정
```
~/.config/codeb-cli/
├── config.json    # CLI 설정
└── servers.json   # 서버 프로필
```

### 서버 데이터
```
/mnt/blockstorage/
├── projects/      # 프로젝트 파일
├── postgres/      # PostgreSQL 데이터
├── redis/         # Redis 데이터
└── backups/       # 백업 파일
```

## 🔑 환경 변수

### 서버 환경 변수
```env
PORT=3000
NODE_ENV=production
DATABASE_URL=sqlite://./db/codeb.sqlite
JWT_SECRET=your-secret-key
STORAGE_PATH=/mnt/blockstorage
```

### CLI 환경 변수
```env
CODEB_SERVER=http://141.164.60.51:3000
CODEB_TOKEN=your-api-token
```

## 📚 API 엔드포인트

### Projects
- `GET /api/projects` - 프로젝트 목록
- `POST /api/projects` - 프로젝트 생성
- `DELETE /api/projects/:name` - 프로젝트 삭제
- `GET /api/projects/:name/status` - 상태 조회
- `POST /api/projects/:name/start` - 시작
- `POST /api/projects/:name/stop` - 중지

### Deploy
- `POST /api/deploy/:name` - 배포
- `POST /api/deploy/:name/rollback` - 롤백

## 🚨 트러블슈팅

### Pod가 시작되지 않을 때
```bash
# Pod 상태 확인
podman pod ps -a

# 로그 확인
podman pod logs <project-name>

# 강제 재시작
codeb restart <project> --hard
```

### 포트 충돌
```bash
# 사용 중인 포트 확인
sudo netstat -tlnp | grep :3000

# 프로젝트 포트 변경
codeb config set <project> port 3001
```

## 📝 라이센스

MIT License

## 👥 기여

Pull requests are welcome!

---

**Version**: 1.0.0  
**Author**: CodeB Team  
**Date**: 2025-08-18