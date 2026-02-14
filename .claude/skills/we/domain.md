---
name: we:domain
description: "도메인", "domain", "DNS", "SSL", "PowerDNS", "Caddy" 등의 요청 시 자동 활성화. 도메인 설정, DNS 자동 등록, SSL 인증서를 관리합니다.
---

# we:domain - 도메인 관리 (PowerDNS + Caddy 자동화)

## 활성화 키워드
- 도메인, domain, DNS, SSL, HTTPS
- PowerDNS, 네임서버, 커스텀 도메인
- Caddy, 리버스 프록시

## 사용 도구
- `mcp__codeb-deploy__domain_setup` - 도메인 설정 (DNS + Caddy + SSL 자동)
- `mcp__codeb-deploy__domain_list` - 도메인 목록
- `mcp__codeb-deploy__domain_delete` - 도메인 삭제

## 자동화 아키텍처

```
domain_setup 호출
  ├── 1. 서브도메인 판별 (codeb.kr / workb.net)
  ├── 2. PowerDNS A 레코드 자동 생성 (서브도메인)
  │     └── PATCH /api/v1/servers/localhost/zones/{zone}
  │     └── A 레코드 → 158.247.203.55 (App 서버)
  ├── 3. Caddy 설정 자동 생성
  │     └── /etc/caddy/sites/{project}-{env}.caddy
  │     └── Blue-Green reverse_proxy (lb_policy first)
  │     └── caddy validate && systemctl reload caddy
  ├── 4. SSL 자동 발급 (Let's Encrypt via Caddy)
  └── 5. DB 영속화 (DomainRepo)
```

## 도메인 설정 절차

### 1단계: 현재 도메인 목록 확인
```
mcp__codeb-deploy__domain_list { "projectName": "프로젝트명" }
```

### 2단계: 도메인 설정
```
mcp__codeb-deploy__domain_setup {
  "projectName": "프로젝트명",
  "domain": "myapp.codeb.kr",
  "environment": "production"
}
```
- 서브도메인 (*.codeb.kr, *.workb.net): DNS + Caddy + SSL **모두 자동**
- 커스텀 도메인 (wdot.kr 등): Caddy + SSL 자동, DNS는 수동 설정 필요

### 3단계: DNS 확인 (커스텀 도메인만)
외부 도메인은 직접 DNS 설정 필요:
- A 레코드: `158.247.203.55` (App 서버)
- 또는 CNAME: `app.codeb.kr`

### 4단계: DNS 검증 (선택)
커스텀 도메인의 DNS 전파 상태 확인이 필요하면 직접 확인.

## 지원 도메인 형식

| 형식 | 예시 | DNS | Caddy | SSL |
|------|------|-----|-------|-----|
| `*.codeb.kr` | emoji.codeb.kr | 자동 (PowerDNS) | 자동 | 자동 |
| `*.workb.net` | admin.workb.net | 자동 (PowerDNS) | 자동 | 자동 |
| 커스텀 도메인 | wdot.kr | **수동** | 자동 | 자동 |

## 환경별 도메인 패턴
- Production: `myapp.codeb.kr`
- Staging: `myapp-staging.codeb.kr`
- Preview: `myapp-preview.codeb.kr`

## 도메인 삭제
```
mcp__codeb-deploy__domain_delete {
  "projectName": "프로젝트명",
  "domain": "old-domain.codeb.kr"
}
```

## DNS 인프라
- **Primary DNS**: App 서버 (158.247.203.55:53) - PowerDNS
- **네임서버**: n1.codeb.kr (158.247.203.55), n2.codeb.kr (158.247.203.55)
- **관리 Zone**: codeb.kr, workb.net, wdot.kr, w-w-w.kr, vsvs.kr, workb.xyz, one-q.xyz
- **Caddy**: App 서버 `/etc/caddy/sites/*.caddy`

## 관련 스킬
- `we:deploy` - 도메인 설정 후 배포
- `we:health` - SSL 상태 확인
- `we:workflow` - CI/CD 워크플로우 생성
