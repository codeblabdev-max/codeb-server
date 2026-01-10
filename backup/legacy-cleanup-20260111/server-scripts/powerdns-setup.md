# PowerDNS Setup for CodeB Domain Manager

## 1. PowerDNS Container Check

Check if PowerDNS is running:

```bash
podman ps | grep powerdns
```

Expected output:
```
powerdns-postgres   Up   0.0.0.0:53->53/tcp, 0.0.0.0:8081->8081/tcp
```

## 2. PowerDNS API Configuration

### Enable API in PowerDNS

**Option A: Via environment variables (Recommended)**

```bash
# Check current PowerDNS container config
podman inspect powerdns-postgres | grep -A 20 Env

# If API not enabled, recreate with API enabled
podman stop powerdns-postgres
podman rm powerdns-postgres

podman run -d \
  --name powerdns-postgres \
  -p 53:53/tcp \
  -p 53:53/udp \
  -p 8081:8081 \
  -e PDNS_api=yes \
  -e PDNS_api_key=your-secure-api-key-here \
  -e PDNS_webserver=yes \
  -e PDNS_webserver_address=0.0.0.0 \
  -e PDNS_webserver_port=8081 \
  -e PDNS_webserver_allow_from=127.0.0.1,::1 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=powerdns \
  pschiffe/pdns-pgsql:latest
```

**Option B: Via pdns.conf file**

```bash
# Enter container
podman exec -it powerdns-postgres bash

# Edit config
cat >> /etc/pdns/pdns.conf << EOF
api=yes
api-key=your-secure-api-key-here
webserver=yes
webserver-address=0.0.0.0
webserver-port=8081
webserver-allow-from=127.0.0.1,::1
EOF

# Restart PowerDNS
supervisorctl restart pdns
```

## 3. Test PowerDNS API

```bash
# Set your API key
export PDNS_API_KEY="your-secure-api-key-here"

# Test API connectivity
curl -H "X-API-Key: $PDNS_API_KEY" http://localhost:8081/api/v1/servers

# Expected response:
# [{"id":"localhost","url":"/api/v1/servers/localhost","daemon_type":"authoritative","version":"4.x.x"}]
```

## 4. Create DNS Zone

### Manual Creation

```bash
# Create one-q.xyz zone
curl -X POST http://localhost:8081/api/v1/servers/localhost/zones \
  -H "X-API-Key: $PDNS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "one-q.xyz.",
    "kind": "Native",
    "masters": [],
    "nameservers": ["ns1.one-q.xyz.", "ns2.one-q.xyz."]
  }'
```

### Via Domain Manager (Automatic)

The Domain Manager automatically creates the zone on first run.

## 5. Add DNS Records

### Add A Record

```bash
# Add subdomain A record
curl -X PATCH http://localhost:8081/api/v1/servers/localhost/zones/one-q.xyz \
  -H "X-API-Key: $PDNS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rrsets": [
      {
        "name": "app.one-q.xyz.",
        "type": "A",
        "ttl": 300,
        "changetype": "REPLACE",
        "records": [
          {
            "content": "158.247.203.55",
            "disabled": false
          }
        ]
      }
    ]
  }'
```

### Add NS Records (Nameservers)

```bash
# Add nameserver records
curl -X PATCH http://localhost:8081/api/v1/servers/localhost/zones/one-q.xyz \
  -H "X-API-Key: $PDNS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rrsets": [
      {
        "name": "one-q.xyz.",
        "type": "NS",
        "ttl": 3600,
        "changetype": "REPLACE",
        "records": [
          {"content": "ns1.one-q.xyz.", "disabled": false},
          {"content": "ns2.one-q.xyz.", "disabled": false}
        ]
      },
      {
        "name": "ns1.one-q.xyz.",
        "type": "A",
        "ttl": 3600,
        "changetype": "REPLACE",
        "records": [
          {"content": "158.247.203.55", "disabled": false}
        ]
      },
      {
        "name": "ns2.one-q.xyz.",
        "type": "A",
        "ttl": 3600,
        "changetype": "REPLACE",
        "records": [
          {"content": "158.247.203.55", "disabled": false}
        ]
      }
    ]
  }'
```

## 6. Query DNS Records

### List all records in zone

```bash
curl -H "X-API-Key: $PDNS_API_KEY" \
  http://localhost:8081/api/v1/servers/localhost/zones/one-q.xyz | jq '.rrsets'
```

### List only A records

```bash
curl -H "X-API-Key: $PDNS_API_KEY" \
  http://localhost:8081/api/v1/servers/localhost/zones/one-q.xyz | \
  jq '.rrsets[] | select(.type=="A")'
```

## 7. Delete DNS Records

```bash
# Delete A record
curl -X PATCH http://localhost:8081/api/v1/servers/localhost/zones/one-q.xyz \
  -H "X-API-Key: $PDNS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rrsets": [
      {
        "name": "app.one-q.xyz.",
        "type": "A",
        "changetype": "DELETE"
      }
    ]
  }'
```

## 8. Test DNS Resolution

### Local DNS query

```bash
# Query PowerDNS directly
dig @localhost app.one-q.xyz

# Query from remote
dig @158.247.203.55 app.one-q.xyz
```

### Expected output:

```
;; ANSWER SECTION:
app.one-q.xyz.    300    IN    A    158.247.203.55
```

## 9. Domain Registrar Configuration

To use `one-q.xyz` as your domain, configure at your domain registrar:

### Nameservers

Set these nameservers at your domain registrar (e.g., Namecheap, GoDaddy):

```
ns1.one-q.xyz  →  158.247.203.55
ns2.one-q.xyz  →  158.247.203.55
```

### Glue Records (Required)

Since nameservers are subdomains of the zone itself, you need glue records:

```
Hostname: ns1.one-q.xyz
IP Address: 158.247.203.55

Hostname: ns2.one-q.xyz
IP Address: 158.247.203.55
```

## 10. Verify DNS Propagation

```bash
# Check nameservers
dig NS one-q.xyz

# Check if nameservers are responding
dig @ns1.one-q.xyz one-q.xyz

# Check propagation globally
https://www.whatsmydns.net/#A/app.one-q.xyz
```

## 11. PowerDNS Web Interface (Optional)

PowerDNS Admin - Web GUI for managing DNS:

```bash
podman run -d \
  --name powerdns-admin \
  -p 9191:80 \
  -e PDNS_API_URL=http://158.247.203.55:8081 \
  -e PDNS_API_KEY=your-secure-api-key-here \
  ngoduykhanh/powerdns-admin:latest
```

Access at: `http://158.247.203.55:9191`

## 12. Security Best Practices

### 1. Restrict API Access

```bash
# Only allow localhost
PDNS_webserver_allow_from=127.0.0.1,::1

# Or specific IPs
PDNS_webserver_allow_from=127.0.0.1,192.168.1.0/24
```

### 2. Strong API Key

```bash
# Generate strong API key
openssl rand -base64 32

# Set in PowerDNS config
PDNS_api_key=<generated-key>
```

### 3. Firewall Rules

```bash
# Only allow DNS queries from outside
ufw allow 53/tcp
ufw allow 53/udp

# Block API port from outside (only localhost)
ufw deny 8081/tcp
```

## 13. Backup and Restore

### Backup PostgreSQL database

```bash
# Backup DNS data
podman exec powerdns-postgres-db \
  pg_dump -U postgres powerdns > /opt/codeb/backups/powerdns-$(date +%Y%m%d).sql
```

### Restore

```bash
# Restore from backup
cat /opt/codeb/backups/powerdns-20241219.sql | \
  podman exec -i powerdns-postgres-db psql -U postgres powerdns
```

## 14. Monitoring

### Check PowerDNS logs

```bash
podman logs -f powerdns-postgres
```

### Query statistics

```bash
curl -H "X-API-Key: $PDNS_API_KEY" \
  http://localhost:8081/api/v1/servers/localhost/statistics
```

## 15. Troubleshooting

### Issue: API not responding

```bash
# Check if PowerDNS is running
podman ps | grep powerdns

# Check logs
podman logs powerdns-postgres

# Restart container
podman restart powerdns-postgres
```

### Issue: DNS not resolving

```bash
# Check if port 53 is listening
sudo netstat -tulpn | grep :53

# Test local resolution
dig @localhost one-q.xyz

# Check zone exists
curl -H "X-API-Key: $PDNS_API_KEY" \
  http://localhost:8081/api/v1/servers/localhost/zones
```

### Issue: Permission denied

```bash
# PowerDNS needs to bind to port 53 (privileged)
# Make sure container runs with proper permissions
podman run --cap-add=NET_BIND_SERVICE ...
```

## 16. Integration with Domain Manager

The CodeB Domain Manager automatically handles:

1. Zone creation (if not exists)
2. A record creation/deletion
3. TTL management
4. Record validation

No manual PowerDNS configuration needed after initial setup!

---

## Quick Reference

```bash
# List zones
curl -H "X-API-Key: $PDNS_API_KEY" http://localhost:8081/api/v1/servers/localhost/zones

# Add A record
domain-cli setup myapp 3000

# Remove A record
domain-cli remove myapp.one-q.xyz

# Check DNS
dig @localhost myapp.one-q.xyz
```
