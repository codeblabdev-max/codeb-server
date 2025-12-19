# box.one-q.xyz 서브도메인 설정 가이드

## 📋 개요

`box.one-q.xyz` 서브도메인을 생성하여 현재 `http://141.164.60.51:3010/`에서 실행 중인 서비스를 연결합니다.

## 🎯 목표

- **기존 URL**: `http://141.164.60.51:3010/`
- **새 서브도메인**: `https://box.one-q.xyz`
- **자동 HTTPS**: Let's Encrypt를 통한 SSL 인증서 자동 발급

## 📝 설정 단계

### 1️⃣ DNS 설정 (네임서버: 141.164.60.51)

DNS 서버에 다음 A 레코드를 추가해야 합니다:

```dns
# A Record 추가
box.one-q.xyz    A    141.164.60.51    (TTL: 3600)
```

#### DNS 설정 방법 (PowerDNS 사용 시)

SSH로 네임서버(141.164.60.51)에 접속하여:

```bash
# 1. PowerDNS 확인
sudo systemctl status pdns

# 2. DNS 레코드 추가
sudo pdnsutil add-record one-q.xyz box A 141.164.60.51

# 3. 레코드 확인
sudo pdnsutil list-zone one-q.xyz | grep box

# 4. DNS 서버 재시작
sudo systemctl restart pdns
```

#### DNS 설정 확인

```bash
# nslookup으로 확인
nslookup box.one-q.xyz 141.164.60.51

# dig로 확인
dig @141.164.60.51 box.one-q.xyz

# 전파 확인 (인터넷에서)
nslookup box.one-q.xyz
# 또는
dig box.one-q.xyz
```

### 2️⃣ Caddyfile 설정 (이미 완료됨 ✅)

Caddyfile에 다음 설정이 추가되었습니다:

```caddyfile
# Box subdomain - Points to port 3010
box.one-q.xyz {
    reverse_proxy localhost:3010
    encode gzip

    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer-when-downgrade"
    }

    log {
        output file /var/log/caddy/box.log
        format json
    }
}
```

### 3️⃣ Caddy 설정 적용

서버에 SSH 접속 후:

```bash
# 1. Caddyfile을 서버로 복사
scp docs/configs/Caddyfile root@141.164.60.51:/etc/caddy/Caddyfile

# 또는 서버에서 직접 편집
ssh root@141.164.60.51
sudo nano /etc/caddy/Caddyfile
# (위의 box.one-q.xyz 설정 추가)

# 2. Caddy 설정 검증
sudo caddy validate --config /etc/caddy/Caddyfile

# 3. Caddy 재시작
sudo systemctl reload caddy

# 4. Caddy 상태 확인
sudo systemctl status caddy

# 5. 로그 확인
sudo journalctl -u caddy -f
```

### 4️⃣ 포트 3010 서비스 확인

서비스가 실행 중인지 확인:

```bash
# 포트 3010 확인
sudo netstat -tlnp | grep 3010
# 또는
sudo lsof -i :3010

# 로컬에서 테스트
curl http://localhost:3010
```

### 5️⃣ 방화벽 설정 확인

```bash
# 방화벽 상태 확인
sudo ufw status

# HTTP/HTTPS 포트 허용 (필요시)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 변경 사항 적용
sudo ufw reload
```

## 🧪 테스트

### DNS 전파 테스트

```bash
# 1. DNS 조회
nslookup box.one-q.xyz

# 2. 응답 확인
# Server: 141.164.60.51
# Address: 141.164.60.51#53
#
# Name: box.one-q.xyz
# Address: 141.164.60.51
```

### HTTPS 접속 테스트

```bash
# 1. HTTP → HTTPS 리다이렉션 테스트
curl -I http://box.one-q.xyz

# 2. HTTPS 직접 접속
curl -I https://box.one-q.xyz

# 3. SSL 인증서 확인
openssl s_client -connect box.one-q.xyz:443 -servername box.one-q.xyz
```

### 브라우저 테스트

1. `https://box.one-q.xyz` 접속
2. SSL 인증서가 자동 발급되었는지 확인 (자물쇠 아이콘)
3. 서비스가 정상 작동하는지 확인

## 📊 현재 서브도메인 목록

| 서브도메인 | 포트 | 용도 |
|-----------|------|------|
| `one-q.xyz` | 3008 | 메인 API 및 랜딩 페이지 |
| `test-nextjs.one-q.xyz` | 4001 | Next.js 테스트 |
| `video-platform.one-q.xyz` | 4002 | 비디오 플랫폼 |
| `test-cli-project.one-q.xyz` | 4003 | CLI 프로젝트 |
| `box.one-q.xyz` | 3010 | Box 서비스 ⭐ NEW |

## 🔧 문제 해결

### DNS가 전파되지 않는 경우

```bash
# 1. DNS 서버 확인
sudo systemctl status pdns

# 2. 레코드 재확인
sudo pdnsutil list-zone one-q.xyz

# 3. DNS 캐시 클리어 (로컬)
sudo systemd-resolve --flush-caches  # Ubuntu/Debian
sudo dscacheutil -flushcache          # macOS
```

### SSL 인증서 발급 실패

```bash
# 1. Caddy 로그 확인
sudo journalctl -u caddy -n 100

# 2. Let's Encrypt 제한 확인
# - 주당 도메인당 50개 인증서 제한
# - 시간당 5회 재시도 제한

# 3. 수동으로 인증서 요청
sudo caddy reload --config /etc/caddy/Caddyfile --force
```

### 포트 3010 서비스가 응답하지 않는 경우

```bash
# 1. 서비스 상태 확인
ps aux | grep 3010

# 2. 서비스 재시작
# (서비스 관리 명령어는 실제 서비스에 따라 다름)

# 3. 로그 확인
# (서비스 로그 위치 확인)
```

## 📚 참고 자료

- [Caddy 공식 문서](https://caddyserver.com/docs/)
- [Let's Encrypt 문서](https://letsencrypt.org/docs/)
- [PowerDNS 문서](https://doc.powerdns.com/)

## ✅ 체크리스트

- [ ] DNS A 레코드 추가 완료
- [ ] DNS 전파 확인 (`nslookup box.one-q.xyz`)
- [ ] Caddyfile 업데이트 완료
- [ ] Caddy 재시작 완료
- [ ] 포트 3010 서비스 실행 확인
- [ ] HTTPS 접속 테스트 완료
- [ ] SSL 인증서 자동 발급 확인
- [ ] 서비스 정상 동작 확인

---

**생성일**: 2025-10-23
**업데이트**: 자동 HTTPS 및 보안 헤더 적용
**담당**: CodeB Server Admin
