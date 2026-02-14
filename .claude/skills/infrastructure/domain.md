---
name: domain
description: "도메인 설정 및 SSL 인증서 관리 (PowerDNS + Caddy 자동화)"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Bash
  - mcp__codeb-deploy__domain_setup
  - mcp__codeb-deploy__domain_list
  - mcp__codeb-deploy__domain_delete
---

# /we:domain - 도메인 관리 (PowerDNS + Caddy)

## 목적
프로젝트의 도메인 설정, DNS 레코드 자동 등록, Caddy 리버스 프록시, SSL 인증서를 통합 관리합니다.

## 핵심 원칙
- **모든 응답은 한글로 작성**
- 서브도메인 (codeb.kr/workb.net)은 DNS + Caddy + SSL **모두 자동**
- 커스텀 도메인은 Caddy + SSL 자동, DNS는 수동
- DNS는 **PowerDNS** (App 서버 158.247.203.55:53)로 관리

## 자동화 파이프라인

```
domain_setup("emoji.workb.net", "emoji", "production")
  │
  ├── 1. 도메인 형식 검증
  ├── 2. 서브도메인 판별 (codeb.kr / workb.net → 자동 DNS)
  ├── 3. PowerDNS A 레코드 생성
  │     └── PATCH /api/v1/servers/localhost/zones/{zone}
  │     └── A: emoji.workb.net → 158.247.203.55
  ├── 4. Caddy 설정 생성/수정
  │     └── /etc/caddy/sites/emoji-production.caddy
  │     └── reverse_proxy localhost:4131 localhost:4130
  │     └── caddy validate && systemctl reload caddy
  ├── 5. SSL 자동 발급 (Let's Encrypt)
  └── 6. DB 영속화 (status: active)
```

## 자동 실행 플로우

### 도메인 설정 (setup)
```
mcp__codeb-deploy__domain_setup 호출
- projectName: 프로젝트명
- domain: 도메인명
- environment: 환경 (기본값: production)
```

### 도메인 목록 (list)
```
mcp__codeb-deploy__domain_list 호출
- projectName: 프로젝트명 (선택)
```

### 도메인 삭제 (delete)
```
mcp__codeb-deploy__domain_delete 호출
- projectName: 프로젝트명
- domain: 도메인명
```

## 사용법
```
/we:domain setup <프로젝트> <도메인>
/we:domain list [프로젝트]
/we:domain delete <프로젝트> <도메인>
```

## 예제
```
/we:domain setup emoji emoji.workb.net        # workb.net 서브도메인 (DNS 자동)
/we:domain setup myapp myapp.codeb.kr          # codeb.kr 서브도메인 (DNS 자동)
/we:domain setup homepage wdot.kr              # 커스텀 도메인 (DNS 수동)
/we:domain list emoji                           # emoji 도메인 목록
/we:domain list                                 # 전체 도메인 목록
/we:domain delete emoji old.workb.net          # 도메인 삭제
```

## DNS 인프라
| 항목 | 값 |
|------|-----|
| Primary DNS | 158.247.203.55:53 (PowerDNS) |
| API | http://158.247.203.55:8081/api/v1 |
| 네임서버 | n1.codeb.kr, n2.codeb.kr |
| 관리 Zone | codeb.kr, workb.net, wdot.kr, w-w-w.kr 등 7개 |
| Caddy 설정 | /etc/caddy/sites/*.caddy |
| SSL | Let's Encrypt (Caddy 자동 관리) |

## 관련 명령어
- `/we:deploy` - 프로젝트 배포
- `/we:health` - 시스템 상태 확인
- `/we:workflow` - CI/CD 워크플로우 생성
