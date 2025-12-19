/**
 * Projects View - 프로젝트 관리
 *
 * 프로젝트 목록, 상세 정보, 배포, ENV 관리
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';

const API_BASE_URL = process.env.CODEB_API_URL || 'http://localhost:3000/api';

async function callApi(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 프로젝트 관리 뷰
 */
export class ProjectsView {
  constructor(screen, logFn) {
    this.screen = screen;
    this.log = logFn || (() => {});
    this.widgets = {};
    this.projects = [];
    this.selectedProject = null;
  }

  /**
   * 뷰 생성
   */
  create() {
    const grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // 프로젝트 목록
    this.widgets.projectList = grid.set(0, 0, 8, 4, blessed.list, {
      label: ' 📦 Projects ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        selected: { bg: 'green', fg: 'black' },
        item: { fg: 'white' },
      },
      keys: true,
      mouse: true,
      scrollable: true,
      scrollbar: { ch: '█', style: { fg: 'green' } },
    });

    // 프로젝트 상세
    this.widgets.projectDetails = grid.set(0, 4, 5, 5, blessed.box, {
      label: ' Project Details ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      scrollable: true,
    });

    // ENV 목록
    this.widgets.envList = grid.set(0, 9, 5, 3, blessed.list, {
      label: ' ENV Variables ',
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

    // 환경 목록 (Production/Staging)
    this.widgets.environments = grid.set(5, 4, 3, 5, blessed.list, {
      label: ' Environments ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        selected: { bg: 'magenta', fg: 'black' },
      },
      keys: true,
      mouse: true,
    });

    // 도메인 목록
    this.widgets.domains = grid.set(5, 9, 3, 3, blessed.box, {
      label: ' Domains ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'blue' } },
    });

    // 액션 버튼
    this.widgets.actions = grid.set(8, 0, 4, 4, blessed.list, {
      label: ' Actions ',
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'red' },
        selected: { bg: 'red', fg: 'white' },
      },
      keys: true,
      mouse: true,
      items: [
        '▶ Deploy',
        '⟳ Restart',
        '■ Stop',
        '📋 View Logs',
        '🔄 Sync ENV',
        '🌐 Setup Domain',
      ],
    });

    // 로그/출력
    this.widgets.output = grid.set(8, 4, 4, 8, contrib.log, {
      label: ' Output ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'gray' } },
      scrollable: true,
      scrollback: 100,
    });

    // 이벤트 바인딩
    this.setupEvents();

    return this.widgets;
  }

  /**
   * 이벤트 설정
   */
  setupEvents() {
    // 프로젝트 선택
    this.widgets.projectList.on('select', async (item, index) => {
      const project = this.projects[index];
      if (project) {
        this.selectedProject = project;
        await this.loadProjectDetails(project.name || project.id);
      }
    });

    // 액션 실행
    this.widgets.actions.on('select', async (item, index) => {
      if (!this.selectedProject) {
        this.output('Select a project first');
        return;
      }

      const projectName = this.selectedProject.name || this.selectedProject.id;

      switch (index) {
        case 0: // Deploy
          await this.deployProject(projectName);
          break;
        case 1: // Restart
          await this.restartProject(projectName);
          break;
        case 2: // Stop
          await this.stopProject(projectName);
          break;
        case 3: // View Logs
          this.output(`Use: we monitor ${projectName}`);
          break;
        case 4: // Sync ENV
          await this.syncEnv(projectName);
          break;
        case 5: // Setup Domain
          this.output(`Use: we domain setup ${projectName}`);
          break;
      }
    });
  }

  /**
   * 데이터 로드
   */
  async update() {
    try {
      const response = await callApi('/projects');

      if (response.data) {
        this.projects = response.data;
        this.updateProjectList();
      }

      this.screen.render();
    } catch (error) {
      this.output(`Error: ${error.message}`);
    }
  }

  /**
   * 프로젝트 목록 업데이트
   */
  updateProjectList() {
    const items = this.projects.map(p => {
      const status = p.status === 'running' ? '{green-fg}●{/green-fg}' :
                    p.status === 'stopped' ? '{yellow-fg}○{/yellow-fg}' : '{red-fg}●{/red-fg}';
      return `${status} ${p.name || p.id}`;
    });

    if (items.length === 0) {
      items.push('{gray-fg}No projects{/gray-fg}');
    }

    this.widgets.projectList.setItems(items);
  }

  /**
   * 프로젝트 상세 로드
   */
  async loadProjectDetails(projectName) {
    try {
      const [env, domains] = await Promise.all([
        callApi(`/env?project=${projectName}&action=current`),
        callApi('/domains'),
      ]);

      const project = this.selectedProject;
      let content = '';

      content += `{bold}${projectName}{/bold}\n\n`;
      content += `Type: ${project.type || 'unknown'}\n`;
      content += `Status: ${project.status || 'unknown'}\n`;

      if (project.port) {
        content += `Port: ${project.port}\n`;
      }

      if (project.gitRepo) {
        content += `\nGit: ${project.gitRepo}\n`;
      }

      this.widgets.projectDetails.setContent(content);

      // ENV 목록
      if (env.data) {
        const envItems = env.data.map(e =>
          `${e.key}=${e.isSecret ? '******' : (e.value?.substring(0, 20) || '')}`
        );
        this.widgets.envList.setItems(envItems.length > 0 ? envItems : ['{gray-fg}No ENV{/gray-fg}']);
      }

      // 환경 목록
      if (project.environments) {
        const envItems = project.environments.map(e => {
          const status = e.status === 'running' ? '{green-fg}●{/green-fg}' : '{yellow-fg}○{/yellow-fg}';
          return `${status} ${e.name}`;
        });
        this.widgets.environments.setItems(envItems);
      } else {
        this.widgets.environments.setItems([
          '{yellow-fg}○{/yellow-fg} production',
          '{gray-fg}○{/gray-fg} staging',
        ]);
      }

      // 도메인
      if (domains.data) {
        const projectDomains = domains.data.filter(d => d.domain.includes(projectName));
        let domainContent = projectDomains.map(d => `${d.domain}`).join('\n');
        if (!domainContent) domainContent = '{gray-fg}No domains{/gray-fg}';
        this.widgets.domains.setContent(domainContent);
      }

      this.screen.render();
    } catch (error) {
      this.output(`Error loading details: ${error.message}`);
    }
  }

  /**
   * 프로젝트 배포
   */
  async deployProject(projectName) {
    this.output(`Deploying ${projectName}...`);

    const response = await callApi('/deploy', {
      method: 'POST',
      body: { project: projectName, environment: 'production' },
    });

    if (response.success) {
      this.output(`{green-fg}✓ Deployed successfully{/green-fg}`);
      await this.update();
    } else {
      this.output(`{red-fg}✗ Deploy failed: ${response.error}{/red-fg}`);
    }
  }

  /**
   * 프로젝트 재시작
   */
  async restartProject(projectName) {
    this.output(`Restarting ${projectName}...`);

    // Stop then deploy
    await callApi(`/deploy?project=${projectName}&action=stop`, { method: 'DELETE' });
    await this.deployProject(projectName);
  }

  /**
   * 프로젝트 중지
   */
  async stopProject(projectName) {
    this.output(`Stopping ${projectName}...`);

    const response = await callApi(`/deploy?project=${projectName}&action=stop`, {
      method: 'DELETE',
    });

    if (response.success) {
      this.output(`{yellow-fg}■ Stopped{/yellow-fg}`);
      await this.update();
    } else {
      this.output(`{red-fg}✗ Stop failed: ${response.error}{/red-fg}`);
    }
  }

  /**
   * ENV 동기화
   */
  async syncEnv(projectName) {
    this.output(`Syncing ENV for ${projectName}...`);
    this.output(`Use: we env push ${projectName}`);
  }

  /**
   * 출력 로그
   */
  output(message) {
    const time = new Date().toLocaleTimeString();
    this.widgets.output.log(`[${time}] ${message}`);
    this.screen.render();
  }

  /**
   * 포커스
   */
  focus() {
    this.widgets.projectList.focus();
  }
}

export default ProjectsView;
