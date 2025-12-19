# CodeB Server 구현 계획
## 데이터베이스 백업/복원 통합

---

## 🎯 목표

기존 프로젝트의 실제 데이터를 SQL 백업을 통해 새 프로젝트로 마이그레이션하는 완전한 프로세스 구축

---

## 📋 구현 작업 목록

### Phase 1: API 서버 개선 (즉시)

#### 1. 백업 엔드포인트 추가
```javascript
// GET /api/projects/:name/db/backup
// PostgreSQL 데이터베이스를 SQL 파일로 백업
```

#### 2. 복원 엔드포인트 추가
```javascript
// POST /api/projects/:name/db/restore
// SQL 파일을 PostgreSQL 데이터베이스로 복원
```

#### 3. 배포 프로세스 수정
```javascript
// POST /api/projects/:name/deploy
// 옵션: dbBackupUrl 파라미터 추가
// 백업 파일이 있으면 복원, 없으면 Prisma 마이그레이션만
```

### Phase 2: CLI 도구 확장 (오늘)

#### 1. db 명령 추가
```bash
codeb db backup <project>        # 데이터베이스 백업
codeb db restore <project> <file> # 데이터베이스 복원
codeb db list <project>          # 테이블 목록 조회
codeb db query <project> <sql>   # SQL 쿼리 실행
```

#### 2. deploy 명령 개선
```bash
codeb deploy <project> <git-url> --db-backup <file>
# 배포 시 데이터베이스 백업 파일 함께 전달
```

### Phase 3: 자동화 (이번 주)

#### 1. 백업 스케줄러
```bash
# Cron job으로 일일 백업
# S3 또는 로컬 스토리지에 저장
# 30일 이상 된 백업 자동 삭제
```

#### 2. 마이그레이션 파이프라인
```yaml
# .github/workflows/deploy.yml
steps:
  - name: Backup production DB
  - name: Deploy to staging
  - name: Restore DB to staging
  - name: Run tests
  - name: Deploy to production
```

---

## 🔧 기술 구현 상세

### PostgreSQL 백업 명령

```bash
# 전체 데이터베이스 백업
pg_dump -U user -d dbname > backup.sql

# 스키마만 백업
pg_dump -U user -d dbname --schema-only > schema.sql

# 데이터만 백업
pg_dump -U user -d dbname --data-only > data.sql

# 압축 백업
pg_dump -U user -d dbname | gzip > backup.sql.gz

# 특정 테이블만 백업
pg_dump -U user -d dbname -t table1 -t table2 > tables.sql
```

### PostgreSQL 복원 명령

```bash
# 기본 복원
psql -U user -d dbname < backup.sql

# 압축 파일 복원
gunzip -c backup.sql.gz | psql -U user -d dbname

# 깨끗한 복원 (기존 데이터 삭제)
psql -U user -c "DROP DATABASE IF EXISTS dbname;"
psql -U user -c "CREATE DATABASE dbname;"
psql -U user -d dbname < backup.sql
```

### Podman 컨테이너에서 실행

```bash
# 백업
podman exec postgres-container pg_dump -U user -d dbname > backup.sql

# 복원
podman exec -i postgres-container psql -U user -d dbname < backup.sql

# 파일 복사
podman cp postgres-container:/backup.sql ./backup.sql
podman cp ./backup.sql postgres-container:/backup.sql
```

---

## 📝 설정 파일 업데이트

### env-templates.json 수정

```json
{
  "nextjs": {
    "database": {
      "backupOnDeploy": true,
      "restoreOnDeploy": false,
      "backupSchedule": "0 3 * * *",
      "backupRetention": 30,
      "backupLocation": "/backups/postgresql/"
    }
  }
}
```

### 프로젝트 메타데이터 추가

```json
{
  "projects": {
    "celly-creative": {
      "database": {
        "type": "postgresql",
        "version": "15",
        "lastBackup": "2025-08-20T23:00:00Z",
        "backupSize": "45MB",
        "tables": 28,
        "records": 15420
      }
    }
  }
}
```

---

## 🚨 위험 관리

### 백업 전 체크리스트
- [ ] 디스크 공간 확인
- [ ] 데이터베이스 연결 상태 확인
- [ ] 진행 중인 트랜잭션 확인
- [ ] 백업 권한 확인

### 복원 전 체크리스트
- [ ] 백업 파일 무결성 검증
- [ ] 타겟 데이터베이스 백업
- [ ] 호환성 확인 (PostgreSQL 버전)
- [ ] 충분한 디스크 공간 확인

### 롤백 계획
```bash
# 복원 실패 시 자동 롤백
if ! psql -U user -d dbname < new_backup.sql; then
  echo "복원 실패, 이전 백업으로 롤백"
  psql -U user -d dbname < old_backup.sql
fi
```

---

## 📊 모니터링

### 백업 상태 대시보드
```
프로젝트          마지막 백업        크기    상태
-------------------------------------------------
celly-creative   2025-08-20 03:00  45MB   ✅ 성공
video-platform   2025-08-20 03:05  12MB   ✅ 성공
test-nextjs      2025-08-19 03:00  5MB    ⚠️ 24시간 경과
```

### 알림 설정
- 백업 실패 시 이메일/Slack 알림
- 백업 크기 급증 시 경고
- 30일 이상 백업 없을 시 알림

---

## 🎯 우선순위

### 즉시 (오늘)
1. ✅ 문서화 완료
2. ⬜ API 서버에 백업/복원 엔드포인트 추가
3. ⬜ CLI에 db 명령 추가

### 단기 (이번 주)
4. ⬜ 자동 백업 스케줄러 구현
5. ⬜ 백업 파일 압축 및 암호화
6. ⬜ S3 업로드 옵션 추가

### 중기 (다음 주)
7. ⬜ 백업 상태 대시보드
8. ⬜ 증분 백업 지원
9. ⬜ 다중 데이터베이스 지원 (MySQL, MongoDB)

---

## 🔗 참고 자료

- [PostgreSQL 백업 문서](https://www.postgresql.org/docs/current/backup.html)
- [pg_dump 매뉴얼](https://www.postgresql.org/docs/current/app-pgdump.html)
- [Podman 볼륨 관리](https://docs.podman.io/en/latest/markdown/podman-volume.1.html)