# CodeB v7.0 - 도메인 관리 가이드

> 통합된 도메인 관리 시스템 (Caddy 파일 기반 + PowerDNS)

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     도메인 관리 아키텍처 (v7.0.54+)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│  │  PowerDNS   │     │   Caddy     │     │   Let's     │              │
│  │  (DNS)      │     │ (Reverse    │     │  Encrypt    │              │
│  │             │     │  Proxy)     │     │  (SSL)      │              │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘              │
│         │                   │                   │                      │
│         ▼                   ▼                   ▼                      │
│  ┌──────────────────────────────────────────────────────────┐         │
│  │                    domain.ts                              │         │
│  │   - DNS 레코드 관리 (PowerDNS API)                        │         │
│  │   - 도메인 검증 (Node.js DNS)                             │         │
│  └──────────────────────────────────────────────────────────┘         │
│                             │                                          │
│                             ▼                                          │
│  ┌──────────────────────────────────────────────────────────┐         │
│  │                     caddy.ts                              │         │
│  │   - Caddy 설정 파일 생성/관리                             │         │
│  │   - /etc/caddy/sites/*.caddy                             │         │
│  │   - systemctl reload caddy                               │         │
│  └──────────────────────────────────────────────────────────┘         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. 도메인 유형

### 1.1 서브도메인 (자동)

```
{projectName}.codeb.kr          # Production
{projectName}-staging.codeb.kr  # Staging
{projectName}-preview.codeb.kr  # Preview
```

- PowerDNS에 A 레코드 자동 등록
- Caddy 설정 자동 생성
- Let's Encrypt SSL 자동 발급

### 1.2 커스텀 도메인 (수동 DNS)

```
example.com      # 외부 도메인
app.example.com  # 외부 서브도메인
```

- DNS 레코드 수동 설정 필요
- Caddy 설정 자동 생성
- Let's Encrypt SSL 자동 발급

---

## 2. 도메인 설정 플로우

### 2.1 서브도메인 추가

```
┌──────────────────┐
│ domain_setup     │
│ myapp.codeb.kr   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 1. PowerDNS     │
│    A 레코드 추가 │
│    → 158.247.   │
│       203.55    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. Caddy 설정   │
│    생성/업데이트│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. Caddy Reload │
│    (무중단)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ✅ 즉시 활성화   │
│   status: active │
└──────────────────┘
```

### 2.2 커스텀 도메인 추가

```
┌──────────────────┐
│ domain_setup     │
│ app.example.com  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 1. CNAME 안내   │
│    반환          │
│    → projectName │
│       .codeb.kr  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. Caddy 설정   │
│    생성          │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ⏳ 대기 상태     │
│   status: pending│
└────────┬─────────┘
         │
         │ (사용자가 DNS 설정)
         ▼
┌──────────────────┐
│ domain_verify    │
│ app.example.com  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     실패
│ DNS 레코드 확인 │────────────▶ 재설정 안내
│ A or CNAME      │
└────────┬─────────┘
         │ 성공
         ▼
┌──────────────────┐
│ ✅ 활성화        │
│   status: active │
└──────────────────┘
```

---

## 3. API 사용법

### 3.1 도메인 설정

```bash
# MCP Tool 호출
mcp__codeb-deploy__domain_setup

# 파라미터
{
  "domain": "myapp.codeb.kr",
  "projectName": "myapp",
  "environment": "production"
}

# 응답
{
  "success": true,
  "data": {
    "domain": "myapp.codeb.kr",
    "type": "subdomain",
    "target": {
      "projectName": "myapp",
      "environment": "production"
    },
    "ssl": true,
    "status": "active",
    "records": [
      {
        "type": "A",
        "name": "myapp",
        "content": "158.247.203.55",
        "ttl": 300
      }
    ]
  }
}
```

### 3.2 도메인 검증

```bash
# MCP Tool 호출
mcp__codeb-deploy__domain_verify

# 파라미터
{
  "domain": "app.example.com"
}

# 응답
{
  "success": true,
  "verified": true,
  "checks": [
    {
      "type": "A",
      "expected": "158.247.203.55",
      "actual": "158.247.203.55",
      "passed": true
    }
  ]
}
```

### 3.3 도메인 목록

```bash
# MCP Tool 호출
mcp__codeb-deploy__domain_list

# 파라미터 (선택)
{
  "projectName": "myapp"
}

# 응답
{
  "success": true,
  "domains": [
    {
      "domain": "myapp.codeb.kr",
      "type": "subdomain",
      "target": {
        "projectName": "myapp",
        "environment": "production"
      },
      "ssl": true,
      "status": "active"
    },
    {
      "domain": "app.example.com",
      "type": "custom",
      "target": {
        "projectName": "myapp",
        "environment": "production"
      },
      "ssl": true,
      "status": "active"
    }
  ]
}
```

### 3.4 도메인 삭제

```bash
# MCP Tool 호출
mcp__codeb-deploy__domain_delete

# 파라미터
{
  "domain": "app.example.com",
  "projectName": "myapp",
  "environment": "production"
}

# 응답
{
  "success": true
}
```

---

## 4. Caddy 설정 구조

### 4.1 파일 위치

```
/etc/caddy/
├── Caddyfile           # 메인 설정 (sites import)
└── sites/
    ├── project-a-production.caddy
    ├── project-a-staging.caddy
    ├── project-b-production.caddy
    └── ...
```

### 4.2 사이트 설정 형식

```caddyfile
# /etc/caddy/sites/{projectName}-{environment}.caddy

# 기본 도메인 + 커스텀 도메인
myapp.codeb.kr, app.example.com, www.example.com {
  reverse_proxy localhost:4100 localhost:4101 {
    lb_policy first
    fail_duration 10s
    health_uri /health
    health_interval 10s
    health_timeout 5s
  }
  encode gzip
  header {
    X-CodeB-Project myapp
    X-CodeB-Version 1.0.0
    X-CodeB-Slot blue
    X-CodeB-Environment production
    -Server
  }
  log {
    output file /var/log/caddy/myapp.log {
      roll_size 10mb
      roll_keep 5
    }
  }
}
```

### 4.3 Blue-Green 전환

```caddyfile
# promote 전 (blue active)
reverse_proxy localhost:4100 localhost:4101 {
  lb_policy first  # 4100 우선
}

# promote 후 (green active)
reverse_proxy localhost:4101 localhost:4100 {
  lb_policy first  # 4101 우선
}
```

---

## 5. DNS 설정 가이드

### 5.1 서브도메인 (codeb.kr)

자동 설정됨. 추가 작업 불필요.

### 5.2 커스텀 도메인

#### A 레코드 방식 (권장)

```
Type: A
Name: @ (또는 subdomain)
Value: 158.247.203.55
TTL: 300
```

#### CNAME 방식

```
Type: CNAME
Name: @ (또는 subdomain)
Value: {projectName}.codeb.kr
TTL: 300
```

### 5.3 DNS 전파 시간

- TTL 설정에 따라 다름 (보통 5분~24시간)
- 검증 실패 시 DNS 전파 대기 후 재시도

---

## 6. SSL 인증서

### 6.1 자동 발급

- Caddy가 Let's Encrypt 인증서 자동 발급
- 만료 30일 전 자동 갱신
- 설정 불필요

### 6.2 SSL 상태 확인

```bash
# MCP Tool 호출
mcp__codeb-deploy__ssl_status

# 파라미터
{
  "domain": "myapp.codeb.kr"
}

# 응답
{
  "success": true,
  "data": {
    "domain": "myapp.codeb.kr",
    "issuer": "Let's Encrypt (Caddy Auto)",
    "daysRemaining": 90,
    "autoRenew": true
  }
}
```

---

## 7. 트러블슈팅

### 7.1 도메인 접속 불가

```
1. DNS 검증 실행
   → domain_verify 호출

2. Caddy 설정 확인
   → cat /etc/caddy/sites/{project}-{env}.caddy

3. Caddy 서비스 상태
   → systemctl status caddy

4. 포트 리스닝 확인
   → ss -tlnp | grep {port}
```

### 7.2 SSL 인증서 오류

```
1. 도메인 DNS 확인
   → dig +short {domain}

2. Caddy 로그 확인
   → journalctl -u caddy -f

3. ACME 챌린지 확인
   → curl http://{domain}/.well-known/acme-challenge/test
```

### 7.3 커스텀 도메인 검증 실패

```
1. DNS 레코드 확인
   → dig +short {domain} A
   → dig +short {domain} CNAME

2. DNS 전파 대기 (최대 24시간)

3. DNS 캐시 플러시
   → 로컬: ipconfig /flushdns (Windows)
   → 서버: systemd-resolve --flush-caches
```

---

## 8. 관련 파일

| 파일 | 역할 |
|------|------|
| `mcp-server/src/tools/domain.ts` | 도메인 관리 API |
| `mcp-server/src/lib/caddy.ts` | Caddy 설정 통합 관리 |
| `mcp-server/src/tools/promote.ts` | 트래픽 전환 (Caddy 연동) |

---

## 버전

- **문서 버전**: v7.0.54
- **최종 업데이트**: 2026-01-15
