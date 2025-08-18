# 🚀 Coolify + PowerDNS 자동 배포 시스템 완전 메뉴얼

**프로젝트 생성 시 도메인 자동 생성 및 배포 자동화 완전 가이드**

---

## 📋 목차

1. [시스템 개요](#-시스템-개요)
2. [사전 준비](#-사전-준비)
3. [기본 사용법](#-기본-사용법)
4. [고급 사용법](#-고급-사용법)
5. [관리 도구](#-관리-도구)
6. [문제 해결](#-문제-해결)
7. [API 레퍼런스](#-api-레퍼런스)
8. [실전 예제](#-실전-예제)

---

## 🎯 시스템 개요

### 핵심 기능
- **한 번의 명령으로** 프로젝트 생성 + 도메인 자동 생성 + 배포
- **PowerDNS 연동**으로 DNS 레코드 자동 관리
- **Coolify 연동**으로 컨테이너 자동 배포
- **SSL 인증서** 자동 발급 (Let's Encrypt)
- **모니터링 및 상태 확인** 자동화

### 시스템 구성
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   사용자 명령    │───▶│  자동화 스크립트 │───▶│   PowerDNS      │
│                 │    │                 │    │   DNS 레코드    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                         │
                              ▼                         ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │    Coolify      │    │   SSL 인증서    │
                       │  프로젝트 배포   │    │   자동 발급     │
                       └─────────────────┘    └─────────────────┘
```

### 서버 환경
- **서버 IP**: 141.164.60.51
- **Coolify**: 포트 8000 (웹 UI)
- **PowerDNS**: 포트 53 (DNS), 포트 8081 (API)
- **도메인**: one-q.kr, one-q.xyz

---

## 🔧 사전 준비

### 1. 환경 변수 설정

#### PowerDNS API 키 설정
```bash
export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"
echo 'export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"' >> ~/.zshrc
```

#### Coolify API 토큰 설정
1. **브라우저에서 Coolify 접속**: http://141.164.60.51:8000
2. **로그인** 후 Settings → API Tokens
3. **"Create new token"** 클릭
4. **토큰 이름** 입력 (예: automation-token)
5. **토큰 복사** 후 설정:

```bash
export COOLIFY_API_TOKEN="your-coolify-token-here"
echo 'export COOLIFY_API_TOKEN="your-coolify-token-here"' >> ~/.zshrc
source ~/.zshrc
```

### 2. 도메인 설정 확인

#### 기본 도메인 설정
```bash
# 설정 파일 편집
vim /Users/admin/new_project/codeb-server/config/domain-config.json

# 필요시 base_domain 변경
{
    "base_domain": "one-q.kr",  // 또는 "one-q.xyz"
    "nameservers": [
        "ns1.one-q.kr",
        "ns2.one-q.kr"
    ],
    "default_ttl": 3600,
    "ssl_enabled": true
}
```

### 3. 접근 권한 확인
```bash
# SSH 접근 확인
ssh root@141.164.60.51 "echo 'SSH OK'"

# PowerDNS API 접근 확인
curl -H "X-API-Key: $PDNS_API_KEY" http://141.164.60.51:8081/api/v1/servers

# Coolify 접근 확인
curl -I http://141.164.60.51:8000
```

---

## 🚀 기본 사용법

### 1. 간단한 웹앱 배포

#### 기본 명령어
```bash
# 프로젝트 디렉토리로 이동
cd /Users/admin/new_project/codeb-server

# 기본 웹앱 배포 (자동 도메인: myapp.one-q.kr)
./scripts/automation/coolify-auto-deploy.sh myapp
```

**결과**:
- 도메인: `myapp.one-q.kr`
- DNS A 레코드 자동 생성
- Nginx 컨테이너 배포
- 접속 URL: http://myapp.one-q.kr

### 2. 커스텀 도메인으로 배포

```bash
# 특정 도메인 지정
./scripts/automation/coolify-auto-deploy.sh -d api.one-q.kr myapi

# SSL 포함 배포
./scripts/automation/coolify-auto-deploy.sh -d secure.one-q.kr --ssl myapp
```

### 3. 다른 포트 사용

```bash
# 포트 8080 사용
./scripts/automation/coolify-auto-deploy.sh -p 8080 webapp

# 포트 3000 + SSL
./scripts/automation/coolify-auto-deploy.sh -p 3000 --ssl nodeapp
```

---

## 🔧 고급 사용법

### 1. Git 저장소에서 자동 배포

#### React 애플리케이션 배포
```bash
./scripts/automation/coolify-auto-deploy.sh \
  --type git \
  --repo https://github.com/user/react-app \
  --domain app.one-q.kr \
  --ssl \
  react-frontend
```

#### Node.js API 서버 배포
```bash
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/user/api-server \
  -d api.one-q.kr \
  -p 3000 \
  --ssl \
  backend-api
```

#### 마이크로서비스 배포
```bash
# 사용자 서비스
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/company/user-service \
  -d users.one-q.kr \
  --ssl \
  user-service

# 결제 서비스  
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/company/payment-service \
  -d payments.one-q.kr \
  --ssl \
  payment-service
```

### 2. Docker Compose 프로젝트

#### 풀스택 애플리케이션
```bash
./scripts/automation/coolify-auto-deploy.sh \
  --type docker-compose \
  --domain fullstack.one-q.kr \
  --port 8080 \
  --ssl \
  fullstack-app
```

#### 데이터베이스 포함 배포
```bash
./scripts/automation/coolify-auto-deploy.sh \
  -t docker-compose \
  -d db-app.one-q.kr \
  --ssl \
  database-app
```

### 3. 환경별 배포

#### 개발 환경
```bash
./scripts/automation/coolify-auto-deploy.sh \
  -d dev.one-q.kr \
  -p 3000 \
  dev-environment
```

#### 스테이징 환경
```bash
./scripts/automation/coolify-auto-deploy.sh \
  -d staging.one-q.kr \
  --ssl \
  staging-environment
```

#### 프로덕션 환경
```bash
./scripts/automation/coolify-auto-deploy.sh \
  -d app.one-q.kr \
  --ssl \
  production-app
```

---

## 🛠️ 관리 도구

### 1. DNS 관리 도구

#### 서버 접속 후 DNS 관리
```bash
# 서버 접속
ssh root@141.164.60.51

# DNS 존 목록 확인
/opt/coolify-automation/scripts/dns-manager.sh list-zones

# 새 A 레코드 추가
/opt/coolify-automation/scripts/dns-manager.sh create-record one-q.kr subdomain.one-q.kr A 141.164.60.51

# CNAME 레코드 추가
/opt/coolify-automation/scripts/dns-manager.sh create-record one-q.kr www.subdomain.one-q.kr CNAME subdomain.one-q.kr

# 레코드 삭제
/opt/coolify-automation/scripts/dns-manager.sh delete-record one-q.kr subdomain.one-q.kr A

# DNS 쿼리 테스트
/opt/coolify-automation/scripts/dns-manager.sh query subdomain.one-q.kr
```

### 2. 프로젝트 관리 도구

#### Coolify 프로젝트 관리
```bash
# 서버에서 프로젝트 관리
ssh root@141.164.60.51

# 간단한 프로젝트 생성
/opt/coolify-automation/scripts/project-manager.sh create-simple testapp test.one-q.kr

# 실행 중인 컨테이너 확인
/opt/coolify-automation/scripts/project-manager.sh list

# Docker 상태 확인
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 3. 상태 모니터링

#### 시스템 상태 확인
```bash
# 통합 테스트 실행
./scripts/automation/test-deployment.sh

# 개별 서비스 상태 확인
curl -I http://141.164.60.51:8000  # Coolify
curl -H "X-API-Key: $PDNS_API_KEY" http://141.164.60.51:8081/api/v1/servers  # PowerDNS

# DNS 응답 확인
dig @141.164.60.51 one-q.kr
dig @141.164.60.51 test.one-q.kr
```

#### 로그 확인
```bash
# PowerDNS 로그
ssh root@141.164.60.51 "journalctl -u pdns -f"

# Coolify 로그
ssh root@141.164.60.51 "docker logs coolify -f"

# 특정 프로젝트 로그
ssh root@141.164.60.51 "docker logs PROJECT_NAME -f"
```

---

## 🚨 문제 해결

### 일반적인 문제

#### 1. DNS 레코드 생성 실패
**증상**: "API call failed" 또는 "Bad credentials" 오류

**해결 방법**:
```bash
# PowerDNS API 상태 확인
curl -H "X-API-Key: $PDNS_API_KEY" http://141.164.60.51:8081/api/v1/servers

# API 키 확인
echo $PDNS_API_KEY

# PowerDNS 서비스 재시작
ssh root@141.164.60.51 "systemctl restart pdns"

# 방화벽 규칙 확인
ssh root@141.164.60.51 "ufw status | grep 8081"
```

#### 2. Coolify 접속 불가
**증상**: Coolify 웹 인터페이스 응답 없음

**해결 방법**:
```bash
# Coolify 컨테이너 상태 확인
ssh root@141.164.60.51 "docker ps | grep coolify"

# Coolify 컨테이너 재시작
ssh root@141.164.60.51 "docker restart coolify coolify-db coolify-redis"

# 포트 8000 확인
ssh root@141.164.60.51 "netstat -tlnp | grep 8000"
```

#### 3. SSL 인증서 발급 실패
**증상**: Let's Encrypt 오류 또는 HTTPS 접속 불가

**해결 방법**:
```bash
# DNS 전파 대기 (최대 5분)
dig +short your-domain.com
nslookup your-domain.com 8.8.8.8

# 수동 인증서 발급
ssh root@141.164.60.51 "certbot certonly --standalone -d your-domain.com"

# Nginx 설정 확인
ssh root@141.164.60.51 "nginx -t"
```

#### 4. 도메인 접속 불가
**증상**: 브라우저에서 도메인 접속 시 오류

**해결 방법**:
```bash
# DNS 전파 확인
dig @8.8.8.8 your-domain.com
dig @141.164.60.51 your-domain.com

# 로컬 DNS 캐시 플러시
sudo dscacheutil -flushcache  # macOS
sudo systemctl restart systemd-resolved  # Linux

# 웹 서버 응답 확인
curl -I http://your-domain.com
curl -I https://your-domain.com
```

### 긴급 복구 절차

#### 모든 서비스 재시작
```bash
ssh root@141.164.60.51 << 'EOF'
# PowerDNS 재시작
systemctl restart pdns

# Coolify 전체 재시작
docker restart coolify coolify-db coolify-redis coolify-realtime coolify-sentinel

# 상태 확인
systemctl status pdns --no-pager
docker ps | grep coolify
EOF
```

#### 백업에서 복원
```bash
# DNS 설정 백업에서 복원
ssh root@141.164.60.51 "cp /etc/powerdns/pdns.conf.backup /etc/powerdns/pdns.conf"

# 전체 백업 복원
./scripts/backup/restore-backup.sh --restore-all $(date +%Y%m%d)
```

---

## 📚 API 레퍼런스

### PowerDNS API

#### 존 관리
```bash
# 존 목록 조회
curl -H "X-API-Key: $PDNS_API_KEY" http://141.164.60.51:8081/api/v1/servers/localhost/zones

# 존 생성
curl -X POST http://141.164.60.51:8081/api/v1/servers/localhost/zones \
  -H "X-API-Key: $PDNS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "example.com",
    "kind": "Native",
    "masters": [],
    "nameservers": ["ns1.example.com", "ns2.example.com"]
  }'
```

#### 레코드 관리
```bash
# A 레코드 생성
curl -X PATCH http://141.164.60.51:8081/api/v1/servers/localhost/zones/example.com \
  -H "X-API-Key: $PDNS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rrsets": [
      {
        "name": "app.example.com",
        "type": "A",
        "records": [
          {
            "content": "141.164.60.51",
            "disabled": false
          }
        ]
      }
    ]
  }'

# CNAME 레코드 생성
curl -X PATCH http://141.164.60.51:8081/api/v1/servers/localhost/zones/example.com \
  -H "X-API-Key: $PDNS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rrsets": [
      {
        "name": "www.app.example.com",
        "type": "CNAME",
        "records": [
          {
            "content": "app.example.com",
            "disabled": false
          }
        ]
      }
    ]
  }'
```

### Coolify API

#### 프로젝트 관리
```bash
# 프로젝트 목록 조회
curl -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  http://141.164.60.51:8000/api/v1/projects

# 프로젝트 생성 (실제 Coolify API 문서 참조)
curl -X POST http://141.164.60.51:8000/api/v1/projects \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-project",
    "description": "Auto-generated project"
  }'
```

---

## 🎮 실전 예제

### 예제 1: 블로그 사이트 배포

```bash
# Ghost 블로그 배포
./scripts/automation/coolify-auto-deploy.sh \
  --type docker-compose \
  --domain blog.one-q.kr \
  --ssl \
  ghost-blog

# 결과: https://blog.one-q.kr 에서 블로그 접속 가능
```

### 예제 2: E-commerce API 배포

```bash
# 백엔드 API
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/company/ecommerce-api \
  -d api.shop.one-q.kr \
  -p 3000 \
  --ssl \
  ecommerce-api

# 프론트엔드
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/company/ecommerce-frontend \
  -d shop.one-q.kr \
  --ssl \
  ecommerce-frontend

# 관리자 패널
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/company/admin-panel \
  -d admin.shop.one-q.kr \
  --ssl \
  admin-panel
```

### 예제 3: 개발/스테이징/프로덕션 환경

```bash
# 개발 환경
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/company/app \
  -d dev.app.one-q.kr \
  -p 3000 \
  dev-app

# 스테이징 환경
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/company/app \
  -d staging.app.one-q.kr \
  --ssl \
  staging-app

# 프로덕션 환경
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/company/app \
  -d app.one-q.kr \
  --ssl \
  production-app
```

### 예제 4: 모니터링 시스템 배포

```bash
# Grafana 대시보드
./scripts/automation/coolify-auto-deploy.sh \
  -d monitoring.one-q.kr \
  -p 3000 \
  --ssl \
  grafana

# Prometheus 서버  
./scripts/automation/coolify-auto-deploy.sh \
  -d metrics.one-q.kr \
  -p 9090 \
  --ssl \
  prometheus

# 알림 시스템
./scripts/automation/coolify-auto-deploy.sh \
  -d alerts.one-q.kr \
  -p 9093 \
  --ssl \
  alertmanager
```

---

## 🔧 명령어 레퍼런스

### 기본 명령어 구조
```bash
./scripts/automation/coolify-auto-deploy.sh [OPTIONS] PROJECT_NAME
```

### 옵션 목록

| 옵션 | 짧은 형태 | 설명 | 예시 |
|------|-----------|------|------|
| `--domain` | `-d` | 사용할 도메인 | `-d api.one-q.kr` |
| `--type` | `-t` | 프로젝트 타입 | `-t git` |
| `--repo` | `-r` | Git 저장소 URL | `-r https://github.com/user/repo` |
| `--port` | `-p` | 내부 포트 | `-p 3000` |
| `--ssl` | - | SSL 인증서 자동 발급 | `--ssl` |
| `--no-dns` | - | DNS 레코드 생성 안 함 | `--no-dns` |
| `--help` | `-h` | 도움말 출력 | `--help` |

### 프로젝트 타입

| 타입 | 설명 | 사용 예시 |
|------|------|-----------|
| `docker-compose` | Docker Compose 프로젝트 (기본값) | 일반 웹앱 |
| `git` | Git 저장소에서 자동 빌드 | React, Node.js 등 |
| `dockerfile` | Dockerfile 기반 빌드 | 커스텀 이미지 |

---

## 📞 지원 및 문의

### 로그 파일 위치
- **배포 로그**: `/Users/admin/new_project/codeb-server/deployment.log`
- **PowerDNS 로그**: `ssh root@141.164.60.51 "journalctl -u pdns"`
- **Coolify 로그**: `ssh root@141.164.60.51 "docker logs coolify"`

### 설정 파일 위치
- **도메인 설정**: `/Users/admin/new_project/codeb-server/config/domain-config.json`
- **PowerDNS 설정**: `141.164.60.51:/etc/powerdns/pdns.conf`
- **자동화 스크립트**: `141.164.60.51:/opt/coolify-automation/scripts/`

### 긴급 연락처
- **서버 접속**: `ssh root@141.164.60.51`
- **Coolify 웹 UI**: http://141.164.60.51:8000
- **PowerDNS API**: http://141.164.60.51:8081

---

**작성일**: 2025-08-15  
**버전**: 1.0  
**최종 업데이트**: 2025-08-15  
**담당**: Claude Code Team

---

**🎉 이제 단 한 줄의 명령어로 프로젝트 생성부터 도메인 설정, 배포까지 모든 것이 자동화됩니다!**