/**
 * CodeB CLI - Configuration Store
 * Persistent configuration using Conf
 */

import Conf from 'conf';

interface ConfigSchema {
  apiKey: string;
  teamId: string;
  teamName: string;
  apiUrl: string;
  centrifugoUrl: string;
  defaultEnvironment: 'staging' | 'production';
  linkedProjects: Record<string, string>;
  recentProjects: string[];
  theme: 'auto' | 'dark' | 'light';
  telemetry: boolean;
}

export class ConfigStore {
  private conf: Conf<ConfigSchema>;

  constructor() {
    this.conf = new Conf<ConfigSchema>({
      projectName: 'codeb',
      schema: {
        apiKey: { type: 'string', default: '' },
        teamId: { type: 'string', default: '' },
        teamName: { type: 'string', default: '' },
        apiUrl: { type: 'string', default: 'https://api.codeb.kr/api' },
        centrifugoUrl: { type: 'string', default: 'wss://ws.codeb.kr/connection/websocket' },
        defaultEnvironment: {
          type: 'string',
          enum: ['staging', 'production'],
          default: 'staging',
        },
        linkedProjects: { type: 'object', default: {} },
        recentProjects: { type: 'array', default: [], items: { type: 'string' } },
        theme: {
          type: 'string',
          enum: ['auto', 'dark', 'light'],
          default: 'auto',
        },
        telemetry: { type: 'boolean', default: true },
      },
    });

    // Check for env override
    if (process.env.CODEB_API_KEY) {
      this.conf.set('apiKey', process.env.CODEB_API_KEY);
    }
    if (process.env.CODEB_API_URL) {
      this.conf.set('apiUrl', process.env.CODEB_API_URL);
    }
  }

  get<K extends keyof ConfigSchema>(key: K): ConfigSchema[K] {
    return this.conf.get(key);
  }

  set<K extends keyof ConfigSchema>(key: K, value: ConfigSchema[K]): void {
    this.conf.set(key, value);
  }

  // Get API key (with env override)
  getApiKey(): string {
    return process.env.CODEB_API_KEY || this.conf.get('apiKey');
  }

  // Set API key
  setApiKey(apiKey: string): void {
    this.conf.set('apiKey', apiKey);
  }

  // Get API URL (with env override)
  getApiUrl(): string {
    return process.env.CODEB_API_URL || this.conf.get('apiUrl');
  }

  // Check if authenticated
  isAuthenticated(): boolean {
    return !!this.getApiKey();
  }

  // Get linked project for current directory
  getLinkedProject(cwd: string = process.cwd()): string | null {
    const linked = this.conf.get('linkedProjects');

    // Check exact match first
    if (linked[cwd]) return linked[cwd];

    // Check parent directories
    let dir = cwd;
    while (dir !== '/') {
      if (linked[dir]) return linked[dir];
      dir = dir.substring(0, dir.lastIndexOf('/')) || '/';
    }

    return null;
  }

  // Link project to directory
  linkProject(cwd: string, projectName: string): void {
    const linked = this.conf.get('linkedProjects');
    linked[cwd] = projectName;
    this.conf.set('linkedProjects', linked);
    this.addRecentProject(projectName);
  }

  // Unlink project from directory
  unlinkProject(cwd: string = process.cwd()): void {
    const linked = this.conf.get('linkedProjects');
    delete linked[cwd];
    this.conf.set('linkedProjects', linked);
  }

  // Add to recent projects
  addRecentProject(projectName: string): void {
    const recent = this.conf.get('recentProjects').filter(p => p !== projectName);
    recent.unshift(projectName);
    this.conf.set('recentProjects', recent.slice(0, 10));
  }

  // Get recent projects
  getRecentProjects(): string[] {
    return this.conf.get('recentProjects');
  }

  // Clear all config (logout)
  clear(): void {
    this.conf.clear();
  }

  // Get config path (for debugging)
  getPath(): string {
    return this.conf.path;
  }
}
