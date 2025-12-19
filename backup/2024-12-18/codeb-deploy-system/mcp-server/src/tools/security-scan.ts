/**
 * CodeB Deploy MCP - Security Scan Tool
 * Trivy (이미지 취약점) 및 gitleaks (시크릿 스캔)
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';

// 기본 레지스트리 설정 (ghcr.io 사용)
const DEFAULT_REGISTRY = 'ghcr.io';

/**
 * 프로젝트 config에서 레지스트리 정보 가져오기
 */
async function getRegistryConfig(projectName: string): Promise<{
  registry: string;
  owner: string;
  imageName: string;
}> {
  const ssh = getSSHClient();
  try {
    const configResult = await ssh.exec(
      `cat /home/codeb/projects/${projectName}/deploy/config.json 2>/dev/null`
    );

    if (configResult.code === 0 && configResult.stdout.trim()) {
      const config = JSON.parse(configResult.stdout);
      return {
        registry: config.registry?.url || DEFAULT_REGISTRY,
        owner: config.registry?.owner || config.project?.owner || 'codeb-deploy',
        imageName: config.registry?.imageName || projectName,
      };
    }
  } catch {
    // 기본값 사용
  }

  return {
    registry: DEFAULT_REGISTRY,
    owner: 'codeb-deploy',
    imageName: projectName,
  };
}

/**
 * 이미지 전체 경로 생성
 */
function getImagePath(registry: string, owner: string, imageName: string, tag: string): string {
  return `${registry}/${owner}/${imageName}:${tag}`;
}

// Security Scan 입력 스키마
export const securityScanInputSchema = z.object({
  projectName: z.string().describe('프로젝트 이름'),
  scanType: z.enum(['image', 'secrets', 'all']).describe('스캔 유형'),
  imageTag: z.string().optional().describe('스캔할 이미지 태그 (image 스캔 시)'),
  repoPath: z.string().optional().describe('스캔할 저장소 경로 (secrets 스캔 시)'),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional()
    .describe('최소 심각도 필터 (기본: HIGH)'),
  failOnVulnerability: z.boolean().optional()
    .describe('취약점 발견 시 실패 처리 (기본: true)'),
});

export type SecurityScanInput = z.infer<typeof securityScanInputSchema>;

interface Vulnerability {
  id: string;
  severity: string;
  package: string;
  version: string;
  fixedVersion?: string;
  description: string;
  reference?: string;
}

interface Secret {
  file: string;
  line: number;
  rule: string;
  match: string;
  entropy?: number;
}

interface SecurityScanResult {
  success: boolean;
  scanType: 'image' | 'secrets' | 'all';
  timestamp: string;
  duration: number;
  vulnerabilities?: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    items: Vulnerability[];
  };
  secrets?: {
    total: number;
    items: Secret[];
  };
  passed: boolean;
  summary: string;
}

/**
 * Trivy 이미지 스캔
 */
async function scanImageWithTrivy(
  projectName: string,
  imageTag: string,
  minSeverity: string
): Promise<{ vulnerabilities: Vulnerability[]; rawOutput: string }> {
  const ssh = getSSHClient();

  // ghcr.io 레지스트리 설정
  const regConfig = await getRegistryConfig(projectName);
  const image = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, imageTag);

  // Trivy 설치 확인
  const trivyCheck = await ssh.exec('which trivy 2>/dev/null || echo "not_found"');
  if (trivyCheck.stdout.trim() === 'not_found') {
    // Trivy 설치
    await ssh.exec(`
      curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
    `, { timeout: 120000 });
  }

  // JSON 형식으로 스캔
  const scanResult = await ssh.exec(
    `trivy image --format json --severity ${minSeverity},CRITICAL ${image} 2>/dev/null || echo "{}"`,
    { timeout: 300000 }
  );

  const vulnerabilities: Vulnerability[] = [];

  try {
    const report = JSON.parse(scanResult.stdout);

    if (report.Results) {
      for (const result of report.Results) {
        if (result.Vulnerabilities) {
          for (const vuln of result.Vulnerabilities) {
            vulnerabilities.push({
              id: vuln.VulnerabilityID,
              severity: vuln.Severity,
              package: vuln.PkgName,
              version: vuln.InstalledVersion,
              fixedVersion: vuln.FixedVersion,
              description: vuln.Description || vuln.Title,
              reference: vuln.PrimaryURL,
            });
          }
        }
      }
    }
  } catch {
    // JSON 파싱 실패 시 빈 배열 반환
  }

  return {
    vulnerabilities,
    rawOutput: scanResult.stdout,
  };
}

/**
 * gitleaks 시크릿 스캔
 */
async function scanSecretsWithGitleaks(
  repoPath: string
): Promise<{ secrets: Secret[]; rawOutput: string }> {
  const ssh = getSSHClient();

  // gitleaks 설치 확인
  const gitleaksCheck = await ssh.exec('which gitleaks 2>/dev/null || echo "not_found"');
  if (gitleaksCheck.stdout.trim() === 'not_found') {
    // gitleaks 설치
    await ssh.exec(`
      GITLEAKS_VERSION=$(curl -s "https://api.github.com/repos/gitleaks/gitleaks/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\\1/')
      curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v\${GITLEAKS_VERSION}/gitleaks_\${GITLEAKS_VERSION}_linux_x64.tar.gz" | tar xz -C /usr/local/bin gitleaks
    `, { timeout: 120000 });
  }

  // JSON 형식으로 스캔
  const scanResult = await ssh.exec(
    `cd ${repoPath} && gitleaks detect --source . --report-format json --report-path /tmp/gitleaks-report.json --no-git 2>/dev/null; cat /tmp/gitleaks-report.json 2>/dev/null || echo "[]"`,
    { timeout: 120000 }
  );

  const secrets: Secret[] = [];

  try {
    const findings = JSON.parse(scanResult.stdout);

    if (Array.isArray(findings)) {
      for (const finding of findings) {
        secrets.push({
          file: finding.File,
          line: finding.StartLine,
          rule: finding.RuleID,
          match: finding.Secret ? finding.Secret.substring(0, 20) + '...' : finding.Match?.substring(0, 20) + '...',
          entropy: finding.Entropy,
        });
      }
    }
  } catch {
    // JSON 파싱 실패 시 빈 배열 반환
  }

  return {
    secrets,
    rawOutput: scanResult.stdout,
  };
}

/**
 * Security Scan 도구 실행
 */
export async function executeSecurityScan(input: SecurityScanInput): Promise<SecurityScanResult> {
  const {
    projectName,
    scanType,
    imageTag = 'latest',
    repoPath = `/home/codeb/projects/${projectName}`,
    severity = 'HIGH',
    failOnVulnerability = true,
  } = input;

  const ssh = getSSHClient();
  await ssh.connect();

  const startTime = Date.now();
  let vulnerabilities: Vulnerability[] = [];
  let secrets: Secret[] = [];

  try {
    // 이미지 스캔
    if (scanType === 'image' || scanType === 'all') {
      const imageResult = await scanImageWithTrivy(projectName, imageTag, severity);
      vulnerabilities = imageResult.vulnerabilities;
    }

    // 시크릿 스캔
    if (scanType === 'secrets' || scanType === 'all') {
      const secretsResult = await scanSecretsWithGitleaks(repoPath);
      secrets = secretsResult.secrets;
    }

    // 결과 집계
    const critical = vulnerabilities.filter(v => v.severity === 'CRITICAL').length;
    const high = vulnerabilities.filter(v => v.severity === 'HIGH').length;
    const medium = vulnerabilities.filter(v => v.severity === 'MEDIUM').length;
    const low = vulnerabilities.filter(v => v.severity === 'LOW').length;

    // 통과 여부 판정
    let passed = true;
    if (failOnVulnerability) {
      if (severity === 'CRITICAL' && critical > 0) passed = false;
      if (severity === 'HIGH' && (critical > 0 || high > 0)) passed = false;
      if (severity === 'MEDIUM' && (critical > 0 || high > 0 || medium > 0)) passed = false;
      if (severity === 'LOW' && vulnerabilities.length > 0) passed = false;

      if (secrets.length > 0) passed = false;
    }

    // 요약 생성
    const summaryParts: string[] = [];
    if (scanType === 'image' || scanType === 'all') {
      summaryParts.push(`Vulnerabilities: ${vulnerabilities.length} (C:${critical} H:${high} M:${medium} L:${low})`);
    }
    if (scanType === 'secrets' || scanType === 'all') {
      summaryParts.push(`Secrets: ${secrets.length} found`);
    }
    summaryParts.push(passed ? '✅ PASSED' : '❌ FAILED');

    const result: SecurityScanResult = {
      success: true,
      scanType,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      passed,
      summary: summaryParts.join(' | '),
    };

    if (scanType === 'image' || scanType === 'all') {
      result.vulnerabilities = {
        total: vulnerabilities.length,
        critical,
        high,
        medium,
        low,
        items: vulnerabilities.slice(0, 50), // 최대 50개까지
      };
    }

    if (scanType === 'secrets' || scanType === 'all') {
      result.secrets = {
        total: secrets.length,
        items: secrets.slice(0, 20), // 최대 20개까지
      };
    }

    return result;

  } catch (error) {
    return {
      success: false,
      scanType,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      passed: false,
      summary: `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

/**
 * SBOM (Software Bill of Materials) 생성
 */
export async function generateSBOM(input: {
  projectName: string;
  imageTag?: string;
  format?: 'spdx-json' | 'cyclonedx' | 'github';
}): Promise<{ success: boolean; sbom?: object; error?: string }> {
  const {
    projectName,
    imageTag = 'latest',
    format = 'spdx-json',
  } = input;

  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // ghcr.io 레지스트리 설정
    const regConfig = await getRegistryConfig(projectName);
    const image = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, imageTag);

    // Trivy로 SBOM 생성
    const result = await ssh.exec(
      `trivy image --format ${format} ${image} 2>/dev/null`,
      { timeout: 300000 }
    );

    if (result.code !== 0) {
      throw new Error(`SBOM generation failed: ${result.stderr}`);
    }

    const sbom = JSON.parse(result.stdout);

    return {
      success: true,
      sbom,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    ssh.disconnect();
  }
}

/**
 * Security Scan 도구 정의
 */
export const securityScanTool = {
  name: 'security_scan',
  description: 'Trivy로 이미지 취약점을 스캔하고 gitleaks로 시크릿을 검사합니다',
  inputSchema: securityScanInputSchema,
  execute: executeSecurityScan,
};

/**
 * SBOM 생성 도구 정의
 */
export const sbomTool = {
  name: 'generate_sbom',
  description: 'SBOM (Software Bill of Materials)을 생성합니다',
  inputSchema: z.object({
    projectName: z.string().describe('프로젝트 이름'),
    imageTag: z.string().optional().describe('이미지 태그 (기본: latest)'),
    format: z.enum(['spdx-json', 'cyclonedx', 'github']).optional().describe('SBOM 형식'),
  }),
  execute: generateSBOM,
};
