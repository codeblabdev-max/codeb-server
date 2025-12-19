# CodeB Deploy System - 모니터링 및 알림 가이드

## 목차
1. [모니터링 아키텍처](#모니터링-아키텍처)
2. [Prometheus 설정](#prometheus-설정)
3. [Grafana 대시보드](#grafana-대시보드)
4. [알림 규칙](#알림-규칙)
5. [알림 채널 설정](#알림-채널-설정)
6. [메트릭 조회](#메트릭-조회)

---

## 모니터링 아키텍처

### 구성 요소

```
┌─────────────────────────────────────────────────────────────────┐
│                        모니터링 스택                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   앱 서비스   │    │   앱 서비스   │    │   앱 서비스   │      │
│  │   :3001     │    │   :4001     │    │   :5001     │      │
│  │   /metrics  │    │   /metrics  │    │   /metrics  │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         └─────────────────┬─┴───────────────────┘               │
│                           ▼                                      │
│                  ┌──────────────────┐                           │
│                  │   Prometheus    │                           │
│                  │     :9090       │                           │
│                  │   - 스크래핑     │                           │
│                  │   - 저장        │                           │
│                  │   - 알림 평가    │                           │
│                  └────────┬─────────┘                           │
│                           │                                      │
│         ┌─────────────────┼─────────────────┐                   │
│         ▼                 ▼                 ▼                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Grafana   │  │ Alertmanager │  │ Node Exporter│          │
│  │    :3000    │  │    :9093     │  │    :9100     │          │
│  │   - 시각화   │  │   - 라우팅    │  │  - 시스템    │          │
│  │   - 대시보드 │  │   - 중복제거  │  │    메트릭    │          │
│  └──────────────┘  └──────┬───────┘  └──────────────┘          │
│                           │                                      │
│                           ▼                                      │
│                  ┌──────────────────┐                           │
│                  │   알림 채널      │                           │
│                  │ - Slack         │                           │
│                  │ - PagerDuty     │                           │
│                  │ - Email         │                           │
│                  └──────────────────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 포트 및 접속 정보

| 서비스 | 포트 | 용도 | 접속 URL |
|--------|------|------|----------|
| Prometheus | 9090 | 메트릭 수집/저장 | http://SERVER:9090 |
| Grafana | 3000 | 시각화/대시보드 | http://SERVER:3000 |
| Alertmanager | 9093 | 알림 관리 | http://SERVER:9093 |
| Node Exporter | 9100 | 시스템 메트릭 | http://SERVER:9100/metrics |

---

## Prometheus 설정

### 기본 설정 파일

`/etc/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s      # 메트릭 수집 주기
  evaluation_interval: 15s  # 알림 규칙 평가 주기

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
  # Prometheus 자체 모니터링
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # 시스템 메트릭 (Node Exporter)
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: 'codeb-server'

  # Caddy 메트릭
  - job_name: 'caddy'
    static_configs:
      - targets: ['localhost:2019']
    metrics_path: /metrics

  # 앱 메트릭 (동적 탐색)
  - job_name: 'codeb-apps'
    file_sd_configs:
      - files:
          - /etc/prometheus/targets/*.json
        refresh_interval: 30s
```

### 앱 타겟 등록

앱 배포 시 자동으로 `/etc/prometheus/targets/apps.json` 업데이트:

```json
[
  {
    "targets": ["localhost:3001"],
    "labels": {
      "job": "myapp",
      "environment": "staging"
    }
  },
  {
    "targets": ["localhost:4001"],
    "labels": {
      "job": "myapp",
      "environment": "production"
    }
  }
]
```

### MCP를 통한 모니터링 설정

```bash
# Claude Code에서
"myapp 모니터링 설정해줘"
```

자동으로 수행되는 작업:
1. Prometheus 타겟 등록
2. 알림 규칙 생성
3. Grafana 대시보드 생성

---

## Grafana 대시보드

### 초기 접속

- URL: `http://YOUR_SERVER:3000`
- 초기 계정: `admin` / `admin`
- 첫 로그인 시 비밀번호 변경 필요

### 데이터소스 설정

Prometheus 데이터소스가 자동 설정됩니다:

```json
{
  "name": "Prometheus",
  "type": "prometheus",
  "url": "http://localhost:9090",
  "access": "proxy",
  "isDefault": true
}
```

### 자동 생성 대시보드

프로젝트 초기화 시 자동 생성되는 대시보드:

```json
{
  "dashboard": {
    "title": "myapp Dashboard",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [{
          "expr": "rate(http_requests_total{job='myapp'}[5m])"
        }]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [{
          "expr": "rate(http_requests_total{job='myapp',status=~'5..'}[5m])"
        }]
      },
      {
        "title": "Response Time (p95)",
        "type": "graph",
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job='myapp'}[5m]))"
        }]
      },
      {
        "title": "Memory Usage",
        "type": "gauge",
        "targets": [{
          "expr": "process_resident_memory_bytes{job='myapp'}"
        }]
      }
    ]
  }
}
```

### 권장 대시보드 (Import)

Grafana Labs에서 제공하는 권장 대시보드:

| 대시보드 ID | 이름 | 용도 |
|------------|------|------|
| 1860 | Node Exporter Full | 시스템 모니터링 |
| 13946 | Node Exporter Quickstart | 간단한 시스템 모니터링 |
| 11074 | Node Exporter for Prometheus | 시스템 메트릭 |

Import 방법:
1. Grafana 좌측 메뉴 → Dashboards → Import
2. Dashboard ID 입력 (예: 1860)
3. Load 클릭
4. Prometheus 데이터소스 선택
5. Import 클릭

---

## 알림 규칙

### 기본 알림 규칙

`/etc/prometheus/rules/codeb.yml`:

```yaml
groups:
  - name: codeb_system
    rules:
      # 인스턴스 다운
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} is down"
          description: "{{ $labels.job }} has been down for more than 1 minute"

      # 높은 CPU 사용률
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is {{ $value | printf \"%.2f\" }}%"

      # 높은 메모리 사용률
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is {{ $value | printf \"%.2f\" }}%"

      # 높은 디스크 사용률
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
      # 높은 에러율
      - alert: HighErrorRate
        expr: sum by(job) (rate(http_requests_total{status=~"5.."}[5m])) / sum by(job) (rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ $labels.job }}"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # 높은 지연 시간
      - alert: HighLatency
        expr: histogram_quantile(0.95, sum by(le, job) (rate(http_request_duration_seconds_bucket[5m]))) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.job }}"
          description: "95th percentile latency is {{ $value }}s"
```

### 심각도 레벨

| 레벨 | 설명 | 대응 시간 |
|------|------|----------|
| `critical` | 즉시 대응 필요 | 5분 이내 |
| `warning` | 주의 필요 | 1시간 이내 |
| `info` | 정보성 알림 | 확인만 |

### 알림 규칙 동적 추가

```bash
# Claude Code에서
"myapp에 커스텀 알림 규칙 추가해줘: 응답시간 500ms 초과 시 warning"
```

---

## 알림 채널 설정

### Alertmanager 설정

`/etc/alertmanager/alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s       # 그룹화 대기 시간
  group_interval: 10s   # 그룹 간격
  repeat_interval: 1h   # 반복 알림 간격
  receiver: 'default'

  routes:
    - match:
        severity: critical
      receiver: 'critical'
      continue: true

    - match:
        severity: warning
      receiver: 'warning'

receivers:
  - name: 'default'
    # 기본 수신자

  - name: 'critical'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#alerts-critical'
        send_resolved: true
        title: '🚨 Critical Alert'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

    pagerduty_configs:
      - routing_key: '${PAGERDUTY_ROUTING_KEY}'
        severity: critical

  - name: 'warning'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#alerts-warning'
        send_resolved: true
        title: '⚠️ Warning Alert'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

### Slack 설정

1. **Webhook URL 생성**:
   - Slack App 생성: https://api.slack.com/apps
   - Incoming Webhooks 활성화
   - Webhook URL 복사

2. **환경 변수 설정**:
   ```bash
   export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T.../B.../xxx"
   ```

3. **MCP를 통한 알림 테스트**:
   ```bash
   # Claude Code에서
   "Slack으로 테스트 알림 보내줘"
   ```

### PagerDuty 설정

1. **Service 생성**:
   - PagerDuty에서 Service 생성
   - Integration 추가 (Events API v2)
   - Routing Key 복사

2. **환경 변수 설정**:
   ```bash
   export PAGERDUTY_ROUTING_KEY="your_routing_key"
   ```

### Email 설정 (SendGrid)

1. **API Key 생성**:
   - SendGrid 계정에서 API Key 생성
   - Mail Send 권한 필요

2. **환경 변수 설정**:
   ```bash
   export SENDGRID_API_KEY="SG.xxx"
   export ALERT_EMAIL_TO="alerts@yourcompany.com"
   export ALERT_EMAIL_FROM="noreply@yourcompany.com"
   ```

---

## 메트릭 조회

### MCP를 통한 조회

```bash
# Claude Code에서
"myapp 메트릭 보여줘"
"production 환경 에러율 확인해줘"
"최근 1시간 응답시간 추이 보여줘"
```

### 주요 메트릭 쿼리

| 메트릭 | PromQL 쿼리 |
|--------|-------------|
| 요청률 | `rate(http_requests_total{job="myapp"}[5m])` |
| 에러율 | `rate(http_requests_total{job="myapp",status=~"5.."}[5m]) / rate(http_requests_total{job="myapp"}[5m])` |
| p95 지연시간 | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="myapp"}[5m]))` |
| CPU 사용률 | `100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)` |
| 메모리 사용률 | `(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100` |

### 알림 상태 조회

```bash
# Claude Code에서
"현재 활성 알림 목록 보여줘"
"알림 히스토리 보여줘"
```

### 모니터링 상태 확인

```bash
# Claude Code에서
"모니터링 상태 확인해줘"
```

응답 예시:
```json
{
  "prometheus": {
    "status": "healthy",
    "uptime": "15 days",
    "activeTargets": 5,
    "activeAlerts": 0
  },
  "grafana": {
    "status": "running",
    "dashboards": 3
  },
  "alertmanager": {
    "status": "running",
    "receivers": ["default", "critical", "warning"]
  }
}
```

---

## 베스트 프랙티스

### 1. 알림 피로 방지

- 적절한 임계값 설정
- 그룹화 및 중복 제거 활용
- 반복 알림 간격 조정

### 2. 대시보드 구성

- 환경별 분리 (Staging, Production)
- 중요 메트릭 상단 배치
- 적절한 시간 범위 설정

### 3. 보존 정책

```yaml
# Prometheus 데이터 보존
storage.tsdb.retention.time: 30d  # 30일 보존
```

### 4. 보안

- Grafana 기본 비밀번호 변경
- Prometheus/Alertmanager 접근 제한
- HTTPS 사용 (Caddy 리버스 프록시)

---

## 다음 단계

- [보안 스캔 가이드](05-SECURITY-SCANNING.md) - 보안 모니터링
- [문제 해결 가이드](06-TROUBLESHOOTING.md) - 모니터링 문제 해결
