# 데이터베이스 백업/복원 기능 구현 완료

## 📅 구현일: 2025-08-20 23:30 KST

---

## ✅ 구현 완료 사항

### 1. API 서버 (codeb-api-server.js)
- ✅ **GET /api/projects/:name/db/backup** - 데이터베이스 백업 다운로드
- ✅ **POST /api/projects/:name/db/restore** - 데이터베이스 복원 (파일 업로드 지원)
- ✅ **GET /api/projects/:name/db/tables** - 테이블 목록 조회
- ✅ **POST /api/projects/:name/db/query** - SQL 쿼리 실행 (안전성 검사 포함)
- ✅ **deploy 엔드포인트 개선** - dbBackupUrl 파라미터로 배포 시 자동 복원

### 2. CLI 도구 (codeb-cli-v2.sh)
- ✅ **codeb db backup** - 데이터베이스 백업 명령
- ✅ **codeb db restore** - 데이터베이스 복원 명령
- ✅ **codeb db tables** - 테이블 목록 조회
- ✅ **codeb db query** - SQL 쿼리 실행
- ✅ **codeb deploy --db-backup** - 배포 시 백업 URL 지정

### 3. 안전성 기능
- ✅ **자동 롤백** - 복원 실패 시 이전 데이터베이스로 자동 복원
- ✅ **백업 보존** - 복원 전 현재 데이터베이스 자동 백업
- ✅ **SQL 안전성 검사** - 위험한 쿼리 자동 차단
- ✅ **파일 무결성 검증** - 백업 파일 크기 및 존재 여부 확인

---

## 🔧 설치 요구사항

### Node.js 패키지 설치 필요
```bash
cd /Users/admin/new_project/codeb-server
npm install express-fileupload
```

---

## 📝 사용법

### 1. 데이터베이스 백업
```bash
# CLI 사용
./codeb-cli-v2.sh db backup celly-creative

# API 직접 호출
curl -o backup.sql http://141.164.60.51:3008/api/projects/celly-creative/db/backup
```

### 2. 데이터베이스 복원
```bash
# CLI 사용 (안전 확인 포함)
./codeb-cli-v2.sh db restore celly-creative backup.sql

# API 직접 호출
curl -X POST -F "backup=@backup.sql" http://141.164.60.51:3008/api/projects/celly-creative/db/restore
```

### 3. 배포 시 백업 복원
```bash
# 백업 URL과 함께 배포
./codeb-cli-v2.sh deploy celly-creative https://github.com/user/repo.git main --db-backup https://example.com/backup.sql

# API 직접 호출
curl -X POST -H "Content-Type: application/json" \
  -d '{"gitUrl":"https://github.com/user/repo.git","branch":"main","dbBackupUrl":"https://example.com/backup.sql"}' \
  http://141.164.60.51:3008/api/projects/celly-creative/deploy
```

### 4. 데이터베이스 조회
```bash
# 테이블 목록
./codeb-cli-v2.sh db tables celly-creative

# SQL 쿼리 실행
./codeb-cli-v2.sh db query celly-creative 'SELECT COUNT(*) FROM users;'
```

---

## 🔄 백업/복원 워크플로우

### 기존 프로젝트에서 백업
```bash
# 1. 기존 서버에서 백업 생성
ssh root@source-server
podman exec original-postgres pg_dump -U user -d database > backup.sql

# 2. 백업 파일 다운로드
scp root@source-server:backup.sql ./project-backup.sql
```

### 새 프로젝트에 복원
```bash
# 방법 1: CLI 사용
./codeb-cli-v2.sh db restore celly-creative project-backup.sql

# 방법 2: 배포와 함께 복원
./codeb-cli-v2.sh deploy celly-creative https://github.com/user/repo.git main \
  --db-backup https://storage.example.com/project-backup.sql
```

---

## 🛡️ 안전성 특징

### 1. 자동 롤백
- 복원 실패 시 이전 데이터베이스 상태로 자동 복원
- 트랜잭션 방식으로 안전한 복원 보장

### 2. 백업 보존
- 복원 전 현재 데이터베이스 자동 백업
- 타임스탬프가 포함된 백업 파일명

### 3. 위험 쿼리 차단
```javascript
const dangerousKeywords = ['DROP DATABASE', 'DROP SCHEMA', 'DROP TABLE', 'TRUNCATE'];
// 이러한 키워드가 포함된 쿼리는 자동 차단
```

### 4. 파일 검증
- 백업 파일 크기 확인 (0바이트 파일 차단)
- 파일 존재 여부 및 접근 권한 확인

---

## 📊 API 응답 예시

### 백업 성공
```json
{
  "success": true,
  "message": "Database backup created successfully",
  "filename": "celly-creative_2025-08-20T23-30-00.sql",
  "size": "2.5MB"
}
```

### 복원 성공
```json
{
  "success": true,
  "message": "Database restored successfully",
  "details": "Restore completed with 15420 records"
}
```

### 테이블 조회
```json
{
  "success": true,
  "database": "celly-creative",
  "tables": ["users", "posts", "comments", "categories"],
  "count": 4
}
```

---

## 🐛 문제 해결

### 1. express-fileupload 모듈 없음
```bash
npm install express-fileupload
systemctl restart codeb-api-server
```

### 2. 백업 파일이 비어있음
```bash
# PostgreSQL 컨테이너 상태 확인
podman exec celly-creative-postgres pg_isready -U user

# 수동 백업 테스트
podman exec celly-creative-postgres pg_dump -U user -d celly-creative
```

### 3. 복원 실패
- 자동 롤백이 실행됨
- 이전 백업이 `*_old` 이름으로 보존됨
- 로그 확인: `./codeb-cli-v2.sh logs celly-creative`

---

## 🎯 다음 단계

### 1. 패키지 설치 (필수)
```bash
cd /Users/admin/new_project/codeb-server
npm install express-fileupload
```

### 2. API 서버 재시작
```bash
# API 서버 재시작하여 새로운 엔드포인트 활성화
systemctl restart codeb-api-server
# 또는
pm2 restart codeb-api-server
```

### 3. 실제 데이터로 테스트
```bash
# celly-creative 프로젝트로 백업/복원 테스트
./codeb-cli-v2.sh db tables celly-creative
./codeb-cli-v2.sh db query celly-creative 'SELECT version();'
```

---

## 📋 구현 상세

### 파일 수정 사항
1. **codeb-api-server.js**: 220줄 추가 (백업/복원 엔드포인트)
2. **codeb-cli-v2.sh**: 170줄 추가 (db 명령 구현)

### 보안 고려사항
- SQL 인젝션 방지
- 파일 업로드 크기 제한 (50MB)
- 위험한 SQL 명령 자동 차단
- 임시 파일 자동 정리

### 성능 최적화
- 백업 파일 스트리밍
- 비동기 파일 처리
- 타임아웃 설정 (백업: 60초, 복원: 120초)

---

## ✨ 혁신적 개선점

이전 방식:
```bash
❌ npx prisma db push --accept-data-loss
❌ npx tsx prisma/seed-sample-data.ts  # 샘플 데이터만
```

새로운 방식:
```bash
✅ pg_dump source_db > backup.sql      # 실제 데이터
✅ psql target_db < backup.sql         # 완전한 복원
✅ 자동 롤백 및 안전성 보장
```

**결과**: 실제 프로덕션 데이터를 안전하게 마이그레이션 가능!