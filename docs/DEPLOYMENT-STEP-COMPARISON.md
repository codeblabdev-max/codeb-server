# CodeB v7.0 - 실제 배포 vs MCP API/CLI 코드 비교

> 2026-01-13 vsvs-kr 배포 과정 기준 상세 분석

---

## 요약: 주요 불일치 사항

| 구분 | 실제 배포 | MCP API/CLI 코드 | 상태 |
|------|----------|------------------|------|
| **컨테이너 런타임** | Docker | Podman + Quadlet | ❌ 불일치 |
| **포트 범위** | 4100-4499 (SSOT) | 4000-4499 (코드) | ❌ 불일치 |
| **DNS 관리** | pdnsutil CLI | PowerDNS HTTP API | ⚠️ 방식 다름 |
| **방화벽** | vultr-cli | 미구현 | ❌ 누락 |
| **DB/Redis 생성** | docker run (Storage서버) | 미구현 | ❌ 누락 |

---

## 단계별 상세 비교

### 1단계: SSOT 포트 등록

#### 실제 수행 작업
```bash
# App 서버 (158.247.203.55)
ssh root@158.247.203.55
vi /opt/codeb/registry/ssot.json

# 수동으로 추가:
{
  "projects": {
    "vsvs-kr": {
      "ports": {
        "production": { "blue": 4102, "green": 4103 }
      }
    }
  },
  "ports": {
    "allocated": {
      "4102": { "project": "vsvs-kr", "slot": "blue" },
      "4103": { "project": "vsvs-kr", "slot": "green" }
    }
  }
}
```

#### MCP API 코드 (deploy.ts:416-485)
```typescript
async function allocateBasePort(ssh, environment, _projectName): Promise<number> {
  // ❌ 문제: 포트 범위가 SSOT와 불일치
  const ranges: Record<Environment, { start: number; end: number }> = {
    staging: { start: 3000, end: 3499 },     // SSOT: 4500-4999
    production: { start: 4000, end: 4499 },  // SSOT: 4100-4499
    preview: { start: 5000, end: 5999 },     // SSOT: 5000-5499
  };

  // ✅ 좋은점: SSOT + podman ps + ss 명령으로 중복 확인
  const usedPorts = new Set([...registeredPorts, ...runningPorts, ...listeningPorts]);

  // ❌ 문제: podman ps 사용 (실제는 docker ps)
  const portsResult = await ssh.exec(
    `podman ps --format '{{.Ports}}' | grep -oE '[0-9]+->3000'`
  );
}
```

#### CLI 코드 (ssot.js)
- `ssotClient.getStatus()`, `ssotClient.listProjects()` 등 MCP API 호출
- 직접 포트 할당 로직 없음 (MCP API에 위임)

#### 차이점 분석
| 항목 | 실제 | 코드 |
|------|------|------|
| 포트 범위 시작점 | production: 4100 | production: 4000 |
| 컨테이너 확인 명령 | docker ps | podman ps |
| 수정 방식 | 수동 JSON 편집 | API 자동 할당 |

---

### 2단계: Storage 서버 DB/Redis 생성

#### 실제 수행 작업
```bash
# Storage 서버 (64.176.226.119)
ssh root@64.176.226.119

# PostgreSQL 컨테이너 생성 (포트 5433)
docker run -d \
  --name vsvs-kr-postgres \
  -e POSTGRES_DB=vsvs_kr \
  -e POSTGRES_USER=vsvs_kr \
  -e POSTGRES_PASSWORD=<password> \
  -p 5433:5432 \
  -v vsvs-kr-postgres-data:/var/lib/postgresql/data \
  postgres:15

# Redis 컨테이너 생성 (포트 6380)
docker run -d \
  --name vsvs-kr-redis \
  -p 6380:6379 \
  -v vsvs-kr-redis-data:/data \
  redis:7-alpine
```

#### MCP API 코드
```typescript
// ❌ 완전 누락 - DB/Redis 생성 도구 없음

// workflow.ts의 ENV 템플릿만 생성:
function generateEnvTemplate(params) {
  if (database) {
    content += `DATABASE_URL=postgresql://postgres:password@db.codeb.kr:5432/${projectName}`;
    // ⚠️ 기본 포트 5432만 사용 - 프로젝트별 포트 미지원
  }
  if (redis) {
    content += `REDIS_URL=redis://db.codeb.kr:6379/0`;
    // ⚠️ 기본 포트 6379만 사용 - 프로젝트별 포트 미지원
  }
}
```

#### 누락된 기능
```typescript
// 필요한 도구: database_create
interface DatabaseCreateInput {
  projectName: string;
  dbType: 'postgres' | 'mysql';
  port?: number;  // 자동 할당 가능
}

// 필요한 도구: redis_create
interface RedisCreateInput {
  projectName: string;
  port?: number;  // 자동 할당 가능
}
```

---

### 3단계: App 서버 ENV 파일 생성

#### 실제 수행 작업
```bash
# App 서버 (158.247.203.55)
mkdir -p /opt/codeb/projects/vsvs-kr
cat > /opt/codeb/projects/vsvs-kr/.env.production << 'EOF'
NODE_ENV=production
PORT=3000

# Storage 서버 연결
DATABASE_URL=postgresql://vsvs_kr:<password>@64.176.226.119:5433/vsvs_kr
REDIS_URL=redis://64.176.226.119:6380/0

# ... 기타 설정
EOF
```

#### MCP API 코드 (workflow.ts:734-771)
```typescript
function generateEnvTemplate(params) {
  // ⚠️ 문제: 고정된 포트와 호스트명 사용
  if (database) {
    content += `DATABASE_URL=postgresql://postgres:password@db.codeb.kr:5432/${projectName}`;
    // 실제: 64.176.226.119:5433 (프로젝트별 다른 포트)
  }
  if (redis) {
    content += `REDIS_URL=redis://db.codeb.kr:6379/0`;
    // 실제: 64.176.226.119:6380 (프로젝트별 다른 포트)
  }
}
```

#### 차이점 분석
| 항목 | 실제 | 코드 |
|------|------|------|
| DB 호스트 | 64.176.226.119 | db.codeb.kr |
| DB 포트 | 5433 (프로젝트별) | 5432 (고정) |
| Redis 포트 | 6380 (프로젝트별) | 6379 (고정) |
| 사용자명 | vsvs_kr | postgres |

---

### 4단계: Vultr 방화벽 규칙 추가

#### 실제 수행 작업
```bash
# 로컬에서 vultr-cli 사용
vultr-cli firewall rule create <storage-group-id> \
  --protocol tcp \
  --port 5433 \
  --subnet 158.247.203.55/32

vultr-cli firewall rule create <storage-group-id> \
  --protocol tcp \
  --port 6380 \
  --subnet 158.247.203.55/32
```

#### MCP API 코드
```typescript
// ❌ 완전 누락 - 방화벽 도구 없음
```

#### 누락된 기능
```typescript
// 필요한 도구: firewall_rule_create
interface FirewallRuleInput {
  groupId: string;           // Vultr 방화벽 그룹 ID
  protocol: 'tcp' | 'udp';
  port: number;
  subnet: string;            // 허용할 IP/CIDR
}

// Vultr API 연동 필요
const VULTR_API_KEY = process.env.VULTR_API_KEY;
await fetch('https://api.vultr.com/v2/firewalls/{id}/rules', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${VULTR_API_KEY}` },
  body: JSON.stringify({ protocol, port, subnet })
});
```

---

### 5단계: PowerDNS 존 추가

#### 실제 수행 작업
```bash
# App 서버 (158.247.203.55) - PowerDNS가 시스템 서비스로 실행
pdnsutil create-zone vsvs.kr ns1.codeb.kr hostmaster.codeb.kr
pdnsutil add-record vsvs.kr @ A 300 158.247.203.55
pdnsutil add-record vsvs.kr www A 300 158.247.203.55
pdns_control reload

# 확인
dig @8.8.8.8 vsvs.kr A
```

#### MCP API 코드 (domain.ts:65-96)
```typescript
// PowerDNS HTTP API 사용 (pdnsutil CLI 아님)
const PDNS_API_URL = process.env.PDNS_API_URL || 'http://localhost:8081/api/v1';
const PDNS_API_KEY = process.env.PDNS_API_KEY || '';

async function pdnsRequest(method, path, body) {
  const url = `${PDNS_API_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'X-API-Key': PDNS_API_KEY,  // ⚠️ 환경변수 필요
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// zone 생성 기능 없음 - 레코드 추가만 있음
async function addDNSRecord(zone, type, name, content) {
  await pdnsRequest('PATCH', `/servers/localhost/zones/${zone}.`, { rrsets });
  // ⚠️ 문제: 존이 없으면 실패
}
```

#### 차이점 분석
| 항목 | 실제 | 코드 |
|------|------|------|
| 존 생성 | pdnsutil create-zone | ❌ 미지원 |
| 레코드 추가 | pdnsutil add-record | HTTP API (PATCH) |
| 리로드 | pdns_control reload | ❌ 미지원 |
| 인증 | 없음 (CLI 직접 실행) | API Key 필요 |

---

### 6단계: Caddy 설정 추가

#### 실제 수행 작업
```bash
# App 서버 (158.247.203.55)
cat > /etc/caddy/sites/vsvs.kr.caddy << 'EOF'
vsvs.kr {
    reverse_proxy localhost:4102
    encode gzip
    header {
        X-Powered-By "CodeB"
        X-Project "vsvs-kr"
    }
}

www.vsvs.kr {
    redir https://vsvs.kr{uri} permanent
}
EOF

systemctl reload caddy
```

#### MCP API 코드 (domain.ts:439-487)
```typescript
async function setupCaddyConfig(domain, projectName, environment, port, ssl) {
  const config = ssl ? `
${domain} {
    reverse_proxy localhost:${port}
    encode gzip
    header {
        X-Powered-By "CodeB"
        X-Project "${projectName}"
        X-Environment "${environment}"
    }
    log {
        output file /var/log/caddy/${safeDomain}.log
        format json
    }
}
` : `http://${domain} { ... }`;

  await execCommand('app', `echo '${escapedConfig}' > /etc/caddy/sites/${safeDomain}.caddy`);
}

// ✅ Caddy 리로드 구현됨
await execCommand('app', 'systemctl reload caddy');
```

#### 차이점 분석
| 항목 | 실제 | 코드 |
|------|------|------|
| 기본 구조 | ✅ 일치 | ✅ 일치 |
| www 리다이렉트 | 수동 추가 | ❌ 미지원 |
| 로그 설정 | 없음 | ✅ 포함 |
| 리로드 | ✅ | ✅ |

---

### 7단계: GitHub Actions 워크플로우

#### 실제 vsvs-kr 워크플로우 (추정)
```yaml
# Self-hosted Runner (App Server)에서 실행
- name: Build and Push
  run: |
    docker build -t ghcr.io/org/vsvs-kr:${{ github.sha }} .
    docker push ghcr.io/org/vsvs-kr:${{ github.sha }}

- name: Deploy Blue-Green
  run: |
    # 하드코딩된 포트
    BLUE_PORT=4102
    GREEN_PORT=4103

    docker pull ghcr.io/org/vsvs-kr:${{ github.sha }}
    docker run -d --name vsvs-kr-blue -p 4102:3000 ...
```

#### MCP API 생성 워크플로우 (workflow.ts:455-614)
```yaml
# ✅ MCP API 호출 방식 (권장)
- name: Deploy to Staging via CodeB API
  run: |
    RESPONSE=$(curl -sf -X POST "https://api.codeb.kr/api/tool" \
      -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
      -d '{
        "tool": "deploy",
        "params": {
          "projectName": "${projectName}",
          "environment": "staging",
          "image": "ghcr.io/..."
        }
      }')
```

#### 차이점 분석
| 항목 | 실제 | 코드 생성 |
|------|------|----------|
| 포트 관리 | 하드코딩 | MCP API 동적 조회 |
| 배포 방식 | docker run 직접 | MCP API 호출 |
| 장점 | 단순함 | 중앙 관리, 충돌 방지 |
| 단점 | 포트 충돌 위험 | API 의존성 |

---

### 8단계: 컨테이너 배포 (Blue-Green)

#### 실제 수행 작업
```bash
# GitHub Actions Runner에서 실행
docker pull ghcr.io/org/vsvs-kr:latest
docker stop vsvs-kr-blue 2>/dev/null || true
docker rm vsvs-kr-blue 2>/dev/null || true
docker run -d \
  --name vsvs-kr-blue \
  --env-file /opt/codeb/projects/vsvs-kr/.env.production \
  -p 4102:3000 \
  ghcr.io/org/vsvs-kr:latest
```

#### MCP API 코드 (deploy.ts:127-211)
```typescript
// ❌ Quadlet/systemd 방식 (실제와 다름)
const quadletPath = `/etc/containers/systemd/${containerName}.container`;
const quadletContent = generateQuadletFile({...});

await ssh.writeFile(quadletPath, quadletContent);
await ssh.exec(`systemctl daemon-reload`);
await ssh.exec(`systemctl start ${serviceName}`, { timeout: 120000 });
```

#### 생성되는 Quadlet 파일 (deploy.ts:301-357)
```ini
[Container]
Image=${config.image}
ContainerName=${containerName}
PublishPort=${config.port}:3000
EnvironmentFile=${config.envFile}
AutoUpdate=registry

# ❌ Podman 전용 옵션
PodmanArgs=--memory=512m --cpus=1

[Service]
Restart=always
```

#### 차이점 분석
| 항목 | 실제 | 코드 |
|------|------|------|
| 런타임 | Docker | Podman (Quadlet) |
| 서비스 관리 | docker run | systemctl |
| 컨테이너 파일 | 없음 | /etc/containers/systemd/*.container |
| 재시작 정책 | --restart=always | [Service] Restart=always |

---

## 개선 필요 사항 정리

### P0 (긴급)

#### 1. 런타임 변경: Quadlet → Docker
```typescript
// deploy.ts 수정 필요
// AS-IS (Podman/Quadlet)
await ssh.exec(`systemctl start ${serviceName}`);

// TO-BE (Docker)
await ssh.exec(`docker pull ${imageUrl}`);
await ssh.exec(`docker stop ${containerName} || true`);
await ssh.exec(`docker rm ${containerName} || true`);
await ssh.exec(`docker run -d --name ${containerName} \
  --env-file ${envFile} \
  -p ${port}:3000 \
  --restart=always \
  ${imageUrl}`);
```

#### 2. 포트 범위 동기화
```typescript
// deploy.ts의 allocateBasePort 수정
const ranges: Record<Environment, { start: number; end: number }> = {
  staging: { start: 4500, end: 4999 },    // SSOT와 일치
  production: { start: 4100, end: 4499 }, // SSOT와 일치
  preview: { start: 5000, end: 5499 },    // SSOT와 일치
};
```

### P1 (중요)

#### 3. PowerDNS CLI 연동 또는 API 설정
```typescript
// domain.ts에 존 생성 추가
async function createDNSZone(zoneName: string) {
  // 방법 1: pdnsutil CLI
  await execCommand('app', `pdnsutil create-zone ${zoneName} ns1.codeb.kr`);
  await execCommand('app', `pdns_control reload`);

  // 방법 2: HTTP API (기존 방식 확장)
  await pdnsRequest('POST', '/servers/localhost/zones', {
    name: `${zoneName}.`,
    kind: 'Master',
    nameservers: ['ns1.codeb.kr.']
  });
}
```

#### 4. 방화벽 자동화 도구 추가
```typescript
// 새 파일: mcp-server/src/tools/firewall.ts
export const firewallTool = {
  name: 'firewall_rule',
  async execute(input: { port: number; subnet: string }) {
    const VULTR_API_KEY = process.env.VULTR_API_KEY;
    await fetch('https://api.vultr.com/v2/firewalls/xxx/rules', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VULTR_API_KEY}` },
      body: JSON.stringify({
        protocol: 'tcp',
        port: input.port,
        subnet: input.subnet,
      })
    });
  }
};
```

#### 5. DB/Redis 생성 도구 추가
```typescript
// 새 파일: mcp-server/src/tools/database.ts
export const databaseCreateTool = {
  name: 'database_create',
  async execute(input: { projectName: string; port?: number }) {
    return withSSH(SERVERS.storage.ip, async (ssh) => {
      const port = input.port || await allocateDbPort(ssh);
      await ssh.exec(`docker run -d \
        --name ${input.projectName}-postgres \
        -e POSTGRES_DB=${input.projectName} \
        -e POSTGRES_USER=${input.projectName} \
        -e POSTGRES_PASSWORD=${generatePassword()} \
        -p ${port}:5432 \
        -v ${input.projectName}-postgres-data:/var/lib/postgresql/data \
        postgres:15`);
      return { port, connectionString: `...` };
    });
  }
};
```

### P2 (개선)

#### 6. www 리다이렉트 자동 추가
```typescript
// domain.ts의 setupCaddyConfig 수정
if (addWwwRedirect && !domain.startsWith('www.')) {
  config += `
www.${domain} {
    redir https://${domain}{uri} permanent
}
`;
}
```

#### 7. 포트 조회 API (GitHub Actions용)
```typescript
// 새 도구: port_get
export const portGetTool = {
  name: 'port_get',
  async execute(input: { projectName: string; environment: string }) {
    const slots = await getSlotRegistry(input.projectName, input.environment);
    return {
      blue: slots.blue.port,
      green: slots.green.port,
      active: slots[slots.activeSlot].port
    };
  }
};
```

---

## 파일별 수정 필요 사항

| 파일 | 변경 내용 | 우선순위 |
|------|----------|----------|
| `deploy.ts` | Quadlet→Docker, 포트 범위 수정 | P0 |
| `slot.ts` | podman→docker 명령 | P0 |
| `workflow.ts` | Quadlet 템플릿→Docker 명령 | P0 |
| `domain.ts` | 존 생성 추가, www 리다이렉트 | P1 |
| `firewall.ts` | 새 파일 생성 | P1 |
| `database.ts` | 새 파일 생성 | P1 |
| `servers.ts` | 포트 범위 상수 수정 | P0 |

---

## 결론

현재 MCP API/CLI 코드는 **Podman + Quadlet + systemd** 기반으로 설계되어 있으나,
실제 서버 환경은 **Docker**를 사용하고 있어 근본적인 불일치가 있습니다.

vsvs-kr 배포는 수동 작업으로 성공했으나, 이를 자동화하려면:

1. **즉시**: deploy.ts, slot.ts, workflow.ts의 런타임을 Docker로 변경
2. **단기**: 포트 범위를 SSOT와 동기화, DNS 존 생성 기능 추가
3. **중기**: 방화벽, DB/Redis 생성 자동화 도구 추가

**핵심 변경**: `systemctl start` → `docker run -d`
