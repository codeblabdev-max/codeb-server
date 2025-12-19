# CodeB Domain Automation System

완전 자동화된 도메인 관리 시스템 - PowerDNS + Caddy + SSL 통합

## Overview

CodeB Domain Manager는 PowerDNS API와 Caddy 리버스 프록시를 통합하여 도메인 설정을 완전 자동화합니다.

### Features

- **DNS 자동 관리**: PowerDNS API를 통한 A 레코드 자동 생성/삭제
- **리버스 프록시 자동 설정**: Caddy 설정 파일 자동 생성
- **SSL 자동 발급**: Let's Encrypt SSL 인증서 자동 발급 (Caddy)
- **중앙 집중 관리**: SSOT Registry와 연동
- **원클릭 도메인**: 프로젝트 배포 시 도메인 자동 할당
- **상태 모니터링**: DNS, Caddy, SSL 상태 실시간 확인

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   CodeB Domain Manager                      │
│                   (Node.js API Server)                      │
│                   Port: 3103                                │
└──────────┬────────────────┬────────────────┬────────────────┘
           │                │                │
           │                │                │
     ┌─────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
     │  PowerDNS  │  │    Caddy    │  │    SSOT     │
     │    API     │  │   Reverse   │  │  Registry   │
     │  Port:8081 │  │    Proxy    │  │  Port:3102  │
     └─────┬──────┘  └──────┬──────┘  └─────────────┘
           │                │
     ┌─────▼──────┐  ┌──────▼──────┐
     │    DNS     │  │ SSL (Let's  │
     │  Records   │  │  Encrypt)   │
     └────────────┘  └─────────────┘
```

## Installation

### Prerequisites

서버: **158.247.203.55**

필수 구성 요소:
- PowerDNS (podman container)
- Caddy (systemd service)
- Node.js 18+
- PostgreSQL (PowerDNS backend)

### 1. PowerDNS 설정

```bash
# PowerDNS 컨테이너 확인
podman ps | grep powerdns

# API 활성화 (필요시)
podman run -d \
  --name powerdns-postgres \
  -p 53:53/tcp \
  -p 53:53/udp \
  -p 8081:8081 \
  -e PDNS_api=yes \
  -e PDNS_api_key=YOUR_SECURE_API_KEY \
  -e PDNS_webserver=yes \
  -e PDNS_webserver_address=0.0.0.0 \
  -e PDNS_webserver_port=8081 \
  pschiffe/pdns-pgsql:latest
```

자세한 설정: [powerdns-setup.md](./powerdns-setup.md)

### 2. Caddy 설정

```bash
# Caddy 설치 (Ubuntu/Debian)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Sites 디렉토리 생성
sudo mkdir -p /etc/caddy/sites

# Caddyfile 설정
sudo nano /etc/caddy/Caddyfile
```

Caddyfile에 추가:
```caddy
import sites/*.caddy
```

자세한 설정: [caddy-setup.md](./caddy-setup.md)

### 3. Domain Manager 설치

```bash
# 서버에 파일 전송
scp -r server-scripts/* root@158.247.203.55:/tmp/

# 서버 접속
ssh root@158.247.203.55

# 설치 스크립트 실행
cd /tmp
chmod +x install-domain-manager.sh
sudo ./install-domain-manager.sh
```

### 4. 환경 변수 설정

```bash
# PowerDNS API 키 설정
sudo nano /opt/codeb/ssot-registry/.env
```

`.env` 파일:
```bash
# PowerDNS API Configuration
PDNS_API_KEY=your-secure-api-key-here
PDNS_API_URL=http://localhost:8081/api/v1

# Domain Manager API Port
DOMAIN_MANAGER_PORT=3103

# SSOT Registry URL
SSOT_REGISTRY_URL=http://localhost:3102

# DNS Zone (기본 도메인)
DNS_ZONE=codeb.kr
```

### 5. 서비스 시작

```bash
# 서비스 시작
sudo systemctl start codeb-domain-manager

# 자동 시작 활성화
sudo systemctl enable codeb-domain-manager

# 상태 확인
sudo systemctl status codeb-domain-manager

# 로그 확인
sudo journalctl -u codeb-domain-manager -f
```

## Usage

### CLI Commands

#### 도메인 설정

```bash
# 기본 사용 (자동 서브도메인)
domain-cli setup myapp 3000

# 결과: myapp.codeb.kr -> localhost:3000

# 환경 지정
domain-cli setup myapp 3000 --environment staging
# 결과: myapp-staging.codeb.kr -> localhost:3000

# 커스텀 서브도메인
domain-cli setup myapp 3000 --subdomain custom
# 결과: custom.codeb.kr -> localhost:3000

# 완전한 커스텀 도메인 (DNS 설정 제외)
domain-cli setup myapp 3000 --domain example.com
# 결과: example.com -> localhost:3000 (DNS는 수동 설정 필요)

# SSL 비활성화
domain-cli setup myapp 3000 --no-ssl
```

#### 도메인 상태 확인

```bash
domain-cli status myapp.codeb.kr
```

출력:
```
============================================================
Domain Status: myapp.codeb.kr
============================================================

DNS:
✓ Configured
  Record: myapp.codeb.kr. -> 158.247.203.55
  TTL: 300

Caddy:
✓ Configured
  Config: /etc/caddy/sites/myapp.codeb.kr.caddy

SSL:
✓ Certificate issued
  Path: /var/lib/caddy/certificates/.../myapp.codeb.kr.crt
  Modified: 2024-12-19T10:30:00.000Z

SSOT Registry:
✓ Registered
  Project: myapp
  Port: 3000
  Environment: production
```

#### 도메인 삭제

```bash
domain-cli remove myapp.codeb.kr
```

#### 모든 도메인 조회

```bash
domain-cli list
```

### API Endpoints

#### POST /domain/setup

도메인 설정 (DNS + Caddy + SSL)

**Request:**
```bash
curl -X POST http://localhost:3103/domain/setup \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "myapp",
    "targetPort": 3000,
    "environment": "production",
    "enableSSL": true
  }'
```

**Response:**
```json
{
  "success": true,
  "domain": "myapp.codeb.kr",
  "targetPort": 3000,
  "dns": {
    "success": true,
    "fqdn": "myapp.codeb.kr.",
    "ip": "158.247.203.55"
  },
  "caddy": {
    "success": true,
    "configPath": "/etc/caddy/sites/myapp.codeb.kr.caddy"
  },
  "ssl": {
    "exists": true,
    "certPath": "/var/lib/caddy/certificates/.../myapp.codeb.kr.crt"
  },
  "ssot": {
    "success": true
  },
  "timestamp": "2024-12-19T10:30:00.000Z"
}
```

#### DELETE /domain/remove

도메인 삭제

**Request:**
```bash
curl -X DELETE http://localhost:3103/domain/remove \
  -H "Content-Type: application/json" \
  -d '{"domain": "myapp.codeb.kr"}'
```

#### GET /domain/status/:domain

도메인 상태 확인

**Request:**
```bash
curl http://localhost:3103/domain/status/myapp.codeb.kr
```

#### GET /domains

모든 도메인 조회

**Request:**
```bash
curl http://localhost:3103/domains
```

**Response:**
```json
{
  "dns": [
    {
      "name": "myapp.codeb.kr.",
      "type": "A",
      "ttl": 300,
      "records": ["158.247.203.55"]
    }
  ],
  "ssot": [
    {
      "domain": "myapp.codeb.kr",
      "projectName": "myapp",
      "targetPort": 3000,
      "environment": "production"
    }
  ],
  "timestamp": "2024-12-19T10:30:00.000Z"
}
```

## Integration with CodeB CLI

CodeB CLI (`we` 명령어)와 통합:

### we-cli에서 도메인 자동 설정

```javascript
// cli/src/commands/deploy.js

async function deploy(projectName, options) {
  const { environment = 'production', port } = options;

  // 배포 후 자동 도메인 설정
  const response = await axios.post('http://158.247.203.55:3103/domain/setup', {
    projectName,
    targetPort: port,
    environment,
    enableSSL: true,
  });

  if (response.data.success) {
    console.log(`✓ Domain configured: ${response.data.domain}`);
    console.log(`  URL: https://${response.data.domain}`);
  }
}
```

### 사용 예시

```bash
# 프로젝트 배포 시 도메인 자동 설정
we deploy myapp --env production --port 3000

# 출력:
# ✓ Deployment successful
# ✓ Domain configured: myapp.codeb.kr
#   URL: https://myapp.codeb.kr
```

## Testing

통합 테스트 실행:

```bash
# 서버에서 실행
cd /opt/codeb/ssot-registry
chmod +x test-domain-manager.sh
sudo ./test-domain-manager.sh
```

테스트 항목:
1. Service Health Check
2. PowerDNS API Connectivity
3. Test Application Setup
4. Domain Setup (DNS + Caddy + SSL)
5. DNS Record Verification
6. Caddy Configuration Verification
7. HTTP Access Test
8. Domain Status Check
9. List All Domains
10. CLI Test
11. Domain Removal

## Monitoring

### 서비스 상태

```bash
# Domain Manager 상태
systemctl status codeb-domain-manager

# 로그 확인
journalctl -u codeb-domain-manager -f
```

### PowerDNS 상태

```bash
# 컨테이너 상태
podman ps | grep powerdns

# 로그
podman logs -f powerdns-postgres

# API 테스트
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:8081/api/v1/servers
```

### Caddy 상태

```bash
# 서비스 상태
systemctl status caddy

# 설정 검증
caddy validate --config /etc/caddy/Caddyfile

# 로그
journalctl -u caddy -f

# 도메인별 로그
tail -f /var/log/caddy/myapp.codeb.kr.log
```

### SSL 인증서 확인

```bash
# 인증서 목록
ls -la /var/lib/caddy/certificates/acme-v02.api.letsencrypt.org-directory/

# 특정 도메인 인증서
ls -la /var/lib/caddy/certificates/acme-v02.api.letsencrypt.org-directory/myapp.codeb.kr/

# 인증서 만료일 확인
echo | openssl s_client -servername myapp.codeb.kr -connect myapp.codeb.kr:443 2>/dev/null | openssl x509 -noout -dates
```

## Troubleshooting

### Issue: Domain Manager API 응답 없음

```bash
# 서비스 상태 확인
systemctl status codeb-domain-manager

# 로그 확인
journalctl -u codeb-domain-manager -n 50

# 재시작
systemctl restart codeb-domain-manager
```

### Issue: PowerDNS API 연결 실패

```bash
# PowerDNS 컨테이너 상태
podman ps | grep powerdns

# API 키 확인
cat /opt/codeb/ssot-registry/.env | grep PDNS_API_KEY

# API 테스트
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:8081/api/v1/servers

# 컨테이너 재시작
podman restart powerdns-postgres
```

### Issue: DNS 레코드 생성되지 않음

```bash
# Zone 확인
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:8081/api/v1/servers/localhost/zones

# 레코드 확인
dig @localhost myapp.codeb.kr

# PowerDNS 로그 확인
podman logs powerdns-postgres
```

### Issue: Caddy 설정 에러

```bash
# 설정 검증
caddy validate --config /etc/caddy/Caddyfile

# 수동 설정 확인
cat /etc/caddy/sites/myapp.codeb.kr.caddy

# Caddy 로그
journalctl -u caddy -n 50

# 재시작
systemctl restart caddy
```

### Issue: SSL 인증서 발급 안됨

```bash
# 포트 80/443 확인
lsof -i :80
lsof -i :443

# DNS 확인 (외부에서 접근 가능해야 함)
dig myapp.codeb.kr

# Let's Encrypt 로그
journalctl -u caddy | grep -i acme

# 수동 인증서 요청
curl https://myapp.codeb.kr
```

## Security

### PowerDNS API 보안

1. **강력한 API 키 사용**
   ```bash
   openssl rand -base64 32
   ```

2. **로컬 접근만 허용**
   ```bash
   PDNS_webserver_allow_from=127.0.0.1,::1
   ```

3. **방화벽 설정**
   ```bash
   ufw deny 8081/tcp
   ```

### Caddy 보안

1. **Security Headers** (자동 추가됨)
   - X-Frame-Options
   - X-Content-Type-Options
   - X-XSS-Protection
   - Referrer-Policy

2. **HTTPS 강제** (Caddy 자동)

3. **Rate Limiting** (필요시 추가)

## Backup

### PowerDNS 데이터 백업

```bash
# DNS 데이터 백업
podman exec powerdns-postgres-db pg_dump -U postgres powerdns > /opt/codeb/backups/powerdns-$(date +%Y%m%d).sql
```

### Caddy 설정 백업

```bash
# Caddy 설정 백업
tar -czf /opt/codeb/backups/caddy-configs-$(date +%Y%m%d).tar.gz /etc/caddy/
```

### 자동 백업 (cron)

```bash
# crontab 편집
crontab -e

# 매일 새벽 2시 백업
0 2 * * * /opt/codeb/scripts/backup-domain-manager.sh
```

## Performance

### DNS 쿼리 최적화

- TTL 설정: 300초 (5분)
- PowerDNS 캐시 활성화
- 네임서버 중복 설정

### Caddy 성능

- HTTP/2 자동 활성화
- Gzip 압축
- 로그 로테이션 (10MB, 5개 유지)

## Files

```
/opt/codeb/ssot-registry/
├── domain-manager.js         # Main API server
├── domain-cli.js             # CLI tool
├── package.json              # npm dependencies
├── .env                      # Environment variables
└── node_modules/             # Dependencies

/etc/caddy/
├── Caddyfile                 # Main config
└── sites/                    # Auto-generated configs
    ├── myapp.codeb.kr.caddy
    └── ...

/var/log/caddy/
├── myapp.codeb.kr.log
└── ...

/etc/systemd/system/
└── codeb-domain-manager.service
```

## Contributing

도메인 자동화 개선 아이디어:

1. **와일드카드 SSL** - `*.codeb.kr` 인증서
2. **DNS 레코드 타입 확장** - CNAME, MX, TXT 지원
3. **도메인 히스토리** - 변경 이력 추적
4. **Health Check** - 도메인 응답 모니터링
5. **자동 갱신** - SSL 인증서 만료 알림

## License

MIT License

## Support

문의: admin@codeb.kr

---

**CodeB Domain Manager** - Make domain management effortless! 🚀
