---
name: we:domain
description: "도메인", "domain", "DNS", "SSL" 등의 요청 시 자동 활성화. 도메인 설정 및 SSL 인증서를 관리합니다.
---

# we:domain - 도메인 관리

## 활성화 키워드
- 도메인, domain
- DNS 설정, SSL, HTTPS
- 커스텀 도메인

## 사용 도구
- `mcp__codeb-deploy__domain_setup` - 도메인 설정
- `mcp__codeb-deploy__domain_list` - 도메인 목록
- `mcp__codeb-deploy__domain_delete` - 도메인 삭제

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

### 3단계: DNS 레코드 (외부 도메인)
- A 레코드: `158.247.203.55` (App 서버)
- 또는 CNAME: `app.codeb.kr`

### 4단계: SSL 인증서
Let's Encrypt 인증서가 Caddy에 의해 자동 발급됩니다.

## 지원 도메인 형식
- `*.codeb.kr` - 서브도메인 (자동 DNS + PowerDNS)
- 커스텀 도메인 - 수동 DNS 설정 필요

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

## 관련 스킬
- `we:deploy` - 도메인 설정 후 배포
- `we:health` - SSL 상태 확인
