# 💰 서버 구성 비용 효율성 분석

## 현재 상황 비교

### Option A: 서버 2 유지 (백업/모니터링용)
**월 비용**: 
- 서버 1 (2 vCPU, 16GB RAM, 100GB): ~$80/월
- 서버 2 (1 vCPU, 2GB RAM, 25GB): ~$12/월
- **총 비용**: ~$92/월

**장점**:
- ✅ 물리적 분리로 재해 복구 가능
- ✅ 서버 1 장애 시에도 모니터링 가능
- ✅ 네트워크 격리

**단점**:
- ❌ 서버 2 리소스 활용도 낮음 (10-20%)
- ❌ 관리 포인트 2개
- ❌ 23GB 디스크로 백업 공간 부족
- ❌ 성능 제한으로 확장성 없음

---

### Option B: 서버 2 삭제 + 서버 1 업그레이드
**월 비용**:
- 서버 1 업그레이드 (4 vCPU, 24GB RAM, 200GB): ~$120/월
- 외부 백업 스토리지 (S3/Backblaze B2): ~$5/월
- **총 비용**: ~$125/월

**장점**:
- ✅ 더 강력한 단일 서버
- ✅ 리소스 활용도 높음 (60-70%)
- ✅ 관리 단순화
- ✅ 확장 가능한 백업 스토리지

**단점**:
- ❌ 단일 장애점 (SPOF)
- ❌ 모든 서비스가 한 서버에 집중

---

### Option C: 서버 2 삭제 + 관리형 서비스 활용
**월 비용**:
- 서버 1 현재 유지 (2 vCPU, 16GB RAM): ~$80/월
- Vultr Block Storage 100GB: ~$10/월
- 외부 모니터링 (UptimeRobot/Datadog): $0-10/월
- 백업 스토리지 (S3): ~$5/월
- **총 비용**: ~$95-105/월

**장점**:
- ✅ 비용 효율적
- ✅ 전문 서비스 활용
- ✅ 확장 가능한 스토리지
- ✅ 관리 부담 최소화

**단점**:
- ❌ 외부 서비스 의존성
- ❌ 데이터 전송 비용 발생 가능

---

## 🎯 권장 솔루션: Option C

### 이유:
1. **비용 효율성**: 현재와 비슷한 비용으로 더 나은 서비스
2. **확장성**: 필요시 스토리지만 추가하면 됨
3. **관리 간소화**: 서버 1개만 관리
4. **전문성**: 백업/모니터링은 전문 서비스가 더 안정적

### 구현 계획:

#### 1단계: 서버 1 스토리지 확장
```bash
# Vultr Block Storage 연결 (100GB)
# Vultr 콘솔에서 Block Storage 생성 후

# 마운트
mkdir -p /mnt/blockstorage
mount /dev/vdb /mnt/blockstorage

# 자동 마운트 설정
echo '/dev/vdb /mnt/blockstorage ext4 defaults,nofail 0 0' >> /etc/fstab

# Docker 데이터 이동
systemctl stop docker
rsync -avP /var/lib/docker/ /mnt/blockstorage/docker/
mv /var/lib/docker /var/lib/docker.old
ln -s /mnt/blockstorage/docker /var/lib/docker
systemctl start docker
```

#### 2단계: 백업 전략
```bash
# S3 호환 스토리지 설정 (Backblaze B2 추천)
# rclone 설치 및 설정
curl https://rclone.org/install.sh | sudo bash
rclone config

# 자동 백업 스크립트
cat > /usr/local/bin/backup-to-s3.sh << 'EOF'
#!/bin/bash
# PostgreSQL 백업
docker exec coolify-db pg_dumpall -U postgres | \
  gzip | rclone rcat b2:coolify-backup/db/postgres-$(date +%Y%m%d).sql.gz

# Docker 볼륨 백업
docker run --rm -v coolify_data:/data alpine \
  tar czf - /data | rclone rcat b2:coolify-backup/volumes/data-$(date +%Y%m%d).tar.gz

# 30일 이상 된 백업 삭제
rclone delete --min-age 30d b2:coolify-backup/
EOF

chmod +x /usr/local/bin/backup-to-s3.sh

# Cron 설정
echo "0 3 * * * /usr/local/bin/backup-to-s3.sh" | crontab -
```

#### 3단계: 모니터링 설정
```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  # 내부 모니터링 (가벼운 버전)
  netdata:
    image: netdata/netdata
    hostname: coolify-monitor
    ports:
      - 19999:19999
    cap_add:
      - SYS_PTRACE
    security_opt:
      - apparmor:unconfined
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

**외부 모니터링 서비스**:
- **UptimeRobot** (무료): HTTP/HTTPS 엔드포인트 모니터링
- **Healthchecks.io** (무료): Cron job 모니터링
- **Datadog** (프리 티어): 종합 모니터링 (5개 호스트까지 무료)

#### 4단계: 서버 2 정리
```bash
# 서버 2에서 중요 데이터 백업
ssh root@158.247.233.83

# DNS 레코드 내보내기
pdnsutil list-all-zones > /tmp/dns-backup.txt
for zone in $(pdnsutil list-all-zones); do
  pdnsutil list-zone $zone > /tmp/dns-$zone.txt
done

# 백업 파일 서버 1로 전송
scp /tmp/dns-*.txt root@141.164.60.51:/backup/

# Vultr 콘솔에서 서버 2 삭제
```

---

## 💡 최종 추천

### 즉시 실행 (Option C):
1. **서버 2 데이터 백업** → 서버 1로 이전
2. **Vultr Block Storage 100GB** 추가 ($10/월)
3. **Backblaze B2** 백업 설정 (10GB 무료, 이후 $0.005/GB)
4. **UptimeRobot** 무료 모니터링 설정
5. **서버 2 삭제** → 월 $12 절약

### 결과:
- **비용**: 월 $95 (현재 $92와 거의 동일)
- **스토리지**: 100GB 추가 (현재 대비 +77GB)
- **백업**: 무제한 확장 가능
- **모니터링**: 전문 서비스 수준
- **관리**: 서버 1개로 단순화

### 향후 확장 시:
서버 1이 부족하면 그때 서버 2를 새로 만들어서:
- Kubernetes 클러스터 구성
- 또는 데이터베이스 전용 서버
- 또는 CDN/캐시 서버

이렇게 하는 것이 더 효율적입니다.