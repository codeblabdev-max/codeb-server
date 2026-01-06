/**
 * CodeB Terminal Dashboard
 *
 * 터미널 기반 서버 관리 대시보드
 * - 실시간 서버 메트릭
 * - 프로젝트 관리
 * - 배포 로그
 * - 설정 관리
 *
 * 키보드 단축키:
 * - Tab: 패널 전환
 * - 1-5: 뷰 전환
 * - q/Esc: 종료
 * - r: 새로고침
 * - Enter: 선택/실행
 *
 * @version 1.0.0
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';

// Dashboard API
const API_BASE_URL = process.env.CODEB_API_URL || 'http://localhost:3000/api';

/**
 * API 호출 헬퍼
 */
async function callApi(endpoint) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.CODEB_API_KEY || '',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 메인 대시보드 클래스
 */
export class Dashboard {
  constructor() {
    this.screen = null;
    this.grid = null;
    this.widgets = {};
    this.currentView = 'overview';
    this.refreshInterval = null;
    this.data = {
      servers: {},
      projects: [],
      deployments: [],
      ports: {},
    };
  }

  /**
   * 대시보드 초기화 및 시작
   */
  async start() {
    this.createScreen();
    this.createLayout();
    this.setupKeyBindings();
    await this.loadData();
    this.startAutoRefresh();
    this.screen.render();
  }

  /**
   * 스크린 생성
   */
  createScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'CodeB Terminal Dashboard',
      fullUnicode: true,
    });

    // 전역 스타일
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.stop();
      process.exit(0);
    });
  }

  /**
   * 레이아웃 생성
   */
  createLayout() {
    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // 헤더
    this.widgets.header = this.grid.set(0, 0, 1, 12, blessed.box, {
      content: '{center}{bold}CodeB Terminal Dashboard{/bold} | [1]Overview [2]Servers [3]Projects [4]Deploy [5]Settings | [r]Refresh [q]Quit{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    // 개요 뷰 생성
    this.createOverviewView();
  }

  /**
   * 개요 뷰
   */
  createOverviewView() {
    // 서버 상태 박스
    this.widgets.serverStatus = this.grid.set(1, 0, 4, 6, blessed.box, {
      label: ' 📡 Servers ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: '█', style: { fg: 'cyan' } },
    });

    // 프로젝트 목록
    this.widgets.projectList = this.grid.set(1, 6, 4, 6, blessed.list, {
      label: ' 📦 Projects ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { fg: 'green', bold: true },
        selected: { bg: 'green', fg: 'black' },
        item: { fg: 'white' },
      },
      keys: true,
      mouse: true,
      scrollable: true,
      scrollbar: { ch: '█', style: { fg: 'green' } },
    });

    // 최근 배포
    this.widgets.deployments = this.grid.set(5, 0, 4, 8, blessed.list, {
      label: ' 🚀 Recent Deployments ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'yellow', bold: true },
        selected: { bg: 'yellow', fg: 'black' },
      },
      keys: true,
      mouse: true,
      scrollable: true,
    });

    // 시스템 정보
    this.widgets.systemInfo = this.grid.set(5, 8, 4, 4, blessed.box, {
      label: ' ℹ️  System Info ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        label: { fg: 'magenta', bold: true },
      },
    });

    // 로그 박스
    this.widgets.logs = this.grid.set(9, 0, 3, 12, contrib.log, {
      label: ' 📋 Activity Log ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'gray' },
        label: { fg: 'gray', bold: true },
      },
      scrollable: true,
      scrollback: 100,
    });
  }

  /**
   * 키 바인딩 설정
   */
  setupKeyBindings() {
    // 숫자키로 뷰 전환
    this.screen.key(['1'], () => this.switchView('overview'));
    this.screen.key(['2'], () => this.switchView('servers'));
    this.screen.key(['3'], () => this.switchView('projects'));
    this.screen.key(['4'], () => this.switchView('deploy'));
    this.screen.key(['5'], () => this.switchView('settings'));

    // 새로고침
    this.screen.key(['r'], async () => {
      this.log('Refreshing data...');
      await this.loadData();
      this.screen.render();
    });

    // Tab으로 위젯 포커스 전환
    this.screen.key(['tab'], () => {
      this.screen.focusNext();
    });

    // 프로젝트 선택 시 상세 정보
    this.widgets.projectList.on('select', (item) => {
      const projectName = item.getText().replace(/[●○]/g, '').trim().split(' ')[0];
      this.showProjectDetails(projectName);
    });
  }

  /**
   * 데이터 로드
   */
  async loadData() {
    try {
      const [servers, projects, deployments, ssot] = await Promise.all([
        callApi('/servers'),
        callApi('/projects'),
        callApi('/deploy?action=history'),
        callApi('/ssot?action=status'),
      ]);

      if (servers.success !== false) this.data.servers = servers.data || {};
      if (projects.success !== false) this.data.projects = projects.data || [];
      if (deployments.success !== false) this.data.deployments = deployments.data || [];
      if (ssot.success !== false) this.data.ssot = ssot.data || {};

      this.updateWidgets();
    } catch (error) {
      this.log(`{red-fg}Error loading data: ${error.message}{/red-fg}`);
    }
  }

  /**
   * 위젯 업데이트
   */
  updateWidgets() {
    this.updateServerStatus();
    this.updateProjectList();
    this.updateDeployments();
    this.updateSystemInfo();
    this.screen.render();
  }

  /**
   * 서버 상태 업데이트
   */
  updateServerStatus() {
    const servers = this.data.servers;
    let content = '';

    const serverInfo = {
      app: { name: 'App Server', ip: '158.247.203.55', role: 'Next.js, Dashboard' },
      streaming: { name: 'Streaming', ip: '141.164.42.213', role: 'Centrifugo' },
      storage: { name: 'Storage', ip: '64.176.226.119', role: 'PostgreSQL, Redis' },
      backup: { name: 'Backup', ip: '141.164.37.63', role: 'Backups, Preview' },
    };

    for (const [key, info] of Object.entries(serverInfo)) {
      const server = servers[key] || {};
      const status = server.status === 'online' ? '{green-fg}●{/green-fg}' : '{red-fg}●{/red-fg}';
      const metrics = server.metrics || {};

      content += `${status} {bold}${info.name}{/bold}\n`;
      content += `   IP: ${info.ip}\n`;
      content += `   Role: ${info.role}\n`;

      if (metrics.memory) {
        content += `   Memory: ${metrics.memory}\n`;
      }
      if (metrics.disk) {
        content += `   Disk: ${metrics.disk}\n`;
      }
      if (metrics.containers) {
        content += `   Containers: ${metrics.containers}\n`;
      }
      content += '\n';
    }

    this.widgets.serverStatus.setContent(content);
  }

  /**
   * 프로젝트 목록 업데이트
   */
  updateProjectList() {
    const projects = this.data.projects;
    const items = projects.map(p => {
      const status = p.status === 'running' ? '{green-fg}●{/green-fg}' :
                    p.status === 'stopped' ? '{yellow-fg}○{/yellow-fg}' : '{red-fg}●{/red-fg}';
      return `${status} ${p.name || p.id} (${p.type || 'unknown'})`;
    });

    if (items.length === 0) {
      items.push('{gray-fg}No projects registered{/gray-fg}');
    }

    this.widgets.projectList.setItems(items);
  }

  /**
   * 배포 목록 업데이트
   */
  updateDeployments() {
    const deployments = this.data.deployments.slice(0, 10);
    const items = deployments.map(d => {
      const status = d.status === 'success' ? '{green-fg}✓{/green-fg}' :
                    d.status === 'deploying' ? '{yellow-fg}⟳{/yellow-fg}' : '{red-fg}✗{/red-fg}';
      const time = d.deployedAt ? new Date(d.deployedAt).toLocaleString() : 'N/A';
      return `${status} ${d.project || d.projectName} → ${d.environment} (${time})`;
    });

    if (items.length === 0) {
      items.push('{gray-fg}No recent deployments{/gray-fg}');
    }

    this.widgets.deployments.setItems(items);
  }

  /**
   * 시스템 정보 업데이트
   */
  updateSystemInfo() {
    const ssot = this.data.ssot || {};
    const projects = this.data.projects || [];
    const servers = this.data.servers || {};

    const onlineServers = Object.values(servers).filter(s => s.status === 'online').length;
    const runningProjects = projects.filter(p => p.status === 'running').length;

    let content = '';
    content += `{bold}Version:{/bold} v3.0.0\n\n`;
    content += `{bold}Servers:{/bold}\n`;
    content += `  Online: {green-fg}${onlineServers}{/green-fg}/4\n\n`;
    content += `{bold}Projects:{/bold}\n`;
    content += `  Total: ${projects.length}\n`;
    content += `  Running: {green-fg}${runningProjects}{/green-fg}\n\n`;
    content += `{bold}Last Update:{/bold}\n`;
    content += `  ${new Date().toLocaleTimeString()}`;

    this.widgets.systemInfo.setContent(content);
  }

  /**
   * 로그 메시지 추가
   */
  log(message) {
    const time = new Date().toLocaleTimeString();
    this.widgets.logs.log(`[${time}] ${message}`);
  }

  /**
   * 뷰 전환
   */
  switchView(view) {
    this.currentView = view;
    this.log(`Switched to ${view} view`);

    // 뷰에 따라 레이아웃 변경 (추후 구현)
    switch (view) {
      case 'servers':
        this.showServersView();
        break;
      case 'projects':
        this.showProjectsView();
        break;
      case 'deploy':
        this.showDeployView();
        break;
      case 'settings':
        this.showSettingsView();
        break;
      default:
        // 개요 뷰 유지
        break;
    }

    this.screen.render();
  }

  /**
   * 서버 상세 뷰
   */
  showServersView() {
    this.log('Servers view - detailed metrics coming soon');
  }

  /**
   * 프로젝트 상세 뷰
   */
  showProjectsView() {
    this.widgets.projectList.focus();
  }

  /**
   * 배포 뷰
   */
  showDeployView() {
    this.widgets.deployments.focus();
  }

  /**
   * 설정 뷰
   */
  showSettingsView() {
    this.log('Settings view - configuration options coming soon');
  }

  /**
   * 프로젝트 상세 정보 표시
   */
  async showProjectDetails(projectName) {
    this.log(`Loading details for: ${projectName}`);

    try {
      const [project, env] = await Promise.all([
        callApi(`/projects`),
        callApi(`/env?project=${projectName}&action=current`),
      ]);

      const projectData = project.data?.find(p => p.name === projectName || p.id === projectName);

      if (projectData) {
        let details = `{bold}${projectName}{/bold}\n\n`;
        details += `Type: ${projectData.type || 'unknown'}\n`;
        details += `Status: ${projectData.status || 'unknown'}\n`;

        if (projectData.environments) {
          details += '\nEnvironments:\n';
          projectData.environments.forEach(e => {
            details += `  - ${e.name}: ${e.status}\n`;
          });
        }

        if (env.data && env.data.length > 0) {
          details += `\nENV Variables: ${env.data.length}\n`;
        }

        // 팝업으로 표시
        const popup = blessed.box({
          parent: this.screen,
          top: 'center',
          left: 'center',
          width: '50%',
          height: '50%',
          content: details,
          tags: true,
          border: { type: 'line' },
          style: {
            border: { fg: 'cyan' },
            bg: 'black',
          },
          label: ` Project: ${projectName} `,
          keys: true,
        });

        popup.key(['escape', 'q', 'enter'], () => {
          popup.destroy();
          this.screen.render();
        });

        popup.focus();
        this.screen.render();
      }
    } catch (error) {
      this.log(`{red-fg}Error loading project: ${error.message}{/red-fg}`);
    }
  }

  /**
   * 자동 새로고침 시작
   */
  startAutoRefresh() {
    this.refreshInterval = setInterval(async () => {
      await this.loadData();
    }, 30000); // 30초마다 새로고침
  }

  /**
   * 대시보드 종료
   */
  stop() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.screen.destroy();
  }
}

/**
 * 대시보드 시작
 */
export async function startDashboard() {
  const dashboard = new Dashboard();
  await dashboard.start();
}

// 직접 실행 시
if (process.argv[1]?.endsWith('dashboard.js')) {
  startDashboard().catch(console.error);
}
