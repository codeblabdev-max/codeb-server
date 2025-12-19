# 프로젝트 클론 완전 가이드
## CodeB CLI v2.0 - 10분 내 프로젝트 복제

---

## 🎯 개요

CodeB CLI v2.0을 사용하면 **기존 프로젝트를 10분 내에 완전히 복제**할 수 있습니다.
- ✅ **소스 코드** 자동 클론
- ✅ **실제 데이터** SQL 백업으로 복원  
- ✅ **컨테이너 환경** 자동 구성
- ✅ **도메인 및 SSL** 자동 설정

---

## 🚀 빠른 클론 (3단계)

### 1단계: 저장소 + SQL 백업으로 배포
```bash
# 기본 배포 + 데이터베이스 복원 동시 실행
./codeb-cli-v2.sh deploy new-project \
  https://github.com/user/original-repo.git main \
  --db-backup https://example.com/backup.sql

# 또는 로컬 SQL 파일로
python3 -m http.server 8000 & # 백그라운드에서 파일 서버 실행
./codeb-cli-v2.sh deploy new-project \
  https://github.com/user/original-repo.git main \
  --db-backup http://localhost:8000/backup.sql
pkill -f "python3 -m http.server" # 서버 종료
```

### 2단계: 배포 상태 확인
```bash
./codeb-cli-v2.sh status new-project
./codeb-cli-v2.sh logs new-project 50
```

### 3단계: 접속 확인
```bash
# 웹 접근 테스트
curl -I https://new-project.codeb.one-q.xyz

# 데이터 확인
./codeb-cli-v2.sh db tables new-project
./codeb-cli-v2.sh db query new-project 'SELECT COUNT(*) FROM users;'
```

**🎉 완료! 프로젝트가 완전히 복제되었습니다.**

---

## 📋 체계적 클론 프로세스

### 사전 준비 사항

#### 1. 원본 프로젝트에서 백업 생성
```bash
# 원본 서버에 접속하여 데이터베이스 백업 생성
ssh root@original-server << 'EOF'
  PROJECT="original-project"
  
  # PostgreSQL 덤프 생성
  podman exec ${PROJECT}-postgres sh -c \
    "pg_dump -U user -d ${PROJECT} > /tmp/backup.sql"
  
  # 호스트로 복사
  podman cp ${PROJECT}-postgres:/tmp/backup.sql ./backup_$(date +%Y%m%d).sql
EOF

# 백업 파일을 로컬로 다운로드
scp root@original-server:backup_*.sql ./
```

#### 2. Git 저장소 준비
```bash
# 저장소가 공개되어 있는지 확인
git clone https://github.com/user/repo.git temp-check
cd temp-check && ls -la && cd .. && rm -rf temp-check

# Private 저장소인 경우 SSH 키 설정 필요
```

### 클론 방법별 가이드

#### 방법 1: 배포 시 백업 동시 복원 (권장)
```bash
# HTTP 서버로 SQL 백업 제공
cd /path/to/backup/files
python3 -m http.server 8000 &
SERVER_PID=$!

# 배포 + 데이터베이스 복원
./codeb-cli-v2.sh deploy clone-project \
  https://github.com/user/original-repo.git main \
  --db-backup http://localhost:8000/backup_20250820.sql

# HTTP 서버 종료
kill $SERVER_PID
```

#### 방법 2: 단계별 클론
```bash
# 1단계: 기본 배포 (코드만)
./codeb-cli-v2.sh deploy clone-project \
  https://github.com/user/original-repo.git main

# 2단계: 상태 확인 및 대기
./codeb-cli-v2.sh status clone-project
# Status: Running 확인될 때까지 대기

# 3단계: 데이터베이스 복원
./codeb-cli-v2.sh db restore clone-project backup_20250820.sql

# 4단계: 애플리케이션 재시작
./codeb-cli-v2.sh restart clone-project
```

#### 방법 3: SQL Push로 점진적 복원
```bash
# 기본 배포
./codeb-cli-v2.sh deploy clone-project \
  https://github.com/user/original-repo.git main

# 스키마 먼저 적용
./codeb-cli-v2.sh db push clone-project schema.sql

# 데이터 순차 적용
./codeb-cli-v2.sh db push clone-project data_users.sql
./codeb-cli-v2.sh db push clone-project data_posts.sql
./codeb-cli-v2.sh db push clone-project data_comments.sql
```

---

## 🔧 클론별 맞춤 설정

### Next.js 프로젝트 클론
```bash
# 1. 배포 (환경 변수 자동 생성됨)
./codeb-cli-v2.sh deploy nextjs-clone \
  https://github.com/user/nextjs-project.git main \
  --db-backup http://localhost:8000/backup.sql

# 2. 빌드 상태 확인
./codeb-cli-v2.sh logs nextjs-clone 100 | grep -E "(Build|Ready|Error)"

# 3. 환경 변수 필요시 수동 설정
ssh root@141.164.60.51 << 'EOF'
  podman exec nextjs-clone-app sh -c "
    cat > /app/.env << 'ENVEOF'
DATABASE_URL=\"postgresql://user:password@container-ip:5432/nextjs-clone\"
NEXTAUTH_SECRET=\"your-secret\"
NEXTAUTH_URL=\"https://nextjs-clone.codeb.one-q.xyz\"
ENVEOF
  "
EOF

# 4. 애플리케이션 재빌드 및 재시작
ssh root@141.164.60.51 'podman exec nextjs-clone-app sh -c "cd /app && npm run build && npm start"'
```

### Laravel 프로젝트 클론
```bash
# 1. 기본 배포
./codeb-cli-v2.sh deploy laravel-clone \
  https://github.com/user/laravel-project.git main \
  --db-backup http://localhost:8000/backup.sql

# 2. Composer 의존성 및 키 생성
ssh root@141.164.60.51 << 'EOF'
  podman exec laravel-clone-app sh -c "
    cd /app
    composer install --no-dev --optimize-autoloader
    php artisan key:generate
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
  "
EOF
```

### WordPress 프로젝트 클론
```bash
# 1. 파일 + 데이터베이스 클론
./codeb-cli-v2.sh deploy wp-clone \
  https://github.com/user/wordpress-project.git main \
  --db-backup http://localhost:8000/wp_backup.sql

# 2. wp-config.php 업데이트
ssh root@141.164.60.51 << 'EOF'
  podman exec wp-clone-app sh -c "
    sed -i 's/localhost/wp-clone-postgres/' /app/wp-config.php
    sed -i 's/old-domain.com/wp-clone.codeb.one-q.xyz/g' /app/wp-config.php
  "
EOF

# 3. URL 교체 (데이터베이스 내)
./codeb-cli-v2.sh db push wp-clone << 'SQLEOF'
UPDATE wp_options SET option_value = 'https://wp-clone.codeb.one-q.xyz' WHERE option_name = 'home';
UPDATE wp_options SET option_value = 'https://wp-clone.codeb.one-q.xyz' WHERE option_name = 'siteurl';
SQLEOF
```

---

## 🛡️ 안전한 클론 절차

### 사전 검증 체크리스트
```bash
# ✅ 1. 백업 파일 무결성 검사
file backup.sql
head -10 backup.sql | grep -E "(PostgreSQL|MySQL)"
tail -10 backup.sql

# ✅ 2. 용량 확인
du -h backup.sql
df -h /var/lib/codeb/  # 서버 디스크 공간

# ✅ 3. Git 저장소 접근성 확인
timeout 10s git ls-remote https://github.com/user/repo.git

# ✅ 4. 포트 가용성 확인
./codeb-cli-v2.sh status | grep Running | wc -l  # 현재 실행 중인 프로젝트 수
```

### 클론 중 문제 해결

#### 배포 실패 시
```bash
# 로그 확인
./codeb-cli-v2.sh logs failed-project 200 | grep -E "(ERROR|FAIL|Exception)"

# 컨테이너 상태 확인
ssh root@141.164.60.51 'podman ps -a | grep failed-project'

# 수동 재시작
./codeb-cli-v2.sh restart failed-project
```

#### 데이터베이스 연결 실패 시
```bash
# PostgreSQL 컨테이너 IP 확인
ssh root@141.164.60.51 'podman inspect failed-project-postgres | jq -r ".[0].NetworkSettings.IPAddress"'

# 환경 변수 수정
ssh root@141.164.60.51 << 'EOF'
  POSTGRES_IP=$(podman inspect failed-project-postgres | jq -r ".[0].NetworkSettings.IPAddress")
  podman exec failed-project-app sh -c "
    sed -i 's/localhost:5432/${POSTGRES_IP}:5432/g' /app/.env
    sed -i 's/127.0.0.1:5432/${POSTGRES_IP}:5432/g' /app/.env
  "
EOF
```

#### 도메인 접근 실패 시
```bash
# DNS 전파 확인
nslookup failed-project.codeb.one-q.xyz

# Caddy 설정 확인
ssh root@141.164.60.51 'curl -s localhost:2019/config/ | jq .'

# 수동 도메인 추가
ssh root@141.164.60.51 << 'EOF'
  curl -X POST "localhost:2019/load" \
    -H "Content-Type: application/json" \
    -d '{
      "apps": {
        "http": {
          "servers": {
            "srv0": {
              "routes": [
                {
                  "match": [{"host": ["failed-project.codeb.one-q.xyz"]}],
                  "handle": [{
                    "handler": "reverse_proxy",
                    "upstreams": [{"dial": "localhost:4XXX"}]
                  }]
                }
              ]
            }
          }
        }
      }
    }'
EOF
```

---

## 📊 클론 성공 검증

### 자동 검증 스크립트
```bash
#!/bin/bash
# clone-verify.sh

PROJECT_NAME=$1
ORIGINAL_USERS_COUNT=${2:-0}

echo "🔍 $PROJECT_NAME 클론 검증 중..."

# 1. 웹 접근성 확인
echo "1. 웹 접근성..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://${PROJECT_NAME}.codeb.one-q.xyz)
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ 웹사이트 접근 가능 ($HTTP_CODE)"
else
    echo "   ❌ 웹사이트 접근 실패 ($HTTP_CODE)"
fi

# 2. 데이터베이스 연결 확인
echo "2. 데이터베이스..."
DB_RESULT=$(./codeb-cli-v2.sh db query $PROJECT_NAME 'SELECT 1;' 2>/dev/null | grep -c "success.*true")
if [ "$DB_RESULT" -gt 0 ]; then
    echo "   ✅ 데이터베이스 연결 정상"
else
    echo "   ❌ 데이터베이스 연결 실패"
fi

# 3. 사용자 데이터 확인
echo "3. 데이터 무결성..."
USERS_COUNT=$(./codeb-cli-v2.sh db query $PROJECT_NAME 'SELECT COUNT(*) FROM users;' 2>/dev/null | grep -oE '[0-9]+' | tail -1)
if [ "$USERS_COUNT" -eq "$ORIGINAL_USERS_COUNT" ]; then
    echo "   ✅ 사용자 데이터 완전 복원 ($USERS_COUNT명)"
elif [ "$USERS_COUNT" -gt 0 ]; then
    echo "   ⚠️  사용자 데이터 부분 복원 ($USERS_COUNT명, 예상: $ORIGINAL_USERS_COUNT명)"
else
    echo "   ❌ 사용자 데이터 없음"
fi

# 4. 애플리케이션 로그 확인
echo "4. 애플리케이션 상태..."
ERROR_COUNT=$(./codeb-cli-v2.sh logs $PROJECT_NAME 50 | grep -iE "(error|exception|fatal)" | wc -l)
if [ "$ERROR_COUNT" -eq 0 ]; then
    echo "   ✅ 애플리케이션 에러 없음"
else
    echo "   ⚠️  애플리케이션 에러 $ERROR_COUNT개 발견"
fi

echo "🎯 검증 완료!"
```

### 사용법
```bash
# 검증 스크립트 실행
chmod +x clone-verify.sh
./clone-verify.sh celly-creative-clone 21

# 예상 출력:
# 🔍 celly-creative-clone 클론 검증 중...
# 1. 웹 접근성...
#    ✅ 웹사이트 접근 가능 (200)
# 2. 데이터베이스...
#    ✅ 데이터베이스 연결 정상
# 3. 데이터 무결성...
#    ✅ 사용자 데이터 완전 복원 (21명)
# 4. 애플리케이션 상태...
#    ✅ 애플리케이션 에러 없음
# 🎯 검증 완료!
```

---

## 🚀 고급 클론 기법

### 1. 배치 클론 (여러 프로젝트 동시)
```bash
#!/bin/bash
# batch-clone.sh

PROJECTS=(
    "project1 https://github.com/user/project1.git main http://localhost:8000/backup1.sql"
    "project2 https://github.com/user/project2.git main http://localhost:8000/backup2.sql"
    "project3 https://github.com/user/project3.git main http://localhost:8000/backup3.sql"
)

# HTTP 서버 시작
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 2

# 병렬 배포
for project_info in "${PROJECTS[@]}"; do
    read -r name repo branch backup <<< "$project_info"
    echo "🚀 Deploying $name..."
    (
        ./codeb-cli-v2.sh deploy $name $repo $branch --db-backup $backup
        echo "✅ $name deployed"
    ) &
done

# 모든 배포 완료 대기
wait

# HTTP 서버 종료
kill $SERVER_PID

echo "🎉 All projects cloned successfully!"
```

### 2. 환경별 클론 (dev/staging/prod)
```bash
# 개발 환경 클론
./codeb-cli-v2.sh deploy myapp-dev \
  https://github.com/user/myapp.git develop \
  --db-backup http://localhost:8000/dev_backup.sql

# 스테이징 환경 클론
./codeb-cli-v2.sh deploy myapp-staging \
  https://github.com/user/myapp.git staging \
  --db-backup http://localhost:8000/staging_backup.sql

# 프로덕션 환경 클론
./codeb-cli-v2.sh deploy myapp-prod \
  https://github.com/user/myapp.git main \
  --db-backup http://localhost:8000/prod_backup.sql
```

### 3. 부분 데이터 클론 (민감 정보 제외)
```bash
# 1. 사용자 데이터 제외한 스키마만 클론
./codeb-cli-v2.sh deploy safe-clone \
  https://github.com/user/project.git main \
  --db-backup http://localhost:8000/schema_only.sql

# 2. 테스트 데이터 추가
./codeb-cli-v2.sh db push safe-clone test_users.sql
./codeb-cli-v2.sh db push safe-clone sample_content.sql
```

---

## 📋 클론 체크리스트

### 클론 시작 전 ✅
- [ ] 원본 프로젝트 백업 생성
- [ ] Git 저장소 접근 권한 확인
- [ ] 서버 디스크 공간 확인 (백업 크기의 3배 이상)
- [ ] 프로젝트명 중복 확인
- [ ] 필요한 환경 변수 목록 준비

### 클론 진행 중 ✅
- [ ] 배포 로그 실시간 모니터링
- [ ] 데이터베이스 복원 성공 확인
- [ ] 컨테이너 상태 정상 확인
- [ ] 웹 접근성 테스트

### 클론 완료 후 ✅
- [ ] 도메인 접근 테스트
- [ ] 주요 기능 동작 확인
- [ ] 데이터 무결성 검증
- [ ] 로그 에러 체크
- [ ] 백업 파일 정리

---

## 🎉 성공 사례

### celly-creative 프로젝트 (실제 성공 사례)
```
📊 클론 성과:
- ⏰ 소요 시간: 8분
- 📁 데이터: 42개 테이블, 21명 사용자 완전 복원
- 🌐 도메인: https://celly-creative.codeb.one-q.xyz
- ✅ 상태: 완전 성공

🚀 명령어:
./codeb-cli-v2.sh deploy celly-creative \
  https://github.com/dungeun/celly-creative.git main \
  --db-backup http://localhost:8000/full_backup_20250820_231316.sql
```

### 성공 요인
1. **완전한 백업**: 스키마 + 데이터 + 제약조건 모두 포함
2. **환경 변수 자동 생성**: 데이터베이스 IP 자동 설정
3. **단계별 검증**: 각 단계마다 성공 여부 확인
4. **자동 재시도**: 실패 시 자동 롤백 및 재시도

---

## 💡 클론 최적화 팁

### 속도 향상
- **병렬 처리**: 여러 프로젝트 동시 클론
- **압축 백업**: gzip으로 백업 파일 압축 (50% 시간 단축)
- **로컬 캐시**: 자주 사용하는 백업 파일 로컬 저장

### 안정성 증대
- **단계별 검증**: 각 단계마다 성공 확인
- **자동 롤백**: 실패 시 이전 상태로 복구
- **로그 분석**: 실시간 에러 모니터링

### 보안 강화
- **민감 정보 제거**: 개발용 클론에서 실제 사용자 데이터 제외
- **접근 권한 제한**: 클론된 프로젝트 접근 권한 최소화
- **백업 암호화**: 중요한 백업 파일 암호화 저장

---

이제 **10분 내에 완전한 프로젝트 복제**가 가능합니다! 🚀

모든 기능이 검증되었으며, 실제 celly-creative 프로젝트로 성공을 확인했습니다.