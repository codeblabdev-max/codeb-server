/**
 * CodeB Deploy MCP - GitHub Workflow 관리
 * gh CLI를 통한 워크플로우 실행, 모니터링, 관리
 */

import { getSSHClient } from '../lib/ssh-client.js';

// ============================================================================
// 타입 정의
// ============================================================================

export interface ManageWorkflowInput {
  action: 'run' | 'list' | 'status' | 'cancel' | 'logs' | 'watch';
  owner: string;
  repo: string;
  workflowId?: string;         // workflow 파일명 (예: ci.yml)
  runId?: number;               // 특정 실행 ID
  branch?: string;              // 실행할 브랜치
  inputs?: Record<string, string>; // workflow_dispatch 입력값
  githubToken?: string;
}

export interface WorkflowRunInfo {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  branch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  headSha: string;
}

export interface ManageWorkflowResult {
  success: boolean;
  action: string;
  data?: WorkflowRunInfo[] | WorkflowRunInfo | string;
  message: string;
}

// ============================================================================
// 워크플로우 관리
// ============================================================================

export async function manageWorkflow(input: ManageWorkflowInput): Promise<ManageWorkflowResult> {
  const { action, owner, repo, workflowId, runId, branch, inputs, githubToken } = input;
  const ssh = getSSHClient();
  const token = githubToken || process.env.GITHUB_TOKEN;

  try {
    await ssh.connect();

    // gh CLI 인증
    if (token) {
      await ssh.exec(`echo "${token}" | gh auth login --with-token 2>/dev/null || true`);
    }

    const repoPath = `${owner}/${repo}`;

    switch (action) {
      case 'list': {
        // 워크플로우 실행 목록 조회
        const result = await ssh.exec(
          `gh run list --repo ${repoPath} --limit 20 --json databaseId,displayTitle,status,conclusion,headBranch,event,createdAt,updatedAt,url,headSha`
        );

        if (result.code !== 0) {
          return { success: false, action, message: `워크플로우 목록 조회 실패: ${result.stderr}` };
        }

        const runs: WorkflowRunInfo[] = JSON.parse(result.stdout || '[]').map((run: any) => ({
          id: run.databaseId,
          name: run.displayTitle,
          status: run.status,
          conclusion: run.conclusion,
          branch: run.headBranch,
          event: run.event,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          url: run.url,
          headSha: run.headSha?.substring(0, 7),
        }));

        return {
          success: true,
          action,
          data: runs,
          message: `${runs.length}개 워크플로우 실행 조회됨`,
        };
      }

      case 'run': {
        // 워크플로우 실행
        if (!workflowId) {
          return { success: false, action, message: 'workflowId가 필요합니다' };
        }

        let cmd = `gh workflow run ${workflowId} --repo ${repoPath}`;

        if (branch) {
          cmd += ` --ref ${branch}`;
        }

        // inputs 추가
        if (inputs && Object.keys(inputs).length > 0) {
          for (const [key, value] of Object.entries(inputs)) {
            cmd += ` -f ${key}=${value}`;
          }
        }

        const result = await ssh.exec(cmd);

        if (result.code === 0) {
          // 방금 시작한 실행 ID 가져오기
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기

          const listResult = await ssh.exec(
            `gh run list --repo ${repoPath} --workflow ${workflowId} --limit 1 --json databaseId,status,url`
          );

          let runInfo = '';
          if (listResult.code === 0) {
            const runs = JSON.parse(listResult.stdout || '[]');
            if (runs.length > 0) {
              runInfo = `\nRun ID: ${runs[0].databaseId}\nURL: ${runs[0].url}`;
            }
          }

          return {
            success: true,
            action,
            message: `워크플로우 ${workflowId} 실행 시작됨${runInfo}`,
          };
        } else {
          return { success: false, action, message: `워크플로우 실행 실패: ${result.stderr}` };
        }
      }

      case 'status': {
        // 특정 실행의 상태 조회
        if (!runId) {
          return { success: false, action, message: 'runId가 필요합니다' };
        }

        const result = await ssh.exec(
          `gh run view ${runId} --repo ${repoPath} --json databaseId,displayTitle,status,conclusion,headBranch,event,createdAt,updatedAt,url,headSha,jobs`
        );

        if (result.code !== 0) {
          return { success: false, action, message: `상태 조회 실패: ${result.stderr}` };
        }

        const run = JSON.parse(result.stdout);

        const runInfo: WorkflowRunInfo = {
          id: run.databaseId,
          name: run.displayTitle,
          status: run.status,
          conclusion: run.conclusion,
          branch: run.headBranch,
          event: run.event,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          url: run.url,
          headSha: run.headSha?.substring(0, 7),
        };

        // Job 정보 추가
        const jobsInfo = run.jobs?.map((job: any) => ({
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
        }));

        return {
          success: true,
          action,
          data: runInfo,
          message: `Status: ${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}\nJobs: ${JSON.stringify(jobsInfo, null, 2)}`,
        };
      }

      case 'cancel': {
        // 워크플로우 실행 취소
        if (!runId) {
          return { success: false, action, message: 'runId가 필요합니다' };
        }

        const result = await ssh.exec(`gh run cancel ${runId} --repo ${repoPath}`);

        if (result.code === 0) {
          return { success: true, action, message: `Run ${runId} 취소됨` };
        } else {
          return { success: false, action, message: `취소 실패: ${result.stderr}` };
        }
      }

      case 'logs': {
        // 워크플로우 로그 조회
        if (!runId) {
          return { success: false, action, message: 'runId가 필요합니다' };
        }

        const result = await ssh.exec(
          `gh run view ${runId} --repo ${repoPath} --log-failed 2>/dev/null || gh run view ${runId} --repo ${repoPath} --log`,
          { timeout: 120000 }
        );

        if (result.code === 0) {
          // 로그가 너무 길면 마지막 부분만
          const logs = result.stdout;
          const maxLength = 10000;
          const truncatedLogs = logs.length > maxLength
            ? `...(truncated)\n\n${logs.substring(logs.length - maxLength)}`
            : logs;

          return {
            success: true,
            action,
            data: truncatedLogs,
            message: `Run ${runId} 로그 조회 완료`,
          };
        } else {
          return { success: false, action, message: `로그 조회 실패: ${result.stderr}` };
        }
      }

      case 'watch': {
        // 실행 중인 워크플로우 감시 (상태만 반환, 실제 watch는 CLI에서)
        if (!runId) {
          return { success: false, action, message: 'runId가 필요합니다' };
        }

        // 현재 상태 조회
        const result = await ssh.exec(
          `gh run view ${runId} --repo ${repoPath} --json status,conclusion,jobs`
        );

        if (result.code !== 0) {
          return { success: false, action, message: `상태 조회 실패: ${result.stderr}` };
        }

        const run = JSON.parse(result.stdout);

        // 진행 중인 job 찾기
        const inProgressJobs = run.jobs?.filter((j: any) => j.status === 'in_progress') || [];
        const completedJobs = run.jobs?.filter((j: any) => j.status === 'completed') || [];
        const queuedJobs = run.jobs?.filter((j: any) => j.status === 'queued') || [];

        const progress = {
          status: run.status,
          conclusion: run.conclusion,
          inProgress: inProgressJobs.map((j: any) => j.name),
          completed: completedJobs.map((j: any) => `${j.name} (${j.conclusion})`),
          queued: queuedJobs.map((j: any) => j.name),
        };

        return {
          success: true,
          action,
          data: JSON.stringify(progress, null, 2),
          message: run.status === 'completed'
            ? `완료: ${run.conclusion}`
            : `진행 중: ${inProgressJobs.map((j: any) => j.name).join(', ') || 'waiting...'}`,
        };
      }

      default:
        return { success: false, action, message: `알 수 없는 action: ${action}` };
    }
  } catch (error) {
    return {
      success: false,
      action,
      message: `에러: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 빌드 트리거 & 모니터링 통합
// ============================================================================

export interface TriggerBuildInput {
  owner: string;
  repo: string;
  branch?: string;
  workflowFile?: string;   // 기본값: ci-cd.yml
  waitForCompletion?: boolean;
  pollInterval?: number;   // 초 단위, 기본 30초
  timeout?: number;        // 초 단위, 기본 600초 (10분)
  githubToken?: string;
}

export interface TriggerBuildResult {
  success: boolean;
  runId?: number;
  status: 'triggered' | 'in_progress' | 'completed' | 'failed' | 'timed_out';
  conclusion?: string;
  url?: string;
  duration?: number;       // 초
  logs?: string;           // 실패 시 에러 로그
  message: string;
}

export async function triggerBuildAndMonitor(input: TriggerBuildInput): Promise<TriggerBuildResult> {
  const {
    owner,
    repo,
    branch = 'main',
    workflowFile = 'ci-cd.yml',
    waitForCompletion = true,
    pollInterval = 30,
    timeout = 600,
    githubToken,
  } = input;

  const ssh = getSSHClient();
  const token = githubToken || process.env.GITHUB_TOKEN;
  const repoPath = `${owner}/${repo}`;

  try {
    await ssh.connect();

    // gh CLI 인증
    if (token) {
      await ssh.exec(`echo "${token}" | gh auth login --with-token 2>/dev/null || true`);
    }

    // 1. 워크플로우 트리거
    const triggerResult = await ssh.exec(
      `gh workflow run ${workflowFile} --repo ${repoPath} --ref ${branch}`
    );

    if (triggerResult.code !== 0) {
      return {
        success: false,
        status: 'failed',
        message: `워크플로우 트리거 실패: ${triggerResult.stderr}`,
      };
    }

    // 2. 잠시 대기 후 Run ID 획득
    await new Promise(resolve => setTimeout(resolve, 3000));

    const listResult = await ssh.exec(
      `gh run list --repo ${repoPath} --workflow ${workflowFile} --branch ${branch} --limit 1 --json databaseId,status,url`
    );

    if (listResult.code !== 0) {
      return {
        success: false,
        status: 'triggered',
        message: '워크플로우가 트리거되었지만 Run ID를 가져올 수 없습니다',
      };
    }

    const runs = JSON.parse(listResult.stdout || '[]');
    if (runs.length === 0) {
      return {
        success: false,
        status: 'triggered',
        message: '워크플로우가 트리거되었지만 실행을 찾을 수 없습니다',
      };
    }

    const runId = runs[0].databaseId;
    const runUrl = runs[0].url;

    // 3. 완료 대기하지 않으면 여기서 반환
    if (!waitForCompletion) {
      return {
        success: true,
        runId,
        status: 'triggered',
        url: runUrl,
        message: `워크플로우 트리거 완료. Run ID: ${runId}`,
      };
    }

    // 4. 완료까지 폴링
    const startTime = Date.now();
    let lastStatus = '';

    while (true) {
      const elapsed = (Date.now() - startTime) / 1000;

      if (elapsed > timeout) {
        return {
          success: false,
          runId,
          status: 'timed_out',
          url: runUrl,
          duration: elapsed,
          message: `타임아웃 (${timeout}초 초과). 워크플로우가 아직 실행 중일 수 있습니다.`,
        };
      }

      const statusResult = await ssh.exec(
        `gh run view ${runId} --repo ${repoPath} --json status,conclusion`
      );

      if (statusResult.code === 0) {
        const runStatus = JSON.parse(statusResult.stdout);

        if (runStatus.status !== lastStatus) {
          lastStatus = runStatus.status;
        }

        if (runStatus.status === 'completed') {
          const duration = (Date.now() - startTime) / 1000;

          if (runStatus.conclusion === 'success') {
            return {
              success: true,
              runId,
              status: 'completed',
              conclusion: 'success',
              url: runUrl,
              duration,
              message: `빌드 성공! (${Math.round(duration)}초)`,
            };
          } else {
            // 실패 시 로그 가져오기
            const logsResult = await ssh.exec(
              `gh run view ${runId} --repo ${repoPath} --log-failed`,
              { timeout: 60000 }
            );

            const failedLogs = logsResult.stdout?.substring(logsResult.stdout.length - 5000) || '';

            return {
              success: false,
              runId,
              status: 'failed',
              conclusion: runStatus.conclusion,
              url: runUrl,
              duration,
              logs: failedLogs,
              message: `빌드 실패: ${runStatus.conclusion}`,
            };
          }
        }
      }

      // 폴링 대기
      await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));
    }
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      message: `에러: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 빌드 에러 자동 피드백 루프
// ============================================================================

export interface BuildFeedbackInput {
  owner: string;
  repo: string;
  branch?: string;
  checkLatest?: boolean;     // 최근 실패한 빌드 확인
  runId?: number;            // 특정 Run ID
  githubToken?: string;
}

export interface BuildFeedbackResult {
  success: boolean;
  hasBuildError: boolean;
  runId?: number;
  status?: string;
  conclusion?: string;
  url?: string;
  errorSummary?: {
    errorType: string;
    errorMessage: string;
    affectedFiles: string[];
    suggestedFix: string;
  };
  rawLogs?: string;
  message: string;
}

export async function checkBuildAndGetFeedback(input: BuildFeedbackInput): Promise<BuildFeedbackResult> {
  const { owner, repo, branch, checkLatest = true, runId, githubToken } = input;
  const ssh = getSSHClient();
  const token = githubToken || process.env.GITHUB_TOKEN;
  const repoPath = `${owner}/${repo}`;

  try {
    await ssh.connect();

    if (token) {
      await ssh.exec(`echo "${token}" | gh auth login --with-token 2>/dev/null || true`);
    }

    // 1. 확인할 Run ID 결정
    let targetRunId = runId;

    if (!targetRunId && checkLatest) {
      let cmd = `gh run list --repo ${repoPath} --limit 1 --json databaseId,status,conclusion`;
      if (branch) {
        cmd += ` --branch ${branch}`;
      }

      const listResult = await ssh.exec(cmd);
      if (listResult.code === 0) {
        const runs = JSON.parse(listResult.stdout || '[]');
        if (runs.length > 0) {
          targetRunId = runs[0].databaseId;
        }
      }
    }

    if (!targetRunId) {
      return {
        success: false,
        hasBuildError: false,
        message: '확인할 워크플로우 실행을 찾을 수 없습니다',
      };
    }

    // 2. 상태 조회
    const statusResult = await ssh.exec(
      `gh run view ${targetRunId} --repo ${repoPath} --json status,conclusion,url,headBranch,displayTitle`
    );

    if (statusResult.code !== 0) {
      return {
        success: false,
        hasBuildError: false,
        message: `상태 조회 실패: ${statusResult.stderr}`,
      };
    }

    const run = JSON.parse(statusResult.stdout);

    // 3. 성공이면 바로 반환
    if (run.status === 'completed' && run.conclusion === 'success') {
      return {
        success: true,
        hasBuildError: false,
        runId: targetRunId,
        status: run.status,
        conclusion: run.conclusion,
        url: run.url,
        message: '✅ 빌드 성공! 에러 없음',
      };
    }

    // 4. 아직 진행 중
    if (run.status !== 'completed') {
      return {
        success: true,
        hasBuildError: false,
        runId: targetRunId,
        status: run.status,
        url: run.url,
        message: `⏳ 빌드 진행 중... (${run.status})`,
      };
    }

    // 5. 실패 - 로그 분석
    const logsResult = await ssh.exec(
      `gh run view ${targetRunId} --repo ${repoPath} --log-failed`,
      { timeout: 60000 }
    );

    const logs = logsResult.stdout || '';

    // 에러 분석
    const errorSummary = analyzeLogsForError(logs);

    return {
      success: true,
      hasBuildError: true,
      runId: targetRunId,
      status: run.status,
      conclusion: run.conclusion,
      url: run.url,
      errorSummary,
      rawLogs: logs.substring(logs.length - 3000), // 마지막 3000자
      message: `❌ 빌드 실패: ${errorSummary.errorType}\n${errorSummary.errorMessage}\n\n💡 권장: ${errorSummary.suggestedFix}`,
    };
  } catch (error) {
    return {
      success: false,
      hasBuildError: false,
      message: `에러: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

function analyzeLogsForError(logs: string): {
  errorType: string;
  errorMessage: string;
  affectedFiles: string[];
  suggestedFix: string;
} {
  const lowerLogs = logs.toLowerCase();
  const affectedFiles: string[] = [];

  // 파일 경로 추출
  const fileMatches = logs.match(/([^\s]+\.(ts|tsx|js|jsx|json))[:(\d+]/g) || [];
  affectedFiles.push(...new Set(fileMatches.map(m => m.split(/[:(]/)[0])));

  // TypeScript 에러
  if (logs.includes('error TS') || logs.includes('tsc')) {
    const tsErrors = logs.match(/error TS\d+: .+/g) || [];
    return {
      errorType: 'TypeScript 컴파일 에러',
      errorMessage: tsErrors.slice(0, 3).join('\n') || 'TypeScript 타입 오류',
      affectedFiles: affectedFiles.slice(0, 5),
      suggestedFix: '`npx tsc --noEmit` 실행하여 로컬에서 에러 확인 후 수정',
    };
  }

  // ESLint 에러
  if (lowerLogs.includes('eslint') || lowerLogs.includes('lint')) {
    return {
      errorType: 'ESLint 에러',
      errorMessage: 'ESLint 규칙 위반',
      affectedFiles: affectedFiles.slice(0, 5),
      suggestedFix: '`npx eslint --fix .` 실행하여 자동 수정 시도',
    };
  }

  // 테스트 실패
  if (lowerLogs.includes('test') && (lowerLogs.includes('fail') || lowerLogs.includes('error'))) {
    return {
      errorType: '테스트 실패',
      errorMessage: '테스트 케이스 실패',
      affectedFiles: affectedFiles.slice(0, 5),
      suggestedFix: '`npm test` 실행하여 실패한 테스트 확인 후 수정',
    };
  }

  // 의존성 에러
  if (lowerLogs.includes('npm err') || lowerLogs.includes('pnpm err') || lowerLogs.includes('cannot find module')) {
    return {
      errorType: '의존성 에러',
      errorMessage: '패키지 설치 또는 모듈 찾기 실패',
      affectedFiles: ['package.json', 'package-lock.json'],
      suggestedFix: '`rm -rf node_modules && npm install` 실행하여 재설치',
    };
  }

  // Docker 에러
  if (lowerLogs.includes('docker') || lowerLogs.includes('dockerfile')) {
    return {
      errorType: 'Docker 빌드 에러',
      errorMessage: 'Docker 이미지 빌드 실패',
      affectedFiles: ['Dockerfile', '.dockerignore'],
      suggestedFix: '`docker build -t test .` 실행하여 로컬에서 빌드 테스트',
    };
  }

  // 빌드 에러
  if (lowerLogs.includes('build') && lowerLogs.includes('fail')) {
    return {
      errorType: '빌드 에러',
      errorMessage: '프로젝트 빌드 실패',
      affectedFiles: affectedFiles.slice(0, 5),
      suggestedFix: '`npm run build` 실행하여 로컬에서 빌드 확인',
    };
  }

  // 알 수 없는 에러
  return {
    errorType: '알 수 없는 에러',
    errorMessage: '에러 유형을 자동 판별할 수 없습니다',
    affectedFiles: affectedFiles.slice(0, 5),
    suggestedFix: 'GitHub Actions 로그에서 상세 에러 확인 필요',
  };
}
