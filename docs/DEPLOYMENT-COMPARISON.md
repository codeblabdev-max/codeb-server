# CodeB v7.0 - 배포 로직 비교 분석

> 2026-01-13 vsvs-kr 배포 완료 후 분석

---

## 1. 실제 배포 vs MCP API/CLI 비교

### 실제 vsvs-kr 배포 과정 (수동)

| 단계 | 작업 | 사용 도구 |
|------|------|-----------|
| 1 | SSOT 포트 등록 | SSH + 수동 편집 |
| 2 | Storage 서버 DB/Redis 생성 | SSH + docker run |
| 3 | App 서버 ENV 파일 생성 | SSH + 수동 편집 |
| 4 | Vultr 방화벽 규칙 추가 | vultr-cli |
| 5 | PowerDNS 존 추가 | pdnsutil |
| 6 | Caddy 설정 추가 | SSH + 수동 편집 |
| 7 | GitHub Actions 워크플로우 | git push (Self-hosted Runner) |
| 8 | SSL 인증서 | Caddy 자동 발급 |

### MCP API 도구 (mcp-server/src/tools/)

| 도구 | 기능 | 현재 상태 |
|------|------|-----------|
| `deploy.ts` | Blue-Green 배포 | ⚠️ Quadlet/Podman 기반 (Docker 아님) |
| `slot.ts` | 슬롯 상태 관리 | ✅ 동작 |
| `promote.ts` | 트래픽 전환 | ✅ 동작 |
| `rollback.ts` | 롤백 | ✅ 동작 |
| `domain.ts` | 도메인 관리 | ⚠️ PowerDNS 미연동 |
| `workflow.ts` | CI/CD 워크플로우 | ⚠️ Quadlet 생성 (Docker 아님) |

### CLI 명령어 (cli/src/commands/)

| 명령어 | 기능 | 현재 상태 |
|--------|------|-----------|
| `we deploy` | 배포 | ⚠️ MCP API 호출 (Quadlet) |
| `we ssot` | SSOT 관리 | ✅ 동작 |
| `we domain` | 도메인 | ⚠️ 제한적 |
| `we workflow` | 워크플로우 | ⚠️ Quadlet 기반 |
| `we health` | 헬스체크 | ✅ 동작 |

---

## 2. 주요 차이점

### 2.1 컨테이너 런타임

| 항목 | MCP API/CLI | 실제 서버 |
|------|-------------|-----------|
| 런타임 | Podman + Quadlet | **Docker** |
| 서비스 관리 | systemd (--user) | docker run / docker compose |
| 컨테이너 파일 | /etc/containers/systemd/ | 직접 docker 명령 |

**문제**: MCP API는 Quadlet/Podman을 가정하지만, 실제 서버는 Docker를 사용

### 2.2 포트 할당

| 항목 | MCP API | 실제 사용 |
|------|---------|-----------|
| SSOT 경로 | `/opt/codeb/registry/ssot.json` | ✅ 일치 |
| 포트 범위 | staging: 3000-3499, production: 4000-4499 | **production: 4100-4499** |
| 할당 방식 | 자동 (allocateBasePort) | 수동 + SSOT 수정 |

**문제**: 포트 범위가 문서와 불일치 (4000 vs 4100 시작)

### 2.3 DNS 관리

| 항목 | MCP API | 실제 사용 |
|------|---------|-----------|
| DNS 서버 | 미지정 | **PowerDNS (158.247.203.55)** |
| 도메인 추가 | domain.ts (Caddy만) | **pdnsutil + Caddy** |

**문제**: MCP API에 PowerDNS 연동 없음

### 2.4 데이터베이스 관리

| 항목 | MCP API | 실제 사용 |
|------|---------|-----------|
| DB 생성 | 미지원 | SSH + docker run |
| DB 서버 | App 서버 | **Storage 서버 (64.176.226.119)** |

**문제**: 4-서버 아키텍처에서 DB는 Storage 서버에 있지만, MCP API는 이를 고려하지 않음

### 2.5 방화벽 관리

| 항목 | MCP API | 실제 사용 |
|------|---------|-----------|
| 방화벽 설정 | 미지원 | **vultr-cli** |
| 자동화 | 없음 | 수동 |

**문제**: 새 프로젝트 배포 시 방화벽 규칙 수동 추가 필요

---

## 3. SSOT 현황

### 서버 SSOT (`/opt/codeb/registry/ssot.json`)

```json
{
  "version": "7.0.0",
  "portRanges": {
    "system": { "start": 3000, "end": 3099 },
    "production": { "start": 4100, "end": 4499 },
    "staging": { "start": 4500, "end": 4999 },
    "preview": { "start": 5000, "end": 5499 }
  },
  "projects": {
    "worb": { "ports": { "production": { "blue": 4100, "green": 4101 } } },
    "vsvs-kr": { "ports": { "production": { "blue": 4102, "green": 4103 } } }
  },
  "ports": {
    "allocated": {
      "4100": { "project": "worb", "slot": "blue" },
      "4101": { "project": "w-homepage-react", "slot": "blue" },
      "4102": { "project": "vsvs-kr", "slot": "blue" },
      "4103": { "project": "vsvs-kr", "slot": "green" }
    }
  }
}
```

### MCP API 포트 범위 (`deploy.ts`)

```typescript
const ranges: Record<Environment, { start: number; end: number }> = {
  staging: { start: 3000, end: 3499 },    // ❌ SSOT와 불일치
  production: { start: 4000, end: 4499 }, // ❌ SSOT는 4100부터
  preview: { start: 5000, end: 5999 },    // ❌ SSOT는 5499까지
};
```

---

## 4. 개선 필요사항

### 4.1 긴급 (P0)

1. **MCP API 런타임 변경**: Quadlet/Podman → Docker
   - `deploy.ts`: docker run 명령으로 변경
   - `slot.ts`: docker ps/inspect 명령으로 변경
   - `workflow.ts`: docker-compose 또는 직접 docker 명령

2. **포트 범위 동기화**: MCP API ↔ SSOT 일치
   ```typescript
   const ranges = {
     staging: { start: 4500, end: 4999 },
     production: { start: 4100, end: 4499 },
     preview: { start: 5000, end: 5499 },
   };
   ```

### 4.2 중요 (P1)

3. **PowerDNS 연동**: `domain.ts`에 PowerDNS API 추가
   ```typescript
   // PowerDNS API 호출
   await addDNSRecord('vsvs.kr', 'A', '158.247.203.55');
   ```

4. **방화벽 자동화**: `firewall.ts` 도구 추가
   ```typescript
   // Vultr API로 방화벽 규칙 자동 추가
   await addFirewallRule(storageGroupId, port, 'tcp');
   ```

5. **4-서버 아키텍처 지원**:
   - DB 생성 시 Storage 서버 사용
   - 각 서버 역할에 맞는 작업 라우팅

### 4.3 개선 (P2)

6. **GitHub Actions 연동**: MCP API 포트 조회
   ```yaml
   - name: Get ports from SSOT
     run: |
       PORTS=$(curl -s https://api.codeb.kr/api/port/get ...)
   ```

7. **자동 헬스체크**: 배포 후 자동 검증
8. **롤백 자동화**: 헬스체크 실패 시 자동 롤백

---

## 5. 현재 작동 방식 요약

### 배포 흐름 (GitHub Actions + Self-hosted Runner)

```
1. git push → GitHub Actions trigger
2. Self-hosted Runner (App Server)에서 실행
3. Docker build → ghcr.io push
4. docker run (Blue-Green)
5. Caddy reload
6. Health check
```

### 포트 관리

```
SSOT (서버)             GitHub Actions (프로젝트)
     ↓                        ↓
수동 등록 필요          하드코딩 (BLUE_PORT, GREEN_PORT)
     ↓                        ↓
충돌 시 수동 해결       충돌 시 배포 실패
```

### DNS 관리

```
PowerDNS (158.247.203.55)    Caddy (158.247.203.55)
         ↓                           ↓
   도메인 → IP 변환           HTTPS + 리버스 프록시
   (pdnsutil 수동)            (자동 설정)
```

---

## 6. 권장 개선 순서

1. **Phase 1**: MCP API Docker 전환 (P0)
2. **Phase 2**: 포트 범위 동기화 (P0)
3. **Phase 3**: PowerDNS 연동 (P1)
4. **Phase 4**: 방화벽 자동화 (P1)
5. **Phase 5**: GitHub Actions MCP 연동 (P2)

---

## 7. 결론

현재 MCP API/CLI는 **Quadlet/Podman 기반**으로 설계되어 있으나,
실제 서버는 **Docker 기반**으로 운영 중입니다.

vsvs-kr 배포는 **수동 작업**으로 완료했으며,
이를 **자동화**하려면 MCP API의 런타임을 Docker로 변경해야 합니다.

**우선순위**:
1. Docker 런타임 전환 (deploy.ts, slot.ts, workflow.ts)
2. SSOT 포트 범위 동기화
3. PowerDNS 연동
4. 방화벽 자동화
