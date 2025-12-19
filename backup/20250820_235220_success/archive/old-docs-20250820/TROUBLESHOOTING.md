# 🐛 문제 해결 가이드 - Coolify + PowerDNS 자동 배포 시스템

## 🚨 일반적인 문제들

### 1. Applications vs Services 생성 문제

**증상**: API가 Services를 생성하고 Applications가 아님

**원인**: Docker Compose 방식 사용 또는 잘못된 API 엔드포인트

**해결방법**:
```javascript
// ❌ 잘못된 방식 (Services 생성)
const appData = {
    docker_compose_raw: base64Content,
    // ...
};

// ✅ 올바른 방식 (Applications 생성)
const appData = {
    project_uuid: projectUuid,
    server_uuid: CONFIG.SERVER_UUID,
    environment_name: 'production', // environment_uuid 대신
    git_repository: config.gitRepository,
    git_branch: config.gitBranch || 'main',
    build_pack: config.buildPack || 'nixpacks',
    // ...
};
```

**확인 방법**:
```bash
# 데이터베이스에서 확인
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"
SELECT 'APPLICATION' as type, name, uuid, created_at FROM applications 
WHERE name = 'your-app-name'
UNION 
SELECT 'SERVICE' as type, name, uuid, created_at FROM services 
WHERE name = 'your-app-name'
ORDER BY created_at DESC;
\""
```

### 2. 422 Validation Error

**증상**: `Request failed with status code 422`

**원인**: Coolify API 검증 실패 (보통 `is_force_https_enabled` 파라미터 문제)

**해결방법**:
```javascript
// ❌ 문제가 되는 코드
if (fqdnValue) {
    appData.fqdn = fqdnValue;
    appData.is_force_https_enabled = true; // 이 줄 제거 필요
}

// ✅ 수정된 코드
if (fqdnValue) {
    appData.fqdn = fqdnValue;
    // is_force_https_enabled 제거
}
```

### 3. DNS 전파 지연

**증상**: 도메인이 바로 접근되지 않음

**원인**: DNS 캐시 및 전파 시간

**해결방법**:
```bash
# 1. DNS 레코드 확인
dig +short your-app.one-q.xyz
# 예상 결과: 141.164.60.51

# 2. PowerDNS에서 레코드 확인
curl -s -H "X-API-Key: 20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5" \
  "http://141.164.60.51:8081/api/v1/servers/localhost/zones/one-q.xyz./rrsets" | \
  jq '.[] | select(.name | contains("your-app"))'

# 3. DNS 캐시 플러시 (로컬)
sudo dscacheutil -flushcache  # macOS
sudo systemctl flush-dns     # Ubuntu
```

**대기 시간**: 일반적으로 1-5분

### 4. SSL 인증서 발급 실패

**증상**: HTTPS 접근 불가, SSL 오류

**원인**: 
- 도메인 접근 불가
- Let's Encrypt Rate Limit
- DNS 레코드 문제

**해결방법**:
```bash
# 1. 도메인 접근 확인
curl -I http://your-app.one-q.xyz
# HTTP/1.1 200 OK 또는 리다이렉트 확인

# 2. Traefik 로그 확인
ssh root@141.164.60.51 "docker logs coolify 2>&1 | grep -i 'acme\|ssl\|cert'"

# 3. Let's Encrypt Rate Limit 확인
curl -s "https://crt.sh/?q=one-q.xyz&output=json" | jq '. | length'
# 결과가 20+ 이면 Rate Limit 가능성

# 4. 수동 SSL 갱신 (필요시)
ssh root@141.164.60.51 "docker exec coolify php artisan schedule:run"
```

### 5. 파일 동기화 문제

**증상**: 로컬 파일 수정이 원격 서버에 반영되지 않음

**원인**: 로컬과 원격 서버 간 파일 불일치

**해결방법**:
```bash
# 1. 로컬 파일을 원격 서버로 복사
scp /Users/admin/new_project/codeb-server/server-api/coolify-final-server.js \
    root@141.164.60.51:/root/server-api/

# 2. 원격 서버에서 프로세스 재시작
ssh root@141.164.60.51 "
    pkill -f 'coolify-final-server.js'
    cd /root/server-api
    nohup node coolify-final-server.js > deployment.log 2>&1 &
"

# 3. 프로세스 확인
ssh root@141.164.60.51 "ps aux | grep coolify-final-server.js"
```

### 6. PowerDNS 연결 실패

**증상**: DNS 레코드 생성 실패, PowerDNS 오류

**원인**: 
- PowerDNS 서비스 중지
- API 키 문제
- 포트 접근 문제

**해결방법**:
```bash
# 1. PowerDNS 상태 확인
ssh root@141.164.60.51 "systemctl status pdns"

# 2. PowerDNS 재시작 (필요시)
ssh root@141.164.60.51 "systemctl restart pdns"

# 3. API 키 테스트
curl -H "X-API-Key: 20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5" \
  "http://141.164.60.51:8081/api/v1/servers/localhost"

# 4. 포트 확인
nmap -p 8081 141.164.60.51
```

### 7. 데이터베이스 생성 실패

**증상**: 데이터베이스 컨테이너가 시작되지 않음

**원인**: 
- 리소스 부족
- 포트 충돌
- 잘못된 설정

**해결방법**:
```bash
# 1. 서버 리소스 확인
ssh root@141.164.60.51 "free -h && df -h"

# 2. 포트 사용 확인
ssh root@141.164.60.51 "netstat -tlnp | grep -E '5432|3306|6379|27017'"

# 3. Docker 로그 확인
ssh root@141.164.60.51 "docker logs <database-container-name>"

# 4. 컨테이너 수동 재시작
ssh root@141.164.60.51 "docker restart <database-container-name>"
```

## 🔍 로그 확인 방법

### 1. 배포 서버 로그
```bash
ssh root@141.164.60.51 "tail -f /root/server-api/deployment.log"
```

### 2. Coolify 로그
```bash
ssh root@141.164.60.51 "docker logs coolify -f"
```

### 3. PowerDNS 로그
```bash
ssh root@141.164.60.51 "journalctl -u pdns -f"
```

### 4. 특정 애플리케이션 로그
```bash
ssh root@141.164.60.51 "docker logs <app-container-name> -f"
```

### 5. Traefik 로그 (SSL/라우팅 문제)
```bash
ssh root@141.164.60.51 "docker logs <traefik-container-name> -f"
```

## 🩺 시스템 상태 점검

### 종합 헬스체크 스크립트
```bash
#!/bin/bash
echo "🔍 시스템 상태 점검"

# 1. API 서버 상태
echo "1. API 서버 상태:"
curl -s http://141.164.60.51:3007/api/health | jq .

# 2. Coolify 상태
echo "2. Coolify 상태:"
ssh root@141.164.60.51 "docker ps | grep coolify"

# 3. PowerDNS 상태
echo "3. PowerDNS 상태:"
ssh root@141.164.60.51 "systemctl is-active pdns"

# 4. 서버 리소스
echo "4. 서버 리소스:"
ssh root@141.164.60.51 "free -h && df -h / | tail -1"

# 5. DNS 테스트
echo "5. DNS 테스트:"
dig +short test.one-q.xyz

# 6. SSL 테스트
echo "6. SSL 테스트:"
curl -I https://one-q.xyz 2>&1 | grep -E "HTTP|SSL"
```

## 🛠️ 복구 절차

### 1. 전체 시스템 재시작
```bash
ssh root@141.164.60.51 "
    # Coolify 재시작
    docker restart coolify
    
    # PowerDNS 재시작
    systemctl restart pdns
    
    # 배포 서버 재시작
    pkill -f 'coolify-final-server.js'
    cd /root/server-api
    nohup node coolify-final-server.js > deployment.log 2>&1 &
"
```

### 2. 데이터베이스 복구
```bash
ssh root@141.164.60.51 "
    # Coolify DB 재시작
    docker restart coolify-db
    
    # 5분 대기 후 Coolify 재시작
    sleep 300
    docker restart coolify
"
```

### 3. DNS 재설정
```bash
# PowerDNS 완전 재시작
ssh root@141.164.60.51 "
    systemctl stop pdns
    sleep 10
    systemctl start pdns
    
    # Wildcard domain 재설정
    docker exec coolify-db psql -U coolify -c \"
        UPDATE server_settings 
        SET wildcard_domain = 'https://one-q.xyz' 
        WHERE server_id = (SELECT id FROM servers WHERE uuid = 'io0ok40oo0448k80g888ock8');
    \"
"
```

## 📞 고급 문제 해결

### Generate Domain 버튼이 작동하지 않는 경우

**확인사항**:
1. `wildcard_domain` 설정 확인
2. Livewire 컴포넌트 상태
3. 브라우저 네트워크 요청

**해결방법**:
```bash
# 1. wildcard_domain 확인
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"
    SELECT wildcard_domain FROM server_settings 
    WHERE server_id = (SELECT id FROM servers WHERE uuid = 'io0ok40oo0448k80g888ock8');
\""

# 2. 설정이 없다면 추가
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"
    UPDATE server_settings 
    SET wildcard_domain = 'https://one-q.xyz' 
    WHERE server_id = (SELECT id FROM servers WHERE uuid = 'io0ok40oo0448k80g888ock8');
\""

# 3. Coolify 캐시 클리어
ssh root@141.164.60.51 "docker exec coolify php artisan cache:clear"
```

### API 응답이 없는 경우

**단계별 확인**:
```bash
# 1. 포트 열림 확인
nmap -p 3007 141.164.60.51

# 2. 프로세스 실행 확인
ssh root@141.164.60.51 "ps aux | grep coolify-final-server.js"

# 3. 로그 확인
ssh root@141.164.60.51 "tail -20 /root/server-api/deployment.log"

# 4. 방화벽 확인
ssh root@141.164.60.51 "ufw status"
```

### 대량 프로젝트 정리
```bash
# 안전한 정리 스크립트
ssh root@141.164.60.51 "
    # 컨테이너 정리
    docker container prune -f
    
    # 이미지 정리
    docker image prune -a -f
    
    # 볼륨 정리
    docker volume prune -f
    
    # 네트워크 정리
    docker network prune -f
"
```

## 📋 문제 해결 체크리스트

### 배포 실패시
- [ ] Git 저장소 접근 가능한가?
- [ ] 프로젝트 이름이 유효한가? (영문, 숫자, 하이픈만)
- [ ] 서버 리소스가 충분한가?
- [ ] Coolify 서비스가 실행 중인가?
- [ ] API 키가 올바른가?

### DNS 문제시
- [ ] PowerDNS 서비스가 실행 중인가?
- [ ] DNS 레코드가 생성되었는가?
- [ ] 로컬 DNS 캐시를 클리어했는가?
- [ ] 5분 이상 기다렸는가?

### SSL 문제시
- [ ] 도메인이 서버 IP를 가리키는가?
- [ ] Let's Encrypt Rate Limit에 걸리지 않았는가?
- [ ] HTTP 접근이 가능한가?
- [ ] Traefik이 정상 작동하는가?

---

**💡 문제가 계속되면 시스템 전체 재시작을 시도하고, 그래도 해결되지 않으면 로그를 자세히 확인하세요!**