# 🚀 Coolify + PowerDNS 자동 배포 시스템 - 완전 문서화

**한 줄 명령으로 Git 저장소를 라이브 웹사이트로 배포하는 완전 자동화 시스템**

## 📋 프로젝트 개요

이 프로젝트는 Coolify PaaS와 PowerDNS를 통합하여 개발자가 터미널에서 단 한 줄의 명령으로 Git 저장소를 완전한 웹 애플리케이션으로 배포할 수 있는 시스템입니다.

### ✨ 주요 기능

- **🔄 Git 저장소 자동 배포**: GitHub/GitLab 저장소에서 직접 빌드 및 배포
- **🌐 자동 도메인 생성**: `your-app.one-q.xyz` 형식의 도메인 자동 할당
- **🔒 SSL 인증서 자동 발급**: Let's Encrypt를 통한 HTTPS 자동 설정
- **📊 DNS 레코드 자동 생성**: PowerDNS API를 통한 DNS 관리
- **🗄️ 데이터베이스 자동 연동**: PostgreSQL, MySQL, Redis, MongoDB 지원
- **⚙️ 환경변수 자동 설정**: 애플리케이션 설정 자동화
- **📱 Coolify 대시보드 통합**: 웹 인터페이스를 통한 관리

## 🏗️ 시스템 아키텍처

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Git Repository│    │  Coolify PaaS   │    │   PowerDNS      │
│                 │───▶│                 │───▶│                 │
│ GitHub/GitLab   │    │ Build & Deploy  │    │ DNS Management  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                         │
                              ▼                         ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │   Docker        │    │ one-q.xyz       │
                    │   Containers    │    │ Domain          │
                    │                 │    │                 │
                    │ Your App        │◀───│ SSL Certificate │
                    └─────────────────┘    └─────────────────┘
```

## 🛠️ 기술 스택

- **Backend**: Node.js + Express.js
- **PaaS**: Coolify (Docker 기반)
- **DNS**: PowerDNS + PowerDNS-Admin
- **Reverse Proxy**: Traefik
- **SSL**: Let's Encrypt (자동 발급)
- **Database**: PostgreSQL, MySQL, Redis, MongoDB
- **Container**: Docker + Docker Compose

## 📦 핵심 파일 구조

```
codeb-server/
├── server-api/
│   ├── coolify-final-server.js      # 메인 통합 서버
│   ├── package.json                 # 의존성 패키지
│   ├── test-*.sh                   # 테스트 스크립트들
│   └── cleanup-*.sh                # 정리 스크립트들
├── docs/                           # 기존 문서들
├── scripts/                        # 자동화 스크립트들
├── templates/                      # 템플릿 파일들
└── infrastructure/                 # 인프라 코드
```

## 🚀 사용법

### 1. 기본 배포 명령

```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "my-awesome-app",
    "gitRepository": "https://github.com/username/my-repo",
    "gitBranch": "main",
    "generateDomain": true
  }'
```

### 2. 데이터베이스 포함 배포

```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "my-fullstack-app",
    "gitRepository": "https://github.com/username/my-repo",
    "databases": [
      {"name": "main", "type": "postgresql"},
      {"name": "cache", "type": "redis"}
    ],
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "APP_NAME", "value": "My App"}
    ]
  }'
```

### 3. 커스텀 도메인 사용

```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "custom-domain-app",
    "gitRepository": "https://github.com/username/my-repo",
    "customDomain": "myapp.mydomain.com",
    "generateDomain": false
  }'
```

## 🔧 핵심 구성 요소

### 1. 메인 서버 (coolify-final-server.js)

```javascript
const CONFIG = {
    SERVER_IP: '141.164.60.51',
    COOLIFY_URL: 'http://141.164.60.51:8000',
    POWERDNS_URL: 'http://141.164.60.51:8081',
    BASE_DOMAIN: 'one-q.xyz',
    SERVER_UUID: 'io0ok40oo0448k80g888ock8',
    API_KEYS: {
        PDNS: '20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5',
        COOLIFY: '7|hhVQUT7DdQEBUD3Ac992z9Zx2OVkaGjXye3f7BtEb0fb5881'
    }
};
```

### 2. PowerDNS 관리자 클래스

```javascript
class PowerDNSManager {
    async createRecord(zone, name, type, content, ttl = 300) {
        const zoneName = zone.endsWith('.') ? zone : `${zone}.`;
        const recordName = `${name}.${zone}.`;
        
        const recordData = {
            rrsets: [{
                name: recordName,
                type: type,
                changetype: 'REPLACE',
                records: [{ content: content, disabled: false }],
                ttl: ttl
            }]
        };

        if (type === 'A') {
            recordData.rrsets[0].records[0].content = content;
        }

        const response = await axios.patch(
            `${this.baseURL}/zones/${zoneName}`, 
            recordData,
            { headers: this.headers, timeout: 10000 }
        );

        return { success: true, record: recordData.rrsets[0] };
    }
}
```

### 3. Coolify API 관리자 클래스

```javascript
class CoolifyAPIManager {
    async deployGitApplication(projectUuid, environmentUuid, config) {
        let fqdnValue;
        if (config.generateDomain) {
            fqdnValue = `${config.name}.${CONFIG.BASE_DOMAIN}`;
        } else if (config.fqdn) {
            fqdnValue = config.fqdn;
        } else {
            fqdnValue = null;
        }

        const appData = {
            project_uuid: projectUuid,
            server_uuid: CONFIG.SERVER_UUID,
            git_repository: config.gitRepository,
            git_branch: config.gitBranch || 'main',
            build_pack: config.buildPack || 'nixpacks',
            name: config.name,
            description: `Git app: ${config.name}`,
            ports_exposes: config.port || '3000',
            environment_name: 'production',
            is_static: false
        };

        if (fqdnValue) {
            appData.fqdn = fqdnValue;
        }

        const response = await axios.post(
            `${this.baseURL}/applications/public`, 
            appData,
            { headers: this.headers, timeout: 60000 }
        );

        // DNS 레코드 자동 생성
        if (fqdnValue && fqdnValue.includes(CONFIG.BASE_DOMAIN)) {
            const subdomain = fqdnValue.split('.')[0];
            await this.createDNSRecord(subdomain);
        }

        return { success: true, application: response.data, domain: fqdnValue };
    }
}
```

## 📊 API 응답 예시

```json
{
  "success": true,
  "deploymentId": "uuid-here",
  "projectName": "my-awesome-app",
  "domain": "my-awesome-app.one-q.xyz",
  "url": "https://my-awesome-app.one-q.xyz",
  "coolify": {
    "projectUuid": "project-uuid",
    "applicationUuid": "app-uuid",
    "dashboardUrl": "http://141.164.60.51:8000/project/project-uuid"
  },
  "databases": [
    {
      "name": "main",
      "type": "postgresql",
      "credentials": {
        "host": "my-awesome-app-main",
        "port": 5432,
        "user": "dbuser",
        "password": "generated-password",
        "database": "my_awesome_app_main"
      }
    }
  ],
  "deploymentLog": [
    {"step": "DNS", "status": "completed"},
    {"step": "Project", "status": "completed"},
    {"step": "Application", "status": "completed"},
    {"step": "Environment Variables", "status": "completed"},
    {"step": "Start Application", "status": "completed"}
  ],
  "results": {
    "dns": true,
    "project": true,
    "application": true,
    "envVars": true,
    "start": true
  }
}
```

## 🔍 핵심 기술 해결 과정

### 1. Applications vs Services 문제 해결

**문제**: API가 Services 대신 Applications을 생성하지 못함
**해결**: 
- Docker Compose 방식 → Git 저장소 방식 변경
- `/applications/public` 엔드포인트 사용
- `project_uuid` + `environment_name` 구조 사용

```javascript
// 올바른 API 구조
const appData = {
    project_uuid: projectUuid,
    server_uuid: CONFIG.SERVER_UUID,
    environment_name: 'production',  // environment_uuid 대신
    git_repository: config.gitRepository,
    // ...
};
```

### 2. Generate Domain 기능 분석

**Coolify 내부 구조**:
```javascript
// getWildcardDomain() 메서드 (Livewire)
public function getWildcardDomain() {
    $server = data_get($this->application, 'destination.server');
    if ($server) {
        $fqdn = generateFqdn($server, $this->application->uuid);
        $this->application->fqdn = $fqdn;
        $this->application->save();
        $this->resetDefaultLabels();
        $this->dispatch('success', 'Wildcard domain generated.');
    }
}

// generateFqdn() 함수
function generateFqdn(Server $server, string $random, bool $forceHttps = false): string {
    $wildcard = data_get($server, 'settings.wildcard_domain');
    if (is_null($wildcard) || $wildcard === '') {
        $wildcard = sslip($server);
    }
    // ...
    return "$scheme://{$random}.$host$path";
}
```

**설정 변경**:
```sql
-- 서버 설정에 wildcard_domain 추가
UPDATE server_settings 
SET wildcard_domain = 'https://one-q.xyz' 
WHERE server_id = (SELECT id FROM servers WHERE uuid = 'io0ok40oo0448k80g888ock8');
```

### 3. PowerDNS 통합

**DNS 레코드 생성**:
```javascript
async createDNSRecord(subdomain) {
    const recordData = {
        rrsets: [{
            name: `${subdomain}.${CONFIG.BASE_DOMAIN}.`,
            type: 'A',
            changetype: 'REPLACE',
            records: [{ content: CONFIG.SERVER_IP, disabled: false }],
            ttl: 300
        }]
    };

    const response = await axios.patch(
        `${CONFIG.POWERDNS_URL}/api/v1/servers/localhost/zones/${CONFIG.BASE_DOMAIN}.`,
        recordData,
        { headers: { 'X-API-Key': CONFIG.API_KEYS.PDNS } }
    );
}
```

## 🎯 지원하는 프레임워크

- **Frontend**: React, Vue.js, Angular, Next.js, Nuxt.js
- **Backend**: Node.js, Python (Django/Flask), PHP, Go, Rust
- **Static Sites**: HTML/CSS/JS, Jekyll, Hugo, Gatsby
- **Build Tools**: Nixpacks (자동 감지), Dockerfile, Buildpacks

## 🗄️ 지원하는 데이터베이스

- **PostgreSQL**: 관계형 데이터베이스
- **MySQL/MariaDB**: 관계형 데이터베이스  
- **Redis**: 키-값 저장소, 캐시
- **MongoDB**: NoSQL 문서 데이터베이스

## 📱 대시보드 기능

Coolify 웹 대시보드 (http://141.164.60.51:8000):

- **📊 실시간 로그 모니터링**
- **🔄 재배포 및 롤백**
- **⚙️ 환경변수 관리**
- **📈 리소스 사용량 모니터링**
- **🌐 도메인 관리 (Generate Domain 버튼)**
- **🔒 SSL 인증서 관리**

## 🧪 테스트 스크립트들

### 1. 기본 PowerDNS 테스트 (`test-powerdns-domain.sh`)
```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "powerdns-test-$(date +%s)",
    "gitRepository": "https://github.com/dungeun/coolify-nextjs-login-app",
    "generateDomain": true
  }'
```

### 2. 완전한 워크플로우 테스트 (`test-complete-workflow.sh`)
```bash
# 배포 → DNS 확인 → SSL 테스트 → 웹사이트 접근
PROJECT_NAME="complete-test-$(date +%s)"
DOMAIN="$PROJECT_NAME.one-q.xyz"

# 1. 배포
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" ...

# 2. DNS 확인
dig +short $DOMAIN

# 3. 웹사이트 접근 테스트
curl -I "https://$DOMAIN"
```

### 3. 프로젝트 정리 (`cleanup-all-test-projects.sh`)
```bash
# 데이터베이스에서 직접 테스트 프로젝트 삭제
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"
DELETE FROM applications WHERE name LIKE '%test%';
DELETE FROM services WHERE name LIKE '%test%';
DELETE FROM projects WHERE name LIKE '%test%';
\""
```

## 🔐 보안 설정

### API 키 관리
```javascript
const CONFIG = {
    API_KEYS: {
        PDNS: process.env.PDNS_API_KEY || 'fallback-key',
        COOLIFY: process.env.COOLIFY_API_TOKEN || 'fallback-token'
    }
};
```

### 방화벽 설정
```bash
# 필요한 포트만 개방
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS  
ufw allow 8000/tcp    # Coolify
ufw allow 8081/tcp    # PowerDNS Admin
ufw allow 22/tcp      # SSH
```

## 🐛 문제 해결 가이드

### 1. Applications vs Services 생성 문제
**증상**: API가 Services를 생성함
**해결**: 
```javascript
// ❌ 잘못된 방식 (Docker Compose)
const appData = { docker_compose_raw: base64Content };

// ✅ 올바른 방식 (Git Repository)
const appData = {
    git_repository: config.gitRepository,
    environment_name: 'production'
};
```

### 2. DNS 전파 지연
**증상**: 도메인이 바로 접근되지 않음
**확인**: 
```bash
# DNS 레코드 확인
dig +short your-app.one-q.xyz

# PowerDNS 레코드 확인
curl -H "X-API-Key: your-key" \
  "http://141.164.60.51:8081/api/v1/servers/localhost/zones/one-q.xyz./rrsets"
```

### 3. SSL 인증서 발급 실패
**증상**: HTTPS 접근 불가
**해결**:
```bash
# Traefik 로그 확인
docker logs coolify

# Let's Encrypt Rate Limit 확인
curl -s "https://crt.sh/?q=one-q.xyz&output=json" | jq length
```

### 4. 422 Validation Error
**증상**: `Request failed with status code 422`
**해결**: `is_force_https_enabled` 파라미터 제거
```javascript
// ❌ 문제가 되는 코드
if (fqdnValue) {
    appData.fqdn = fqdnValue;
    appData.is_force_https_enabled = true;  // 제거 필요
}

// ✅ 수정된 코드
if (fqdnValue) {
    appData.fqdn = fqdnValue;
    // is_force_https_enabled 제거
}
```

## 📈 성능 모니터링

### 시스템 리소스 확인
```bash
# 서버 상태
htop

# Docker 리소스 사용량
docker stats

# 디스크 사용량
df -h

# 메모리 사용량
free -h
```

### 애플리케이션 로그 모니터링
```bash
# Coolify 로그
docker logs coolify -f

# PowerDNS 로그
journalctl -u pdns -f

# 배포 서버 로그
tail -f /var/log/deployment.log
```

## 🎉 완성된 기능 요약

### ✅ 구현 완료된 기능들

1. **한 줄 명령 배포**: `curl` 명령으로 즉시 배포
2. **자동 도메인 생성**: PowerDNS 연동으로 `*.one-q.xyz` 도메인 자동 생성
3. **SSL 자동 발급**: Let's Encrypt를 통한 HTTPS 자동 설정
4. **Applications 생성**: Coolify에서 정확히 Applications로 표시
5. **Generate Domain 기능**: 웹 대시보드의 Generate Domain 버튼 작동
6. **데이터베이스 연동**: PostgreSQL, MySQL, Redis, MongoDB 자동 설정
7. **환경변수 관리**: 자동 환경변수 생성 및 설정
8. **DNS 레코드 관리**: PowerDNS API를 통한 DNS 자동 관리
9. **프로젝트 정리**: 테스트 프로젝트 일괄 삭제 기능
10. **완전 자동화**: Git → 빌드 → 배포 → DNS → SSL 전 과정 자동화

### 🔗 주요 엔드포인트

- **배포 API**: `POST /api/deploy/complete`
- **헬스체크**: `GET /api/health`  
- **프로젝트 목록**: `GET /api/projects`
- **프로젝트 삭제**: `DELETE /api/projects/:uuid`

### 🌍 실제 사용 예시

**명령어**:
```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "my-app",
    "gitRepository": "https://github.com/your-username/your-repo"
  }'
```

**결과**: 
- 🌐 **도메인**: https://my-app.one-q.xyz
- 🔒 **SSL**: 자동 발급 완료
- 📱 **대시보드**: http://141.164.60.51:8000
- ⏱️ **배포 시간**: 약 1-2분

## 📝 개발 과정 요약

### 주요 문제 해결 과정

1. **Services vs Applications 문제** (2025-08-15)
   - 브라우저 네트워크 탭 분석으로 올바른 API 구조 발견
   - SSH로 Coolify 소스코드 직접 분석
   - Git 저장소 방식으로 변경하여 해결

2. **파일 동기화 문제** (2025-08-15)
   - 로컬 파일 수정이 원격 서버에 반영되지 않는 문제
   - `scp` 명령으로 파일 업로드 및 서비스 재시작으로 해결

3. **Generate Domain 기능 분석** (2025-08-15)
   - Coolify 내부 Livewire 구조 분석
   - `getWildcardDomain()` → `generateFqdn()` 함수 구조 파악
   - 서버 설정에 `wildcard_domain` 추가로 해결

4. **PowerDNS 통합** (2025-08-15)
   - DNS 레코드 자동 생성 API 구현
   - 도메인 전파 및 SSL 인증서 자동 발급 확인

### 최종 시스템 아키텍처

```
개발자 터미널 → curl 명령 → 배포 서버 (port 3007)
                    ↓
              Coolify API (port 8000) + PowerDNS API (port 8081)
                    ↓
              Docker 컨테이너 + DNS 레코드 + SSL 인증서
                    ↓
              실제 웹사이트 (https://app.one-q.xyz)
```

**이제 개발자들은 단 한 줄의 명령으로 아이디어를 실제 동작하는 웹사이트로 변환할 수 있습니다!** 🚀