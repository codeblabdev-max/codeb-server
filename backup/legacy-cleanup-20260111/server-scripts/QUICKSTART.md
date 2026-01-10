# CodeB Domain Manager - Quick Start Guide

5분 안에 도메인 자동화 시스템을 구축하세요!

## Prerequisites

- 서버: **158.247.203.55** (SSH 접근 가능)
- PowerDNS 컨테이너 실행 중
- Caddy 설치됨

## One-Command Deployment

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/codeb-server.git
cd codeb-server/server-scripts
```

### Step 2: Deploy to Server

```bash
chmod +x deploy-domain-manager.sh
./deploy-domain-manager.sh
```

배포 스크립트가 자동으로:
1. 파일 업로드
2. 서비스 설치
3. 환경 설정
4. 서비스 시작
5. 검증 테스트

### Step 3: Test

서버에 SSH 접속:

```bash
ssh root@158.247.203.55
```

도메인 설정:

```bash
# 예제 앱 도메인 설정
domain-cli setup myapp 3000
```

출력:
```
============================================================
✓ Domain setup complete!
============================================================
Domain:      myapp.codeb.kr
Target Port: 3000
URL:         https://myapp.codeb.kr
✓ DNS configured: myapp.codeb.kr. -> 158.247.203.55
✓ Caddy configured: /etc/caddy/sites/myapp.codeb.kr.caddy
⚠ SSL certificate will be issued on first HTTPS request
============================================================
```

### Step 4: Verify

도메인 확인:

```bash
# DNS 확인
dig @localhost myapp.codeb.kr

# Caddy 설정 확인
cat /etc/caddy/sites/myapp.codeb.kr.caddy

# 상태 확인
domain-cli status myapp.codeb.kr

# 모든 도메인 조회
domain-cli list
```

## Common Use Cases

### Use Case 1: Next.js 앱 배포

```bash
# 1. Next.js 앱 배포 (포트 3000)
ssh root@158.247.203.55 "podman run -d --name my-nextjs -p 3000:3000 my-nextjs-image"

# 2. 도메인 설정
ssh root@158.247.203.55 "domain-cli setup my-nextjs 3000"

# 3. 접속
# https://my-nextjs.codeb.kr
```

### Use Case 2: Staging + Production 환경

```bash
# Staging (포트 3000)
domain-cli setup myapp 3000 --environment staging
# → myapp-staging.codeb.kr

# Production (포트 4000)
domain-cli setup myapp 4000 --environment production
# → myapp.codeb.kr
```

### Use Case 3: 커스텀 서브도메인

```bash
# 특정 서브도메인 사용
domain-cli setup myapp 3000 --subdomain api
# → api.codeb.kr
```

### Use Case 4: 외부 도메인 연동

```bash
# 외부 도메인 (DNS는 수동 설정)
domain-cli setup myapp 3000 --domain example.com

# example.com의 A 레코드를 158.247.203.55로 설정
# Caddy와 SSL은 자동 설정됨
```

## Integration with CodeB CLI

`we` CLI에서 자동 도메인 설정:

```bash
# 프로젝트 초기화 시 자동 도메인
we workflow init myapp --domain

# 배포 시 자동 도메인
we deploy myapp --setup-domain
```

## API Usage

### Node.js Example

```javascript
const axios = require('axios');

// 도메인 설정
async function setupDomain(projectName, port) {
  const response = await axios.post('http://158.247.203.55:3103/domain/setup', {
    projectName,
    targetPort: port,
    environment: 'production',
    enableSSL: true,
  });

  if (response.data.success) {
    console.log(`Domain configured: ${response.data.domain}`);
    return response.data.domain;
  }
}

// 사용
setupDomain('myapp', 3000);
```

### Python Example

```python
import requests

def setup_domain(project_name, port):
    response = requests.post(
        'http://158.247.203.55:3103/domain/setup',
        json={
            'projectName': project_name,
            'targetPort': port,
            'environment': 'production',
            'enableSSL': True
        }
    )

    if response.json()['success']:
        domain = response.json()['domain']
        print(f'Domain configured: {domain}')
        return domain

# Usage
setup_domain('myapp', 3000)
```

### Bash Example

```bash
#!/bin/bash

setup_domain() {
  local project=$1
  local port=$2

  curl -X POST http://158.247.203.55:3103/domain/setup \
    -H "Content-Type: application/json" \
    -d "{
      \"projectName\": \"$project\",
      \"targetPort\": $port,
      \"environment\": \"production\",
      \"enableSSL\": true
    }"
}

setup_domain "myapp" 3000
```

## Monitoring

### Check Service Status

```bash
# 서비스 상태
systemctl status codeb-domain-manager

# 로그 확인
journalctl -u codeb-domain-manager -f

# API 헬스체크
curl http://localhost:3103/health
```

### Check Domain Status

```bash
# 특정 도메인
domain-cli status myapp.codeb.kr

# 모든 도메인
domain-cli list

# PowerDNS 확인
dig @localhost myapp.codeb.kr

# SSL 인증서 확인
ls -la /var/lib/caddy/certificates/acme-v02.api.letsencrypt.org-directory/myapp.codeb.kr/
```

## Troubleshooting

### Problem: API not responding

```bash
# Restart service
systemctl restart codeb-domain-manager

# Check logs
journalctl -u codeb-domain-manager -n 50
```

### Problem: DNS not working

```bash
# Check PowerDNS
podman ps | grep powerdns

# Check DNS record
curl -H "X-API-Key: YOUR_KEY" http://localhost:8081/api/v1/servers/localhost/zones/codeb.kr

# Test DNS
dig @localhost myapp.codeb.kr
```

### Problem: SSL not issued

```bash
# Force HTTPS request (triggers SSL issuance)
curl https://myapp.codeb.kr

# Check Caddy logs
journalctl -u caddy | grep -i acme

# Check certificate
ls -la /var/lib/caddy/certificates/acme-v02.api.letsencrypt.org-directory/
```

## Next Steps

1. **Read Full Documentation**: [DOMAIN_AUTOMATION_README.md](./DOMAIN_AUTOMATION_README.md)
2. **Configure PowerDNS**: [powerdns-setup.md](./powerdns-setup.md)
3. **Configure Caddy**: [caddy-setup.md](./caddy-setup.md)
4. **Run Integration Tests**: `./test-domain-manager.sh`

## CLI Reference

```bash
# Setup domain
domain-cli setup <project> <port> [options]
  Options:
    -s, --subdomain <subdomain>    Custom subdomain
    -d, --domain <domain>          Custom domain
    -e, --environment <env>        Environment (production/staging)
    --no-ssl                       Disable SSL

# Remove domain
domain-cli remove <domain>

# Check status
domain-cli status <domain>

# List all domains
domain-cli list
```

## Support

문의: admin@codeb.kr

---

**Happy deploying!** 🚀
