#!/bin/bash

#############################################
# CodeB Deploy - Monitoring Stack 설정
# Prometheus + Grafana + Node Exporter + Alertmanager
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
PROMETHEUS_VERSION="2.47.0"
NODE_EXPORTER_VERSION="1.6.1"
ALERTMANAGER_VERSION="0.26.0"
GRAFANA_PORT=3000

log_info "========================================"
log_info "CodeB Deploy - Monitoring Stack Setup"
log_info "========================================"

# 1. 시스템 확인
if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# 2. 디렉토리 생성
log_info "Creating directories..."
mkdir -p /etc/prometheus/rules
mkdir -p /var/lib/prometheus
mkdir -p /var/lib/alertmanager
mkdir -p /etc/alertmanager

# 3. Prometheus 설치
log_info "Installing Prometheus..."
cd /tmp

if [ ! -f "/usr/local/bin/prometheus" ]; then
    curl -LO "https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"
    tar xvf "prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"
    cp "prometheus-${PROMETHEUS_VERSION}.linux-amd64/prometheus" /usr/local/bin/
    cp "prometheus-${PROMETHEUS_VERSION}.linux-amd64/promtool" /usr/local/bin/
    rm -rf "prometheus-${PROMETHEUS_VERSION}.linux-amd64"*
    log_success "Prometheus installed"
else
    log_info "Prometheus already installed"
fi

# 4. Node Exporter 설치
log_info "Installing Node Exporter..."

if [ ! -f "/usr/local/bin/node_exporter" ]; then
    curl -LO "https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz"
    tar xvf "node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz"
    cp "node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64/node_exporter" /usr/local/bin/
    rm -rf "node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64"*
    log_success "Node Exporter installed"
else
    log_info "Node Exporter already installed"
fi

# 5. Alertmanager 설치
log_info "Installing Alertmanager..."

if [ ! -f "/usr/local/bin/alertmanager" ]; then
    curl -LO "https://github.com/prometheus/alertmanager/releases/download/v${ALERTMANAGER_VERSION}/alertmanager-${ALERTMANAGER_VERSION}.linux-amd64.tar.gz"
    tar xvf "alertmanager-${ALERTMANAGER_VERSION}.linux-amd64.tar.gz"
    cp "alertmanager-${ALERTMANAGER_VERSION}.linux-amd64/alertmanager" /usr/local/bin/
    cp "alertmanager-${ALERTMANAGER_VERSION}.linux-amd64/amtool" /usr/local/bin/
    rm -rf "alertmanager-${ALERTMANAGER_VERSION}.linux-amd64"*
    log_success "Alertmanager installed"
else
    log_info "Alertmanager already installed"
fi

# 6. Grafana 설치
log_info "Installing Grafana..."

if ! command -v grafana-server &> /dev/null; then
    apt-get install -y apt-transport-https software-properties-common wget
    wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
    echo "deb https://packages.grafana.com/oss/deb stable main" | tee /etc/apt/sources.list.d/grafana.list
    apt-get update
    apt-get install -y grafana
    log_success "Grafana installed"
else
    log_info "Grafana already installed"
fi

# 7. Prometheus 설정
log_info "Configuring Prometheus..."
cat > /etc/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: 'codeb-server'

  - job_name: 'caddy'
    static_configs:
      - targets: ['localhost:2019']
    metrics_path: /metrics

  # 프로젝트별 메트릭은 동적으로 추가됨
  - job_name: 'codeb-apps'
    file_sd_configs:
      - files:
          - /etc/prometheus/targets/*.json
        refresh_interval: 30s
EOF

# 8. 기본 알림 규칙
log_info "Creating alert rules..."
cat > /etc/prometheus/rules/codeb.yml << 'EOF'
groups:
  - name: codeb_system
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} is down"
          description: "{{ $labels.job }} instance has been down for more than 1 minute"

      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is {{ $value | printf \"%.2f\" }}%"

      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is {{ $value | printf \"%.2f\" }}%"

      - alert: HighDiskUsage
        expr: (node_filesystem_size_bytes{fstype!~"tmpfs|overlay"} - node_filesystem_free_bytes{fstype!~"tmpfs|overlay"}) / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"} * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High disk usage on {{ $labels.instance }}"
          description: "Disk usage is {{ $value | printf \"%.2f\" }}% on {{ $labels.mountpoint }}"

  - name: codeb_apps
    rules:
      - alert: HighErrorRate
        expr: sum by(job) (rate(http_requests_total{status=~"5.."}[5m])) / sum by(job) (rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ $labels.job }}"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: histogram_quantile(0.95, sum by(le, job) (rate(http_request_duration_seconds_bucket[5m]))) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.job }}"
          description: "95th percentile latency is {{ $value }}s"
EOF

# 9. Alertmanager 설정
log_info "Configuring Alertmanager..."
cat > /etc/alertmanager/alertmanager.yml << 'EOF'
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: 'critical'
    - match:
        severity: warning
      receiver: 'warning'

receivers:
  - name: 'default'
    # 기본 수신자 - 설정 필요

  - name: 'critical'
    # Slack webhook 설정 예시
    # slack_configs:
    #   - api_url: 'https://hooks.slack.com/services/xxx/xxx/xxx'
    #     channel: '#alerts-critical'
    #     send_resolved: true

  - name: 'warning'
    # 경고 알림 설정
EOF

# 10. 타겟 디렉토리 생성
mkdir -p /etc/prometheus/targets
echo '[]' > /etc/prometheus/targets/apps.json

# 11. systemd 서비스 설정
log_info "Creating systemd services..."

# Prometheus 서비스
cat > /etc/systemd/system/prometheus.service << 'EOF'
[Unit]
Description=Prometheus
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/prometheus \
    --config.file=/etc/prometheus/prometheus.yml \
    --storage.tsdb.path=/var/lib/prometheus \
    --web.listen-address=:9090 \
    --web.enable-lifecycle \
    --storage.tsdb.retention.time=30d
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Node Exporter 서비스
cat > /etc/systemd/system/node_exporter.service << 'EOF'
[Unit]
Description=Node Exporter
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter \
    --collector.filesystem.ignored-mount-points="^/(sys|proc|dev|run)($|/)"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Alertmanager 서비스
cat > /etc/systemd/system/alertmanager.service << 'EOF'
[Unit]
Description=Alertmanager
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/alertmanager \
    --config.file=/etc/alertmanager/alertmanager.yml \
    --storage.path=/var/lib/alertmanager
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 12. 서비스 시작
log_info "Starting services..."
systemctl daemon-reload
systemctl enable prometheus node_exporter alertmanager grafana-server
systemctl restart prometheus node_exporter alertmanager grafana-server

# 13. 상태 확인
sleep 5
log_info "Checking services..."

services=("prometheus" "node_exporter" "alertmanager" "grafana-server")
all_running=true

for svc in "${services[@]}"; do
    if systemctl is-active --quiet "$svc"; then
        log_success "$svc is running"
    else
        log_error "$svc is not running"
        all_running=false
    fi
done

# 14. Grafana 데이터소스 설정
log_info "Configuring Grafana datasource..."
sleep 5

# Grafana API로 Prometheus 데이터소스 추가
curl -X POST http://admin:admin@localhost:3000/api/datasources \
    -H 'Content-Type: application/json' \
    -d '{
        "name": "Prometheus",
        "type": "prometheus",
        "url": "http://localhost:9090",
        "access": "proxy",
        "isDefault": true
    }' 2>/dev/null || log_warning "Grafana datasource may already exist"

# 15. Caddy 리버스 프록시 설정 (선택사항)
log_info "Creating Caddy configuration for monitoring..."
cat > /etc/caddy/sites/monitoring.caddy << 'EOF'
# Grafana
grafana.codeb.dev {
    reverse_proxy localhost:3000
    encode gzip
}

# Prometheus (내부용)
prometheus.codeb.dev {
    reverse_proxy localhost:9090
    basicauth {
        admin $2a$14$...  # htpasswd로 생성한 해시값
    }
}
EOF

# 16. 완료 메시지
log_success "========================================"
log_success "Monitoring Stack setup complete!"
log_success "========================================"
echo ""
echo "Services:"
echo "  Prometheus:    http://localhost:9090"
echo "  Grafana:       http://localhost:3000 (admin/admin)"
echo "  Alertmanager:  http://localhost:9093"
echo "  Node Exporter: http://localhost:9100/metrics"
echo ""
echo "Next Steps:"
echo "  1. Change Grafana admin password"
echo "  2. Configure Alertmanager receivers (Slack, PagerDuty, etc.)"
echo "  3. Import dashboards (Node Exporter Full: 1860)"
echo ""
echo "Commands:"
echo "  Prometheus: systemctl status prometheus"
echo "  Grafana:    systemctl status grafana-server"
echo "  Reload:     systemctl reload prometheus"
echo ""
echo "Add app targets: /etc/prometheus/targets/apps.json"
