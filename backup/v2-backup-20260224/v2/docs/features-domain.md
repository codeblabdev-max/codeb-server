# @codeb/feature-domain

> 도메인 관리 - PowerDNS A 레코드 + Caddy SSL + 자동화

## 역할

프로젝트에 도메인을 설정하면 DNS 레코드 생성, Caddy 리버스 프록시 설정,
SSL 인증서 발급까지 자동으로 처리한다.

## 디렉토리 구조

```
features/domain/src/
├── domain.service.ts  ← 도메인 설정/삭제/목록 (오케스트레이터)
├── dns.service.ts     ← PowerDNS API 연동
├── ssl.service.ts     ← SSL/TLS 상태 확인
└── index.ts
```

## Services

### DomainService (오케스트레이터)

도메인 설정의 전체 흐름을 조율한다.

| 주요 메서드 | 설명 |
|------------|------|
| `setup(projectName, domain, env)` | 도메인 전체 설정 (DNS + Caddy + SSL) |
| `list(projectName?)` | 도메인 목록 조회 |
| `delete(projectName, domain)` | 도메인 삭제 (DNS + Caddy 정리) |

**setup 흐름:**
1. 도메인 형식 판별 (서브도메인 vs 커스텀)
2. 서브도메인이면 → DnsService로 A 레코드 생성
3. Caddy 설정 파일 생성 (Blue-Green upstream)
4. Caddy validate + reload
5. SSL 자동 발급 (Caddy ACME)
6. DB 영속화 (DomainRepo)

### DnsService

PowerDNS REST API로 DNS 레코드를 관리한다.

| 주요 메서드 | 설명 |
|------------|------|
| `createARecord(domain, ip)` | A 레코드 생성 |
| `deleteRecord(domain)` | 레코드 삭제 |
| `listRecords(zone)` | Zone 내 레코드 목록 |

**PowerDNS API:**
- URL: `http://127.0.0.1:8081/api/v1` (App 서버 로컬)
- Method: `PATCH /servers/localhost/zones/{zone}`
- Auth: `X-API-Key` 헤더

### SslService

SSL 인증서 상태를 확인한다.

| 주요 메서드 | 설명 |
|------------|------|
| `checkStatus(domain)` | 인증서 만료일, 발급자 확인 |

## 지원 도메인 형식

| 형식 | 예시 | DNS | Caddy | SSL |
|------|------|-----|-------|-----|
| `*.codeb.kr` | emoji.codeb.kr | 자동 (PowerDNS) | 자동 | 자동 |
| `*.workb.net` | admin.workb.net | 자동 (PowerDNS) | 자동 | 자동 |
| 커스텀 도메인 | wdot.kr | **수동** | 자동 | 자동 |

## 관리 Zone (7개)

codeb.kr, workb.net, wdot.kr, w-w-w.kr, vsvs.kr, workb.xyz, one-q.xyz

## 의존성

- `@codeb/shared` - 타입, 서버 상수
- `@codeb/db` - DomainRepo
- `@codeb/ssh` - Caddy 설정 파일 작성/리로드
- `@codeb/logger` - 도메인 설정 로깅
