# CodeB 운영 가이드

## 🚀 빠른 시작

### 1분 안에 프로젝트 배포하기

```bash
# 1. CLI 설치 (로컬에서)
npm install -g codeb-cli

# 2. 서버 연결
codeb config --server http://141.164.60.51:3000

# 3. 프로젝트 생성 및 배포
codeb create my-awesome-app \
  --git https://github.com/username/my-app \
  --domain myapp.one-q.xyz \
  --template remix \
  --db postgres \
  --cache \
  --ssl

# 4. 배포 확인
codeb status my-awesome-app
```

✅ 완료! 이제 https://myapp.one-q.xyz 에서 앱이 실행됩니다.

---

## 📊 현재 서버 상태

### 실행 중인 서비스
| 서비스 | URL/포트 | 상태 | 용도 |
|--------|----------|------|------|
| CodeB Server | http://141.164.60.51:3000 | ✅ 실행 중 | 웹 관리 패널 |
| API Server | http://141.164.60.51:3007 | ✅ 실행 중 | REST API |
| PostgreSQL | 141.164.60.51:5432 | ✅ 실행 중 | 데이터베이스 |
| Redis | 141.164.60.51:6379 | ✅ 실행 중 | 캐시/세션 |
| Sample App | http://141.164.60.51:5173 | ✅ 실행 중 | 예제 프로젝트 |

### 시스템 사양
- **서버**: Vultr Cloud
- **IP**: 141.164.60.51
- **도메인**: one-q.xyz
- **OS**: Ubuntu 22.04 LTS
- **메모리**: 16GB
- **스토리지**: 320GB

---

## 🛠 일상 운영 작업

### 매일 확인사항
```bash
# 서버 접속
ssh root@141.164.60.51

# 1. 서비스 상태 확인
pm2 list

# 2. 리소스 사용량 확인
htop  # q로 종료
df -h  # 디스크 사용량

# 3. 로그 확인 (에러 있는지)
pm2 logs --err --lines 20
```

### 프로젝트 배포 (Git → 실서버)
```bash
# 방법 1: CLI 사용 (권장)
codeb deploy my-app --branch main

# 방법 2: 수동 배포
ssh root@141.164.60.51
cd /var/lib/codeb/projects/my-app
git pull origin main
npm install
npm run build
pm2 restart my-app
```

### 데이터베이스 작업
```bash
# PostgreSQL 접속
psql -U codeb -d codeb

# 테이블 목록
\dt

# 특정 프로젝트 DB 생성
CREATE DATABASE myapp_db;

# 백업
pg_dump -U codeb myapp_db > myapp_backup.sql

# 복구
psql -U codeb myapp_db < myapp_backup.sql
```

---

## 🎯 사용 사례별 가이드

### 1. Next.js 앱 배포
```bash
codeb create nextjs-blog \
  --git https://github.com/vercel/next-learn-starter \
  --template nextjs \
  --domain blog.one-q.xyz \
  --db postgres \
  --cache
```

### 2. Remix 풀스택 앱 배포
```bash
codeb create remix-app \
  --template remix \
  --domain app.one-q.xyz \
  --db postgres \
  --cache \
  --ssl
```

### 3. Node.js API 서버
```bash
codeb create api-server \
  --template node \
  --domain api.one-q.xyz \
  --db postgres \
  --port 4000
```

### 4. 정적 웹사이트
```bash
codeb create landing-page \
  --template static \
  --domain www.one-q.xyz \
  --ssl
```

---

## 🔧 고급 설정

### 환경 변수 관리
```bash
# 환경 변수 설정
codeb env:set my-app \
  DATABASE_URL=postgres://... \
  JWT_SECRET=secret123 \
  NODE_ENV=production

# 환경 변수 확인
codeb env:list my-app

# 환경 변수 동기화
codeb env:sync my-app --from production --to staging
```

### 커스텀 도메인 설정
```bash
# 1. DNS 레코드 추가 (도메인 제공업체에서)
A Record: myapp.com → 141.164.60.51

# 2. Caddy 설정 추가
ssh root@141.164.60.51
nano /opt/codeb/Caddyfile

# 3. 다음 내용 추가
myapp.com {
    reverse_proxy localhost:3000
    encode gzip
}

# 4. Caddy 재시작
systemctl restart caddy
```

### 자동 배포 설정 (GitHub Actions)
```yaml
# .github/workflows/deploy.yml
name: Deploy to CodeB

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Deploy to CodeB
        run: |
          npm install -g codeb-cli
          codeb config --server ${{ secrets.CODEB_SERVER }}
          codeb deploy my-app --branch main
        env:
          CODEB_TOKEN: ${{ secrets.CODEB_TOKEN }}
```

---

## 📈 모니터링 및 로그

### 실시간 모니터링
```bash
# PM2 모니터링 대시보드
pm2 monit

# 실시간 로그 스트리밍
pm2 logs --lines 50

# 특정 앱 로그
pm2 logs my-app --lines 100
```

### 성능 분석
```bash
# CPU 사용률 상위 프로세스
ps aux --sort=-%cpu | head -10

# 메모리 사용률 상위 프로세스
ps aux --sort=-%mem | head -10

# 네트워크 연결 상태
netstat -tulpn
```

### 로그 관리
```bash
# 로그 파일 위치
/opt/codeb/logs/          # CodeB 로그
~/.pm2/logs/              # PM2 로그
/var/log/postgresql/      # PostgreSQL 로그
/var/log/redis/           # Redis 로그

# 오래된 로그 정리
find /opt/codeb/logs -name "*.log" -mtime +30 -delete
pm2 flush  # PM2 로그 초기화
```

---

## 🚨 긴급 상황 대응

### 서비스 다운
```bash
# 1. PM2 프로세스 확인
pm2 list

# 2. 다운된 서비스 재시작
pm2 restart codeb-server
pm2 restart final-api

# 3. 로그 확인
pm2 logs codeb-server --err --lines 50

# 4. 시스템 재부팅 (최후 수단)
reboot
```

### 메모리 부족
```bash
# 1. 메모리 사용량 확인
free -h

# 2. 큰 프로세스 찾기
ps aux --sort=-%mem | head -5

# 3. 불필요한 프로세스 종료
pm2 stop unused-app
pm2 delete unused-app

# 4. 메모리 캐시 정리
sync && echo 3 > /proc/sys/vm/drop_caches
```

### 디스크 풀
```bash
# 1. 디스크 사용량 확인
df -h
du -sh /var/lib/codeb/* | sort -rh | head -10

# 2. 로그 정리
pm2 flush
journalctl --vacuum-time=7d

# 3. 오래된 백업 삭제
rm -rf /opt/codeb/backups/*.old
```

### 데이터베이스 문제
```bash
# PostgreSQL 재시작
systemctl restart postgresql

# 연결 확인
psql -U codeb -h localhost -d codeb -c "SELECT 1;"

# 잠긴 쿼리 확인
psql -U codeb -d codeb -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"

# 잠긴 프로세스 종료
psql -U codeb -d codeb -c "SELECT pg_terminate_backend(PID);"
```

---

## 📝 체크리스트

### 일일 체크리스트
- [ ] PM2 프로세스 상태 확인
- [ ] 디스크 사용량 확인 (80% 미만)
- [ ] 메모리 사용량 확인
- [ ] 에러 로그 확인
- [ ] 백업 상태 확인

### 주간 체크리스트
- [ ] 전체 백업 수행
- [ ] 로그 파일 정리
- [ ] 보안 업데이트 확인
- [ ] 성능 메트릭 리뷰
- [ ] SSL 인증서 만료일 확인

### 월간 체크리스트
- [ ] 시스템 업데이트
- [ ] 백업 복구 테스트
- [ ] 보안 감사
- [ ] 리소스 사용 트렌드 분석
- [ ] 사용하지 않는 프로젝트 정리

---

## 🔐 보안 권장사항

1. **SSH 키 인증만 사용**
2. **방화벽 규칙 최소화**
3. **정기적인 보안 업데이트**
4. **강력한 비밀번호 사용**
5. **환경 변수로 민감 정보 관리**
6. **HTTPS 강제 사용**
7. **정기적인 백업**
8. **로그 모니터링**

---

## 📞 지원 및 문의

### 서버 정보
- **IP**: 141.164.60.51
- **도메인**: one-q.xyz
- **관리 패널**: http://141.164.60.51:3000

### 주요 경로
- **CodeB 설치**: `/opt/codeb/`
- **프로젝트**: `/var/lib/codeb/projects/`
- **로그**: `~/.pm2/logs/`
- **백업**: `/opt/codeb/backups/`

### 긴급 연락
문제 발생 시 다음 순서로 조치:
1. 이 가이드의 문제 해결 섹션 확인
2. 로그 확인
3. 서비스 재시작
4. 서버 재부팅 (최후 수단)

---

*Version 1.0 - 2025.08.19*