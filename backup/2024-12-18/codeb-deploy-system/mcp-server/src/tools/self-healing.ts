/**
 * CodeB Deploy MCP - Self-Healing CI/CD Tools
 * 빌드 에러 자동 수정 및 반복 시도 시스템
 *
 * 핵심 원칙: 절대 코드를 삭제하여 문제를 해결하지 않음
 */

import { getSSHClient } from '../lib/ssh-client.js';

// ============================================================================
// 타입 정의
// ============================================================================

export interface BuildErrorAnalysis {
  errorType: 'typescript' | 'lint' | 'build' | 'test' | 'import' | 'unknown';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface FixValidation {
  valid: boolean;
  reason: string;
  deletions: number;
  additions: number;
  hasForbiddenPatterns: boolean;
  forbiddenPatterns: string[];
}

export interface AutoFixLoopInput {
  owner: string;
  repo: string;
  branch: string;
  maxAttempts?: number;
  githubToken?: string;
}

export interface AutoFixLoopResult {
  success: boolean;
  attempts: number;
  fixedErrors: string[];
  remainingErrors: string[];
  message: string;
  buildLogs?: string;
}

export interface GetBuildErrorsInput {
  owner: string;
  repo: string;
  runId?: number;
  githubToken?: string;
}

export interface GetBuildErrorsResult {
  success: boolean;
  runId?: number;
  status?: string;
  conclusion?: string;
  errors: BuildErrorAnalysis[];
  rawLog?: string;
  message: string;
}

export interface ValidateFixInput {
  owner: string;
  repo: string;
  branch: string;
  baseRef?: string;
  githubToken?: string;
}

// ============================================================================
// 금지된 패턴 정의
// ============================================================================

const FORBIDDEN_PATTERNS = [
  '@ts-ignore',
  '@ts-nocheck',
  '@ts-expect-error',
  'eslint-disable',
  'eslint-disable-next-line',
  '.skip(',      // test.skip()
  '.only(',      // test.only() - CI에서 위험
  'as any',
  ': any',
  '// TODO: fix later',
  'FIXME: temporary',
] as const;

const ALLOWED_FIX_TYPES = [
  'type_addition',      // 타입 정의 추가
  'import_addition',    // import 추가
  'null_check',         // null/undefined 체크
  'type_assertion',     // 타입 단언 (as 특정타입, 단 any 제외)
  'logic_fix',          // 로직 수정
  'test_assertion_fix', // 테스트 기대값 수정
  'missing_return',     // 누락된 return 추가
  'interface_creation', // 인터페이스 생성
] as const;

// ============================================================================
// 빌드 에러 조회
// ============================================================================

export async function getBuildErrors(input: GetBuildErrorsInput): Promise<GetBuildErrorsResult> {
  const { owner, repo, runId, githubToken } = input;
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const token = githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return {
        success: false,
        errors: [],
        message: 'GitHub Token이 필요합니다',
      };
    }

    // gh CLI로 워크플로우 실행 조회
    let ghCommand: string;
    if (runId) {
      ghCommand = `gh run view ${runId} --repo ${owner}/${repo} --log-failed 2>/dev/null || gh run view ${runId} --repo ${owner}/${repo} --log`;
    } else {
      // 최근 실패한 실행 찾기
      ghCommand = `gh run list --repo ${owner}/${repo} --status failure --limit 1 --json databaseId,conclusion,status -q '.[0]'`;
    }

    // gh 인증
    await ssh.exec(`echo "${token}" | gh auth login --with-token 2>/dev/null || true`);

    const result = await ssh.exec(ghCommand);

    if (!runId) {
      // 최근 실패 실행 ID 파싱
      try {
        const runInfo = JSON.parse(result.stdout);
        if (!runInfo || !runInfo.databaseId) {
          return {
            success: true,
            errors: [],
            message: '최근 실패한 빌드가 없습니다',
          };
        }

        // 로그 가져오기
        const logResult = await ssh.exec(
          `gh run view ${runInfo.databaseId} --repo ${owner}/${repo} --log-failed 2>/dev/null || echo ""`
        );

        const errors = parseErrorLog(logResult.stdout);

        return {
          success: true,
          runId: runInfo.databaseId,
          status: runInfo.status,
          conclusion: runInfo.conclusion,
          errors,
          rawLog: logResult.stdout.substring(0, 10000), // 10KB 제한
          message: `${errors.length}개 에러 발견`,
        };
      } catch {
        return {
          success: false,
          errors: [],
          message: '워크플로우 실행 정보 파싱 실패',
        };
      }
    }

    const errors = parseErrorLog(result.stdout);

    return {
      success: true,
      runId,
      errors,
      rawLog: result.stdout.substring(0, 10000),
      message: `${errors.length}개 에러 발견`,
    };
  } catch (error) {
    return {
      success: false,
      errors: [],
      message: `에러: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 수정 검증 (No-Deletion Principle)
// ============================================================================

export async function validateFix(input: ValidateFixInput): Promise<FixValidation> {
  const { owner, repo, branch, baseRef = 'HEAD~1', githubToken } = input;
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const token = githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return {
        valid: false,
        reason: 'GitHub Token이 필요합니다',
        deletions: 0,
        additions: 0,
        hasForbiddenPatterns: false,
        forbiddenPatterns: [],
      };
    }

    // 레포지토리 클론 및 diff 분석
    const workDir = `/tmp/codeb-validate-${Date.now()}`;

    await ssh.exec(`rm -rf ${workDir} && mkdir -p ${workDir}`);
    await ssh.exec(
      `cd ${workDir} && git clone --depth 10 https://${token}@github.com/${owner}/${repo}.git . 2>/dev/null`
    );
    await ssh.exec(`cd ${workDir} && git checkout ${branch} 2>/dev/null`);

    // diff 통계
    const diffStat = await ssh.exec(
      `cd ${workDir} && git diff --numstat ${baseRef}..HEAD 2>/dev/null || echo "0 0"`
    );

    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const line of diffStat.stdout.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        totalAdditions += parseInt(parts[0]) || 0;
        totalDeletions += parseInt(parts[1]) || 0;
      }
    }

    // 금지 패턴 검사
    const diffContent = await ssh.exec(
      `cd ${workDir} && git diff ${baseRef}..HEAD 2>/dev/null || echo ""`
    );

    const foundForbiddenPatterns: string[] = [];
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (diffContent.stdout.includes(pattern)) {
        foundForbiddenPatterns.push(pattern);
      }
    }

    // 정리
    await ssh.exec(`rm -rf ${workDir}`);

    // 검증 결과
    const hasForbiddenPatterns = foundForbiddenPatterns.length > 0;
    const deletionExceedsAddition = totalDeletions > totalAdditions;

    let valid = true;
    let reason = '검증 통과';

    if (hasForbiddenPatterns) {
      valid = false;
      reason = `금지된 패턴 발견: ${foundForbiddenPatterns.join(', ')}`;
    } else if (deletionExceedsAddition) {
      valid = false;
      reason = `삭제(${totalDeletions})가 추가(${totalAdditions})보다 많음 - No-Deletion 원칙 위반`;
    }

    return {
      valid,
      reason,
      deletions: totalDeletions,
      additions: totalAdditions,
      hasForbiddenPatterns,
      forbiddenPatterns: foundForbiddenPatterns,
    };
  } catch (error) {
    return {
      valid: false,
      reason: `검증 에러: ${error instanceof Error ? error.message : String(error)}`,
      deletions: 0,
      additions: 0,
      hasForbiddenPatterns: false,
      forbiddenPatterns: [],
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 자동 수정 루프 (최대 시도 횟수까지 반복)
// ============================================================================

export async function autoFixBuildLoop(input: AutoFixLoopInput): Promise<AutoFixLoopResult> {
  const { owner, repo, branch, maxAttempts = 5, githubToken } = input;

  const fixedErrors: string[] = [];
  const remainingErrors: string[] = [];
  let attempts = 0;
  let lastBuildLog = '';

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;

    // 1. 빌드 에러 조회
    const errorResult = await getBuildErrors({ owner, repo, githubToken });

    if (!errorResult.success) {
      return {
        success: false,
        attempts,
        fixedErrors,
        remainingErrors: errorResult.errors.map(e => e.message),
        message: `빌드 에러 조회 실패: ${errorResult.message}`,
      };
    }

    // 에러가 없으면 성공
    if (errorResult.errors.length === 0) {
      return {
        success: true,
        attempts,
        fixedErrors,
        remainingErrors: [],
        message: `✅ 빌드 성공! ${attempts}번 시도 후 모든 에러 수정됨`,
        buildLogs: lastBuildLog,
      };
    }

    lastBuildLog = errorResult.rawLog || '';

    // 2. AI 수정 요청 (이 부분은 Claude API 호출이 필요)
    // 실제 구현에서는 여기서 Claude API를 호출하여 수정 제안을 받음
    // 현재는 MCP 클라이언트(Claude Code)가 직접 수정을 수행하도록 설계

    // 3. 수정 후 검증
    const validation = await validateFix({ owner, repo, branch, githubToken });

    if (!validation.valid) {
      return {
        success: false,
        attempts,
        fixedErrors,
        remainingErrors: errorResult.errors.map(e => e.message),
        message: `수정 검증 실패: ${validation.reason}`,
      };
    }

    // 4. 수정된 에러 기록
    for (const error of errorResult.errors) {
      if (!remainingErrors.includes(error.message)) {
        fixedErrors.push(error.message);
      }
    }

    // 5. 새 빌드 트리거 대기 (실제로는 GitHub Actions가 자동 트리거)
    // 여기서는 다음 루프에서 새 빌드 결과를 확인
  }

  return {
    success: false,
    attempts,
    fixedErrors,
    remainingErrors,
    message: `⚠️ 최대 시도 횟수(${maxAttempts})에 도달. 수동 검토 필요`,
    buildLogs: lastBuildLog,
  };
}

// ============================================================================
// 헬퍼 함수
// ============================================================================

function parseErrorLog(log: string): BuildErrorAnalysis[] {
  const errors: BuildErrorAnalysis[] = [];
  const lines = log.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // TypeScript 에러 패턴
    const tsMatch = line.match(/(.+\.tsx?):(\d+):(\d+):\s*error\s*TS(\d+):\s*(.+)/);
    if (tsMatch) {
      errors.push({
        errorType: 'typescript',
        file: tsMatch[1],
        line: parseInt(tsMatch[2]),
        message: `TS${tsMatch[4]}: ${tsMatch[5]}`,
      });
      continue;
    }

    // ESLint 에러 패턴
    const lintMatch = line.match(/(.+):(\d+):(\d+):\s*(error|warning)\s+(.+)\s+(\S+)$/);
    if (lintMatch) {
      errors.push({
        errorType: 'lint',
        file: lintMatch[1],
        line: parseInt(lintMatch[2]),
        message: `${lintMatch[5]} (${lintMatch[6]})`,
      });
      continue;
    }

    // Jest/테스트 에러 패턴
    const testMatch = line.match(/FAIL\s+(.+)/);
    if (testMatch) {
      errors.push({
        errorType: 'test',
        file: testMatch[1],
        message: 'Test failed',
      });
      continue;
    }

    // Import 에러 패턴
    if (line.includes('Cannot find module') || line.includes('Module not found')) {
      const moduleMatch = line.match(/(?:Cannot find module|Module not found).*['"](.+)['"]/);
      errors.push({
        errorType: 'import',
        file: 'unknown',
        message: moduleMatch ? `Module not found: ${moduleMatch[1]}` : line,
      });
      continue;
    }

    // 일반 에러 패턴
    if (line.toLowerCase().includes('error:') || line.includes('Error:')) {
      errors.push({
        errorType: 'unknown',
        file: 'unknown',
        message: line.trim(),
      });
    }
  }

  return errors;
}

// ============================================================================
// AI 수정 프롬프트 생성기
// ============================================================================

export function generateFixPrompt(errors: BuildErrorAnalysis[]): string {
  const errorSummary = errors.map((e, i) =>
    `${i + 1}. [${e.errorType}] ${e.file}${e.line ? `:${e.line}` : ''}\n   ${e.message}`
  ).join('\n\n');

  return `다음 빌드 에러를 수정해주세요.

## 에러 목록
${errorSummary}

## 절대 금지 규칙
1. 코드를 삭제하여 문제를 해결하지 마세요
2. 테스트를 skip하거나 제거하지 마세요
3. @ts-ignore, @ts-nocheck, @ts-expect-error 추가 금지
4. eslint-disable 추가 금지
5. any 타입 사용 금지
6. 기능을 제거하여 에러를 피하지 마세요

## 허용되는 수정
1. 타입 정의 추가/수정 (interface, type 생성)
2. 누락된 import 추가
3. null/undefined 체크 추가
4. 올바른 타입 캐스팅 (as 특정타입, any 제외)
5. 로직 버그 수정
6. 테스트 assertion 수정 (기대값이 잘못된 경우)
7. 누락된 return 추가

각 에러에 대해 파일을 읽고 수정해주세요.`;
}

// ============================================================================
// Export All
// ============================================================================

export const selfHealingTools = {
  getBuildErrors,
  validateFix,
  autoFixBuildLoop,
  generateFixPrompt,
  FORBIDDEN_PATTERNS,
  ALLOWED_FIX_TYPES,
};
