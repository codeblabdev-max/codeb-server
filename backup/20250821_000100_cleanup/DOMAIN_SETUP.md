# 도메인 설정 가이드

> 자동 도메인 및 SSL 인증서 설정

## 🌐 자동 도메인 시스템

### 도메인 구조
```
프로젝트명.codeb.one-q.xyz
```

- **자동 생성**: 프로젝트 생성 시 자동으로 도메인 할당
- **SSL 인증서**: Let's Encrypt 자동 발급
- **와일드카드**: `*.codeb.one-q.xyz` 모든 서브도메인 지원

## 🔧 시스템 구성

### 1. DNS 서버 (BIND9)
```bash
# 서버: 141.164.60.51
# 포트: 53
# 존 파일: /etc/bind/db.one-q.xyz
```

### 2. 웹 서버 (Caddy)
```bash
# 포트: 80, 443
# 설정: /etc/caddy/Caddyfile
# 자동 HTTPS 리다이렉트
# Let's Encrypt 자동 갱신
```

### 3. 도메인 생성 과정
```
프로젝트 생성
    ↓
DNS 레코드 추가 (BIND9)
    ↓
Caddy 설정 추가
    ↓
SSL 인증서 발급 (Let's Encrypt)
    ↓
https://프로젝트명.codeb.one-q.xyz 활성화
```

## 📝 DNS 레코드 관리

### 현재 설정된 도메인 확인
```bash
# 로컬에서 확인
nslookup my-app.codeb.one-q.xyz 141.164.60.51

# 서버에서 확인
ssh root@141.164.60.51 "cat /etc/bind/db.one-q.xyz | grep codeb"
```

### DNS 레코드 구조
```bind
; 와일드카드 도메인 (모든 서브도메인)
*.codeb                IN      A       141.164.60.51

; 개별 프로젝트 도메인 (선택사항)
video-platform.codeb   IN      A       141.164.60.51
my-app.codeb          IN      A       141.164.60.51
```

## 🔐 SSL 인증서 관리

### 인증서 상태 확인
```bash
# CLI로 확인
codeb ssl my-app

# 브라우저로 확인
curl -I https://my-app.codeb.one-q.xyz
```

### Caddy 자동 SSL
- **자동 발급**: 첫 HTTPS 요청 시 자동 발급
- **자동 갱신**: 만료 30일 전 자동 갱신
- **ACME 프로토콜**: Let's Encrypt 사용
- **HTTP 검증**: 80번 포트로 도메인 소유권 확인

## 🚀 Caddy 프록시 설정

### 프로젝트별 설정
```caddyfile
# /etc/caddy/Caddyfile

video-platform.codeb.one-q.xyz {
    reverse_proxy localhost:3000
    encode gzip
    header {
        X-Real-IP {remote_host}
        X-Forwarded-For {remote_host}
        X-Forwarded-Proto {scheme}
    }
}
```

### 프록시 규칙
- 도메인 → localhost:포트번호
- GZIP 압축 자동 적용
- 실제 IP 헤더 전달
- HTTPS 강제 적용

## 🛠️ 수동 도메인 추가

### 1. DNS 레코드 추가
```bash
ssh root@141.164.60.51

# DNS 존 파일 편집
sudo nano /etc/bind/db.one-q.xyz

# 레코드 추가
custom-app.codeb    IN    A    141.164.60.51

# 시리얼 번호 증가 (필수!)
# 2025082001 → 2025082002

# BIND9 재시작
sudo systemctl reload bind9
```

### 2. Caddy 설정 추가
```bash
# Caddyfile 편집
sudo nano /etc/caddy/Caddyfile

# 도메인 블록 추가
custom-app.codeb.one-q.xyz {
    reverse_proxy localhost:3001
    encode gzip
}

# Caddy 재시작
sudo systemctl reload caddy
```

## 🔄 포트 할당 규칙

### 자동 할당
```
4000: 시스템 예약
4001: test-nextjs
4002: video-platform  
4003: 다음 프로젝트
...
```

### 포트 변경
```bash
# API로 변경
curl -X POST http://141.164.60.51:3008/api/projects/my-app/env \
  -H "Content-Type: application/json" \
  -d '{"variables": {"PORT": "3001"}}'

# Caddy 설정도 함께 변경 필요
```

## 🌍 커스텀 도메인 연결

### 1. 외부 도메인 CNAME 설정
```dns
# 사용자 도메인 DNS 설정
app.mydomain.com  CNAME  my-app.codeb.one-q.xyz
```

### 2. Caddy에 커스텀 도메인 추가
```caddyfile
app.mydomain.com {
    reverse_proxy localhost:4001
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
}
```

## 📊 도메인 모니터링

### DNS 응답 테스트
```bash
# 여러 DNS 서버 테스트
dig @8.8.8.8 my-app.codeb.one-q.xyz
dig @1.1.1.1 my-app.codeb.one-q.xyz
dig @141.164.60.51 my-app.codeb.one-q.xyz
```

### SSL 인증서 정보
```bash
# 인증서 만료일 확인
echo | openssl s_client -servername my-app.codeb.one-q.xyz \
  -connect my-app.codeb.one-q.xyz:443 2>/dev/null | \
  openssl x509 -noout -dates
```

### Caddy 로그 확인
```bash
# 액세스 로그
ssh root@141.164.60.51 "journalctl -u caddy -f"

# 인증서 발급 로그
ssh root@141.164.60.51 "grep 'certificate' /var/log/caddy/caddy.log"
```

## 🔥 트러블슈팅

### DNS가 응답하지 않음
```bash
# BIND9 상태 확인
ssh root@141.164.60.51 "systemctl status bind9"

# DNS 캐시 초기화 (로컬)
sudo dscacheutil -flushcache  # macOS
sudo systemd-resolve --flush-caches  # Linux
```

### SSL 인증서 발급 실패
```bash
# Caddy 재시작
ssh root@141.164.60.51 "systemctl restart caddy"

# 수동 인증서 요청
ssh root@141.164.60.51 "caddy reverse-proxy --from my-app.codeb.one-q.xyz --to localhost:3000"
```

### 502 Bad Gateway
```bash
# 애플리케이션 상태 확인
codeb status my-app

# 포트 확인
ssh root@141.164.60.51 "netstat -tlnp | grep 3000"

# 컨테이너 재시작
codeb restart my-app
```

## 📌 빠른 참조

| 구성 요소 | 값 |
|----------|-----|
| DNS 서버 | 141.164.60.51:53 |
| 웹 서버 | Caddy (80/443) |
| 도메인 패턴 | *.codeb.one-q.xyz |
| SSL 제공자 | Let's Encrypt |
| DNS 존 파일 | /etc/bind/db.one-q.xyz |
| Caddy 설정 | /etc/caddy/Caddyfile |