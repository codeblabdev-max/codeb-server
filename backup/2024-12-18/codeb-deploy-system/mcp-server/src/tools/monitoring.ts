/**
 * CodeB Deploy MCP - Monitoring Tool
 * Prometheus + Grafana 설정 및 메트릭 조회
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';
import type { Environment } from '../lib/types.js';

// Monitoring 입력 스키마
export const monitoringInputSchema = z.object({
  action: z.enum(['setup', 'status', 'metrics', 'alerts', 'configure']).describe('액션'),
  projectName: z.string().optional().describe('프로젝트 이름'),
  environment: z.enum(['staging', 'production', 'preview']).optional().describe('환경'),
  metric: z.string().optional().describe('조회할 메트릭 이름'),
  timeRange: z.string().optional().describe('시간 범위 (예: 1h, 24h, 7d)'),
});

export type MonitoringInput = z.infer<typeof monitoringInputSchema>;

interface MonitoringStatus {
  prometheus: {
    running: boolean;
    version?: string;
    targets: number;
    uptime?: string;
  };
  grafana: {
    running: boolean;
    version?: string;
    dashboards: number;
    url?: string;
  };
  alertmanager: {
    running: boolean;
    activeAlerts: number;
  };
}

interface MetricResult {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: string;
}

interface MonitoringResult {
  success: boolean;
  action: string;
  status?: MonitoringStatus;
  metrics?: MetricResult[];
  alerts?: Array<{
    name: string;
    severity: string;
    state: string;
    summary: string;
    startedAt?: string;
  }>;
  message?: string;
  error?: string;
}

/**
 * Prometheus 설정 생성
 */
function generatePrometheusConfig(projects: string[]): string {
  const scrapeConfigs: string[] = [];

  // 기본 시스템 메트릭
  scrapeConfigs.push(`
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: 'codeb-server'`);

  // Caddy 메트릭
  scrapeConfigs.push(`
  - job_name: 'caddy'
    static_configs:
      - targets: ['localhost:2019']`);

  // 프로젝트별 메트릭
  for (const project of projects) {
    scrapeConfigs.push(`
  - job_name: '${project}'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: /metrics
    relabel_configs:
      - source_labels: [__address__]
        target_label: project
        replacement: '${project}'`);
  }

  return `global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
${scrapeConfigs.join('\n')}
`;
}

/**
 * Prometheus 알림 규칙 생성
 */
function generateAlertRules(projects: string[]): string {
  return `groups:
  - name: codeb_alerts
    rules:
      # 서비스 다운 알림
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.job }} has been down for more than 1 minute"

      # 높은 에러율
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ $labels.job }}"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # 높은 응답 시간
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.job }}"
          description: "95th percentile latency is {{ $value }}s"

      # 메모리 사용량 높음
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is {{ $value | humanizePercentage }}"

      # 디스크 사용량 높음
      - alert: HighDiskUsage
        expr: (node_filesystem_size_bytes - node_filesystem_free_bytes) / node_filesystem_size_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High disk usage on {{ $labels.instance }}"
          description: "Disk usage is {{ $value | humanizePercentage }}"

      # 컨테이너 재시작 알림
      - alert: ContainerRestarting
        expr: rate(container_restart_count[15m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Container {{ $labels.name }} is restarting"
          description: "Container has restarted {{ $value }} times in the last 15 minutes"
`;
}

/**
 * Grafana 대시보드 생성
 */
function generateGrafanaDashboard(projectName: string): object {
  return {
    dashboard: {
      id: null,
      uid: `${projectName}-overview`,
      title: `${projectName} Overview`,
      tags: ['codeb', projectName],
      timezone: 'browser',
      schemaVersion: 30,
      version: 1,
      refresh: '30s',
      panels: [
        {
          id: 1,
          title: 'Request Rate',
          type: 'timeseries',
          gridPos: { h: 8, w: 12, x: 0, y: 0 },
          targets: [{
            expr: `rate(http_requests_total{job="${projectName}"}[5m])`,
            legendFormat: '{{method}} {{path}}',
          }],
        },
        {
          id: 2,
          title: 'Response Time (p95)',
          type: 'timeseries',
          gridPos: { h: 8, w: 12, x: 12, y: 0 },
          targets: [{
            expr: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="${projectName}"}[5m]))`,
            legendFormat: '{{path}}',
          }],
        },
        {
          id: 3,
          title: 'Error Rate',
          type: 'stat',
          gridPos: { h: 4, w: 6, x: 0, y: 8 },
          targets: [{
            expr: `sum(rate(http_requests_total{job="${projectName}",status=~"5.."}[5m])) / sum(rate(http_requests_total{job="${projectName}"}[5m]))`,
          }],
          options: {
            colorMode: 'value',
            graphMode: 'area',
          },
          fieldConfig: {
            defaults: {
              unit: 'percentunit',
              thresholds: {
                mode: 'absolute',
                steps: [
                  { color: 'green', value: null },
                  { color: 'yellow', value: 0.01 },
                  { color: 'red', value: 0.05 },
                ],
              },
            },
          },
        },
        {
          id: 4,
          title: 'Active Connections',
          type: 'stat',
          gridPos: { h: 4, w: 6, x: 6, y: 8 },
          targets: [{
            expr: `sum(http_connections_active{job="${projectName}"})`,
          }],
        },
        {
          id: 5,
          title: 'CPU Usage',
          type: 'gauge',
          gridPos: { h: 4, w: 6, x: 12, y: 8 },
          targets: [{
            expr: `100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`,
          }],
          options: {
            reduceOptions: {
              calcs: ['lastNotNull'],
            },
          },
          fieldConfig: {
            defaults: {
              unit: 'percent',
              max: 100,
              thresholds: {
                mode: 'absolute',
                steps: [
                  { color: 'green', value: null },
                  { color: 'yellow', value: 70 },
                  { color: 'red', value: 90 },
                ],
              },
            },
          },
        },
        {
          id: 6,
          title: 'Memory Usage',
          type: 'gauge',
          gridPos: { h: 4, w: 6, x: 18, y: 8 },
          targets: [{
            expr: '(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100',
          }],
          fieldConfig: {
            defaults: {
              unit: 'percent',
              max: 100,
              thresholds: {
                mode: 'absolute',
                steps: [
                  { color: 'green', value: null },
                  { color: 'yellow', value: 70 },
                  { color: 'red', value: 90 },
                ],
              },
            },
          },
        },
      ],
    },
    overwrite: true,
  };
}

/**
 * 모니터링 스택 설치
 */
async function setupMonitoring(): Promise<MonitoringResult> {
  const ssh = getSSHClient();

  try {
    // Prometheus 설치 확인
    const prometheusCheck = await ssh.exec('which prometheus 2>/dev/null || echo "not_found"');

    if (prometheusCheck.stdout.trim() === 'not_found') {
      // Prometheus 설치
      await ssh.exec(`
        cd /tmp
        curl -LO https://github.com/prometheus/prometheus/releases/download/v2.47.0/prometheus-2.47.0.linux-amd64.tar.gz
        tar xvf prometheus-2.47.0.linux-amd64.tar.gz
        cp prometheus-2.47.0.linux-amd64/prometheus /usr/local/bin/
        cp prometheus-2.47.0.linux-amd64/promtool /usr/local/bin/
        mkdir -p /etc/prometheus /var/lib/prometheus
        rm -rf prometheus-2.47.0.linux-amd64*
      `, { timeout: 300000 });
    }

    // Node Exporter 설치 확인
    const nodeExporterCheck = await ssh.exec('which node_exporter 2>/dev/null || echo "not_found"');

    if (nodeExporterCheck.stdout.trim() === 'not_found') {
      await ssh.exec(`
        cd /tmp
        curl -LO https://github.com/prometheus/node_exporter/releases/download/v1.6.1/node_exporter-1.6.1.linux-amd64.tar.gz
        tar xvf node_exporter-1.6.1.linux-amd64.tar.gz
        cp node_exporter-1.6.1.linux-amd64/node_exporter /usr/local/bin/
        rm -rf node_exporter-1.6.1.linux-amd64*
      `, { timeout: 120000 });
    }

    // Grafana 설치 확인
    const grafanaCheck = await ssh.exec('which grafana-server 2>/dev/null || echo "not_found"');

    if (grafanaCheck.stdout.trim() === 'not_found') {
      await ssh.exec(`
        apt-get install -y apt-transport-https software-properties-common
        wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
        echo "deb https://packages.grafana.com/oss/deb stable main" | tee /etc/apt/sources.list.d/grafana.list
        apt-get update
        apt-get install -y grafana
      `, { timeout: 300000 });
    }

    // Prometheus 설정 생성
    const projects = await getProjectList(ssh);
    const prometheusConfig = generatePrometheusConfig(projects);
    await ssh.writeFile('/etc/prometheus/prometheus.yml', prometheusConfig);

    // 알림 규칙 생성
    await ssh.exec('mkdir -p /etc/prometheus/rules');
    const alertRules = generateAlertRules(projects);
    await ssh.writeFile('/etc/prometheus/rules/codeb.yml', alertRules);

    // systemd 서비스 파일 생성
    const prometheusService = `[Unit]
Description=Prometheus
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/prometheus \\
    --config.file=/etc/prometheus/prometheus.yml \\
    --storage.tsdb.path=/var/lib/prometheus \\
    --web.listen-address=:9090 \\
    --web.enable-lifecycle
Restart=always

[Install]
WantedBy=multi-user.target`;

    await ssh.writeFile('/etc/systemd/system/prometheus.service', prometheusService);

    const nodeExporterService = `[Unit]
Description=Node Exporter
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter
Restart=always

[Install]
WantedBy=multi-user.target`;

    await ssh.writeFile('/etc/systemd/system/node_exporter.service', nodeExporterService);

    // 서비스 시작
    await ssh.exec(`
      systemctl daemon-reload
      systemctl enable prometheus node_exporter grafana-server
      systemctl restart prometheus node_exporter grafana-server
    `);

    // Grafana 데이터소스 설정
    await new Promise(resolve => setTimeout(resolve, 5000)); // Grafana 시작 대기

    const grafanaDataSource = {
      name: 'Prometheus',
      type: 'prometheus',
      url: 'http://localhost:9090',
      access: 'proxy',
      isDefault: true,
    };

    await ssh.exec(`
      curl -X POST http://admin:admin@localhost:3000/api/datasources \
        -H 'Content-Type: application/json' \
        -d '${JSON.stringify(grafanaDataSource)}'
    `);

    return {
      success: true,
      action: 'setup',
      message: 'Monitoring stack installed and configured',
      status: {
        prometheus: { running: true, targets: projects.length + 2 },
        grafana: { running: true, dashboards: 0, url: 'http://localhost:3000' },
        alertmanager: { running: false, activeAlerts: 0 },
      },
    };

  } catch (error) {
    return {
      success: false,
      action: 'setup',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 프로젝트 목록 조회
 */
async function getProjectList(ssh: ReturnType<typeof getSSHClient>): Promise<string[]> {
  const result = await ssh.exec(`ls /home/codeb/projects 2>/dev/null || echo ""`);
  return result.stdout.trim().split('\n').filter(Boolean);
}

/**
 * 모니터링 상태 조회
 */
async function getMonitoringStatus(): Promise<MonitoringResult> {
  const ssh = getSSHClient();

  try {
    // Prometheus 상태
    const prometheusStatus = await ssh.exec('systemctl is-active prometheus 2>/dev/null || echo "inactive"');
    const prometheusRunning = prometheusStatus.stdout.trim() === 'active';

    let prometheusTargets = 0;
    if (prometheusRunning) {
      const targetsResult = await ssh.exec(
        `curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets | length' 2>/dev/null || echo "0"`
      );
      prometheusTargets = parseInt(targetsResult.stdout.trim()) || 0;
    }

    // Grafana 상태
    const grafanaStatus = await ssh.exec('systemctl is-active grafana-server 2>/dev/null || echo "inactive"');
    const grafanaRunning = grafanaStatus.stdout.trim() === 'active';

    let grafanaDashboards = 0;
    if (grafanaRunning) {
      const dashboardsResult = await ssh.exec(
        `curl -s http://admin:admin@localhost:3000/api/search | jq 'length' 2>/dev/null || echo "0"`
      );
      grafanaDashboards = parseInt(dashboardsResult.stdout.trim()) || 0;
    }

    // Alertmanager 상태
    const alertmanagerStatus = await ssh.exec('systemctl is-active alertmanager 2>/dev/null || echo "inactive"');
    const alertmanagerRunning = alertmanagerStatus.stdout.trim() === 'active';

    return {
      success: true,
      action: 'status',
      status: {
        prometheus: {
          running: prometheusRunning,
          targets: prometheusTargets,
        },
        grafana: {
          running: grafanaRunning,
          dashboards: grafanaDashboards,
          url: grafanaRunning ? 'http://localhost:3000' : undefined,
        },
        alertmanager: {
          running: alertmanagerRunning,
          activeAlerts: 0,
        },
      },
    };

  } catch (error) {
    return {
      success: false,
      action: 'status',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 메트릭 조회
 */
async function getMetrics(
  projectName: string,
  metric: string,
  timeRange: string
): Promise<MonitoringResult> {
  const ssh = getSSHClient();

  try {
    // 시간 범위 파싱
    const timeMap: Record<string, string> = {
      '1h': '1h',
      '6h': '6h',
      '24h': '24h',
      '7d': '7d',
      '30d': '30d',
    };
    const range = timeMap[timeRange] || '1h';

    // Prometheus 쿼리
    const query = metric.includes('{')
      ? metric
      : `${metric}{job="${projectName}"}`;

    const result = await ssh.exec(
      `curl -s 'http://localhost:9090/api/v1/query_range?query=${encodeURIComponent(query)}&start=$(date -d '-${range}' +%s)&end=$(date +%s)&step=60'`
    );

    const data = JSON.parse(result.stdout);

    if (data.status !== 'success') {
      throw new Error(data.error || 'Query failed');
    }

    const metrics: MetricResult[] = [];

    for (const result of data.data.result || []) {
      for (const [timestamp, value] of result.values || []) {
        metrics.push({
          name: result.metric.__name__ || metric,
          value: parseFloat(value),
          labels: result.metric,
          timestamp: new Date(timestamp * 1000).toISOString(),
        });
      }
    }

    return {
      success: true,
      action: 'metrics',
      metrics,
      message: `Retrieved ${metrics.length} data points`,
    };

  } catch (error) {
    return {
      success: false,
      action: 'metrics',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 알림 조회
 */
async function getAlerts(): Promise<MonitoringResult> {
  const ssh = getSSHClient();

  try {
    // Prometheus Alertmanager에서 알림 조회
    const result = await ssh.exec(
      `curl -s http://localhost:9090/api/v1/alerts 2>/dev/null || echo '{"data":{"alerts":[]}}'`
    );

    const data = JSON.parse(result.stdout);
    const alerts = (data.data?.alerts || []).map((alert: any) => ({
      name: alert.labels?.alertname || 'Unknown',
      severity: alert.labels?.severity || 'unknown',
      state: alert.state,
      summary: alert.annotations?.summary || '',
      startedAt: alert.activeAt,
    }));

    return {
      success: true,
      action: 'alerts',
      alerts,
      message: `Found ${alerts.length} active alerts`,
    };

  } catch (error) {
    return {
      success: false,
      action: 'alerts',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 프로젝트 대시보드 설정
 */
async function configureDashboard(projectName: string): Promise<MonitoringResult> {
  const ssh = getSSHClient();

  try {
    const dashboard = generateGrafanaDashboard(projectName);

    await ssh.exec(`
      curl -X POST http://admin:admin@localhost:3000/api/dashboards/db \
        -H 'Content-Type: application/json' \
        -d '${JSON.stringify(dashboard)}'
    `);

    return {
      success: true,
      action: 'configure',
      message: `Dashboard created for ${projectName}`,
    };

  } catch (error) {
    return {
      success: false,
      action: 'configure',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Monitoring 도구 실행
 */
export async function executeMonitoring(input: MonitoringInput): Promise<MonitoringResult> {
  const {
    action,
    projectName,
    environment,
    metric,
    timeRange = '1h',
  } = input;

  const ssh = getSSHClient();
  await ssh.connect();

  try {
    switch (action) {
      case 'setup':
        return await setupMonitoring();

      case 'status':
        return await getMonitoringStatus();

      case 'metrics':
        if (!projectName || !metric) {
          return {
            success: false,
            action,
            error: 'projectName and metric are required',
          };
        }
        return await getMetrics(projectName, metric, timeRange);

      case 'alerts':
        return await getAlerts();

      case 'configure':
        if (!projectName) {
          return {
            success: false,
            action,
            error: 'projectName is required',
          };
        }
        return await configureDashboard(projectName);

      default:
        return {
          success: false,
          action,
          error: `Unknown action: ${action}`,
        };
    }

  } finally {
    ssh.disconnect();
  }
}

/**
 * Monitoring 도구 정의
 */
export const monitoringTool = {
  name: 'monitoring',
  description: 'Prometheus + Grafana 기반 모니터링 스택을 설정하고 메트릭/알림을 조회합니다',
  inputSchema: monitoringInputSchema,
  execute: executeMonitoring,
};
