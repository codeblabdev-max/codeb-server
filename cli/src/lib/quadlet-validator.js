/**
 * Quadlet Compatibility Validator
 *
 * Podman 버전별 Quadlet 키 지원 여부를 검증하고,
 * 호환되지 않는 설정을 자동으로 변환합니다.
 *
 * @module quadlet-validator
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

// ============================================================================
// Podman 버전별 Quadlet 지원 매트릭스
// ============================================================================

const QUADLET_SUPPORT_MATRIX = {
  // Podman 4.x (Quadlet v1)
  '4.0': {
    container: [
      'Image', 'ContainerName', 'PublishPort', 'Network', 'Environment',
      'EnvironmentFile', 'Volume', 'HealthCmd', 'HealthInterval',
      'HealthTimeout', 'HealthRetries', 'HealthStartPeriod', 'PodmanArgs',
      'Label', 'LogDriver', 'NoNewPrivileges', 'User', 'Group',
      'WorkingDir', 'Exec', 'Notify', 'ReadOnly'
    ],
    unsupported: ['AddHost', 'DNS', 'DNSSearch', 'Entrypoint', 'StopTimeout', 'Ulimit'],
    alternatives: {
      'AddHost': 'PodmanArgs=--add-host={value}',
      'DNS': 'PodmanArgs=--dns={value}',
      'DNSSearch': 'PodmanArgs=--dns-search={value}',
      'Entrypoint': 'PodmanArgs=--entrypoint={value}',
      'StopTimeout': 'PodmanArgs=--stop-timeout={value}',
      'Ulimit': 'PodmanArgs=--ulimit={value}'
    }
  },
  // Podman 5.x (Quadlet v2)
  '5.0': {
    container: [
      'Image', 'ContainerName', 'PublishPort', 'Network', 'Environment',
      'EnvironmentFile', 'Volume', 'HealthCmd', 'HealthInterval',
      'HealthTimeout', 'HealthRetries', 'HealthStartPeriod', 'PodmanArgs',
      'Label', 'LogDriver', 'NoNewPrivileges', 'User', 'Group',
      'WorkingDir', 'Exec', 'Notify', 'ReadOnly',
      // Podman 5.x에서 추가된 키
      'AddHost', 'DNS', 'DNSSearch', 'Entrypoint', 'StopTimeout', 'Ulimit',
      'Mask', 'Unmask', 'SecurityLabelType', 'SecurityLabelLevel',
      'Timezone', 'Secret', 'Mount', 'Device', 'HostName'
    ],
    unsupported: [],
    alternatives: {}
  }
};

// ============================================================================
// Podman 버전 감지
// ============================================================================

/**
 * 서버의 Podman 버전을 가져옵니다
 * @param {string} serverHost - 서버 호스트
 * @param {string} serverUser - 서버 사용자
 * @returns {Promise<{major: number, minor: number, patch: number, full: string}>}
 */
export async function getPodmanVersion(serverHost, serverUser = 'root') {
  try {
    let versionOutput;

    if (serverHost) {
      // 원격 서버
      versionOutput = execSync(
        `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${serverUser}@${serverHost} "podman --version"`,
        { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
    } else {
      // 로컬
      versionOutput = execSync('podman --version', { encoding: 'utf8' }).trim();
    }

    // "podman version 5.7.1" → {major: 5, minor: 7, patch: 1}
    const match = versionOutput.match(/(\d+)\.(\d+)\.(\d+)/);
    if (match) {
      return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        full: `${match[1]}.${match[2]}.${match[3]}`
      };
    }

    throw new Error(`Invalid version format: ${versionOutput}`);
  } catch (error) {
    console.error(chalk.yellow(`⚠ Could not detect Podman version: ${error.message}`));
    // 기본값: 보수적으로 4.0 가정
    return { major: 4, minor: 0, patch: 0, full: '4.0.0' };
  }
}

/**
 * Podman 버전에 맞는 지원 매트릭스 반환
 * @param {number} majorVersion - Podman 메이저 버전
 * @returns {object} 지원 매트릭스
 */
export function getSupportMatrix(majorVersion) {
  if (majorVersion >= 5) {
    return QUADLET_SUPPORT_MATRIX['5.0'];
  }
  return QUADLET_SUPPORT_MATRIX['4.0'];
}

// ============================================================================
// Quadlet 파일 검증
// ============================================================================

/**
 * Quadlet 컨테이너 파일 내용을 검증합니다
 * @param {string} content - .container 파일 내용
 * @param {number} podmanMajorVersion - Podman 메이저 버전
 * @returns {{valid: boolean, errors: string[], warnings: string[], unsupportedKeys: object[]}}
 */
export function validateQuadletContent(content, podmanMajorVersion = 4) {
  const matrix = getSupportMatrix(podmanMajorVersion);
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    unsupportedKeys: []
  };

  const lines = content.split('\n');
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // 빈 줄이나 주석 스킵
    if (!line || line.startsWith('#')) continue;

    // 섹션 헤더
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    // 키=값 파싱
    if (currentSection === 'Container') {
      const keyMatch = line.match(/^(\w+)=/);
      if (keyMatch) {
        const key = keyMatch[1];
        const value = line.substring(key.length + 1);

        // 지원되지 않는 키 체크
        if (matrix.unsupported.includes(key)) {
          result.valid = false;
          result.unsupportedKeys.push({
            key,
            value,
            line: lineNum,
            alternative: matrix.alternatives[key]
          });
          result.errors.push(
            `Line ${lineNum}: '${key}' is not supported in Podman ${podmanMajorVersion}.x Quadlet`
          );
        }

        // 필수 값 검증
        if (key === 'Image' && !value) {
          result.valid = false;
          result.errors.push(`Line ${lineNum}: Image is required`);
        }

        if (key === 'PublishPort') {
          const portMatch = value.match(/:?(\d+)/);
          if (!portMatch || parseInt(portMatch[1], 10) <= 0) {
            result.valid = false;
            result.errors.push(`Line ${lineNum}: Invalid port in PublishPort: ${value}`);
          }
        }
      }
    }
  }

  return result;
}

// ============================================================================
// Quadlet 파일 자동 변환
// ============================================================================

/**
 * 지원되지 않는 키를 PodmanArgs로 변환합니다
 * @param {string} content - .container 파일 내용
 * @param {number} podmanMajorVersion - Podman 메이저 버전
 * @returns {{converted: string, changes: string[]}}
 */
export function convertQuadletForCompatibility(content, podmanMajorVersion = 4) {
  const matrix = getSupportMatrix(podmanMajorVersion);
  const changes = [];
  const lines = content.split('\n');
  const newLines = [];
  const podmanArgsToAdd = [];

  let inContainerSection = false;
  let existingPodmanArgs = '';
  let podmanArgsLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 섹션 체크
    if (trimmedLine === '[Container]') {
      inContainerSection = true;
      newLines.push(line);
      continue;
    } else if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
      inContainerSection = false;
    }

    if (inContainerSection) {
      // 기존 PodmanArgs 찾기
      if (trimmedLine.startsWith('PodmanArgs=')) {
        existingPodmanArgs = trimmedLine.substring('PodmanArgs='.length);
        podmanArgsLineIndex = newLines.length;
        newLines.push(line); // 나중에 교체
        continue;
      }

      // 지원되지 않는 키 처리
      let handled = false;
      for (const unsupportedKey of matrix.unsupported) {
        if (trimmedLine.startsWith(`${unsupportedKey}=`)) {
          const value = trimmedLine.substring(unsupportedKey.length + 1);
          const alternative = matrix.alternatives[unsupportedKey];

          if (alternative) {
            // PodmanArgs로 변환
            const podmanArg = alternative.replace('{value}', value);
            const argPart = podmanArg.substring('PodmanArgs='.length);
            podmanArgsToAdd.push(argPart);
            changes.push(`Converted ${unsupportedKey}=${value} → ${podmanArg}`);
          }

          handled = true;
          break;
        }
      }

      if (!handled) {
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }

  // PodmanArgs 병합
  if (podmanArgsToAdd.length > 0) {
    const allArgs = existingPodmanArgs
      ? `${existingPodmanArgs} ${podmanArgsToAdd.join(' ')}`
      : podmanArgsToAdd.join(' ');

    if (podmanArgsLineIndex >= 0) {
      // 기존 PodmanArgs 라인 교체
      const indent = newLines[podmanArgsLineIndex].match(/^(\s*)/)[1];
      newLines[podmanArgsLineIndex] = `${indent}PodmanArgs=${allArgs}`;
    } else {
      // [Container] 섹션에 PodmanArgs 추가
      for (let i = 0; i < newLines.length; i++) {
        if (newLines[i].trim() === '[Container]') {
          newLines.splice(i + 1, 0, `PodmanArgs=${allArgs}`);
          break;
        }
      }
    }
  }

  return {
    converted: newLines.join('\n'),
    changes
  };
}

// ============================================================================
// 네트워크 검증
// ============================================================================

/**
 * Quadlet 파일에서 사용하는 네트워크가 존재하는지 확인합니다
 * @param {string} content - .container 파일 내용
 * @param {string} serverHost - 서버 호스트
 * @param {string} serverUser - 서버 사용자
 * @returns {Promise<{valid: boolean, network: string, exists: boolean, suggestion: string}>}
 */
export async function validateNetwork(content, serverHost, serverUser = 'root') {
  // 네트워크 추출
  const networkMatch = content.match(/Network=(\S+)/);
  if (!networkMatch) {
    return { valid: true, network: null, exists: true, suggestion: null };
  }

  const network = networkMatch[1];

  try {
    let networks;
    if (serverHost) {
      networks = execSync(
        `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${serverUser}@${serverHost} "podman network ls --format '{{.Name}}'"`,
        { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } else {
      networks = execSync('podman network ls --format "{{.Name}}"', { encoding: 'utf8' });
    }

    const exists = networks.split('\n').map(n => n.trim()).includes(network);

    return {
      valid: exists,
      network,
      exists,
      suggestion: exists ? null : `podman network create ${network}`
    };
  } catch (error) {
    console.error(chalk.yellow(`⚠ Could not verify network: ${error.message}`));
    return { valid: true, network, exists: true, suggestion: null };
  }
}

// ============================================================================
// 전체 검증 워크플로우
// ============================================================================

/**
 * Quadlet 파일에 대한 전체 검증을 수행합니다
 * @param {string} content - .container 파일 내용
 * @param {object} options - 옵션
 * @param {string} options.serverHost - 서버 호스트
 * @param {string} options.serverUser - 서버 사용자
 * @param {boolean} options.autoFix - 자동 수정 여부
 * @returns {Promise<object>} 검증 결과
 */
export async function validateQuadlet(content, options = {}) {
  const { serverHost, serverUser = 'root', autoFix = false } = options;

  console.log(chalk.cyan('🔍 Validating Quadlet configuration...'));

  // 1. Podman 버전 확인
  const podmanVersion = await getPodmanVersion(serverHost, serverUser);
  console.log(chalk.gray(`   Podman version: ${podmanVersion.full}`));

  // 2. Quadlet 키 검증
  const validation = validateQuadletContent(content, podmanVersion.major);

  // 3. 네트워크 검증
  const networkValidation = await validateNetwork(content, serverHost, serverUser);

  // 결과 종합
  const result = {
    podmanVersion,
    valid: validation.valid && networkValidation.valid,
    errors: [...validation.errors],
    warnings: validation.warnings,
    unsupportedKeys: validation.unsupportedKeys,
    network: networkValidation,
    convertedContent: null,
    changes: []
  };

  // 네트워크 에러 추가
  if (!networkValidation.valid) {
    result.errors.push(
      `Network '${networkValidation.network}' does not exist. ` +
      `Create it with: ${networkValidation.suggestion}`
    );
  }

  // 4. 자동 수정 (옵션)
  if (autoFix && validation.unsupportedKeys.length > 0) {
    console.log(chalk.yellow('   Auto-fixing unsupported keys...'));
    const { converted, changes } = convertQuadletForCompatibility(content, podmanVersion.major);
    result.convertedContent = converted;
    result.changes = changes;
    result.valid = networkValidation.valid; // 키 변환 후에는 유효
  }

  // 결과 출력
  if (result.valid) {
    console.log(chalk.green('   ✅ Quadlet configuration is valid'));
  } else {
    console.log(chalk.red('   ❌ Quadlet configuration has errors:'));
    result.errors.forEach(err => console.log(chalk.red(`      • ${err}`)));
  }

  if (result.changes.length > 0) {
    console.log(chalk.yellow('   Changes made:'));
    result.changes.forEach(change => console.log(chalk.yellow(`      • ${change}`)));
  }

  return result;
}

// ============================================================================
// 유틸리티
// ============================================================================

/**
 * Podman 버전이 최소 요구사항을 충족하는지 확인
 * @param {object} version - 버전 객체
 * @param {number} minMajor - 최소 메이저 버전
 * @param {number} minMinor - 최소 마이너 버전
 * @returns {boolean}
 */
export function meetsMinimumVersion(version, minMajor, minMinor = 0) {
  if (version.major > minMajor) return true;
  if (version.major === minMajor && version.minor >= minMinor) return true;
  return false;
}

/**
 * 버전 비교 문자열 생성
 * @param {object} version - 버전 객체
 * @returns {string}
 */
export function getVersionInfo(version) {
  const features = [];

  if (version.major >= 5) {
    features.push('AddHost', 'DNS', 'Entrypoint', 'Full Quadlet v2');
  } else {
    features.push('Basic Quadlet (use PodmanArgs for advanced options)');
  }

  return {
    version: version.full,
    features,
    recommendation: version.major < 5
      ? 'Consider upgrading to Podman 5.x for full Quadlet support'
      : 'All Quadlet features available'
  };
}

export default {
  getPodmanVersion,
  getSupportMatrix,
  validateQuadletContent,
  convertQuadletForCompatibility,
  validateNetwork,
  validateQuadlet,
  meetsMinimumVersion,
  getVersionInfo
};
