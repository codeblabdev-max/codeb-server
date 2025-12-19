# 실제 백업 파일을 사용한 테스트 가이드

## 📦 발견된 백업 파일들

### 파일 정보 (2025-08-20 23:13 생성)
```
full_backup_20250820_231316.sql     2.8MB  - 완전한 백업 (스키마 + 데이터)
data_20250820_231316.sql            2.6MB  - 데이터만 백업  
schema_20250820_231316.sql          220KB  - 스키마만 백업
```

### 압축 버전도 사용 가능
```
full_backup_20250820_231316.sql.gz  1.8MB  - 압축된 완전한 백업
data_20250820_231316.sql.gz         1.7MB  - 압축된 데이터 백업
schema_20250820_231316.sql.gz       31KB   - 압축된 스키마 백업
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 기존 백업으로 celly-creative 프로젝트 복구

```bash
# 1. 현재 상태 확인
./codeb-cli-v2.sh status celly-creative
./codeb-cli-v2.sh db tables celly-creative

# 2. 실제 데이터 백업으로 복원
./codeb-cli-v2.sh db restore celly-creative "/Users/admin/new_project/codeb-server/backups 복사본/full_backup_20250820_231316.sql"

# 3. 복원 결과 확인
./codeb-cli-v2.sh db tables celly-creative
./codeb-cli-v2.sh db query celly-creative 'SELECT COUNT(*) FROM users;'
```

### 시나리오 2: 새로운 백업 생성 및 비교

```bash
# 1. 현재 상태 백업
./codeb-cli-v2.sh db backup celly-creative

# 2. 백업 파일들 비교
ls -la celly-creative_*.sql
ls -la "/Users/admin/new_project/codeb-server/backups 복사본/"
```

### 시나리오 3: 배포 시 백업 자동 복원

```bash
# HTTP 서버로 백업 파일 제공 (간단한 방법)
cd "/Users/admin/new_project/codeb-server/backups 복사본"
python3 -m http.server 8000 &

# 백업 URL로 배포
./codeb-cli-v2.sh deploy celly-creative https://github.com/dungeun/celly-creative.git main \
  --db-backup http://localhost:8000/full_backup_20250820_231316.sql

# 서버 종료
pkill -f "python3 -m http.server"
```

---

## 🔍 백업 파일 내용 검사

### SQL 파일 헤더 확인
```bash
head -20 "/Users/admin/new_project/codeb-server/backups 복사본/full_backup_20250820_231316.sql"
```

### 테이블 구조 확인
```bash
grep "CREATE TABLE" "/Users/admin/new_project/codeb-server/backups 복사본/full_backup_20250820_231316.sql"
```

### 데이터 레코드 수 추정
```bash
grep -c "INSERT INTO" "/Users/admin/new_project/codeb-server/backups 복사본/data_20250820_231316.sql"
```

---

## 🚨 안전한 테스트 절차

### 1. 테스트 전 현재 상태 백업
```bash
# 현재 데이터베이스 백업 (안전장치)
./codeb-cli-v2.sh db backup celly-creative
```

### 2. 복원 테스트 (자동 롤백 기능 내장)
```bash
# 복원 실행 (실패 시 자동 롤백)
./codeb-cli-v2.sh db restore celly-creative "/Users/admin/new_project/codeb-server/backups 복사본/full_backup_20250820_231316.sql"
```

### 3. 복원 결과 검증
```bash
# 테이블 목록 확인
./codeb-cli-v2.sh db tables celly-creative

# 주요 테이블 레코드 수 확인
./codeb-cli-v2.sh db query celly-creative 'SELECT 
  (SELECT COUNT(*) FROM users) as users,
  (SELECT COUNT(*) FROM posts) as posts,
  (SELECT COUNT(*) FROM comments) as comments;'
```

---

## 📊 API 직접 테스트

### 1. 백업 다운로드 테스트
```bash
curl -o test_backup.sql http://141.164.60.51:3008/api/projects/celly-creative/db/backup
ls -la test_backup.sql
```

### 2. 복원 테스트 (API 직접 호출)
```bash
curl -X POST -F "backup=@/Users/admin/new_project/codeb-server/backups 복사본/full_backup_20250820_231316.sql" \
  http://141.164.60.51:3008/api/projects/celly-creative/db/restore
```

### 3. 테이블 조회 테스트
```bash
curl -s http://141.164.60.51:3008/api/projects/celly-creative/db/tables | jq .
```

---

## 🎯 예상 결과

### 성공적인 복원 후
```bash
./codeb-cli-v2.sh db tables celly-creative
# 출력 예시:
# 데이터베이스: celly-creative  
# 테이블 수: 8
# 테이블 목록:
# 1. users
# 2. posts  
# 3. comments
# 4. categories
# 5. tags
# 6. user_profiles
# 7. sessions
# 8. migrations
```

### 애플리케이션 접근 테스트
```bash
# 웹 접근 확인
curl -I https://celly-creative.codeb.one-q.xyz

# 로그인 페이지 접근 (실제 사용자 데이터로)
curl -s https://celly-creative.codeb.one-q.xyz/login
```

---

## 💡 추천 테스트 순서

1. **📋 현재 상태 확인**
   ```bash
   ./codeb-cli-v2.sh status celly-creative
   ./codeb-cli-v2.sh db tables celly-creative
   ```

2. **🔒 안전 백업 생성**  
   ```bash
   ./codeb-cli-v2.sh db backup celly-creative
   ```

3. **⚡ 실제 데이터 복원**
   ```bash
   ./codeb-cli-v2.sh db restore celly-creative "/Users/admin/new_project/codeb-server/backups 복사본/full_backup_20250820_231316.sql"
   ```

4. **✅ 결과 검증**
   ```bash
   ./codeb-cli-v2.sh db tables celly-creative
   curl -I https://celly-creative.codeb.one-q.xyz
   ```

5. **🚀 애플리케이션 테스트**
   - 브라우저에서 https://celly-creative.codeb.one-q.xyz 접근
   - 실제 사용자 계정으로 로그인 시도
   - 데이터 조회/수정 테스트

---

## 🎉 성공 지표

- ✅ 테이블 수가 8개 이상
- ✅ users 테이블에 실제 사용자 데이터 존재
- ✅ 웹사이트 정상 접근 (200 OK)
- ✅ 로그인 기능 정상 작동
- ✅ 실제 콘텐츠 표시

이제 **실제 프로덕션 데이터**로 celly-creative 프로젝트를 완전히 복구할 수 있습니다! 🎉