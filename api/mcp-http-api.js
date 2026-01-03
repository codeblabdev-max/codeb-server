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
 * @version 1.0.0
 */

import express from 'express';
import { spawn } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// 설정
// ============================================================================

const PORT = process.env.MCP_HTTP_PORT || 9100;
const API_KEYS_PATH = process.env.API_KEYS_PATH || '/opt/codeb/config/api-keys.json';
const SSOT_PATH = '/opt/codeb/registry/ssot.json';
const ENV_BACKUP_PATH = '/opt/codeb/env-backup';

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
      'deploy', 'ssot_get', 'ssot_get_project', 'ssot_list_projects',
      'full_health_check', 'analyze_server', 'list_projects',
      'check_domain_status', 'env_scan', 'env_pull',
    ],
    view: [
      'ssot_get', 'ssot_get_project', 'ssot_list_projects',
      'full_health_check', 'list_projects',
    ],
  };

  const allowed = permissions[role] || [];
  return allowed.includes('*') || allowed.includes(tool);
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

  // 배포
  async deploy({ projectName, environment = 'production', image, skipHealthcheck = false }) {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    const containerName = `${projectName}-${environment}`;
    const server = environment === 'preview' ? 'backup' : 'app';
    const deployImage = image || `ghcr.io/codeblabdev-max/${projectName}:latest`;

    // 포트 결정 (SSOT에서 조회 또는 기본값)
    const portResult = await execCommand(server,
      `jq -r '.projects["${projectName}"].environments.${environment}.port // empty' ${SSOT_PATH} 2>/dev/null`
    );
    const port = portResult.output?.trim() || (environment === 'production' ? 4000 : 4500);

    const deployCmd = `
      set -e

      # 이미지 풀
      echo "[$(date)] Pulling image: ${deployImage}"
      podman pull ${deployImage}

      # 기존 컨테이너 중지
      echo "[$(date)] Stopping existing container..."
      podman stop ${containerName} 2>/dev/null || true
      podman rm ${containerName} 2>/dev/null || true

      # ENV 파일 확인
      ENV_FILE="${ENV_BACKUP_PATH}/${projectName}/${environment}/current.env"
      if [ ! -f "$ENV_FILE" ]; then
        echo "[$(date)] Warning: ENV file not found"
        ENV_FILE=""
      fi

      # 컨테이너 실행
      echo "[$(date)] Starting container..."
      if [ -n "$ENV_FILE" ]; then
        podman run -d \\
          --name ${containerName} \\
          --network codeb-main \\
          -p ${port}:3000 \\
          --restart always \\
          --env-file "$ENV_FILE" \\
          ${deployImage}
      else
        podman run -d \\
          --name ${containerName} \\
          --network codeb-main \\
          -p ${port}:3000 \\
          --restart always \\
          -e NODE_ENV=${environment} \\
          -e PORT=3000 \\
          ${deployImage}
      fi

      ${skipHealthcheck ? 'echo "Skipping healthcheck"' : `
      sleep 5
      HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/api/health 2>/dev/null || echo "000")
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
      return {
        success: true,
        project: projectName,
        environment,
        image: deployImage,
        port,
        container: containerName,
        server,
      };
    }

    return {
      success: false,
      error: result.error || 'Deployment failed',
      output: result.output,
    };
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

  // 롤백
  async rollback({ projectName, environment = 'production', targetVersion }) {
    const containerName = `${projectName}-${environment}`;
    const server = environment === 'preview' ? 'backup' : 'app';

    // 이전 이미지 목록 조회
    const historyResult = await execCommand(server,
      `podman images --format '{{.Repository}}:{{.Tag}}' | grep ${projectName} | head -5`
    );

    if (!historyResult.success || !historyResult.output) {
      return { success: false, error: 'No images found for rollback' };
    }

    const images = historyResult.output.split('\n').filter(Boolean);
    const targetImage = targetVersion
      ? images.find(img => img.includes(targetVersion))
      : images[1]; // 현재 다음 이미지

    if (!targetImage) {
      return { success: false, error: 'Target image not found', available: images };
    }

    // 롤백 실행
    return this.deploy({ projectName, environment, image: targetImage });
  },
};

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
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// MCP Tool 호출 엔드포인트
app.post('/api/tool', async (req, res) => {
  try {
    const { tool, params = {} } = req.body;

    if (!tool) {
      return res.status(400).json({
        success: false,
        error: 'tool is required',
      });
    }

    // 권한 확인
    if (!checkPermission(req.apiRole, tool)) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: ${req.apiRole} cannot use ${tool}`,
      });
    }

    // 핸들러 확인
    const handler = toolHandlers[tool];
    if (!handler) {
      return res.status(404).json({
        success: false,
        error: `Unknown tool: ${tool}`,
        available: Object.keys(toolHandlers),
      });
    }

    // 도구 실행
    console.log(chalk.cyan(`[${new Date().toISOString()}] ${req.apiRole} called ${tool}`));
    const result = await handler(params);

    res.json({
      success: true,
      tool,
      result,
    });

  } catch (error) {
    console.error('Tool execution error:', error);
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
