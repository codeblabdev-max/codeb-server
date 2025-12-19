# CodeB 서버 운영 가이드
> 운영자를 위한 실무 매뉴얼 | 2025-08-25

## 🎯 목차

1. [일일 운영 체크리스트](#일일-운영-체크리스트)
2. [서비스 관리](#서비스-관리)
3. [프로젝트 관리](#프로젝트-관리)
4. [문제 해결](#문제-해결)
5. [백업 및 복구](#백업-및-복구)
6. [모니터링](#모니터링)
7. [보안 관리](#보안-관리)
8. [비상 대응](#비상-대응)

---

## 📋 일일 운영 체크리스트

### 오전 점검 (09:00)
```bash
# 1. 서버 접속
ssh root@141.164.60.51

# 2. 시스템 상태 확인
df -h                    # 디스크 사용량
free -h                  # 메모리 사용량
uptime                   # 서버 가동시간

# 3. 서비스 상태 확인
pm2 list                 # PM2 프로세스
podman ps               # 실행중인 컨테이너
curl localhost:3008/api/health  # API 헬스체크

# 4. 로그 확인
tail -100 /mnt/blockstorage/logs/api-server.log
pm2 logs --lines 50
```

### 오후 점검 (18:00)
```bash
# 1. 프로젝트 상태 확인
./codeb-cli-v2.sh list

# 2. 리소스 사용량 체크
htop                     # CPU/메모리 실시간
netstat -tlnp | grep LISTEN  # 포트 사용 현황

# 3. 백업 확인
ls -lah /mnt/blockstorage/backups/
```

---

## 🔧 서비스 관리

### PM2 프로세스 관리

#### 상태 확인
```bash
# 전체 목록
pm2 list

# 상세 정보
pm2 show codeb-api

# 로그 확인
pm2 logs codeb-api --lines 100
```

#### 프로세스 제어
```bash
# 재시작
pm2 restart codeb-api

# 중지
pm2 stop codeb-api

# 시작
pm2 start codeb-api

# 삭제 (중지된 프로세스)
pm2 delete codeb-app  # errored 상태 정리
```

#### PM2 저장 및 자동시작
```bash
# 현재 프로세스 목록 저장
pm2 save

# 부팅시 자동시작 설정
pm2 startup

# 저장된 프로세스 복원
pm2 resurrect
```

### Systemd 서비스 관리

#### 현재 문제 해결
```bash
# codeb-api-server.service 재시작 루프 해결
systemctl stop codeb-api-server
systemctl disable codeb-api-server

# PM2만 사용하도록 정리
pm2 start /root/codeb-api-server.js --name codeb-api
pm2 save
```

### Podman 컨테이너 관리

#### 컨테이너 조회
```bash
# 실행중인 컨테이너
podman ps

# 모든 컨테이너 (중지 포함)
podman ps -a

# 컨테이너 상세 정보
podman inspect <container-name>
```

#### 컨테이너 제어
```bash
# 재시작
podman restart test-nextjs-app

# 로그 확인
podman logs -f test-nextjs-app --tail 50

# 컨테이너 진입
podman exec -it test-nextjs-app /bin/bash
```

---

## 📦 프로젝트 관리

### 새 프로젝트 배포

#### 1. Git 저장소에서 배포
```bash
# Next.js 프로젝트
./codeb-cli-v2.sh create my-nextjs-app
./codeb-cli-v2.sh deploy my-nextjs-app \
  --git https://github.com/user/nextjs-app \
  --port 4004

# Node.js API
./codeb-cli-v2.sh create my-api
./codeb-cli-v2.sh deploy my-api \
  --git https://github.com/user/node-api \
  --port 4005 \
  --type node
```

#### 2. 데이터베이스 추가
```bash
# PostgreSQL 추가
./codeb-cli-v2.sh db:create my-app --type postgres

# Redis 추가
./codeb-cli-v2.sh db:create my-app --type redis

# 연결 정보 확인
./codeb-cli-v2.sh env:get my-app DATABASE_URL
```

#### 3. 환경변수 설정
```bash
# .env 파일 생성
cat > my-app.env << EOF
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-secret-key
EOF

# 환경변수 적용
./codeb-cli-v2.sh env:set my-app --file my-app.env
```

### 프로젝트 유지보수

#### 업데이트 배포
```bash
# 최신 코드 풀 & 재배포
./codeb-cli-v2.sh deploy my-app --update

# 특정 브랜치/태그 배포
./codeb-cli-v2.sh deploy my-app --branch feature/new-ui
./codeb-cli-v2.sh deploy my-app --tag v2.0.0
```

#### 롤백
```bash
# 이전 버전으로 롤백
./codeb-cli-v2.sh rollback my-app

# 특정 버전으로 롤백
./codeb-cli-v2.sh rollback my-app --version 20250824-1530
```

#### 프로젝트 삭제
```bash
# 백업 후 삭제
./codeb-cli-v2.sh db:backup my-app
./codeb-cli-v2.sh delete my-app --confirm

# 강제 삭제 (백업 없이)
./codeb-cli-v2.sh delete my-app --force
```

---

## 🔍 문제 해결

### 일반적인 문제

#### 1. API 서버 응답 없음
```bash
# PM2 상태 확인
pm2 show codeb-api

# 프로세스 재시작
pm2 restart codeb-api

# 로그 확인
pm2 logs codeb-api --err --lines 100

# 포트 점유 확인
lsof -i :3008
```

#### 2. 컨테이너 시작 실패
```bash
# 로그 확인
podman logs <container-name>

# 이미지 재빌드
podman build -t my-app:latest .

# 네트워크 확인
podman network ls
podman network inspect podman

# 컨테이너 강제 삭제 후 재생성
podman rm -f <container-name>
```

#### 3. 디스크 공간 부족
```bash
# 사용량 확인
df -h
du -sh /mnt/blockstorage/*

# Docker 이미지 정리
podman image prune -a

# 오래된 로그 삭제
find /mnt/blockstorage/logs -name "*.log" -mtime +30 -delete

# 오래된 백업 삭제
find /mnt/blockstorage/backups -name "*.tar.gz" -mtime +60 -delete
```

#### 4. 메모리 부족
```bash
# 메모리 사용 TOP 프로세스
ps aux --sort=-%mem | head -10

# PM2 메모리 제한 설정
pm2 start app.js --max-memory-restart 500M

# 스왑 확인
swapon --show
free -h
```

### 디버깅 도구

#### 네트워크 디버깅
```bash
# 포트 스캔
nmap localhost -p 3000-5000

# 연결 테스트
curl -v http://localhost:4001

# DNS 확인
dig one-q.xyz
nslookup test-app.one-q.xyz
```

#### 프로세스 디버깅
```bash
# 프로세스 추적
strace -p <pid>

# 파일 디스크립터 확인
lsof -p <pid>

# 시스템 콜 모니터링
dmesg -T | tail -50
```

---

## 💾 백업 및 복구

### 자동 백업 설정

#### 백업 스크립트 생성
```bash
cat > /root/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/mnt/blockstorage/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 프로젝트 파일 백업
tar -czf $BACKUP_DIR/projects_$DATE.tar.gz /mnt/blockstorage/projects/

# 데이터베이스 백업
for container in $(podman ps --format "{{.Names}}" | grep postgres); do
  podman exec $container pg_dumpall -U postgres > $BACKUP_DIR/${container}_$DATE.sql
done

# PM2 설정 백업
pm2 save
cp ~/.pm2/dump.pm2 $BACKUP_DIR/pm2_$DATE.json

# 오래된 백업 삭제 (30일 이상)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /root/backup.sh
```

#### Cron 설정
```bash
# Crontab 편집
crontab -e

# 매일 새벽 2시 백업
0 2 * * * /root/backup.sh >> /mnt/blockstorage/logs/backup.log 2>&1
```

### 수동 백업

#### 전체 백업
```bash
# 시스템 전체 백업
tar -czf /mnt/blockstorage/backups/full_backup_$(date +%Y%m%d).tar.gz \
  --exclude=/mnt/blockstorage/backups \
  /root /etc /mnt/blockstorage
```

#### 프로젝트별 백업
```bash
# 특정 프로젝트 백업
PROJECT="my-app"
DATE=$(date +%Y%m%d_%H%M%S)

# 파일 백업
tar -czf /mnt/blockstorage/backups/${PROJECT}_files_$DATE.tar.gz \
  /mnt/blockstorage/projects/$PROJECT

# 데이터베이스 백업
podman exec ${PROJECT}-postgres pg_dumpall -U postgres > \
  /mnt/blockstorage/backups/${PROJECT}_db_$DATE.sql
```

### 복구 절차

#### 프로젝트 복구
```bash
# 1. 백업 파일 확인
ls -lah /mnt/blockstorage/backups/

# 2. 파일 복구
tar -xzf /mnt/blockstorage/backups/my-app_files_20250825.tar.gz \
  -C /

# 3. 데이터베이스 복구
podman exec -i my-app-postgres psql -U postgres < \
  /mnt/blockstorage/backups/my-app_db_20250825.sql

# 4. 서비스 재시작
./codeb-cli-v2.sh restart my-app
```

---

## 📊 모니터링

### 실시간 모니터링

#### 시스템 모니터링
```bash
# CPU/메모리 실시간
htop

# 네트워크 모니터링
iftop

# 디스크 I/O
iotop

# 전체 시스템 상태
glances
```

#### 로그 모니터링
```bash
# API 서버 로그 실시간
tail -f /mnt/blockstorage/logs/api-server.log

# PM2 로그 실시간
pm2 logs --raw

# 시스템 로그
journalctl -f

# 특정 서비스 로그
journalctl -u ssh -f
```

### 알림 설정

#### 디스크 사용량 알림
```bash
cat > /root/check_disk.sh << 'EOF'
#!/bin/bash

THRESHOLD=80
USAGE=$(df /mnt/blockstorage | grep -vE '^Filesystem' | awk '{print $5}' | cut -d'%' -f1)

if [ $USAGE -gt $THRESHOLD ]; then
  echo "Warning: Disk usage is ${USAGE}%" | mail -s "Disk Alert" admin@example.com
fi
EOF

chmod +x /root/check_disk.sh

# Cron에 추가 (매시간 체크)
echo "0 * * * * /root/check_disk.sh" | crontab -
```

---

## 🔒 보안 관리

### SSH 보안

#### SSH 키 관리
```bash
# 새 SSH 키 추가
echo "ssh-rsa AAAAB3... user@host" >> ~/.ssh/authorized_keys

# 권한 설정
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

#### Fail2ban 설정
```bash
# 상태 확인
fail2ban-client status sshd

# 차단 IP 목록
fail2ban-client status sshd | grep "Banned IP"

# IP 차단 해제
fail2ban-client set sshd unbanip <IP>
```

### 방화벽 관리

#### UFW 규칙
```bash
# 현재 규칙
ufw status numbered

# 포트 열기
ufw allow 4006/tcp comment "New Project"

# 포트 닫기
ufw delete allow 4006/tcp

# 특정 IP만 허용
ufw allow from 192.168.1.100 to any port 3008
```

### API 보안

#### API 키 재생성
```bash
# 새 API 키 생성
openssl rand -hex 32 > /root/codeb-admin-key-new.txt

# API 서버 설정 업데이트
vi /root/codeb-api-server.js
# API_KEY 변경

# 서비스 재시작
pm2 restart codeb-api
```

---

## 🚨 비상 대응

### 서버 다운

#### 1. 상태 확인
```bash
# 로컬에서
ping 141.164.60.51
ssh root@141.164.60.51

# Vultr 콘솔 접속
# https://my.vultr.com/
```

#### 2. 서비스 복구
```bash
# SSH 접속 성공시
systemctl restart sshd
pm2 resurrect
podman start --all
```

#### 3. 하드 리부팅
```bash
# Vultr API로 재부팅
curl -X POST "https://api.vultr.com/v2/instances/reboot" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instance_ids": ["0c099e4d-29f0-4c54-b60f-4cdd375ac2d4"]}'
```

### 데이터 손실

#### 복구 우선순위
1. `/mnt/blockstorage/projects.json` - 프로젝트 메타데이터
2. `/mnt/blockstorage/projects/` - 프로젝트 소스코드
3. PostgreSQL 데이터
4. Redis 데이터

#### 스냅샷에서 복구
```bash
# Vultr 스냅샷 목록
vultr-cli snapshot list

# 스냅샷에서 서버 생성
vultr-cli instance create \
  --region icn \
  --plan vc2-2c-16gb \
  --snapshot <snapshot-id>
```

### 보안 침해

#### 즉시 조치
```bash
# 1. 네트워크 차단
ufw default deny incoming
ufw reload

# 2. 로그 보존
tar -czf /tmp/security_logs_$(date +%Y%m%d).tar.gz \
  /var/log/auth.log \
  /var/log/syslog \
  /mnt/blockstorage/logs/

# 3. 프로세스 확인
ps aux | grep -v "grep\|ps\|bash"
netstat -tulpn

# 4. 비정상 파일 확인
find / -mtime -1 -type f -exec ls -la {} \;
```

---

## 📈 성능 최적화

### PM2 최적화
```bash
# 클러스터 모드 활성화
pm2 start app.js -i max

# 메모리 제한
pm2 start app.js --max-memory-restart 1G

# 로그 로테이션
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### Podman 최적화
```bash
# 메모리/CPU 제한
podman run -d \
  --name my-app \
  --memory="512m" \
  --cpus="0.5" \
  my-app:latest

# 불필요한 이미지 정리
podman image prune -a --force
```

### 시스템 최적화
```bash
# 스왑 최적화
echo "vm.swappiness=10" >> /etc/sysctl.conf
sysctl -p

# 파일 디스크립터 제한 증가
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf
```

---

## 📝 체크리스트

### 주간 작업
- [ ] 전체 백업 실행
- [ ] 로그 파일 정리
- [ ] 보안 업데이트 확인
- [ ] 디스크 사용량 점검
- [ ] PM2 프로세스 정리

### 월간 작업
- [ ] 서버 재부팅
- [ ] 스냅샷 생성
- [ ] 성능 분석
- [ ] 보안 감사
- [ ] 비용 검토

---

*이 가이드는 실제 운영 경험을 바탕으로 작성되었습니다.*
*최종 업데이트: 2025-08-25*
*서버: 141.164.60.51 | API: 3008 | 도메인: one-q.xyz*