#!/usr/bin/env node

/**
 * MCP HTTP API Server
 *
 * we-cli Developer 모드를 위한 HTTP API 서버
 * 팀원은 SSH 없이 API Key로 배포 및 서버 관리 가능
 *
 * 포트: 9100
 * 엔드포인트: /api/tool
 *
 * 팀원 권한 (dev):
 * - 프로젝트 생성/조회: create_project, get_project, list_projects
 * - 배포/롤백: deploy, rollback
 * - ENV 관리 (파일 기반): env_init, env_push, env_scan, env_pull, env_backups
 * - 모니터링: full_health_check, analyze_server, check_domain_status
 *
 * @version 3.2.0
 */

import express from 'express';
import { spawn } from 'child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 버전 정보 (package.json에서 읽기 - 단일 소스)
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
const VERSION = pkg.version;

// ============================================================================
// 설정
// ============================================================================

// 9100은 node_exporter가 사용 중이므로 9101 사용
const PORT = process.env.MCP_HTTP_PORT || 9101;
const API_KEYS_PATH = process.env.API_KEYS_PATH || '/opt/codeb/config/api-keys.json';
const API_LOGS_PATH = process.env.API_LOGS_PATH || '/opt/codeb/logs/api-access.json';
const SSOT_PATH = '/opt/codeb/registry/ssot.json';
const SLOTS_PATH = '/opt/codeb/registry/slots.json';
const ENV_BACKUP_PATH = '/opt/codeb/env-backup';

// 로그 보관 기간 (일)
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);

// Grace Period 설정 (기본 48시간)
const GRACE_PERIOD_HOURS = parseInt(process.env.GRACE_PERIOD_HOURS || '48', 10);

// 서버 설정
const SERVERS = {
  app: { ip: '158.247.203.55', user: 'root' },
  streaming: { ip: '141.164.42.213', user: 'root' },
  storage: { ip: '64.176.226.119', user: 'root' },
  backup: { ip: '141.164.37.63', user: 'root' },
};

// ============================================================================
// API Key 검증
// ============================================================================

function loadApiKeys() {
  try {
    if (existsSync(API_KEYS_PATH)) {
      const content = readFileSync(API_KEYS_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Failed to load API keys:', e.message);
  }
  return { keys: [], roles: {} };
}

function verifyApiKey(apiKey) {
  if (!apiKey) return { valid: false, role: null };

  // 형식 검증: codeb_{role}_{token}
  const match = apiKey.match(/^codeb_(admin|dev|view)_(.+)$/);
  if (!match) return { valid: false, role: null };

  const role = match[1];
  const apiKeys = loadApiKeys();

  // 키 존재 확인
  if (apiKeys.keys && apiKeys.keys.includes(apiKey)) {
    return { valid: true, role };
  }

  // 개발 환경에서는 형식만 맞으면 허용
  if (process.env.NODE_ENV === 'development') {
    return { valid: true, role };
  }

  return { valid: false, role: null };
}

function checkPermission(role, tool) {
  // 역할별 권한
  const permissions = {
    admin: ['*'], // 모든 도구
    dev: [
      // 배포 & 롤백
      'deploy', 'rollback', 'promote',
      // 배포 Aliases (호환성)
      'deploy_project', 'slot_promote',
      // Slot 관리
      'slot_list', 'slot_status', 'slot_cleanup',
      // 프로젝트 관리
      'create_project', 'list_projects', 'get_project',
      // SSOT 조회
      'ssot_get', 'ssot_get_project', 'ssot_list_projects', 'ssot_status',
      // 모니터링
      'full_health_check', 'analyze_server', 'check_domain_status',
      // ENV 관리 (파일 기반)
      'env_scan', 'env_pull', 'env_backups', 'env_init', 'env_push',
      // 도메인 관리
      'domain_setup', 'domain_status', 'domain_list', 'domain_connect',
      // 워크플로우 스캔/업데이트
      'workflow_scan', 'workflow_update',
      // 로그 조회
      'api_access_stats', 'api_active_users', 'api_keys_list',
    ],
    view: [
      'ssot_get', 'ssot_get_project', 'ssot_list_projects', 'ssot_status',
      'full_health_check', 'list_projects', 'get_project',
      'env_scan', 'env_backups',
      'domain_status', 'domain_list',
      'slot_list', 'slot_status',
      'workflow_scan',  // 읽기 전용
      'api_access_stats', 'api_active_users',  // 로그 조회
    ],
  };

  const allowed = permissions[role] || [];
  return allowed.includes('*') || allowed.includes(tool);
}

// ============================================================================
// API 로깅 시스템
// ============================================================================

function ensureLogDirectory() {
  const logDir = dirname(API_LOGS_PATH);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

function loadApiLogs() {
  try {
    ensureLogDirectory();
    if (existsSync(API_LOGS_PATH)) {
      const content = readFileSync(API_LOGS_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Failed to load API logs:', e.message);
  }
  return { logs: [], stats: {} };
}

function saveApiLogs(data) {
  try {
    ensureLogDirectory();
    writeFileSync(API_LOGS_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save API logs:', e.message);
  }
}

function logApiAccess(req, tool, result, duration, error = null) {
  const apiKey = req.headers['x-api-key'] || '';
  const keyInfo = getApiKeyInfo(apiKey);

  const logEntry = {
    timestamp: new Date().toISOString(),
    apiKey: apiKey.substring(0, 20) + '...', // 보안을 위해 일부만 저장
    keyName: keyInfo?.name || 'Unknown',
    role: req.apiRole || 'unknown',
    tool,
    params: req.body?.params || {},
    success: !error,
    error: error?.message || null,
    duration: duration,
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || '',
    client: req.headers['x-client'] || 'unknown',
  };

  const data = loadApiLogs();

  // 로그 추가
  data.logs.unshift(logEntry);

  // 30일 이상 된 로그 삭제
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);
  data.logs = data.logs.filter(log => new Date(log.timestamp) > cutoffDate);

  // 최대 10000개 로그 유지
  if (data.logs.length > 10000) {
    data.logs = data.logs.slice(0, 10000);
  }

  // 통계 업데이트
  const today = new Date().toISOString().split('T')[0];
  if (!data.stats[today]) {
    data.stats[today] = { total: 0, success: 0, failed: 0, byRole: {}, byTool: {}, byKey: {} };
  }
  data.stats[today].total++;
  if (error) {
    data.stats[today].failed++;
  } else {
    data.stats[today].success++;
  }

  // 역할별 통계
  data.stats[today].byRole[req.apiRole] = (data.stats[today].byRole[req.apiRole] || 0) + 1;

  // 도구별 통계
  data.stats[today].byTool[tool] = (data.stats[today].byTool[tool] || 0) + 1;

  // API Key별 통계
  const keyId = keyInfo?.name || 'Unknown';
  data.stats[today].byKey[keyId] = (data.stats[today].byKey[keyId] || 0) + 1;

  // 30일 이상 된 통계 삭제
  const statsKeys = Object.keys(data.stats);
  for (const key of statsKeys) {
    if (new Date(key) < cutoffDate) {
      delete data.stats[key];
    }
  }

  saveApiLogs(data);
  return logEntry;
}

function getApiKeyInfo(apiKey) {
  const apiKeys = loadApiKeys();
  return apiKeys.roles?.[apiKey] || null;
}

function getApiAccessStats(days = 7) {
  const data = loadApiLogs();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const result = {
    period: { days, from: cutoffDate.toISOString(), to: new Date().toISOString() },
    summary: { total: 0, success: 0, failed: 0 },
    byRole: {},
    byTool: {},
    byKey: {},
    byDay: {},
    recentLogs: data.logs.slice(0, 50),
  };

  // 통계 집계
  for (const [date, stats] of Object.entries(data.stats)) {
    if (new Date(date) >= cutoffDate) {
      result.summary.total += stats.total;
      result.summary.success += stats.success;
      result.summary.failed += stats.failed;
      result.byDay[date] = stats;

      // 역할별
      for (const [role, count] of Object.entries(stats.byRole || {})) {
        result.byRole[role] = (result.byRole[role] || 0) + count;
      }

      // 도구별
      for (const [tool, count] of Object.entries(stats.byTool || {})) {
        result.byTool[tool] = (result.byTool[tool] || 0) + count;
      }

      // Key별
      for (const [key, count] of Object.entries(stats.byKey || {})) {
        result.byKey[key] = (result.byKey[key] || 0) + count;
      }
    }
  }

  return result;
}

function getActiveUsers(hours = 24) {
  const data = loadApiLogs();
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hours);

  const recentLogs = data.logs.filter(log => new Date(log.timestamp) > cutoffTime);

  const activeUsers = {};
  for (const log of recentLogs) {
    const key = log.keyName || 'Unknown';
    if (!activeUsers[key]) {
      activeUsers[key] = {
        name: key,
        role: log.role,
        lastAccess: log.timestamp,
        actions: [],
        actionCount: 0,
        ips: new Set(),
      };
    }
    activeUsers[key].actionCount++;
    activeUsers[key].actions.push({
      tool: log.tool,
      timestamp: log.timestamp,
      success: log.success,
    });
    activeUsers[key].ips.add(log.ip);
  }

  // Set을 배열로 변환
  for (const user of Object.values(activeUsers)) {
    user.ips = [...user.ips];
    user.actions = user.actions.slice(0, 20); // 최근 20개만
  }

  return {
    period: { hours, from: cutoffTime.toISOString(), to: new Date().toISOString() },
    activeCount: Object.keys(activeUsers).length,
    users: activeUsers,
  };
}

// ============================================================================
// 명령 실행 (로컬 또는 SSH)
// ============================================================================

// 현재 서버 (이 MCP API가 실행 중인 서버)
const CURRENT_SERVER = process.env.CURRENT_SERVER || 'app';

function execCommand(server, command, timeout = 30000) {
  return new Promise((resolve) => {
    const serverInfo = SERVERS[server] || SERVERS.app;
    let proc;

    // 현재 서버면 로컬 실행, 아니면 SSH
    if (server === CURRENT_SERVER) {
      // 로컬 실행
      proc = spawn('bash', ['-c', command]);
    } else {
      // SSH 실행
      proc = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=10',
        `${serverInfo.user}@${serverInfo.ip}`,
        command,
      ]);
    }

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, output: stdout, error: 'Command timed out' });
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ success: true, output: stdout.trim() });
      } else {
        resolve({ success: false, output: stdout, error: stderr || `Exit code: ${code}` });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

// ============================================================================
// Slot 관리 헬퍼 함수
// ============================================================================

/**
 * Slot 상태 파일 로드
 */
async function loadSlots() {
  const result = await execCommand('app', `cat ${SLOTS_PATH} 2>/dev/null || echo '{"slots":{}}'`);
  try {
    return JSON.parse(result.output);
  } catch {
    return { slots: {} };
  }
}

/**
 * Slot 상태 저장
 */
async function saveSlots(slotsData) {
  const json = JSON.stringify(slotsData, null, 2).replace(/'/g, "'\\''");
  await execCommand('app', `echo '${json}' > ${SLOTS_PATH}`);
}

/**
 * 프로젝트의 Slot 키 생성
 */
function getSlotKey(projectName, environment) {
  return `${projectName}:${environment}`;
}

/**
 * 다음 Slot 선택 (Blue/Green 전환)
 */
function getNextSlot(currentSlot) {
  return currentSlot === 'blue' ? 'green' : 'blue';
}

/**
 * Slot 컨테이너 이름 생성
 */
function getSlotContainerName(projectName, environment, slot) {
  return `${projectName}-${environment}-${slot}`;
}

/**
 * Slot 포트 계산 (Blue: 기본포트, Green: 기본포트+1)
 */
function getSlotPort(basePort, slot) {
  return slot === 'blue' ? basePort : basePort + 1;
}

// ============================================================================
// 도구 핸들러
// ============================================================================

const toolHandlers = {
  // SSOT 조회
  async ssot_get() {
    const result = await execCommand('app', `cat ${SSOT_PATH} 2>/dev/null || echo '{"error": "SSOT not found"}'`);
    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return { raw: result.output };
      }
    }
    return { error: result.error };
  },

  // 프로젝트 조회
  async ssot_get_project({ projectId }) {
    const result = await execCommand('app', `jq '.projects["${projectId}"]' ${SSOT_PATH} 2>/dev/null || echo 'null'`);
    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return null;
      }
    }
    return { error: result.error };
  },

  // 프로젝트 목록
  async ssot_list_projects() {
    const result = await execCommand('app', `jq '.projects | keys' ${SSOT_PATH} 2>/dev/null || echo '[]'`);
    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return [];
      }
    }
    return { error: result.error };
  },

  // 프로젝트 목록 (상세)
  async list_projects() {
    const result = await execCommand('app', `cat /opt/codeb/config/project-registry.json 2>/dev/null || echo '{"projects":{}}'`);
    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return { projects: {} };
      }
    }
    return { error: result.error };
  },

  // 헬스체크
  async full_health_check() {
    const cmd = `
      echo '{'
      echo '"timestamp": "'$(date -Iseconds)'",'
      echo '"server": "'$(hostname)'",'
      echo '"resources": {'

      cpu=$(vmstat 1 2 2>/dev/null | tail -1 | awk '{print 100 - $15}' || echo "0")
      echo '"cpu": {"usage": '$cpu'},'

      mem=$(free -m 2>/dev/null | awk '/Mem:/ {printf "%.1f", $3/$2*100}' || echo "0")
      mem_used=$(free -h 2>/dev/null | awk '/Mem:/ {print $3}' || echo "N/A")
      mem_total=$(free -h 2>/dev/null | awk '/Mem:/ {print $2}' || echo "N/A")
      echo '"memory": {"usage": '$mem', "used": "'$mem_used'", "total": "'$mem_total'"},'

      disk=$(df / 2>/dev/null | awk 'NR==2 {print $5}' | tr -d '%' || echo "0")
      disk_used=$(df -h / 2>/dev/null | awk 'NR==2 {print $3}' || echo "N/A")
      disk_total=$(df -h / 2>/dev/null | awk 'NR==2 {print $2}' || echo "N/A")
      echo '"disk": {"usage": '$disk', "used": "'$disk_used'", "total": "'$disk_total'"}'

      echo '},'

      echo '"services": {'
      caddy_status=$(systemctl is-active caddy 2>/dev/null || echo "inactive")
      echo '"caddy": {"running": '$([[ "$caddy_status" == "active" ]] && echo "true" || echo "false")', "status": "'$caddy_status'"}'
      echo '}'

      echo '}'
    `;

    const result = await execCommand('app', cmd);
    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return { raw: result.output };
      }
    }
    return { error: result.error };
  },

  // 서버 분석
  async analyze_server({ includeContainers = true }) {
    let cmd = `
      echo '{'
      echo '"timestamp": "'$(date -Iseconds)'",'
      echo '"hostname": "'$(hostname)'",'
      echo '"uptime": "'$(uptime -p 2>/dev/null || uptime)'"'
    `;

    if (includeContainers) {
      cmd += `
        echo ',"containers": ['
        first=true
        podman ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}' 2>/dev/null | while read line; do
          name=$(echo $line | cut -d'|' -f1)
          status=$(echo $line | cut -d'|' -f2)
          image=$(echo $line | cut -d'|' -f3)
          if [ "$first" = true ]; then
            first=false
          else
            echo ','
          fi
          echo '{"name": "'$name'", "status": "'$status'", "image": "'$image'"}'
        done
        echo ']'
      `;
    }

    cmd += `echo '}'`;

    const result = await execCommand('app', cmd);
    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return { raw: result.output };
      }
    }
    return { error: result.error };
  },

  // ============================================================================
  // Slot 기반 Blue-Green 배포 (Vercel 스타일)
  // ============================================================================

  /**
   * 배포 - 새 Slot에 컨테이너 배포 (기존 컨테이너 유지)
   *
   * 흐름:
   * 1. 현재 Active Slot 확인 (blue/green)
   * 2. 반대 Slot에 새 컨테이너 배포
   * 3. Preview URL 반환 (도메인 연결 X)
   * 4. promote 호출 전까지 기존 서비스 유지
   */
  async deploy({ projectName, environment = 'production', image, skipHealthcheck = false, autoPromote = false }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    const server = environment === 'preview' ? 'backup' : 'app';
    const deployImage = image || `ghcr.io/codeblabdev-max/${projectName}:latest`;
    const slotKey = getSlotKey(projectName, environment);

    // 현재 Slot 상태 로드
    const slotsData = await loadSlots();
    const currentSlotState = slotsData.slots[slotKey] || {
      activeSlot: null,
      slots: { blue: null, green: null },
    };

    // 다음 Slot 결정 (첫 배포면 blue, 아니면 반대 Slot)
    const targetSlot = currentSlotState.activeSlot
      ? getNextSlot(currentSlotState.activeSlot)
      : 'blue';

    // 포트 결정 (SSOT에서 조회 또는 기본값)
    const portResult = await execCommand(server,
      `jq -r '.projects["${projectName}"].environments.${environment}.port // empty' ${SSOT_PATH} 2>/dev/null`
    );
    const basePort = parseInt(portResult.output?.trim()) || (environment === 'production' ? 4000 : 4500);
    const slotPort = getSlotPort(basePort, targetSlot);
    const containerName = getSlotContainerName(projectName, environment, targetSlot);

    const deployCmd = `
      set -e

      # 이미지 풀
      echo "[$(date)] Pulling image: ${deployImage}"
      podman pull ${deployImage}

      # 타겟 Slot 컨테이너 정리 (있으면)
      echo "[$(date)] Cleaning target slot: ${containerName}"
      podman stop ${containerName} 2>/dev/null || true
      podman rm ${containerName} 2>/dev/null || true

      # ENV 파일 확인
      ENV_FILE="${ENV_BACKUP_PATH}/${projectName}/${environment}/current.env"
      if [ ! -f "$ENV_FILE" ]; then
        echo "[$(date)] Warning: ENV file not found"
        ENV_FILE=""
      fi

      # 컨테이너 실행 (새 Slot에)
      echo "[$(date)] Starting container on slot ${targetSlot}..."
      if [ -n "$ENV_FILE" ]; then
        podman run -d \\
          --name ${containerName} \\
          --network codeb-main \\
          -p ${slotPort}:3000 \\
          --restart always \\
          --env-file "$ENV_FILE" \\
          -l "codeb.slot=${targetSlot}" \\
          -l "codeb.project=${projectName}" \\
          -l "codeb.environment=${environment}" \\
          ${deployImage}
      else
        podman run -d \\
          --name ${containerName} \\
          --network codeb-main \\
          -p ${slotPort}:3000 \\
          --restart always \\
          -e NODE_ENV=${environment} \\
          -e PORT=3000 \\
          -l "codeb.slot=${targetSlot}" \\
          -l "codeb.project=${projectName}" \\
          -l "codeb.environment=${environment}" \\
          ${deployImage}
      fi

      ${skipHealthcheck ? 'echo "Skipping healthcheck"' : `
      sleep 5
      HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${slotPort}/api/health 2>/dev/null || echo "000")
      if [ "$HEALTH" != "200" ] && [ "$HEALTH" != "404" ]; then
        echo "[$(date)] Warning: Healthcheck returned $HEALTH"
      else
        echo "[$(date)] Healthcheck passed: $HEALTH"
      fi
      `}

      echo "SUCCESS"
    `;

    const result = await execCommand(server, deployCmd, 180000);

    if (result.success && result.output.includes('SUCCESS')) {
      // Slot 상태 업데이트
      const now = new Date().toISOString();
      currentSlotState.slots[targetSlot] = {
        container: containerName,
        port: slotPort,
        image: deployImage,
        deployedAt: now,
        status: 'deployed',
      };

      // 첫 배포인 경우 자동으로 Active 설정
      const isFirstDeploy = !currentSlotState.activeSlot;
      if (isFirstDeploy) {
        currentSlotState.activeSlot = targetSlot;
      }

      slotsData.slots[slotKey] = currentSlotState;
      await saveSlots(slotsData);

      const previewUrl = `http://${server === 'app' ? '158.247.203.55' : '141.164.37.63'}:${slotPort}`;

      const deployResult = {
        success: true,
        project: projectName,
        environment,
        slot: targetSlot,
        image: deployImage,
        port: slotPort,
        container: containerName,
        server,
        previewUrl,
        isFirstDeploy,
        activeSlot: currentSlotState.activeSlot,
        message: isFirstDeploy
          ? `First deploy - slot ${targetSlot} is now active`
          : `Deployed to slot ${targetSlot}. Run 'promote' to switch traffic.`,
      };

      // autoPromote가 true이거나 첫 배포인 경우 자동 promote
      if (autoPromote || isFirstDeploy) {
        const promoteResult = await this.promote({ projectName, environment });
        deployResult.promoted = promoteResult.success;
        deployResult.domain = promoteResult.domain;
        deployResult.url = promoteResult.url;
      }

      return deployResult;
    }

    return {
      success: false,
      error: result.error || 'Deployment failed',
      output: result.output,
    };
  },

  /**
   * Promote - Caddy 설정만 변경하여 트래픽 전환 (무중단)
   *
   * 흐름:
   * 1. 새 Slot으로 Caddy 설정 변경
   * 2. Caddy reload (다운타임 0)
   * 3. 이전 Slot에 Grace Period 설정 (48시간)
   */
  async promote({ projectName, environment = 'production', targetSlot = null }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    const slotKey = getSlotKey(projectName, environment);
    const slotsData = await loadSlots();
    const slotState = slotsData.slots[slotKey];

    if (!slotState) {
      return { success: false, error: 'No deployment found. Run deploy first.' };
    }

    // 타겟 Slot 결정 (명시하지 않으면 현재 Active의 반대)
    const newActiveSlot = targetSlot || getNextSlot(slotState.activeSlot);
    const previousSlot = slotState.activeSlot;

    // 새 Slot이 배포되어 있는지 확인
    if (!slotState.slots[newActiveSlot]) {
      return {
        success: false,
        error: `Slot ${newActiveSlot} has no deployment. Run deploy first.`,
        currentActive: slotState.activeSlot,
      };
    }

    const slotInfo = slotState.slots[newActiveSlot];
    const port = slotInfo.port;

    // 도메인 결정
    const domain = environment === 'production'
      ? `${projectName}.codeb.kr`
      : `${projectName}-${environment}.codeb.kr`;

    // Caddy 설정 업데이트 (도메인 → 새 Slot 포트로 연결)
    const caddyCmd = `
      CADDY_FILE="/etc/caddy/sites/${projectName}-${environment}.caddy"

      cat > "\$CADDY_FILE" << 'CADDYEOF'
${domain} {
    reverse_proxy localhost:${port}

    encode gzip

    header {
        X-Slot ${newActiveSlot}
        X-Deploy-Time "${slotInfo.deployedAt}"
    }

    log {
        output file /var/log/caddy/${projectName}-${environment}.log
    }
}
CADDYEOF

      # Caddy 리로드 (무중단)
      systemctl reload caddy

      echo "SUCCESS"
    `;

    const result = await execCommand('app', caddyCmd);

    if (result.success && result.output.includes('SUCCESS')) {
      const now = new Date();
      const gracePeriodEnd = new Date(now.getTime() + GRACE_PERIOD_HOURS * 60 * 60 * 1000);

      // Slot 상태 업데이트
      slotState.activeSlot = newActiveSlot;
      slotState.slots[newActiveSlot].status = 'active';
      slotState.slots[newActiveSlot].promotedAt = now.toISOString();

      // 이전 Slot에 Grace Period 설정
      if (previousSlot && slotState.slots[previousSlot]) {
        slotState.slots[previousSlot].status = 'grace-period';
        slotState.slots[previousSlot].gracePeriodStart = now.toISOString();
        slotState.slots[previousSlot].scheduledCleanup = gracePeriodEnd.toISOString();
      }

      slotsData.slots[slotKey] = slotState;
      await saveSlots(slotsData);

      return {
        success: true,
        project: projectName,
        environment,
        activeSlot: newActiveSlot,
        previousSlot,
        domain,
        url: `https://${domain}`,
        port,
        gracePeriod: previousSlot ? {
          slot: previousSlot,
          endsAt: gracePeriodEnd.toISOString(),
          hoursRemaining: GRACE_PERIOD_HOURS,
        } : null,
        message: `Traffic switched to slot ${newActiveSlot}. Previous slot ${previousSlot} will be cleaned up after ${GRACE_PERIOD_HOURS}h.`,
      };
    }

    return { success: false, error: result.error || 'Promote failed' };
  },

  // 도메인 상태 확인
  async check_domain_status({ domain }) {
    const result = await execCommand('app', `
      echo '{'
      echo '"domain": "'${domain}'",'

      # DNS 확인
      dns=$(dig +short ${domain} 2>/dev/null | head -1)
      echo '"dns": "'$dns'",'

      # Caddy 설정 확인
      caddy_config=$(grep -l "${domain}" /etc/caddy/*.caddy /etc/caddy/*/*.caddy 2>/dev/null | head -1)
      echo '"caddy": "'$caddy_config'",'

      # SSL 확인
      ssl=$(echo | openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | grep notAfter | cut -d= -f2)
      echo '"ssl_expires": "'$ssl'"'

      echo '}'
    `);

    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return { raw: result.output };
      }
    }
    return { error: result.error };
  },

  // ENV 스캔
  async env_scan({ projectName, environment = 'production' }) {
    const result = await execCommand('backup', `
      ENV_PATH="${ENV_BACKUP_PATH}/${projectName}/${environment}"
      if [ -d "$ENV_PATH" ]; then
        echo '{'
        echo '"project": "'${projectName}'",'
        echo '"environment": "'${environment}'",'
        echo '"files": ['
        first=true
        for f in $ENV_PATH/*.env; do
          if [ -f "$f" ]; then
            if [ "$first" = true ]; then first=false; else echo ','; fi
            filename=$(basename $f)
            size=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null)
            mtime=$(stat -c%Y "$f" 2>/dev/null || stat -f%m "$f" 2>/dev/null)
            echo '{"name": "'$filename'", "size": '$size', "mtime": '$mtime'}'
          fi
        done
        echo ']'
        echo '}'
      else
        echo '{"error": "ENV directory not found"}'
      fi
    `);

    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return { raw: result.output };
      }
    }
    return { error: result.error };
  },

  // ENV 백업 목록
  async env_backups({ projectName }) {
    const result = await execCommand('backup', `
      ls -la ${ENV_BACKUP_PATH}/${projectName}/*/*.env 2>/dev/null | awk '{print $9, $6, $7, $8}' || echo ""
    `);

    if (result.success && result.output) {
      const backups = result.output
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(' ');
          const path = parts[0];
          const date = parts.slice(1).join(' ');
          const segments = path.split('/');
          return {
            path,
            project: segments[segments.length - 3],
            environment: segments[segments.length - 2],
            filename: segments[segments.length - 1],
            date,
            isMaster: segments[segments.length - 1] === 'master.env',
            isCurrent: segments[segments.length - 1] === 'current.env',
          };
        });
      return { success: true, backups };
    }
    return { success: true, backups: [] };
  },

  /**
   * Rollback - 이전 Slot으로 트래픽 전환 (컨테이너 재배포 없음)
   *
   * Grace Period 동안 이전 컨테이너가 유지되므로
   * Caddy 설정만 변경하면 즉시 롤백 가능
   */
  async rollback({ projectName, environment = 'production' }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    const slotKey = getSlotKey(projectName, environment);
    const slotsData = await loadSlots();
    const slotState = slotsData.slots[slotKey];

    if (!slotState) {
      return { success: false, error: 'No deployment found' };
    }

    const currentSlot = slotState.activeSlot;
    const previousSlot = getNextSlot(currentSlot);

    // 이전 Slot 상태 확인
    const previousSlotInfo = slotState.slots[previousSlot];
    if (!previousSlotInfo) {
      return {
        success: false,
        error: `No previous deployment in slot ${previousSlot}`,
        currentSlot,
      };
    }

    // Grace Period 체크 (만료되었으면 롤백 불가)
    if (previousSlotInfo.status !== 'grace-period' && previousSlotInfo.status !== 'active') {
      // 컨테이너가 정리되었을 수 있음 - 확인
      const containerCheck = await execCommand('app',
        `podman inspect ${previousSlotInfo.container} --format '{{.State.Status}}' 2>/dev/null || echo "not_found"`
      );

      if (containerCheck.output?.trim() === 'not_found') {
        return {
          success: false,
          error: 'Previous container has been cleaned up. Grace Period expired.',
          hint: 'Deploy a new version to roll forward.',
        };
      }
    }

    // Promote를 이전 Slot으로 호출 (트래픽 전환)
    const promoteResult = await this.promote({ projectName, environment, targetSlot: previousSlot });

    if (promoteResult.success) {
      return {
        success: true,
        project: projectName,
        environment,
        rolledBackTo: previousSlot,
        previousActive: currentSlot,
        domain: promoteResult.domain,
        url: promoteResult.url,
        message: `Rolled back to slot ${previousSlot}. Slot ${currentSlot} is now in grace period.`,
      };
    }

    return { success: false, error: promoteResult.error };
  },

  // ============================================================================
  // Slot 관리 API
  // ============================================================================

  /**
   * Slot 목록 조회 - 프로젝트의 모든 Slot 상태
   */
  async slot_list({ projectName, environment = null }) {
    const slotsData = await loadSlots();

    if (projectName) {
      // 특정 프로젝트의 Slot만 조회
      const results = {};
      const environments = environment ? [environment] : ['staging', 'production'];

      for (const env of environments) {
        const slotKey = getSlotKey(projectName, env);
        const slotState = slotsData.slots[slotKey];

        if (slotState) {
          // 컨테이너 실제 상태 확인
          for (const slot of ['blue', 'green']) {
            if (slotState.slots[slot]) {
              const containerStatus = await execCommand('app',
                `podman inspect ${slotState.slots[slot].container} --format '{{.State.Status}}' 2>/dev/null || echo "not_found"`
              );
              slotState.slots[slot].containerStatus = containerStatus.output?.trim() || 'unknown';
            }
          }
          results[env] = slotState;
        }
      }

      return {
        success: true,
        project: projectName,
        environments: results,
      };
    }

    // 전체 Slot 조회
    return {
      success: true,
      slots: slotsData.slots,
      total: Object.keys(slotsData.slots).length,
    };
  },

  /**
   * Slot 상세 상태 조회
   */
  async slot_status({ projectName, environment = 'production' }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    const slotKey = getSlotKey(projectName, environment);
    const slotsData = await loadSlots();
    const slotState = slotsData.slots[slotKey];

    if (!slotState) {
      return {
        success: false,
        error: 'No slots found for this project/environment',
      };
    }

    // 각 Slot의 실시간 상태 조회
    const slotDetails = {};
    for (const slot of ['blue', 'green']) {
      if (slotState.slots[slot]) {
        const info = slotState.slots[slot];

        // 컨테이너 상태
        const containerResult = await execCommand('app', `
          podman inspect ${info.container} --format '{{.State.Status}}|{{.State.StartedAt}}' 2>/dev/null || echo "not_found|N/A"
        `);

        const [containerStatus, startedAt] = (containerResult.output || '').split('|');

        // Grace Period 남은 시간 계산
        let gracePeriodRemaining = null;
        if (info.scheduledCleanup) {
          const cleanupTime = new Date(info.scheduledCleanup);
          const now = new Date();
          const remainingMs = cleanupTime - now;
          if (remainingMs > 0) {
            gracePeriodRemaining = {
              hours: Math.floor(remainingMs / (1000 * 60 * 60)),
              minutes: Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)),
            };
          }
        }

        slotDetails[slot] = {
          ...info,
          containerStatus: containerStatus?.trim() || 'unknown',
          startedAt: startedAt?.trim(),
          isActive: slotState.activeSlot === slot,
          gracePeriodRemaining,
        };
      } else {
        slotDetails[slot] = { status: 'empty' };
      }
    }

    return {
      success: true,
      project: projectName,
      environment,
      activeSlot: slotState.activeSlot,
      slots: slotDetails,
    };
  },

  /**
   * Slot 정리 - Grace Period 만료된 Slot 컨테이너 삭제
   */
  async slot_cleanup({ projectName, environment = null, force = false }) {
    const slotsData = await loadSlots();
    const now = new Date();
    const cleanedUp = [];
    const skipped = [];

    // 정리 대상 결정
    const keysToCheck = projectName
      ? environment
        ? [getSlotKey(projectName, environment)]
        : [getSlotKey(projectName, 'staging'), getSlotKey(projectName, 'production')]
      : Object.keys(slotsData.slots);

    for (const slotKey of keysToCheck) {
      const slotState = slotsData.slots[slotKey];
      if (!slotState) continue;

      for (const slot of ['blue', 'green']) {
        const info = slotState.slots[slot];
        if (!info) continue;

        // Active Slot은 절대 정리 안함
        if (slotState.activeSlot === slot) {
          skipped.push({ slotKey, slot, reason: 'active' });
          continue;
        }

        // Grace Period 체크
        if (info.scheduledCleanup) {
          const cleanupTime = new Date(info.scheduledCleanup);

          if (now < cleanupTime && !force) {
            const hoursRemaining = Math.ceil((cleanupTime - now) / (1000 * 60 * 60));
            skipped.push({
              slotKey,
              slot,
              reason: 'grace-period',
              hoursRemaining,
            });
            continue;
          }
        }

        // 컨테이너 정리
        if (info.container) {
          const cleanupResult = await execCommand('app', `
            podman stop ${info.container} 2>/dev/null || true
            podman rm ${info.container} 2>/dev/null || true
            echo "CLEANED"
          `);

          if (cleanupResult.output?.includes('CLEANED')) {
            cleanedUp.push({
              slotKey,
              slot,
              container: info.container,
            });

            // Slot 상태 초기화
            slotState.slots[slot] = null;
          }
        }
      }

      slotsData.slots[slotKey] = slotState;
    }

    await saveSlots(slotsData);

    return {
      success: true,
      cleanedUp,
      skipped,
      message: cleanedUp.length > 0
        ? `Cleaned up ${cleanedUp.length} slot(s)`
        : 'No slots to clean up',
    };
  },

  // ============================================================================
  // 프로젝트 생성 (팀원용)
  // ============================================================================
  async create_project({ name, type = 'nextjs', description = '', database = true, redis = true, gitRepo = '' }) {
    if (!name) {
      return { success: false, error: 'Project name is required' };
    }

    // 프로젝트명 검증 (소문자, 숫자, 하이픈만)
    if (!/^[a-z0-9-]+$/.test(name)) {
      return { success: false, error: 'Project name must be lowercase alphanumeric with hyphens only' };
    }

    // 지원 타입
    const PROJECT_TYPES = ['nextjs', 'nodejs', 'python', 'static'];
    if (!PROJECT_TYPES.includes(type)) {
      return { success: false, error: `Invalid type. Supported: ${PROJECT_TYPES.join(', ')}` };
    }

    // 포트 할당 (해시 기반)
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const ports = {
      staging: {
        app: 4500 + (hash % 500),
        db: database ? 15432 + (hash % 68) : null,
        redis: redis ? 16379 + (hash % 21) : null,
      },
      production: {
        app: 4000 + (hash % 500),
        db: database ? 25432 + (hash % 68) : null,
        redis: redis ? 26379 + (hash % 21) : null,
      },
    };

    // SSOT 등록
    const ssotEntry = {
      name,
      type,
      description,
      gitRepo,
      database,
      redis,
      ports,
      environments: {
        staging: {
          port: ports.staging.app,
          domain: `${name}-staging.codeb.kr`,
          status: 'pending',
        },
        production: {
          port: ports.production.app,
          domain: `${name}.codeb.kr`,
          status: 'pending',
        },
      },
      createdAt: new Date().toISOString(),
      createdBy: 'api',
    };

    // SSOT에 프로젝트 등록
    const registerCmd = `
      SSOT_FILE="${SSOT_PATH}"

      # SSOT 파일 없으면 초기화
      if [ ! -f "$SSOT_FILE" ]; then
        echo '{"projects":{}}' > "$SSOT_FILE"
      fi

      # 프로젝트 이미 존재하는지 확인
      EXISTS=$(jq -r '.projects["${name}"] // empty' "$SSOT_FILE")
      if [ -n "$EXISTS" ]; then
        echo "PROJECT_EXISTS"
        exit 1
      fi

      # 프로젝트 추가
      jq '.projects["${name}"] = ${JSON.stringify(ssotEntry).replace(/'/g, "\\'")}' "$SSOT_FILE" > "$SSOT_FILE.tmp" && mv "$SSOT_FILE.tmp" "$SSOT_FILE"

      echo "SUCCESS"
    `;

    const result = await execCommand('app', registerCmd);

    if (result.output?.includes('PROJECT_EXISTS')) {
      return { success: false, error: `Project '${name}' already exists` };
    }

    if (!result.success || !result.output?.includes('SUCCESS')) {
      return { success: false, error: 'Failed to register project in SSOT', details: result.error };
    }

    // ENV 디렉토리 생성 및 초기 파일 생성 (백업 서버)
    const envInitCmd = `
      mkdir -p "${ENV_BACKUP_PATH}/${name}/staging"
      mkdir -p "${ENV_BACKUP_PATH}/${name}/production"

      # .env.example 생성
      cat > "${ENV_BACKUP_PATH}/${name}/.env.example" << 'ENVEOF'
# ${name} Environment Variables
# Auto-generated by CodeB API

# Application
NODE_ENV=production
PORT=3000

${database ? `# Database (PostgreSQL)
DATABASE_URL=postgresql://${name}_user:password@db.codeb.kr:5432/${name}
POSTGRES_USER=${name}_user
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_DB=${name}
` : ''}
${redis ? `# Cache (Redis)
REDIS_URL=redis://db.codeb.kr:6379/0
REDIS_PREFIX=${name}:
` : ''}
# Centrifugo (WebSocket)
CENTRIFUGO_URL=wss://ws.codeb.kr/connection/websocket
CENTRIFUGO_API_URL=http://ws.codeb.kr:8000/api
CENTRIFUGO_API_KEY=your_api_key
CENTRIFUGO_SECRET=your_secret

# Security
JWT_SECRET=GENERATE_STRONG_SECRET
API_KEY=your_api_key
ENVEOF

      echo "ENV_CREATED"
    `;

    await execCommand('backup', envInitCmd);

    // 생성할 파일들 (로컬에서 생성할 템플릿)
    const files = generateProjectFiles(name, type, ports, { database, redis });

    return {
      success: true,
      project: ssotEntry,
      ports,
      files,
      nextSteps: [
        `1. ENV 초기화: we env init ${name}`,
        `2. 배포: we deploy ${name} --environment staging`,
        `3. 도메인 설정: we domain setup ${name}.codeb.kr`,
      ],
    };
  },

  // 프로젝트 상세 조회
  async get_project({ projectName }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    const result = await execCommand('app', `jq '.projects["${projectName}"]' ${SSOT_PATH} 2>/dev/null`);

    if (result.success && result.output && result.output !== 'null') {
      try {
        const project = JSON.parse(result.output);

        // 컨테이너 상태 확인
        const containerStatus = await execCommand('app', `
          echo '{'

          # Staging
          staging_status=$(podman inspect ${projectName}-staging --format '{{.State.Status}}' 2>/dev/null || echo "not_found")
          echo '"staging": "'$staging_status'",'

          # Production
          prod_status=$(podman inspect ${projectName}-production --format '{{.State.Status}}' 2>/dev/null || echo "not_found")
          echo '"production": "'$prod_status'"'

          echo '}'
        `);

        let containers = {};
        try {
          containers = JSON.parse(containerStatus.output);
        } catch {}

        return {
          success: true,
          project,
          containers,
        };
      } catch {
        return { success: false, error: 'Failed to parse project data' };
      }
    }

    return { success: false, error: `Project '${projectName}' not found` };
  },

  // ============================================================================
  // ENV 초기화 (팀원이 프로젝트 생성 후 ENV 설정)
  // ============================================================================
  async env_init({ projectName, environment = 'production', envContent }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    if (!envContent) {
      return { success: false, error: 'envContent is required' };
    }

    // 보안: 민감 변수 검증 (빈 값이나 placeholder 체크)
    const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
    const dangerousPatterns = ['password', 'CHANGE_ME', 'your_', 'GENERATE_'];

    for (const pattern of dangerousPatterns) {
      if (envContent.toLowerCase().includes(pattern.toLowerCase()) &&
          (envContent.includes('=password') || envContent.includes('=CHANGE_ME') ||
           envContent.includes('=your_') || envContent.includes('=GENERATE_'))) {
        return {
          success: false,
          error: 'ENV contains placeholder values. Please set actual values.',
          hint: `Found placeholder pattern: ${pattern}`,
        };
      }
    }

    const envPath = `${ENV_BACKUP_PATH}/${projectName}/${environment}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // ENV 파일 생성 (백업 서버에)
    const initCmd = `
      mkdir -p "${envPath}"

      # master.env가 없으면 생성 (최초 1회)
      if [ ! -f "${envPath}/master.env" ]; then
        cat > "${envPath}/master.env" << 'ENVEOF'
${envContent}
ENVEOF
        chmod 600 "${envPath}/master.env"
        echo "MASTER_CREATED"
      fi

      # current.env 생성/업데이트
      cat > "${envPath}/current.env" << 'ENVEOF'
${envContent}
ENVEOF
      chmod 600 "${envPath}/current.env"

      # 타임스탬프 백업
      cp "${envPath}/current.env" "${envPath}/${timestamp}.env"

      echo "SUCCESS"
    `;

    const result = await execCommand('backup', initCmd);

    if (result.success && result.output?.includes('SUCCESS')) {
      return {
        success: true,
        project: projectName,
        environment,
        path: envPath,
        masterCreated: result.output.includes('MASTER_CREATED'),
        timestamp,
      };
    }

    return { success: false, error: 'Failed to initialize ENV', details: result.error };
  },

  // ============================================================================
  // ENV 푸시 (팀원이 ENV 업데이트 - current.env만 수정 가능)
  // ============================================================================
  async env_push({ projectName, environment = 'production', envContent }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    if (!envContent) {
      return { success: false, error: 'envContent is required' };
    }

    const envPath = `${ENV_BACKUP_PATH}/${projectName}/${environment}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // master.env 존재 확인 (초기화 필요)
    const checkMaster = await execCommand('backup', `test -f "${envPath}/master.env" && echo "EXISTS" || echo "NOT_FOUND"`);

    if (!checkMaster.output?.includes('EXISTS')) {
      return {
        success: false,
        error: 'ENV not initialized. Run env_init first.',
        hint: `Use env_init to create initial ENV for ${projectName}/${environment}`,
      };
    }

    // 보호된 변수 체크 (master.env와 비교)
    const protectedVars = ['DATABASE_URL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'REDIS_URL'];

    // current.env 업데이트 (master.env의 보호 변수 유지)
    const pushCmd = `
      # 기존 current.env 백업
      if [ -f "${envPath}/current.env" ]; then
        cp "${envPath}/current.env" "${envPath}/${timestamp}.env"
      fi

      # 새 ENV 파일 생성 (보호 변수는 master에서 가져옴)
      cat > "${envPath}/current.env.new" << 'ENVEOF'
${envContent}
ENVEOF

      # 보호 변수 master에서 복원
      ${protectedVars.map(v => `
      MASTER_VAL=$(grep "^${v}=" "${envPath}/master.env" 2>/dev/null || echo "")
      if [ -n "$MASTER_VAL" ]; then
        # 새 파일에서 해당 줄 제거 후 master 값 추가
        grep -v "^${v}=" "${envPath}/current.env.new" > "${envPath}/current.env.tmp" || true
        echo "$MASTER_VAL" >> "${envPath}/current.env.tmp"
        mv "${envPath}/current.env.tmp" "${envPath}/current.env.new"
      fi
      `).join('\n')}

      mv "${envPath}/current.env.new" "${envPath}/current.env"
      chmod 600 "${envPath}/current.env"

      echo "SUCCESS"
    `;

    const result = await execCommand('backup', pushCmd);

    if (result.success && result.output?.includes('SUCCESS')) {
      return {
        success: true,
        project: projectName,
        environment,
        path: envPath,
        timestamp,
        note: 'Protected variables (DATABASE_URL, POSTGRES_*, REDIS_URL) preserved from master.env',
      };
    }

    return { success: false, error: 'Failed to push ENV', details: result.error };
  },

  // ============================================================================
  // 도메인 관리 (PowerDNS + Caddy 연동)
  // ============================================================================

  /**
   * 도메인 설정 (DNS + Caddy + SSL)
   * - 프로젝트명.codeb.kr (production)
   * - 프로젝트명-staging.codeb.kr (staging)
   */
  async domain_setup({ projectName, environment = 'production', customDomain = null, targetPort = null }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    // 도메인 결정
    let domain;
    if (customDomain) {
      domain = customDomain;
    } else if (environment === 'production') {
      domain = `${projectName}.codeb.kr`;
    } else {
      domain = `${projectName}-${environment}.codeb.kr`;
    }

    // 포트 결정 (SSOT에서 조회 또는 파라미터 사용)
    let port = targetPort;
    if (!port) {
      const portResult = await execCommand('app',
        `jq -r '.projects["${projectName}"].environments.${environment}.port // empty' ${SSOT_PATH} 2>/dev/null`
      );
      port = portResult.output?.trim();
    }

    if (!port) {
      // 기본 포트 할당 (해시 기반)
      const hash = projectName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      port = environment === 'production' ? 4000 + (hash % 500) : 4500 + (hash % 500);
    }

    // Domain Manager API 호출 (서버 내부 API)
    const setupCmd = `
      curl -s -X POST http://localhost:3103/domain/setup \\
        -H "Content-Type: application/json" \\
        -d '{
          "projectName": "${projectName}",
          "targetPort": ${port},
          "subdomain": ${customDomain ? 'null' : `"${domain.replace('.codeb.kr', '')}"`},
          "customDomain": ${customDomain ? `"${customDomain}"` : 'null'},
          "environment": "${environment}",
          "enableSSL": true
        }'
    `;

    const result = await execCommand('app', setupCmd, 60000);

    if (result.success) {
      try {
        const response = JSON.parse(result.output);
        if (response.success) {
          // SSOT 업데이트 (도메인 정보 추가)
          await execCommand('app', `
            jq '.projects["${projectName}"].environments.${environment}.domain = "${domain}"' ${SSOT_PATH} > ${SSOT_PATH}.tmp && mv ${SSOT_PATH}.tmp ${SSOT_PATH}
          `);

          return {
            success: true,
            domain,
            port,
            environment,
            ssl: response.ssl,
            url: `https://${domain}`,
          };
        }
        return { success: false, error: response.error || 'Domain setup failed' };
      } catch {
        return { success: false, error: 'Failed to parse Domain Manager response', raw: result.output };
      }
    }

    return { success: false, error: result.error || 'Domain setup failed' };
  },

  /**
   * 도메인 상태 조회
   */
  async domain_status({ domain }) {
    if (!domain) {
      return { success: false, error: 'domain is required' };
    }

    const result = await execCommand('app', `
      curl -s http://localhost:3103/domain/status/${domain}
    `);

    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return { raw: result.output };
      }
    }
    return { error: result.error };
  },

  /**
   * 도메인 목록 조회
   */
  async domain_list() {
    const result = await execCommand('app', `
      curl -s http://localhost:3103/domains
    `);

    if (result.success) {
      try {
        return JSON.parse(result.output);
      } catch {
        return { raw: result.output };
      }
    }
    return { error: result.error };
  },

  /**
   * 커스텀 도메인 연결
   * - 외부 도메인을 프로젝트에 연결
   * - DNS는 사용자가 직접 설정 (CNAME → app.codeb.kr)
   */
  async domain_connect({ projectName, customDomain, environment = 'production' }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }
    if (!customDomain) {
      return { success: false, error: 'customDomain is required' };
    }

    // 도메인 형식 검증
    const domainRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(customDomain)) {
      return { success: false, error: 'Invalid domain format' };
    }

    // 포트 조회
    const portResult = await execCommand('app',
      `jq -r '.projects["${projectName}"].environments.${environment}.port // empty' ${SSOT_PATH} 2>/dev/null`
    );
    const port = portResult.output?.trim();

    if (!port) {
      return { success: false, error: `Project '${projectName}' not found or no port assigned` };
    }

    // Domain Manager API로 커스텀 도메인 설정 (DNS 없이 Caddy만)
    const setupCmd = `
      curl -s -X POST http://localhost:3103/domain/setup \\
        -H "Content-Type: application/json" \\
        -d '{
          "projectName": "${projectName}",
          "targetPort": ${port},
          "customDomain": "${customDomain}",
          "environment": "${environment}",
          "enableSSL": true
        }'
    `;

    const result = await execCommand('app', setupCmd, 60000);

    if (result.success) {
      try {
        const response = JSON.parse(result.output);
        if (response.success) {
          // SSOT에 커스텀 도메인 추가
          await execCommand('app', `
            jq '.projects["${projectName}"].environments.${environment}.customDomains += ["${customDomain}"]' ${SSOT_PATH} > ${SSOT_PATH}.tmp && mv ${SSOT_PATH}.tmp ${SSOT_PATH}
          `);

          return {
            success: true,
            domain: customDomain,
            project: projectName,
            environment,
            port,
            url: `https://${customDomain}`,
            dnsRequired: {
              type: 'CNAME',
              name: customDomain,
              value: 'app.codeb.kr',
              note: 'Point your domain DNS to app.codeb.kr (CNAME) or 158.247.203.55 (A record)',
            },
          };
        }
        return { success: false, error: response.error || 'Custom domain setup failed' };
      } catch {
        return { success: false, error: 'Failed to parse response', raw: result.output };
      }
    }

    return { success: false, error: result.error || 'Custom domain setup failed' };
  },

  // ============================================================================
  // 워크플로우 스캔 및 업그레이드 (기존 프로젝트용)
  // ============================================================================
  async workflow_scan({ projectName, gitRepo, autoFix = false }) {
    if (!projectName && !gitRepo) {
      return { success: false, error: 'projectName or gitRepo is required' };
    }

    const results = {
      projectName,
      gitRepo,
      scanned: true,
      issues: [],
      recommendations: [],
      workflow: null,
    };

    // 1. 기존 워크플로우 분석을 위한 패턴
    const oldPatterns = {
      directSSH: /ssh\s+.*@.*codeb\.kr/gi,
      oldApiUrl: /app\.codeb\.kr:9100/gi,
      socketIO: /socket\.io|socket-io/gi,
      noSlotDeploy: /podman\s+run.*--name\s+\$\{?project/gi,
      directPodman: /podman\s+(rm|stop|kill)/gi,
      noGracePeriod: /(deploy|rollback)(?!.*grace)/gi,
    };

    // 2. 권장 워크플로우 생성
    const newWorkflow = generateBlueGreenWorkflow(projectName);

    results.workflow = {
      version: VERSION,
      type: 'blue-green-slot',
      features: [
        'Blue-Green Slot deployment (zero-downtime)',
        'Preview URL before promote',
        '48h grace period for rollback',
        'Auto-promote on PR merge',
        'HTTPS API endpoint (api.codeb.kr)',
      ],
      content: newWorkflow,
    };

    // 3. 스캔 결과 요약
    results.issues = [
      {
        severity: 'info',
        message: 'Workflow scan completed',
        detail: `Generated Blue-Green Slot workflow for v${VERSION}`,
      },
    ];

    results.recommendations = [
      '1. Replace .github/workflows/deploy.yml with the generated workflow',
      '2. Add CODEB_API_KEY to GitHub Secrets (Settings → Secrets → Actions)',
      '3. Test with staging branch first: git push origin develop',
      '4. Production deploy: push to main → auto-deploy to slot → verify preview → merge PR to promote',
    ];

    results.nextSteps = {
      manual: [
        `Copy the workflow content to .github/workflows/deploy.yml`,
        `Set GitHub Secret: CODEB_API_KEY=codeb_dev_xxxxx`,
        `Push to develop branch to test staging deployment`,
      ],
      cli: [
        `we workflow update ${projectName}  # Apply workflow automatically`,
        `we deploy ${projectName} --environment staging  # Test deploy`,
        `we slot status ${projectName}  # Check slot status`,
      ],
    };

    return {
      success: true,
      ...results,
    };
  },

  // ============================================================================
  // 워크플로우 업데이트 (기존 프로젝트에 새 워크플로우 적용)
  // ============================================================================
  async workflow_update({ projectName, dryRun = true }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    // SSOT에서 프로젝트 정보 조회
    const projectResult = await execCommand('app', `jq -r '.projects["${projectName}"]' ${SSOT_PATH} 2>/dev/null`);

    if (!projectResult.success || projectResult.output === 'null' || !projectResult.output) {
      return { success: false, error: `Project '${projectName}' not found in SSOT` };
    }

    let project;
    try {
      project = JSON.parse(projectResult.output);
    } catch {
      return { success: false, error: 'Failed to parse project data' };
    }

    // 새 워크플로우 생성
    const newWorkflow = generateBlueGreenWorkflow(projectName);

    // Dockerfile 생성 (타입 기반)
    const type = project.type || 'nextjs';
    const dockerfile = generateDockerfile(type);

    const result = {
      success: true,
      projectName,
      dryRun,
      files: {
        '.github/workflows/deploy.yml': {
          action: dryRun ? 'would_create' : 'created',
          content: newWorkflow,
        },
        'Dockerfile': {
          action: dryRun ? 'would_create' : 'created',
          content: dockerfile,
        },
      },
      secretsRequired: {
        CODEB_API_KEY: 'Your CodeB API key (codeb_dev_xxxxx)',
        GITHUB_TOKEN: 'Auto-provided by GitHub Actions',
      },
    };

    if (dryRun) {
      result.message = 'Dry run - no files created. Set dryRun=false to apply changes.';
      result.instructions = [
        '1. Review the generated workflow and Dockerfile',
        '2. Call workflow_update with dryRun=false to apply',
        '3. Or manually copy the content to your repository',
      ];
    } else {
      result.message = 'Workflow files generated. Copy them to your repository.';
      result.instructions = [
        '1. Copy .github/workflows/deploy.yml to your repo',
        '2. Copy/update Dockerfile if needed',
        '3. Add CODEB_API_KEY to GitHub Secrets',
        '4. Push to trigger deployment',
      ];
    }

    return result;
  },

  // ============================================================================
  // API 접근 로그 조회
  // ============================================================================

  /**
   * API 접근 통계 조회
   */
  async api_access_stats({ days = 7 }) {
    return getApiAccessStats(days);
  },

  /**
   * 활성 사용자 조회
   */
  async api_active_users({ hours = 24 }) {
    return getActiveUsers(hours);
  },

  /**
   * API 키 목록 조회 (admin 전용)
   */
  async api_keys_list() {
    try {
      const result = await execCommand('app', `cat ${API_KEYS_PATH} 2>/dev/null || echo '{}'`);
      if (!result.success) {
        return { success: false, error: 'Failed to read API keys' };
      }

      const keysData = JSON.parse(result.output);
      const keysList = keysData.keys?.map(key => {
        const info = keysData.roles?.[key] || {};
        return {
          key: key.substring(0, 20) + '...',  // 키 마스킹
          role: info.role || 'unknown',
          name: info.name || 'Unknown',
          createdAt: info.createdAt,
          description: info.description,
        };
      }) || [];

      return {
        success: true,
        version: keysData.version,
        totalKeys: keysList.length,
        keys: keysList,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

// ============================================================================
// Tool Aliases (호환성 유지)
// - deploy_project → deploy
// - slot_promote → promote
// - slot_status → slot_status (기존)
// - slot_list → slot_list (기존)
// ============================================================================

toolHandlers.deploy_project = toolHandlers.deploy;
toolHandlers.slot_promote = toolHandlers.promote;

// ============================================================================
// Blue-Green 워크플로우 생성 헬퍼
// ============================================================================

function generateBlueGreenWorkflow(projectName) {
  return `name: Deploy ${projectName}

# Blue-Green Slot 기반 무중단 배포 (v\${VERSION})
# - develop → staging 배포 (Preview URL)
# - main → production 배포 (Preview URL) → 수동 promote
# - PR merge → 자동 promote

on:
  push:
    branches: [main, develop]
  pull_request:
    types: [closed]
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}
  CODEB_API: https://api.codeb.kr/api/tool

jobs:
  # 1. 이미지 빌드 및 푸시
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: \${{ steps.meta.outputs.tags }}
      image_digest: \${{ steps.build.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # 2. Slot에 배포 (Preview URL 생성)
  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    outputs:
      preview_url: \${{ steps.deploy.outputs.preview_url }}
      slot: \${{ steps.deploy.outputs.slot }}

    steps:
      - name: Deploy to Slot
        id: deploy
        run: |
          ENV=\$([[ "\${{ github.ref }}" == "refs/heads/main" ]] && echo "production" || echo "staging")

          RESPONSE=\$(curl -s -X POST "\${{ env.CODEB_API }}" \\
            -H "Content-Type: application/json" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${projectName}",
                "environment": "'\$ENV'",
                "autoPromote": false
              }
            }')

          echo "Response: \$RESPONSE"

          PREVIEW_URL=\$(echo \$RESPONSE | jq -r '.result.previewUrl // empty')
          SLOT=\$(echo \$RESPONSE | jq -r '.result.slot // empty')

          echo "preview_url=\$PREVIEW_URL" >> \$GITHUB_OUTPUT
          echo "slot=\$SLOT" >> \$GITHUB_OUTPUT

          echo "## 🚀 Deployed to Slot \$SLOT" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "**Preview URL:** \$PREVIEW_URL" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "Run \\\`we promote ${projectName}\\\` to switch traffic." >> \$GITHUB_STEP_SUMMARY

  # 3. PR Merge 시 자동 Promote (main 브랜치)
  promote:
    runs-on: ubuntu-latest
    if: github.event.pull_request.merged == true && github.event.pull_request.base.ref == 'main'

    steps:
      - name: Promote to Production
        run: |
          RESPONSE=\$(curl -s -X POST "\${{ env.CODEB_API }}" \\
            -H "Content-Type: application/json" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -d '{
              "tool": "promote",
              "params": {
                "projectName": "${projectName}",
                "environment": "production"
              }
            }')

          echo "Response: \$RESPONSE"

          DOMAIN=\$(echo \$RESPONSE | jq -r '.result.domain // empty')
          SLOT=\$(echo \$RESPONSE | jq -r '.result.activeSlot // empty')
          GRACE=\$(echo \$RESPONSE | jq -r '.result.gracePeriod.hoursRemaining // 48')

          echo "## ✅ Promoted to Production" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "**Active Slot:** \$SLOT" >> \$GITHUB_STEP_SUMMARY
          echo "**URL:** https://\$DOMAIN" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "⏱️ Rollback available for \$GRACE hours" >> \$GITHUB_STEP_SUMMARY
`;
}

function generateDockerfile(type) {
  const dockerfiles = {
    nextjs: `# CodeB Auto-Generated Dockerfile - Next.js (v${VERSION})
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]`,

    nodejs: `# CodeB Auto-Generated Dockerfile - Node.js (v${VERSION})
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build || true

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app .
EXPOSE 3000
CMD ["npm", "start"]`,

    python: `# CodeB Auto-Generated Dockerfile - Python (v${VERSION})
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "main.py"]`,

    static: `# CodeB Auto-Generated Dockerfile - Static Site (v${VERSION})
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,
  };

  return dockerfiles[type] || dockerfiles.nextjs;
}

// ============================================================================
// 프로젝트 파일 생성 헬퍼
// ============================================================================

function generateProjectFiles(name, type, ports, options = {}) {
  const { database = true, redis = true } = options;

  // Dockerfile 생성
  const dockerfiles = {
    nextjs: `# CodeB Auto-Generated Dockerfile - Next.js
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]`,

    nodejs: `# CodeB Auto-Generated Dockerfile - Node.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build || true

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
COPY --from=builder /app .
EXPOSE 3000
CMD ["npm", "start"]`,

    python: `# CodeB Auto-Generated Dockerfile - Python
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "main.py"]`,

    static: `# CodeB Auto-Generated Dockerfile - Static Site
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,
  };

  // GitHub Actions 워크플로우 (Blue-Green Slot 배포)
  const workflow = `name: Deploy ${name}

# Blue-Green Slot 기반 무중단 배포
# - develop → staging 배포 (Preview URL)
# - main → production 배포 (Preview URL) → 수동 promote
# - PR merge → 자동 promote

on:
  push:
    branches: [main, develop]
  pull_request:
    types: [closed]
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}
  CODEB_API: https://api.codeb.kr/api/tool

jobs:
  # 1. 이미지 빌드 및 푸시
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: \${{ steps.meta.outputs.tags }}
      image_digest: \${{ steps.build.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # 2. Slot에 배포 (Preview URL 생성)
  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    outputs:
      preview_url: \${{ steps.deploy.outputs.preview_url }}
      slot: \${{ steps.deploy.outputs.slot }}

    steps:
      - name: Deploy to Slot
        id: deploy
        run: |
          ENV=\$([[ "\${{ github.ref }}" == "refs/heads/main" ]] && echo "production" || echo "staging")

          RESPONSE=\$(curl -s -X POST "\${{ env.CODEB_API }}" \\
            -H "Content-Type: application/json" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${name}",
                "environment": "'\$ENV'",
                "autoPromote": false
              }
            }')

          echo "Response: \$RESPONSE"

          PREVIEW_URL=\$(echo \$RESPONSE | jq -r '.result.previewUrl // empty')
          SLOT=\$(echo \$RESPONSE | jq -r '.result.slot // empty')

          echo "preview_url=\$PREVIEW_URL" >> \$GITHUB_OUTPUT
          echo "slot=\$SLOT" >> \$GITHUB_OUTPUT

          echo "## 🚀 Deployed to Slot \$SLOT" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "**Preview URL:** \$PREVIEW_URL" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "Run \\\`promote\\\` to switch traffic to this deployment." >> \$GITHUB_STEP_SUMMARY

  # 3. PR Merge 시 자동 Promote (main 브랜치)
  promote:
    runs-on: ubuntu-latest
    if: github.event.pull_request.merged == true && github.event.pull_request.base.ref == 'main'

    steps:
      - name: Promote to Production
        run: |
          RESPONSE=\$(curl -s -X POST "\${{ env.CODEB_API }}" \\
            -H "Content-Type: application/json" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -d '{
              "tool": "promote",
              "params": {
                "projectName": "${name}",
                "environment": "production"
              }
            }')

          echo "Response: \$RESPONSE"

          DOMAIN=\$(echo \$RESPONSE | jq -r '.result.domain // empty')
          SLOT=\$(echo \$RESPONSE | jq -r '.result.activeSlot // empty')

          echo "## ✅ Promoted to Production" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "**Active Slot:** \$SLOT" >> \$GITHUB_STEP_SUMMARY
          echo "**URL:** https://\$DOMAIN" >> \$GITHUB_STEP_SUMMARY
`;

  return {
    'Dockerfile': dockerfiles[type] || dockerfiles.nodejs,
    '.github/workflows/deploy.yml': workflow,
    '.env.example': `# ${name} Environment Variables
NODE_ENV=production
PORT=3000
${database ? `DATABASE_URL=postgresql://${name}_user:password@db.codeb.kr:5432/${name}` : ''}
${redis ? `REDIS_URL=redis://db.codeb.kr:6379/0` : ''}
`,
  };
}

// ============================================================================
// Express 서버
// ============================================================================

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Client');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 인증 미들웨어
app.use('/api', (req, res, next) => {
  // health 엔드포인트는 인증 불필요
  if (req.path === '/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  const { valid, role } = verifyApiKey(apiKey);

  if (!valid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API Key',
      hint: 'Set X-API-Key header with codeb_{role}_{token} format',
    });
  }

  req.apiRole = role;
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    version: VERSION,
    timestamp: new Date().toISOString(),
  });
});

// MCP Tool 호출 엔드포인트
app.post('/api/tool', async (req, res) => {
  const startTime = Date.now();

  try {
    const { tool, params = {} } = req.body;

    if (!tool) {
      logApiAccess(req, 'unknown', null, Date.now() - startTime, 'tool is required');
      return res.status(400).json({
        success: false,
        error: 'tool is required',
      });
    }

    // 권한 확인
    if (!checkPermission(req.apiRole, tool)) {
      logApiAccess(req, tool, null, Date.now() - startTime, `Permission denied: ${req.apiRole}`);
      return res.status(403).json({
        success: false,
        error: `Permission denied: ${req.apiRole} cannot use ${tool}`,
      });
    }

    // 핸들러 확인
    const handler = toolHandlers[tool];
    if (!handler) {
      logApiAccess(req, tool, null, Date.now() - startTime, `Unknown tool: ${tool}`);
      return res.status(404).json({
        success: false,
        error: `Unknown tool: ${tool}`,
        available: Object.keys(toolHandlers),
      });
    }

    // 도구 실행
    console.log(chalk.cyan(`[${new Date().toISOString()}] ${req.apiRole} called ${tool}`));
    const result = await handler(params);
    const duration = Date.now() - startTime;

    // 성공 로깅
    logApiAccess(req, tool, result, duration);

    res.json({
      success: true,
      tool,
      result,
    });

  } catch (error) {
    console.error('Tool execution error:', error);
    logApiAccess(req, req.body?.tool || 'unknown', null, Date.now() - startTime, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 사용 가능한 도구 목록
app.get('/api/tools', (req, res) => {
  const tools = Object.keys(toolHandlers).map(name => ({
    name,
    allowed: checkPermission(req.apiRole, name),
  }));

  res.json({
    success: true,
    role: req.apiRole,
    tools,
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    endpoints: ['/api/health', '/api/tool', '/api/tools'],
  });
});

// ============================================================================
// 서버 시작
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║   MCP HTTP API Server v1.0.0                  ║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════╝\n'));
  console.log(chalk.green(`✓ Server running on http://0.0.0.0:${PORT}`));
  console.log(chalk.gray(`  Health check: http://localhost:${PORT}/api/health`));
  console.log(chalk.gray(`  Tool endpoint: POST http://localhost:${PORT}/api/tool`));
  console.log(chalk.gray(`  List tools: GET http://localhost:${PORT}/api/tools\n`));
});

export default app;
