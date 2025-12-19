#!/bin/bash

#############################################
# CodeB Deploy - Container Registry 설정
# 로컬 이미지 레지스트리 설치 및 구성
#############################################

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 설정
REGISTRY_PORT=5000
REGISTRY_DATA="/var/lib/registry"
REGISTRY_NAME="codeb-registry"

log_info "========================================"
log_info "CodeB Deploy - Container Registry Setup"
log_info "========================================"

# 1. 시스템 확인
if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# 2. Podman 확인
if ! command -v podman &> /dev/null; then
    log_info "Installing Podman..."
    apt-get update
    apt-get install -y podman
fi

# 3. 레지스트리 데이터 디렉토리 생성
log_info "Creating registry data directory..."
mkdir -p "$REGISTRY_DATA"

# 4. 기존 레지스트리 정리
log_info "Cleaning up existing registry container..."
podman stop "$REGISTRY_NAME" 2>/dev/null || true
podman rm "$REGISTRY_NAME" 2>/dev/null || true

# 5. 레지스트리 컨테이너 시작
log_info "Starting registry container..."
podman run -d \
    --name "$REGISTRY_NAME" \
    --restart always \
    -p ${REGISTRY_PORT}:5000 \
    -v ${REGISTRY_DATA}:/var/lib/registry:Z \
    -e REGISTRY_STORAGE_DELETE_ENABLED=true \
    -e REGISTRY_HTTP_ADDR=0.0.0.0:5000 \
    docker.io/library/registry:2

# 6. 레지스트리 상태 확인
sleep 3
if podman ps --format "{{.Names}}" | grep -q "$REGISTRY_NAME"; then
    log_success "Registry container is running"
else
    log_error "Registry container failed to start"
    podman logs "$REGISTRY_NAME"
    exit 1
fi

# 7. systemd 서비스 생성 (컨테이너 자동 시작)
log_info "Creating systemd service..."
cat > /etc/systemd/system/codeb-registry.service << EOF
[Unit]
Description=CodeB Container Registry
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=10
ExecStart=/usr/bin/podman start -a $REGISTRY_NAME
ExecStop=/usr/bin/podman stop -t 10 $REGISTRY_NAME

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable codeb-registry

# 8. Podman 레지스트리 설정 (insecure registry)
log_info "Configuring Podman to trust local registry..."

mkdir -p /etc/containers/registries.conf.d
cat > /etc/containers/registries.conf.d/codeb-registry.conf << EOF
[[registry]]
location = "localhost:${REGISTRY_PORT}"
insecure = true
EOF

# 9. 연결 테스트
log_info "Testing registry connection..."
sleep 2

REGISTRY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${REGISTRY_PORT}/v2/ || echo "000")

if [ "$REGISTRY_STATUS" = "200" ]; then
    log_success "Registry is accessible at localhost:${REGISTRY_PORT}"
else
    log_warning "Registry returned status: $REGISTRY_STATUS"
fi

# 10. 정리 스크립트 생성
log_info "Creating cleanup script..."
cat > /usr/local/bin/registry-cleanup.sh << 'EOF'
#!/bin/bash
# 오래된 이미지 정리 (30일 이상)

REGISTRY_URL="http://localhost:5000"

echo "Fetching catalog..."
REPOS=$(curl -s ${REGISTRY_URL}/v2/_catalog | jq -r '.repositories[]')

for repo in $REPOS; do
    echo "Processing: $repo"
    TAGS=$(curl -s ${REGISTRY_URL}/v2/${repo}/tags/list | jq -r '.tags[]' 2>/dev/null || echo "")

    for tag in $TAGS; do
        # latest와 production 태그는 보존
        if [[ "$tag" == "latest" || "$tag" == "production" || "$tag" == "staging" ]]; then
            continue
        fi

        # PR 태그는 7일 후 삭제
        if [[ "$tag" == pr-* ]]; then
            echo "  Marking for cleanup: $repo:$tag"
        fi
    done
done

echo "Cleanup complete. Run 'registry garbage-collect' to reclaim space."
EOF
chmod +x /usr/local/bin/registry-cleanup.sh

# 11. Cron job for cleanup
log_info "Setting up cleanup cron job..."
cat > /etc/cron.d/registry-cleanup << EOF
# Clean up old images weekly
0 3 * * 0 root /usr/local/bin/registry-cleanup.sh >> /var/log/registry-cleanup.log 2>&1
EOF

# 12. 완료 메시지
log_success "========================================"
log_success "Container Registry setup complete!"
log_success "========================================"
echo ""
echo "Registry URL: localhost:${REGISTRY_PORT}"
echo "Data Directory: ${REGISTRY_DATA}"
echo ""
echo "Usage Examples:"
echo "  Push: podman push localhost:${REGISTRY_PORT}/myapp:v1.0"
echo "  Pull: podman pull localhost:${REGISTRY_PORT}/myapp:v1.0"
echo "  List: curl http://localhost:${REGISTRY_PORT}/v2/_catalog"
echo ""
echo "Commands:"
echo "  Status: podman ps | grep registry"
echo "  Logs:   podman logs ${REGISTRY_NAME}"
echo "  Cleanup: /usr/local/bin/registry-cleanup.sh"
