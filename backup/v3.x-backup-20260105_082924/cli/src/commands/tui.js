/**
 * TUI Command - 터미널 대시보드
 *
 * 터미널 기반 대시보드로 서버 상태 모니터링 및 관리
 *
 * 사용법:
 *   we tui                    # 대시보드 시작
 *   we tui --compact          # 컴팩트 모드
 *   we tui --refresh 10       # 10초 새로고침
 *
 * 키보드 단축키:
 *   1-5: 뷰 전환
 *   Tab: 패널 포커스 전환
 *   r: 새로고침
 *   q/Esc: 종료
 *   Enter: 상세 보기 (서버/프로젝트)
 *   s: SSOT 동기화
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';

// Dashboard API
const API_BASE_URL = process.env.CODEB_API_URL || 'http://localhost:3000/api';

// 서버 설정
const SERVERS = [
  { key: 'app', name: '앱 서버', ip: '158.247.203.55', role: 'Next.js 앱, PowerDNS' },
  { key: 'streaming', name: '스트리밍', ip: '141.164.42.213', role: 'Centrifugo (WebSocket)' },
  { key: 'storage', name: '스토리지', ip: '64.176.226.119', role: 'PostgreSQL, Redis' },
  { key: 'backup', name: '백업', ip: '141.164.37.63', role: '백업, Preview, 모니터링' },
];

/**
 * API 호출 헬퍼
 */
async function callApi(endpoint, options = {}) {
  try {
    const fetchOptions = {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      ...options,
    };
    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * TUI 메인 함수
 */
export async function tui(options) {
  const { compact, refresh = 30 } = options;

  // 스크린 생성
  const screen = blessed.screen({
    smartCSR: true,
    title: 'CodeB 터미널 대시보드',
    fullUnicode: true,
  });

  // 상태 관리
  let currentView = 'overview';
  let refreshInterval = null;
  let cachedData = {
    servers: {},
    projects: [],
    deployments: [],
    ssot: {},
  };

  // 뷰 컨테이너
  const views = {};

  // ============================================================
  // 공통 헬퍼 함수
  // ============================================================
  function getStatusIcon(status) {
    switch (status) {
      case 'online':
      case 'running':
      case 'success':
        return '{green-fg}●{/green-fg}';
      case 'stopped':
      case 'pending':
        return '{yellow-fg}○{/yellow-fg}';
      case 'offline':
      case 'error':
      case 'failed':
        return '{red-fg}●{/red-fg}';
      default:
        return '{gray-fg}○{/gray-fg}';
    }
  }

  function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' + formatTime(date);
  }

  // ============================================================
  // 1. OVERVIEW 뷰 (기본)
  // ============================================================
  function createOverviewView() {
    const grid = new contrib.grid({ rows: 12, cols: 12, screen });

    const widgets = {};

    // 헤더
    widgets.header = grid.set(0, 0, 1, 12, blessed.box, {
      content: '{center}{bold}CodeB 대시보드{/bold} │ {cyan-fg}[1]{/cyan-fg}개요 {green-fg}[2]{/green-fg}서버 {yellow-fg}[3]{/yellow-fg}프로젝트 {magenta-fg}[4]{/magenta-fg}배포 {red-fg}[5]{/red-fg}설정 │ {blue-fg}[r]{/blue-fg}새로고침 {red-fg}[q]{/red-fg}종료{/center}',
      tags: true,
      style: { fg: 'white', bg: 'blue' },
    });

    // 서버 상태
    widgets.servers = grid.set(1, 0, 5, 4, blessed.list, {
      label: ' {cyan-fg}📡 서버 현황{/cyan-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { bold: true },
        selected: { bg: 'cyan', fg: 'black' },
      },
      keys: true,
      mouse: true,
      scrollable: true,
    });

    // 프로젝트 목록
    widgets.projects = grid.set(1, 4, 5, 4, blessed.list, {
      label: ' {green-fg}📦 프로젝트{/green-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { bold: true },
        selected: { bg: 'green', fg: 'black' },
      },
      keys: true,
      mouse: true,
      scrollable: true,
    });

    // 시스템 정보
    widgets.info = grid.set(1, 8, 3, 4, blessed.box, {
      label: ' {magenta-fg}ℹ️ 시스템{/magenta-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        label: { bold: true },
      },
    });

    // 포트 현황
    widgets.ports = grid.set(4, 8, 2, 4, blessed.box, {
      label: ' {yellow-fg}🔌 포트{/yellow-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { bold: true },
      },
    });

    // 최근 배포
    widgets.deployments = grid.set(6, 0, 3, 8, blessed.list, {
      label: ' {yellow-fg}🚀 최근 배포{/yellow-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { bold: true },
        selected: { bg: 'yellow', fg: 'black' },
      },
      keys: true,
      mouse: true,
    });

    // 액션 버튼
    widgets.actions = grid.set(6, 8, 3, 4, blessed.list, {
      label: ' {red-fg}⚡ 빠른 실행{/red-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'red' },
        label: { bold: true },
        selected: { bg: 'red', fg: 'white' },
      },
      keys: true,
      mouse: true,
      items: [
        '{green-fg}▶{/green-fg} 프로젝트 배포',
        '{cyan-fg}🔄{/cyan-fg} SSOT 동기화',
        '{yellow-fg}🔍{/yellow-fg} 상태 점검',
        '{magenta-fg}📋{/magenta-fg} 로그 보기',
        '{blue-fg}📊{/blue-fg} 전체 스캔',
      ],
    });

    // 로그
    widgets.logs = grid.set(9, 0, 3, 12, contrib.log, {
      label: ' {gray-fg}📋 활동 로그{/gray-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'gray' },
        label: { bold: true },
      },
      scrollable: true,
      scrollback: 100,
    });

    // 업데이트 함수
    widgets.update = function (data) {
      // 서버 업데이트
      const serverItems = SERVERS.map(s => {
        const serverData = data.servers[s.key] || {};
        const status = getStatusIcon(serverData.status || 'offline');
        return `${status} {bold}${s.name}{/bold}`;
      });
      widgets.servers.setItems(serverItems);

      // 프로젝트 업데이트
      const projectItems = (data.projects || []).map(p => {
        const status = getStatusIcon(p.status);
        return `${status} ${p.name || p.id}`;
      });
      widgets.projects.setItems(projectItems.length > 0 ? projectItems : ['{gray-fg}프로젝트 없음{/gray-fg}']);

      // 배포 업데이트
      const deployItems = (data.deployments || []).slice(0, 8).map(d => {
        const status = getStatusIcon(d.status);
        return `${status} ${d.project} → ${d.environment} ${formatTime(d.deployedAt)}`;
      });
      widgets.deployments.setItems(deployItems.length > 0 ? deployItems : ['{gray-fg}배포 기록 없음{/gray-fg}']);

      // 시스템 정보 업데이트
      const onlineServers = Object.values(data.servers || {}).filter(s => s.status === 'online').length;
      const runningProjects = (data.projects || []).filter(p => p.status === 'running').length;
      widgets.info.setContent(
        `{bold}버전:{/bold} v3.0.0\n` +
        `{bold}서버:{/bold} {green-fg}${onlineServers}{/green-fg}/4\n` +
        `{bold}프로젝트:{/bold} ${(data.projects || []).length}\n` +
        `{bold}실행중:{/bold} {green-fg}${runningProjects}{/green-fg}\n` +
        `\n{gray-fg}${new Date().toLocaleTimeString()}{/gray-fg}`
      );

      // 포트 정보 업데이트
      const ports = data.ssot?.portAllocation || {};
      let portContent = '';
      if (ports.production?.app) {
        portContent += `운영: ${ports.production.app.allocated?.length || 0}\n`;
      }
      if (ports.staging?.app) {
        portContent += `스테이징: ${ports.staging.app.allocated?.length || 0}\n`;
      }
      if (ports.preview?.app) {
        portContent += `프리뷰: ${ports.preview.app.allocated?.length || 0}`;
      }
      widgets.ports.setContent(portContent || '{gray-fg}데이터 없음{/gray-fg}');
    };

    widgets.log = function (message) {
      const time = new Date().toLocaleTimeString();
      widgets.logs.log(`[${time}] ${message}`);
    };

    widgets.focus = function () {
      widgets.projects.focus();
    };

    // 서버 선택 시 상세 뷰로 전환
    widgets.servers.on('select', (item, index) => {
      switchView('servers');
    });

    // 프로젝트 선택 시 상세 뷰로 전환
    widgets.projects.on('select', (item, index) => {
      switchView('projects');
    });

    // 배포 선택 시 배포 뷰로 전환
    widgets.deployments.on('select', (item, index) => {
      switchView('deploy');
    });

    // 액션 선택 시
    widgets.actions.on('select', async (item, index) => {
      switch (index) {
        case 0:
          widgets.log('배포: "we deploy <프로젝트>" 명령어를 사용하세요');
          break;
        case 1:
          widgets.log('SSOT 동기화 중...');
          await callApi('/ssot', { method: 'POST', body: { action: 'scan' } });
          await loadData();
          break;
        case 2:
          widgets.log('상태 점검 중...');
          await loadData();
          break;
        case 3:
          widgets.log('로그: "we monitor" 명령어를 사용하세요');
          break;
        case 4:
          widgets.log('전체 스캔: "we scan --json" 명령어를 사용하세요');
          break;
      }
    });

    return widgets;
  }

  // ============================================================
  // 2. SERVERS 뷰 (상세)
  // ============================================================
  function createServersView() {
    const grid = new contrib.grid({ rows: 12, cols: 12, screen });

    const widgets = {};

    // 헤더
    widgets.header = grid.set(0, 0, 1, 12, blessed.box, {
      content: '{center}{bold}서버 모니터링{/bold} │ {cyan-fg}[1]{/cyan-fg}개요 {green-fg}{bold}[2]서버{/bold}{/green-fg} {yellow-fg}[3]{/yellow-fg}프로젝트 │ {blue-fg}[Tab]{/blue-fg}선택 {red-fg}[q]{/red-fg}뒤로{/center}',
      tags: true,
      style: { fg: 'white', bg: 'green' },
    });

    // 서버 목록
    widgets.serverList = grid.set(1, 0, 11, 4, blessed.list, {
      label: ' {cyan-fg}📡 서버 목록{/cyan-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { bold: true },
        selected: { bg: 'cyan', fg: 'black' },
      },
      keys: true,
      mouse: true,
    });

    // 서버 상세
    widgets.serverDetail = grid.set(1, 4, 6, 8, blessed.box, {
      label: ' {green-fg}서버 상세 정보{/green-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { bold: true },
      },
    });

    // 메트릭
    widgets.metrics = grid.set(7, 4, 5, 4, blessed.box, {
      label: ' {yellow-fg}📊 메트릭{/yellow-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { bold: true },
      },
    });

    // 컨테이너 목록
    widgets.containers = grid.set(7, 8, 5, 4, blessed.list, {
      label: ' {magenta-fg}🐳 컨테이너{/magenta-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        label: { bold: true },
        selected: { bg: 'magenta', fg: 'white' },
      },
      keys: true,
      mouse: true,
    });

    let selectedServerIndex = 0;

    widgets.update = function (data) {
      const serverItems = SERVERS.map((s, i) => {
        const serverData = data.servers[s.key] || {};
        const status = getStatusIcon(serverData.status || 'offline');
        const prefix = i === selectedServerIndex ? '{bold}> ' : '  ';
        return `${prefix}${status} ${s.name}{/bold}`;
      });
      widgets.serverList.setItems(serverItems);

      // 선택된 서버 상세 정보
      const server = SERVERS[selectedServerIndex];
      const serverData = data.servers[server.key] || {};
      const metrics = serverData.metrics || {};

      widgets.serverDetail.setContent(
        `{bold}이름:{/bold} ${server.name}\n` +
        `{bold}IP:{/bold} ${server.ip}\n` +
        `{bold}역할:{/bold} ${server.role}\n` +
        `{bold}상태:{/bold} ${getStatusIcon(serverData.status || 'offline')} ${serverData.status || '알 수 없음'}\n` +
        `\n{bold}서비스:{/bold}\n` +
        (server.key === 'app' ? '  - Next.js 앱\n  - PowerDNS\n  - Caddy\n' : '') +
        (server.key === 'streaming' ? '  - Centrifugo (WebSocket)\n' : '') +
        (server.key === 'storage' ? '  - PostgreSQL\n  - Redis\n' : '') +
        (server.key === 'backup' ? '  - 백업 시스템\n  - Preview 환경\n  - ENV 저장소\n' : '')
      );

      widgets.metrics.setContent(
        `{bold}메모리:{/bold} ${metrics.memory || 'N/A'}\n` +
        `{bold}CPU:{/bold} ${metrics.cpu || 'N/A'}\n` +
        `{bold}디스크:{/bold} ${metrics.disk || 'N/A'}\n` +
        `{bold}컨테이너:{/bold} ${metrics.containers || 'N/A'}\n` +
        `{bold}가동시간:{/bold} ${metrics.uptime || 'N/A'}`
      );

      // 컨테이너 목록
      const containers = serverData.containers || [];
      const containerItems = containers.length > 0
        ? containers.map(c => `${getStatusIcon(c.status)} ${c.name}`)
        : ['{gray-fg}컨테이너 없음{/gray-fg}'];
      widgets.containers.setItems(containerItems);
    };

    widgets.serverList.on('select', (item, index) => {
      selectedServerIndex = index;
      widgets.update(cachedData);
      screen.render();
    });

    widgets.serverList.key(['enter'], () => {
      widgets.update(cachedData);
      screen.render();
    });

    widgets.focus = function () {
      widgets.serverList.focus();
    };

    return widgets;
  }

  // ============================================================
  // 3. PROJECTS 뷰 (상세)
  // ============================================================
  function createProjectsView() {
    const grid = new contrib.grid({ rows: 12, cols: 12, screen });

    const widgets = {};

    // 헤더
    widgets.header = grid.set(0, 0, 1, 12, blessed.box, {
      content: '{center}{bold}프로젝트 관리{/bold} │ {cyan-fg}[1]{/cyan-fg}개요 {green-fg}[2]{/green-fg}서버 {yellow-fg}{bold}[3]프로젝트{/bold}{/yellow-fg} │ {green-fg}[d]{/green-fg}배포 {red-fg}[s]{/red-fg}중지 {blue-fg}[r]{/blue-fg}재시작{/center}',
      tags: true,
      style: { fg: 'black', bg: 'yellow' },
    });

    // 프로젝트 목록
    widgets.projectList = grid.set(1, 0, 11, 4, blessed.list, {
      label: ' {green-fg}📦 프로젝트{/green-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { bold: true },
        selected: { bg: 'green', fg: 'black' },
      },
      keys: true,
      mouse: true,
    });

    // 프로젝트 상세
    widgets.projectDetail = grid.set(1, 4, 5, 8, blessed.box, {
      label: ' {cyan-fg}프로젝트 상세{/cyan-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { bold: true },
      },
    });

    // 환경 변수
    widgets.env = grid.set(6, 4, 3, 4, blessed.box, {
      label: ' {yellow-fg}🔐 환경변수{/yellow-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { bold: true },
      },
    });

    // 도메인
    widgets.domains = grid.set(6, 8, 3, 4, blessed.list, {
      label: ' {magenta-fg}🌐 도메인{/magenta-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        label: { bold: true },
      },
    });

    // 배포 히스토리
    widgets.history = grid.set(9, 4, 3, 8, blessed.list, {
      label: ' {blue-fg}📜 배포 기록{/blue-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'blue' },
        label: { bold: true },
      },
    });

    let selectedProjectIndex = 0;

    widgets.update = function (data) {
      const projects = data.projects || [];
      const projectItems = projects.map((p, i) => {
        const status = getStatusIcon(p.status);
        const prefix = i === selectedProjectIndex ? '{bold}> ' : '  ';
        return `${prefix}${status} ${p.name || p.id}{/bold}`;
      });
      widgets.projectList.setItems(projectItems.length > 0 ? projectItems : ['{gray-fg}프로젝트 없음{/gray-fg}']);

      if (projects.length > 0) {
        const project = projects[selectedProjectIndex] || projects[0];

        widgets.projectDetail.setContent(
          `{bold}이름:{/bold} ${project.name || project.id}\n` +
          `{bold}타입:{/bold} ${project.type || 'nextjs'}\n` +
          `{bold}상태:{/bold} ${getStatusIcon(project.status)} ${project.status}\n` +
          `{bold}서버:{/bold} ${project.server || 'app'}\n` +
          `{bold}포트:{/bold} ${project.port || 'N/A'}\n` +
          `{bold}생성일:{/bold} ${formatDate(project.createdAt)}`
        );

        // ENV 정보
        const envCount = Object.keys(project.env || {}).length;
        widgets.env.setContent(
          `{bold}변수 수:{/bold} ${envCount}\n` +
          `{bold}DB:{/bold} ${project.database ? '{green-fg}있음{/green-fg}' : '{gray-fg}없음{/gray-fg}'}\n` +
          `{bold}Redis:{/bold} ${project.redis ? '{green-fg}있음{/green-fg}' : '{gray-fg}없음{/gray-fg}'}`
        );

        // 도메인
        const domains = project.domains || [];
        widgets.domains.setItems(domains.length > 0 ? domains : ['{gray-fg}도메인 없음{/gray-fg}']);

        // 히스토리
        const history = (data.deployments || [])
          .filter(d => d.project === project.name || d.project === project.id)
          .slice(0, 5)
          .map(d => `${getStatusIcon(d.status)} ${d.environment} ${formatDate(d.deployedAt)}`);
        widgets.history.setItems(history.length > 0 ? history : ['{gray-fg}기록 없음{/gray-fg}']);
      }
    };

    widgets.projectList.on('select', (item, index) => {
      selectedProjectIndex = index;
      widgets.update(cachedData);
      screen.render();
    });

    widgets.projectList.key(['enter'], () => {
      widgets.update(cachedData);
      screen.render();
    });

    widgets.focus = function () {
      widgets.projectList.focus();
    };

    return widgets;
  }

  // ============================================================
  // 4. DEPLOY 뷰
  // ============================================================
  function createDeployView() {
    const grid = new contrib.grid({ rows: 12, cols: 12, screen });

    const widgets = {};

    // 헤더
    widgets.header = grid.set(0, 0, 1, 12, blessed.box, {
      content: '{center}{bold}배포 센터{/bold} │ {cyan-fg}[1]{/cyan-fg}개요 {magenta-fg}{bold}[4]배포{/bold}{/magenta-fg} │ {green-fg}[Enter]{/green-fg}배포 {red-fg}[q]{/red-fg}뒤로{/center}',
      tags: true,
      style: { fg: 'white', bg: 'magenta' },
    });

    // 배포 대상 선택
    widgets.targets = grid.set(1, 0, 5, 6, blessed.list, {
      label: ' {green-fg}🎯 배포 대상{/green-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { bold: true },
        selected: { bg: 'green', fg: 'black' },
      },
      keys: true,
      mouse: true,
    });

    // 환경 선택
    widgets.environments = grid.set(1, 6, 5, 6, blessed.list, {
      label: ' {yellow-fg}🌍 환경{/yellow-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { bold: true },
        selected: { bg: 'yellow', fg: 'black' },
      },
      keys: true,
      mouse: true,
      items: [
        '{cyan-fg}●{/cyan-fg} 스테이징',
        '{green-fg}●{/green-fg} 운영',
        '{magenta-fg}●{/magenta-fg} 프리뷰',
      ],
    });

    // 배포 히스토리
    widgets.history = grid.set(6, 0, 6, 12, blessed.list, {
      label: ' {blue-fg}📜 최근 배포 기록{/blue-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'blue' },
        label: { bold: true },
        selected: { bg: 'blue', fg: 'white' },
      },
      keys: true,
      mouse: true,
    });

    widgets.update = function (data) {
      const projects = data.projects || [];
      const targetItems = projects.map(p => {
        const status = getStatusIcon(p.status);
        return `${status} ${p.name || p.id}`;
      });
      widgets.targets.setItems(targetItems.length > 0 ? targetItems : ['{gray-fg}프로젝트 없음{/gray-fg}']);

      const deployItems = (data.deployments || []).slice(0, 15).map(d => {
        const status = getStatusIcon(d.status);
        const projectName = (d.project || '').padEnd(20);
        const env = (d.environment || '').padEnd(12);
        return `${status} ${projectName} → ${env} ${formatDate(d.deployedAt)}`;
      });
      widgets.history.setItems(deployItems.length > 0 ? deployItems : ['{gray-fg}배포 기록 없음{/gray-fg}']);
    };

    widgets.focus = function () {
      widgets.targets.focus();
    };

    return widgets;
  }

  // ============================================================
  // 5. CONFIG 뷰
  // ============================================================
  function createConfigView() {
    const grid = new contrib.grid({ rows: 12, cols: 12, screen });

    const widgets = {};

    // 헤더
    widgets.header = grid.set(0, 0, 1, 12, blessed.box, {
      content: '{center}{bold}설정 관리{/bold} │ {red-fg}{bold}[5]설정{/bold}{/red-fg} │ {blue-fg}[Enter]{/blue-fg}편집 {red-fg}[q]{/red-fg}뒤로{/center}',
      tags: true,
      style: { fg: 'white', bg: 'red' },
    });

    // 설정 카테고리
    widgets.categories = grid.set(1, 0, 11, 4, blessed.list, {
      label: ' {cyan-fg}📁 카테고리{/cyan-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { bold: true },
        selected: { bg: 'cyan', fg: 'black' },
      },
      keys: true,
      mouse: true,
      items: [
        '{green-fg}●{/green-fg} 서버 설정',
        '{yellow-fg}●{/yellow-fg} 포트 할당',
        '{magenta-fg}●{/magenta-fg} 도메인 설정',
        '{blue-fg}●{/blue-fg} SSH 키',
        '{red-fg}●{/red-fg} 알림 설정',
        '{gray-fg}●{/gray-fg} CLI 환경설정',
      ],
    });

    // 설정 상세
    widgets.settings = grid.set(1, 4, 11, 8, blessed.box, {
      label: ' {green-fg}⚙️ 설정 정보{/green-fg} ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { bold: true },
      },
    });

    widgets.update = function (data) {
      widgets.settings.setContent(
        `{bold}서버 구성{/bold}\n` +
        `${'─'.repeat(40)}\n\n` +
        `{bold}앱 서버:{/bold}\n` +
        `  호스트: 158.247.203.55\n` +
        `  포트: 4000-4499 (운영)\n\n` +
        `{bold}스트리밍 서버:{/bold}\n` +
        `  호스트: 141.164.42.213\n` +
        `  Centrifugo: 8000\n\n` +
        `{bold}스토리지 서버:{/bold}\n` +
        `  호스트: 64.176.226.119\n` +
        `  PostgreSQL: 5432\n` +
        `  Redis: 6379\n\n` +
        `{bold}백업 서버:{/bold}\n` +
        `  호스트: 141.164.37.63\n` +
        `  Preview 포트: 5000-5999\n\n` +
        `{gray-fg}편집: we config set <키> <값>{/gray-fg}`
      );
    };

    widgets.focus = function () {
      widgets.categories.focus();
    };

    return widgets;
  }

  // ============================================================
  // 뷰 초기화
  // ============================================================
  function initViews() {
    views.overview = createOverviewView();
    views.servers = createServersView();
    views.projects = createProjectsView();
    views.deploy = createDeployView();
    views.config = createConfigView();
  }

  function switchView(viewName) {
    if (currentView === viewName) return;

    // 현재 뷰의 위젯 숨기기
    screen.children.forEach(child => child.hide());

    currentView = viewName;

    // 새 뷰 보이기
    const view = views[viewName];
    if (view) {
      Object.values(view).forEach(widget => {
        if (widget && widget.show) widget.show();
      });
      view.update(cachedData);
      view.focus();
    }

    screen.render();
  }

  // ============================================================
  // 데이터 로드
  // ============================================================
  async function loadData() {
    const view = views[currentView];
    if (view && view.log) {
      view.log('데이터 로드 중...');
    }

    try {
      const [servers, projects, deployments, ssot] = await Promise.all([
        callApi('/servers'),
        callApi('/projects'),
        callApi('/deploy?action=history'),
        callApi('/ssot?action=status'),
      ]);

      cachedData = {
        servers: servers.data || {},
        projects: projects.data || [],
        deployments: deployments.data || [],
        ssot: ssot.data || {},
      };

      // 현재 뷰 업데이트
      if (view) {
        view.update(cachedData);
        if (view.log) {
          view.log('{green-fg}데이터 로드 완료{/green-fg}');
        }
      }

      screen.render();
    } catch (error) {
      if (view && view.log) {
        view.log(`{red-fg}오류: ${error.message}{/red-fg}`);
      }
    }
  }

  // ============================================================
  // 키 바인딩
  // ============================================================
  screen.key(['escape', 'q', 'C-c'], () => {
    if (currentView !== 'overview') {
      switchView('overview');
    } else {
      if (refreshInterval) clearInterval(refreshInterval);
      screen.destroy();
      process.exit(0);
    }
  });

  screen.key(['r'], async () => {
    await loadData();
  });

  screen.key(['tab'], () => {
    screen.focusNext();
  });

  screen.key(['S-tab'], () => {
    screen.focusPrevious();
  });

  // 뷰 전환
  screen.key(['1'], () => switchView('overview'));
  screen.key(['2'], () => switchView('servers'));
  screen.key(['3'], () => switchView('projects'));
  screen.key(['4'], () => switchView('deploy'));
  screen.key(['5'], () => switchView('config'));

  // SSOT 동기화
  screen.key(['s'], async () => {
    const view = views[currentView];
    if (view && view.log) {
      view.log('SSOT 동기화 중...');
    }
    await callApi('/ssot', { method: 'POST', body: { action: 'scan' } });
    await loadData();
  });

  // ============================================================
  // 시작
  // ============================================================
  initViews();
  switchView('overview');

  const view = views.overview;
  if (view && view.log) {
    view.log('CodeB 터미널 대시보드 시작');
    view.log(`자동 새로고침: ${refresh}초 (수동: [r] 키)`);
  }

  await loadData();

  // 자동 새로고침
  if (refresh > 0) {
    refreshInterval = setInterval(loadData, refresh * 1000);
  }

  screen.render();
}

export default tui;
