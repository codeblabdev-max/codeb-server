#!/usr/bin/env node
/**
 * CodeB Watchdog Monitor
 *
 * 실시간 파일/컨테이너 변경 감시 및 자동 복구 시스템
 *
 * Features:
 * - 파일 시스템 감시 (inotify)
 * - 컨테이너 상태 감시 (podman events)
 * - 자동 복구 (롤백/재생성)
 * - 삭제 방지 (immutable 속성)
 * - 알림 (Slack/Discord)
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const net = require('net');
const crypto = require('crypto');

// ============================================================================
// 설정
// ============================================================================

const CONFIG = {
  // 감시 대상 디렉토리
  watchDirs: [
    '/opt/codeb/projects',
    '/opt/codeb/security',
    '/etc/codeb',
  ],

  // 중요 파일 (해시 검증)
  criticalFiles: [
    '/opt/codeb/security/daemon/protection-daemon.js',
    '/opt/codeb/security/mcp-proxy/mcp-proxy-gateway.js',
    '/etc/codeb/protection-rules.json',
  ],

  // 보호 컨테이너 패턴
  protectedContainers: [
    /-production$/,
    /-prod$/,
    /^codeb-/,
    /^caddy$/,
  ],

  // 백업 디렉토리
  backupDir: '/var/lib/codeb/backups',

  // 스냅샷 디렉토리
  snapshotDir: '/var/lib/codeb/snapshots',

  // 로그 파일
  logFile: '/var/log/codeb/watchdog.log',

  // PID 파일
  pidFile: '/var/run/codeb/watchdog.pid',

  // 알림 설정
  notifications: {
    enabled: false,
    slackWebhook: process.env.SLACK_WEBHOOK_URL || '',
    discordWebhook: process.env.DISCORD_WEBHOOK_URL || '',
  },

  // 자동 복구 설정
  autoRecover: {
    enabled: true,
    maxAttempts: 3,
    delayMs: 2000,
  },

  // Protection Daemon 소켓
  protectionSocket: '/var/run/codeb/protection.sock',
};

// ============================================================================
// 파일 해시 저장소
// ============================================================================

class FileHashStore {
  constructor() {
    this.hashes = new Map();
    this.hashFile = '/var/lib/codeb/file-hashes.json';
  }

  load() {
    try {
      if (fs.existsSync(this.hashFile)) {
        const data = JSON.parse(fs.readFileSync(this.hashFile, 'utf8'));
        this.hashes = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error(`[HashStore] Load error: ${error.message}`);
    }
  }

  save() {
    try {
      const data = Object.fromEntries(this.hashes);
      fs.writeFileSync(this.hashFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`[HashStore] Save error: ${error.message}`);
    }
  }

  computeHash(filePath) {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  updateHash(filePath) {
    const hash = this.computeHash(filePath);
    if (hash) {
      this.hashes.set(filePath, {
        hash,
        updatedAt: new Date().toISOString(),
      });
      this.save();
    }
    return hash;
  }

  verifyHash(filePath) {
    const stored = this.hashes.get(filePath);
    if (!stored) return { valid: true, reason: 'no-baseline' };

    const current = this.computeHash(filePath);
    if (!current) return { valid: false, reason: 'file-missing' };

    return {
      valid: current === stored.hash,
      reason: current === stored.hash ? 'match' : 'modified',
      expected: stored.hash,
      actual: current,
    };
  }
}

// ============================================================================
// 백업 관리자
// ============================================================================

class BackupManager {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [CONFIG.backupDir, CONFIG.snapshotDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  async backupFile(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const relativePath = filePath.replace(/\//g, '_');
    const backupPath = path.join(CONFIG.backupDir, `${relativePath}.${timestamp}`);

    try {
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupPath);
        return backupPath;
      }
    } catch (error) {
      console.error(`[Backup] Failed: ${error.message}`);
    }
    return null;
  }

  async restoreFile(filePath, backupPath) {
    try {
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        return true;
      }
    } catch (error) {
      console.error(`[Restore] Failed: ${error.message}`);
    }
    return false;
  }

  getLatestBackup(filePath) {
    const relativePath = filePath.replace(/\//g, '_');
    const pattern = new RegExp(`^${relativePath}\\.`);

    try {
      const files = fs.readdirSync(CONFIG.backupDir)
        .filter(f => pattern.test(f))
        .sort()
        .reverse();

      if (files.length > 0) {
        return path.join(CONFIG.backupDir, files[0]);
      }
    } catch (error) {
      console.error(`[Backup] List error: ${error.message}`);
    }
    return null;
  }

  async createSnapshot(projectName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(CONFIG.snapshotDir, `${projectName}.${timestamp}`);

    return new Promise((resolve, reject) => {
      // 프로젝트 디렉토리 전체 백업
      const projectDir = `/opt/codeb/projects/${projectName}`;
      if (!fs.existsSync(projectDir)) {
        return resolve(null);
      }

      exec(`tar -czf "${snapshotPath}.tar.gz" -C "${projectDir}" .`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(`${snapshotPath}.tar.gz`);
        }
      });
    });
  }
}

// ============================================================================
// 컨테이너 모니터
// ============================================================================

class ContainerMonitor {
  constructor(watchdog) {
    this.watchdog = watchdog;
    this.containerStates = new Map();
    this.podmanEvents = null;
  }

  async start() {
    // 초기 상태 저장
    await this.captureCurrentState();

    // Podman events 구독
    this.subscribeToEvents();

    this.watchdog.log('info', 'Container monitor started');
  }

  stop() {
    if (this.podmanEvents) {
      this.podmanEvents.kill();
      this.podmanEvents = null;
    }
  }

  async captureCurrentState() {
    return new Promise((resolve) => {
      exec('podman ps -a --format json', (error, stdout) => {
        if (error) {
          this.watchdog.log('error', `Failed to get container state: ${error.message}`);
          return resolve();
        }

        try {
          const containers = JSON.parse(stdout || '[]');
          for (const container of containers) {
            this.containerStates.set(container.Names[0] || container.Id, {
              id: container.Id,
              name: container.Names[0],
              state: container.State,
              image: container.Image,
              capturedAt: new Date().toISOString(),
            });
          }
        } catch (e) {
          // 파싱 실패 무시
        }
        resolve();
      });
    });
  }

  subscribeToEvents() {
    // podman events --format json
    this.podmanEvents = spawn('podman', ['events', '--format', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';

    this.podmanEvents.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 마지막 불완전한 줄 보관

      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line);
            this.handleEvent(event);
          } catch (e) {
            // JSON 파싱 실패 무시
          }
        }
      }
    });

    this.podmanEvents.on('error', (error) => {
      this.watchdog.log('error', `Podman events error: ${error.message}`);
    });

    this.podmanEvents.on('exit', (code) => {
      this.watchdog.log('warn', `Podman events exited with code ${code}`);
      // 재시작
      setTimeout(() => this.subscribeToEvents(), 5000);
    });
  }

  async handleEvent(event) {
    const { Type, Action, Actor } = event;

    if (Type !== 'container') return;

    const containerName = Actor?.Attributes?.name || Actor?.ID?.substring(0, 12);

    // 보호 컨테이너인지 확인
    const isProtected = CONFIG.protectedContainers.some(pattern =>
      pattern.test(containerName)
    );

    if (!isProtected) return;

    this.watchdog.log('info', `Container event: ${Action} on ${containerName}`);

    switch (Action) {
      case 'stop':
      case 'kill':
        await this.handleContainerStopped(containerName, event);
        break;

      case 'remove':
      case 'die':
        await this.handleContainerRemoved(containerName, event);
        break;

      case 'start':
        // 정상 시작 - 상태 업데이트
        this.containerStates.set(containerName, {
          ...this.containerStates.get(containerName),
          state: 'running',
          lastStart: new Date().toISOString(),
        });
        break;
    }
  }

  async handleContainerStopped(containerName, event) {
    this.watchdog.log('warn', `Protected container stopped: ${containerName}`);

    // 알림 전송
    await this.watchdog.notify({
      level: 'warning',
      title: '⚠️ 보호 컨테이너 중지됨',
      message: `컨테이너 "${containerName}"가 중지되었습니다.`,
      container: containerName,
      action: 'stopped',
    });

    // 자동 복구 시도
    if (CONFIG.autoRecover.enabled) {
      await this.attemptRestart(containerName);
    }
  }

  async handleContainerRemoved(containerName, event) {
    this.watchdog.log('error', `Protected container removed: ${containerName}`);

    // 알림 전송
    await this.watchdog.notify({
      level: 'critical',
      title: '🚨 보호 컨테이너 삭제됨',
      message: `컨테이너 "${containerName}"가 삭제되었습니다!`,
      container: containerName,
      action: 'removed',
    });

    // 저장된 상태에서 복구 시도
    const savedState = this.containerStates.get(containerName);
    if (savedState && CONFIG.autoRecover.enabled) {
      await this.attemptRecreate(containerName, savedState);
    }
  }

  async attemptRestart(containerName) {
    for (let attempt = 1; attempt <= CONFIG.autoRecover.maxAttempts; attempt++) {
      this.watchdog.log('info', `Restart attempt ${attempt}/${CONFIG.autoRecover.maxAttempts} for ${containerName}`);

      const success = await new Promise((resolve) => {
        exec(`podman start ${containerName}`, (error) => {
          resolve(!error);
        });
      });

      if (success) {
        this.watchdog.log('info', `Successfully restarted ${containerName}`);
        await this.watchdog.notify({
          level: 'info',
          title: '✅ 컨테이너 자동 복구',
          message: `컨테이너 "${containerName}"가 자동으로 재시작되었습니다.`,
          container: containerName,
          action: 'restarted',
        });
        return true;
      }

      await new Promise(r => setTimeout(r, CONFIG.autoRecover.delayMs));
    }

    this.watchdog.log('error', `Failed to restart ${containerName} after ${CONFIG.autoRecover.maxAttempts} attempts`);
    return false;
  }

  async attemptRecreate(containerName, savedState) {
    this.watchdog.log('warn', `Attempting to recreate ${containerName} from saved state`);

    // Quadlet 파일이 있는지 확인
    const quadletFile = `/etc/containers/systemd/${containerName}.container`;
    if (fs.existsSync(quadletFile)) {
      // Systemd 서비스 재시작
      return new Promise((resolve) => {
        exec(`systemctl restart ${containerName}`, (error) => {
          if (!error) {
            this.watchdog.log('info', `Recreated ${containerName} via systemd`);
            this.watchdog.notify({
              level: 'info',
              title: '✅ 컨테이너 자동 재생성',
              message: `컨테이너 "${containerName}"가 Quadlet에서 재생성되었습니다.`,
              container: containerName,
              action: 'recreated',
            });
          }
          resolve(!error);
        });
      });
    }

    // docker-compose 파일 확인
    const projectName = containerName.split('-')[0];
    const composeFile = `/opt/codeb/projects/${projectName}/docker-compose.yml`;
    if (fs.existsSync(composeFile)) {
      return new Promise((resolve) => {
        exec(`cd /opt/codeb/projects/${projectName} && podman-compose up -d`, (error) => {
          if (!error) {
            this.watchdog.log('info', `Recreated ${containerName} via compose`);
          }
          resolve(!error);
        });
      });
    }

    return false;
  }
}

// ============================================================================
// 파일 시스템 감시자
// ============================================================================

class FileWatcher {
  constructor(watchdog) {
    this.watchdog = watchdog;
    this.watchers = new Map();
    this.hashStore = new FileHashStore();
  }

  async start() {
    this.hashStore.load();

    // 중요 파일 해시 초기화
    for (const filePath of CONFIG.criticalFiles) {
      if (fs.existsSync(filePath)) {
        this.hashStore.updateHash(filePath);
      }
    }

    // 디렉토리 감시 시작
    for (const dir of CONFIG.watchDirs) {
      if (fs.existsSync(dir)) {
        this.watchDirectory(dir);
      }
    }

    this.watchdog.log('info', 'File watcher started');
  }

  stop() {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  watchDirectory(dirPath) {
    // Linux에서는 recursive가 지원되지 않으므로 수동으로 하위 디렉토리 감시
    this.watchSingleDir(dirPath);
    this.watchSubdirectories(dirPath);
  }

  watchSingleDir(dirPath) {
    try {
      const watcher = fs.watch(dirPath, (eventType, filename) => {
        if (filename) {
          const fullPath = path.join(dirPath, filename);
          this.handleFileEvent(eventType, fullPath);

          // 새 디렉토리가 생성되면 감시 추가
          if (eventType === 'rename' && fs.existsSync(fullPath)) {
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                this.watchSingleDir(fullPath);
              }
            } catch (e) {
              // 파일이 빠르게 삭제된 경우 무시
            }
          }
        }
      });

      watcher.on('error', (error) => {
        this.watchdog.log('error', `Watch error on ${dirPath}: ${error.message}`);
      });

      this.watchers.set(dirPath, watcher);
      this.watchdog.log('debug', `Watching: ${dirPath}`);
    } catch (error) {
      this.watchdog.log('error', `Failed to watch ${dirPath}: ${error.message}`);
    }
  }

  watchSubdirectories(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subDir = path.join(dirPath, entry.name);
          this.watchSingleDir(subDir);
          this.watchSubdirectories(subDir);
        }
      }
    } catch (error) {
      // 디렉토리 읽기 실패 무시
    }
  }

  async handleFileEvent(eventType, filePath) {
    // 무시할 파일
    if (filePath.includes('node_modules') || filePath.endsWith('.log')) {
      return;
    }

    // 중요 파일 여부 확인
    const isCritical = CONFIG.criticalFiles.includes(filePath);

    if (eventType === 'rename') {
      // 파일이 삭제되었는지 확인
      if (!fs.existsSync(filePath)) {
        this.watchdog.log('warn', `File deleted: ${filePath}`);

        if (isCritical) {
          await this.handleCriticalFileDeletion(filePath);
        }
      } else {
        // 새 파일 생성
        this.watchdog.log('debug', `File created: ${filePath}`);
        if (isCritical) {
          this.hashStore.updateHash(filePath);
        }
      }
    } else if (eventType === 'change') {
      this.watchdog.log('debug', `File modified: ${filePath}`);

      if (isCritical) {
        await this.handleCriticalFileModification(filePath);
      }
    }
  }

  async handleCriticalFileDeletion(filePath) {
    this.watchdog.log('error', `Critical file deleted: ${filePath}`);

    // 알림 전송
    await this.watchdog.notify({
      level: 'critical',
      title: '🚨 중요 파일 삭제됨',
      message: `파일 "${filePath}"가 삭제되었습니다!`,
      file: filePath,
      action: 'deleted',
    });

    // 백업에서 복구
    if (CONFIG.autoRecover.enabled) {
      const backupPath = this.watchdog.backupManager.getLatestBackup(filePath);
      if (backupPath) {
        const restored = await this.watchdog.backupManager.restoreFile(filePath, backupPath);
        if (restored) {
          this.watchdog.log('info', `Restored ${filePath} from backup`);
          await this.watchdog.notify({
            level: 'info',
            title: '✅ 파일 자동 복구',
            message: `파일 "${filePath}"가 백업에서 복구되었습니다.`,
            file: filePath,
            action: 'restored',
          });
        }
      }
    }
  }

  async handleCriticalFileModification(filePath) {
    const verification = this.hashStore.verifyHash(filePath);

    if (!verification.valid && verification.reason === 'modified') {
      this.watchdog.log('warn', `Critical file modified: ${filePath}`);

      // 변경 전 백업
      await this.watchdog.backupManager.backupFile(filePath);

      // 알림 전송
      await this.watchdog.notify({
        level: 'warning',
        title: '⚠️ 중요 파일 수정됨',
        message: `파일 "${filePath}"가 수정되었습니다.`,
        file: filePath,
        action: 'modified',
        expectedHash: verification.expected,
        actualHash: verification.actual,
      });

      // 해시 업데이트 (새 버전을 baseline으로)
      // 복구가 필요하면 수동으로 진행
      this.hashStore.updateHash(filePath);
    }
  }
}

// ============================================================================
// 잠금 관리자 (Immutable 속성)
// ============================================================================

class LockManager {
  constructor(watchdog) {
    this.watchdog = watchdog;
    this.lockedPaths = new Set();
  }

  async lockFile(filePath) {
    return new Promise((resolve) => {
      // chattr +i로 immutable 속성 설정
      exec(`chattr +i "${filePath}"`, (error) => {
        if (!error) {
          this.lockedPaths.add(filePath);
          this.watchdog.log('info', `Locked file: ${filePath}`);
        }
        resolve(!error);
      });
    });
  }

  async unlockFile(filePath) {
    return new Promise((resolve) => {
      exec(`chattr -i "${filePath}"`, (error) => {
        if (!error) {
          this.lockedPaths.delete(filePath);
          this.watchdog.log('info', `Unlocked file: ${filePath}`);
        }
        resolve(!error);
      });
    });
  }

  async lockDirectory(dirPath) {
    return new Promise((resolve) => {
      exec(`chattr +i "${dirPath}" && chattr -R +i "${dirPath}"`, (error) => {
        if (!error) {
          this.lockedPaths.add(dirPath);
          this.watchdog.log('info', `Locked directory: ${dirPath}`);
        }
        resolve(!error);
      });
    });
  }

  async lockCriticalFiles() {
    for (const filePath of CONFIG.criticalFiles) {
      if (fs.existsSync(filePath)) {
        await this.lockFile(filePath);
      }
    }
  }

  async unlockAll() {
    for (const path of this.lockedPaths) {
      await this.unlockFile(path);
    }
  }
}

// ============================================================================
// 알림 관리자
// ============================================================================

class NotificationManager {
  constructor(watchdog) {
    this.watchdog = watchdog;
  }

  async send(notification) {
    if (!CONFIG.notifications.enabled) return;

    const promises = [];

    if (CONFIG.notifications.slackWebhook) {
      promises.push(this.sendSlack(notification));
    }

    if (CONFIG.notifications.discordWebhook) {
      promises.push(this.sendDiscord(notification));
    }

    await Promise.allSettled(promises);
  }

  async sendSlack(notification) {
    const https = require('https');
    const url = new URL(CONFIG.notifications.slackWebhook);

    const color = {
      info: '#36a64f',
      warning: '#ffcc00',
      critical: '#ff0000',
    }[notification.level] || '#808080';

    const payload = JSON.stringify({
      attachments: [{
        color,
        title: notification.title,
        text: notification.message,
        fields: Object.entries(notification)
          .filter(([key]) => !['level', 'title', 'message'].includes(key))
          .map(([key, value]) => ({
            title: key,
            value: String(value),
            short: true,
          })),
        ts: Math.floor(Date.now() / 1000),
      }],
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  async sendDiscord(notification) {
    const https = require('https');
    const url = new URL(CONFIG.notifications.discordWebhook);

    const color = {
      info: 0x36a64f,
      warning: 0xffcc00,
      critical: 0xff0000,
    }[notification.level] || 0x808080;

    const payload = JSON.stringify({
      embeds: [{
        title: notification.title,
        description: notification.message,
        color,
        fields: Object.entries(notification)
          .filter(([key]) => !['level', 'title', 'message'].includes(key))
          .map(([key, value]) => ({
            name: key,
            value: String(value),
            inline: true,
          })),
        timestamp: new Date().toISOString(),
      }],
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        resolve(res.statusCode === 204);
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

// ============================================================================
// 메인 Watchdog
// ============================================================================

class Watchdog {
  constructor() {
    this.backupManager = new BackupManager();
    this.containerMonitor = new ContainerMonitor(this);
    this.fileWatcher = new FileWatcher(this);
    this.lockManager = new LockManager(this);
    this.notificationManager = new NotificationManager(this);
    this.startTime = Date.now();
    this.stats = {
      filesMonitored: 0,
      containersMonitored: 0,
      eventsProcessed: 0,
      alertsSent: 0,
      autoRecoveries: 0,
    };
  }

  async start() {
    this.ensureDirectories();
    this.writePidFile();

    this.log('info', '╔═══════════════════════════════════════════════════════════╗');
    this.log('info', '║        CodeB Watchdog Monitor Starting...                 ║');
    this.log('info', '╚═══════════════════════════════════════════════════════════╝');

    // 컴포넌트 시작
    await this.containerMonitor.start();
    await this.fileWatcher.start();

    // 중요 파일 잠금 (선택적)
    // await this.lockManager.lockCriticalFiles();

    // 초기 백업
    await this.createInitialBackups();

    // Protection Daemon 연결 확인
    await this.checkProtectionDaemon();

    // 시그널 핸들러
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());

    this.log('info', 'Watchdog is now monitoring');

    // 상태 보고 인터벌
    setInterval(() => this.reportStatus(), 60000);
  }

  async shutdown() {
    this.log('info', 'Shutting down watchdog...');

    this.containerMonitor.stop();
    this.fileWatcher.stop();
    await this.lockManager.unlockAll();

    this.removePidFile();
    process.exit(0);
  }

  ensureDirectories() {
    const dirs = [
      path.dirname(CONFIG.logFile),
      path.dirname(CONFIG.pidFile),
      CONFIG.backupDir,
      CONFIG.snapshotDir,
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  writePidFile() {
    fs.writeFileSync(CONFIG.pidFile, process.pid.toString());
  }

  removePidFile() {
    if (fs.existsSync(CONFIG.pidFile)) {
      fs.unlinkSync(CONFIG.pidFile);
    }
  }

  async createInitialBackups() {
    this.log('info', 'Creating initial backups of critical files...');

    for (const filePath of CONFIG.criticalFiles) {
      if (fs.existsSync(filePath)) {
        await this.backupManager.backupFile(filePath);
      }
    }
  }

  async checkProtectionDaemon() {
    return new Promise((resolve) => {
      if (!fs.existsSync(CONFIG.protectionSocket)) {
        this.log('warn', 'Protection Daemon not available');
        return resolve(false);
      }

      const client = net.createConnection(CONFIG.protectionSocket, () => {
        client.write(JSON.stringify({ action: 'health' }) + '\n');
      });

      client.on('data', () => {
        client.end();
        this.log('info', 'Connected to Protection Daemon');
        resolve(true);
      });

      client.on('error', () => {
        this.log('warn', 'Cannot connect to Protection Daemon');
        resolve(false);
      });

      client.setTimeout(2000, () => {
        client.destroy();
        resolve(false);
      });
    });
  }

  async notify(notification) {
    this.stats.alertsSent++;
    await this.notificationManager.send(notification);
  }

  reportStatus() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    this.log('info', `Status: uptime=${uptime}s, events=${this.stats.eventsProcessed}, alerts=${this.stats.alertsSent}`);
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const prefix = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '🚨',
    }[level] || '';

    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${prefix} ${message}`;
    console.error(logLine);

    try {
      fs.appendFileSync(CONFIG.logFile, logLine + '\n');
    } catch (err) {
      // 로그 파일 쓰기 실패 무시
    }
  }
}

// ============================================================================
// CLI 인터페이스
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
CodeB Watchdog Monitor

Usage: node watchdog.js [options]

Options:
  --start           Start the watchdog daemon
  --status          Check watchdog status
  --backup <file>   Backup a specific file
  --restore <file>  Restore a file from backup
  --lock <file>     Lock a file (immutable)
  --unlock <file>   Unlock a file
  --help            Show this help

Examples:
  node watchdog.js --start
  node watchdog.js --backup /opt/codeb/security/daemon/protection-daemon.js
  node watchdog.js --lock /etc/codeb/protection-rules.json
`);
  process.exit(0);
}

if (args.includes('--status')) {
  if (fs.existsSync(CONFIG.pidFile)) {
    const pid = fs.readFileSync(CONFIG.pidFile, 'utf8').trim();
    try {
      process.kill(parseInt(pid), 0);
      console.log(`Watchdog is running (PID: ${pid})`);
    } catch (e) {
      console.log('Watchdog is not running (stale PID file)');
    }
  } else {
    console.log('Watchdog is not running');
  }
  process.exit(0);
}

if (args.includes('--backup')) {
  const fileIndex = args.indexOf('--backup') + 1;
  const filePath = args[fileIndex];
  if (filePath) {
    const manager = new BackupManager();
    manager.backupFile(filePath).then((backupPath) => {
      console.log(`Backed up to: ${backupPath}`);
      process.exit(0);
    });
  } else {
    console.error('Please specify a file path');
    process.exit(1);
  }
} else if (args.includes('--start') || args.length === 0) {
  // 데몬 시작
  const watchdog = new Watchdog();
  watchdog.start().catch((err) => {
    console.error(`Failed to start watchdog: ${err.message}`);
    process.exit(1);
  });
}
