# CodeB CLI 가이드

> 로컬에서 CodeB 서버를 관리하는 CLI 도구

## 📦 설치

### macOS/Linux
```bash
# 다운로드 및 설치
curl -O http://141.164.60.51:3008/install.sh
chmod +x install.sh
./install.sh

# 또는 직접 설치
npm install -g codeb-cli
```

### Windows
```powershell
npm install -g codeb-cli
```

## 🔧 초기 설정

```bash
# 서버 연결 설정
codeb config init

# 프롬프트:
# Server URL: http://141.164.60.51:3008
# API Key: (선택사항)
```

## 📚 주요 명령어

### 프로젝트 관리

#### 프로젝트 목록
```bash
codeb list
# 또는
codeb ls
```

#### 프로젝트 생성
```bash
# 대화형 모드
codeb create

# 직접 지정
codeb create my-app --template nextjs --git https://github.com/user/repo.git

# 옵션
--template [nextjs|nodejs|python|static]
--git [repository-url]
--postgres  # PostgreSQL 활성화
--redis     # Redis 활성화
```

#### 프로젝트 시작/중지
```bash
codeb start my-app
codeb stop my-app
codeb restart my-app
```

#### 프로젝트 삭제
```bash
codeb delete my-app
```

### 배포

#### Git 저장소에서 배포
```bash
codeb deploy my-app --git https://github.com/user/repo.git
```

#### 로컬 폴더 배포
```bash
# 현재 폴더
codeb deploy my-app .

# 특정 폴더
codeb deploy my-app ./my-project
```

### 로그 및 모니터링

#### 로그 보기
```bash
# 애플리케이션 로그
codeb logs my-app

# 특정 컨테이너 로그
codeb logs my-app --container postgres
codeb logs my-app --container redis

# 실시간 로그
codeb logs my-app --follow
```

#### 상태 확인
```bash
codeb status my-app
```

### 환경변수 관리

#### 환경변수 보기
```bash
codeb env my-app
```

#### 환경변수 설정
```bash
# 단일 설정
codeb env my-app set KEY=value

# 여러 개 설정
codeb env my-app set KEY1=value1 KEY2=value2

# 파일에서 로드
codeb env my-app load .env
```

#### 환경변수 삭제
```bash
codeb env my-app unset KEY
```

### 데이터베이스 관리

#### Prisma 명령 실행
```bash
# 마이그레이션
codeb db my-app migrate

# 스키마 푸시
codeb db my-app push

# Prisma Studio
codeb db my-app studio
```

#### 데이터베이스 백업
```bash
codeb db my-app backup
codeb db my-app restore backup-file.sql
```

### 도메인 및 SSL

#### 도메인 정보
```bash
codeb domain my-app
```

#### SSL 인증서 상태
```bash
codeb ssl my-app
```

## 🎯 실전 예제

### 1. Next.js 프로젝트 배포
```bash
# 프로젝트 생성
codeb create blog --template nextjs

# 환경변수 설정
codeb env blog set NEXT_PUBLIC_API_URL=https://api.example.com

# Git 저장소 연결 및 배포
codeb deploy blog --git https://github.com/myuser/blog.git

# 로그 확인
codeb logs blog --follow

# 접속
open https://blog.codeb.one-q.xyz
```

### 2. Prisma 프로젝트 설정
```bash
# 프로젝트 생성 (PostgreSQL 포함)
codeb create api --template nodejs --postgres

# 스키마 푸시
codeb db api push

# 시드 데이터 실행
codeb exec api "npm run seed"

# Prisma Studio 실행
codeb db api studio
```

### 3. 로컬 개발 통합
```bash
# 로컬 프로젝트 폴더에서
cd ~/my-project

# 프로젝트 생성 및 배포
codeb create my-project --template nextjs
codeb deploy my-project .

# 파일 변경 감지 및 자동 배포
codeb watch my-project
```

## 🔌 고급 기능

### 컨테이너 명령 실행
```bash
codeb exec my-app "npm install express"
codeb exec my-app "npm run build"
```

### 포트 포워딩
```bash
# 로컬 3000번 포트를 서버의 애플리케이션으로 연결
codeb tunnel my-app 3000
```

### 백업 및 복원
```bash
# 전체 백업
codeb backup my-app

# 복원
codeb restore my-app backup-20250820.tar.gz
```

## 📝 설정 파일

### codeb.json
프로젝트 루트에 `codeb.json` 파일 생성:

```json
{
  "name": "my-app",
  "template": "nextjs",
  "env": {
    "NODE_ENV": "production",
    "API_KEY": "secret"
  },
  "build": "npm run build",
  "start": "npm start",
  "postgres": true,
  "redis": true
}
```

배포 시 자동으로 설정 적용:
```bash
codeb deploy
```

## 🆘 문제 해결

### 연결 오류
```bash
# 서버 연결 테스트
codeb ping

# 설정 재구성
codeb config reset
codeb config init
```

### 로그 디버깅
```bash
# 상세 로그
codeb logs my-app --verbose --lines 500

# 에러만 보기
codeb logs my-app --error
```

### 캐시 정리
```bash
codeb cache clear my-app
```