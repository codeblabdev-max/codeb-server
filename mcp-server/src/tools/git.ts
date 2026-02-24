/**
 * CodeB v9.0 - Git/PR Management Tools
 *
 * GitHub REST API를 통한 PR 관리:
 * - pr_list: 열린 PR 목록 조회
 * - pr_review: PR 승인
 * - pr_merge: PR 머지
 * - pr_create: PR 생성
 * - git_sync: 프로젝트 브랜치 상태 확인
 */

import { z } from 'zod';
import type { AuthContext } from '../lib/types.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Constants
// ============================================================================

const GITHUB_API = 'https://api.github.com';
const DEFAULT_ORG = 'codeb-dev-run';

function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN 환경변수가 설정되지 않았습니다.');
  }
  return token;
}

async function githubFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getGitHubToken();
  const url = `${GITHUB_API}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function resolveRepo(projectName?: string): string {
  if (!projectName) {
    throw new Error('projectName이 필요합니다.');
  }
  return `${DEFAULT_ORG}/${projectName}`;
}

// ============================================================================
// Input Schemas
// ============================================================================

export const prListInputSchema = z.object({
  projectName: z.string().min(1).describe('Project name (GitHub repo name)'),
  state: z.enum(['open', 'closed', 'all']).default('open').describe('PR state filter'),
});

export const prReviewInputSchema = z.object({
  projectName: z.string().min(1).describe('Project name'),
  prNumber: z.number().int().positive().describe('PR number'),
  action: z.enum(['approve', 'comment', 'request_changes']).default('approve'),
  body: z.string().optional().describe('Review comment'),
});

export const prMergeInputSchema = z.object({
  projectName: z.string().min(1).describe('Project name'),
  prNumber: z.number().int().positive().describe('PR number'),
  method: z.enum(['merge', 'squash', 'rebase']).default('merge'),
});

export const prCreateInputSchema = z.object({
  projectName: z.string().min(1).describe('Project name'),
  title: z.string().min(1).max(200).describe('PR title'),
  body: z.string().optional().describe('PR description'),
  baseBranch: z.string().default('main').describe('Base branch'),
  headBranch: z.string().min(1).describe('Head/source branch'),
});

export const gitSyncInputSchema = z.object({
  projectName: z.string().min(1).describe('Project name'),
});

// ============================================================================
// pr_list - 열린 PR 목록 조회
// ============================================================================

export const prListTool = {
  name: 'pr_list',
  description: 'List pull requests for a GitHub repository',
  inputSchema: prListInputSchema,

  async execute(
    params: z.infer<typeof prListInputSchema>,
    _auth: AuthContext
  ) {
    const { projectName, state } = params;
    const repo = resolveRepo(projectName);

    try {
      const prs = await githubFetch(
        `/repos/${repo}/pulls?state=${state}&per_page=30&sort=updated&direction=desc`
      );

      const result = prs.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login || 'unknown',
        branch: pr.head?.ref || '',
        state: pr.state,
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        draft: pr.draft || false,
      }));

      logger.info('PR list retrieved', { projectName, count: result.length, state });

      return {
        success: true,
        projectName,
        state,
        count: result.length,
        prs: result,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('PR list failed', { projectName, error: msg });
      return { success: false, error: msg };
    }
  },
};

// ============================================================================
// pr_review - PR 승인/코멘트
// ============================================================================

export const prReviewTool = {
  name: 'pr_review',
  description: 'Review a pull request (approve, comment, or request changes)',
  inputSchema: prReviewInputSchema,

  async execute(
    params: z.infer<typeof prReviewInputSchema>,
    _auth: AuthContext
  ) {
    const { projectName, prNumber, action, body } = params;
    const repo = resolveRepo(projectName);

    // GitHub API event mapping
    const eventMap: Record<string, string> = {
      approve: 'APPROVE',
      comment: 'COMMENT',
      request_changes: 'REQUEST_CHANGES',
    };

    try {
      await githubFetch(`/repos/${repo}/pulls/${prNumber}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          event: eventMap[action],
          body: body || (action === 'approve' ? 'LGTM' : ''),
        }),
      });

      logger.info('PR reviewed', { projectName, prNumber, action });

      return {
        success: true,
        projectName,
        prNumber,
        action,
        message: `PR #${prNumber} ${action} 완료`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('PR review failed', { projectName, prNumber, error: msg });
      return { success: false, error: msg };
    }
  },
};

// ============================================================================
// pr_merge - PR 머지
// ============================================================================

export const prMergeTool = {
  name: 'pr_merge',
  description: 'Merge a pull request',
  inputSchema: prMergeInputSchema,

  async execute(
    params: z.infer<typeof prMergeInputSchema>,
    _auth: AuthContext
  ) {
    const { projectName, prNumber, method } = params;
    const repo = resolveRepo(projectName);

    try {
      const result = await githubFetch(`/repos/${repo}/pulls/${prNumber}/merge`, {
        method: 'PUT',
        body: JSON.stringify({
          merge_method: method,
        }),
      });

      logger.info('PR merged', { projectName, prNumber, method, sha: result.sha });

      return {
        success: true,
        projectName,
        prNumber,
        method,
        mergedSha: result.sha,
        message: `PR #${prNumber} ${method} 완료`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('PR merge failed', { projectName, prNumber, error: msg });
      return { success: false, error: msg };
    }
  },
};

// ============================================================================
// pr_create - PR 생성
// ============================================================================

export const prCreateTool = {
  name: 'pr_create',
  description: 'Create a pull request from a branch to main',
  inputSchema: prCreateInputSchema,

  async execute(
    params: z.infer<typeof prCreateInputSchema>,
    _auth: AuthContext
  ) {
    const { projectName, title, body, baseBranch, headBranch } = params;
    const repo = resolveRepo(projectName);

    try {
      const result = await githubFetch(`/repos/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          body: body || '',
          head: headBranch,
          base: baseBranch,
        }),
      });

      logger.info('PR created', { projectName, prNumber: result.number });

      return {
        success: true,
        projectName,
        prNumber: result.number,
        url: result.html_url,
        message: `PR #${result.number} 생성 완료: ${result.html_url}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('PR create failed', { projectName, error: msg });
      return { success: false, error: msg };
    }
  },
};

// ============================================================================
// git_sync - 브랜치 상태 확인 (원격 브랜치 목록 + 커밋 비교)
// ============================================================================

export const gitSyncTool = {
  name: 'git_sync',
  description: 'Check branch status and list remote branches for a project',
  inputSchema: gitSyncInputSchema,

  async execute(
    params: z.infer<typeof gitSyncInputSchema>,
    _auth: AuthContext
  ) {
    const { projectName } = params;
    const repo = resolveRepo(projectName);

    try {
      // 1. 원격 브랜치 목록
      const branches = await githubFetch(
        `/repos/${repo}/branches?per_page=30`
      );

      const branchList = branches.map((b: any) => ({
        name: b.name,
        sha: b.commit?.sha?.slice(0, 7) || '',
        protected: b.protected || false,
      }));

      // 2. 최근 커밋 (main 기준)
      const commits = await githubFetch(
        `/repos/${repo}/commits?sha=main&per_page=5`
      );

      const recentCommits = commits.map((c: any) => ({
        sha: c.sha?.slice(0, 7) || '',
        message: c.commit?.message?.split('\n')[0] || '',
        author: c.commit?.author?.name || c.author?.login || 'unknown',
        date: c.commit?.author?.date || '',
      }));

      // 3. 열린 PR 수
      const openPrs = await githubFetch(
        `/repos/${repo}/pulls?state=open&per_page=1`
      );

      logger.info('Git sync check', { projectName, branches: branchList.length });

      return {
        success: true,
        projectName,
        defaultBranch: 'main',
        branchCount: branchList.length,
        branches: branchList,
        recentCommits,
        openPrCount: Array.isArray(openPrs) ? openPrs.length : 0,
        message: `${branchList.length}개 브랜치, 최근 커밋: ${recentCommits[0]?.message || 'N/A'}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Git sync failed', { projectName, error: msg });
      return { success: false, error: msg };
    }
  },
};

export default { prListTool, prReviewTool, prMergeTool, prCreateTool, gitSyncTool };
