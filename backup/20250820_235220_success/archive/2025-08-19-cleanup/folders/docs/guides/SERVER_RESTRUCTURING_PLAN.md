# 🚀 서버 재구성 계획서

## 📊 현재 서버 상태 분석

### 서버 1 (141.164.60.51) - Coolify 메인 서버
**하드웨어 스펙**
- CPU: AMD EPYC-Rome 2 vCPU (2 threads)
- RAM: 16GB (사용: 3.7GB, 여유: 10GB)
- 디스크: 94GB (사용: 35GB, 39% 사용률)
- 네트워크: Vultr Seoul

**현재 상태**
- ✅ 리소스 여유 충분
- ⚠️ Docker 이미지 13.27GB (정리 필요)
- ❌ 1개 컨테이너 재시작 문제 (eko44k8kwgwgk4w8cscksk88)
- ✅ 44개 컨테이너 정상 운영

### 서버 2 (158.247.233.83) - CyberPanel 서버
**하드웨어 스펙**
- CPU: AMD EPYC-Genoa 1 vCPU
- RAM: 2GB (사용: 458MB, 여유: 1.3GB)
- 디스크: 23GB (사용: 16GB, 71% 사용률)
- 네트워크: Vultr Seoul

**현재 상태**
- ⚠️ 디스크 사용률 높음 (71%)
- ✅ 시스템 부하 낮음
- 🔄 CyberPanel 제거 예정

---

## 🎯 재구성 목표

### 1단계: 즉시 조치 사항
1. **서버 1 정리**
   - 문제 컨테이너 제거/수정
   - Docker 이미지 정리
   - 불필요한 볼륨 제거

2. **서버 2 백업**
   - DNS 레코드 백업
   - 웹사이트 데이터 백업
   - 데이터베이스 백업

### 2단계: 서버 역할 재정의

#### 🖥️ 서버 1 (141.164.60.51) - Production Server
**역할**: 메인 프로덕션 서버
- **Coolify PaaS**: 애플리케이션 배포 및 관리
- **Docker Swarm/K3s**: 컨테이너 오케스트레이션 (선택적)
- **Traefik**: 리버스 프록시 및 SSL 관리
- **PostgreSQL**: 메인 데이터베이스
- **Redis**: 캐싱 및 세션 관리
- **PowerDNS**: DNS 관리 (API 기반)

**최적화 방안**
```bash
# 1. Docker 정리
docker system prune -a --volumes
docker image prune -a
docker container prune

# 2. 컨테이너 리소스 제한
# docker-compose.yml에 리소스 제한 추가
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

# 3. 로그 로테이션 설정
# /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

#### 🖥️ 서버 2 (158.247.233.83) - Backup/Monitoring Server
**새로운 역할**: 백업 및 모니터링 전용
- **백업 서버**: 서버 1의 자동 백업 스토리지
- **모니터링**: Uptime Kuma (가벼운 모니터링)
- **로그 수집**: Loki + Promtail (로그 집계)
- **DNS Secondary**: PowerDNS Secondary 서버
- **VPN 서버**: WireGuard (관리자 접속용)

**재구성 단계**
```bash
# 1. CyberPanel 완전 제거
systemctl stop lscpd
systemctl disable lscpd
rm -rf /usr/local/CyberPanel
rm -rf /etc/cyberpanel

# 2. 시스템 정리
apt-get remove --purge openlitespeed
apt-get remove --purge pure-ftpd-mysql
apt-get autoremove
apt-get autoclean

# 3. Docker 설치
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 4. Uptime Kuma 설치 (가벼운 모니터링)
docker run -d \
  --name uptime-kuma \
  -p 3001:3001 \
  -v uptime-kuma:/app/data \
  --restart=always \
  louislam/uptime-kuma:1

# 5. 백업 디렉토리 구성
mkdir -p /backup/{daily,weekly,monthly}
mkdir -p /backup/coolify/{database,volumes,configs}
```

---

## 📋 실행 계획

### Phase 1: 준비 단계 (즉시 시작)
- [ ] 서버 2 데이터 백업
  - [ ] DNS 레코드 내보내기
  - [ ] 데이터베이스 덤프
  - [ ] 설정 파일 백업
- [ ] 서버 1 Docker 정리
  - [ ] 문제 컨테이너 중지/제거
  - [ ] 이미지 정리
  - [ ] 볼륨 정리

### Phase 2: 서버 2 재구성 (1-2시간 소요)
- [ ] CyberPanel 제거
- [ ] 시스템 패키지 정리
- [ ] Docker 설치
- [ ] Uptime Kuma 설치 (모니터링)
- [ ] 백업 스토리지 구성
- [ ] SSH 키 교환 (서버 1과 연결)

### Phase 3: 서버 1 최적화 (30분 소요)
- [ ] Docker 리소스 제한 설정
- [ ] 로그 로테이션 구성
- [ ] 모니터링 에이전트 설치
- [ ] 자동 백업 스크립트 설정

### Phase 4: 통합 및 테스트 (1시간 소요)
- [ ] 네트워크 연결 테스트
- [ ] 백업/복구 테스트
- [ ] 모니터링 대시보드 구성
- [ ] CI/CD 파이프라인 설정

---

## 🛠️ 최적화 구성

### Coolify 최적화 (서버 1)

#### 1. 리소스 최적화
```yaml
# coolify/.env
# 메모리 최적화
NODE_OPTIONS="--max-old-space-size=2048"
PHP_MEMORY_LIMIT=256M

# 데이터베이스 연결 풀
DATABASE_CONNECTION_POOL_SIZE=20
REDIS_MAX_CONNECTIONS=50
```

#### 2. 자동 정리 스크립트
```bash
#!/bin/bash
# /usr/local/bin/docker-cleanup.sh

# 중지된 컨테이너 제거
docker container prune -f

# 사용하지 않는 이미지 제거
docker image prune -a -f --filter "until=72h"

# 사용하지 않는 볼륨 제거
docker volume prune -f

# 빌드 캐시 정리
docker builder prune -f --filter "until=72h"

# 로그 파일 정리
find /var/lib/docker/containers/ -name "*.log" -size +100M -delete
```

#### 3. 모니터링 설정
```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  node-exporter:
    image: prom/node-exporter:latest
    ports:
      - "9100:9100"
    restart: always
    
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    restart: always
```

### 백업/모니터링 구성 (서버 2)

#### 1. 자동 백업 스크립트
```bash
#!/bin/bash
# /usr/local/bin/backup-coolify.sh

# 변수 설정
BACKUP_DIR="/backup/daily"
DATE=$(date +%Y%m%d_%H%M%S)
REMOTE_HOST="141.164.60.51"

# PostgreSQL 백업
ssh root@$REMOTE_HOST "docker exec coolify-db pg_dumpall -U postgres" | \
  gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Redis 백업
ssh root@$REMOTE_HOST "docker exec coolify-redis redis-cli SAVE && \
  docker cp coolify-redis:/data/dump.rdb -" | \
  gzip > $BACKUP_DIR/redis_$DATE.rdb.gz

# Docker 볼륨 백업
ssh root@$REMOTE_HOST "docker run --rm \
  -v coolify_data:/data \
  -v /tmp:/backup \
  alpine tar czf /backup/volumes_$DATE.tar.gz /data" && \
  scp root@$REMOTE_HOST:/tmp/volumes_$DATE.tar.gz $BACKUP_DIR/

# 오래된 백업 삭제 (30일 이상)
find $BACKUP_DIR -type f -mtime +30 -delete
```

#### 2. 모니터링 스택
```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    ports:
      - "3001:3001"
    volumes:
      - uptime-kuma:/app/data
    restart: always
    
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - loki_data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: always

volumes:
  uptime-kuma:
  loki_data:
```

---

## 📊 예상 결과

### 성능 개선
- **서버 1**: Docker 이미지 크기 50% 감소, 메모리 사용률 20% 개선
- **서버 2**: 디스크 사용률 30%로 감소, 개발 환경 구축 완료

### 비용 효율
- 서버 2를 백업/모니터링 전용으로 활용하여 안정성 향상
- 자동화된 백업으로 데이터 손실 위험 제거
- 저사양 서버로도 충분한 백업/모니터링 운영

### 보안 강화
- CyberPanel 제거로 공격 표면 감소
- Docker 기반 격리 환경
- 중앙 집중식 모니터링

---

## ⚠️ 주의사항

1. **백업 필수**: 모든 작업 전 전체 백업 수행
2. **DNS 전환**: 서버 2의 DNS를 서버 1로 이전 시 TTL 고려
3. **다운타임**: 서버 2 재구성 시 1-2시간 서비스 중단
4. **테스트**: 모든 변경사항은 스테이징에서 먼저 테스트

---

## 📅 타임라인

| 단계 | 작업 | 예상 시간 | 우선순위 |
|------|------|-----------|----------|
| 1 | 백업 | 30분 | 필수 |
| 2 | 서버 1 Docker 정리 | 15분 | 높음 |
| 3 | 서버 2 CyberPanel 제거 | 1시간 | 높음 |
| 4 | 서버 2 Docker 환경 구축 | 30분 | 높음 |
| 5 | 모니터링 설정 | 30분 | 중간 |
| 6 | CI/CD 구성 | 1시간 | 낮음 |
| **총 예상 시간** | | **4시간** | |

---

## 🔄 롤백 계획

문제 발생 시:
1. 서버 2는 스냅샷에서 복구 (Vultr 콘솔)
2. 서버 1은 Docker 컨테이너 재시작
3. DNS는 이전 설정으로 복원
4. 백업에서 데이터 복구

---

## ✅ 체크리스트

### 작업 전
- [ ] 전체 서버 스냅샷 생성
- [ ] 데이터베이스 백업
- [ ] DNS 레코드 백업
- [ ] 환경 변수 백업
- [ ] 사용자에게 유지보수 공지

### 작업 중
- [ ] 실시간 모니터링 활성화
- [ ] 각 단계별 테스트
- [ ] 로그 수집 및 분석
- [ ] 문제 발생 시 즉시 롤백

### 작업 후
- [ ] 전체 시스템 테스트
- [ ] 성능 벤치마크
- [ ] 보안 스캔
- [ ] 문서 업데이트
- [ ] 사용자 공지