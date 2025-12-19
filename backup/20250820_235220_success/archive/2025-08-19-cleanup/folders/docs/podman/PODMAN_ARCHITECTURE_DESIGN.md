# 🚀 Podman + Caddy/Traefik Architecture Design
## Local DB Structure → Server Deployment System

---

## 📋 시스템 개요

### 핵심 아키텍처
```yaml
Local Development:
  - Podman Desktop: 로컬 개발 환경
  - PostgreSQL + Redis: 프로젝트별 격리된 DB
  - Hot Reload: 실시간 코드 변경 반영
  - Local DNS: *.local 도메인 자동 설정

Server Production:
  - Podman Rootless: 보안 강화된 컨테이너
  - Caddy/Traefik: 자동 SSL + 리버스 프록시
  - PostgreSQL + Redis: 프로덕션 DB 인스턴스
  - Automated Deployment: Git 기반 CI/CD
```

### 왜 Podman인가?
- **Docker 호환성**: 100% Docker 이미지/명령어 호환
- **Rootless**: 보안 강화 (root 권한 불필요)
- **Daemonless**: 시스템 리소스 절약
- **Pod 지원**: Kubernetes 스타일 Pod 구조
- **Systemd 통합**: 서비스 관리 용이

---

## 🏗️ 전체 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                   Local Development                        │
│  ┌─────────────────────────────────────────────────┐     │
│  │            Podman Desktop / CLI                  │     │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐          │     │
│  │  │ Project │ │ Project │ │ Project │          │     │
│  │  │   Pod   │ │   Pod   │ │   Pod   │          │     │
│  │  │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │          │     │
│  │  │ │ App │ │ │ │ App │ │ │ │ App │ │          │     │
│  │  │ ├─────┤ │ │ ├─────┤ │ │ ├─────┤ │          │     │
│  │  │ │ PG  │ │ │ │ PG  │ │ │ │ PG  │ │          │     │
│  │  │ ├─────┤ │ │ ├─────┤ │ │ ├─────┤ │          │     │
│  │  │ │Redis│ │ │ │Redis│ │ │ │Redis│ │          │     │
│  │  └─┴─────┴─┘ └─┴─────┴─┘ └─┴─────┴─┘          │     │
│  └─────────────────────────────────────────────────┘     │
│                           ↓                               │
│               [Git Push / Deploy Command]                 │
└──────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│                   Production Server                       │
│  ┌─────────────────────────────────────────────────┐     │
│  │         Caddy/Traefik (Reverse Proxy + SSL)      │     │
│  └──────────────────┬────────────────────────────────┘     │
│                     ↓                                     │
│  ┌─────────────────────────────────────────────────┐     │
│  │              Podman (Rootless Mode)              │     │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐          │     │
│  │  │  Prod   │ │  Prod   │ │  Prod   │          │     │
│  │  │   Pod   │ │   Pod   │ │   Pod   │          │     │
│  │  └─────────┘ └─────────┘ └─────────┘          │     │
│  └─────────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────────┐     │
│  │           Block Storage (100GB)                  │     │
│  │         /mnt/blockstorage/projects              │     │
│  └─────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

---

## 🎯 Pod 구조 설계

### 프로젝트별 Pod 구성
```yaml
# pod-definition.yml
apiVersion: v1
kind: Pod
metadata:
  name: project-${PROJECT_NAME}
  labels:
    app: ${PROJECT_NAME}
    env: ${ENVIRONMENT}
spec:
  containers:
    # 메인 애플리케이션
    - name: app
      image: ${APP_IMAGE}
      ports:
        - containerPort: 3000
      env:
        - name: DATABASE_URL
          value: "postgresql://user:pass@localhost:5432/db"
        - name: REDIS_URL
          value: "redis://localhost:6379"
      volumeMounts:
        - name: app-data
          mountPath: /app/data
        - name: app-uploads
          mountPath: /app/uploads
    
    # PostgreSQL
    - name: postgres
      image: postgres:15-alpine
      env:
        - name: POSTGRES_DB
          value: ${PROJECT_NAME}
        - name: POSTGRES_USER
          value: ${DB_USER}
        - name: POSTGRES_PASSWORD
          value: ${DB_PASSWORD}
      volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
    
    # Redis
    - name: redis
      image: redis:7-alpine
      command: ["redis-server", "--appendonly", "yes"]
      volumeMounts:
        - name: redis-data
          mountPath: /data
  
  volumes:
    - name: app-data
      hostPath:
        path: /mnt/blockstorage/projects/${PROJECT_NAME}/data
    - name: app-uploads
      hostPath:
        path: /mnt/blockstorage/projects/${PROJECT_NAME}/uploads
    - name: postgres-data
      hostPath:
        path: /mnt/blockstorage/postgres/${PROJECT_NAME}
    - name: redis-data
      hostPath:
        path: /mnt/blockstorage/redis/${PROJECT_NAME}
```

---

## 🔧 CLI 도구 설계

### 핵심 명령어 구조
```bash
# 프로젝트 관리
podctl create <project> --git <repo>
podctl deploy <project> --env production
podctl status <project>
podctl logs <project> --container app
podctl exec <project> --container postgres -- psql

# 데이터베이스 관리
podctl db backup <project>
podctl db restore <project> --file backup.sql
podctl db migrate <project>

# 환경 변수 관리
podctl env set <project> KEY=value --env production
podctl env list <project>
podctl env sync <project> --from dev --to prod

# 배포 관리
podctl rollback <project> --version v1.2.3
podctl scale <project> --replicas 3
```

### CLI 구현 (Node.js)
```javascript
#!/usr/bin/env node
// podctl.js

const { Command } = require('commander');
const { exec } = require('child_process');
const fs = require('fs-extra');
const yaml = require('js-yaml');

class PodmanCLI {
  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  setupCommands() {
    this.program
      .name('podctl')
      .description('Podman Project Management CLI')
      .version('1.0.0');

    // Create project
    this.program
      .command('create <project>')
      .description('Create new project with isolated DB')
      .option('--git <repo>', 'Git repository URL')
      .option('--db <type>', 'Database type', 'postgres')
      .option('--cache', 'Enable Redis cache', true)
      .action(async (project, options) => {
        await this.createProject(project, options);
      });

    // Deploy project
    this.program
      .command('deploy <project>')
      .description('Deploy project to server')
      .option('--env <environment>', 'Target environment', 'production')
      .option('--strategy <type>', 'Deployment strategy', 'rolling')
      .action(async (project, options) => {
        await this.deployProject(project, options);
      });
  }

  async createProject(name, options) {
    console.log(`🚀 Creating project: ${name}`);
    
    // 1. Generate pod configuration
    const podConfig = this.generatePodConfig(name, options);
    
    // 2. Create pod with play kube
    await this.execCommand(`podman play kube ${podConfig}`);
    
    // 3. Clone git repository if provided
    if (options.git) {
      await this.cloneRepository(name, options.git);
    }
    
    // 4. Setup database
    await this.setupDatabase(name);
    
    // 5. Configure Caddy/Traefik
    await this.setupReverseProxy(name);
    
    console.log(`✅ Project ${name} created successfully!`);
  }

  async deployProject(name, options) {
    console.log(`📦 Deploying ${name} to ${options.env}`);
    
    // 1. Build application
    await this.buildApplication(name);
    
    // 2. Push to registry (optional)
    await this.pushImage(name);
    
    // 3. Deploy to server
    await this.deployToServer(name, options);
    
    // 4. Run health checks
    await this.healthCheck(name);
    
    console.log(`✅ Deployment complete!`);
  }

  generatePodConfig(name, options) {
    const config = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: `project-${name}`,
        labels: { app: name }
      },
      spec: {
        containers: [
          {
            name: 'app',
            image: `localhost/${name}:latest`,
            ports: [{ containerPort: 3000 }],
            env: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'DATABASE_URL', value: `postgresql://postgres:password@localhost:5432/${name}` },
              { name: 'REDIS_URL', value: 'redis://localhost:6379' }
            ]
          },
          {
            name: 'postgres',
            image: 'postgres:15-alpine',
            env: [
              { name: 'POSTGRES_DB', value: name },
              { name: 'POSTGRES_USER', value: 'postgres' },
              { name: 'POSTGRES_PASSWORD', value: this.generatePassword() }
            ]
          },
          {
            name: 'redis',
            image: 'redis:7-alpine',
            command: ['redis-server', '--appendonly', 'yes']
          }
        ]
      }
    };

    const configPath = `/tmp/${name}-pod.yaml`;
    fs.writeFileSync(configPath, yaml.dump(config));
    return configPath;
  }

  async execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }

  generatePassword() {
    return Math.random().toString(36).slice(-16);
  }
}

// Run CLI
const cli = new PodmanCLI();
cli.program.parse();
```

---

## 🌐 Caddy vs Traefik 비교

### Caddy (권장)
```yaml
장점:
  - 자동 HTTPS: Let's Encrypt 자동 발급/갱신
  - 간단한 설정: Caddyfile 단순 구문
  - 경량: 메모리 사용량 적음
  - HTTP/3 지원: QUIC 프로토콜

설정예시:
  ```caddyfile
  myapp.com {
    reverse_proxy localhost:3001
  }
  
  staging.myapp.com {
    reverse_proxy localhost:3002
  }
  ```
```

### Traefik
```yaml
장점:
  - 동적 설정: Docker/Podman 레이블 기반
  - 대시보드: 웹 UI 제공
  - 미들웨어: 다양한 플러그인
  - 서비스 메시: 마이크로서비스 최적화

설정예시:
  ```yaml
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.myapp.rule=Host(`myapp.com`)"
    - "traefik.http.services.myapp.loadbalancer.server.port=3000"
  ```
```

### Caddy 설정 (권장)
```caddyfile
# /etc/caddy/Caddyfile
{
    email admin@example.com
    acme_ca https://acme-v02.api.letsencrypt.org/directory
}

# 프로젝트별 자동 라우팅
*.project.local {
    @project1 host project1.project.local
    handle @project1 {
        reverse_proxy localhost:3001
    }
    
    @project2 host project2.project.local
    handle @project2 {
        reverse_proxy localhost:3002
    }
}

# 프로덕션 도메인
myapp.com {
    reverse_proxy localhost:3001
    
    # 압축
    encode gzip
    
    # 헤더 설정
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
    }
    
    # 로깅
    log {
        output file /var/log/caddy/myapp.log
        format json
    }
}
```

---

## 💾 로컬 DB 구조

### 프로젝트 메타데이터 (SQLite)
```sql
-- ~/.podctl/projects.db

CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) UNIQUE NOT NULL,
    git_repository TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'created',
    pod_name VARCHAR(255),
    port_app INTEGER,
    port_postgres INTEGER,
    port_redis INTEGER
);

CREATE TABLE deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id),
    version VARCHAR(50),
    environment VARCHAR(50),
    deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50),
    git_commit VARCHAR(40)
);

CREATE TABLE environments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id),
    name VARCHAR(50),
    key VARCHAR(255),
    value TEXT,
    encrypted BOOLEAN DEFAULT FALSE
);
```

### 로컬 파일 구조
```
~/.podctl/
├── config.json              # CLI 설정
├── projects.db             # 프로젝트 메타데이터
├── templates/              # Pod 템플릿
│   ├── nodejs.yaml
│   ├── python.yaml
│   └── golang.yaml
├── scripts/                # 배포 스크립트
│   ├── deploy.sh
│   ├── backup.sh
│   └── restore.sh
└── logs/                   # CLI 로그
    └── podctl.log

/mnt/blockstorage/          # 서버 스토리지
├── projects/
│   ├── project1/
│   │   ├── data/
│   │   ├── uploads/
│   │   └── backups/
│   └── project2/
├── postgres/
│   ├── project1/
│   └── project2/
└── redis/
    ├── project1/
    └── project2/
```

---

## 🚀 배포 워크플로우

### 1. 로컬 개발 → 서버 배포
```bash
# 1. 로컬에서 개발
podctl create myapp --git https://github.com/user/myapp
podctl env set myapp NODE_ENV=development
podctl start myapp

# 2. 코드 변경 및 테스트
git add .
git commit -m "Feature: Add new API"
git push origin main

# 3. 서버로 배포
podctl deploy myapp --env production --server 141.164.60.51

# 자동으로 수행되는 작업:
# - Git pull on server
# - Build container image
# - Database migration
# - Zero-downtime deployment
# - SSL certificate update
# - Health check
```

### 2. CI/CD Pipeline (GitHub Actions)
```yaml
# .github/workflows/deploy.yml
name: Deploy to Podman

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install podctl
        run: |
          curl -fsSL https://your-server/install.sh | bash
          podctl config set server ${{ secrets.SERVER_IP }}
          podctl config set token ${{ secrets.DEPLOY_TOKEN }}
      
      - name: Build and Deploy
        run: |
          podctl build ${{ github.event.repository.name }}
          podctl deploy ${{ github.event.repository.name }} \
            --env production \
            --commit ${{ github.sha }}
      
      - name: Health Check
        run: podctl health ${{ github.event.repository.name }}
```

---

## 📊 모니터링 및 로깅

### Prometheus + Grafana 통합
```yaml
# monitoring-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: monitoring
spec:
  containers:
    - name: prometheus
      image: prom/prometheus
      ports:
        - containerPort: 9090
      volumeMounts:
        - name: prometheus-config
          mountPath: /etc/prometheus
    
    - name: grafana
      image: grafana/grafana
      ports:
        - containerPort: 3000
      env:
        - name: GF_SECURITY_ADMIN_PASSWORD
          value: ${GRAFANA_PASSWORD}
    
    - name: cadvisor
      image: gcr.io/cadvisor/cadvisor
      ports:
        - containerPort: 8080
      volumeMounts:
        - name: rootfs
          mountPath: /rootfs
          readOnly: true
```

### 로그 수집 (Loki)
```yaml
# loki-config.yaml
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h
```

---

## 🔐 보안 설정

### Podman Rootless 설정
```bash
# 사용자 네임스페이스 설정
echo "user.max_user_namespaces=28633" | sudo tee /etc/sysctl.d/userns.conf
sudo sysctl -p /etc/sysctl.d/userns.conf

# Podman rootless 설치
sudo apt install -y podman slirp4netns fuse-overlayfs
systemctl --user enable podman.socket

# 서브UID/GID 설정
sudo usermod --add-subuids 100000-165535 $USER
sudo usermod --add-subgids 100000-165535 $USER
```

### 네트워크 보안
```yaml
# Pod 네트워크 정책
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: project-isolation
spec:
  podSelector:
    matchLabels:
      app: ${PROJECT_NAME}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: caddy
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: ${PROJECT_NAME}
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443
```

---

## 🔄 백업 및 복구

### 자동 백업 스크립트
```bash
#!/bin/bash
# backup.sh

PROJECT=$1
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/mnt/blockstorage/backups/${PROJECT}"

# PostgreSQL 백업
podman exec project-${PROJECT}_postgres_1 \
  pg_dump -U postgres ${PROJECT} | \
  gzip > ${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz

# Redis 백업
podman exec project-${PROJECT}_redis_1 \
  redis-cli BGSAVE

# 파일 백업
tar -czf ${BACKUP_DIR}/files_${TIMESTAMP}.tar.gz \
  /mnt/blockstorage/projects/${PROJECT}/

# S3 업로드 (선택적)
aws s3 cp ${BACKUP_DIR}/ s3://backups/${PROJECT}/ --recursive

# 오래된 백업 삭제 (30일 이상)
find ${BACKUP_DIR} -type f -mtime +30 -delete
```

---

## 📈 성능 최적화

### Podman 성능 튜닝
```bash
# /etc/containers/containers.conf
[containers]
pids_limit = 2048
ulimits = ["nofile=65536:65536"]

[engine]
cgroup_manager = "systemd"
events_logger = "journald"
runtime = "crun"  # crun이 runc보다 빠름

# 스토리지 드라이버 최적화
[storage]
driver = "overlay"
[storage.options.overlay]
mount_program = "/usr/bin/fuse-overlayfs"
```

### 리소스 제한
```yaml
# Pod 리소스 제한
resources:
  limits:
    cpu: "2"
    memory: "2Gi"
  requests:
    cpu: "0.5"
    memory: "512Mi"
```

---

## 🎯 구현 로드맵

### Phase 1: 기본 구조 (Week 1)
- [ ] Podman 설치 및 설정
- [ ] 기본 CLI 도구 개발
- [ ] PostgreSQL + Redis Pod 템플릿
- [ ] Caddy 리버스 프록시 설정

### Phase 2: 핵심 기능 (Week 2)
- [ ] Git 연동 및 자동 배포
- [ ] 환경 변수 관리
- [ ] 데이터베이스 백업/복원
- [ ] 로그 수집 시스템

### Phase 3: 고급 기능 (Week 3)
- [ ] Blue-Green 배포
- [ ] 모니터링 대시보드
- [ ] 자동 스케일링
- [ ] CI/CD 파이프라인

### Phase 4: 프로덕션 준비 (Week 4)
- [ ] 보안 강화
- [ ] 성능 최적화
- [ ] 문서화
- [ ] 테스트 자동화

---

## 💡 실제 사용 예시

```bash
# 1. 프로젝트 생성
podctl create awesome-app \
  --git https://github.com/user/awesome-app \
  --domain awesome-app.com

# 2. 로컬 개발
podctl dev awesome-app
# http://awesome-app.local:3000 접속

# 3. 환경 변수 설정
podctl env set awesome-app DATABASE_URL=postgresql://...
podctl env set awesome-app API_KEY=secret --encrypt

# 4. 배포
podctl deploy awesome-app --env production

# 5. 모니터링
podctl status awesome-app
podctl logs awesome-app --tail 100
podctl metrics awesome-app

# 6. 백업
podctl backup awesome-app
podctl backup list awesome-app

# 7. 스케일링
podctl scale awesome-app --replicas 3
```

---

**작성일**: 2025-08-18  
**버전**: 1.0.0  
**상태**: 🟢 Podman 아키텍처 설계 완료