/**
 * CodeB SSOT Manager
 *
 * Single Source of Truth 관리자
 * 모든 포트-프로젝트-도메인 변경은 이 매니저를 통해서만 가능
 */

import { createHash } from 'crypto';
import { SSHClient, getSSHClient } from './ssh-client.js';
import type {
  CodeBSSOT,
  SSOTProject,
  SSOTEnvironmentConfig,
  SSOTPreviewConfig,
  SSOTIndexes,
  SSOTValidationResult,
  SSOTSyncResult,
  SSOTSyncChange,
  SSOTHistoryEntry,
  PortProjectMapping,
  DomainProjectMapping,
} from './ssot-types.js';
import { DEFAULT_PORT_RANGES, DEFAULT_SERVER_CONFIG } from './ssot-types.js';

// ============================================================================
// 상수
// ============================================================================

const SSOT_BASE_PATH = '/opt/codeb/registry';
const SSOT_FILE = `${SSOT_BASE_PATH}/ssot.json`;
const SSOT_LOCK = `${SSOT_BASE_PATH}/ssot.lock`;
const SSOT_HISTORY_DIR = `${SSOT_BASE_PATH}/history`;
const SSOT_BACKUP_DIR = `${SSOT_BASE_PATH}/backups`;

const LOCK_TIMEOUT = 30000; // 30초
const LOCK_RETRY_INTERVAL = 100; // 100ms

// ============================================================================
// SSOT Manager 클래스
// ============================================================================

export class SSOTManager {
  private ssh: SSHClient;
  private cache: CodeBSSOT | null = null;
  private cacheTime: number = 0;
  private cacheTTL: number = 5000; // 5초 캐시

  constructor(ssh?: SSHClient) {
    this.ssh = ssh || getSSHClient();
  }

  // ==========================================================================
  // 기본 CRUD 작업
  // ==========================================================================

  /**
   * SSOT 로드 (캐시 사용)
   */
  async load(forceRefresh = false): Promise<CodeBSSOT> {
    const now = Date.now();

    if (!forceRefresh && this.cache && (now - this.cacheTime) < this.cacheTTL) {
      return this.cache;
    }

    await this.ssh.connect();

    // 파일 존재 확인
    const exists = await this.ssh.fileExists(SSOT_FILE);
    if (!exists) {
      throw new Error('SSOT file not found. Run migration first.');
    }

    const content = await this.ssh.readFile(SSOT_FILE);
    const ssot: CodeBSSOT = JSON.parse(content);

    // 무결성 검증
    const expectedChecksum = this.calculateChecksum(ssot);
    if (ssot.checksum !== expectedChecksum) {
      console.warn('SSOT checksum mismatch - file may have been tampered');
    }

    this.cache = ssot;
    this.cacheTime = now;

    return ssot;
  }

  /**
   * SSOT 저장 (잠금 필수)
   */
  private async save(ssot: CodeBSSOT, actor: CodeBSSOT['lastModifiedBy'] = 'mcp'): Promise<void> {
    // 메타데이터 업데이트
    ssot.lastModified = new Date().toISOString();
    ssot.lastModifiedBy = actor;
    ssot.checksum = this.calculateChecksum(ssot);

    // 인덱스 재구축
    ssot._indexes = this.rebuildIndexes(ssot);

    const content = JSON.stringify(ssot, null, 2);
    await this.ssh.writeFile(SSOT_FILE, content);

    // 캐시 업데이트
    this.cache = ssot;
    this.cacheTime = Date.now();
  }

  /**
   * 체크섬 계산 (_indexes 제외)
   */
  private calculateChecksum(ssot: CodeBSSOT): string {
    const { _indexes, checksum, ...data } = ssot;
    const content = JSON.stringify(data, Object.keys(data).sort());
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * 인덱스 재구축
   */
  private rebuildIndexes(ssot: CodeBSSOT): SSOTIndexes {
    const indexes: SSOTIndexes = {
      portToProject: {},
      domainToProject: {},
      containerToProject: {},
    };

    for (const [projectId, project] of Object.entries(ssot.projects)) {
      // Staging
      if (project.environments.staging) {
        const env = project.environments.staging;
        this.indexEnvironment(indexes, projectId, 'staging', env);
      }

      // Production
      if (project.environments.production) {
        const env = project.environments.production;
        this.indexEnvironment(indexes, projectId, 'production', env);
      }

      // Preview
      if (project.environments.preview) {
        for (const [prNumber, preview] of Object.entries(project.environments.preview)) {
          this.indexEnvironment(indexes, projectId, 'preview', preview, prNumber);
        }
      }
    }

    return indexes;
  }

  private indexEnvironment(
    indexes: SSOTIndexes,
    projectId: string,
    environment: 'staging' | 'production' | 'preview',
    config: SSOTEnvironmentConfig | SSOTPreviewConfig,
    prNumber?: string
  ): void {
    // 포트 인덱스
    indexes.portToProject[config.ports.app] = {
      projectId,
      environment,
      service: 'app',
      prNumber,
    };

    if (config.ports.db) {
      indexes.portToProject[config.ports.db] = {
        projectId,
        environment,
        service: 'db',
        prNumber,
      };
    }

    if (config.ports.redis) {
      indexes.portToProject[config.ports.redis] = {
        projectId,
        environment,
        service: 'redis',
        prNumber,
      };
    }

    // 도메인 인덱스
    indexes.domainToProject[config.domain] = {
      projectId,
      environment,
      prNumber,
    };

    // 컨테이너 인덱스
    indexes.containerToProject[config.containerName] = {
      projectId,
      environment,
      prNumber,
    };
  }

  // ==========================================================================
  // 잠금 메커니즘
  // ==========================================================================

  /**
   * 잠금 획득
   */
  private async acquireLock(): Promise<void> {
    const startTime = Date.now();
    const lockContent = JSON.stringify({
      pid: process.pid,
      timestamp: new Date().toISOString(),
      host: 'mcp-server',
    });

    while (Date.now() - startTime < LOCK_TIMEOUT) {
      // 기존 잠금 확인
      const lockExists = await this.ssh.fileExists(SSOT_LOCK);

      if (!lockExists) {
        // 잠금 획득 시도
        await this.ssh.writeFile(SSOT_LOCK, lockContent);
        return;
      }

      // 오래된 잠금 확인 (60초 이상)
      try {
        const existingLock = await this.ssh.readFile(SSOT_LOCK);
        const lockData = JSON.parse(existingLock);
        const lockAge = Date.now() - new Date(lockData.timestamp).getTime();

        if (lockAge > 60000) {
          // 오래된 잠금 제거
          await this.ssh.exec(`rm -f "${SSOT_LOCK}"`);
          continue;
        }
      } catch {
        // 손상된 잠금 파일 제거
        await this.ssh.exec(`rm -f "${SSOT_LOCK}"`);
        continue;
      }

      // 대기
      await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL));
    }

    throw new Error('Failed to acquire SSOT lock - timeout');
  }

  /**
   * 잠금 해제
   */
  private async releaseLock(): Promise<void> {
    await this.ssh.exec(`rm -f "${SSOT_LOCK}"`);
  }

  /**
   * 잠금 내에서 작업 실행
   */
  async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.ssh.connect();
    await this.acquireLock();

    try {
      const result = await operation();
      return result;
    } finally {
      await this.releaseLock();
    }
  }

  // ==========================================================================
  // 포트 관리
  // ==========================================================================

  /**
   * 사용 가능한 포트 찾기
   */
  async findAvailablePort(
    environment: 'staging' | 'production' | 'preview',
    service: 'app' | 'db' | 'redis'
  ): Promise<number> {
    const ssot = await this.load();
    const range = ssot.portRanges[environment][service];
    const usedPorts = new Set(Object.keys(ssot._indexes.portToProject).map(Number));

    for (let port = range.start; port <= range.end; port++) {
      if (!usedPorts.has(port)) {
        // 실제 서버에서 포트 사용 여부 확인
        const result = await this.ssh.exec(`ss -tln | grep -q ":${port} " && echo "used" || echo "free"`);
        if (result.stdout === 'free') {
          return port;
        }
      }
    }

    throw new Error(`No available ${service} port in ${environment} range (${range.start}-${range.end})`);
  }

  /**
   * 포트 할당 (SSOT에 예약)
   */
  async allocatePort(
    projectId: string,
    environment: 'staging' | 'production' | 'preview',
    service: 'app' | 'db' | 'redis',
    prNumber?: string
  ): Promise<number> {
    return this.withLock(async () => {
      const port = await this.findAvailablePort(environment, service);
      const ssot = await this.load(true);

      // 프로젝트 확인
      const project = ssot.projects[projectId];
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      // 환경 설정 초기화
      if (environment === 'preview' && prNumber) {
        if (!project.environments.preview) {
          project.environments.preview = {};
        }
        // Preview 환경은 별도 처리
      } else {
        if (!project.environments[environment]) {
          (project.environments as any)[environment] = {
            ports: {},
            domain: '',
            containerName: '',
            status: 'stopped',
            caddyConfigFile: '',
            dnsConfigured: false,
          };
        }
        (project.environments[environment] as SSOTEnvironmentConfig).ports[service] = port;
      }

      await this.save(ssot);
      await this.createHistoryEntry('update', `port.${environment}.${service}`, { port }, 'mcp');

      return port;
    });
  }

  /**
   * 포트 해제
   */
  async releasePort(port: number): Promise<void> {
    return this.withLock(async () => {
      const ssot = await this.load(true);
      const mapping = ssot._indexes.portToProject[port];

      if (!mapping) {
        return; // 이미 해제됨
      }

      const project = ssot.projects[mapping.projectId];
      if (!project) return;

      const env = mapping.environment === 'preview' && mapping.prNumber
        ? project.environments.preview?.[mapping.prNumber]
        : project.environments[mapping.environment as 'staging' | 'production'];

      if (env) {
        delete (env.ports as any)[mapping.service];
      }

      await this.save(ssot);
      await this.createHistoryEntry('delete', `port.${port}`, { mapping }, 'mcp');
    });
  }

  // ==========================================================================
  // 프로젝트 관리
  // ==========================================================================

  /**
   * 프로젝트 등록
   */
  async registerProject(project: Omit<SSOTProject, 'createdAt' | 'status'>): Promise<SSOTProject> {
    return this.withLock(async () => {
      const ssot = await this.load(true);

      if (ssot.projects[project.id]) {
        throw new Error(`Project already exists: ${project.id}`);
      }

      const newProject: SSOTProject = {
        ...project,
        createdAt: new Date().toISOString(),
        status: 'active',
      };

      ssot.projects[project.id] = newProject;
      await this.save(ssot);
      await this.createHistoryEntry('create', `project.${project.id}`, newProject, 'mcp');

      return newProject;
    });
  }

  /**
   * 프로젝트 조회
   */
  async getProject(projectId: string): Promise<SSOTProject | null> {
    const ssot = await this.load();
    return ssot.projects[projectId] || null;
  }

  /**
   * 모든 프로젝트 조회
   */
  async listProjects(): Promise<SSOTProject[]> {
    const ssot = await this.load();
    return Object.values(ssot.projects);
  }

  /**
   * 프로젝트 업데이트
   */
  async updateProject(projectId: string, updates: Partial<SSOTProject>): Promise<SSOTProject> {
    return this.withLock(async () => {
      const ssot = await this.load(true);
      const project = ssot.projects[projectId];

      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const before = { ...project };
      Object.assign(project, updates);
      ssot.projects[projectId] = project;

      await this.save(ssot);
      await this.createHistoryEntry('update', `project.${projectId}`, { before, after: project }, 'mcp');

      return project;
    });
  }

  // ==========================================================================
  // 도메인 관리 (SSOT + Caddy + DNS 동시 업데이트)
  // ==========================================================================

  /**
   * 도메인 설정 (통합)
   */
  async setDomain(
    projectId: string,
    environment: 'staging' | 'production' | 'preview',
    domain: string,
    targetPort: number,
    prNumber?: string
  ): Promise<void> {
    return this.withLock(async () => {
      const ssot = await this.load(true);
      const project = ssot.projects[projectId];

      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      // 도메인 중복 체크
      const existingMapping = ssot._indexes.domainToProject[domain];
      if (existingMapping && existingMapping.projectId !== projectId) {
        throw new Error(`Domain already used by project: ${existingMapping.projectId}`);
      }

      // 환경 설정 가져오기/생성
      let envConfig: SSOTEnvironmentConfig | SSOTPreviewConfig;
      const caddyConfigFile = `${projectId}-${environment}${prNumber ? `-pr${prNumber}` : ''}.caddy`;

      if (environment === 'preview' && prNumber) {
        if (!project.environments.preview) {
          project.environments.preview = {};
        }
        if (!project.environments.preview[prNumber]) {
          project.environments.preview[prNumber] = {
            ports: { app: targetPort },
            domain: '',
            containerName: `${projectId}-preview-${prNumber}`,
            status: 'stopped',
            caddyConfigFile,
            dnsConfigured: false,
            prNumber,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7일
          };
        }
        envConfig = project.environments.preview[prNumber];
      } else {
        if (!project.environments[environment as 'staging' | 'production']) {
          (project.environments as any)[environment] = {
            ports: { app: targetPort },
            domain: '',
            containerName: `${projectId}-${environment}`,
            status: 'stopped',
            caddyConfigFile,
            dnsConfigured: false,
          };
        }
        envConfig = project.environments[environment as 'staging' | 'production']!;
      }

      // 1. SSOT 업데이트
      const oldDomain = envConfig.domain;
      envConfig.domain = domain;
      envConfig.caddyConfigFile = caddyConfigFile;

      // 2. Caddy 설정 생성
      await this.updateCaddyConfig(domain, targetPort, caddyConfigFile);

      // 3. DNS 레코드 생성 (PowerDNS)
      await this.updateDNSRecord(domain, ssot.server.ip);
      envConfig.dnsConfigured = true;

      // 4. SSOT 저장
      await this.save(ssot);

      // 5. 히스토리 기록
      await this.createHistoryEntry('update', `domain.${projectId}.${environment}`, {
        before: oldDomain,
        after: domain,
        port: targetPort,
      }, 'mcp');
    });
  }

  /**
   * Caddy 설정 업데이트
   */
  private async updateCaddyConfig(domain: string, port: number, configFile: string): Promise<void> {
    const caddyConfig = `# Auto-generated by CodeB SSOT Manager
# Domain: ${domain}
# Port: ${port}
# Generated: ${new Date().toISOString()}

${domain} {
    reverse_proxy localhost:${port} {
        health_uri /api/health
        health_interval 30s
        health_timeout 5s
    }

    encode gzip

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        -Server
    }

    log {
        output file /var/log/caddy/${domain}.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}
`;

    const configPath = `/etc/caddy/Caddyfile.d/${configFile}`;
    await this.ssh.writeFile(configPath, caddyConfig);

    // Caddy 리로드
    await this.ssh.exec('systemctl reload caddy');
  }

  /**
   * DNS 레코드 업데이트 (PowerDNS)
   */
  private async updateDNSRecord(domain: string, ip: string): Promise<void> {
    // 도메인에서 zone 추출 (예: app.codeb.dev -> codeb.dev)
    const parts = domain.split('.');
    const zone = parts.slice(-2).join('.');

    // 기존 레코드 삭제 후 추가
    await this.ssh.exec(`pdnsutil delete-rrset ${zone} ${domain} A 2>/dev/null || true`);
    await this.ssh.exec(`pdnsutil add-record ${zone} ${domain.replace(`.${zone}`, '')} A 300 ${ip}`);
  }

  /**
   * 도메인 제거
   */
  async removeDomain(projectId: string, environment: string, prNumber?: string): Promise<void> {
    return this.withLock(async () => {
      const ssot = await this.load(true);
      const project = ssot.projects[projectId];

      if (!project) return;

      let envConfig: SSOTEnvironmentConfig | SSOTPreviewConfig | undefined;

      if (environment === 'preview' && prNumber) {
        envConfig = project.environments.preview?.[prNumber];
      } else {
        envConfig = project.environments[environment as 'staging' | 'production'];
      }

      if (!envConfig || !envConfig.domain) return;

      const domain = envConfig.domain;
      const caddyFile = envConfig.caddyConfigFile;

      // 1. Caddy 설정 삭제
      await this.ssh.exec(`rm -f /etc/caddy/Caddyfile.d/${caddyFile}`);
      await this.ssh.exec('systemctl reload caddy');

      // 2. DNS 레코드 삭제
      const parts = domain.split('.');
      const zone = parts.slice(-2).join('.');
      await this.ssh.exec(`pdnsutil delete-rrset ${zone} ${domain} A 2>/dev/null || true`);

      // 3. SSOT 업데이트
      envConfig.domain = '';
      envConfig.dnsConfigured = false;

      await this.save(ssot);
      await this.createHistoryEntry('delete', `domain.${domain}`, { projectId, environment }, 'mcp');
    });
  }

  // ==========================================================================
  // 검증 및 동기화
  // ==========================================================================

  /**
   * SSOT와 실제 상태 비교 검증
   */
  async validate(): Promise<SSOTValidationResult> {
    const ssot = await this.load();
    const errors: SSOTValidationResult['errors'] = [];
    const warnings: SSOTValidationResult['warnings'] = [];

    // 1. Caddy 설정 검증
    for (const [projectId, project] of Object.entries(ssot.projects)) {
      for (const env of ['staging', 'production'] as const) {
        const config = project.environments[env];
        if (!config) continue;

        // Caddy 파일 존재 확인
        const caddyPath = `/etc/caddy/Caddyfile.d/${config.caddyConfigFile}`;
        const caddyExists = await this.ssh.fileExists(caddyPath);

        if (!caddyExists && config.domain) {
          errors.push({
            code: 'CADDY_MISSING',
            message: `Caddy config missing for ${projectId}/${env}`,
            path: caddyPath,
          });
        }

        // Caddy 내용 검증
        if (caddyExists && config.domain) {
          const caddyContent = await this.ssh.readFile(caddyPath);
          if (!caddyContent.includes(`localhost:${config.ports.app}`)) {
            errors.push({
              code: 'CADDY_PORT_MISMATCH',
              message: `Caddy port mismatch for ${projectId}/${env}`,
              details: { expected: config.ports.app },
            });
          }
        }
      }
    }

    // 2. 포트 충돌 검증
    const portCounts: Record<number, string[]> = {};
    for (const [port, mapping] of Object.entries(ssot._indexes.portToProject)) {
      const portNum = Number(port);
      if (!portCounts[portNum]) {
        portCounts[portNum] = [];
      }
      portCounts[portNum].push(`${mapping.projectId}/${mapping.environment}`);
    }

    for (const [port, projects] of Object.entries(portCounts)) {
      if (projects.length > 1) {
        errors.push({
          code: 'PORT_CONFLICT',
          message: `Port ${port} assigned to multiple projects`,
          details: { projects },
        });
      }
    }

    // 3. 도메인 중복 검증
    const domainCounts: Record<string, string[]> = {};
    for (const [domain, mapping] of Object.entries(ssot._indexes.domainToProject)) {
      if (!domainCounts[domain]) {
        domainCounts[domain] = [];
      }
      domainCounts[domain].push(`${mapping.projectId}/${mapping.environment}`);
    }

    for (const [domain, projects] of Object.entries(domainCounts)) {
      if (projects.length > 1) {
        errors.push({
          code: 'DOMAIN_CONFLICT',
          message: `Domain ${domain} assigned to multiple projects`,
          details: { projects },
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * SSOT 기준으로 시스템 동기화 (Watchdog용)
   */
  async syncFromSSOT(): Promise<SSOTSyncResult> {
    const ssot = await this.load();
    const changes: SSOTSyncChange[] = [];
    const errors: string[] = [];

    for (const [projectId, project] of Object.entries(ssot.projects)) {
      for (const env of ['staging', 'production'] as const) {
        const config = project.environments[env];
        if (!config || !config.domain) continue;

        try {
          // Caddy 동기화
          const caddyPath = `/etc/caddy/Caddyfile.d/${config.caddyConfigFile}`;
          const caddyExists = await this.ssh.fileExists(caddyPath);

          if (!caddyExists) {
            await this.updateCaddyConfig(config.domain, config.ports.app, config.caddyConfigFile);
            changes.push({
              type: 'caddy',
              action: 'create',
              target: config.caddyConfigFile,
            });
          } else {
            // 내용 검증 및 필요시 업데이트
            const content = await this.ssh.readFile(caddyPath);
            if (!content.includes(`localhost:${config.ports.app}`)) {
              await this.updateCaddyConfig(config.domain, config.ports.app, config.caddyConfigFile);
              changes.push({
                type: 'caddy',
                action: 'update',
                target: config.caddyConfigFile,
                before: 'port mismatch',
                after: `localhost:${config.ports.app}`,
              });
            }
          }

          // DNS 동기화 (필요시)
          if (!config.dnsConfigured) {
            await this.updateDNSRecord(config.domain, ssot.server.ip);
            config.dnsConfigured = true;
            changes.push({
              type: 'dns',
              action: 'create',
              target: config.domain,
            });
          }
        } catch (err) {
          errors.push(`${projectId}/${env}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // 변경사항이 있으면 SSOT 저장
    if (changes.length > 0) {
      await this.withLock(async () => {
        await this.save(ssot, 'watchdog');
      });
    }

    return {
      synced: errors.length === 0,
      changes,
      errors,
    };
  }

  // ==========================================================================
  // 히스토리 관리
  // ==========================================================================

  /**
   * 히스토리 엔트리 생성
   */
  private async createHistoryEntry(
    action: SSOTHistoryEntry['action'],
    target: string,
    changes: any,
    actor: SSOTHistoryEntry['actor']
  ): Promise<void> {
    const entry: SSOTHistoryEntry = {
      timestamp: new Date().toISOString(),
      action,
      actor,
      target,
      changes: Array.isArray(changes) ? changes : [{ path: target, before: null, after: changes }],
    };

    const filename = `${entry.timestamp.replace(/[:.]/g, '-')}.json`;
    const historyPath = `${SSOT_HISTORY_DIR}/${filename}`;

    await this.ssh.exec(`mkdir -p ${SSOT_HISTORY_DIR}`);
    await this.ssh.writeFile(historyPath, JSON.stringify(entry, null, 2));
  }

  /**
   * 히스토리 조회
   */
  async getHistory(limit = 50): Promise<SSOTHistoryEntry[]> {
    const result = await this.ssh.exec(`ls -t ${SSOT_HISTORY_DIR}/*.json 2>/dev/null | head -${limit}`);

    if (!result.stdout) return [];

    const entries: SSOTHistoryEntry[] = [];
    const files = result.stdout.split('\n').filter(Boolean);

    for (const file of files) {
      try {
        const content = await this.ssh.readFile(file);
        entries.push(JSON.parse(content));
      } catch {
        // 손상된 파일 무시
      }
    }

    return entries;
  }

  // ==========================================================================
  // 초기화 및 마이그레이션
  // ==========================================================================

  /**
   * SSOT 초기화 (기존 서버 상태에서 생성)
   */
  async initialize(serverIp: string, zones: string[]): Promise<CodeBSSOT> {
    await this.ssh.connect();

    // 디렉토리 생성
    await this.ssh.exec(`mkdir -p ${SSOT_BASE_PATH} ${SSOT_HISTORY_DIR} ${SSOT_BACKUP_DIR}`);

    const ssot: CodeBSSOT = {
      version: '1.0',
      lastModified: new Date().toISOString(),
      lastModifiedBy: 'migration',
      checksum: '',
      server: {
        ip: serverIp,
        hostname: 'codeb-server',
        zones,
        ssh: {
          user: 'root',
          port: 22,
          keyPath: '~/.ssh/id_rsa',
        },
        caddyConfigDir: '/etc/caddy/Caddyfile.d',
        manageDns: true,
      },
      // 포트 범위: DEFAULT_PORT_RANGES 상수 사용 (ssot-types.ts에서 정의)
      portRanges: DEFAULT_PORT_RANGES,
      projects: {},
      _indexes: {
        portToProject: {},
        domainToProject: {},
        containerToProject: {},
      },
    };

    ssot.checksum = this.calculateChecksum(ssot);

    await this.ssh.writeFile(SSOT_FILE, JSON.stringify(ssot, null, 2));
    await this.createHistoryEntry('create', 'ssot', { initialized: true }, 'migration');

    this.cache = ssot;
    this.cacheTime = Date.now();

    return ssot;
  }

  /**
   * 기존 서버 상태를 스캔하여 SSOT에 추가
   */
  async scanAndMigrate(): Promise<{ added: string[]; errors: string[] }> {
    const added: string[] = [];
    const errors: string[] = [];

    // 1. 실행 중인 컨테이너 스캔
    const containersResult = await this.ssh.exec(
      `podman ps --format '{{.Names}}|{{.Ports}}|{{.Image}}' 2>/dev/null || docker ps --format '{{.Names}}|{{.Ports}}|{{.Image}}'`
    );

    if (containersResult.stdout) {
      for (const line of containersResult.stdout.split('\n').filter(Boolean)) {
        const [name, ports, image] = line.split('|');

        // 포트 파싱 (예: 0.0.0.0:3200->3000/tcp)
        const portMatch = ports.match(/:(\d+)->/);
        if (!portMatch) continue;

        const hostPort = parseInt(portMatch[1], 10);

        // 프로젝트명 추출 (예: workb-cms-staging -> workb-cms)
        const projectId = name.replace(/-staging|-production|-app|-web/, '');
        const environment = name.includes('production') ? 'production' : 'staging';

        try {
          await this.withLock(async () => {
            const ssot = await this.load(true);

            if (!ssot.projects[projectId]) {
              ssot.projects[projectId] = {
                id: projectId,
                name: projectId,
                type: 'nodejs',
                createdAt: new Date().toISOString(),
                status: 'active',
                environments: {},
              };
            }

            if (!ssot.projects[projectId].environments[environment as 'staging' | 'production']) {
              (ssot.projects[projectId].environments as any)[environment] = {
                ports: { app: hostPort },
                domain: '',
                containerName: name,
                status: 'running',
                caddyConfigFile: `${projectId}-${environment}.caddy`,
                dnsConfigured: false,
              };
              added.push(`${projectId}/${environment}`);
            }

            await this.save(ssot, 'migration');
          });
        } catch (err) {
          errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // 2. Caddy 설정에서 도메인 매핑 스캔
    const caddyResult = await this.ssh.exec(`ls /etc/caddy/Caddyfile.d/*.caddy 2>/dev/null || true`);

    if (caddyResult.stdout) {
      for (const file of caddyResult.stdout.split('\n').filter(Boolean)) {
        try {
          const content = await this.ssh.readFile(file);

          // 도메인과 포트 추출
          const domainMatch = content.match(/^([a-zA-Z0-9.-]+)\s*\{/m);
          const portMatch = content.match(/localhost:(\d+)/);

          if (domainMatch && portMatch) {
            const domain = domainMatch[1];
            const port = parseInt(portMatch[1], 10);

            // SSOT에서 해당 포트를 사용하는 프로젝트 찾기
            await this.withLock(async () => {
              const ssot = await this.load(true);
              const mapping = ssot._indexes.portToProject[port];

              if (mapping) {
                const project = ssot.projects[mapping.projectId];
                const envConfig = mapping.environment === 'preview'
                  ? project.environments.preview?.[mapping.prNumber!]
                  : project.environments[mapping.environment as 'staging' | 'production'];

                if (envConfig && !envConfig.domain) {
                  envConfig.domain = domain;
                  envConfig.dnsConfigured = true;
                  await this.save(ssot, 'migration');
                  added.push(`domain:${domain}`);
                }
              }
            });
          }
        } catch (err) {
          errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return { added, errors };
  }
}

// ============================================================================
// 싱글톤 인스턴스
// ============================================================================

let defaultManager: SSOTManager | null = null;

export function getSSOTManager(): SSOTManager {
  if (!defaultManager) {
    defaultManager = new SSOTManager();
  }
  return defaultManager;
}

export function createSSOTManager(ssh?: SSHClient): SSOTManager {
  return new SSOTManager(ssh);
}
