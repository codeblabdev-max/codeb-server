#!/usr/bin/env node
/**
 * CodeB Rules Engine
 *
 * 동적 규칙 관리 엔진
 * SSOT 서버와 동기화하여 규칙 업데이트
 */

const fs = require('fs');
const path = require('path');

class RulesEngine {
  constructor() {
    // 기본 규칙
    this.rules = {
      // 절대 금지 (우회 불가)
      absolutelyForbidden: [
        {
          id: 'no-force-rm',
          pattern: /podman\s+rm\s+(-f|--force)/i,
          reason: '컨테이너 강제 삭제 금지',
          severity: 'critical',
          suggestion: 'we workflow stop <project> 사용',
        },
        {
          id: 'no-volume-rm',
          pattern: /podman\s+volume\s+rm/i,
          reason: '볼륨 삭제 금지 - 데이터 손실 위험',
          severity: 'critical',
          suggestion: 'we workflow cleanup <project> 사용',
        },
        {
          id: 'no-system-prune',
          pattern: /podman\s+system\s+prune/i,
          reason: '시스템 전체 정리 금지',
          severity: 'critical',
        },
        {
          id: 'no-volume-prune',
          pattern: /podman\s+volume\s+prune/i,
          reason: '모든 볼륨 삭제 금지',
          severity: 'critical',
        },
        {
          id: 'no-codeb-rm',
          pattern: /rm\s+(-rf|-fr)\s+.*\/(opt\/codeb|var\/lib\/containers)/i,
          reason: 'CodeB 시스템 폴더 삭제 금지',
          severity: 'critical',
        },
        {
          id: 'no-kill-podman',
          pattern: /pkill\s+.*podman/i,
          reason: 'Podman 프로세스 종료 금지',
          severity: 'critical',
        },
        {
          id: 'no-docker-force-rm',
          pattern: /docker\s+rm\s+(-f|--force)/i,
          reason: '컨테이너 강제 삭제 금지',
          severity: 'critical',
        },
        {
          id: 'no-compose-down-v',
          pattern: /docker-compose\s+down\s+.*-v/i,
          reason: '볼륨 포함 삭제 금지',
          severity: 'critical',
        },
      ],

      // 프로덕션 보호 규칙
      productionProtection: {
        enabled: true,
        patterns: [
          /-production$/,
          /-prod$/,
          /-prd$/,
          /^prod-/,
          /^production-/,
        ],
        portRange: { min: 4000, max: 4499 },
        actions: ['rm', 'stop', 'kill', 'restart'],
      },

      // SSH 화이트리스트
      sshWhitelist: {
        enabled: true,
        allowedIPs: [
          '141.164.60.51',    // CodeB Infra
          '158.247.203.55',   // Videopick App
          '141.164.42.213',   // Streaming
          '64.176.226.119',   // Storage
          '141.164.37.63',    // Backup
        ],
        allowedHostnames: [
          'codeb-infra',
          'localhost',
          '127.0.0.1',
        ],
      },

      // 프로젝트 격리
      projectIsolation: {
        enabled: true,
        enforcePrefix: true,  // 컨테이너 이름은 프로젝트명으로 시작해야 함
      },

      // 경고만 (차단하지 않음)
      warnings: [
        {
          id: 'warn-stop',
          pattern: /podman\s+stop\b/i,
          reason: '컨테이너 중지 - 서비스 영향 확인 필요',
          severity: 'warning',
        },
        {
          id: 'warn-restart',
          pattern: /podman\s+restart\b/i,
          reason: '컨테이너 재시작 - 서비스 중단 발생',
          severity: 'warning',
        },
        {
          id: 'warn-systemctl',
          pattern: /systemctl\s+(restart|reload)/i,
          reason: '시스템 서비스 재시작',
          severity: 'warning',
        },
      ],

      // 항상 허용
      alwaysAllowed: [
        /^we\s+/i,
        /^podman\s+ps/i,
        /^podman\s+logs/i,
        /^podman\s+inspect/i,
        /^podman\s+images/i,
        /^podman\s+volume\s+ls/i,
        /^podman\s+network\s+ls/i,
        /^podman\s+stats/i,
        /^docker\s+ps/i,
        /^docker\s+logs/i,
        /^docker\s+inspect/i,
        /^ls\b/i,
        /^cat\b/i,
        /^grep\b/i,
        /^find\b/i,
        /^curl\b/i,
      ],

      // 커스텀 규칙 (SSOT에서 로드)
      custom: [],

      // 포트 관리 규칙
      portManagement: {
        enabled: true,
        // 예약된 포트 범위
        reservedRanges: [
          { min: 1, max: 1024, reason: '시스템 예약 포트' },
          { min: 4000, max: 4499, reason: '프로덕션 전용 포트' },
          { min: 5432, max: 5432, reason: 'PostgreSQL 전용' },
          { min: 6379, max: 6379, reason: 'Redis 전용' },
          { min: 27017, max: 27017, reason: 'MongoDB 전용' },
        ],
        // 환경별 포트 할당
        environments: {
          production: { min: 4000, max: 4499 },
          staging: { min: 4500, max: 4999 },
          development: { min: 5000, max: 5499 },
          preview: { min: 5500, max: 5999 },
        },
        // 할당된 포트 추적
        allocatedPorts: new Map(),
      },

      // 네트워크 보호 규칙
      networkProtection: {
        enabled: true,
        // 보호된 네트워크
        protectedNetworks: [
          'codeb-network',
          'production-network',
          'database-network',
        ],
        // 금지된 네트워크 조작
        forbiddenOperations: [
          { pattern: /podman\s+network\s+rm/i, reason: '네트워크 삭제 금지' },
          { pattern: /podman\s+network\s+disconnect.*production/i, reason: '프로덕션 네트워크 연결 해제 금지' },
          { pattern: /iptables\s+-F/i, reason: 'iptables 플러시 금지' },
          { pattern: /iptables\s+-D/i, reason: 'iptables 규칙 삭제 금지' },
        ],
      },
    };

    // 규칙 파일 경로
    this.rulesFilePath = '/etc/codeb/protection-rules.json';
  }

  // --------------------------------------------------------------------------
  // 규칙 로드/저장
  // --------------------------------------------------------------------------

  loadRules() {
    try {
      if (fs.existsSync(this.rulesFilePath)) {
        const data = fs.readFileSync(this.rulesFilePath, 'utf8');
        const customRules = JSON.parse(data);

        // 커스텀 규칙 병합
        if (customRules.absolutelyForbidden) {
          this.rules.absolutelyForbidden.push(...customRules.absolutelyForbidden);
        }
        if (customRules.warnings) {
          this.rules.warnings.push(...customRules.warnings);
        }
        if (customRules.sshWhitelist) {
          this.rules.sshWhitelist = {
            ...this.rules.sshWhitelist,
            ...customRules.sshWhitelist,
          };
        }
        if (customRules.productionProtection) {
          this.rules.productionProtection = {
            ...this.rules.productionProtection,
            ...customRules.productionProtection,
          };
        }

        console.error('[RulesEngine] Custom rules loaded');
      }
    } catch (error) {
      console.error(`[RulesEngine] Failed to load rules: ${error.message}`);
    }
  }

  saveRules() {
    try {
      const dir = path.dirname(this.rulesFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const exportRules = {
        absolutelyForbidden: this.rules.custom,
        sshWhitelist: this.rules.sshWhitelist,
        productionProtection: this.rules.productionProtection,
        projectIsolation: this.rules.projectIsolation,
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(this.rulesFilePath, JSON.stringify(exportRules, null, 2));
      console.error('[RulesEngine] Rules saved');
    } catch (error) {
      console.error(`[RulesEngine] Failed to save rules: ${error.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // 명령 평가
  // --------------------------------------------------------------------------

  evaluate(command, context = {}) {
    const result = {
      allowed: true,
      level: 'safe',
      matchedRules: [],
      warnings: [],
      suggestion: null,
    };

    // 1. 항상 허용 패턴 체크
    for (const pattern of this.rules.alwaysAllowed) {
      if (pattern.test(command)) {
        return result;
      }
    }

    // 2. 절대 금지 규칙 체크
    for (const rule of this.rules.absolutelyForbidden) {
      const pattern = typeof rule.pattern === 'string'
        ? new RegExp(rule.pattern, 'i')
        : rule.pattern;

      if (pattern.test(command)) {
        return {
          allowed: false,
          level: 'critical',
          matchedRules: [rule.id],
          reason: rule.reason,
          suggestion: rule.suggestion,
        };
      }
    }

    // 3. 프로덕션 보호 체크
    if (this.rules.productionProtection.enabled) {
      const prodCheck = this.checkProductionProtection(command, context);
      if (!prodCheck.allowed) {
        return prodCheck;
      }
    }

    // 4. SSH 화이트리스트 체크
    if (this.rules.sshWhitelist.enabled && /^(ssh|scp|rsync)\s+/.test(command)) {
      const sshCheck = this.checkSSHWhitelist(command);
      if (!sshCheck.allowed) {
        return sshCheck;
      }
    }

    // 5. 프로젝트 격리 체크
    if (this.rules.projectIsolation.enabled && context.projectName) {
      const isolationCheck = this.checkProjectIsolation(command, context.projectName);
      if (!isolationCheck.allowed) {
        return isolationCheck;
      }
    }

    // 6. 경고 규칙 체크
    for (const rule of this.rules.warnings) {
      const pattern = typeof rule.pattern === 'string'
        ? new RegExp(rule.pattern, 'i')
        : rule.pattern;

      if (pattern.test(command)) {
        result.level = 'warning';
        result.warnings.push(rule.reason);
        result.matchedRules.push(rule.id);
      }
    }

    // 7. 커스텀 규칙 체크
    for (const rule of this.rules.custom) {
      const pattern = new RegExp(rule.pattern, 'i');
      if (pattern.test(command)) {
        if (rule.action === 'block') {
          return {
            allowed: false,
            level: rule.severity || 'danger',
            matchedRules: [rule.id],
            reason: rule.reason,
          };
        } else if (rule.action === 'warn') {
          result.warnings.push(rule.reason);
        }
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // 프로덕션 보호
  // --------------------------------------------------------------------------

  checkProductionProtection(command, context) {
    const config = this.rules.productionProtection;

    // 컨테이너 조작 명령 감지
    const match = command.match(
      /(?:podman|docker)\s+(rm|stop|kill|restart)\s+(?:-[^\s]+\s+)*(\S+)/i
    );

    if (match) {
      const action = match[1].toLowerCase();
      const containerName = match[2];

      // 보호 대상 액션인지 확인
      if (config.actions.includes(action)) {
        // 패턴 매칭
        for (const pattern of config.patterns) {
          if (pattern.test(containerName)) {
            return {
              allowed: false,
              level: 'critical',
              matchedRules: ['production-protection'],
              reason: `프로덕션 컨테이너 '${containerName}'는 보호됩니다.`,
            };
          }
        }

        // 컨텍스트에서 프로덕션 확인
        if (context.isProduction || context.environment === 'production') {
          return {
            allowed: false,
            level: 'critical',
            matchedRules: ['production-protection'],
            reason: `프로덕션 환경의 컨테이너는 CLI로 조작할 수 없습니다.`,
          };
        }
      }
    }

    return { allowed: true };
  }

  // --------------------------------------------------------------------------
  // SSH 화이트리스트
  // --------------------------------------------------------------------------

  checkSSHWhitelist(command) {
    const config = this.rules.sshWhitelist;

    // IP 추출
    const ipMatch = command.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (ipMatch) {
      const ip = ipMatch[1];
      if (!config.allowedIPs.includes(ip)) {
        return {
          allowed: false,
          level: 'danger',
          matchedRules: ['ssh-whitelist'],
          reason: `허용되지 않은 서버 IP: ${ip}`,
          allowedServers: config.allowedIPs,
        };
      }
    }

    // 호스트명 추출
    const hostMatch = command.match(/(?:ssh|scp|rsync)\s+(?:-[^\s]+\s+)*(?:\w+@)?([a-zA-Z][\w\-\.]+)/);
    if (hostMatch) {
      const hostname = hostMatch[1];
      const isAllowed = config.allowedHostnames.some(h =>
        hostname === h || hostname.endsWith(`.${h}`)
      );

      if (!isAllowed && !ipMatch) {
        return {
          allowed: false,
          level: 'danger',
          matchedRules: ['ssh-whitelist'],
          reason: `허용되지 않은 서버: ${hostname}`,
        };
      }
    }

    return { allowed: true };
  }

  // --------------------------------------------------------------------------
  // 프로젝트 격리
  // --------------------------------------------------------------------------

  checkProjectIsolation(command, currentProject) {
    const match = command.match(
      /(?:podman|docker)\s+(rm|stop|kill|restart)\s+(?:-[^\s]+\s+)*(\S+)/i
    );

    if (match) {
      const containerName = match[2];

      // 현재 프로젝트의 컨테이너가 아닌 경우
      if (!containerName.startsWith(currentProject) &&
          !containerName.startsWith(`${currentProject}-`)) {

        // 시스템 컨테이너는 허용
        if (containerName.startsWith('codeb-') || containerName === 'caddy') {
          return { allowed: true };
        }

        // 다른 프로젝트로 보이는 경우 차단
        if (containerName.includes('-')) {
          return {
            allowed: false,
            level: 'warning',
            matchedRules: ['project-isolation'],
            reason: `다른 프로젝트의 컨테이너(${containerName})는 조작할 수 없습니다.`,
          };
        }
      }
    }

    return { allowed: true };
  }

  // --------------------------------------------------------------------------
  // 포트 충돌 검사
  // --------------------------------------------------------------------------

  checkPortConflict(port, projectName, environment = 'development') {
    const config = this.rules.portManagement;
    if (!config.enabled) return { allowed: true };

    const portNum = parseInt(port);
    if (isNaN(portNum)) return { allowed: true };

    // 1. 예약된 포트 범위 체크
    for (const range of config.reservedRanges) {
      if (portNum >= range.min && portNum <= range.max) {
        // 환경에 맞는 포트인지 확인
        const envRange = config.environments[environment];
        if (envRange && portNum >= envRange.min && portNum <= envRange.max) {
          // 환경 범위 내이면 허용
          continue;
        }

        // 데이터베이스 포트 사용 시 확인
        if ((portNum === 5432 || portNum === 6379 || portNum === 27017) &&
            projectName && projectName.includes('db')) {
          continue;
        }

        return {
          allowed: false,
          level: 'danger',
          reason: `포트 ${portNum}은 예약된 범위입니다: ${range.reason}`,
          suggestion: this.suggestPort(environment),
        };
      }
    }

    // 2. 이미 할당된 포트 체크
    const allocated = config.allocatedPorts.get(portNum);
    if (allocated && allocated.projectName !== projectName) {
      return {
        allowed: false,
        level: 'danger',
        reason: `포트 ${portNum}은 이미 '${allocated.projectName}' 프로젝트에서 사용 중입니다.`,
        suggestion: this.suggestPort(environment),
        conflictWith: allocated,
      };
    }

    // 3. 환경별 포트 범위 체크
    const envRange = config.environments[environment];
    if (envRange) {
      if (portNum < envRange.min || portNum > envRange.max) {
        return {
          allowed: false,
          level: 'warning',
          reason: `${environment} 환경은 포트 ${envRange.min}-${envRange.max} 범위를 사용해야 합니다.`,
          suggestion: this.suggestPort(environment),
        };
      }
    }

    return { allowed: true };
  }

  suggestPort(environment = 'development') {
    const config = this.rules.portManagement;
    const envRange = config.environments[environment];

    if (!envRange) return '환경에 맞는 포트 범위를 확인하세요.';

    // 사용 가능한 포트 찾기
    for (let port = envRange.min; port <= envRange.max; port++) {
      if (!config.allocatedPorts.has(port)) {
        return `추천 포트: ${port} (${environment} 범위: ${envRange.min}-${envRange.max})`;
      }
    }

    return `${environment} 범위(${envRange.min}-${envRange.max})에 사용 가능한 포트가 없습니다.`;
  }

  allocatePort(port, projectName, environment) {
    const portNum = parseInt(port);
    this.rules.portManagement.allocatedPorts.set(portNum, {
      projectName,
      environment,
      allocatedAt: new Date().toISOString(),
    });
  }

  releasePort(port) {
    const portNum = parseInt(port);
    this.rules.portManagement.allocatedPorts.delete(portNum);
  }

  getPortsForProject(projectName) {
    const ports = [];
    for (const [port, info] of this.rules.portManagement.allocatedPorts) {
      if (info.projectName === projectName) {
        ports.push({ port, ...info });
      }
    }
    return ports;
  }

  // --------------------------------------------------------------------------
  // 네트워크 보호
  // --------------------------------------------------------------------------

  checkNetworkProtection(command, context = {}) {
    const config = this.rules.networkProtection;
    if (!config.enabled) return { allowed: true };

    // 금지된 네트워크 조작 체크
    for (const rule of config.forbiddenOperations) {
      if (rule.pattern.test(command)) {
        return {
          allowed: false,
          level: 'critical',
          matchedRules: ['network-protection'],
          reason: rule.reason,
        };
      }
    }

    // 보호된 네트워크 체크
    const networkMatch = command.match(/podman\s+network\s+\w+\s+(\S+)/i);
    if (networkMatch) {
      const networkName = networkMatch[1];
      if (config.protectedNetworks.includes(networkName)) {
        // 조회 명령은 허용
        if (/\b(ls|inspect|list)\b/i.test(command)) {
          return { allowed: true };
        }

        return {
          allowed: false,
          level: 'danger',
          matchedRules: ['protected-network'],
          reason: `'${networkName}'은 보호된 네트워크입니다. 수정할 수 없습니다.`,
        };
      }
    }

    return { allowed: true };
  }

  // --------------------------------------------------------------------------
  // 규칙 관리
  // --------------------------------------------------------------------------

  addRule(rule) {
    // 규칙 유효성 검사
    if (!rule.id || !rule.pattern || !rule.reason) {
      throw new Error('Invalid rule: id, pattern, reason required');
    }

    // 중복 체크
    const exists = this.rules.custom.find(r => r.id === rule.id);
    if (exists) {
      throw new Error(`Rule '${rule.id}' already exists`);
    }

    this.rules.custom.push({
      id: rule.id,
      pattern: rule.pattern,
      reason: rule.reason,
      action: rule.action || 'block',
      severity: rule.severity || 'danger',
      createdAt: new Date().toISOString(),
    });

    this.saveRules();
    return true;
  }

  removeRule(ruleId) {
    const index = this.rules.custom.findIndex(r => r.id === ruleId);
    if (index === -1) {
      return false;
    }

    this.rules.custom.splice(index, 1);
    this.saveRules();
    return true;
  }

  getRules() {
    return {
      absolutelyForbidden: this.rules.absolutelyForbidden.map(r => ({
        id: r.id,
        reason: r.reason,
        severity: r.severity,
      })),
      productionProtection: this.rules.productionProtection,
      sshWhitelist: {
        enabled: this.rules.sshWhitelist.enabled,
        allowedIPs: this.rules.sshWhitelist.allowedIPs,
      },
      projectIsolation: this.rules.projectIsolation,
      warnings: this.rules.warnings.map(r => ({
        id: r.id,
        reason: r.reason,
      })),
      custom: this.rules.custom,
    };
  }

  // --------------------------------------------------------------------------
  // SSH 화이트리스트 관리
  // --------------------------------------------------------------------------

  addAllowedServer(ip) {
    if (!this.rules.sshWhitelist.allowedIPs.includes(ip)) {
      this.rules.sshWhitelist.allowedIPs.push(ip);
      this.saveRules();
    }
  }

  removeAllowedServer(ip) {
    const index = this.rules.sshWhitelist.allowedIPs.indexOf(ip);
    if (index > -1) {
      this.rules.sshWhitelist.allowedIPs.splice(index, 1);
      this.saveRules();
    }
  }
}

module.exports = { RulesEngine };
