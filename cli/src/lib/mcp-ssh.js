/**
 * MCP SSH Fallback Module
 *
 * SSH 기반 폴백 통신 전용 모듈
 * - SSH 접근 확인
 * - SSH 명령 실행
 * - 폴백 명령 생성
 *
 * @module mcp-ssh
 * @version 3.0.0
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import { isBlockedServer } from './config.js';

// ============================================================================
// 상수 및 설정
// ============================================================================

export const CONNECTION_TIMEOUT = 30000; // 30초

export const FALLBACK_MODE_WARNING = `
${chalk.bgYellow.black(' ⚠️  FALLBACK MODE ')}
${chalk.yellow('MCP Server unavailable. Using SSH direct connection.')}
${chalk.gray('Changes made in fallback mode may not be synced with SSOT.')}
`;

// ============================================================================
// SSH 접근 함수
// ============================================================================

/**
 * SSH 접근 가능 여부 확인
 * 차단된 서버는 접근 거부
 */
export async function checkSSHAccess(serverHost, serverUser) {
  if (!serverHost) return false;

  // 차단된 서버 체크
  const blockCheck = isBlockedServer(serverHost);
  if (blockCheck.blocked) {
    console.log(chalk.red(`🚫 차단된 서버: ${serverHost}`));
    console.log(chalk.yellow(`   이유: ${blockCheck.reason}`));
    console.log(chalk.green(`   대안: ${blockCheck.alternative}`));
    return false;
  }

  try {
    execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes ${serverUser}@${serverHost} "echo ok"`,
      { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * SSH 직접 실행 (폴백 전용)
 */
export async function executeSSH(serverHost, serverUser, command) {
  // 차단된 서버 체크
  const blockCheck = isBlockedServer(serverHost);
  if (blockCheck.blocked) {
    throw new Error(
      `🚫 차단된 서버로의 연결 거부: ${serverHost}\n` +
      `   이유: ${blockCheck.reason}\n` +
      `   대안: ${blockCheck.alternative}\n` +
      `   설정 변경: we config init`
    );
  }

  try {
    const result = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${serverUser}@${serverHost} "${command.replace(/"/g, '\\"')}"`,
      {
        encoding: 'utf8',
        timeout: CONNECTION_TIMEOUT,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    try {
      return JSON.parse(result.trim());
    } catch {
      return { raw: result.trim() };
    }
  } catch (error) {
    throw new Error(`SSH command failed: ${error.message}`);
  }
}

// ============================================================================
// 폴백 명령 생성
// ============================================================================

/**
 * 폴백 명령 생성
 */
export function buildFallbackCommand(toolName, params) {
  const ssotPath = '/opt/codeb/registry/ssot.json';

  // 읽기 전용 작업만 폴백 지원
  switch (toolName) {
    case 'ssot_get':
      return `cat ${ssotPath} 2>/dev/null || echo '{"error": "SSOT not initialized"}'`;

    case 'ssot_get_project':
      return `jq '.projects["${params.projectId}"]' ${ssotPath} 2>/dev/null || echo 'null'`;

    case 'ssot_list_projects':
      return `jq '.projects | keys' ${ssotPath} 2>/dev/null || echo '[]'`;

    case 'full_health_check':
      return buildHealthCheckCommand();

    case 'analyze_server':
      return buildAnalyzeServerCommand(params);

    case 'list_projects':
      return `cat /opt/codeb/config/project-registry.json 2>/dev/null || echo '{"projects":{}}'`;

    default:
      throw new Error(`Tool '${toolName}' requires MCP Server. Fallback not supported.`);
  }
}

/**
 * 헬스체크 명령 생성
 */
export function buildHealthCheckCommand() {
  return `
    echo '{'
    echo '"timestamp": "'$(date -Iseconds)'",'
    echo '"server": "'$(hostname)'",'
    echo '"resources": {'

    # CPU
    cpu=$(vmstat 1 2 | tail -1 | awk '{print 100 - $15}')
    echo '"cpu": {"usage": '$cpu'},'

    # Memory
    mem=$(free -m | awk '/Mem:/ {printf "%.1f", $3/$2*100}')
    mem_used=$(free -h | awk '/Mem:/ {print $3}')
    mem_total=$(free -h | awk '/Mem:/ {print $2}')
    echo '"memory": {"usage": '$mem', "used": "'$mem_used'", "total": "'$mem_total'"},'

    # Disk
    disk=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
    disk_used=$(df -h / | awk 'NR==2 {print $3}')
    disk_total=$(df -h / | awk 'NR==2 {print $2}')
    echo '"disk": {"usage": '$disk', "used": "'$disk_used'", "total": "'$disk_total'"}'

    echo '},'

    # Services
    echo '"services": {'
    caddy_status=$(systemctl is-active caddy 2>/dev/null || echo "inactive")
    echo '"caddy": {"running": '$([[ "$caddy_status" == "active" ]] && echo "true" || echo "false")', "status": "'$caddy_status'"}'
    echo '}'

    echo '}'
  `.trim();
}

/**
 * 서버 분석 명령 생성
 */
export function buildAnalyzeServerCommand(params) {
  const parts = ['echo "{"'];
  parts.push('echo \'"timestamp": "\'$(date -Iseconds)\'"\'');

  if (params.includeContainers !== false) {
    parts.push(`
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
    `);
  }

  parts.push('echo "}"');
  return parts.join('\n');
}

/**
 * SSH 폴백 도구 호출
 */
export async function callToolFallback(serverHost, serverUser, toolName, params = {}, showWarning = true) {
  if (!serverHost) {
    throw new Error('Server configuration not found. Run "we config init" first.');
  }

  // 차단된 서버 체크
  const blockCheck = isBlockedServer(serverHost);
  if (blockCheck.blocked) {
    throw new Error(
      `🚫 차단된 서버로의 연결 거부: ${serverHost}\n` +
      `   이유: ${blockCheck.reason}\n` +
      `   대안: ${blockCheck.alternative}\n` +
      `   설정 변경: we config init`
    );
  }

  // 폴백 경고 (첫 번째 호출 시만)
  if (showWarning) {
    console.log(FALLBACK_MODE_WARNING);
  }

  const command = buildFallbackCommand(toolName, params);
  return executeSSH(serverHost, serverUser, command);
}

// ============================================================================
// Exports
// ============================================================================

export default {
  checkSSHAccess,
  executeSSH,
  buildFallbackCommand,
  buildHealthCheckCommand,
  buildAnalyzeServerCommand,
  callToolFallback,
  CONNECTION_TIMEOUT,
  FALLBACK_MODE_WARNING,
};
