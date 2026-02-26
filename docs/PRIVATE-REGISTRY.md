# Private Docker Registry + Minio 백엔드 설정

> **v7.0.65** - 완료됨 ✅

> **목적**: GHCR 대신 자체 Docker Registry 운영으로 배포 속도 향상 및 외부 의존성 제거

---

## 현재 상태

```
┌─────────────────────────────────────────────────────────────────┐
│                    Private Registry 상태                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ Minio docker-registry 버킷 생성                              │
│  ✅ Registry 설정 파일 생성 (/opt/codeb/config/registry-config.yml) │
│  ✅ Docker Registry 컨테이너 실행 (포트 5000)                     │
│  ✅ Vultr 방화벽 5000 포트 오픈 (App 서버만)                      │
│  ✅ App 서버 insecure-registries 설정                            │
│  ✅ Push/Pull 테스트 완료                                        │
│  ✅ MCP deploy tool 수정 완료                                    │
│  ✅ GitHub Actions 워크플로우 템플릿 생성                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    Private Registry Architecture                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [GitHub Actions]                                               │
│       │                                                         │
│       │ docker push registry.codeb.kr:5000/project:tag          │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Storage Server (64.176.226.119)             │   │
│  │  ┌─────────────────┐    ┌─────────────────────────┐     │   │
│  │  │ Docker Registry │───▶│   Minio (S3 Backend)    │     │   │
│  │  │   (port 5000)   │    │   docker-registry 버킷  │     │   │
│  │  └─────────────────┘    └─────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       │ docker pull registry.codeb.kr:5000/project:tag          │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              App Server (158.247.203.55)                 │   │
│  │  ┌─────────────────┐                                     │   │
│  │  │ Docker Containers│  heeling-blue, workb-green, etc.  │   │
│  │  └─────────────────┘                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## GHCR vs Private Registry 비교

| 항목 | GHCR | Private Registry |
|------|------|------------------|
| 속도 | 외부 네트워크 | 내부 네트워크 (빠름) |
| 비용 | GitHub 요금제 | 자체 스토리지 |
| 의존성 | GitHub 서비스 | 자체 인프라 |
| 보안 | GitHub 토큰 | 자체 인증 |
| 캐시 | GitHub CDN | Minio 로컬 |
| 가용성 | GitHub SLA | 자체 관리 |

---

## 설정 단계

### 1. Minio 버킷 생성

```bash
# Storage 서버에서 실행
ssh root@64.176.226.119

# Minio CLI로 버킷 생성
docker exec -i videopick-minio mc mb local/docker-registry

# 버킷 확인
docker exec -i videopick-minio mc ls local/
```

### 2. Registry 설정 파일 생성

```bash
# /opt/codeb/config/registry-config.yml
mkdir -p /opt/codeb/config

cat > /opt/codeb/config/registry-config.yml << 'EOF'
version: 0.1
log:
  level: info
  formatter: text

storage:
  s3:
    accesskey: videopick
    secretkey: secure_minio_password
    region: us-east-1
    regionendpoint: http://videopick-minio:9000
    bucket: docker-registry
    encrypt: false
    secure: false
    v4auth: true
    rootdirectory: /

  delete:
    enabled: true

  cache:
    blobdescriptor: inmemory

http:
  addr: 0.0.0.0:5000
  headers:
    X-Content-Type-Options: [nosniff]

health:
  storagedriver:
    enabled: true
    interval: 10s
    threshold: 3
EOF
```

### 3. Docker Registry 컨테이너 실행

```bash
# Docker 네트워크 확인 (Minio와 같은 네트워크 사용)
docker network ls | grep minio

# Registry 컨테이너 실행
docker run -d \
  --name codeb-registry \
  --restart always \
  --network videopick-network \
  -p 5000:5000 \
  -v /opt/codeb/config/registry-config.yml:/etc/docker/registry/config.yml:ro \
  registry:2

# 상태 확인
docker logs codeb-registry
```

### 4. 헬스체크

```bash
# Registry API 테스트
curl http://localhost:5000/v2/

# 카탈로그 조회
curl http://localhost:5000/v2/_catalog
```

### 5. Vultr 방화벽 규칙 추가

```bash
# Storage 서버에 5000 포트 오픈
vultr-cli firewall rule create 47ac5479-91b1-4a4e-9e1f-7217a731335d \
  --protocol tcp \
  --port 5000 \
  --ip-type v4 \
  --subnet 158.247.203.55 \
  --size 32 \
  --notes "Docker Registry from App Server"
```

---

## App 서버 설정

### 1. Insecure Registry 허용

```bash
# /etc/docker/daemon.json
ssh root@158.247.203.55

cat > /etc/docker/daemon.json << 'EOF'
{
  "insecure-registries": ["64.176.226.119:5000", "registry.codeb.kr:5000"]
}
EOF

# Docker 재시작
systemctl restart docker
```

### 2. 연결 테스트

```bash
# Registry 접근 테스트
curl http://64.176.226.119:5000/v2/

# 테스트 이미지 push/pull
docker pull alpine:latest
docker tag alpine:latest 64.176.226.119:5000/test:v1
docker push 64.176.226.119:5000/test:v1
docker pull 64.176.226.119:5000/test:v1
```

---

## GitHub Actions 워크플로우

### 템플릿 파일

Private Registry용 워크플로우 템플릿:
- 위치: `cli/templates/github-actions-private-registry.yml`

### 주요 특징

1. **Self-Hosted Runner**: App 서버에서 실행 (내부 네트워크 속도)
2. **Incremental Build**: NPM/SRC 해시 기반 캐시 활용
3. **MCP API 연동**: Blue-Green 배포 자동화

### 워크플로우 설정 예시

```yaml
env:
  # Private Registry (Storage Server)
  REGISTRY: 64.176.226.119:5000
  IMAGE_NAME: myproject

jobs:
  build:
    runs-on: self-hosted  # App 서버의 Self-Hosted Runner
    steps:
      - name: Build and Push
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

  deploy:
    needs: build
    runs-on: self-hosted
    steps:
      - name: Deploy via MCP API
        run: |
          curl -X POST "https://api.codeb.kr/api/deploy" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -d '{"projectName": "myproject", "image": "${{ env.REGISTRY }}/myproject:${{ github.sha }}"}'
```

### 기존 GHCR 워크플로우 마이그레이션

```diff
- REGISTRY: ghcr.io
- IMAGE_NAME: ${{ github.repository }}
+ REGISTRY: 64.176.226.119:5000
+ IMAGE_NAME: myproject

- uses: docker/login-action@v3
-   with:
-     registry: ghcr.io
-     username: ${{ github.actor }}
-     password: ${{ secrets.GITHUB_TOKEN }}
+ # Private Registry는 insecure-registries 설정으로 로그인 불필요
```

---

## DNS 설정 (선택)

```bash
# PowerDNS에 registry.codeb.kr 추가
ssh root@64.176.226.119

docker exec -i pdns-auth pdnsutil add-record codeb.kr registry A 64.176.226.119
docker exec -i pdns-auth pdns_control reload
```

---

## 정리 스크립트

### 오래된 이미지 정리

```bash
#!/bin/bash
# /opt/codeb/scripts/registry-cleanup.sh

REGISTRY_URL="http://localhost:5000"
KEEP_DAYS=7

echo "=== Docker Registry Cleanup ==="

# 모든 레포지토리 조회
REPOS=$(curl -s ${REGISTRY_URL}/v2/_catalog | jq -r '.repositories[]')

for repo in $REPOS; do
    echo "Processing: $repo"
    TAGS=$(curl -s ${REGISTRY_URL}/v2/${repo}/tags/list | jq -r '.tags[]' 2>/dev/null)

    for tag in $TAGS; do
        # latest, production, staging 태그는 보존
        if [[ "$tag" == "latest" || "$tag" == "production" || "$tag" == "staging" ]]; then
            echo "  Keeping: $tag"
            continue
        fi

        # SHA 태그는 7일 후 삭제 표시
        echo "  Mark for cleanup: $tag"
    done
done

echo "Run garbage-collect to reclaim space"
```

### Cron 설정

```bash
# /etc/cron.d/registry-cleanup
0 4 * * 0 root /opt/codeb/scripts/registry-cleanup.sh >> /var/log/registry-cleanup.log 2>&1
```

---

## Minio에 저장된 데이터 확인

```bash
# Registry 데이터 확인
docker exec -i videopick-minio mc ls local/docker-registry/ --recursive | head -20

# 저장 용량 확인
docker exec -i videopick-minio mc du local/docker-registry/
```

---

## 장점

1. **속도**: 내부 네트워크로 push/pull 속도 향상
2. **비용**: GitHub 스토리지 비용 절감
3. **독립성**: GitHub 장애 시에도 배포 가능
4. **보안**: 내부 네트워크에서만 접근 가능
5. **캐시 유지**: 컨테이너 재시작해도 이미지 유지 (Minio 저장)

---

## 체크리스트

- [x] Minio에 docker-registry 버킷 생성
- [x] Registry 설정 파일 생성 (/opt/codeb/config/registry-config.yml)
- [x] Docker Registry 컨테이너 실행
- [x] Vultr 방화벽 5000 포트 오픈 (App 서버만)
- [x] App 서버 insecure-registries 설정
- [x] 연결 테스트 (push/pull)
- [x] MCP deploy tool 수정 (useGhcr 옵션 추가)
- [x] GitHub Actions 워크플로우 템플릿 생성
- [ ] 정리 스크립트 설정 (선택)

---

## MCP Deploy Tool 사용법

### 기본 (Private Registry)

```bash
# Private Registry에서 이미지 Pull (기본값)
/we:deploy myproject

# 명시적으로 이미지 지정
/we:deploy myproject --image 64.176.226.119:5000/myproject:sha-abc1234
```

### GHCR Fallback

```bash
# GHCR 사용 (기존 방식)
/we:deploy myproject --useGhcr

# 이미지 직접 지정
/we:deploy myproject --image ghcr.io/codeb-dev-run/myproject:latest
```

---

## 문제 해결

### Registry 연결 실패

```bash
# Storage 서버에서 Registry 상태 확인
ssh root@64.176.226.119 "docker logs codeb-registry 2>&1 | tail -20"

# Registry 재시작
ssh root@64.176.226.119 "docker restart codeb-registry"
```

### Push 실패 (dial tcp lookup 에러)

설정 파일에서 `redirect: disable: true`가 있는지 확인:

```bash
ssh root@64.176.226.119 "cat /opt/codeb/config/registry-config.yml | grep -A2 redirect"
```

### App 서버에서 Pull 실패

```bash
# Docker 설정 확인
ssh root@158.247.203.55 "cat /etc/docker/daemon.json"

# 예상 출력:
# {
#   "insecure-registries": ["64.176.226.119:5000", "registry.codeb.kr:5000"]
# }
```

---

## 관련 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 전체 아키텍처
- [DEPLOY-FLOW.md](./DEPLOY-FLOW.md) - 배포 흐름
- [deployment-guide.md](./deployment-guide.md) - 배포 가이드
- [cli/templates/github-actions-private-registry.yml](../cli/templates/github-actions-private-registry.yml) - GitHub Actions 템플릿
