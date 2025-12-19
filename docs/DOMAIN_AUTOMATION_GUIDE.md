# CodeB Domain Automation - Complete Guide

## Overview

CodeB Domain Automation System은 PowerDNS, Caddy, Let's Encrypt를 통합하여 도메인 설정을 완전 자동화합니다.

```
프로젝트 배포 → 도메인 자동 할당 → DNS 레코드 생성 → Caddy 설정 → SSL 발급
```

모든 과정이 한 줄의 명령어로 완료됩니다.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Client Request                           │
│                   https://myapp.codeb.kr                     │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       │ 1. DNS Query
                       ▼
            ┌──────────────────────┐
            │     PowerDNS         │
            │   (Port 53)          │
            │                      │
            │  myapp.codeb.kr      │
            │  → 158.247.203.55    │
            └──────────────────────┘
                       │
                       │ 2. HTTPS Request
                       ▼
            ┌──────────────────────┐
            │       Caddy          │
            │   (Port 80/443)      │
            │                      │
            │  - SSL Termination   │
            │  - Reverse Proxy     │
            └──────────┬───────────┘
                       │
                       │ 3. Proxy to App
                       ▼
            ┌──────────────────────┐
            │   Your Application   │
            │   (Port 3000)        │
            └──────────────────────┘

            ┌──────────────────────┐
            │  Domain Manager API  │
            │   (Port 3103)        │
            │                      │
            │  - PowerDNS API      │
            │  - Caddy Config      │
            │  - SSL Management    │
            │  - SSOT Sync         │
            └──────────────────────┘
```

## Components

### 1. PowerDNS (DNS Server)

- **Role**: DNS 레코드 관리 (A, CNAME, MX, TXT)
- **API**: RESTful API로 DNS 레코드 자동 생성/삭제
- **Port**: 53 (DNS), 8081 (API)
- **Database**: PostgreSQL

### 2. Caddy (Reverse Proxy)

- **Role**: 리버스 프록시, SSL 자동 발급
- **SSL**: Let's Encrypt 자동 HTTPS
- **Config**: 도메인별 자동 설정 생성
- **Port**: 80 (HTTP), 443 (HTTPS)

### 3. Domain Manager (Orchestrator)

- **Role**: PowerDNS + Caddy 통합 관리
- **API**: RESTful API (Express.js)
- **CLI**: domain-cli 명령어 도구
- **Port**: 3103

### 4. SSOT Registry (Central State)

- **Role**: 도메인 정보 중앙 관리
- **Integration**: 프로젝트/도메인 매핑
- **Port**: 3102

## Installation

### Quick Install (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/your-org/codeb-server.git
cd codeb-server/server-scripts

# 2. Deploy to server
chmod +x deploy-domain-manager.sh
./deploy-domain-manager.sh
```

### Manual Install

#### Step 1: Install PowerDNS

```bash
ssh root@158.247.203.55

# Run PowerDNS container
podman run -d \
  --name powerdns-postgres \
  -p 53:53/tcp \
  -p 53:53/udp \
  -p 8081:8081 \
  -e PDNS_api=yes \
  -e PDNS_api_key=$(openssl rand -base64 32) \
  -e PDNS_webserver=yes \
  -e PDNS_webserver_address=0.0.0.0 \
  -e PDNS_webserver_port=8081 \
  pschiffe/pdns-pgsql:latest

# Save API key
echo "PDNS_API_KEY=<your-key>" > /root/.pdns-api-key
```

#### Step 2: Install Caddy

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Configure Caddyfile
sudo mkdir -p /etc/caddy/sites
cat > /etc/caddy/Caddyfile << 'EOF'
{
  email admin@codeb.kr
  admin localhost:2019
}

import sites/*.caddy
EOF

# Start Caddy
sudo systemctl enable caddy
sudo systemctl start caddy
```

#### Step 3: Install Domain Manager

```bash
# Create directory
mkdir -p /opt/codeb/ssot-registry
cd /opt/codeb/ssot-registry

# Upload files (from local machine)
scp server-scripts/{domain-manager.js,domain-cli.js,package.json} root@158.247.203.55:/opt/codeb/ssot-registry/

# Install dependencies
npm install

# Create .env
cat > .env << 'EOF'
PDNS_API_KEY=your-secure-api-key
PDNS_API_URL=http://localhost:8081/api/v1
DOMAIN_MANAGER_PORT=3103
SSOT_REGISTRY_URL=http://localhost:3102
DNS_ZONE=codeb.kr
EOF

# Create systemd service
cat > /etc/systemd/system/codeb-domain-manager.service << 'EOF'
[Unit]
Description=CodeB Domain Manager API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/codeb/ssot-registry
ExecStart=/usr/bin/node /opt/codeb/ssot-registry/domain-manager.js
Restart=always
EnvironmentFile=/opt/codeb/ssot-registry/.env

[Install]
WantedBy=multi-user.target
EOF

# Start service
systemctl daemon-reload
systemctl enable codeb-domain-manager
systemctl start codeb-domain-manager

# Create CLI symlink
ln -sf /opt/codeb/ssot-registry/domain-cli.js /usr/local/bin/domain-cli
```

## Usage

### CLI Usage

#### Setup Domain

```bash
# Basic usage
domain-cli setup myapp 3000
# Creates: myapp.codeb.kr -> localhost:3000

# With environment
domain-cli setup myapp 3000 --environment staging
# Creates: myapp-staging.codeb.kr -> localhost:3000

# Custom subdomain
domain-cli setup myapp 3000 --subdomain api
# Creates: api.codeb.kr -> localhost:3000

# External domain (manual DNS required)
domain-cli setup myapp 3000 --domain example.com
# Creates: example.com -> localhost:3000
```

#### Check Status

```bash
domain-cli status myapp.codeb.kr
```

#### Remove Domain

```bash
domain-cli remove myapp.codeb.kr
```

#### List All Domains

```bash
domain-cli list
```

### API Usage

#### POST /domain/setup

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

Response:
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
    "exists": true
  }
}
```

#### DELETE /domain/remove

```bash
curl -X DELETE http://localhost:3103/domain/remove \
  -H "Content-Type: application/json" \
  -d '{"domain": "myapp.codeb.kr"}'
```

#### GET /domain/status/:domain

```bash
curl http://localhost:3103/domain/status/myapp.codeb.kr
```

#### GET /domains

```bash
curl http://localhost:3103/domains
```

## Integration with CodeB CLI

### Automatic Domain on Deploy

`we-cli/src/commands/deploy.js`:

```javascript
const axios = require('axios');

async function deployWithDomain(projectName, port, environment) {
  // 1. Deploy application
  await deployApplication(projectName, port);

  // 2. Setup domain automatically
  const response = await axios.post('http://158.247.203.55:3103/domain/setup', {
    projectName,
    targetPort: port,
    environment,
    enableSSL: true,
  });

  if (response.data.success) {
    console.log(`✓ Domain: https://${response.data.domain}`);
  }
}
```

### Usage

```bash
# Deploy with automatic domain
we deploy myapp --port 3000 --domain

# Output:
# ✓ Deployment successful
# ✓ Domain: https://myapp.codeb.kr
```

## Workflow Examples

### Example 1: Next.js App Deployment

```bash
# 1. Build and deploy Next.js app
cd my-nextjs-app
docker build -t my-nextjs .
docker run -d --name my-nextjs -p 3000:3000 my-nextjs

# 2. Setup domain
domain-cli setup my-nextjs 3000

# 3. Access
# https://my-nextjs.codeb.kr
```

### Example 2: Multi-Environment Setup

```bash
# Development
domain-cli setup myapp 3000 --environment dev
# → myapp-dev.codeb.kr

# Staging
domain-cli setup myapp 4000 --environment staging
# → myapp-staging.codeb.kr

# Production
domain-cli setup myapp 5000 --environment production
# → myapp.codeb.kr
```

### Example 3: Microservices Architecture

```bash
# API Gateway
domain-cli setup gateway 3000 --subdomain api
# → api.codeb.kr

# Auth Service
domain-cli setup auth-service 3001 --subdomain auth
# → auth.codeb.kr

# User Service
domain-cli setup user-service 3002 --subdomain users
# → users.codeb.kr
```

## DNS Configuration

### At Domain Registrar

Configure nameservers at your domain registrar (e.g., Namecheap, GoDaddy):

```
Domain: codeb.kr

Nameservers:
  n1.codeb.kr → 158.247.203.55
  n2.codeb.kr → 158.247.203.55
```

### Glue Records

Since nameservers are subdomains of the zone itself:

```
Hostname: n1.codeb.kr
IP: 158.247.203.55

Hostname: n2.codeb.kr
IP: 158.247.203.55
```

### Verify DNS Propagation

```bash
# Check nameservers
dig NS codeb.kr

# Check A record
dig myapp.codeb.kr

# Global propagation check
https://www.whatsmydns.net/#A/myapp.codeb.kr
```

## SSL/TLS Certificates

### Automatic Issuance

Caddy automatically issues Let's Encrypt SSL certificates:

1. **First HTTPS request** triggers certificate issuance
2. **ACME HTTP-01 challenge** via port 80
3. **Certificate stored** in `/var/lib/caddy/certificates/`
4. **Auto-renewal** 30 days before expiry

### Check Certificates

```bash
# List all certificates
ls -la /var/lib/caddy/certificates/acme-v02.api.letsencrypt.org-directory/

# Check specific domain
ls -la /var/lib/caddy/certificates/acme-v02.api.letsencrypt.org-directory/myapp.codeb.kr/

# Certificate expiry
echo | openssl s_client -servername myapp.codeb.kr -connect myapp.codeb.kr:443 2>/dev/null | openssl x509 -noout -dates
```

### Force SSL Issuance

```bash
# Make HTTPS request to trigger issuance
curl -I https://myapp.codeb.kr

# Check Caddy logs
journalctl -u caddy | grep -i acme
```

## Monitoring

### Service Status

```bash
# Domain Manager
systemctl status codeb-domain-manager
journalctl -u codeb-domain-manager -f

# Caddy
systemctl status caddy
journalctl -u caddy -f

# PowerDNS
podman ps | grep powerdns
podman logs -f powerdns-postgres
```

### Health Checks

```bash
# Domain Manager API
curl http://localhost:3103/health

# PowerDNS API
curl -H "X-API-Key: $PDNS_API_KEY" http://localhost:8081/api/v1/servers

# Caddy admin API
curl http://localhost:2019/config/
```

### Logs

```bash
# Domain Manager logs
tail -f /var/log/codeb/domain-manager.log

# Caddy access logs (per domain)
tail -f /var/log/caddy/myapp.codeb.kr.log

# PowerDNS query logs
podman logs -f powerdns-postgres | grep query
```

## Security

### PowerDNS Security

```bash
# Strong API key
PDNS_api_key=$(openssl rand -base64 32)

# Restrict API access
PDNS_webserver_allow_from=127.0.0.1,::1

# Firewall
ufw allow 53/tcp
ufw allow 53/udp
ufw deny 8081/tcp  # Block external API access
```

### Caddy Security

Automatic security headers:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### SSL Best Practices

- TLS 1.2 and 1.3 only
- Strong cipher suites (Caddy defaults)
- Auto-renewal (Caddy)
- HSTS header (optional)

## Backup & Restore

### Backup PowerDNS

```bash
# Backup DNS data
podman exec powerdns-postgres-db pg_dump -U postgres powerdns > /opt/codeb/backups/powerdns-$(date +%Y%m%d).sql
```

### Backup Caddy Configs

```bash
# Backup Caddy configurations
tar -czf /opt/codeb/backups/caddy-$(date +%Y%m%d).tar.gz /etc/caddy/
```

### Restore

```bash
# Restore PowerDNS
cat /opt/codeb/backups/powerdns-20241219.sql | podman exec -i powerdns-postgres-db psql -U postgres powerdns

# Restore Caddy
tar -xzf /opt/codeb/backups/caddy-20241219.tar.gz -C /
systemctl reload caddy
```

## Troubleshooting

### Issue: Domain Manager not starting

```bash
# Check logs
journalctl -u codeb-domain-manager -n 100

# Check dependencies
cd /opt/codeb/ssot-registry
npm install

# Check environment
cat .env

# Restart
systemctl restart codeb-domain-manager
```

### Issue: DNS not resolving

```bash
# Check PowerDNS
podman ps | grep powerdns

# Test local DNS
dig @localhost myapp.codeb.kr

# Check zone exists
curl -H "X-API-Key: $PDNS_API_KEY" http://localhost:8081/api/v1/servers/localhost/zones

# Check records
domain-cli list
```

### Issue: Caddy not proxying

```bash
# Check Caddy status
systemctl status caddy

# Validate config
caddy validate --config /etc/caddy/Caddyfile

# Check site config
cat /etc/caddy/sites/myapp.codeb.kr.caddy

# Reload
systemctl reload caddy
```

### Issue: SSL certificate not issued

```bash
# Check DNS resolution (must be public)
dig myapp.codeb.kr

# Check port 80 accessibility
curl http://myapp.codeb.kr

# Force HTTPS request
curl -I https://myapp.codeb.kr

# Check ACME logs
journalctl -u caddy | grep -i acme
```

## Advanced Features

### Custom SSL Certificates

```caddy
myapp.codeb.kr {
  tls /path/to/cert.pem /path/to/key.pem
  reverse_proxy localhost:3000
}
```

### Rate Limiting

```caddy
myapp.codeb.kr {
  rate_limit {
    zone myapp {
      key {remote_host}
      events 100
      window 1m
    }
  }
  reverse_proxy localhost:3000
}
```

### Load Balancing

```caddy
myapp.codeb.kr {
  reverse_proxy localhost:3000 localhost:3001 localhost:3002 {
    lb_policy round_robin
    health_uri /health
    health_interval 10s
  }
}
```

## Performance Tuning

### DNS Performance

```bash
# PowerDNS cache settings
PDNS_cache_ttl=60
PDNS_negquery_cache_ttl=60
```

### Caddy Performance

```caddy
{
  servers {
    timeouts {
      read_body 10s
      read_header 5s
      write 30s
    }
  }
}
```

## References

- [PowerDNS API Documentation](https://doc.powerdns.com/authoritative/http-api/)
- [Caddy Documentation](https://caddyserver.com/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)

## Support

- **Documentation**: `/opt/codeb/ssot-registry/DOMAIN_AUTOMATION_README.md`
- **Email**: admin@codeb.kr
- **GitHub**: https://github.com/your-org/codeb-server

---

**CodeB Domain Automation** - Effortless domain management! 🚀
