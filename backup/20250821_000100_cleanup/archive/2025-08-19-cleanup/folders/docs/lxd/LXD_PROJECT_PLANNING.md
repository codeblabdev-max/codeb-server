# 🚀 LXD Container Management CLI System - 프로젝트 기획서

## 📋 목차
1. [프로젝트 개요](#프로젝트-개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [기술 스택](#기술-스택)
4. [CLI 명령어 구조](#cli-명령어-구조)
5. [CI/CD 파이프라인](#cicd-파이프라인)
6. [데이터베이스 설계](#데이터베이스-설계)
7. [보안 고려사항](#보안-고려사항)
8. [로드맵](#로드맵)

---

## 프로젝트 개요

### 비전
**"단 하나의 명령어로 완전한 개발 환경을 구축하는 통합 관리 시스템"**

### 핵심 목표
- LXD 컨테이너 기반 격리된 프로젝트 환경
- PostgreSQL + Redis 자동 프로비저닝
- PowerDNS를 통한 자동 도메인 생성
- Git 저장소 자동 연동
- CI/CD 파이프라인 자동 구성

### 주요 특징
```yaml
One-Command-Deploy: 단일 명령어로 전체 스택 배포
Container-Isolation: LXD를 통한 완벽한 환경 격리
Auto-DNS: PowerDNS 연동 자동 도메인 생성
Database-Ready: PostgreSQL + Redis 자동 설정
Git-Integration: GitHub/GitLab 자동 연동
CI/CD-Pipeline: 자동 빌드/테스트/배포
```

---

## 시스템 아키텍처

### 전체 구성도
```
┌──────────────────────────────────────────────────────────┐
│                    CLI Interface Layer                     │
│              (lxdctl create/deploy/manage)                │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│                   API Gateway (Node.js)                   │
│                    ├── REST API                           │
│                    ├── WebSocket (실시간)                 │
│                    └── GraphQL (선택적)                   │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│                  Core Services Layer                      │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐     │
│  │ LXD Manager │  │ DB Manager  │  │ DNS Manager  │     │
│  │             │  │ PostgreSQL  │  │   PowerDNS   │     │
│  │ Containers  │  │   Redis     │  │   Records    │     │
│  └─────────────┘  └─────────────┘  └──────────────┘     │
└───────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│                 Infrastructure Layer                      │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐     │
│  │     LXD     │  │  PostgreSQL │  │    Redis     │     │
│  │  Containers │  │   Cluster   │  │   Cluster    │     │
│  └─────────────┘  └─────────────┘  └──────────────┘     │
└───────────────────────────────────────────────────────────┘
```

### 컴포넌트 상세

#### 1. CLI Layer
```typescript
interface CLICommands {
  // 프로젝트 관리
  'lxdctl create <project>': '새 프로젝트 생성',
  'lxdctl deploy <project>': '프로젝트 배포',
  'lxdctl list': '프로젝트 목록',
  'lxdctl status <project>': '프로젝트 상태',
  'lxdctl delete <project>': '프로젝트 삭제',
  
  // 데이터베이스 관리
  'lxdctl db create <project>': 'DB 생성',
  'lxdctl db backup <project>': 'DB 백업',
  'lxdctl db restore <project>': 'DB 복원',
  
  // DNS 관리
  'lxdctl dns add <domain>': 'DNS 레코드 추가',
  'lxdctl dns list': 'DNS 레코드 목록',
  
  // CI/CD
  'lxdctl pipeline create': 'CI/CD 파이프라인 생성',
  'lxdctl pipeline trigger': '파이프라인 실행'
}
```

#### 2. API Gateway
```javascript
// API 엔드포인트 구조
const endpoints = {
  // 프로젝트 관리
  'POST /api/projects': '프로젝트 생성',
  'GET /api/projects': '프로젝트 목록',
  'GET /api/projects/:id': '프로젝트 상세',
  'PUT /api/projects/:id': '프로젝트 수정',
  'DELETE /api/projects/:id': '프로젝트 삭제',
  
  // LXD 컨테이너
  'POST /api/containers': '컨테이너 생성',
  'GET /api/containers/:id/exec': '명령 실행',
  'GET /api/containers/:id/logs': '로그 조회',
  
  // 데이터베이스
  'POST /api/databases': 'DB 생성',
  'POST /api/databases/:id/backup': '백업 실행',
  
  // DNS
  'POST /api/dns/records': 'DNS 레코드 생성',
  'GET /api/dns/zones': 'DNS 존 목록',
  
  // CI/CD
  'POST /api/pipelines': '파이프라인 생성',
  'POST /api/pipelines/:id/trigger': '파이프라인 실행',
  'GET /api/pipelines/:id/status': '파이프라인 상태'
}
```

---

## 기술 스택

### Core Technologies
```yaml
Container Platform:
  - LXD 5.x: 시스템 컨테이너 관리
  - Docker: 애플리케이션 컨테이너 (LXD 내부)

Database:
  - PostgreSQL 15: 메인 데이터베이스
  - Redis 7: 캐싱 & 세션 관리
  - SQLite: 로컬 메타데이터

DNS & Networking:
  - PowerDNS: DNS 서버
  - Nginx: 리버스 프록시
  - Wireguard: VPN (선택적)

Backend:
  - Node.js 20: API 서버
  - Express/Fastify: 웹 프레임워크
  - TypeScript: 타입 안정성

CLI:
  - Commander.js: CLI 프레임워크
  - Inquirer.js: 대화형 프롬프트
  - Chalk: 터미널 스타일링

CI/CD:
  - GitHub Actions: GitHub 저장소
  - GitLab CI: GitLab 저장소
  - Drone CI: 자체 호스팅 옵션
  - Jenkins: 엔터프라이즈 옵션
```

---

## CLI 명령어 구조

### 기본 명령어 체계
```bash
# 기본 구조
lxdctl [resource] [action] [options]

# 예시
lxdctl project create myapp --db postgres --cache redis
lxdctl deploy myapp --domain myapp.example.com --ssl
lxdctl pipeline setup myapp --github user/repo
```

### 상세 명령어 스펙

#### 프로젝트 생성
```bash
lxdctl project create <name> [options]
  --db postgres|mysql|mongo     # 데이터베이스 타입
  --cache redis|memcached        # 캐시 타입
  --runtime node|python|go       # 런타임
  --port 3000                    # 애플리케이션 포트
  --domain example.com           # 도메인
  --ssl                          # SSL 자동 발급
  --git <repo-url>              # Git 저장소
  --env <env-file>              # 환경 변수 파일
```

#### 배포 명령어
```bash
lxdctl deploy <project> [options]
  --branch main                  # Git 브랜치
  --build                       # 빌드 실행
  --test                        # 테스트 실행
  --rollback                    # 이전 버전으로 롤백
  --blue-green                  # Blue-Green 배포
  --canary 10                   # Canary 배포 (10%)
```

#### 모니터링 명령어
```bash
lxdctl status <project>          # 프로젝트 상태
lxdctl logs <project> --tail 100 # 로그 확인
lxdctl metrics <project>         # 메트릭 조회
lxdctl exec <project> <command>  # 명령 실행
```

---

## CI/CD 파이프라인

### Pipeline 구조
```yaml
name: LXD Project Pipeline

stages:
  - build
  - test
  - deploy
  - verify

build:
  stage: build
  script:
    - lxdctl container exec $PROJECT npm install
    - lxdctl container exec $PROJECT npm run build
  artifacts:
    - dist/
    - build/

test:
  stage: test
  script:
    - lxdctl container exec $PROJECT npm test
    - lxdctl container exec $PROJECT npm run lint
  coverage:
    - coverage/

deploy:
  stage: deploy
  script:
    - lxdctl deploy $PROJECT --branch $BRANCH
    - lxdctl dns update $PROJECT.$DOMAIN
    - lxdctl ssl renew $PROJECT
  environment:
    name: production
    url: https://$PROJECT.$DOMAIN

verify:
  stage: verify
  script:
    - lxdctl health-check $PROJECT
    - lxdctl smoke-test $PROJECT
```

### Git Integration

#### GitHub Actions
```yaml
# .github/workflows/lxd-deploy.yml
name: Deploy to LXD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install LXD CLI
        run: |
          curl -fsSL https://your-server/install.sh | bash
          lxdctl config set server ${{ secrets.LXD_SERVER }}
          lxdctl config set token ${{ secrets.LXD_TOKEN }}
      
      - name: Deploy Project
        run: |
          lxdctl deploy ${{ github.event.repository.name }} \
            --branch ${{ github.ref_name }} \
            --commit ${{ github.sha }}
      
      - name: Run Tests
        run: lxdctl test ${{ github.event.repository.name }}
```

#### GitLab CI
```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - deploy

variables:
  PROJECT_NAME: $CI_PROJECT_NAME
  LXD_SERVER: $LXD_SERVER_URL

before_script:
  - apt-get update && apt-get install -y curl
  - curl -fsSL https://your-server/install.sh | bash
  - lxdctl config set server $LXD_SERVER
  - lxdctl config set token $LXD_TOKEN

deploy:
  stage: deploy
  script:
    - lxdctl deploy $PROJECT_NAME --branch $CI_COMMIT_BRANCH
  only:
    - main
    - develop
```

### Webhook Integration
```javascript
// webhook-handler.js
app.post('/webhook/github', (req, res) => {
  const { repository, ref, commits } = req.body;
  
  // 자동 배포 트리거
  if (ref === 'refs/heads/main') {
    exec(`lxdctl deploy ${repository.name} --auto`, (error) => {
      if (!error) {
        // Slack/Discord 알림
        notify(`✅ ${repository.name} 배포 완료`);
      }
    });
  }
});
```

---

## 데이터베이스 설계

### 메인 데이터베이스 (PostgreSQL)

#### Projects 테이블
```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    container_id VARCHAR(255),
    domain VARCHAR(255),
    status ENUM('creating', 'running', 'stopped', 'error'),
    runtime VARCHAR(50),
    port INTEGER,
    git_repository VARCHAR(500),
    git_branch VARCHAR(100) DEFAULT 'main',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_projects_name ON projects(name);
CREATE INDEX idx_projects_status ON projects(status);
```

#### Databases 테이블
```sql
CREATE TABLE databases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    type ENUM('postgresql', 'mysql', 'mongodb', 'redis'),
    name VARCHAR(255),
    host VARCHAR(255),
    port INTEGER,
    username VARCHAR(255),
    password_encrypted TEXT,
    connection_string TEXT,
    size_mb INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### DNS Records 테이블
```sql
CREATE TABLE dns_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    zone VARCHAR(255),
    name VARCHAR(255),
    type ENUM('A', 'AAAA', 'CNAME', 'MX', 'TXT'),
    content TEXT,
    ttl INTEGER DEFAULT 3600,
    priority INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Deployments 테이블
```sql
CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    version VARCHAR(50),
    git_commit VARCHAR(40),
    status ENUM('pending', 'building', 'deploying', 'success', 'failed', 'rolled_back'),
    deploy_type ENUM('standard', 'blue_green', 'canary', 'rollback'),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    deployed_by VARCHAR(255),
    error_message TEXT,
    metadata JSONB
);
```

#### CI/CD Pipelines 테이블
```sql
CREATE TABLE pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    name VARCHAR(255),
    config JSONB,
    triggers JSONB,
    last_run_at TIMESTAMP,
    last_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID REFERENCES pipelines(id),
    run_number INTEGER,
    status ENUM('queued', 'running', 'success', 'failed', 'cancelled'),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    logs TEXT,
    artifacts JSONB
);
```

### Redis 데이터 구조
```javascript
// 세션 관리
session:{user_id}: {
  token: "jwt_token",
  expires: "timestamp"
}

// 프로젝트 캐시
project:{name}: {
  id: "uuid",
  container_id: "lxd_id",
  status: "running",
  last_deploy: "timestamp"
}

// 실시간 로그 스트림
logs:{project_id}: [
  "log line 1",
  "log line 2"
]

// 메트릭
metrics:{project_id}:{metric_name}: {
  cpu: 45.2,
  memory: 1024,
  disk: 5120,
  timestamp: "timestamp"
}

// 배포 큐
deploy_queue: [
  {project_id: "uuid", action: "deploy"},
  {project_id: "uuid", action: "rollback"}
]
```

---

## 보안 고려사항

### 인증 & 인가
```yaml
Authentication:
  - JWT 토큰 기반 인증
  - API Key for CLI
  - OAuth2 (GitHub, GitLab)
  - 2FA 지원

Authorization:
  - RBAC (Role-Based Access Control)
  - Project-level permissions
  - Resource quotas
  - API rate limiting
```

### 네트워크 보안
```yaml
Network Security:
  - Container isolation (LXD security profiles)
  - Private networks per project
  - Firewall rules (iptables/nftables)
  - SSL/TLS everywhere
  - VPN access for management
```

### 데이터 보안
```yaml
Data Security:
  - Encryption at rest (LUKS)
  - Encryption in transit (TLS 1.3)
  - Secrets management (Vault/Sealed Secrets)
  - Database encryption
  - Backup encryption
```

### 컨테이너 보안
```yaml
Container Security:
  - AppArmor/SELinux profiles
  - Seccomp filters
  - Capability dropping
  - Read-only root filesystem
  - Non-root containers
  - Resource limits (CPU, Memory, Disk)
```

---

## 로드맵

### Phase 1: MVP (4주)
- [x] 기획 및 설계
- [ ] 기본 CLI 구조 구현
- [ ] LXD 컨테이너 생성/관리
- [ ] PostgreSQL 자동 프로비저닝
- [ ] PowerDNS 연동
- [ ] 기본 API 서버

### Phase 2: Core Features (4주)
- [ ] Redis 통합
- [ ] Git 저장소 연동
- [ ] 기본 CI/CD 파이프라인
- [ ] 웹 대시보드 (기본)
- [ ] 로깅 시스템

### Phase 3: Advanced Features (4주)
- [ ] Blue-Green 배포
- [ ] Canary 배포
- [ ] 자동 스케일링
- [ ] 모니터링 (Prometheus/Grafana)
- [ ] 백업/복원 자동화

### Phase 4: Enterprise Features (4주)
- [ ] 멀티 테넌시
- [ ] RBAC 구현
- [ ] 감사 로그
- [ ] 고가용성 (HA)
- [ ] 재해 복구 (DR)

### Phase 5: Ecosystem (지속)
- [ ] 플러그인 시스템
- [ ] Marketplace
- [ ] Template library
- [ ] Community edition vs Enterprise
- [ ] SaaS 버전

---

## 구현 우선순위

### 즉시 구현 (Week 1-2)
1. **기본 CLI 스켈레톤**
   ```bash
   npm init
   npm install commander inquirer chalk axios
   ```

2. **API 서버 기본 구조**
   ```javascript
   // server.js
   const express = require('express');
   const app = express();
   
   // 라우트 설정
   app.use('/api/projects', projectRoutes);
   app.use('/api/containers', containerRoutes);
   app.use('/api/dns', dnsRoutes);
   ```

3. **LXD 연동 모듈**
   ```javascript
   // lxd-manager.js
   class LXDManager {
     async createContainer(name, config) {}
     async startContainer(id) {}
     async stopContainer(id) {}
     async deleteContainer(id) {}
   }
   ```

### 다음 구현 (Week 3-4)
1. **데이터베이스 연동**
2. **PowerDNS API 통합**
3. **Git Webhook 처리**
4. **기본 배포 플로우**

---

## 성공 지표 (KPIs)

### 기술적 지표
- 컨테이너 생성 시간: < 30초
- 배포 완료 시간: < 2분
- API 응답 시간: < 200ms
- 시스템 가동률: > 99.9%

### 비즈니스 지표
- 프로젝트 생성에서 배포까지: < 5분
- CLI 명령어 학습 시간: < 30분
- 일일 배포 횟수: > 100회
- 동시 프로젝트 수: > 1000개

---

## 참고 자료

### 기술 문서
- [LXD Documentation](https://linuxcontainers.org/lxd/)
- [PowerDNS API](https://doc.powerdns.com/authoritative/http-api/)
- [PostgreSQL Replication](https://www.postgresql.org/docs/current/warm-standby.html)
- [Redis Cluster](https://redis.io/topics/cluster-tutorial)

### 유사 프로젝트
- [Dokku](https://dokku.com/) - Docker powered mini-Heroku
- [CapRover](https://caprover.com/) - Easy app deployment
- [Coolify](https://coolify.io/) - Self-hosted Heroku alternative
- [Porter](https://porter.run/) - Kubernetes powered PaaS

---

**작성일**: 2025-08-18  
**버전**: 1.0.0  
**상태**: 🟢 기획 단계