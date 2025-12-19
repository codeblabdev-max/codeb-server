# CodeB CLI 도구 문서
> 버전: 2.0 - 3.0 | 최종 업데이트: 2025-08-25

## 📌 개요

CodeB CLI는 서버 프로젝트를 관리하는 명령줄 도구입니다. 100% API 기반으로 작동하며, SSH 의존성이 없습니다.

## 🚀 빠른 시작

### 설치
```bash
# 직접 실행 (권장)
./codeb-cli-v2.sh

# 또는 PATH에 추가
sudo ln -s $(pwd)/codeb-cli-v2.sh /usr/local/bin/codeb
```

### 기본 명령어
```bash
# 프로젝트 목록 확인
codeb list

# 새 프로젝트 생성
codeb create my-app

# 프로젝트 배포
codeb deploy my-app

# 프로젝트 상태 확인
codeb status my-app
```

## 📁 CLI 버전 구조

### 1. codeb-cli-v2.sh (권장)
- **버전**: 2.0.0
- **특징**: 단일 파일, 100% API 기반
- **서버**: 141.164.60.51:3008
- **도메인**: one-q.xyz

### 2. codeb-cli.sh (v3.0)
- **버전**: 3.0.0
- **특징**: 로컬 개발 + 서버 관리 통합
- **설정**: ~/.codeb/config.yml

### 3. codeb-cli/ 디렉토리 (모듈화)
```
codeb-cli/
├── commands/
│   ├── control.sh    # start/stop/restart
│   ├── database.sh   # DB 관리
│   ├── deploy.sh     # 배포 관리
│   ├── diagnose.sh   # 진단 도구
│   ├── logs.sh       # 로그 조회
│   └── project.sh    # 프로젝트 CRUD
└── lib/
    ├── api.sh        # API 통신
    ├── colors.sh     # 색상 정의
    ├── config.sh     # 설정 관리
    └── utils.sh      # 유틸리티
```

## 🔧 주요 명령어

### 프로젝트 관리

#### list - 프로젝트 목록
```bash
codeb list

# 출력 예시:
┌────────────────┬─────────┬────────┬─────────────────────────┐
│ 프로젝트명      │ 포트    │ 상태   │ 도메인                   │
├────────────────┼─────────┼────────┼─────────────────────────┤
│ test-nextjs     │ 4001    │ 🟢     │ test-nextjs.one-q.xyz   │
│ video-platform  │ 4002    │ 🟢     │ video.one-q.xyz         │
└────────────────┴─────────┴────────┴─────────────────────────┘
```

#### create - 프로젝트 생성
```bash
# 기본 생성
codeb create <project-name>

# 옵션 지정
codeb create my-app --type nextjs --port 4005

# 지원 타입
- nextjs (Next.js 앱)
- node (Node.js 앱)
- static (정적 사이트)
- python (Python 앱)
- custom (사용자 정의)
```

#### deploy - 프로젝트 배포
```bash
# Git 저장소에서 배포
codeb deploy <project-name> --git https://github.com/user/repo

# 로컬 파일 배포
codeb deploy <project-name> --local ./my-app

# 브랜치 지정
codeb deploy <project-name> --git <url> --branch develop
```

#### status - 상태 확인
```bash
codeb status <project-name>

# 출력 예시:
프로젝트: my-app
상태: 🟢 Running
포트: 4003
도메인: my-app.one-q.xyz
메모리: 125MB
CPU: 0.2%
실행시간: 2일 5시간
```

### 컨테이너 제어

#### start/stop/restart
```bash
# 시작
codeb start <project-name>

# 중지
codeb stop <project-name>

# 재시작
codeb restart <project-name>

# 전체 재시작
codeb restart --all
```

#### logs - 로그 조회
```bash
# 실시간 로그
codeb logs <project-name>

# 최근 100줄
codeb logs <project-name> --lines 100

# 특정 컨테이너 로그
codeb logs <project-name> --container app
```

### 데이터베이스 관리

#### db:create - 데이터베이스 생성
```bash
# PostgreSQL 생성
codeb db:create <project-name> --type postgres

# Redis 추가
codeb db:create <project-name> --type redis

# MongoDB 추가
codeb db:create <project-name> --type mongo
```

#### db:backup - 백업
```bash
# 백업 생성
codeb db:backup <project-name>

# 백업 목록
codeb db:backup --list

# 백업 복원
codeb db:restore <project-name> --file backup-20250825.sql
```

#### db:migrate - 마이그레이션
```bash
# 마이그레이션 실행
codeb db:migrate <project-name>

# 롤백
codeb db:rollback <project-name>

# 상태 확인
codeb db:status <project-name>
```

### 환경 변수 관리

#### env:set - 환경 변수 설정
```bash
# 단일 설정
codeb env:set <project-name> KEY=value

# 다중 설정
codeb env:set <project-name> KEY1=value1 KEY2=value2

# 파일에서 로드
codeb env:set <project-name> --file .env
```

#### env:get - 환경 변수 조회
```bash
# 전체 조회
codeb env:get <project-name>

# 특정 키 조회
codeb env:get <project-name> DATABASE_URL
```

### 진단 도구

#### diagnose - 프로젝트 진단
```bash
# 전체 진단
codeb diagnose <project-name>

# 네트워크 진단
codeb diagnose <project-name> --network

# 디스크 진단
codeb diagnose <project-name> --disk

# 메모리 진단
codeb diagnose <project-name> --memory
```

#### health - 헬스체크
```bash
# API 서버 상태
codeb health

# 프로젝트 헬스체크
codeb health <project-name>
```

## ⚙️ 설정 파일

### ~/.codeb/config.yml
```yaml
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
  auto_commit: true
  auto_push: true
  backup_before_deploy: true

database:
  migrations_dir: migrations
  backup_dir: backups
```

### ~/.codeb/database.yml
```yaml
development:
  seed_data: true
  auto_migrate: true
  
production:
  seed_data: false
  backup_before_migrate: true
  require_confirmation: true
```

## 🔌 API 엔드포인트

CLI가 사용하는 주요 API:

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | /api/health | 서버 상태 |
| GET | /api/projects | 프로젝트 목록 |
| POST | /api/projects | 프로젝트 생성 |
| GET | /api/projects/:name | 프로젝트 상세 |
| DELETE | /api/projects/:name | 프로젝트 삭제 |
| POST | /api/projects/:name/deploy | 배포 |
| POST | /api/projects/:name/start | 시작 |
| POST | /api/projects/:name/stop | 중지 |
| GET | /api/projects/:name/logs | 로그 |
| POST | /api/projects/:name/env | 환경변수 |

## 🎨 출력 형식

### 색상 코드
- 🟢 녹색: 정상/성공
- 🟡 노란색: 경고/대기
- 🔴 빨간색: 오류/실패
- 🔵 파란색: 정보
- 🟣 보라색: 디버그

### 상태 아이콘
- ✅ 완료
- ❌ 실패
- ⚠️ 경고
- ℹ️ 정보
- 🔄 진행중
- ⏳ 대기중

## 🐛 문제 해결

### API 서버 연결 실패
```bash
# 서버 상태 확인
curl http://141.164.60.51:3008/api/health

# 네트워크 확인
ping 141.164.60.51

# 포트 확인
telnet 141.164.60.51 3008
```

### 프로젝트 생성 실패
```bash
# 포트 사용 확인
codeb list

# 사용 가능한 포트 확인 (4000-4999)
# 이미 사용중: 4001, 4002, 4003
```

### 배포 실패
```bash
# 로그 확인
codeb logs <project-name>

# 빌드 로그 확인
codeb logs <project-name> --build

# 디스크 공간 확인
codeb diagnose --disk
```

## 📚 고급 기능

### 배치 작업
```bash
# 모든 프로젝트 재시작
for project in $(codeb list --json | jq -r '.projects[].name'); do
  codeb restart $project
done

# 모든 프로젝트 백업
codeb backup --all
```

### 스크립팅
```bash
#!/bin/bash
# deploy-all.sh

projects=("app1" "app2" "app3")

for project in "${projects[@]}"; do
  echo "Deploying $project..."
  codeb deploy $project --git https://github.com/org/$project
  
  if [ $? -eq 0 ]; then
    echo "✅ $project deployed successfully"
  else
    echo "❌ $project deployment failed"
  fi
done
```

### JSON 출력
```bash
# JSON 형식으로 출력
codeb list --json

# jq로 파싱
codeb list --json | jq '.projects[] | select(.status=="Running")'

# 특정 필드만 추출
codeb status my-app --json | jq '.memory'
```

## 🔒 보안 주의사항

1. **API 키 관리**
   - API 키는 환경변수로 관리
   - 절대 코드에 하드코딩 금지

2. **네트워크 보안**
   - HTTPS 사용 권장 (현재 HTTP)
   - 방화벽 규칙 확인

3. **데이터 보호**
   - 정기적 백업
   - 민감 정보 암호화

## 📝 릴리즈 노트

### v2.0.0 (2025-08-20)
- 100% API 기반 구현
- SSH 의존성 완전 제거
- JSON 응답 처리 개선

### v3.0.0 (2025-08-21)
- 로컬 개발 모드 추가
- 통합 관리 시스템
- 설정 파일 지원

## 🆘 지원

문제 발생 시:
1. `codeb diagnose` 실행
2. 로그 확인: `codeb logs <project-name>`
3. API 상태: `codeb health`

---

*이 문서는 CodeB CLI v2.0-3.0을 기준으로 작성되었습니다.*
*서버: 141.164.60.51:3008 | 도메인: one-q.xyz*