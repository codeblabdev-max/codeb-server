# CodeB Server 설정 및 운영 메뉴얼

## 📋 목차
1. [서버 접속 정보](#서버-접속-정보)
2. [서비스 구성](#서비스-구성)
3. [서버 관리 명령어](#서버-관리-명령어)
4. [프로젝트 관리](#프로젝트-관리)
5. [도메인 설정](#도메인-설정)
6. [백업 및 복구](#백업-및-복구)
7. [모니터링](#모니터링)
8. [문제 해결](#문제-해결)

---

## 서버 접속 정보

### SSH 접속
```bash
ssh root@141.164.60.51
```

### 웹 서비스 URL
- **CodeB 관리 패널**: http://141.164.60.51:3000
- **API 서버**: http://141.164.60.51:3007
- **프로젝트 예시**: http://141.164.60.51:5173 (code-cms-core)

### 데이터베이스 접속
```bash
# PostgreSQL
psql -h 141.164.60.51 -U codeb -d codeb -p 5432
# 비밀번호: codeb123

# Redis
redis-cli -h 141.164.60.51 -p 6379
```

---

## 서비스 구성

### 디렉토리 구조
```
/opt/codeb/                 # CodeB 메인 디렉토리
├── codeb-remix/           # Remix 기반 웹 서버
├── codeb-cli/             # CLI 도구
├── data/                  # 데이터 저장소
└── logs/                  # 로그 파일

/var/lib/codeb/            # 프로젝트 데이터
├── projects/              # 실제 프로젝트들
├── database.json          # 프로젝트 DB
└── templates/             # 프로젝트 템플릿

/root/server-api/          # API 서버
└── coolify-final-server.js
```

### 실행 중인 서비스
| 서비스 | 포트 | 프로세스 관리 | 용도 |
|--------|------|--------------|------|
| CodeB Server | 3000 | PM2 (codeb-server) | 웹 관리 인터페이스 |
| API Server | 3007 | PM2 (final-api) | REST API |
| PostgreSQL | 5432 | systemd | 데이터베이스 |
| Redis | 6379 | systemd | 캐시/세션 |
| CMS Core | 5173 | PM2 (code-cms-core) | 샘플 프로젝트 |

---

## 서버 관리 명령어

### PM2 프로세스 관리
```bash
# 프로세스 목록 확인
pm2 list

# CodeB 서버 재시작
pm2 restart codeb-server

# API 서버 재시작
pm2 restart final-api

# 로그 확인
pm2 logs codeb-server --lines 100
pm2 logs final-api --lines 100

# 프로세스 상세 정보
pm2 show codeb-server

# 모든 프로세스 저장 (재부팅 후 자동 시작)
pm2 save
pm2 startup
```

### 서비스 재시작
```bash
# CodeB 서버 재빌드 및 재시작
cd /opt/codeb/codeb-remix
npm run build
pm2 restart codeb-server

# API 서버 재시작
pm2 restart final-api

# PostgreSQL 재시작
systemctl restart postgresql

# Redis 재시작
systemctl restart redis
```

### 포트 확인
```bash
# 사용 중인 포트 확인
netstat -tlnp | grep -E '3000|3007|5432|6379|5173'

# 특정 포트 프로세스 확인
lsof -i :3000
```

---

## 프로젝트 관리

### CLI를 통한 프로젝트 관리

#### 1. 로컬에서 CLI 설치
```bash
# 로컬 컴퓨터에서 실행
npm install -g codeb-cli

# 서버 연결 설정
codeb config --server http://141.164.60.51:3000
```

#### 2. 프로젝트 생성
```bash
# 새 프로젝트 생성
codeb create myproject \
  --template remix \
  --domain myproject.one-q.xyz \
  --db postgres \
  --cache

# Git 리포지토리와 연동
codeb create myapp \
  --git https://github.com/username/myapp \
  --template node \
  --ssl
```

#### 3. 프로젝트 관리
```bash
# 프로젝트 목록
codeb list

# 프로젝트 상태 확인
codeb status myproject

# 프로젝트 시작/중지
codeb start myproject
codeb stop myproject
codeb restart myproject

# 프로젝트 삭제
codeb delete myproject --force

# 로그 확인
codeb logs myproject --follow
```

### 서버에서 직접 관리
```bash
# SSH로 서버 접속
ssh root@141.164.60.51

# 프로젝트 디렉토리 확인
ls -la /var/lib/codeb/projects/

# 특정 프로젝트 접근
cd /var/lib/codeb/projects/myproject

# PM2로 프로젝트 시작
pm2 start npm --name myproject -- start

# 프로젝트 로그 확인
pm2 logs myproject
```

---

## 도메인 설정

### 1. DNS 설정 (one-q.xyz)
```bash
# A 레코드 추가 (도메인 제공업체에서 설정)
myapp.one-q.xyz → 141.164.60.51
api.myapp.one-q.xyz → 141.164.60.51
```

### 2. Caddy 리버스 프록시 설정
```bash
# Caddy 설정 파일 편집
nano /opt/codeb/Caddyfile

# 추가할 내용
myapp.one-q.xyz {
    reverse_proxy localhost:3000
    encode gzip
}

# Caddy 재시작
systemctl restart caddy
```

### 3. SSL 인증서 (자동)
Caddy가 Let's Encrypt를 통해 자동으로 SSL 인증서를 발급받습니다.

---

## 백업 및 복구

### 데이터베이스 백업
```bash
# PostgreSQL 백업
pg_dump -U codeb -h localhost codeb > /opt/codeb/backups/db_$(date +%Y%m%d).sql

# Redis 백업
redis-cli --rdb /opt/codeb/backups/redis_$(date +%Y%m%d).rdb

# 프로젝트 데이터 백업
tar -czf /opt/codeb/backups/projects_$(date +%Y%m%d).tar.gz /var/lib/codeb/projects/
```

### 복구
```bash
# PostgreSQL 복구
psql -U codeb -h localhost codeb < /opt/codeb/backups/db_20250119.sql

# Redis 복구
cp /opt/codeb/backups/redis_20250119.rdb /var/lib/redis/dump.rdb
systemctl restart redis

# 프로젝트 복구
tar -xzf /opt/codeb/backups/projects_20250119.tar.gz -C /
```

### 자동 백업 스크립트
```bash
# Cron 설정
crontab -e

# 매일 새벽 3시 백업
0 3 * * * /opt/codeb/scripts/backup.sh
```

---

## 모니터링

### 시스템 리소스 확인
```bash
# CPU/메모리 사용량
htop

# 디스크 사용량
df -h

# 메모리 상세
free -h

# 프로세스별 리소스
pm2 monit
```

### 서비스 상태 확인
```bash
# 모든 PM2 프로세스
pm2 status

# PostgreSQL 상태
systemctl status postgresql

# Redis 상태
systemctl status redis

# 포트 리스닝 확인
netstat -tlnp
```

### 로그 모니터링
```bash
# PM2 로그 (실시간)
pm2 logs --lines 100

# 시스템 로그
journalctl -f

# 특정 서비스 로그
journalctl -u postgresql -f
journalctl -u redis -f
```

### 헬스체크 API
```bash
# CodeB 서버 상태
curl http://localhost:3000/api/health

# API 서버 상태
curl http://localhost:3007/api/health
```

---

## 문제 해결

### 1. 서비스가 시작되지 않을 때
```bash
# PM2 프로세스 확인
pm2 list
pm2 show codeb-server

# 에러 로그 확인
pm2 logs codeb-server --err --lines 50

# 포트 충돌 확인
lsof -i :3000

# 프로세스 강제 종료 후 재시작
pm2 delete codeb-server
pm2 start npm --name codeb-server -- start
```

### 2. 데이터베이스 연결 실패
```bash
# PostgreSQL 상태 확인
systemctl status postgresql
psql -U codeb -h localhost -d codeb

# 연결 설정 확인
cat /etc/postgresql/*/main/postgresql.conf | grep listen_addresses
cat /etc/postgresql/*/main/pg_hba.conf

# PostgreSQL 재시작
systemctl restart postgresql
```

### 3. 메모리 부족
```bash
# 메모리 사용량 확인
free -h
ps aux --sort=-%mem | head

# PM2 메모리 제한 설정
pm2 start app.js --max-memory-restart 1G

# 불필요한 프로세스 정리
pm2 delete unused-app
```

### 4. 디스크 공간 부족
```bash
# 디스크 사용량 확인
df -h
du -sh /var/lib/codeb/*

# 로그 정리
pm2 flush
find /opt/codeb/logs -name "*.log" -mtime +7 -delete

# Docker 이미지 정리 (사용 시)
docker system prune -a
```

### 5. 네트워크 문제
```bash
# 방화벽 확인
ufw status
iptables -L

# 포트 열기
ufw allow 3000/tcp
ufw allow 3007/tcp

# DNS 확인
nslookup myapp.one-q.xyz
dig myapp.one-q.xyz
```

---

## 보안 설정

### 방화벽 규칙
```bash
# 필수 포트만 열기
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3000/tcp  # CodeB Server
ufw allow 3007/tcp  # API Server
ufw enable
```

### SSH 보안
```bash
# SSH 키 인증만 허용
nano /etc/ssh/sshd_config
# PasswordAuthentication no
# PermitRootLogin prohibit-password

systemctl restart sshd
```

### 환경 변수 보안
```bash
# .env 파일 권한 설정
chmod 600 /opt/codeb/codeb-remix/.env

# 민감한 정보는 환경 변수로
export JWT_SECRET="your-secret-key"
export DB_PASSWORD="secure-password"
```

---

## 연락처 및 지원

- **서버 IP**: 141.164.60.51
- **도메인**: one-q.xyz
- **관리자**: root
- **프로젝트 위치**: /opt/codeb, /var/lib/codeb

### 주요 명령어 요약
```bash
# 서비스 재시작
pm2 restart codeb-server
pm2 restart final-api

# 로그 확인
pm2 logs --lines 100

# 상태 확인
pm2 list
netstat -tlnp

# 백업
pg_dump -U codeb codeb > backup.sql
```

---

*마지막 업데이트: 2025-08-19*