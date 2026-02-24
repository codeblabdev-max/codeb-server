/**
 * CodeB v8.1 - Work Task Management Tool
 * Team Collaboration & Conflict Prevention System
 *
 * 팀원 간 파일 수정 충돌을 방지하는 작업 관리 시스템.
 * - task_create: 작업 등록 + MD 문서 + 파일 잠금
 * - task_list: 진행중 작업 목록
 * - task_get: 작업 상세 (MD 문서 포함)
 * - task_update: 상태/파일/노트 갱신
 * - task_check: 충돌 확인 (파일 기반) — Hook에서 호출
 * - task_complete: 배포 완료 → 잠금 해제
 */

import { z } from 'zod';
import type { AuthContext, TaskStatus, TaskPriority, ProgressNote, ConflictInfo, TaskCheckResult } from '../lib/types.js';
import { WorkTaskRepo, WorkTaskFileRepo } from '../lib/database.js';
import { auth } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Input Schemas
// ============================================================================

const taskCreateSchema = z.object({
  projectName: z.string().min(1).describe('프로젝트 이름'),
  title: z.string().min(1).max(500).describe('작업 제목 (예: "인증 버그 수정")'),
  description: z.string().default('').describe('작업 상세 설명 (MD 형식)'),
  author: z.string().min(1).describe('작업자 이름'),
  branch: z.string().optional().describe('Git 브랜치명'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium').describe('우선순위'),
  files: z.array(z.object({
    path: z.string().min(1),
    description: z.string().optional(),
  })).default([]).describe('영향받는 파일 목록 + 변경 설명'),
  areas: z.array(z.string()).default([]).describe('영향받는 영역 (예: ["인증", "DB", "API"])'),
});

const taskListSchema = z.object({
  projectName: z.string().optional().describe('프로젝트 필터'),
  status: z.array(z.enum(['draft', 'in_progress', 'pushed', 'deploying', 'deployed', 'cancelled'])).optional()
    .describe('상태 필터'),
  author: z.string().optional().describe('작업자 필터'),
  activeOnly: z.boolean().default(true).describe('진행중 작업만 표시'),
});

const taskGetSchema = z.object({
  taskId: z.number().int().positive().describe('작업 ID'),
});

const taskUpdateSchema = z.object({
  taskId: z.number().int().positive().describe('작업 ID'),
  title: z.string().optional().describe('제목 변경'),
  description: z.string().optional().describe('MD 문서 갱신'),
  status: z.enum(['draft', 'in_progress', 'pushed', 'deploying', 'deployed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  branch: z.string().optional(),
  prNumber: z.number().optional(),
  note: z.string().optional().describe('진행 노트 추가'),
  filesChanged: z.array(z.string()).optional().describe('노트에 포함할 변경 파일'),
  addFiles: z.array(z.object({
    path: z.string().min(1),
    description: z.string().optional(),
  })).optional().describe('추가 잠금 파일'),
});

const taskCheckSchema = z.object({
  files: z.array(z.string()).min(1).describe('충돌 확인할 파일 경로 목록'),
  excludeTaskId: z.number().optional().describe('제외할 작업 ID (자기 작업)'),
});

const taskCompleteSchema = z.object({
  taskId: z.number().int().positive().describe('작업 ID'),
  deployId: z.string().optional().describe('배포 ID 연결'),
  prNumber: z.number().optional().describe('PR 번호 연결'),
});

// ============================================================================
// Tool: task_create
// ============================================================================

export const taskCreateTool = {
  name: 'task_create',
  description: '작업 등록 (MD 문서 + 파일 잠금). 팀원이 작업 시작 시 호출.',
  inputSchema: taskCreateSchema,

  async execute(params: z.infer<typeof taskCreateSchema>, authContext: AuthContext) {
    try {
      if (!auth.checkPermission(authContext, 'task.write')) {
        return { success: false, error: 'Insufficient permissions' };
      }

      const input = taskCreateSchema.parse(params);

      // 1. 먼저 충돌 체크 — 충돌 시 등록 거부
      const filePaths = input.files.map(f => f.path);
      let conflicts: ConflictInfo[] = [];
      if (filePaths.length > 0) {
        conflicts = await WorkTaskFileRepo.checkConflicts(filePaths);
      }

      // 충돌 발견 시 등록 거부 (강제 차단)
      if (conflicts.length > 0) {
        const details = conflicts.map(c =>
          `  ⛔ Task #${c.taskId} "${c.title}" (${c.author}, ${c.status})\n     충돌 파일: ${c.conflictingFiles.join(', ')}`
        ).join('\n');

        logger.warn('Task creation blocked due to conflicts', {
          title: input.title,
          author: input.author,
          conflictCount: conflicts.length,
          conflictingFiles: conflicts.flatMap(c => c.conflictingFiles),
        });

        return {
          success: false,
          blocked: true,
          conflicts,
          error: `⛔ 작업 등록 거부! ${conflicts.length}개 기존 작업과 파일 충돌:\n\n${details}\n\n해당 작업이 배포 완료된 후 다시 시도하세요.`,
        };
      }

      // 2. 충돌 없음 → 작업 생성
      const task = await WorkTaskRepo.create({
        teamId: authContext.teamId,
        projectName: input.projectName,
        title: input.title,
        description: input.description,
        author: input.author,
        branch: input.branch || `worktree-task-${Date.now()}`,
        priority: input.priority as TaskPriority,
        affectedFiles: filePaths,
        affectedAreas: input.areas,
      });

      // 3. 파일 잠금
      let lockedFiles: any[] = [];
      if (input.files.length > 0) {
        lockedFiles = await WorkTaskFileRepo.lockFiles(
          task.id,
          input.files.map(f => ({ path: f.path, description: f.description }))
        );
      }

      logger.info('Task created', {
        taskId: task.id,
        title: task.title,
        author: task.author,
        filesLocked: lockedFiles.length,
      });

      return {
        success: true,
        task,
        lockedFiles: lockedFiles.length,
        worktreeBranch: task.branch,
        message: `✅ Task #${task.id} "${task.title}" 생성 완료. ${lockedFiles.length}개 파일 잠금.\n💡 작업 시작: claude --worktree task-${task.id}`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('task_create failed', { error: msg });
      return { success: false, error: msg };
    }
  },
};

// ============================================================================
// Tool: task_list
// ============================================================================

export const taskListTool = {
  name: 'task_list',
  description: '진행중 작업 목록. 누가 어떤 파일을 수정 중인지 확인.',
  inputSchema: taskListSchema,

  async execute(params: z.infer<typeof taskListSchema>, authContext: AuthContext) {
    try {
      if (!auth.checkPermission(authContext, 'task.view')) {
        return { success: false, error: 'Insufficient permissions' };
      }

      const input = taskListSchema.parse(params);

      let tasks;
      if (input.activeOnly && !input.projectName) {
        tasks = await WorkTaskRepo.findActive(authContext.teamId);
      } else if (input.projectName) {
        const statusFilter = input.status || (input.activeOnly
          ? ['draft', 'in_progress', 'pushed', 'deploying'] as TaskStatus[]
          : undefined);
        tasks = await WorkTaskRepo.findByProject(input.projectName, statusFilter);
      } else {
        tasks = await WorkTaskRepo.findActive(authContext.teamId);
      }

      // 작업자 필터
      if (input.author) {
        tasks = tasks.filter(t => t.author === input.author);
      }

      // 각 작업의 잠금 파일 수 조회
      const tasksWithFiles = await Promise.all(
        tasks.map(async (task) => {
          const files = await WorkTaskFileRepo.findByTask(task.id);
          const lockedFiles = files.filter(f => f.status === 'locked');
          return {
            id: task.id,
            title: task.title,
            author: task.author,
            status: task.status,
            priority: task.priority,
            projectName: task.projectName,
            branch: task.branch,
            prNumber: task.prNumber,
            filesLocked: lockedFiles.length,
            affectedFiles: task.affectedFiles,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          };
        })
      );

      return {
        success: true,
        tasks: tasksWithFiles,
        total: tasksWithFiles.length,
        message: `${tasksWithFiles.length}개 작업 조회됨`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('task_list failed', { error: msg });
      return { success: false, error: msg };
    }
  },
};

// ============================================================================
// Tool: task_get
// ============================================================================

export const taskGetTool = {
  name: 'task_get',
  description: '작업 상세 조회. MD 문서, 잠금 파일, 진행 노트 포함.',
  inputSchema: taskGetSchema,

  async execute(params: z.infer<typeof taskGetSchema>, authContext: AuthContext) {
    try {
      if (!auth.checkPermission(authContext, 'task.view')) {
        return { success: false, error: 'Insufficient permissions' };
      }

      const { taskId } = taskGetSchema.parse(params);
      const task = await WorkTaskRepo.findById(taskId);

      if (!task) {
        return { success: false, error: `Task #${taskId} not found` };
      }

      const files = await WorkTaskFileRepo.findByTask(taskId);

      return {
        success: true,
        task,
        files,
        message: `Task #${taskId}: "${task.title}" by ${task.author} [${task.status}]`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('task_get failed', { error: msg });
      return { success: false, error: msg };
    }
  },
};

// ============================================================================
// Tool: task_update
// ============================================================================

export const taskUpdateTool = {
  name: 'task_update',
  description: '작업 상태/파일/노트 갱신. Claude가 파일 수정 시마다 호출.',
  inputSchema: taskUpdateSchema,

  async execute(params: z.infer<typeof taskUpdateSchema>, authContext: AuthContext) {
    try {
      if (!auth.checkPermission(authContext, 'task.write')) {
        return { success: false, error: 'Insufficient permissions' };
      }

      const input = taskUpdateSchema.parse(params);
      const existing = await WorkTaskRepo.findById(input.taskId);

      if (!existing) {
        return { success: false, error: `Task #${input.taskId} not found` };
      }

      // 상태/필드 업데이트
      const updates: any = {};
      if (input.title) updates.title = input.title;
      if (input.description) updates.description = input.description;
      if (input.status) updates.status = input.status;
      if (input.priority) updates.priority = input.priority;
      if (input.branch) updates.branch = input.branch;
      if (input.prNumber) updates.prNumber = input.prNumber;

      let task = existing;
      if (Object.keys(updates).length > 0) {
        task = (await WorkTaskRepo.update(input.taskId, updates)) || existing;
      }

      // 진행 노트 추가
      if (input.note) {
        const note: ProgressNote = {
          timestamp: new Date().toISOString(),
          note: input.note,
          filesChanged: input.filesChanged,
        };
        task = (await WorkTaskRepo.addProgressNote(input.taskId, note)) || task;
      }

      // 추가 파일 잠금
      let newLocks: any[] = [];
      if (input.addFiles && input.addFiles.length > 0) {
        newLocks = await WorkTaskFileRepo.lockFiles(
          input.taskId,
          input.addFiles.map(f => ({ path: f.path, description: f.description }))
        );

        // affectedFiles 업데이트
        const newPaths = input.addFiles.map(f => f.path);
        const allFiles = [...new Set([...task.affectedFiles, ...newPaths])];
        await WorkTaskRepo.update(input.taskId, { affectedFiles: allFiles });
      }

      logger.info('Task updated', { taskId: input.taskId, updates: Object.keys(updates), newLocks: newLocks.length });

      return {
        success: true,
        task,
        newLocksAdded: newLocks.length,
        message: `✅ Task #${input.taskId} 갱신 완료`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('task_update failed', { error: msg });
      return { success: false, error: msg };
    }
  },
};

// ============================================================================
// Tool: task_check — 핵심: Hook에서 호출하여 충돌 차단
// ============================================================================

export const taskCheckTool = {
  name: 'task_check',
  description: '파일 충돌 확인. Edit/Write Hook에서 자동 호출. 충돌 시 차단 메시지 반환.',
  inputSchema: taskCheckSchema,

  async execute(params: z.infer<typeof taskCheckSchema>, authContext: AuthContext): Promise<{ success: boolean } & TaskCheckResult> {
    try {
      if (!auth.checkPermission(authContext, 'task.view')) {
        return {
          success: false,
          hasConflicts: false,
          conflicts: [],
          checkedFiles: [],
          message: 'Insufficient permissions',
        };
      }

      const input = taskCheckSchema.parse(params);
      const conflicts = await WorkTaskFileRepo.checkConflicts(input.files, input.excludeTaskId);

      const hasConflicts = conflicts.length > 0;
      const highConflicts = conflicts.filter(c => c.severity === 'high' || c.severity === 'medium');

      let message: string;
      if (!hasConflicts) {
        message = `✅ 충돌 없음. ${input.files.length}개 파일 수정 가능.`;
      } else {
        const details = conflicts.map(c =>
          `⛔ Task #${c.taskId} "${c.title}" (${c.author}, ${c.status})\n   충돌 파일: ${c.conflictingFiles.join(', ')}`
        ).join('\n');
        message = `⛔ ${conflicts.length}개 작업과 충돌!\n\n${details}\n\n배포 완료 후 수정 가능합니다.`;
      }

      logger.info('Task check', {
        files: input.files,
        hasConflicts,
        conflictCount: conflicts.length,
      });

      return {
        success: true,
        hasConflicts,
        conflicts,
        checkedFiles: input.files,
        message,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('task_check failed', { error: msg });
      return {
        success: false,
        hasConflicts: false,
        conflicts: [],
        checkedFiles: params.files || [],
        message: msg,
      };
    }
  },
};

// ============================================================================
// Tool: task_complete — 배포 완료 시 호출 (GitHub Actions 또는 수동)
// ============================================================================

export const taskCompleteTool = {
  name: 'task_complete',
  description: '작업 완료 처리. 배포 성공 시 GitHub Actions 또는 Claude가 호출. 파일 잠금 해제.',
  inputSchema: taskCompleteSchema,

  async execute(params: z.infer<typeof taskCompleteSchema>, authContext: AuthContext) {
    try {
      if (!auth.checkPermission(authContext, 'task.write')) {
        return { success: false, error: 'Insufficient permissions' };
      }

      const input = taskCompleteSchema.parse(params);
      const existing = await WorkTaskRepo.findById(input.taskId);

      if (!existing) {
        return { success: false, error: `Task #${input.taskId} not found` };
      }

      if (existing.status === 'deployed' || existing.status === 'cancelled') {
        return { success: false, error: `Task #${input.taskId} is already ${existing.status}` };
      }

      // PR 번호 업데이트
      if (input.prNumber) {
        await WorkTaskRepo.update(input.taskId, { prNumber: input.prNumber });
      }

      // 작업 완료 처리
      const task = await WorkTaskRepo.complete(input.taskId, input.deployId);

      // 파일 잠금 해제
      const releasedCount = await WorkTaskFileRepo.releaseByTask(input.taskId);

      // 완료 노트 추가
      await WorkTaskRepo.addProgressNote(input.taskId, {
        timestamp: new Date().toISOString(),
        note: `작업 완료. 배포 ID: ${input.deployId || 'manual'}. ${releasedCount}개 파일 잠금 해제.`,
      });

      logger.info('Task completed', {
        taskId: input.taskId,
        deployId: input.deployId,
        releasedFiles: releasedCount,
      });

      return {
        success: true,
        task,
        releasedFiles: releasedCount,
        message: `✅ Task #${input.taskId} "${existing.title}" 완료! ${releasedCount}개 파일 잠금 해제됨. 다른 팀원이 해당 파일을 수정할 수 있습니다.`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('task_complete failed', { error: msg });
      return { success: false, error: msg };
    }
  },
};
