---
allowed-tools: [Read, Write, Bash, TodoWrite, mcp__codeb-deploy__setup_domain, mcp__codeb-deploy__remove_domain, mcp__codeb-deploy__check_domain_status, mcp__codeb-deploy__setup_project_domains]
description: "MCP codeb-deploy를 통한 도메인 관리 (설정/삭제/확인/목록)"
---

# /we:domain - 도메인 관리

## 🎯 목적
MCP codeb-deploy를 통해 DNS 설정, SSL 인증서, Caddy 리버스 프록시 설정을 포함한 도메인을 관리합니다.

## 📌 중요 규칙
- **모든 응답은 한글로 작성**
- 도메인 삭제 시 반드시 확인 절차 진행
- SSL 인증서 상태 항상 확인

## 사용법
```
/we:domain [액션] [도메인] [옵션]
```

## 액션
- `setup` - DNS 및 SSL로 새 도메인 설정
- `remove` - 도메인 설정 삭제
- `check` - 도메인 상태 및 SSL 확인
- `list` - 설정된 모든 도메인 목록

## 옵션
- `--project`, `-p` - 프로젝트 이름
- `--ssl` - SSL/TLS 활성화 (Let's Encrypt 자동)
- `--www` - www 서브도메인 리다이렉트 포함
- `--force` - 확인 없이 실행
- `--port` - 리버스 프록시 대상 포트

## 도메인 구조
```
기본 도메인: codeb.dev, one-q.xyz
서브도메인 형식:
  - myapp.codeb.dev (production)
  - myapp-staging.codeb.dev (staging)
  - myapp-pr-123.codeb.dev (preview)
```

## MCP 연동
- `mcp__codeb-deploy__setup_domain` - 단일 도메인 설정
- `mcp__codeb-deploy__setup_project_domains` - staging + production 도메인 설정
- `mcp__codeb-deploy__remove_domain` - 도메인 삭제
- `mcp__codeb-deploy__check_domain_status` - DNS 및 SSL 상태 확인

## 예제
```
/we:domain setup myapp.codeb.dev --ssl --project myapp
/we:domain setup example.com --ssl --www
/we:domain check myapp.codeb.dev
/we:domain list
/we:domain remove myapp.codeb.dev --force
```

## 관련 명령어
- `/we:deploy` - 프로젝트 배포
- `/we:workflow` - 도메인 설정 포함 CI/CD 생성
