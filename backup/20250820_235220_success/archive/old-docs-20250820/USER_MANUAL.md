# 📚 CodeB 사용자 메뉴얼

## 🎯 빠른 시작

### 1. 서버 설치 완료 확인
서버 **141.164.60.51**에 CodeB가 설치되었습니다.

**관리자 API 키**: `cb_9H2h-toJyAsJBVfBCattelw46jdufVyQ8ttR7YRr6Kw`  
**키 위치**: `/root/codeb-admin-key.txt`

### 2. 주요 디렉토리
```
/opt/codeb/                     # 설치 디렉토리
├── codeb-remix/               # 웹 서버
├── codeb-cli/                 # CLI 도구
└── ecosystem.config.js        # PM2 설정

/var/lib/codeb/                # 데이터 디렉토리
├── database.json              # 메인 데이터베이스
└── repositories/              # Git 저장소

/var/log/codeb/                # 로그 디렉토리
```

---

## 🛠️ 기본 사용법

### CLI 설치 및 설정
```bash
# 1. CLI 전역 설치
cd /opt/codeb/codeb-cli
npm install -g .

# 2. 설정 초기화
codeb config init
# API URL: http://141.164.60.51:3000
# API Key: cb_9H2h-toJyAsJBVfBCattelw46jdufVyQ8ttR7YRr6Kw

# 3. 연결 테스트
codeb config test
```

### 프로젝트 관리
```bash
# 프로젝트 생성
codeb project create myapp

# 프로젝트 목록 조회
codeb project list

# 프로젝트 시작
codeb project start myapp

# 프로젝트 중지
codeb project stop myapp

# 프로젝트 삭제
codeb project delete myapp
```

### 환경 변수 관리
```bash
# 환경 변수 설정
codeb env set myapp DATABASE_URL "postgresql://..."

# 환경 변수 조회
codeb env list myapp

# 환경 변수 삭제
codeb env delete myapp DATABASE_URL
```

---

## 🔧 서버 관리

### PM2로 서버 관리
```bash
# 서버 상태 확인
pm2 status

# 서버 시작
pm2 start /opt/codeb/ecosystem.config.js

# 서버 재시작
pm2 restart codeb-server

# 서버 로그 보기
pm2 logs codeb-server

# 서버 중지
pm2 stop codeb-server
```

### 수동 서버 시작 (디버그용)
```bash
cd /opt/codeb/codeb-remix
NODE_ENV=production PORT=3000 node build/server/index.js
```

---

## 🔑 API 키 관리

### 새 API 키 생성
```bash
curl -X POST http://141.164.60.51:3000/api/auth/keys \
  -H "X-API-Key: cb_9H2h-toJyAsJBVfBCattelw46jdufVyQ8ttR7YRr6Kw" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "새 사용자 키",
    "permissions": "write",
    "expiresInDays": 30
  }'
```

### API 키 목록 조회
```bash
curl -X GET http://141.164.60.51:3000/api/auth/keys \
  -H "X-API-Key: cb_9H2h-toJyAsJBVfBCattelw46jdufVyQ8ttR7YRr6Kw"
```

---

## 📁 폴더 구조 정리

### 🚨 중요한 파일들 (건드리지 마세요!)
```
/opt/codeb/codeb-remix/.env           # 환경 설정
/var/lib/codeb/database.json          # 메인 데이터베이스
/opt/codeb/ecosystem.config.js        # PM2 설정
```

### 📁 정리된 폴더 구조 (2025-08-19 업데이트)
```
codeb-server/                         # 메인 폴더 (깔끔하게 정리됨!)
├── 📘 USER_MANUAL.md                 # 👈 이 파일 (사용자 메뉴얼)
├── 📗 QUICK_START_GUIDE.md           # 빠른 시작 가이드
├── 📕 TROUBLESHOOTING.md             # 문제 해결 가이드
├── 📙 API_REFERENCE.md               # API 참조서
├── 🔧 codeb-remix/                   # 웹 서버
│   ├── app/routes/                   # API 엔드포인트
│   ├── app/services/                 # 비즈니스 로직
│   └── build/                        # 빌드된 파일
├── 💻 codeb-cli/                     # CLI 도구
│   ├── src/commands/                 # CLI 명령어
│   └── src/lib/                      # 라이브러리
├── 🐳 docker-compose.yml             # 로컬 개발용
├── 🛠️ Makefile                      # 편의 명령어들
├── 📦 install.sh                     # 서버 설치 스크립트
└── 🗃️ archive/                      # 백업된 파일들
    └── 2025-08-19-cleanup/           # 이전에 복잡했던 파일들
        ├── folders/                  # docs/, scripts/, infrastructure/ 등
        └── docs/                     # 상세 문서들
```

### ✨ 정리 결과
- **복잡한 폴더들 정리**: `docs/`, `scripts/`, `infrastructure/`, `server-api/`, `cli-package/`, `templates/` 등이 `archive/`로 이동
- **핵심 파일들만 남김**: 일상적으로 사용하는 파일들만 루트에 유지
- **백업 보관**: 필요시 `archive/` 폴더에서 복원 가능

---

## 🚀 일반적인 워크플로우

### 1. 새 프로젝트 배포
```bash
# 1. 프로젝트 생성
codeb project create myapp

# 2. 환경 변수 설정
codeb env set myapp DATABASE_URL "postgresql://..."
codeb env set myapp API_KEY "your-api-key"

# 3. 프로젝트 시작
codeb project start myapp

# 4. 상태 확인
codeb project status myapp
```

### 2. 문제 해결
```bash
# 1. 로그 확인
pm2 logs codeb-server

# 2. 서버 상태 확인
pm2 status

# 3. 서버 재시작
pm2 restart codeb-server
```

### 3. 백업 및 복구
```bash
# 데이터베이스 백업
cp /var/lib/codeb/database.json /var/lib/codeb/database.backup.$(date +%Y%m%d_%H%M%S).json

# 백업에서 복구
cp /var/lib/codeb/database.backup.TIMESTAMP.json /var/lib/codeb/database.json
pm2 restart codeb-server
```

---

## ❗ 자주 발생하는 문제

### Q: 서버가 시작되지 않아요
```bash
# 1. 로그 확인
pm2 logs codeb-server --lines 50

# 2. 수동으로 시작해서 오류 확인
cd /opt/codeb/codeb-remix
node build/server/index.js

# 3. 포트 3000이 사용 중인지 확인
lsof -i :3000
```

### Q: API 키가 작동하지 않아요
```bash
# 1. 데이터베이스 확인
cat /var/lib/codeb/database.json | jq '.apiKeys'

# 2. 새 API 키 생성
cd /opt/codeb/codeb-remix
node generate-key.cjs
```

### Q: CLI가 서버에 연결되지 않아요
```bash
# 1. 설정 확인
codeb config show

# 2. 연결 테스트
curl -H "X-API-Key: YOUR_KEY" http://141.164.60.51:3000/api/projects
```

---

## 📞 지원

- **로그 파일**: `/var/log/codeb/`
- **설정 파일**: `/opt/codeb/codeb-remix/.env`
- **데이터베이스**: `/var/lib/codeb/database.json`
- **관리자 키**: `/root/codeb-admin-key.txt`

---

*최종 업데이트: 2025-08-19*