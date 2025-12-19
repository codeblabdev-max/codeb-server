/**
 * Settings View - 설정 관리
 *
 * CLI 설정, API 설정, 서버 설정 관리
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * 설정 뷰
 */
export class SettingsView {
  constructor(screen, logFn) {
    this.screen = screen;
    this.log = logFn || (() => {});
    this.widgets = {};
    this.configPath = join(homedir(), '.codeb', 'config.json');
    this.config = this.loadConfig();
  }

  /**
   * 설정 로드
   */
  loadConfig() {
    try {
      if (existsSync(this.configPath)) {
        return JSON.parse(readFileSync(this.configPath, 'utf-8'));
      }
    } catch {}

    return {
      apiUrl: 'http://localhost:3000/api',
      apiKey: '',
      servers: {
        app: '158.247.203.55',
        streaming: '141.164.42.213',
        storage: '64.176.226.119',
        backup: '141.164.37.63',
      },
      sshUser: 'root',
      baseDomain: 'codeb.kr',
      refreshInterval: 30,
      theme: 'default',
    };
  }

  /**
   * 설정 저장
   */
  saveConfig() {
    try {
      const dir = join(homedir(), '.codeb');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 뷰 생성
   */
  create() {
    const grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // 설정 카테고리
    this.widgets.categories = grid.set(0, 0, 8, 3, blessed.list, {
      label: ' ⚙️  Settings ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
      },
      keys: true,
      mouse: true,
      items: [
        '🌐 API Configuration',
        '🖥️  Server IPs',
        '🔑 SSH Settings',
        '🎨 Theme',
        '⏱️  Refresh Interval',
        '📋 View Config',
        '💾 Save Config',
        '🔄 Reset to Default',
      ],
    });

    // 설정 폼
    this.widgets.form = grid.set(0, 3, 8, 9, blessed.box, {
      label: ' Configuration ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'green' } },
      scrollable: true,
    });

    // 출력/상태
    this.widgets.status = grid.set(8, 0, 4, 12, contrib.log, {
      label: ' Status ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'gray' } },
      scrollable: true,
    });

    // 이벤트 설정
    this.setupEvents();

    // 초기 화면
    this.showOverview();

    return this.widgets;
  }

  /**
   * 이벤트 설정
   */
  setupEvents() {
    this.widgets.categories.on('select', (item, index) => {
      switch (index) {
        case 0: // API Configuration
          this.showApiConfig();
          break;
        case 1: // Server IPs
          this.showServerConfig();
          break;
        case 2: // SSH Settings
          this.showSshConfig();
          break;
        case 3: // Theme
          this.showThemeConfig();
          break;
        case 4: // Refresh Interval
          this.showRefreshConfig();
          break;
        case 5: // View Config
          this.showFullConfig();
          break;
        case 6: // Save Config
          this.saveAndNotify();
          break;
        case 7: // Reset to Default
          this.resetConfig();
          break;
      }
    });
  }

  /**
   * 개요 표시
   */
  showOverview() {
    let content = '{bold}CodeB Terminal Dashboard Settings{/bold}\n\n';
    content += 'Select a category from the left to configure.\n\n';
    content += '{bold}Quick Info:{/bold}\n';
    content += `  Config Path: ${this.configPath}\n`;
    content += `  API URL: ${this.config.apiUrl}\n`;
    content += `  SSH User: ${this.config.sshUser}\n`;
    content += `  Base Domain: ${this.config.baseDomain}\n`;

    this.widgets.form.setContent(content);
    this.screen.render();
  }

  /**
   * API 설정 표시
   */
  showApiConfig() {
    let content = '{bold}🌐 API Configuration{/bold}\n\n';
    content += `{bold}API URL:{/bold}\n`;
    content += `  ${this.config.apiUrl}\n\n`;
    content += `{bold}API Key:{/bold}\n`;
    content += `  ${this.config.apiKey ? '********' : '(not set)'}\n\n`;
    content += '{gray-fg}To change, edit ~/.codeb/config.json{/gray-fg}\n';
    content += '{gray-fg}Or use: we config set apiUrl <url>{/gray-fg}';

    this.widgets.form.setContent(content);
    this.output('API configuration loaded');
    this.screen.render();
  }

  /**
   * 서버 설정 표시
   */
  showServerConfig() {
    const servers = this.config.servers || {};

    let content = '{bold}🖥️  Server IPs{/bold}\n\n';
    content += '{bold}App Server:{/bold}\n';
    content += `  ${servers.app || 'Not configured'}\n`;
    content += '  Role: Next.js apps, Dashboard, PowerDNS\n\n';

    content += '{bold}Streaming Server:{/bold}\n';
    content += `  ${servers.streaming || 'Not configured'}\n`;
    content += '  Role: Centrifugo (WebSocket)\n\n';

    content += '{bold}Storage Server:{/bold}\n';
    content += `  ${servers.storage || 'Not configured'}\n`;
    content += '  Role: PostgreSQL, Redis\n\n';

    content += '{bold}Backup Server:{/bold}\n';
    content += `  ${servers.backup || 'Not configured'}\n`;
    content += '  Role: Backups, Preview environments';

    this.widgets.form.setContent(content);
    this.output('Server configuration loaded');
    this.screen.render();
  }

  /**
   * SSH 설정 표시
   */
  showSshConfig() {
    let content = '{bold}🔑 SSH Settings{/bold}\n\n';
    content += `{bold}SSH User:{/bold}\n`;
    content += `  ${this.config.sshUser}\n\n`;
    content += `{bold}Base Domain:{/bold}\n`;
    content += `  ${this.config.baseDomain}\n\n`;
    content += '{yellow-fg}⚠️  SSH access is Admin-only{/yellow-fg}\n\n';
    content += '{gray-fg}Team members use MCP API (no SSH required){/gray-fg}';

    this.widgets.form.setContent(content);
    this.output('SSH configuration loaded');
    this.screen.render();
  }

  /**
   * 테마 설정 표시
   */
  showThemeConfig() {
    let content = '{bold}🎨 Theme Settings{/bold}\n\n';
    content += `Current Theme: ${this.config.theme || 'default'}\n\n`;
    content += '{bold}Available Themes:{/bold}\n';
    content += '  • default - Classic terminal colors\n';
    content += '  • dark - Dark mode (coming soon)\n';
    content += '  • light - Light mode (coming soon)\n';
    content += '  • matrix - Green on black (coming soon)\n';

    this.widgets.form.setContent(content);
    this.screen.render();
  }

  /**
   * 새로고침 간격 설정 표시
   */
  showRefreshConfig() {
    let content = '{bold}⏱️  Auto-Refresh Interval{/bold}\n\n';
    content += `Current: ${this.config.refreshInterval || 30} seconds\n\n`;
    content += '{bold}Recommended:{/bold}\n';
    content += '  • 10s - Real-time monitoring\n';
    content += '  • 30s - Normal usage (default)\n';
    content += '  • 60s - Low bandwidth\n';
    content += '  • 0   - Disabled (manual refresh only)\n';

    this.widgets.form.setContent(content);
    this.screen.render();
  }

  /**
   * 전체 설정 표시
   */
  showFullConfig() {
    let content = '{bold}📋 Full Configuration{/bold}\n\n';
    content += JSON.stringify(this.config, null, 2);

    this.widgets.form.setContent(content);
    this.output('Full configuration displayed');
    this.screen.render();
  }

  /**
   * 설정 저장 및 알림
   */
  saveAndNotify() {
    if (this.saveConfig()) {
      this.output('{green-fg}✓ Configuration saved{/green-fg}');
    } else {
      this.output('{red-fg}✗ Failed to save configuration{/red-fg}');
    }
    this.screen.render();
  }

  /**
   * 설정 초기화
   */
  resetConfig() {
    this.config = {
      apiUrl: 'http://localhost:3000/api',
      apiKey: '',
      servers: {
        app: '158.247.203.55',
        streaming: '141.164.42.213',
        storage: '64.176.226.119',
        backup: '141.164.37.63',
      },
      sshUser: 'root',
      baseDomain: 'codeb.kr',
      refreshInterval: 30,
      theme: 'default',
    };

    this.saveConfig();
    this.output('{yellow-fg}⟳ Configuration reset to defaults{/yellow-fg}');
    this.showOverview();
  }

  /**
   * 출력 로그
   */
  output(message) {
    const time = new Date().toLocaleTimeString();
    this.widgets.status.log(`[${time}] ${message}`);
  }

  /**
   * 업데이트
   */
  async update() {
    // 설정은 정적이므로 특별한 업데이트 불필요
  }

  /**
   * 포커스
   */
  focus() {
    this.widgets.categories.focus();
  }
}

export default SettingsView;
