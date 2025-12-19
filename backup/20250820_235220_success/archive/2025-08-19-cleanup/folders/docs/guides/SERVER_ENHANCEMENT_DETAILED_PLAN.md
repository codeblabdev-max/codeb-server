# 📚 서버 1 강화 상세 계획

## 1. 💾 Vultr Block Storage (월 $10)

### 개요
- **용량**: 100GB
- **타입**: SSD 블록 스토리지
- **위치**: 서버와 동일한 데이터센터 (Seoul)
- **성능**: 3000 IOPS 보장

### 용도
```
/mnt/blockstorage/
├── backups/          # 40GB - 데이터베이스 백업
│   ├── daily/
│   ├── weekly/
│   └── monthly/
├── docker-volumes/   # 30GB - Docker 볼륨 백업
├── logs/            # 10GB - 로그 아카이브
└── snapshots/       # 20GB - 시스템 스냅샷
```

### 설정 방법
```bash
# 1. Vultr 콘솔에서 Block Storage 생성
# 2. 서버에 연결
mkdir -p /mnt/blockstorage
mount /dev/vdb /mnt/blockstorage

# 3. 자동 마운트 설정
echo '/dev/vdb /mnt/blockstorage ext4 defaults,nofail 0 0' >> /etc/fstab

# 4. 백업 디렉토리 구성
mkdir -p /mnt/blockstorage/{backups,docker-volumes,logs,snapshots}
mkdir -p /mnt/blockstorage/backups/{daily,weekly,monthly}
```

### 자동 백업 스크립트
```bash
#!/bin/bash
# /usr/local/bin/auto-backup.sh

BACKUP_DIR="/mnt/blockstorage/backups/daily"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# PostgreSQL 백업
for container in $(docker ps --format '{{.Names}}' | grep postgres); do
    docker exec $container pg_dumpall -U postgres | \
    gzip > $BACKUP_DIR/postgres_${container}_${DATE}.sql.gz
done

# Docker 볼륨 백업
docker run --rm \
    -v /var/lib/docker/volumes:/source:ro \
    -v $BACKUP_DIR:/backup \
    alpine tar czf /backup/docker_volumes_${DATE}.tar.gz /source

# Coolify 설정 백업
tar czf $BACKUP_DIR/coolify_config_${DATE}.tar.gz \
    /root/coolify/.env \
    /root/coolify/docker-compose.yml

# 오래된 백업 삭제
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

# 주간 백업 (일요일)
if [ $(date +%u) -eq 7 ]; then
    cp $BACKUP_DIR/*_${DATE}.* /mnt/blockstorage/backups/weekly/
fi

# 월간 백업 (1일)
if [ $(date +%d) -eq 01 ]; then
    cp $BACKUP_DIR/*_${DATE}.* /mnt/blockstorage/backups/monthly/
fi
```

### Cron 설정
```bash
# 매일 새벽 3시 백업
0 3 * * * /usr/local/bin/auto-backup.sh

# 매주 일요일 정리
0 4 * * 0 find /mnt/blockstorage/backups/weekly -mtime +30 -delete

# 매월 1일 정리
0 5 1 * * find /mnt/blockstorage/backups/monthly -mtime +180 -delete
```

---

## 2. 🌩️ Backblaze B2 (월 $5)

### 개요
- **무료 용량**: 10GB
- **추가 비용**: $0.005/GB/월
- **다운로드**: $0.01/GB
- **API**: S3 호환

### 장점
- ✅ Amazon S3보다 80% 저렴
- ✅ S3 API 호환 (rclone, restic 등 사용 가능)
- ✅ 무제한 확장 가능
- ✅ 버전 관리 지원

### 설정 방법

#### 1. B2 계정 설정
```bash
# 1. Backblaze B2 가입 (무료)
# 2. 버킷 생성: coolify-backup
# 3. Application Key 생성
```

#### 2. rclone 설치 및 설정
```bash
# rclone 설치
curl https://rclone.org/install.sh | sudo bash

# rclone 설정
rclone config

# 설정 내용
# n) New remote
# name> b2
# Storage> b2
# account> [Application Key ID]
# key> [Application Key]
# bucket> coolify-backup
```

#### 3. 자동 백업 스크립트
```bash
#!/bin/bash
# /usr/local/bin/b2-backup.sh

# 중요 데이터만 B2로 백업 (비용 절감)
BACKUP_DIR="/mnt/blockstorage/backups/daily"
DATE=$(date +%Y%m%d)

# 최신 데이터베이스 백업만 업로드
rclone copy $BACKUP_DIR/postgres_*_${DATE}*.gz b2:coolify-backup/database/

# 중요 설정 파일 백업
rclone copy $BACKUP_DIR/coolify_config_${DATE}*.tar.gz b2:coolify-backup/configs/

# 30일 이상 된 백업 삭제 (비용 절감)
rclone delete --min-age 30d b2:coolify-backup/

# 백업 목록 확인
echo "=== B2 백업 현황 ===" > /var/log/b2-backup.log
rclone ls b2:coolify-backup/ >> /var/log/b2-backup.log
```

### 복구 방법
```bash
# 특정 날짜 백업 다운로드
rclone copy b2:coolify-backup/database/postgres_20250815.sql.gz /tmp/

# 전체 백업 다운로드
rclone sync b2:coolify-backup/ /mnt/recovery/
```

---

## 3. 📊 모니터링 시스템 (무료)

### A. Netdata (실시간 모니터링)

#### 개요
- **리소스 사용**: CPU 1-2%, RAM 40-60MB
- **데이터 저장**: 1시간 (RAM), 확장 가능
- **대시보드**: 웹 기반, 모바일 친화적
- **알림**: 이메일, Slack, Discord 지원

#### 설치
```bash
# 한 줄 설치
bash <(curl -Ss https://get.netdata.cloud/kickstart.sh)

# 설치 확인
systemctl status netdata

# 웹 접속: http://서버IP:19999
```

#### 설정 (/etc/netdata/netdata.conf)
```ini
[global]
    # 메모리 사용 최적화
    page cache size = 32
    dbengine multihost disk space = 256
    
    # 1일 데이터 보관
    history = 86400
    
    # 접근 제한
    bind to = 127.0.0.1
    allow connections from = localhost 10.* 192.168.*
```

#### Docker 모니터링 추가
```bash
# Docker 플러그인 활성화
cd /etc/netdata
sudo ./edit-config go.d/docker.conf

# 설정 추가
jobs:
  - name: local
    url: unix:///var/run/docker.sock
```

#### Slack 알림 설정
```bash
# 알림 설정
cd /etc/netdata
sudo ./edit-config health_alarm_notify.conf

# Slack webhook 추가
SEND_SLACK="YES"
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
DEFAULT_RECIPIENT_SLACK="#alerts"
```

### B. Uptime Kuma (서비스 모니터링)

#### 개요
- **리소스 사용**: CPU <1%, RAM 100MB
- **기능**: HTTP/HTTPS, TCP, Ping, DNS 모니터링
- **알림**: 50+ 알림 채널 지원
- **UI**: 깔끔한 한국어 지원

#### Docker 설치
```bash
# Docker Compose 설정
cat > /root/uptime-kuma/docker-compose.yml << EOF
version: '3.8'

services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    ports:
      - "3001:3001"
    restart: always
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.uptime.rule=Host(\`status.yourdomain.com\`)"
      - "traefik.http.routers.uptime.tls=true"
      - "traefik.http.routers.uptime.tls.certresolver=letsencrypt"
EOF

# 실행
cd /root/uptime-kuma
docker-compose up -d
```

#### 모니터링 설정 예시
```yaml
모니터링 대상:
  - Coolify 관리 패널: https://서버IP:8000
  - Traefik 대시보드: http://서버IP:8080
  - PostgreSQL: tcp://서버IP:5432
  - Redis: tcp://서버IP:6379
  - 각 애플리케이션 URL

알림 설정:
  - Telegram: 즉시 알림
  - Email: 5분 후 알림
  - Slack: 팀 채널 알림
```

---

## 4. 🔒 보안 강화 (무료)

### A. Fail2ban (무차별 공격 방어)

#### 개요
- **기능**: IP 기반 자동 차단
- **보호 대상**: SSH, HTTP, Docker
- **차단 시간**: 설정 가능 (기본 10분)

#### 설치 및 설정
```bash
# 설치
apt update && apt install fail2ban -y

# 설정 파일 생성
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

#### SSH 보호 (/etc/fail2ban/jail.local)
```ini
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
findtime = 300
bantime = 3600
ignoreip = 127.0.0.1/8 10.0.0.0/8
```

#### Docker/Traefik 보호
```ini
[traefik]
enabled = true
port = http,https
filter = traefik-auth
logpath = /var/log/traefik/access.log
maxretry = 5
findtime = 300
bantime = 3600

[docker]
enabled = true
filter = docker-unauthorized
logpath = /var/log/docker.log
maxretry = 3
findtime = 300
bantime = 7200
```

#### 필터 생성 (/etc/fail2ban/filter.d/traefik-auth.conf)
```ini
[Definition]
failregex = ^<HOST> .* 401 .*$
            ^<HOST> .* 403 .*$
ignoreregex =
```

### B. CrowdSec (협업 보안)

#### 개요
- **기능**: 크라우드 소싱 위협 정보
- **장점**: 전 세계 공격 패턴 공유
- **리소스**: CPU <1%, RAM 50MB

#### 설치
```bash
# 설치 스크립트
curl -s https://install.crowdsec.net | sudo sh

# 서비스 시작
systemctl start crowdsec
systemctl enable crowdsec

# 바운서 설치 (iptables)
sudo apt install crowdsec-firewall-bouncer-iptables

# Docker 컬렉션 설치
sudo cscli collections install crowdsecurity/docker
sudo cscli collections install crowdsecurity/traefik
```

#### 대시보드 설정
```bash
# 로컬 API 키 생성
sudo cscli bouncers add firewall-bouncer

# 메트릭 확인
sudo cscli metrics

# 차단 목록 확인
sudo cscli decisions list
```

---

## 💰 월별 비용 분석

### 기본 비용
| 항목 | 비용 | 설명 |
|------|------|------|
| Vultr Block Storage | $10/월 | 100GB SSD |
| Backblaze B2 | $0-5/월 | 10GB 무료, 이후 GB당 $0.005 |
| Netdata Cloud | $0 | 무료 (5 노드까지) |
| Uptime Kuma | $0 | 자체 호스팅 |
| Fail2ban | $0 | 오픈소스 |
| CrowdSec | $0 | 커뮤니티 버전 |
| **합계** | **$10-15/월** | |

### 데이터 전송 비용 (B2)
- 업로드: 무료
- 다운로드: $0.01/GB (복구 시에만)
- 일반적으로 월 1GB 미만 = $0.01

---

## 🚀 구현 우선순위

### Phase 1: 즉시 (1일)
1. Vultr Block Storage 추가
2. 자동 백업 스크립트 설정
3. Fail2ban 설치

### Phase 2: 중요 (1주일)
1. Backblaze B2 설정
2. Netdata 설치
3. Uptime Kuma 배포

### Phase 3: 권장 (2주일)
1. CrowdSec 설치
2. 알림 채널 통합
3. 대시보드 커스터마이징

---

## 📊 ROI (투자 대비 효과)

### 투자
- **비용**: 월 $15 추가
- **시간**: 설정 4-8시간

### 효과
- ✅ **데이터 보호**: 100% 백업 커버리지
- ✅ **가동률 향상**: 99.9% 목표
- ✅ **보안 강화**: 공격 90% 자동 차단
- ✅ **운영 효율**: 문제 감지 시간 90% 단축
- ✅ **복구 시간**: 30분 이내 복구 가능

### 계산
- 데이터 손실 방지 가치: $1000+
- 다운타임 1시간 손실: $100-500
- 보안 사고 예방: $5000+
- **월 $15로 연간 $10,000+ 가치 보호**