# CodeB CLI v3.0 매뉴얼
> 통합 개발-배포 관리 시스템

## 📋 목차
- [개요](#개요)
- [설치 및 설정](#설치-및-설정)
- [아키텍처](#아키텍처)
- [명령어 가이드](#명령어-가이드)
  - [로컬 개발 (local)](#로컬-개발-local)
  - [서버 관리 (server)](#서버-관리-server)
  - [자동 배포 (deploy)](#자동-배포-deploy)
  - [데이터베이스 (db)](#데이터베이스-db)
- [워크플로우 예제](#워크플로우-예제)
- [트러블슈팅](#트러블슈팅)

---

## 개요

CodeB CLI v3.0은 로컬 개발부터 서버 배포까지 전체 DevOps 워크플로우를 통합 관리하는 도구입니다.

### 주요 특징
- 🐳 **Podman 기반**: 로컬과 서버 환경 동일 구성
- 🔄 **자동 배포**: act + Git + 서버 배포 파이프라인
- 📊 **DB 동기화**: 환경별 마이그레이션 관리
- 🎯 **모드 기반**: 명확한 명령어 구조

### 버전 정보
```bash
codeb version
# CodeB CLI v3.0.0
```

---

## 설치 및 설정

### 필수 요구사항
```bash
# macOS
brew install podman jq curl git
brew install act  # GitHub Actions 로컬 실행 (선택)

# Ubuntu/Debian
apt install podman jq curl git

# CentOS/RHEL
yum install podman jq curl git
```

### Podman 설정 (macOS)
```bash
# Podman machine 초기화
podman machine init --cpus 2 --memory 4096
podman machine start

# 네트워크 생성
podman network create codeb-local
```

### CLI 설치
```bash
# 1. 다운로드
git clone https://github.com/yourusername/codeb-server.git
cd codeb-server

# 2. 실행 권한 부여
chmod +x codeb-cli.sh

# 3. PATH에 추가 (선택)
sudo ln -s $(pwd)/codeb-cli.sh /usr/local/bin/codeb

# 4. 초기 설정
codeb init
```

### 설정 파일
첫 실행시 자동 생성되는 설정 파일:

**`~/.codeb/config.yml`**
```yaml
# CodeB CLI Configuration
version: 3.0.0

server:
  ip: 141.164.60.51
  port: 3008
  domain: one-q.xyz

local:
  projects_dir: ~/codeb-projects
  port_range_start: 3000
  port_range_end: 3999

deploy:
  use_act: true
  auto_commit: true
  auto_push: true
```

**`~/.codeb/database.yml`**
```yaml
development:
  seed_data: true
  reset_allowed: true

production:
  seed_data: false
  backup_before_migrate: true
```

---

## 아키텍처

### 시스템 구조
```
┌─────────────────────────────────────┐
│          로컬 개발 환경              │
│  ┌─────────┐  ┌─────────┐          │
│  │ Podman  │  │  Act    │          │
│  │  Pod    │  │ (CI/CD) │          │
│  └────┬────┘  └────┬────┘          │
│       │            │                │
│  ┌────▼────────────▼────┐          │
│  │   CodeB CLI v3.0     │          │
│  └──────────┬───────────┘          │
└─────────────┼───────────────────────┘
              │
              ▼ API/SSH
┌─────────────────────────────────────┐
│         원격 서버 (141.164.60.51)    │
│  ┌─────────┐  ┌─────────┐          │
│  │ Podman  │  │  Caddy  │          │
│  │  Pods   │  │  Proxy  │          │
│  └─────────┘  └─────────┘          │
└─────────────────────────────────────┘
```

### 프로젝트 구조
```
~/codeb-projects/
└── my-app/
    ├── .codeb.json          # 프로젝트 메타데이터
    ├── app/                 # 애플리케이션 코드
    │   ├── package.json
    │   ├── .github/
    │   │   └── workflows/
    │   │       └── build.yml
    │   └── src/
    ├── data/                # 데이터 볼륨
    │   ├── postgres/
    │   └── redis/
    ├── config/              # 설정 파일
    └── migrations/          # DB 마이그레이션
        ├── schema/          # 스키마 변경
        ├── seeds/           # 시드 데이터
        │   ├── local/       # 로컬 전용
        │   └── common/      # 공통 데이터
        └── rollback/        # 롤백 스크립트
```

---

## 명령어 가이드

### 기본 구조
```bash
codeb <mode> <command> [options]
```

### 로컬 개발 (local)

#### 프로젝트 생성
```bash
codeb local create <name> [template]

# 예제
codeb local create my-app nodejs
codeb local create my-api python
codeb local create my-site static

# 생성되는 것:
# - Podman Pod (app + postgres + redis)
# - 로컬 포트 자동 할당 (3000-3999)
# - 프로젝트 디렉토리 구조
```

#### 프로젝트 시작/중지
```bash
# 시작
codeb local start my-app

# 중지
codeb local stop my-app

# 재시작
codeb local stop my-app && codeb local start my-app
```

#### 프로젝트 상태
```bash
# 전체 프로젝트 목록
codeb local status

# 특정 프로젝트 상태
codeb local status my-app
```

#### 데이터베이스 관리
```bash
# DB 초기화 (스키마 + 시드)
codeb local db reset my-app

# 시드 데이터만 적용
codeb local db seed my-app

# 마이그레이션 실행
codeb local db migrate my-app
```

#### 프로젝트 삭제
```bash
codeb local delete my-app
# 확인 프롬프트 후 Pod와 데이터 모두 삭제
```

### 서버 관리 (server)

#### 서버 프로젝트 생성
```bash
codeb server create <name> [template]

# 예제
codeb server create prod-app nodejs

# 결과:
# - 서버 IP: 141.164.60.51
# - 도메인: prod-app.codeb.one-q.xyz
# - 포트: 4000-4999 범위에서 자동 할당
```

#### 서버 배포
```bash
codeb server deploy <name> <git-url> [branch]

# 예제
codeb server deploy prod-app https://github.com/user/repo.git main
codeb server deploy prod-app git@github.com:user/repo.git develop

# 배포 프로세스:
# 1. Git clone/pull
# 2. npm install
# 3. npm run build
# 4. PM2로 프로세스 관리
# 5. Caddy 프록시 설정
```

#### 서버 프로젝트 목록
```bash
codeb server list

# 출력 예시:
# • my-app         Running    my-app.codeb.one-q.xyz
# • test-app       Stopped    test-app.codeb.one-q.xyz
# • prod-api       Running    prod-api.codeb.one-q.xyz
```

### 자동 배포 (deploy)

#### 전체 파이프라인 실행
```bash
codeb deploy <name>

# 실행 순서:
# 1. 로컬 빌드 테스트 (act 또는 npm)
# 2. Git commit & push
# 3. 서버 배포
# 4. 상태 확인

# 예제
codeb deploy my-app
```

#### 배포 옵션
```bash
# 빌드만 테스트
codeb deploy my-app --build-only

# 테스트 건너뛰기
codeb deploy my-app --skip-tests

# 드라이런 (실제 배포 안함)
codeb deploy my-app --dry-run
```

#### 배포 롤백
```bash
# 이전 커밋으로 롤백
codeb deploy rollback my-app

# 특정 버전으로 롤백
codeb deploy rollback my-app v1.2.3
codeb deploy rollback my-app HEAD~3
```

#### 배포 상태 확인
```bash
codeb deploy status my-app

# 출력:
# Git 상태: 최근 5개 커밋
# 서버 상태: Running/Stopped
# 마지막 배포: 2024-01-20 15:30:00
```

### 데이터베이스 (db)

#### 마이그레이션 생성
```bash
codeb db migrate local <name> create <migration-name>

# 예제
codeb db migrate local my-app create add_users_table
codeb db migrate local my-app create add_email_column

# 생성 파일:
# migrations/schema/20240120153000_add_users_table.sql
# migrations/rollback/20240120153000_add_users_table.sql
```

#### 마이그레이션 적용
```bash
# 로컬 환경
codeb db migrate local my-app up
codeb db migrate local my-app down

# 서버 환경 (주의!)
codeb db migrate server my-app up

# 상태 확인
codeb db migrate local my-app status
```

#### 스키마 동기화
```bash
# 로컬 → 서버 (스키마만, 데이터 제외)
codeb db sync my-app local-to-server

# 서버 → 로컬 (개발 환경 업데이트)
codeb db sync my-app server-to-local
```

#### 마이그레이션 파일 구조
```sql
-- migrations/schema/20240120153000_add_users_table.sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```

```sql
-- migrations/rollback/20240120153000_add_users_table.sql
DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS users;
```

---

## 워크플로우 예제

### 1. 새 프로젝트 시작
```bash
# 로컬 프로젝트 생성
codeb local create todo-app nodejs

# 프로젝트 디렉토리로 이동
cd ~/codeb-projects/todo-app/app

# 코드 작성
npm init -y
npm install express prisma @prisma/client

# 로컬 서버 시작
codeb local start todo-app

# 데이터베이스 설정
codeb db migrate local todo-app create initial_schema
# (파일 편집)
codeb db migrate local todo-app up

# 개발...
```

### 2. Git 설정 및 첫 배포
```bash
cd ~/codeb-projects/todo-app/app

# Git 초기화
git init
git remote add origin git@github.com:username/todo-app.git

# 첫 커밋
git add .
git commit -m "Initial commit"
git push -u origin main

# 서버에 프로젝트 생성
codeb server create todo-app nodejs

# 첫 배포
codeb deploy todo-app
```

### 3. 기능 추가 및 재배포
```bash
# 새 기능 개발
# ... 코드 수정 ...

# 데이터베이스 변경 필요시
codeb db migrate local todo-app create add_categories
# (마이그레이션 작성)
codeb db migrate local todo-app up

# 로컬 테스트
codeb local start todo-app
# (테스트)

# 자동 배포 (빌드→테스트→Git→서버)
codeb deploy todo-app
```

### 4. 프로덕션 데이터베이스 마이그레이션
```bash
# 안전한 마이그레이션 프로세스

# 1. 백업 생성 (서버에서)
codeb server db backup todo-app

# 2. 마이그레이션 드라이런
codeb db migrate server todo-app up --dry-run

# 3. 실제 적용
codeb db migrate server todo-app up

# 4. 확인
codeb db migrate server todo-app status
```

### 5. 긴급 롤백
```bash
# 문제 발생시 빠른 롤백

# Git 기반 롤백
codeb deploy rollback todo-app

# 또는 수동 롤백
cd ~/codeb-projects/todo-app/app
git revert HEAD
codeb deploy todo-app
```

---

## 트러블슈팅

### 일반적인 문제

#### Podman 관련
```bash
# Podman machine 상태 확인 (macOS)
podman machine list

# Machine 시작
podman machine start

# Pod 상태 확인
podman pod ps -a

# 문제 있는 Pod 강제 삭제
podman pod rm -f local-my-app
```

#### 포트 충돌
```bash
# 사용 중인 포트 확인
lsof -i:3000

# 포트 프로세스 종료
kill -9 <PID>

# 또는 다른 포트로 재생성
codeb local delete my-app
codeb local create my-app  # 자동으로 다른 포트 할당
```

#### Git 배포 실패
```bash
# SSH 키 확인
ssh -T git@github.com

# Remote URL 확인
git remote -v

# 브랜치 확인
git branch -a

# 수동 배포
codeb server deploy my-app https://github.com/user/repo.git main
```

#### 데이터베이스 연결 실패
```bash
# 로컬 PostgreSQL 접속 테스트
podman exec -it local-my-app-postgres psql -U user -d my-app

# 연결 문자열 확인
echo $DATABASE_URL

# Pod 네트워크 확인
podman network inspect codeb-local
```

### 로그 확인

#### 로컬 로그
```bash
# Pod 로그
podman pod logs local-my-app

# 특정 컨테이너 로그
podman logs local-my-app-app
podman logs local-my-app-postgres
podman logs local-my-app-redis
```

#### 서버 로그
```bash
# API 서버 로그
codeb server logs my-app

# PM2 로그
codeb server logs my-app pm2

# 빌드 로그
codeb server logs my-app build
```

### 환경 변수

#### 로컬 환경변수 설정
```bash
# 프로젝트별 .env 파일
cat > ~/codeb-projects/my-app/app/.env << EOF
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/my-app
REDIS_URL=redis://localhost:6379
PORT=3000
EOF
```

#### 디버그 모드
```bash
# 디버그 출력 활성화
DEBUG=true codeb deploy my-app

# Verbose 모드
codeb -v deploy my-app
```

---

## 부록

### 지원 템플릿
- `nodejs` - Node.js (Express, Next.js 등)
- `python` - Python (Flask, Django 등)
- `php` - PHP (Laravel, WordPress 등)
- `go` - Go
- `static` - 정적 사이트 (HTML/CSS/JS)

### 포트 할당
- **로컬**: 3000-3999 (앱), 4000-4999 (DB), 5000-5999 (Redis)
- **서버**: 4000-4999 (앱), 5000-5999 (DB), 6000-6999 (Redis)

### 파일 위치
- **설정**: `~/.codeb/`
- **로컬 프로젝트**: `~/codeb-projects/`
- **서버 프로젝트**: `/mnt/blockstorage/projects/`

### 유용한 별칭 (Alias)
```bash
# ~/.bashrc 또는 ~/.zshrc에 추가
alias cb='codeb'
alias cbl='codeb local'
alias cbs='codeb server'
alias cbd='codeb deploy'
alias cbdb='codeb db'

# 사용 예
cbl create my-app
cbd my-app
```

---

## 지원 및 기여

### 버그 리포트
Issues: https://github.com/yourusername/codeb-server/issues

### 기여 가이드
Pull Requests 환영합니다!

### 라이선스
MIT License

---

*CodeB CLI v3.0 - Built with ❤️ for developers*