/**
 * Servers View - 서버 상세 모니터링
 *
 * 4개 서버의 실시간 메트릭 표시
 * - CPU, Memory, Disk 사용률
 * - 컨테이너 목록
 * - 네트워크 상태
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';

const API_BASE_URL = process.env.CODEB_API_URL || 'http://localhost:3000/api';

async function callApi(endpoint) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 서버 모니터링 뷰
 */
export class ServersView {
  constructor(screen) {
    this.screen = screen;
    this.widgets = {};
    this.selectedServer = 'app';
    this.metricsHistory = {
      app: { cpu: [], memory: [] },
      streaming: { cpu: [], memory: [] },
      storage: { cpu: [], memory: [] },
      backup: { cpu: [], memory: [] },
    };
  }

  /**
   * 뷰 생성
   */
  create() {
    const grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // 서버 선택 목록
    this.widgets.serverList = grid.set(0, 0, 6, 3, blessed.list, {
      label: ' Servers ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
      },
      keys: true,
      mouse: true,
      items: [
        '{green-fg}●{/green-fg} App (158.247.203.55)',
        '{green-fg}●{/green-fg} Streaming (141.164.42.213)',
        '{green-fg}●{/green-fg} Storage (64.176.226.119)',
        '{green-fg}●{/green-fg} Backup (141.164.37.63)',
      ],
    });

    // CPU 그래프
    this.widgets.cpuLine = grid.set(0, 3, 3, 5, contrib.line, {
      label: ' CPU Usage % ',
      style: {
        line: 'yellow',
        text: 'green',
        baseline: 'black',
      },
      xLabelPadding: 3,
      xPadding: 5,
      showLegend: true,
      wholeNumbersOnly: false,
    });

    // Memory 그래프
    this.widgets.memoryLine = grid.set(3, 3, 3, 5, contrib.line, {
      label: ' Memory Usage % ',
      style: {
        line: 'cyan',
        text: 'green',
        baseline: 'black',
      },
      xLabelPadding: 3,
      xPadding: 5,
      showLegend: true,
      wholeNumbersOnly: false,
    });

    // 서버 상세 정보
    this.widgets.serverDetails = grid.set(0, 8, 6, 4, blessed.box, {
      label: ' Server Details ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'green' } },
    });

    // 컨테이너 목록
    this.widgets.containers = grid.set(6, 0, 6, 8, blessed.list, {
      label: ' Containers ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        selected: { bg: 'yellow', fg: 'black' },
      },
      keys: true,
      mouse: true,
      scrollable: true,
    });

    // 서비스 상태
    this.widgets.services = grid.set(6, 8, 6, 4, blessed.box, {
      label: ' Services ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'magenta' } },
    });

    // 이벤트 바인딩
    this.widgets.serverList.on('select', (item, index) => {
      const servers = ['app', 'streaming', 'storage', 'backup'];
      this.selectedServer = servers[index];
      this.updateView();
    });

    return this.widgets;
  }

  /**
   * 데이터 로드 및 업데이트
   */
  async update() {
    try {
      const [servers, containers] = await Promise.all([
        callApi('/servers'),
        callApi('/ssot?action=containers'),
      ]);

      if (servers.data) {
        this.updateServerMetrics(servers.data);
        this.updateServerDetails(servers.data[this.selectedServer]);
      }

      if (containers.data) {
        this.updateContainers(containers.data[this.selectedServer] || []);
      }

      this.updateGraphs();
      this.screen.render();
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * 서버 메트릭 업데이트
   */
  updateServerMetrics(servers) {
    for (const [name, server] of Object.entries(servers)) {
      if (!this.metricsHistory[name]) continue;

      const metrics = server.metrics || {};

      // CPU 파싱 (예: "15%")
      let cpu = 0;
      if (metrics.cpu) {
        cpu = parseInt(metrics.cpu.replace('%', '')) || 0;
      }

      // Memory 파싱 (예: "8192/16384")
      let memory = 0;
      if (metrics.memory) {
        const parts = metrics.memory.split('/');
        if (parts.length === 2) {
          memory = (parseInt(parts[0]) / parseInt(parts[1])) * 100;
        }
      }

      // 히스토리에 추가 (최대 20개)
      this.metricsHistory[name].cpu.push(cpu);
      this.metricsHistory[name].memory.push(memory);

      if (this.metricsHistory[name].cpu.length > 20) {
        this.metricsHistory[name].cpu.shift();
        this.metricsHistory[name].memory.shift();
      }
    }
  }

  /**
   * 그래프 업데이트
   */
  updateGraphs() {
    const history = this.metricsHistory[this.selectedServer];
    const labels = history.cpu.map((_, i) => i.toString());

    this.widgets.cpuLine.setData([{
      title: this.selectedServer,
      x: labels,
      y: history.cpu,
      style: { line: 'yellow' },
    }]);

    this.widgets.memoryLine.setData([{
      title: this.selectedServer,
      x: labels,
      y: history.memory,
      style: { line: 'cyan' },
    }]);
  }

  /**
   * 서버 상세 정보 업데이트
   */
  updateServerDetails(server) {
    if (!server) {
      this.widgets.serverDetails.setContent('{gray-fg}No data{/gray-fg}');
      return;
    }

    const serverInfo = {
      app: { name: 'App Server', role: 'Applications' },
      streaming: { name: 'Streaming', role: 'WebSocket (Centrifugo)' },
      storage: { name: 'Storage', role: 'PostgreSQL, Redis' },
      backup: { name: 'Backup', role: 'Backups, Preview' },
    };

    const info = serverInfo[this.selectedServer] || {};
    const metrics = server.metrics || {};

    let content = `{bold}${info.name}{/bold}\n\n`;
    content += `IP: ${server.ip || 'N/A'}\n`;
    content += `Role: ${info.role}\n\n`;
    content += `{bold}Metrics:{/bold}\n`;
    content += `  CPU: ${metrics.cpu || 'N/A'}\n`;
    content += `  Memory: ${metrics.memory || 'N/A'}\n`;
    content += `  Disk: ${metrics.disk || 'N/A'}\n`;
    content += `  Uptime: ${metrics.uptime || 'N/A'}\n`;
    content += `  Containers: ${metrics.containers || '0'}\n`;

    this.widgets.serverDetails.setContent(content);
  }

  /**
   * 컨테이너 목록 업데이트
   */
  updateContainers(containers) {
    const items = containers.map(c => {
      const status = c.status?.includes('Up') ? '{green-fg}●{/green-fg}' : '{red-fg}●{/red-fg}';
      return `${status} ${c.name} (${c.image?.split(':')[0] || 'unknown'})`;
    });

    if (items.length === 0) {
      items.push('{gray-fg}No containers{/gray-fg}');
    }

    this.widgets.containers.setItems(items);
  }

  /**
   * 뷰 업데이트
   */
  updateView() {
    this.update();
  }

  /**
   * 포커스 설정
   */
  focus() {
    this.widgets.serverList.focus();
  }
}

export default ServersView;
