/**
 * CodeB Deploy MCP - GitHub Actions 에러 조회 및 자동 수정 제안
 * GitHub API를 통해 워크플로우 실행 로그를 가져오고 에러를 분석합니다.
 */

import { Octokit } from '@octokit/rest';

// ============================================================================
// 타입 정의
// ============================================================================

export interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_sha: string;
  head_branch: string;
  event: string;
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string | null;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at?: string;
  completed_at?: string;
}

export interface WorkflowError {
  runId: number;
  runUrl: string;
  branch: string;
  commit: string;
  jobName: string;
  stepName: string;
  stepNumber: number;
  errorType: ErrorType;
  errorMessage: string;
  errorDetails: string[];
  timestamp: string;
}

export type ErrorType =
  | 'typescript_error'
  | 'eslint_error'
  | 'build_error'
  | 'test_error'
  | 'dependency_error'
  | 'docker_error'
  | 'deploy_error'
  | 'unknown_error';

export interface ErrorAnalysis {
  error: WorkflowError;
  analysis: {
    category: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    affectedFiles: string[];
    rootCause: string;
    suggestedFixes: SuggestedFix[];
  };
}

export interface SuggestedFix {
  description: string;
  file?: string;
  lineNumber?: number;
  currentCode?: string;
  suggestedCode?: string;
  command?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface GetWorkflowErrorsInput {
  owner: string;
  repo: string;
  branch?: string;
  limit?: number;
  githubToken?: string;
}

export interface GetWorkflowErrorsResult {
  success: boolean;
  errors: WorkflowError[];
  summary: {
    totalRuns: number;
    failedRuns: number;
    errorTypes: Record<ErrorType, number>;
  };
  message?: string;
}

export interface AnalyzeBuildErrorInput {
  error: WorkflowError;
  projectPath?: string;
}

export interface AnalyzeBuildErrorResult {
  success: boolean;
  analysis: ErrorAnalysis;
  message?: string;
}

// ============================================================================
// GitHub Actions 에러 조회
// ============================================================================

export async function getWorkflowErrors(input: GetWorkflowErrorsInput): Promise<GetWorkflowErrorsResult> {
  const { owner, repo, branch, limit = 10, githubToken } = input;

  const token = githubToken || process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      success: false,
      errors: [],
      summary: { totalRuns: 0, failedRuns: 0, errorTypes: {} as Record<ErrorType, number> },
      message: 'GitHub 토큰이 필요합니다. GITHUB_TOKEN 환경 변수를 설정하거나 githubToken 파라미터를 전달하세요.',
    };
  }

  const octokit = new Octokit({ auth: token });
  const errors: WorkflowError[] = [];
  const errorTypes: Record<ErrorType, number> = {
    typescript_error: 0,
    eslint_error: 0,
    build_error: 0,
    test_error: 0,
    dependency_error: 0,
    docker_error: 0,
    deploy_error: 0,
    unknown_error: 0,
  };

  try {
    // 워크플로우 실행 목록 가져오기
    const { data: runs } = await octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      branch,
      status: 'completed',
      per_page: limit,
    });

    const failedRuns = runs.workflow_runs.filter(run => run.conclusion === 'failure');

    for (const run of failedRuns) {
      // 각 실행의 Job 목록 가져오기
      const { data: jobs } = await octokit.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: run.id,
      });

      for (const job of jobs.jobs) {
        if (job.conclusion === 'failure') {
          // 실패한 step 찾기
          const failedSteps = job.steps?.filter(step => step.conclusion === 'failure') || [];

          for (const step of failedSteps) {
            // Job 로그 가져오기
            let logContent = '';
            try {
              const { data: logs } = await octokit.actions.downloadJobLogsForWorkflowRun({
                owner,
                repo,
                job_id: job.id,
              });
              logContent = typeof logs === 'string' ? logs : '';
            } catch {
              // 로그를 가져올 수 없는 경우 빈 문자열 사용
            }

            const errorInfo = parseErrorFromLogs(logContent, step.name);

            const workflowError: WorkflowError = {
              runId: run.id,
              runUrl: run.html_url,
              branch: run.head_branch || 'unknown',
              commit: run.head_sha.substring(0, 7),
              jobName: job.name,
              stepName: step.name,
              stepNumber: step.number,
              errorType: errorInfo.type,
              errorMessage: errorInfo.message,
              errorDetails: errorInfo.details,
              timestamp: job.completed_at || new Date().toISOString(),
            };

            errors.push(workflowError);
            errorTypes[errorInfo.type]++;
          }
        }
      }
    }

    return {
      success: true,
      errors,
      summary: {
        totalRuns: runs.workflow_runs.length,
        failedRuns: failedRuns.length,
        errorTypes,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [],
      summary: { totalRuns: 0, failedRuns: 0, errorTypes },
      message: `GitHub API 에러: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// 에러 로그 파싱
// ============================================================================

interface ParsedError {
  type: ErrorType;
  message: string;
  details: string[];
}

function parseErrorFromLogs(logs: string, stepName: string): ParsedError {
  const lowerLogs = logs.toLowerCase();
  const lowerStep = stepName.toLowerCase();
  const details: string[] = [];

  // TypeScript 에러 패턴
  const tsErrorPattern = /error TS\d+: (.+)/gi;
  const tsMatches = [...logs.matchAll(tsErrorPattern)];
  if (tsMatches.length > 0) {
    details.push(...tsMatches.slice(0, 5).map(m => m[0]));
    return {
      type: 'typescript_error',
      message: `TypeScript 컴파일 에러 ${tsMatches.length}개 발견`,
      details,
    };
  }

  // ESLint 에러 패턴
  const eslintPattern = /\d+:\d+\s+error\s+(.+?)\s+\S+$/gm;
  const eslintMatches = [...logs.matchAll(eslintPattern)];
  if (eslintMatches.length > 0 || lowerStep.includes('lint')) {
    details.push(...eslintMatches.slice(0, 5).map(m => m[0]));
    return {
      type: 'eslint_error',
      message: `ESLint 에러 ${eslintMatches.length}개 발견`,
      details,
    };
  }

  // 테스트 에러 패턴
  if (lowerStep.includes('test') || lowerLogs.includes('test failed') || lowerLogs.includes('jest')) {
    const testPattern = /(FAIL|✕|✖)\s+(.+)/gm;
    const testMatches = [...logs.matchAll(testPattern)];
    details.push(...testMatches.slice(0, 5).map(m => m[0]));
    return {
      type: 'test_error',
      message: `테스트 실패`,
      details,
    };
  }

  // 의존성 에러 패턴
  if (lowerLogs.includes('npm err!') || lowerLogs.includes('pnpm err!') || lowerLogs.includes('yarn error')) {
    const depPattern = /(npm ERR!|pnpm ERR!|error)\s+(.+)/gi;
    const depMatches = [...logs.matchAll(depPattern)];
    details.push(...depMatches.slice(0, 5).map(m => m[0]));
    return {
      type: 'dependency_error',
      message: '패키지 설치 또는 의존성 해결 실패',
      details,
    };
  }

  // Docker 에러 패턴
  if (lowerStep.includes('docker') || lowerStep.includes('build') && lowerLogs.includes('dockerfile')) {
    const dockerPattern = /(error|failed).*docker/gi;
    const dockerMatches = [...logs.matchAll(dockerPattern)];
    details.push(...dockerMatches.slice(0, 5).map(m => m[0]));
    return {
      type: 'docker_error',
      message: 'Docker 빌드 또는 푸시 실패',
      details,
    };
  }

  // 배포 에러 패턴
  if (lowerStep.includes('deploy') || lowerLogs.includes('deployment failed')) {
    return {
      type: 'deploy_error',
      message: '배포 실패',
      details: extractErrorLines(logs, 5),
    };
  }

  // 빌드 에러 패턴
  if (lowerStep.includes('build') || lowerLogs.includes('build failed')) {
    return {
      type: 'build_error',
      message: '빌드 실패',
      details: extractErrorLines(logs, 5),
    };
  }

  // 알 수 없는 에러
  return {
    type: 'unknown_error',
    message: `${stepName} 단계에서 실패`,
    details: extractErrorLines(logs, 5),
  };
}

function extractErrorLines(logs: string, count: number): string[] {
  const lines = logs.split('\n');
  const errorLines: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) {
      errorLines.push(line.trim());
      if (errorLines.length >= count) break;
    }
  }

  return errorLines;
}

// ============================================================================
// 에러 분석 및 수정 제안
// ============================================================================

export async function analyzeBuildError(input: AnalyzeBuildErrorInput): Promise<AnalyzeBuildErrorResult> {
  const { error } = input;

  const suggestedFixes: SuggestedFix[] = [];
  let rootCause = '';
  let category = '';
  let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  const affectedFiles: string[] = [];

  switch (error.errorType) {
    case 'typescript_error':
      category = 'TypeScript 컴파일';
      severity = 'high';
      rootCause = 'TypeScript 타입 검사 또는 문법 오류';

      // 에러 메시지에서 파일 추출
      for (const detail of error.errorDetails) {
        const fileMatch = detail.match(/([^\s]+\.(ts|tsx))[:(\d+]/);
        if (fileMatch) {
          affectedFiles.push(fileMatch[1]);
        }
      }

      suggestedFixes.push({
        description: '로컬에서 TypeScript 컴파일 실행하여 에러 확인',
        command: 'npx tsc --noEmit',
        priority: 'high',
      });

      suggestedFixes.push({
        description: 'TypeScript 버전 호환성 확인',
        command: 'npx tsc --version',
        priority: 'medium',
      });
      break;

    case 'eslint_error':
      category = 'ESLint 코드 품질';
      severity = 'medium';
      rootCause = 'ESLint 규칙 위반';

      suggestedFixes.push({
        description: 'ESLint 자동 수정 실행',
        command: 'npx eslint --fix .',
        priority: 'high',
      });

      suggestedFixes.push({
        description: '로컬에서 ESLint 실행하여 에러 확인',
        command: 'npx eslint .',
        priority: 'medium',
      });
      break;

    case 'test_error':
      category = '테스트';
      severity = 'high';
      rootCause = '테스트 케이스 실패';

      suggestedFixes.push({
        description: '로컬에서 테스트 실행하여 실패 케이스 확인',
        command: 'npm test',
        priority: 'high',
      });

      suggestedFixes.push({
        description: '특정 테스트 파일만 실행하여 디버깅',
        command: 'npm test -- --watch',
        priority: 'medium',
      });
      break;

    case 'dependency_error':
      category = '의존성';
      severity = 'critical';
      rootCause = '패키지 설치 실패 또는 버전 충돌';

      suggestedFixes.push({
        description: 'node_modules 삭제 후 재설치',
        command: 'rm -rf node_modules package-lock.json && npm install',
        priority: 'high',
      });

      suggestedFixes.push({
        description: '의존성 충돌 확인',
        command: 'npm ls --all',
        priority: 'medium',
      });

      suggestedFixes.push({
        description: 'package-lock.json 업데이트',
        command: 'npm update',
        priority: 'medium',
      });
      break;

    case 'docker_error':
      category = 'Docker 빌드';
      severity = 'high';
      rootCause = 'Dockerfile 설정 오류 또는 빌드 컨텍스트 문제';

      suggestedFixes.push({
        description: '로컬에서 Docker 빌드 테스트',
        command: 'docker build -t test-build .',
        priority: 'high',
      });

      suggestedFixes.push({
        description: '.dockerignore 파일 확인',
        priority: 'medium',
      });

      suggestedFixes.push({
        description: 'Dockerfile 멀티스테이지 빌드 최적화',
        priority: 'low',
      });
      break;

    case 'deploy_error':
      category = '배포';
      severity = 'critical';
      rootCause = '배포 스크립트 오류 또는 서버 연결 문제';

      suggestedFixes.push({
        description: 'SSH 연결 및 서버 상태 확인',
        command: 'ssh user@server "hostname && uptime"',
        priority: 'high',
      });

      suggestedFixes.push({
        description: '배포 스크립트 권한 확인',
        priority: 'medium',
      });
      break;

    case 'build_error':
      category = '빌드';
      severity = 'high';
      rootCause = '빌드 프로세스 실패';

      suggestedFixes.push({
        description: '로컬에서 빌드 실행',
        command: 'npm run build',
        priority: 'high',
      });

      suggestedFixes.push({
        description: '빌드 캐시 삭제 후 재빌드',
        command: 'rm -rf .next dist build && npm run build',
        priority: 'medium',
      });
      break;

    default:
      category = '알 수 없음';
      severity = 'medium';
      rootCause = '에러 원인 분석 필요';

      suggestedFixes.push({
        description: 'GitHub Actions 로그에서 상세 에러 확인',
        priority: 'high',
      });

      suggestedFixes.push({
        description: '로컬 환경에서 동일한 단계 재현',
        priority: 'medium',
      });
  }

  return {
    success: true,
    analysis: {
      error,
      analysis: {
        category,
        severity,
        affectedFiles,
        rootCause,
        suggestedFixes,
      },
    },
  };
}

// ============================================================================
// 자동 수정 시도 (선택적)
// ============================================================================

export interface ApplyFixInput {
  fix: SuggestedFix;
  projectPath: string;
  dryRun?: boolean;
}

export interface ApplyFixResult {
  success: boolean;
  applied: boolean;
  output?: string;
  message: string;
}

export async function applyFix(input: ApplyFixInput): Promise<ApplyFixResult> {
  const { fix, dryRun = true } = input;

  if (dryRun) {
    return {
      success: true,
      applied: false,
      message: `[DRY RUN] 다음 수정을 적용할 수 있습니다:\n${fix.description}\n${fix.command ? `명령어: ${fix.command}` : ''}`,
    };
  }

  // 실제 수정은 Claude Code가 직접 수행하도록 안내만 제공
  return {
    success: true,
    applied: false,
    message: `수정을 적용하려면 다음을 실행하세요:\n${fix.command || fix.description}`,
  };
}

// ============================================================================
// 에러 요약 리포트 생성
// ============================================================================

export function generateErrorReport(errors: WorkflowError[], analyses: ErrorAnalysis[]): string {
  if (errors.length === 0) {
    return '✅ 최근 워크플로우 실행에서 에러가 발견되지 않았습니다.';
  }

  let report = `# GitHub Actions 에러 리포트\n\n`;
  report += `📅 생성 시간: ${new Date().toISOString()}\n`;
  report += `🔴 총 에러 수: ${errors.length}\n\n`;

  // 에러 유형별 요약
  const typeCount: Record<string, number> = {};
  for (const error of errors) {
    typeCount[error.errorType] = (typeCount[error.errorType] || 0) + 1;
  }

  report += `## 에러 유형별 요약\n\n`;
  for (const [type, count] of Object.entries(typeCount)) {
    report += `- ${type}: ${count}개\n`;
  }

  report += `\n## 상세 에러 목록\n\n`;

  for (let i = 0; i < errors.length; i++) {
    const error = errors[i];
    const analysis = analyses[i];

    report += `### ${i + 1}. ${error.jobName} / ${error.stepName}\n\n`;
    report += `- **브랜치**: ${error.branch}\n`;
    report += `- **커밋**: ${error.commit}\n`;
    report += `- **에러 유형**: ${error.errorType}\n`;
    report += `- **메시지**: ${error.errorMessage}\n`;
    report += `- **링크**: ${error.runUrl}\n`;

    if (error.errorDetails.length > 0) {
      report += `\n**에러 상세:**\n\`\`\`\n${error.errorDetails.join('\n')}\n\`\`\`\n`;
    }

    if (analysis) {
      report += `\n**분석 결과:**\n`;
      report += `- 카테고리: ${analysis.analysis.category}\n`;
      report += `- 심각도: ${analysis.analysis.severity}\n`;
      report += `- 원인: ${analysis.analysis.rootCause}\n`;

      if (analysis.analysis.suggestedFixes.length > 0) {
        report += `\n**권장 수정:**\n`;
        for (const fix of analysis.analysis.suggestedFixes) {
          report += `- [${fix.priority}] ${fix.description}`;
          if (fix.command) {
            report += `\n  \`\`\`bash\n  ${fix.command}\n  \`\`\``;
          }
          report += `\n`;
        }
      }
    }

    report += `\n---\n\n`;
  }

  return report;
}
