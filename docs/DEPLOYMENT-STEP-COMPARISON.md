# CodeB v7.0.31 - 실제 배포 vs MCP API/CLI 코드 비교

> 2026-01-13 업데이트 - v7.0.30+ Docker 전환 반영

---

## 요약: 현재 상태

| 구분 | 실제 배포 | MCP API/CLI 코드 | 상태 |
|------|----------|------------------|------|
| **컨테이너 런타임** | Docker | Docker | ✅ 일치 |
| **포트 범위** | SSOT 기준 | SSOT 동기화 완료 | ✅ 일치 |
| **DNS 관리** | pdnsutil CLI | HTTP API (레코드만) | ⚠️ 존 생성 누락 |
| **방화벽** | vultr-cli | 미구현 | ❌ 누락 |
| **DB/Redis 생성** | docker run (Storage서버) | 미구현 | ❌ 누락 |

---

## v7.0.30+ 수정 완료 사항

### 1. 컨테이너 런타임: Podman → Docker ✅

**deploy.ts (v7.0.30+)**
```typescript
// Docker 기반 배포
await ssh.exec(`docker pull ${imageUrl}`, { timeout: 180000 });
await ssh.exec(`docker stop ${containerName} 2>/dev/null || true`);
await ssh.exec(`docker rm ${containerName} 2>/dev/null || true`);
await ssh.exec(`docker run -d \\
  --name ${containerName} \\
  --restart always \\
  --env-file ${envFile} \\
  -p ${targetPort}:3000 \\
  --health-cmd="curl -sf http://localhost:3000/health || exit 1" \\
  --memory=512m \\
  --cpus=1 \\
  ${imageUrl}`);
```

**slot.ts (v7.0.30+)**
```typescript
// Docker 컨테이너 정리
await ssh.exec(`docker stop ${containerName} 2>/dev/null || true`);
await ssh.exec(`docker rm ${containerName} 2>/dev/null || true`);
```

### 2. 포트 범위: SSOT 동기화 ✅

**deploy.ts:367-371**
```typescript
const ranges: Record<Environment, { start: number; end: number }> = {
  staging: { start: 4500, end: 4999 },
  production: { start: 4100, end: 4499 },
  preview: { start: 5000, end: 5499 },
};
```

**servers.ts:71-85 (동기화 완료)**
```typescript
export const PORT_RANGES = {
  staging: {
    app: { start: 4500, end: 4999 },
    db: { start: 5432, end: 5449 },
    redis: { start: 6379, end: 6399 },
  },
  production: {
    app: { start: 4100, end: 4499 },
    db: { start: 5450, end: 5469 },
    redis: { start: 6400, end: 6419 },
  },
  preview: {
    app: { start: 5000, end: 5499 },
  },
};
```

---

## 아직 누락된 기능

### P1: DNS 존 생성

**현재 실제 작업**
```bash
pdnsutil create-zone vsvs.kr ns1.codeb.kr hostmaster.codeb.kr
pdnsutil add-record vsvs.kr @ A 300 158.247.203.55
pdns_control reload
```

**MCP API 현재 상태**
- 레코드 추가만 구현 (HTTP API PATCH)
- 존 생성 미구현

**필요한 구현**
```typescript
// domain.ts에 추가 필요
async function createDNSZone(zoneName: string) {
  // 방법 1: pdnsutil CLI (현재 실제 사용 방식)
  await execCommand('app', `pdnsutil create-zone ${zoneName} ns1.codeb.kr`);
  await execCommand('app', `pdns_control reload`);

  // 방법 2: HTTP API
  await pdnsRequest('POST', '/servers/localhost/zones', {
    name: `${zoneName}.`,
    kind: 'Master',
    nameservers: ['ns1.codeb.kr.']
  });
}
```

### P1: 방화벽 자동화

**현재 실제 작업**
```bash
vultr-cli firewall rule create <group-id> \
  --protocol tcp \
  --port 5433 \
  --subnet 158.247.203.55/32
```

**필요한 구현**
```typescript
// 새 파일: mcp-server/src/tools/firewall.ts
export const firewallTool = {
  name: 'firewall_rule',
  async execute(input: { port: number; subnet: string }) {
    const VULTR_API_KEY = process.env.VULTR_API_KEY;
    await fetch('https://api.vultr.com/v2/firewalls/{id}/rules', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VULTR_API_KEY}` },
      body: JSON.stringify({
        protocol: 'tcp',
        port: input.port.toString(),
        subnet: input.subnet,
        subnet_size: 32,
      })
    });
  }
};
```

### P1: DB/Redis 생성

**현재 실제 작업**
```bash
# Storage 서버 (64.176.226.119)
docker run -d \
  --name vsvs-kr-postgres \
  -e POSTGRES_DB=vsvs_kr \
  -e POSTGRES_USER=vsvs_kr \
  -e POSTGRES_PASSWORD=<password> \
  -p 5433:5432 \
  -v vsvs-kr-postgres-data:/var/lib/postgresql/data \
  postgres:15

docker run -d \
  --name vsvs-kr-redis \
  -p 6380:6379 \
  -v vsvs-kr-redis-data:/data \
  redis:7-alpine
```

**필요한 구현**
```typescript
// 새 파일: mcp-server/src/tools/database.ts
export const databaseCreateTool = {
  name: 'database_create',
  async execute(input: { projectName: string; port?: number }) {
    return withSSH(SERVERS.storage.ip, async (ssh) => {
      const port = input.port || await allocateDbPort(ssh);
      const password = generateSecurePassword();

      await ssh.exec(`docker run -d \\
        --name ${input.projectName}-postgres \\
        -e POSTGRES_DB=${input.projectName} \\
        -e POSTGRES_USER=${input.projectName} \\
        -e POSTGRES_PASSWORD=${password} \\
        -p ${port}:5432 \\
        -v ${input.projectName}-postgres-data:/var/lib/postgresql/data \\
        postgres:15`);

      return {
        port,
        connectionString: `postgresql://${input.projectName}:${password}@${SERVERS.storage.ip}:${port}/${input.projectName}`
      };
    });
  }
};
```

---

## 단계별 상세 비교 (현재 상태)

### 1단계: SSOT 포트 등록 ✅

| 항목 | 실제 | 코드 | 상태 |
|------|------|------|------|
| 포트 범위 (production) | 4100-4499 | 4100-4499 | ✅ |
| 포트 범위 (staging) | 4500-4999 | 4500-4999 | ✅ |
| 포트 범위 (preview) | 5000-5499 | 5000-5499 | ✅ |
| 컨테이너 확인 명령 | docker ps | docker ps | ✅ |

### 2단계: Storage 서버 DB/Redis 생성 ❌

| 항목 | 실제 | 코드 | 상태 |
|------|------|------|------|
| DB 생성 | docker run | 미구현 | ❌ |
| Redis 생성 | docker run | 미구현 | ❌ |
| 포트 할당 | 수동 | 미구현 | ❌ |

### 3단계: App 서버 ENV 파일 생성 ⚠️

| 항목 | 실제 | 코드 | 상태 |
|------|------|------|------|
| DB 호스트 | 64.176.226.119 | db.codeb.kr | ⚠️ |
| DB 포트 | 프로젝트별 다름 | 기본 5432 | ⚠️ |
| Redis 포트 | 프로젝트별 다름 | 기본 6379 | ⚠️ |

### 4단계: Vultr 방화벽 규칙 추가 ❌

| 항목 | 실제 | 코드 | 상태 |
|------|------|------|------|
| 방화벽 규칙 추가 | vultr-cli | 미구현 | ❌ |

### 5단계: PowerDNS 존 추가 ⚠️

| 항목 | 실제 | 코드 | 상태 |
|------|------|------|------|
| 존 생성 | pdnsutil create-zone | 미구현 | ❌ |
| 레코드 추가 | pdnsutil add-record | HTTP API | ⚠️ |
| 리로드 | pdns_control reload | 미구현 | ❌ |

### 6단계: Caddy 설정 추가 ✅

| 항목 | 실제 | 코드 | 상태 |
|------|------|------|------|
| 기본 구조 | reverse_proxy | reverse_proxy | ✅ |
| www 리다이렉트 | 수동 추가 | 미지원 | ⚠️ |
| 로그 설정 | 없음 | 포함 | ✅ |
| 리로드 | systemctl reload | systemctl reload | ✅ |

### 7단계: GitHub Actions 워크플로우 ✅

| 항목 | 실제 | 코드 생성 | 상태 |
|------|------|----------|------|
| 배포 방식 | MCP API 호출 | MCP API 호출 | ✅ |
| 포트 관리 | 동적 조회 | 동적 조회 | ✅ |

### 8단계: 컨테이너 배포 (Blue-Green) ✅

| 항목 | 실제 | 코드 | 상태 |
|------|------|------|------|
| 런타임 | Docker | Docker | ✅ |
| 배포 명령 | docker run | docker run | ✅ |
| 헬스체크 | --health-cmd | --health-cmd | ✅ |
| 재시작 정책 | --restart always | --restart always | ✅ |

---

## 파일별 수정 필요 사항

| 파일 | 변경 내용 | 우선순위 | 상태 |
|------|----------|----------|------|
| `deploy.ts` | Docker 기반 전환 | P0 | ✅ 완료 |
| `slot.ts` | Docker 명령 사용 | P0 | ✅ 완료 |
| `servers.ts` | 포트 범위 동기화 | P0 | ✅ 완료 |
| `domain.ts` | 존 생성 추가 | P1 | 🔲 미완료 |
| `firewall.ts` | 새 파일 생성 | P1 | 🔲 미완료 |
| `database.ts` | 새 파일 생성 | P1 | 🔲 미완료 |
| `workflow.ts` | ENV 템플릿 개선 | P2 | 🔲 미완료 |

---

## 결론

v7.0.30+ 에서 핵심 변경(Docker 전환, 포트 동기화)이 완료되었습니다.

**완료됨:**
- ✅ Podman/Quadlet → Docker 전환
- ✅ 포트 범위 SSOT 동기화
- ✅ 헬스체크 Docker 네이티브 방식

**아직 필요:**
- 🔲 DNS 존 생성 자동화
- 🔲 Vultr 방화벽 자동화
- 🔲 DB/Redis 생성 자동화
- 🔲 www 리다이렉트 자동 추가

이러한 P1 기능들은 현재 수동 작업으로 수행되고 있으며, 향후 자동화가 필요합니다.
