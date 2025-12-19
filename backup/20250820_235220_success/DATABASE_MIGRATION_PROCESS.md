# 데이터베이스 마이그레이션 프로세스
## CodeB Server - PostgreSQL 백업 및 복원

---

## 📦 데이터베이스 백업/복원 전략

### 현재 방식 (문제점)
```bash
# ❌ 잘못된 방식: seed 스크립트에 의존
npx prisma db push
npx tsx prisma/seed-sample-data.ts  # 샘플 데이터만 생성
```

### 올바른 방식 (SQL 백업/복원)
```bash
# ✅ 올바른 방식: 실제 데이터 마이그레이션
pg_dump source_db > backup.sql
psql target_db < backup.sql
```

---

## 🔄 데이터베이스 마이그레이션 워크플로우

### 1단계: 소스 데이터베이스 백업

```bash
# 기존 프로젝트에서 데이터 백업
ssh root@source-server << 'EOF'
  # PostgreSQL 컨테이너에서 덤프 생성
  podman exec source-postgres sh -c \
    "pg_dump -U user -d dbname > /tmp/backup.sql"
  
  # 호스트로 복사
  podman cp source-postgres:/tmp/backup.sql ./project-backup.sql
EOF

# 로컬로 다운로드
scp root@source-server:project-backup.sql ./
```

### 2단계: 백업 파일을 프로젝트에 포함

```bash
# Git 저장소에 백업 포함
mkdir -p database/backups
mv project-backup.sql database/backups/$(date +%Y%m%d)_backup.sql

# .gitignore에 추가 (민감한 데이터인 경우)
echo "database/backups/*.sql" >> .gitignore

# 또는 Git LFS 사용 (대용량 파일)
git lfs track "database/backups/*.sql"
```

### 3단계: 새 프로젝트에서 복원

```bash
# 타겟 서버에서 복원
ssh root@141.164.60.51 << 'EOF'
  PROJECT_NAME="celly-creative"
  
  # 백업 파일 업로드
  podman cp backup.sql ${PROJECT_NAME}-postgres:/tmp/
  
  # 데이터베이스 초기화 및 복원
  podman exec ${PROJECT_NAME}-postgres sh -c "
    # 기존 데이터 삭제 (주의!)
    psql -U user -c 'DROP DATABASE IF EXISTS ${PROJECT_NAME};'
    psql -U user -c 'CREATE DATABASE ${PROJECT_NAME};'
    
    # 백업 복원
    psql -U user -d ${PROJECT_NAME} < /tmp/backup.sql
  "
EOF
```

---

## 🛠️ API 서버 수정 사항

### codeb-api-server.js 개선

```javascript
// 배포 API에 데이터베이스 복원 단계 추가
app.post('/api/projects/:name/deploy', async (req, res) => {
    const { name } = req.params;
    const { gitUrl, branch, dbBackupUrl } = req.body;
    
    try {
        // ... 기존 코드 ...
        
        // 데이터베이스 복원 (옵션)
        if (dbBackupUrl) {
            log('INFO', `Restoring database from backup: ${dbBackupUrl}`);
            
            // 백업 파일 다운로드
            await execAsync(`
                wget -O /tmp/${name}_backup.sql ${dbBackupUrl}
            `);
            
            // PostgreSQL 컨테이너에 복사
            await execAsync(`
                podman cp /tmp/${name}_backup.sql ${name}-postgres:/tmp/backup.sql
            `);
            
            // 데이터베이스 복원
            await execAsync(`
                podman exec ${name}-postgres sh -c "
                    psql -U user -d ${name} < /tmp/backup.sql
                "
            `);
            
            log('INFO', 'Database restored successfully');
        } else {
            // 백업이 없으면 Prisma 마이그레이션만 실행
            await execAsync(`
                podman exec ${name}-app sh -c "
                    cd /app && npx prisma db push --accept-data-loss
                "
            `);
        }
        
        // ... 나머지 코드 ...
    } catch (error) {
        log('ERROR', 'Deployment failed', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 데이터베이스 백업 API 추가
app.get('/api/projects/:name/backup', async (req, res) => {
    const { name } = req.params;
    
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `${name}_${timestamp}.sql`;
        
        // PostgreSQL 덤프 생성
        await execAsync(`
            podman exec ${name}-postgres sh -c "
                pg_dump -U user -d ${name} > /tmp/${backupFile}
            "
        `);
        
        // 호스트로 복사
        await execAsync(`
            podman cp ${name}-postgres:/tmp/${backupFile} /tmp/${backupFile}
        `);
        
        // 파일 다운로드 제공
        res.download(`/tmp/${backupFile}`, backupFile, (err) => {
            if (err) {
                log('ERROR', 'Backup download failed', err);
            }
            // 임시 파일 삭제
            fs.unlink(`/tmp/${backupFile}`, () => {});
        });
        
    } catch (error) {
        log('ERROR', 'Backup failed', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 데이터베이스 복원 API
app.post('/api/projects/:name/restore', async (req, res) => {
    const { name } = req.params;
    const backupFile = req.files?.backup;
    
    if (!backupFile) {
        return res.status(400).json({ 
            success: false, 
            error: 'Backup file required' 
        });
    }
    
    try {
        // 백업 파일을 컨테이너로 복사
        await execAsync(`
            podman cp ${backupFile.tempFilePath} ${name}-postgres:/tmp/restore.sql
        `);
        
        // 데이터베이스 초기화 및 복원
        await execAsync(`
            podman exec ${name}-postgres sh -c "
                psql -U user -c 'DROP DATABASE IF EXISTS ${name}_old;'
                psql -U user -c 'ALTER DATABASE ${name} RENAME TO ${name}_old;'
                psql -U user -c 'CREATE DATABASE ${name};'
                psql -U user -d ${name} < /tmp/restore.sql
            "
        `);
        
        res.json({ 
            success: true, 
            message: 'Database restored successfully' 
        });
        
    } catch (error) {
        // 복원 실패 시 롤백
        await execAsync(`
            podman exec ${name}-postgres sh -c "
                psql -U user -c 'DROP DATABASE IF EXISTS ${name};'
                psql -U user -c 'ALTER DATABASE ${name}_old RENAME TO ${name};'
            "
        `).catch(() => {});
        
        log('ERROR', 'Restore failed', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
```

---

## 📝 CLI 명령 추가

### codeb-cli-v2.sh 수정

```bash
# 데이터베이스 백업 명령
db_backup() {
    local name="$1"
    echo -e "${BOLD}${CYAN}🚀 💾 데이터베이스 백업: $name${NC}"
    
    local response=$(api_call GET "/projects/$name/backup")
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 백업 완료: ${name}_backup.sql${NC}"
    else
        echo -e "${RED}❌ 백업 실패${NC}"
    fi
}

# 데이터베이스 복원 명령
db_restore() {
    local name="$1"
    local backup_file="$2"
    
    if [ ! -f "$backup_file" ]; then
        echo -e "${RED}❌ 백업 파일을 찾을 수 없습니다: $backup_file${NC}"
        return 1
    fi
    
    echo -e "${BOLD}${CYAN}🚀 🔄 데이터베이스 복원: $name${NC}"
    
    local response=$(curl -s -X POST \
        -F "backup=@$backup_file" \
        "${API_URL}/projects/$name/restore")
    
    local success=$(echo "$response" | jq -r '.success')
    
    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✅ 복원 완료${NC}"
    else
        echo -e "${RED}❌ 복원 실패${NC}"
    fi
}

# 명령 추가
case "$command" in
    db)
        case "$2" in
            backup)
                db_backup "$3"
                ;;
            restore)
                db_restore "$3" "$4"
                ;;
            *)
                echo "사용법: codeb db [backup|restore] <프로젝트명> [백업파일]"
                ;;
        esac
        ;;
esac
```

---

## 🔄 celly-creative 프로젝트 복구 (수정된 버전)

### 실제 데이터가 있는 경우

```bash
# 1. 기존 데이터베이스 백업 (소스 서버에서)
ssh root@source-server << 'EOF'
  podman exec original-postgres sh -c \
    "pg_dump -U user -d celly_creative > /tmp/celly_backup.sql"
  podman cp original-postgres:/tmp/celly_backup.sql ./
EOF

# 2. 백업 파일 전송
scp root@source-server:celly_backup.sql ./

# 3. 새 서버에 복원
scp celly_backup.sql root@141.164.60.51:/tmp/

ssh root@141.164.60.51 << 'EOF'
  # PostgreSQL 컨테이너에 복사
  podman cp /tmp/celly_backup.sql celly-creative-postgres:/tmp/
  
  # 복원
  podman exec celly-creative-postgres sh -c "
    psql -U user -c 'DROP DATABASE IF EXISTS celly_creative;'
    psql -U user -c 'CREATE DATABASE celly_creative;'
    psql -U user -d celly_creative < /tmp/celly_backup.sql
  "
EOF
```

### 테스트용 샘플 데이터만 필요한 경우

```bash
# Prisma 스키마 적용 및 시드 실행
ssh root@141.164.60.51 << 'EOF'
  podman exec celly-creative-app sh -c "
    cd /app
    npx prisma db push --accept-data-loss
    npx tsx prisma/seed-sample-data.ts
  "
EOF
```

---

## 📊 백업 자동화 제안

### 일일 백업 스크립트

```bash
#!/bin/bash
# /root/daily-backup.sh

BACKUP_DIR="/backups/postgresql"
PROJECTS=$(podman pod ls --format "{{.Name}}" | grep -v POD)

for project in $PROJECTS; do
    if podman ps --filter "name=${project}-postgres" --quiet; then
        DATE=$(date +%Y%m%d_%H%M%S)
        BACKUP_FILE="${BACKUP_DIR}/${project}_${DATE}.sql"
        
        podman exec ${project}-postgres sh -c \
            "pg_dump -U user -d ${project} > /tmp/backup.sql"
        
        podman cp ${project}-postgres:/tmp/backup.sql "$BACKUP_FILE"
        
        # 7일 이상 된 백업 삭제
        find "$BACKUP_DIR" -name "${project}_*.sql" -mtime +7 -delete
    fi
done
```

### Cron 설정

```bash
# 매일 새벽 3시 백업
0 3 * * * /root/daily-backup.sh >> /var/log/backup.log 2>&1
```

---

## ⚠️ 주의사항

1. **민감한 데이터**: 백업 파일에는 실제 사용자 데이터가 포함되므로 보안 주의
2. **용량 관리**: 대용량 데이터베이스는 압축 사용 (`pg_dump | gzip > backup.sql.gz`)
3. **버전 호환성**: PostgreSQL 버전 차이로 인한 호환성 문제 주의
4. **인코딩**: UTF-8 인코딩 확인 필수
5. **권한**: 백업/복원 시 데이터베이스 소유자 권한 확인

---

## 🎯 결론

**현재 방식 개선점**:
- ❌ seed 스크립트 의존 → ✅ 실제 데이터 백업/복원
- ❌ 수동 프로세스 → ✅ API 기반 자동화
- ❌ 데이터 손실 위험 → ✅ 백업 후 복원

**구현 우선순위**:
1. API 서버에 백업/복원 엔드포인트 추가
2. CLI에 db 명령 추가
3. 일일 백업 자동화 설정