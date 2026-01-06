# CodeB v5.0 - Self-hosted Blue-Green Deployment

> **Self-hosted Runner + Quadlet + systemd + Podman** 아키텍처

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CodeB v5.0 Self-hosted Architecture                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Developer                                                              │
│      │                                                                  │
│      ▼                                                                  │
│  ┌─────────┐     ┌──────────────────────────────────────────────────┐  │
│  │  GitHub │────▶│              App Server (158.247.203.55)          │  │
│  │  Push   │     │  ┌─────────────────────────────────────────────┐ │  │
│  └─────────┘     │  │         GitHub Self-hosted Runner           │ │  │
│                  │  │  • actions-runner (systemd service)         │ │  │
│                  │  │  • Build & Push to local registry           │ │  │
│                  │  └─────────────────────────────────────────────┘ │  │
│                  │                       │                          │  │
│                  │                       ▼                          │  │
│                  │  ┌─────────────────────────────────────────────┐ │  │
│                  │  │              Quadlet + systemd              │ │  │
│                  │  │  • myapp-staging-blue.container             │ │  │
│                  │  │  • myapp-staging-green.container            │ │  │
│                  │  │  • Podman rootless containers               │ │  │
│                  │  └─────────────────────────────────────────────┘ │  │
│                  │                       │                          │  │
│                  │                       ▼                          │  │
│                  │  ┌─────────────────────────────────────────────┐ │  │
│                  │  │                   Caddy                     │ │  │
│                  │  │  • Reverse proxy (Blue/Green switch)        │ │  │
│                  │  │  • Auto SSL (Let's Encrypt)                 │ │  │
│                  │  └─────────────────────────────────────────────┘ │  │
│                  └──────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 핵심 컴포넌트

### 1. GitHub Self-hosted Runner

```bash
# 서버에 설치된 Self-hosted Runner
/opt/actions-runner/
├── run.sh
├── config.sh
└── _work/          # 빌드 작업 디렉토리
```

**systemd 서비스:**
```ini
# /etc/systemd/system/actions-runner.service
[Unit]
Description=GitHub Actions Runner
After=network.target

[Service]
ExecStart=/opt/actions-runner/run.sh
User=runner
WorkingDirectory=/opt/actions-runner
Restart=always

[Install]
WantedBy=multi-user.target
```

### 2. Quadlet (Podman + systemd 통합)

```bash
# Quadlet 컨테이너 정의 위치
~/.config/containers/systemd/     # User mode (rootless)
├── myapp-staging-blue.container
├── myapp-staging-green.container
├── myapp-production-blue.container
└── myapp-production-green.container
```

**Quadlet 컨테이너 예시:**
```ini
# ~/.config/containers/systemd/myapp-staging-blue.container
[Unit]
Description=MyApp Staging Blue Slot
After=network-online.target

[Container]
Image=localhost/myapp:latest
ContainerName=myapp-staging-blue
PublishPort=3000:3000
EnvironmentFile=/opt/codeb/projects/myapp/.env.staging
Label=project=myapp
Label=environment=staging
Label=slot=blue
HealthCmd=curl -f http://localhost:3000/health || exit 1
HealthInterval=10s
HealthTimeout=5s
HealthRetries=3

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

### 3. Podman (Rootless)

```bash
# 로컬 이미지 빌드 (Self-hosted Runner에서)
podman build -t localhost/myapp:$SHA .
podman tag localhost/myapp:$SHA localhost/myapp:latest

# systemd로 컨테이너 관리 (Quadlet)
systemctl --user daemon-reload
systemctl --user start myapp-staging-blue
systemctl --user status myapp-staging-blue
systemctl --user stop myapp-staging-blue

# 로그 확인
journalctl --user -u myapp-staging-blue -f
```

### 4. Caddy (Reverse Proxy)

```caddyfile
# /etc/caddy/sites/myapp-staging.caddy
myapp-staging.codeb.dev {
    reverse_proxy localhost:3000 {
        health_uri /health
        health_interval 10s
    }

    encode gzip

    header {
        X-CodeB-Project myapp
        X-CodeB-Environment staging
        X-CodeB-Slot blue
    }
}
```

---

## 배포 플로우

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Blue-Green Deploy Flow                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Git Push                                                         │
│       │                                                              │
│       ▼                                                              │
│  2. Self-hosted Runner (서버에서 직접 빌드)                           │
│       │  • git checkout                                              │
│       │  • podman build -t localhost/myapp:$SHA .                    │
│       │                                                              │
│       ▼                                                              │
│  3. Deploy to Inactive Slot                                          │
│       │  • Quadlet 파일 생성/수정                                     │
│       │  • systemctl --user daemon-reload                            │
│       │  • systemctl --user start myapp-staging-green                │
│       │                                                              │
│       ▼                                                              │
│  4. Health Check                                                     │
│       │  • curl http://localhost:3001/health                         │
│       │  • Preview URL: myapp-green.preview.codeb.dev                │
│       │                                                              │
│       ▼                                                              │
│  5. Promote (수동 또는 자동)                                          │
│       │  • Caddy 설정 변경 (port 3000 → 3001)                        │
│       │  • systemctl reload caddy                                    │
│       │                                                              │
│       ▼                                                              │
│  6. Grace Period (48시간)                                            │
│       │  • 이전 슬롯 유지 (롤백 대비)                                  │
│       │  • 48시간 후 자동 정리                                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 디렉토리 구조

### 서버 구조

```
/opt/codeb/
├── runner/                     # GitHub Self-hosted Runner
│   ├── actions-runner/
│   │   ├── run.sh
│   │   └── config.sh
│   └── _work/
│
├── projects/                   # 프로젝트별 설정
│   └── myapp/
│       ├── .env.staging
│       ├── .env.production
│       └── source/             # 소스 코드
│
├── registry/                   # SSOT 레지스트리
│   ├── ssot.json
│   └── slots/
│       ├── myapp-staging.json
│       └── myapp-production.json
│
├── quadlet/                    # Quadlet 템플릿
│   └── templates/
│       └── container.template
│
└── logs/
    └── deployments/

~/.config/containers/systemd/   # Quadlet 컨테이너 정의 (User)
├── myapp-staging-blue.container
├── myapp-staging-green.container
└── ...

/etc/caddy/
├── Caddyfile
└── sites/
    ├── myapp-staging.caddy
    └── myapp-production.caddy
```

---

## GitHub Actions Workflow

### deploy.yml (Self-hosted Runner)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: self-hosted  # Self-hosted Runner

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Get inactive slot
        id: slot
        run: |
          REGISTRY="/opt/codeb/registry/slots/${{ github.event.repository.name }}-staging.json"
          if [ -f "$REGISTRY" ]; then
            CURRENT=$(jq -r '.activeSlot' "$REGISTRY")
          else
            CURRENT="blue"
          fi

          if [ "$CURRENT" = "blue" ]; then
            echo "target=green" >> $GITHUB_OUTPUT
            echo "port=3001" >> $GITHUB_OUTPUT
          else
            echo "target=blue" >> $GITHUB_OUTPUT
            echo "port=3000" >> $GITHUB_OUTPUT
          fi

      - name: Build image
        run: |
          podman build -t localhost/${{ github.event.repository.name }}:${{ github.sha }} .
          podman tag localhost/${{ github.event.repository.name }}:${{ github.sha }} \
                      localhost/${{ github.event.repository.name }}:latest

      - name: Generate Quadlet
        run: |
          mkdir -p ~/.config/containers/systemd
          cat > ~/.config/containers/systemd/${{ github.event.repository.name }}-staging-${{ steps.slot.outputs.target }}.container << 'EOF'
          [Unit]
          Description=${{ github.event.repository.name }} Staging ${{ steps.slot.outputs.target }}
          After=network-online.target

          [Container]
          Image=localhost/${{ github.event.repository.name }}:${{ github.sha }}
          ContainerName=${{ github.event.repository.name }}-staging-${{ steps.slot.outputs.target }}
          PublishPort=${{ steps.slot.outputs.port }}:3000
          EnvironmentFile=/opt/codeb/projects/${{ github.event.repository.name }}/.env.staging
          Label=project=${{ github.event.repository.name }}
          Label=environment=staging
          Label=slot=${{ steps.slot.outputs.target }}
          Label=version=${{ github.sha }}
          HealthCmd=curl -f http://localhost:3000/health || exit 1
          HealthInterval=10s

          [Service]
          Restart=always

          [Install]
          WantedBy=default.target
          EOF

      - name: Start container
        run: |
          systemctl --user daemon-reload
          systemctl --user restart ${{ github.event.repository.name }}-staging-${{ steps.slot.outputs.target }}

      - name: Health check
        run: |
          echo "Waiting for container to be healthy..."
          sleep 5
          for i in {1..30}; do
            if curl -sf http://localhost:${{ steps.slot.outputs.port }}/health > /dev/null; then
              echo "✅ Health check passed"
              exit 0
            fi
            echo "Attempt $i/30..."
            sleep 2
          done
          echo "❌ Health check failed"
          exit 1

      - name: Update registry
        run: |
          REGISTRY="/opt/codeb/registry/slots/${{ github.event.repository.name }}-staging.json"
          mkdir -p /opt/codeb/registry/slots

          if [ ! -f "$REGISTRY" ]; then
            echo '{"projectName":"${{ github.event.repository.name }}","environment":"staging","activeSlot":"blue","blue":{"state":"empty","port":3000},"green":{"state":"empty","port":3001}}' > "$REGISTRY"
          fi

          jq --arg slot "${{ steps.slot.outputs.target }}" \
             --arg version "${{ github.sha }}" \
             --arg time "$(date -Iseconds)" \
             '.[$slot].state = "deployed" | .[$slot].version = $version | .[$slot].deployedAt = $time | .lastUpdated = $time' \
             "$REGISTRY" > /tmp/registry.json
          mv /tmp/registry.json "$REGISTRY"

      - name: Output preview URL
        run: |
          echo "## 🚀 Deployment Complete" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Slot:** ${{ steps.slot.outputs.target }}" >> $GITHUB_STEP_SUMMARY
          echo "**Port:** ${{ steps.slot.outputs.port }}" >> $GITHUB_STEP_SUMMARY
          echo "**Preview URL:** https://${{ github.event.repository.name }}-${{ steps.slot.outputs.target }}.preview.codeb.dev" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Run \`we promote ${{ github.event.repository.name }}\` to switch traffic." >> $GITHUB_STEP_SUMMARY
```

### promote.yml

```yaml
name: Promote

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

jobs:
  promote:
    runs-on: self-hosted

    steps:
      - name: Get slot info
        id: slot
        run: |
          REGISTRY="/opt/codeb/registry/slots/${{ github.event.repository.name }}-${{ inputs.environment }}.json"
          ACTIVE=$(jq -r '.activeSlot' "$REGISTRY")

          if [ "$ACTIVE" = "blue" ]; then
            echo "new=green" >> $GITHUB_OUTPUT
            echo "old=blue" >> $GITHUB_OUTPUT
            echo "port=3001" >> $GITHUB_OUTPUT
          else
            echo "new=blue" >> $GITHUB_OUTPUT
            echo "old=green" >> $GITHUB_OUTPUT
            echo "port=3000" >> $GITHUB_OUTPUT
          fi

      - name: Verify deployed slot
        run: |
          REGISTRY="/opt/codeb/registry/slots/${{ github.event.repository.name }}-${{ inputs.environment }}.json"
          STATE=$(jq -r '.["${{ steps.slot.outputs.new }}"].state' "$REGISTRY")

          if [ "$STATE" != "deployed" ]; then
            echo "❌ Slot ${{ steps.slot.outputs.new }} is not deployed (state: $STATE)"
            exit 1
          fi

      - name: Update Caddy
        run: |
          sudo tee /etc/caddy/sites/${{ github.event.repository.name }}-${{ inputs.environment }}.caddy << EOF
          ${{ github.event.repository.name }}-${{ inputs.environment }}.codeb.dev {
              reverse_proxy localhost:${{ steps.slot.outputs.port }} {
                  health_uri /health
                  health_interval 10s
              }
              encode gzip
              header {
                  X-CodeB-Slot ${{ steps.slot.outputs.new }}
              }
          }
          EOF
          sudo systemctl reload caddy

      - name: Update registry
        run: |
          REGISTRY="/opt/codeb/registry/slots/${{ github.event.repository.name }}-${{ inputs.environment }}.json"
          GRACE_TIME=$(date -d '+48 hours' -Iseconds)

          jq --arg new "${{ steps.slot.outputs.new }}" \
             --arg old "${{ steps.slot.outputs.old }}" \
             --arg grace "$GRACE_TIME" \
             --arg time "$(date -Iseconds)" \
             '.activeSlot = $new | .[$new].state = "active" | .[$old].state = "grace" | .[$old].graceExpiresAt = $grace | .lastUpdated = $time' \
             "$REGISTRY" > /tmp/registry.json
          mv /tmp/registry.json "$REGISTRY"

      - name: Summary
        run: |
          echo "## ✅ Promote Complete" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Traffic switched:** ${{ steps.slot.outputs.old }} → ${{ steps.slot.outputs.new }}" >> $GITHUB_STEP_SUMMARY
          echo "**URL:** https://${{ github.event.repository.name }}-${{ inputs.environment }}.codeb.dev" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Previous slot in grace period for 48 hours." >> $GITHUB_STEP_SUMMARY
```

---

## 4-Server 역할

| 서버 | IP | 역할 | 서비스 |
|------|-----|------|--------|
| **App** | 158.247.203.55 | 앱 실행 | Self-hosted Runner, Podman, Caddy, Quadlet |
| **Streaming** | 141.164.42.213 | 실시간 | Centrifugo |
| **Storage** | 64.176.226.119 | 데이터 | PostgreSQL, Redis |
| **Backup** | 141.164.37.63 | 백업 | ENV 백업, Prometheus, Grafana |

---

## CLI 명령어

```bash
# 배포 (workflow_dispatch 트리거)
we deploy myapp                    # GitHub Actions 워크플로우 실행

# Promote
we promote myapp                   # 트래픽 전환

# 롤백
we rollback myapp                  # 즉시 이전 슬롯으로

# Slot 상태
we slot status myapp               # Quadlet/systemd 상태

# 서비스 관리 (systemd)
we service restart myapp blue      # systemctl --user restart
we service logs myapp blue         # journalctl --user -u
we service status myapp            # 전체 상태
```

---

## 설치

```bash
# App 서버 초기 설정
curl -fsSL https://codeb.dev/install.sh | bash

# 설치 내용:
# 1. Podman 설치 (rootless)
# 2. Quadlet 설정
# 3. Caddy 설치
# 4. GitHub Self-hosted Runner 설치
# 5. systemd 사용자 서비스 활성화
# 6. CodeB CLI 설치
```

---

## Version: 5.0.0
