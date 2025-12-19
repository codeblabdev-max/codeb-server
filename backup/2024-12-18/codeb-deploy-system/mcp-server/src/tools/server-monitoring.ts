/**
 * CodeB Deploy MCP - 서버 모니터링 도구
 * 디스크, SSL, 백업, 헬스체크 모니터링
 */

import { getSSHClient } from '../lib/ssh-client.js';

// ============================================================================
// 타입 정의
// ============================================================================

export interface DiskMonitoringResult {
  success: boolean;
  partitions: {
    device: string;
    mountPoint: string;
    total: string;
    used: string;
    available: string;
    usagePercent: number;
    status: 'ok' | 'warning' | 'critical';
  }[];
  alerts: string[];
  message: string;
}

export interface SSLMonitoringResult {
  success: boolean;
  certificates: {
    domain: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    daysRemaining: number;
    status: 'ok' | 'warning' | 'critical' | 'expired';
  }[];
  alerts: string[];
  message: string;
}

export interface BackupStatusResult {
  success: boolean;
  backups: {
    name: string;
    type: 'database' | 'files' | 'full';
    lastBackup: string;
    size: string;
    status: 'ok' | 'outdated' | 'missing';
  }[];
  alerts: string[];
  message: string;
}

export interface ContainerHealthResult {
  success: boolean;
  containers: {
    name: string;
    status: string;
    health: 'healthy' | 'unhealthy' | 'starting' | 'none';
    restartCount: number;
    uptime: string;
    memory: string;
    cpu: string;
  }[];
  alerts: string[];
  message: string;
}

export interface FullHealthCheckResult {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'critical';
  disk: DiskMonitoringResult;
  ssl: SSLMonitoringResult;
  backups: BackupStatusResult;
  containers: ContainerHealthResult;
  recommendations: string[];
}

// ============================================================================
// 디스크 모니터링
// ============================================================================

const DISK_WARNING_THRESHOLD = 80;
const DISK_CRITICAL_THRESHOLD = 90;

export async function monitorDisk(): Promise<DiskMonitoringResult> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const result = await ssh.exec(
      "df -h | grep -E '^/dev' | awk '{print $1\"|\"$2\"|\"$3\"|\"$4\"|\"$5\"|\"$6}'"
    );

    const partitions: DiskMonitoringResult['partitions'] = [];
    const alerts: string[] = [];

    for (const line of result.stdout.split('\n').filter(l => l.trim())) {
      const [device, total, used, available, usageStr, mountPoint] = line.split('|');
      const usagePercent = parseInt(usageStr?.replace('%', '') || '0');

      let status: 'ok' | 'warning' | 'critical' = 'ok';
      if (usagePercent >= DISK_CRITICAL_THRESHOLD) {
        status = 'critical';
        alerts.push(`🚨 CRITICAL: ${mountPoint} 디스크 사용량 ${usagePercent}% (${used}/${total})`);
      } else if (usagePercent >= DISK_WARNING_THRESHOLD) {
        status = 'warning';
        alerts.push(`⚠️ WARNING: ${mountPoint} 디스크 사용량 ${usagePercent}% (${used}/${total})`);
      }

      partitions.push({
        device,
        mountPoint,
        total,
        used,
        available,
        usagePercent,
        status,
      });
    }

    return {
      success: true,
      partitions,
      alerts,
      message: alerts.length > 0
        ? `${alerts.length}개 디스크 경고 발생`
        : '모든 디스크 상태 정상',
    };
  } catch (error) {
    return {
      success: false,
      partitions: [],
      alerts: [`에러: ${error instanceof Error ? error.message : String(error)}`],
      message: '디스크 모니터링 실패',
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// SSL 인증서 모니터링
// ============================================================================

const SSL_WARNING_DAYS = 14;
const SSL_CRITICAL_DAYS = 7;

export async function monitorSSL(domains?: string[]): Promise<SSLMonitoringResult> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    // Caddy에서 도메인 목록 추출 (도메인이 지정되지 않은 경우)
    let domainsToCheck = domains || [];

    if (domainsToCheck.length === 0) {
      const caddyResult = await ssh.exec(
        "cat /etc/caddy/Caddyfile 2>/dev/null | grep -E '^[a-z0-9].*\\.(com|net|org|dev|io|xyz|kr)' | awk '{print $1}' | sort | uniq"
      );
      domainsToCheck = caddyResult.stdout.split('\n').filter(d => d.trim());
    }

    const certificates: SSLMonitoringResult['certificates'] = [];
    const alerts: string[] = [];

    for (const domain of domainsToCheck) {
      if (!domain) continue;

      // OpenSSL로 인증서 정보 확인
      const certResult = await ssh.exec(
        `echo | openssl s_client -servername ${domain} -connect ${domain}:443 2>/dev/null | openssl x509 -noout -dates -issuer 2>/dev/null || echo "FAILED"`
      );

      if (certResult.stdout.includes('FAILED')) {
        certificates.push({
          domain,
          issuer: 'N/A',
          validFrom: 'N/A',
          validTo: 'N/A',
          daysRemaining: -1,
          status: 'critical',
        });
        alerts.push(`🚨 CRITICAL: ${domain} SSL 인증서 확인 실패`);
        continue;
      }

      // 파싱
      const notBeforeMatch = certResult.stdout.match(/notBefore=(.+)/);
      const notAfterMatch = certResult.stdout.match(/notAfter=(.+)/);
      const issuerMatch = certResult.stdout.match(/issuer=(.+)/);

      const validFrom = notBeforeMatch?.[1] || 'Unknown';
      const validTo = notAfterMatch?.[1] || 'Unknown';
      const issuer = issuerMatch?.[1]?.split(',')[0]?.replace('CN = ', '') || 'Unknown';

      // 만료일까지 남은 일수 계산
      let daysRemaining = -1;
      if (validTo !== 'Unknown') {
        const expiryDate = new Date(validTo);
        const now = new Date();
        daysRemaining = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      let status: 'ok' | 'warning' | 'critical' | 'expired' = 'ok';
      if (daysRemaining < 0) {
        status = 'expired';
        alerts.push(`🚨 EXPIRED: ${domain} SSL 인증서 만료됨!`);
      } else if (daysRemaining <= SSL_CRITICAL_DAYS) {
        status = 'critical';
        alerts.push(`🚨 CRITICAL: ${domain} SSL 인증서 ${daysRemaining}일 후 만료`);
      } else if (daysRemaining <= SSL_WARNING_DAYS) {
        status = 'warning';
        alerts.push(`⚠️ WARNING: ${domain} SSL 인증서 ${daysRemaining}일 후 만료`);
      }

      certificates.push({
        domain,
        issuer,
        validFrom,
        validTo,
        daysRemaining,
        status,
      });
    }

    return {
      success: true,
      certificates,
      alerts,
      message: alerts.length > 0
        ? `${alerts.length}개 SSL 경고 발생`
        : `${certificates.length}개 인증서 모두 정상`,
    };
  } catch (error) {
    return {
      success: false,
      certificates: [],
      alerts: [`에러: ${error instanceof Error ? error.message : String(error)}`],
      message: 'SSL 모니터링 실패',
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 백업 상태 확인
// ============================================================================

const BACKUP_OUTDATED_HOURS = 24;

export async function checkBackupStatus(): Promise<BackupStatusResult> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const backups: BackupStatusResult['backups'] = [];
    const alerts: string[] = [];

    // 백업 디렉토리 확인
    const backupDirs = [
      '/opt/codeb/backups',
      '/var/backups/postgresql',
      '/var/backups/codeb',
    ];

    for (const dir of backupDirs) {
      const existsResult = await ssh.exec(`[ -d "${dir}" ] && echo "EXISTS" || echo "MISSING"`);

      if (existsResult.stdout.trim() === 'MISSING') {
        continue;
      }

      // 최근 백업 파일 찾기
      const findResult = await ssh.exec(
        `find ${dir} -type f \\( -name "*.sql" -o -name "*.tar.gz" -o -name "*.dump" -o -name "*.bak" \\) -mtime -7 -exec ls -lh {} \\; 2>/dev/null | head -20`
      );

      if (!findResult.stdout.trim()) {
        alerts.push(`⚠️ WARNING: ${dir} 에서 최근 7일 내 백업 파일 없음`);
        backups.push({
          name: dir,
          type: 'full',
          lastBackup: 'N/A',
          size: 'N/A',
          status: 'missing',
        });
        continue;
      }

      for (const line of findResult.stdout.split('\n').filter(l => l.trim())) {
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;

        const size = parts[4];
        const dateStr = `${parts[5]} ${parts[6]} ${parts[7]}`;
        const filePath = parts.slice(8).join(' ');
        const fileName = filePath.split('/').pop() || filePath;

        // 백업 타입 결정
        let type: 'database' | 'files' | 'full' = 'full';
        if (fileName.includes('.sql') || fileName.includes('.dump') || fileName.includes('pg_')) {
          type = 'database';
        } else if (fileName.includes('.tar')) {
          type = 'files';
        }

        // 마지막 수정 시간으로 상태 결정
        const statResult = await ssh.exec(
          `stat -c %Y "${filePath}" 2>/dev/null || echo "0"`
        );
        const mtime = parseInt(statResult.stdout.trim()) || 0;
        const hoursSinceBackup = (Date.now() / 1000 - mtime) / 3600;

        let status: 'ok' | 'outdated' | 'missing' = 'ok';
        if (hoursSinceBackup > BACKUP_OUTDATED_HOURS) {
          status = 'outdated';
          alerts.push(`⚠️ WARNING: ${fileName} 백업이 ${Math.floor(hoursSinceBackup)}시간 전 생성됨`);
        }

        backups.push({
          name: fileName,
          type,
          lastBackup: dateStr,
          size,
          status,
        });
      }
    }

    // PostgreSQL 자동 백업 cron 확인
    const cronResult = await ssh.exec(
      "crontab -l 2>/dev/null | grep -E 'pg_dump|backup' || echo 'NO_CRON'"
    );

    if (cronResult.stdout.includes('NO_CRON')) {
      alerts.push('ℹ️ INFO: PostgreSQL 자동 백업 cron이 설정되지 않음');
    }

    return {
      success: true,
      backups,
      alerts,
      message: backups.length > 0
        ? `${backups.length}개 백업 확인됨, ${alerts.length}개 경고`
        : '백업 파일을 찾을 수 없음',
    };
  } catch (error) {
    return {
      success: false,
      backups: [],
      alerts: [`에러: ${error instanceof Error ? error.message : String(error)}`],
      message: '백업 상태 확인 실패',
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 컨테이너 헬스체크
// ============================================================================

export async function checkContainerHealth(): Promise<ContainerHealthResult> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const result = await ssh.exec(
      `podman ps -a --format "{{.Names}}|{{.Status}}|{{.State}}" 2>/dev/null || echo ""`
    );

    const containers: ContainerHealthResult['containers'] = [];
    const alerts: string[] = [];

    for (const line of result.stdout.split('\n').filter(l => l.trim())) {
      const [name, status, state] = line.split('|');

      // 상세 정보 가져오기
      const statsResult = await ssh.exec(
        `podman stats ${name} --no-stream --format "{{.MemUsage}}|{{.CPUPerc}}" 2>/dev/null || echo "N/A|N/A"`
      );
      const [memory, cpu] = statsResult.stdout.trim().split('|');

      // 재시작 횟수
      const inspectResult = await ssh.exec(
        `podman inspect ${name} --format "{{.RestartCount}}" 2>/dev/null || echo "0"`
      );
      const restartCount = parseInt(inspectResult.stdout.trim()) || 0;

      // 헬스 상태 파싱
      let health: 'healthy' | 'unhealthy' | 'starting' | 'none' = 'none';
      if (status.includes('healthy')) health = 'healthy';
      else if (status.includes('unhealthy')) health = 'unhealthy';
      else if (status.includes('starting')) health = 'starting';

      // 업타임 추출
      const uptimeMatch = status.match(/Up\s+(.+)/);
      const uptime = uptimeMatch?.[1] || state;

      // 경고 조건
      if (state !== 'running') {
        alerts.push(`🚨 CRITICAL: ${name} 컨테이너가 실행 중이 아님 (${state})`);
      } else if (health === 'unhealthy') {
        alerts.push(`⚠️ WARNING: ${name} 컨테이너 헬스체크 실패`);
      } else if (restartCount > 5) {
        alerts.push(`⚠️ WARNING: ${name} 컨테이너 재시작 ${restartCount}회`);
      }

      containers.push({
        name,
        status: state,
        health,
        restartCount,
        uptime,
        memory: memory || 'N/A',
        cpu: cpu || 'N/A',
      });
    }

    return {
      success: true,
      containers,
      alerts,
      message: `${containers.length}개 컨테이너 확인, ${alerts.length}개 경고`,
    };
  } catch (error) {
    return {
      success: false,
      containers: [],
      alerts: [`에러: ${error instanceof Error ? error.message : String(error)}`],
      message: '컨테이너 헬스체크 실패',
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 전체 헬스체크 (통합)
// ============================================================================

export async function fullHealthCheck(): Promise<FullHealthCheckResult> {
  // 병렬로 모든 체크 실행
  const [disk, ssl, backups, containers] = await Promise.all([
    monitorDisk(),
    monitorSSL(),
    checkBackupStatus(),
    checkContainerHealth(),
  ]);

  // 전체 상태 결정
  let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';

  const allAlerts = [
    ...disk.alerts,
    ...ssl.alerts,
    ...backups.alerts,
    ...containers.alerts,
  ];

  const criticalCount = allAlerts.filter(a => a.includes('CRITICAL') || a.includes('EXPIRED')).length;
  const warningCount = allAlerts.filter(a => a.includes('WARNING')).length;

  if (criticalCount > 0) {
    overall = 'critical';
  } else if (warningCount > 0) {
    overall = 'degraded';
  }

  // 권장 사항 생성
  const recommendations: string[] = [];

  if (disk.partitions.some(p => p.usagePercent > 70)) {
    recommendations.push('디스크 정리 또는 용량 확장을 고려하세요');
  }

  if (ssl.certificates.some(c => c.daysRemaining < 30 && c.daysRemaining > 0)) {
    recommendations.push('SSL 인증서 자동 갱신이 작동하는지 확인하세요');
  }

  if (backups.backups.length === 0) {
    recommendations.push('자동 백업 설정을 구성하세요');
  }

  if (containers.containers.some(c => c.restartCount > 3)) {
    recommendations.push('자주 재시작되는 컨테이너의 로그를 확인하세요');
  }

  return {
    timestamp: new Date().toISOString(),
    overall,
    disk,
    ssl,
    backups,
    containers,
    recommendations,
  };
}

// ============================================================================
// 자동 백업 cron 설정
// ============================================================================

export async function setupAutoBackup(config: {
  databases: string[];
  backupDir?: string;
  retention?: number; // days
  schedule?: string;  // cron expression
}): Promise<{ success: boolean; message: string }> {
  const ssh = getSSHClient();
  const {
    databases,
    backupDir = '/opt/codeb/backups',
    retention = 7,
    schedule = '0 3 * * *', // 매일 새벽 3시
  } = config;

  try {
    await ssh.connect();

    // 백업 디렉토리 생성
    await ssh.exec(`mkdir -p ${backupDir}`);

    // 백업 스크립트 생성
    const backupScript = `#!/bin/bash
# CodeB Auto Backup Script
# Generated: ${new Date().toISOString()}

BACKUP_DIR="${backupDir}"
RETENTION_DAYS=${retention}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# PostgreSQL backups
${databases.map(db => `
echo "Backing up database: ${db}"
sudo -u postgres pg_dump ${db} | gzip > $BACKUP_DIR/${db}_$TIMESTAMP.sql.gz
`).join('\n')}

# Clean old backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed at $(date)"
`;

    // 스크립트 저장
    await ssh.writeFile('/opt/codeb/scripts/auto-backup.sh', backupScript);
    await ssh.exec('chmod +x /opt/codeb/scripts/auto-backup.sh');

    // Cron 설정
    const cronEntry = `${schedule} /opt/codeb/scripts/auto-backup.sh >> /var/log/codeb-backup.log 2>&1`;

    // 기존 cron에서 codeb 백업 제거 후 추가
    await ssh.exec(
      `(crontab -l 2>/dev/null | grep -v 'auto-backup.sh'; echo "${cronEntry}") | crontab -`
    );

    return {
      success: true,
      message: `자동 백업 설정 완료: ${schedule} (${retention}일 보관)`,
    };
  } catch (error) {
    return {
      success: false,
      message: `에러: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// Export All
// ============================================================================

export const monitoringTools = {
  monitorDisk,
  monitorSSL,
  checkBackupStatus,
  checkContainerHealth,
  fullHealthCheck,
  setupAutoBackup,
  DISK_WARNING_THRESHOLD,
  DISK_CRITICAL_THRESHOLD,
  SSL_WARNING_DAYS,
  SSL_CRITICAL_DAYS,
};
