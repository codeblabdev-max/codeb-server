# GitHub Actions + Quadlet 배포 매뉴얼

## 개요

CodeB는 **GitHub Actions + Podman Quadlet** 조합을 사용하여 배포합니다.
- **GitHub Actions**: 이미지 빌드 및 GHCR 푸시 (GitHub-hosted runner)
- **Podman Quadlet**: 서버에서 컨테이너 관리 (systemd 통합)
- **SSH Deploy**: GitHub Actions에서 SSH로 서버 배포 트리거

> PM2는 사용하지 않습니다. 모든 컨테이너는 Quadlet/systemd로 관리됩니다.

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │ Push Code   │ ──▶ │ Build Image │ ──▶ │ Push GHCR   │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│                             │                               │
└─────────────────────────────│───────────────────────────────┘
                              │
                              ▼ SSH Deploy
┌─────────────────────────────────────────────────────────────┐
│                   App Server (158.247.203.55)               │
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │ Pull Image  │ ──▶ │ Quadlet     │ ──▶ │ systemd     │   │
│  │ from GHCR   │     │ Restart     │     │ Service     │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. GitHub Secrets 설정

### 필수 Secrets

| Secret 이름 | 설명 | 값 |
|------------|------|-----|
| `GHCR_PAT` | GitHub Container Registry 접근 토큰 | `ghp_xxxxx` |
| `SSH_PRIVATE_KEY` | 서버 접근용 SSH 개인키 | `-----BEGIN...` |
| `SSH_HOST` | 배포 대상 서버 IP | `158.247.203.55` |
| `SSH_USER` | SSH 사용자 | `root` |

### Secrets 설정 방법

```bash
# we CLI로 자동 설정 (권장)
we workflow secrets

# 또는 수동 설정
# GitHub Repository → Settings → Secrets and variables → Actions
```

---

## 2. GitHub Actions Workflow

### `.github/workflows/deploy.yml`

```yaml
name: Build and Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ════════════════════════════════════════════════════════
  # Build Job (GitHub-hosted runner)
  # ════════════════════════════════════════════════════════
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
      image_digest: ${{ steps.build.outputs.digest }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_PAT }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ════════════════════════════════════════════════════════
  # Deploy Job (SSH to Server)
  # ════════════════════════════════════════════════════════
  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push'

    steps:
      - name: Determine environment
        id: env
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
            echo "environment=production" >> $GITHUB_OUTPUT
            echo "port=4000" >> $GITHUB_OUTPUT
          else
            echo "environment=staging" >> $GITHUB_OUTPUT
            echo "port=4500" >> $GITHUB_OUTPUT
          fi

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            # GHCR 로그인
            echo "${{ secrets.GHCR_PAT }}" | podman login ghcr.io -u ${{ github.actor }} --password-stdin

            # 프로젝트 정보
            PROJECT="${{ github.event.repository.name }}"
            ENV="${{ steps.env.outputs.environment }}"
            IMAGE="${{ needs.build.outputs.image_tag }}"

            # 이미지 풀
            podman pull ${IMAGE} || exit 1

            # Quadlet 서비스 재시작
            systemctl --user restart ${PROJECT}-${ENV}.service || \
            systemctl restart ${PROJECT}-${ENV}.service || \
            echo "Quadlet service not found, using podman directly"

            # 직접 컨테이너 재시작 (Quadlet 미사용 시)
            if ! systemctl is-active --quiet ${PROJECT}-${ENV}.service 2>/dev/null; then
              podman stop ${PROJECT}-${ENV} 2>/dev/null || true
              podman rm ${PROJECT}-${ENV} 2>/dev/null || true

              # ENV 파일 확인
              ENV_FILE="/opt/codeb/env-backup/${PROJECT}/${ENV}/current.env"
              if [ -f "$ENV_FILE" ]; then
                podman run -d \
                  --name ${PROJECT}-${ENV} \
                  --network codeb-main \
                  -p ${{ steps.env.outputs.port }}:3000 \
                  --restart always \
                  --env-file "$ENV_FILE" \
                  ${IMAGE}
              else
                podman run -d \
                  --name ${PROJECT}-${ENV} \
                  --network codeb-main \
                  -p ${{ steps.env.outputs.port }}:3000 \
                  --restart always \
                  -e NODE_ENV=${ENV} \
                  ${IMAGE}
              fi
            fi

            # 헬스체크
            sleep 5
            curl -sf http://localhost:${{ steps.env.outputs.port }}/api/health || echo "Health check warning"

            echo "Deployment complete!"
```

---

## 3. Quadlet 파일 구조

### 파일 위치

```
/etc/containers/systemd/
├── myapp-production.container    # Production 앱
├── myapp-staging.container       # Staging 앱
├── myapp-production.env          # Production ENV
└── myapp-staging.env             # Staging ENV
```

### 예시: `myapp-production.container`

```ini
[Unit]
Description=MyApp Production
After=network-online.target
Wants=network-online.target

[Container]
ContainerName=myapp-production
Image=ghcr.io/codeblabdev-max/myapp:latest
PublishPort=4001:3000

# ENV 파일 사용
EnvironmentFile=/etc/containers/systemd/myapp-production.env

# 또는 개별 환경변수
# Environment=NODE_ENV=production
# Environment=PORT=3000

# 네트워크
Network=codeb-main

# 헬스체크
HealthCmd=curl -sf http://localhost:3000/api/health || exit 1
HealthInterval=30s
HealthTimeout=10s
HealthRetries=3

# 리소스 제한
Memory=1G
CPUQuota=200%

# 자동 업데이트 (podman auto-update 사용 시)
AutoUpdate=registry
Label=io.containers.autoupdate=registry

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target default.target
```

### GHCR 인증 파일 (자동 업데이트용)

```ini
# /etc/containers/systemd/myapp-production.container 에 추가
[Container]
# ... 기존 설정 ...

# GHCR 인증 (podman auto-update 사용 시 필요)
Label=io.containers.autoupdate.authfile=/run/user/0/containers/auth.json

[Service]
# 서비스 시작 전 GHCR 로그인
ExecStartPre=/bin/bash -c 'echo "TOKEN" | podman login ghcr.io -u USER --password-stdin'
```

---

## 4. Quadlet 관리 명령어

### 서비스 생성/업데이트

```bash
# Quadlet 파일 수정 후 systemd 리로드
systemctl daemon-reload

# 또는 사용자 서비스로 실행
systemctl --user daemon-reload
```

### 서비스 제어

```bash
# 시작
systemctl start myapp-production.service

# 중지
systemctl stop myapp-production.service

# 재시작
systemctl restart myapp-production.service

# 상태 확인
systemctl status myapp-production.service

# 로그 확인
journalctl -u myapp-production.service -f
```

### 자동 업데이트 (podman auto-update)

```bash
# 수동 업데이트 확인
podman auto-update --dry-run

# 업데이트 실행
podman auto-update

# 자동 업데이트 타이머 활성화
systemctl enable --now podman-auto-update.timer
```

---

## 5. 팀원용 API Key 배포 (SSH 없이)

### 개요

팀원은 SSH 접근 없이 we CLI + HTTP API로 배포합니다.

### API Key 발급

```bash
# Admin이 API Key 발급
we team add
# → 이름, 역할 입력 후 API Key 생성

# 팀원에게 제공
# API Key: codeb_dev_xxxxxxxxxxxx
```

### 팀원 we CLI 설정

```bash
# ~/.codeb/config.json
{
  "apiKey": "codeb_dev_xxxxxxxxxxxx",
  "serverHost": "158.247.203.55"
}
```

### 팀원 배포 명령

```bash
# 배포 (HTTP API 사용)
we deploy myapp --environment staging

# 상태 확인
we scan myapp

# 로그 확인
we logs myapp
```

---

## 6. 서버 API 엔드포인트

web-ui Dashboard에서 제공하는 REST API:

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/deploy` | POST | 배포 실행 |
| `/api/deploy?project=myapp` | GET | 배포 이력 |
| `/api/projects` | GET | 프로젝트 목록 |
| `/api/ssot` | GET | SSOT 상태 |
| `/api/health` | GET | 헬스체크 |
| `/api/env` | GET/POST | ENV 관리 |

### 인증

```bash
# X-API-Key 헤더로 인증
curl -X POST https://app.codeb.kr/api/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Key: codeb_dev_xxxxxxxxxxxx" \
  -d '{"project": "myapp", "environment": "staging"}'
```

---

## 7. 배포 플로우 요약

### Admin (SSH 접근 가능)

```
1. git push main
2. GitHub Actions: Build → Push GHCR
3. GitHub Actions: SSH → 서버 배포
4. Quadlet/systemd 재시작
```

### 팀원 (SSH 접근 불가)

```
1. git push main
2. GitHub Actions: Build → Push GHCR
3. GitHub Actions: SSH → 서버 배포 (자동)

# 또는 수동 배포
we deploy myapp --environment staging
→ HTTP API (X-API-Key 인증)
→ 서버 web-ui가 SSH로 배포 실행
```

---

## 8. 트러블슈팅

### GHCR 로그인 실패

```bash
# 토큰 확인
echo $GHCR_PAT | podman login ghcr.io -u USERNAME --password-stdin

# 권한 확인: repo, read:packages, write:packages
```

### Quadlet 서비스 시작 실패

```bash
# 상태 확인
systemctl status myapp-production.service

# 로그 확인
journalctl -u myapp-production.service -n 50

# Quadlet 파일 검증
/usr/libexec/podman/quadlet --dryrun
```

### SSH 연결 실패

```bash
# SSH 키 확인
ssh -i /path/to/key root@158.247.203.55 "echo ok"

# GitHub Secrets 확인
# SSH_PRIVATE_KEY: 전체 키 (-----BEGIN...-----END)
# SSH_HOST: IP 또는 도메인
```

### 이미지 풀 실패

```bash
# GHCR 로그인 상태 확인
podman login ghcr.io

# 이미지 확인
podman images | grep myapp

# 수동 풀
podman pull ghcr.io/codeblabdev-max/myapp:latest
```

---

## 9. 베스트 프랙티스

### 이미지 태깅

```yaml
# main → latest
# develop → develop
# PR → pr-{number}
# 커밋 → sha-{hash}
```

### 롤백

```bash
# 이전 이미지로 롤백
podman stop myapp-production
podman rm myapp-production
podman run -d --name myapp-production ... ghcr.io/xxx/myapp:sha-abc1234
```

### 무중단 배포

```bash
# Blue-Green 배포
# 1. 새 컨테이너 시작 (다른 포트)
podman run -d --name myapp-production-new -p 4002:3000 ...

# 2. 헬스체크
curl http://localhost:4002/api/health

# 3. Caddy 설정 변경 (4001 → 4002)
# 4. 이전 컨테이너 중지
```

---

## 관련 문서

- [QUICK_START.md](./QUICK_START.md) - 빠른 시작 가이드
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처
- [DEPLOYMENT_RULES.md](../DEPLOYMENT_RULES.md) - 배포 규칙
