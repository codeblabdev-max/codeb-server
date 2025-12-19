/**
 * CodeB Deploy MCP - Protection Guard
 * 강제 삭제 및 위험 명령 차단 시스템
 *
 * 핵심 원칙:
 * 1. 다른 프로젝트에 영향을 주는 명령은 차단
 * 2. DB/Redis 컨테이너는 특별 보호
 * 3. 네트워크 삭제/재생성 시 연결된 컨테이너 확인
 * 4. 시스템 전체에 영향을 주는 명령 차단
 */

// ============================================================================
// 타입 정의
// ============================================================================

export interface ProtectionConfig {
  enabled: boolean;               // 보호 기능 활성화
  strictMode: boolean;            // 엄격 모드 (모든 위험 명령 차단)
  allowForceWithConfirmation: boolean; // 확인 후 강제 실행 허용
  protectedContainerPatterns: string[]; // 보호할 컨테이너 패턴
  systemContainers: string[];     // 절대 삭제 불가 컨테이너
  protectedNetworks: string[];    // 보호할 네트워크
  maxContainersToDelete: number;  // 한번에 삭제 가능한 최대 컨테이너 수
  auditLog: boolean;              // 감사 로그 활성화
  productionProtection: boolean;  // 🚨 프로덕션 환경 절대 보호
  productionProjects: string[];   // 프로덕션으로 등록된 프로젝트 목록
}

export interface CommandAnalysis {
  command: string;
  isDangerous: boolean;
  dangerLevel: 'safe' | 'warning' | 'danger' | 'critical';
  reason?: string;
  affectedResources?: string[];
  suggestedAlternative?: string;
  requiresConfirmation: boolean;
  blocked: boolean;
}

export interface ProtectionResult {
  allowed: boolean;
  analysis: CommandAnalysis;
  modifiedCommand?: string;
  warnings: string[];
}

// ============================================================================
// 기본 설정
// ============================================================================

const DEFAULT_CONFIG: ProtectionConfig = {
  enabled: true,
  strictMode: true,
  allowForceWithConfirmation: false,
  protectedContainerPatterns: [
    '-postgres',
    '-db',
    '-database',
    '-redis',
    '-cache',
    '-mysql',
    '-mariadb',
    '-mongo',
    '-mongodb',
  ],
  systemContainers: [
    'caddy',
    'traefik',
    'nginx',
    'powerdns',
    'pdns',
    'prometheus',
    'grafana',
    'portainer',
  ],
  protectedNetworks: [
    'podman',        // 기본 네트워크
    'host',
    'none',
    'bridge',
  ],
  maxContainersToDelete: 3,  // 한번에 3개 이상 삭제 시 차단
  auditLog: true,
  productionProtection: true,  // 🚨 프로덕션 절대 보호 활성화
  productionProjects: [],      // 런타임에 서버에서 로드
};

// 프로덕션 환경 식별 패턴
const PRODUCTION_PATTERNS = [
  /-production$/,
  /-prod$/,
  /-prd$/,
  /^prod-/,
  /^production-/,
];

// ============================================================================
// 위험 명령 패턴
// ============================================================================

const DANGEROUS_PATTERNS = {
  // 🚨 CRITICAL: 시스템 전체에 영향
  critical: [
    /podman\s+system\s+prune/i,           // 전체 정리
    /podman\s+volume\s+prune/i,           // 모든 볼륨 삭제
    /podman\s+network\s+prune/i,          // 모든 네트워크 삭제
    /podman\s+container\s+prune/i,        // 모든 중지된 컨테이너 삭제
    /podman\s+image\s+prune\s+-a/i,       // 모든 이미지 삭제
    /podman\s+rm\s+.*\$\(podman\s+ps/i,   // 동적 컨테이너 전체 삭제
    /podman\s+stop\s+.*\$\(podman\s+ps/i, // 동적 컨테이너 전체 중지
    /podman\s+kill\s+.*\$\(podman\s+ps/i, // 동적 컨테이너 전체 강제 종료
    /systemctl\s+(stop|disable)\s+podman/i, // Podman 서비스 중지
    /rm\s+-rf\s+\/home\/codeb/i,          // CodeB 홈 디렉토리 삭제
    /rm\s+-rf\s+\/var\/lib\/containers/i, // 컨테이너 데이터 삭제
    /rm\s+-rf\s+\/opt\/codeb/i,           // CodeB 설치 디렉토리 삭제
  ],

  // ⚠️ DANGER: 데이터 손실 위험
  danger: [
    /podman\s+rm\s+-f/i,                  // 강제 삭제
    /podman\s+volume\s+rm\s+-f/i,         // 볼륨 강제 삭제
    /podman\s+network\s+rm\s+-f/i,        // 네트워크 강제 삭제
    /podman\s+kill/i,                     // 강제 종료
    /--force/i,                           // 강제 옵션
    /truncate\s+.*table/i,                // 테이블 데이터 삭제
    /drop\s+(database|table)/i,           // DB/테이블 삭제
  ],

  // ⚡ WARNING: 주의 필요
  warning: [
    /podman\s+rm\b/i,                     // 컨테이너 삭제
    /podman\s+stop\b/i,                   // 컨테이너 중지
    /podman\s+volume\s+rm\b/i,            // 볼륨 삭제
    /podman\s+network\s+rm\b/i,           // 네트워크 삭제
    /systemctl\s+(restart|reload)/i,      // 서비스 재시작
  ],
};

// ============================================================================
// Protection Guard 클래스
// ============================================================================

export class ProtectionGuard {
  private config: ProtectionConfig;
  private auditLogs: Array<{
    timestamp: string;
    command: string;
    analysis: CommandAnalysis;
    action: 'allowed' | 'blocked' | 'modified';
  }> = [];
  private productionContainers: Set<string> = new Set();

  constructor(config: Partial<ProtectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 🚨 프로덕션 컨테이너 등록 (절대 삭제 불가)
   */
  registerProductionContainer(containerName: string): void {
    this.productionContainers.add(containerName);
    console.error(`🔒 [ProtectionGuard] Production container registered: ${containerName}`);
  }

  /**
   * 프로덕션 컨테이너 목록 로드 (서버에서)
   */
  async loadProductionContainersFromServer(execFn: (cmd: string) => Promise<{ stdout: string }>): Promise<void> {
    try {
      // production 환경 컨테이너 조회
      const result = await execFn(
        `podman ps -a --format '{{.Names}}' | grep -E '(-production|-prod)$' 2>/dev/null || true`
      );

      const containers = result.stdout.trim().split('\n').filter(c => c);
      containers.forEach(c => this.productionContainers.add(c));

      // 포트 4000-4499 범위 사용 컨테이너도 프로덕션으로 간주
      const portResult = await execFn(
        `podman ps -a --format '{{.Names}}|{{.Ports}}' 2>/dev/null || true`
      );

      portResult.stdout.trim().split('\n').filter(l => l).forEach(line => {
        const [name, ports] = line.split('|');
        if (ports) {
          // 4000-4499 포트 범위 체크
          const portMatch = ports.match(/:(\d{4})->/);
          if (portMatch) {
            const port = parseInt(portMatch[1]);
            if (port >= 4000 && port <= 4499) {
              this.productionContainers.add(name);
            }
          }
        }
      });

      console.error(`🔒 [ProtectionGuard] Loaded ${this.productionContainers.size} production containers`);
    } catch (error) {
      console.error(`[ProtectionGuard] Failed to load production containers:`, error);
    }
  }

  /**
   * 프로덕션 컨테이너인지 확인
   */
  isProductionContainer(containerName: string): boolean {
    // 직접 등록된 경우
    if (this.productionContainers.has(containerName)) {
      return true;
    }

    // 패턴 매칭
    for (const pattern of PRODUCTION_PATTERNS) {
      if (pattern.test(containerName)) {
        return true;
      }
    }

    // 설정에 등록된 프로젝트
    for (const project of this.config.productionProjects) {
      if (containerName.startsWith(`${project}-`) || containerName === project) {
        return true;
      }
    }

    return false;
  }

  /**
   * 프로덕션 프로젝트 추가
   */
  addProductionProject(projectName: string): void {
    if (!this.config.productionProjects.includes(projectName)) {
      this.config.productionProjects.push(projectName);
      console.error(`🔒 [ProtectionGuard] Production project added: ${projectName}`);
    }
  }

  /**
   * 명령 실행 전 검사
   */
  async checkCommand(command: string, context?: {
    projectName?: string;
    environment?: string;
    force?: boolean;
  }): Promise<ProtectionResult> {
    if (!this.config.enabled) {
      return {
        allowed: true,
        analysis: {
          command,
          isDangerous: false,
          dangerLevel: 'safe',
          requiresConfirmation: false,
          blocked: false,
        },
        warnings: [],
      };
    }

    const analysis = this.analyzeCommand(command, context);
    const warnings: string[] = [];
    let allowed = true;
    let modifiedCommand: string | undefined;

    // 🚨 프로덕션 컨테이너 절대 보호 (최우선)
    if (this.config.productionProtection) {
      const productionCheck = this.checkProductionProtection(command, context);
      if (productionCheck.blocked) {
        allowed = false;
        warnings.push(`🔒 PRODUCTION PROTECTED: ${productionCheck.reason}`);
        warnings.push(`🚨 Production containers cannot be stopped, deleted, or modified through CLI`);
        analysis.dangerLevel = 'critical';
        analysis.blocked = true;
        analysis.reason = productionCheck.reason;
      }
    }

    // Critical 명령은 무조건 차단
    if (analysis.dangerLevel === 'critical') {
      allowed = false;
      warnings.push(`🚨 CRITICAL: ${analysis.reason}`);
    }
    // Danger 명령은 strictMode에서 차단
    else if (analysis.dangerLevel === 'danger' && this.config.strictMode) {
      if (!context?.force || !this.config.allowForceWithConfirmation) {
        allowed = false;
        warnings.push(`⚠️ DANGER: ${analysis.reason}`);
        if (analysis.suggestedAlternative) {
          warnings.push(`💡 Alternative: ${analysis.suggestedAlternative}`);
        }
      }
    }
    // Warning 명령은 수정하여 안전하게 실행
    else if (analysis.dangerLevel === 'warning') {
      modifiedCommand = this.makeSafeCommand(command, context);
      if (modifiedCommand !== command) {
        warnings.push(`⚡ Modified command for safety`);
      }
    }

    // 감사 로그
    if (this.config.auditLog) {
      this.logAudit(command, analysis, allowed ? (modifiedCommand ? 'modified' : 'allowed') : 'blocked');
    }

    return {
      allowed,
      analysis,
      modifiedCommand: allowed ? modifiedCommand : undefined,
      warnings,
    };
  }

  /**
   * 🔒 프로덕션 보호 체크 (절대 보호)
   */
  private checkProductionProtection(command: string, context?: {
    projectName?: string;
    environment?: string;
  }): { blocked: boolean; reason?: string } {
    // 프로덕션 환경에서 직접 배포하는 경우는 허용
    if (context?.environment === 'production') {
      // 단, 삭제/중지 명령은 차단
      const isDestructive = /podman\s+(rm|stop|kill|network\s+rm|volume\s+rm)/i.test(command);
      if (!isDestructive) {
        return { blocked: false };
      }
    }

    // 명령어에서 컨테이너 이름 추출
    const containerMatches = command.match(/(?:podman\s+(?:rm|stop|kill|restart)\s+)(\S+)/gi);

    if (containerMatches) {
      for (const match of containerMatches) {
        const containerName = match.replace(/podman\s+(rm|stop|kill|restart)\s+/i, '').trim();

        // 프로덕션 컨테이너인지 확인
        if (this.isProductionContainer(containerName)) {
          return {
            blocked: true,
            reason: `Container '${containerName}' is a PRODUCTION container and is absolutely protected`,
          };
        }

        // production 환경 패턴 체크
        if (/-production$|-prod$/.test(containerName)) {
          return {
            blocked: true,
            reason: `Container '${containerName}' matches production naming pattern`,
          };
        }
      }
    }

    // 네트워크 삭제 체크 (프로덕션 네트워크)
    const networkMatch = command.match(/podman\s+network\s+rm\s+(\S+)/i);
    if (networkMatch) {
      const networkName = networkMatch[1];
      if (networkName.includes('-production') || networkName.includes('-prod')) {
        return {
          blocked: true,
          reason: `Network '${networkName}' is a production network and is absolutely protected`,
        };
      }
    }

    // 볼륨 삭제 체크 (프로덕션 데이터)
    const volumeMatch = command.match(/podman\s+volume\s+rm\s+(\S+)/i);
    if (volumeMatch) {
      const volumeName = volumeMatch[1];
      if (volumeName.includes('-production') || volumeName.includes('-prod')) {
        return {
          blocked: true,
          reason: `Volume '${volumeName}' is production data and is absolutely protected`,
        };
      }
    }

    return { blocked: false };
  }

  /**
   * 명령어 분석
   */
  private analyzeCommand(command: string, context?: {
    projectName?: string;
    environment?: string;
  }): CommandAnalysis {
    const result: CommandAnalysis = {
      command,
      isDangerous: false,
      dangerLevel: 'safe',
      requiresConfirmation: false,
      blocked: false,
    };

    // Critical 패턴 검사
    for (const pattern of DANGEROUS_PATTERNS.critical) {
      if (pattern.test(command)) {
        result.isDangerous = true;
        result.dangerLevel = 'critical';
        result.reason = 'This command affects the entire system';
        result.blocked = true;
        result.requiresConfirmation = true;
        return result;
      }
    }

    // Danger 패턴 검사
    for (const pattern of DANGEROUS_PATTERNS.danger) {
      if (pattern.test(command)) {
        result.isDangerous = true;
        result.dangerLevel = 'danger';

        // 보호된 컨테이너 확인
        const protectedMatch = this.checkProtectedContainers(command);
        if (protectedMatch) {
          result.reason = `Attempting to force operation on protected container: ${protectedMatch}`;
          result.blocked = true;
          result.suggestedAlternative = this.getSafeAlternative(command, protectedMatch);
        } else {
          result.reason = 'Force operation detected';
          result.requiresConfirmation = true;
        }

        return result;
      }
    }

    // Warning 패턴 검사
    for (const pattern of DANGEROUS_PATTERNS.warning) {
      if (pattern.test(command)) {
        result.dangerLevel = 'warning';

        // 다른 프로젝트 컨테이너 체크
        if (context?.projectName) {
          const otherProjectMatch = this.checkOtherProjectContainers(command, context.projectName);
          if (otherProjectMatch) {
            result.isDangerous = true;
            result.reason = `Command may affect other project: ${otherProjectMatch}`;
            result.requiresConfirmation = true;
          }
        }

        return result;
      }
    }

    return result;
  }

  /**
   * 보호된 컨테이너 패턴 검사
   */
  private checkProtectedContainers(command: string): string | null {
    // 시스템 컨테이너
    for (const container of this.config.systemContainers) {
      if (command.includes(container)) {
        return container;
      }
    }

    // 보호된 패턴 (DB, Redis 등)
    for (const pattern of this.config.protectedContainerPatterns) {
      const regex = new RegExp(`\\b\\w*${pattern}\\w*\\b`, 'i');
      const match = command.match(regex);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  /**
   * 다른 프로젝트 컨테이너 체크
   */
  private checkOtherProjectContainers(command: string, currentProject: string): string | null {
    // 명령어에서 컨테이너 이름 추출
    const containerNameMatch = command.match(/(?:podman\s+(?:rm|stop|kill)\s+)(\S+)/i);
    if (containerNameMatch) {
      const containerName = containerNameMatch[1];

      // 현재 프로젝트가 아닌 다른 프로젝트의 컨테이너인지 확인
      if (!containerName.startsWith(currentProject) && !containerName.startsWith(`${currentProject}-`)) {
        // 다른 프로젝트처럼 보이는 이름인지
        if (containerName.includes('-') && !containerName.startsWith('codeb-net-')) {
          return containerName;
        }
      }
    }

    return null;
  }

  /**
   * 안전한 대안 명령 생성
   */
  private getSafeAlternative(command: string, protectedResource: string): string {
    if (command.includes('podman rm -f')) {
      return command.replace('podman rm -f', 'podman stop --time 30') + ' && ' +
             command.replace('-f', '').replace('podman rm', 'podman rm');
    }

    if (command.includes('podman kill')) {
      return command.replace('podman kill', 'podman stop --time 30');
    }

    if (command.includes('podman network rm')) {
      return `# First check connected containers:\npodman network inspect ${protectedResource} --format '{{range .Containers}}{{.Name}} {{end}}'`;
    }

    return `# Consider using graceful shutdown for ${protectedResource}`;
  }

  /**
   * 명령을 안전하게 수정
   */
  private makeSafeCommand(command: string, context?: {
    projectName?: string;
  }): string {
    let safe = command;

    // podman rm -f → podman stop + podman rm
    if (/podman\s+rm\s+-f/.test(safe)) {
      const containerMatch = safe.match(/podman\s+rm\s+-f\s+(\S+)/);
      if (containerMatch) {
        const containerName = containerMatch[1];
        safe = `podman stop ${containerName} --time 30 2>/dev/null || true; podman rm ${containerName} 2>/dev/null || true`;
      }
    }

    // podman kill → podman stop
    if (/podman\s+kill/.test(safe)) {
      safe = safe.replace(/podman\s+kill/g, 'podman stop --time 30');
    }

    return safe;
  }

  /**
   * 컨테이너 삭제 전 검증
   */
  async validateContainerDeletion(containerNames: string[], projectName?: string): Promise<{
    allowed: boolean;
    blocked: string[];
    warnings: string[];
  }> {
    const blocked: string[] = [];
    const warnings: string[] = [];

    // 최대 삭제 수 체크
    if (containerNames.length > this.config.maxContainersToDelete) {
      return {
        allowed: false,
        blocked: containerNames,
        warnings: [`Cannot delete more than ${this.config.maxContainersToDelete} containers at once (requested: ${containerNames.length})`],
      };
    }

    for (const name of containerNames) {
      // 시스템 컨테이너 체크
      if (this.config.systemContainers.some(sys => name.toLowerCase().includes(sys.toLowerCase()))) {
        blocked.push(name);
        warnings.push(`🚨 ${name} is a system container and cannot be deleted`);
        continue;
      }

      // 다른 프로젝트 컨테이너 체크
      if (projectName && !name.startsWith(projectName)) {
        const looksLikeProject = name.includes('-') && !name.startsWith('codeb-');
        if (looksLikeProject) {
          blocked.push(name);
          warnings.push(`⚠️ ${name} appears to belong to another project`);
        }
      }

      // DB/Redis 컨테이너 특별 경고
      if (this.config.protectedContainerPatterns.some(pattern => name.toLowerCase().includes(pattern))) {
        warnings.push(`⚡ ${name} is a data container - ensure you have backups`);
      }
    }

    return {
      allowed: blocked.length === 0,
      blocked,
      warnings,
    };
  }

  /**
   * 네트워크 삭제 전 검증
   */
  async validateNetworkDeletion(networkName: string, connectedContainers: string[]): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    // 보호된 네트워크 체크
    if (this.config.protectedNetworks.includes(networkName)) {
      return {
        allowed: false,
        reason: `${networkName} is a protected network`,
      };
    }

    // 연결된 컨테이너가 있으면 차단
    if (connectedContainers.length > 0) {
      return {
        allowed: false,
        reason: `Network ${networkName} has ${connectedContainers.length} connected containers: ${connectedContainers.join(', ')}`,
      };
    }

    return { allowed: true };
  }

  /**
   * 감사 로그 기록
   */
  private logAudit(
    command: string,
    analysis: CommandAnalysis,
    action: 'allowed' | 'blocked' | 'modified'
  ): void {
    const log = {
      timestamp: new Date().toISOString(),
      command,
      analysis,
      action,
    };

    this.auditLogs.push(log);

    // 최근 1000개만 유지
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }

    // 콘솔 출력 (위험 명령만)
    if (analysis.isDangerous) {
      const emoji = action === 'blocked' ? '🛑' : action === 'modified' ? '⚡' : '⚠️';
      console.error(`${emoji} [ProtectionGuard] ${action.toUpperCase()}: ${analysis.reason || command}`);
    }
  }

  /**
   * 감사 로그 조회
   */
  getAuditLogs(filter?: { action?: string; since?: Date }): typeof this.auditLogs {
    let logs = this.auditLogs;

    if (filter?.action) {
      logs = logs.filter(l => l.action === filter.action);
    }

    if (filter?.since) {
      logs = logs.filter(l => new Date(l.timestamp) >= filter.since!);
    }

    return logs;
  }

  /**
   * 설정 업데이트
   */
  updateConfig(updates: Partial<ProtectionConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * 현재 설정 조회
   */
  getConfig(): ProtectionConfig {
    return { ...this.config };
  }

  /**
   * 보호 기능 비활성화 (위험!)
   */
  disable(reason: string): void {
    console.error(`🚨 [ProtectionGuard] DISABLED: ${reason}`);
    this.logAudit(`PROTECTION_DISABLED: ${reason}`, {
      command: 'disable',
      isDangerous: true,
      dangerLevel: 'critical',
      reason,
      requiresConfirmation: false,
      blocked: false,
    }, 'allowed');
    this.config.enabled = false;
  }

  /**
   * 보호 기능 활성화
   */
  enable(): void {
    console.error(`✅ [ProtectionGuard] ENABLED`);
    this.config.enabled = true;
  }
}

// ============================================================================
// 싱글톤 인스턴스
// ============================================================================

export const protectionGuard = new ProtectionGuard();

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 안전한 명령 실행을 위한 래퍼
 */
export async function safeExec(
  execFn: (cmd: string) => Promise<any>,
  command: string,
  context?: { projectName?: string; environment?: string; force?: boolean }
): Promise<{ result?: any; blocked: boolean; warnings: string[] }> {
  const check = await protectionGuard.checkCommand(command, context);

  if (!check.allowed) {
    return {
      blocked: true,
      warnings: check.warnings,
    };
  }

  const cmdToExecute = check.modifiedCommand || command;
  const result = await execFn(cmdToExecute);

  return {
    result,
    blocked: false,
    warnings: check.warnings,
  };
}
