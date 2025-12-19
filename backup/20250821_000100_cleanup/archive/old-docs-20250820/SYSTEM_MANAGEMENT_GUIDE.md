# 📚 CodeB 시스템 관리 가이드

> **서버 정보**: 141.164.60.51  
> **최종 업데이트**: 2025-08-19  
> **새 관리자 API 키**: `cb_dYvT1DTSJ1y8EpnNJLD7CDqs33adtbukawsxwx4sEso`

## 🎯 빠른 시작

### 서버 접속
```bash
ssh root@141.164.60.51
```

### CodeB 서버 상태 확인
```bash
# 프로세스 확인
ps aux | grep remix-serve

# API 연결 테스트  
curl -H "X-API-Key: cb_dYvT1DTSJ1y8EpnNJLD7CDqs33adtbukawsxwx4sEso" http://localhost:3000/api/projects
```

---

## 🏗️ 시스템 아키텍처

### 핵심 컴포넌트
```
CodeB 시스템 구조:
├── 🌐 DNS/네트워크
│   ├── BIND9 (n1.one-q.xyz, n2.one-q.xyz)
│   ├── Caddy (리버스 프록시, SSL)
│   └── 방화벽 (UFW)
├── 🚀 CodeB 애플리케이션  
│   ├── Remix 웹서버 (포트 3000)
│   ├── 데이터베이스 (JSON 파일)
│   └── API 키 인증 시스템
├── 🐳 컨테이너 시스템
│   ├── Podman (컨테이너 런타임)
│   ├── codeb-network (전용 네트워크)
│   └── 프로젝트별 격리된 컨테이너
└── 📁 스토리지 구조
    ├── /opt/codeb/ (애플리케이션)
    ├── /var/lib/codeb/ (데이터)
    └── /var/log/codeb/ (로그)
```

### 주요 디렉토리 구조
```
/opt/codeb/
├── codeb-remix/           # 웹 서버
│   ├── build/server/      # 빌드된 서버
│   ├── server.mjs         # ES 모듈 래퍼
│   └── .env              # 환경 변수
└── ecosystem.config.js    # PM2 설정

/var/lib/codeb/
├── database.json          # 메인 데이터베이스
├── repositories/          # Git 저장소
├── projects/             # 프로젝트별 데이터
│   └── {project-name}/
│       ├── config/       # 설정 파일
│       ├── data/         # 데이터베이스 백업
│       ├── logs/         # 프로젝트 로그  
│       └── storage/      # 파일 저장소
└── templates/            # 템플릿 스크립트
    ├── postgresql/
    ├── redis/
    └── create-project-resources.sh
```

---

## 🔧 서버 관리

### CodeB 서버 관리
```bash
# 서버 시작
cd /opt/codeb/codeb-remix
npm start &

# 서버 중지
killall node

# 서버 상태 확인
ps aux | grep remix-serve
netstat -tlnp | grep :3000

# 로그 확인
tail -f /var/log/codeb/pm2-*.log
```

### 주요 서비스 관리
```bash
# DNS 서버 (BIND9)
systemctl start/stop/restart named
systemctl status named

# 웹 서버 (Caddy)  
systemctl start/stop/restart caddy
systemctl status caddy

# 방화벽 상태
ufw status
```

---

## 🐳 프로젝트 컨테이너 관리

### 새 프로젝트 생성
```bash
# 기본 사용법 (PostgreSQL + Redis 포함)
/var/lib/codeb/templates/create-project-resources.sh <project-name> [project-type] [enable-postgres] [enable-redis]

# 예제
/var/lib/codeb/templates/create-project-resources.sh myapp nodejs true true
/var/lib/codeb/templates/create-project-resources.sh webapp php true false
```

### 생성되는 리소스
- **PostgreSQL 컨테이너**: `codeb-postgres-{project-name}`
- **Redis 컨테이너**: `codeb-redis-{project-name}`  
- **프로젝트 디렉토리**: `/var/lib/codeb/projects/{project-name}/`
- **환경 변수 파일**: `config/app.env`
- **데이터베이스 비밀번호**: `config/postgres_password`
- **Redis 비밀번호**: `config/redis_password`

### 컨테이너 관리 명령어
```bash
# 모든 컨테이너 확인
podman ps -a

# 프로젝트 컨테이너만 확인  
podman ps --filter "name=codeb-*"

# 특정 프로젝트 컨테이너 중지
podman stop codeb-postgres-myapp codeb-redis-myapp

# 특정 프로젝트 컨테이너 시작
podman start codeb-postgres-myapp codeb-redis-myapp

# 프로젝트 완전 삭제
podman rm -f codeb-postgres-myapp codeb-redis-myapp
podman volume rm codeb-postgres-myapp-data codeb-redis-myapp-data
rm -rf /var/lib/codeb/projects/myapp
```

---

## 🔑 API 키 관리

### 현재 활성 API 키
- **관리자 키**: `cb_dYvT1DTSJ1y8EpnNJLD7CDqs33adtbukawsxwx4sEso`
- **저장 위치**: `/root/codeb-admin-key-new.txt`

### API 키 작업
```bash
# 데이터베이스에서 API 키 목록 확인
cat /var/lib/codeb/database.json | jq '.apiKeys'

# 새 API 키 생성 (Node.js 스크립트)
cd /opt/codeb/codeb-remix
node -e "
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');

const rawKey = 'cb_' + crypto.randomBytes(32).toString('base64url');
const keyHash = bcrypt.hashSync(rawKey.replace('cb_', ''), 10);

const db = JSON.parse(fs.readFileSync('/var/lib/codeb/database.json', 'utf8'));
db.apiKeys.push({
  id: crypto.randomUUID(),
  name: 'New Admin Key',
  key_hash: keyHash,
  permissions: 'admin',
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

fs.writeFileSync('/var/lib/codeb/database.json', JSON.stringify(db, null, 2));
console.log('새 API 키:', rawKey);
"

# API 키 테스트
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:3000/api/projects
```

---

## 🌐 네트워크 및 도메인

### DNS 서버 관리
```bash
# DNS 설정 확인
dig @127.0.0.1 one-q.xyz NS
dig @127.0.0.1 codeb.one-q.xyz A

# DNS 존 파일 편집
nano /etc/bind/db.one-q.xyz

# DNS 설정 검증 및 재시작
named-checkzone one-q.xyz /etc/bind/db.one-q.xyz
systemctl restart named
```

### 방화벽 관리
```bash
# 현재 방화벽 규칙 확인
ufw status

# 포트 열기
ufw allow 3000/tcp    # CodeB API
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw allow 53/tcp      # DNS
ufw allow 53/udp      # DNS
```

---

## 📊 모니터링 및 로그

### 시스템 상태 모니터링
```bash
# 디스크 사용량
df -h

# 메모리 사용량
free -h  

# CPU 사용량
top

# 컨테이너 리소스 사용량
podman stats

# 활성 연결 확인
netstat -tulnp | grep -E ":80|:443|:3000|:53"
```

### 로그 확인
```bash
# CodeB 서버 로그
tail -f /var/log/codeb/pm2-*.log

# DNS 서버 로그  
tail -f /var/log/syslog | grep named

# Caddy 로그
tail -f /var/log/codeb/caddy-*.log

# 시스템 로그
journalctl -f -u named -u caddy
```

---

## 🔄 백업 및 복원

### 데이터 백업
```bash
# CodeB 데이터베이스 백업
cp /var/lib/codeb/database.json /var/lib/codeb/database.backup.$(date +%Y%m%d_%H%M%S).json

# 프로젝트 데이터 백업
tar -czf /var/lib/codeb/projects_backup_$(date +%Y%m%d).tar.gz /var/lib/codeb/projects/

# 시스템 설정 백업
mkdir -p /root/codeb-backup
cp -r /opt/codeb/codeb-remix/.env /root/codeb-backup/
cp -r /etc/bind/db.one-q.xyz /root/codeb-backup/
cp -r /etc/caddy/Caddyfile /root/codeb-backup/
```

### 복원
```bash
# 데이터베이스 복원
cp /var/lib/codeb/database.backup.TIMESTAMP.json /var/lib/codeb/database.json

# CodeB 서버 재시작 (복원 후)
killall node
cd /opt/codeb/codeb-remix && npm start &
```

---

## 🚨 문제 해결

### 일반적인 문제들

#### CodeB 서버가 시작되지 않음
```bash
# 1. 프로세스 확인
ps aux | grep remix-serve

# 2. 포트 사용 확인  
lsof -i :3000

# 3. 수동 시작으로 오류 확인
cd /opt/codeb/codeb-remix
npm start

# 4. 환경 변수 확인
cat /opt/codeb/codeb-remix/.env
```

#### API 키 인증 실패
```bash
# 1. 데이터베이스 상태 확인
cat /var/lib/codeb/database.json | jq '.apiKeys'

# 2. 서버 재시작
killall node
cd /opt/codeb/codeb-remix && npm start &

# 3. 새 API 키 생성 (위의 API 키 관리 섹션 참조)
```

#### 컨테이너 생성 실패
```bash
# 1. Podman 상태 확인
podman version
podman ps -a

# 2. 네트워크 확인
podman network ls

# 3. 이미지 확인
podman images | grep -E "postgres|redis"

# 4. 로그 확인  
podman logs <container-name>
```

#### DNS 해결 실패
```bash
# 1. DNS 서비스 상태
systemctl status named

# 2. DNS 설정 검증
named-checkconf
named-checkzone one-q.xyz /etc/bind/db.one-q.xyz

# 3. DNS 쿼리 테스트
dig @127.0.0.1 one-q.xyz NS
nslookup codeb.one-q.xyz 127.0.0.1
```

---

## 📝 유용한 스크립트

### 1. 시스템 전체 상태 확인
```bash
#!/bin/bash
# /usr/local/bin/codeb-status

echo "=== CodeB 시스템 상태 ==="
echo "날짜: $(date)"
echo

echo "🚀 CodeB 서버:"
ps aux | grep remix-serve | grep -v grep || echo "❌ 서버 중지됨"

echo
echo "🐳 컨테이너 상태:"  
podman ps --format "table {{.Names}} {{.Status}}" | grep codeb

echo
echo "🌐 네트워크 포트:"
netstat -tlnp | grep -E ":80|:443|:3000|:53"

echo  
echo "💾 디스크 사용량:"
df -h | grep -E "/$|/var|/opt"

echo
echo "🔧 핵심 서비스:"
systemctl is-active named caddy
```

### 2. 프로젝트 정리 스크립트
```bash
#!/bin/bash  
# /usr/local/bin/codeb-cleanup

PROJECT_NAME=$1
if [ -z "$PROJECT_NAME" ]; then
    echo "사용법: $0 <project-name>"
    exit 1
fi

echo "🗑️ 프로젝트 '$PROJECT_NAME' 정리 중..."

# 컨테이너 중지 및 삭제
podman rm -f codeb-postgres-$PROJECT_NAME codeb-redis-$PROJECT_NAME

# 볼륨 삭제
podman volume rm codeb-postgres-$PROJECT_NAME-data codeb-redis-$PROJECT_NAME-data

# 프로젝트 디렉토리 삭제
rm -rf /var/lib/codeb/projects/$PROJECT_NAME

echo "✅ 프로젝트 '$PROJECT_NAME' 정리 완료!"
```

---

## 📞 지원 정보

### 중요 파일 위치
- **메인 설정**: `/opt/codeb/codeb-remix/.env`
- **데이터베이스**: `/var/lib/codeb/database.json`  
- **API 키**: `/root/codeb-admin-key-new.txt`
- **DNS 설정**: `/etc/bind/db.one-q.xyz`
- **Caddy 설정**: `/etc/caddy/Caddyfile`

### 포트 정보
- **3000**: CodeB API 서버
- **80/443**: Caddy 웹 서버 
- **53**: DNS 서버
- **5432**: PostgreSQL (컨테이너 내부)
- **6379**: Redis (컨테이너 내부)

### 서비스 URL
- **API**: `http://141.164.60.51:3000/api/`
- **DNS**: `n1.one-q.xyz`, `n2.one-q.xyz`
- **도메인**: `codeb.one-q.xyz` (설정 완료, 등록 대기)

---

*최종 업데이트: 2025-08-19 - 완전한 컨테이너 템플릿 시스템 구축 완료*