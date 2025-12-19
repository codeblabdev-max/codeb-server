/**
 * CodeB SSOT MCP Tools
 *
 * SSOT 관리를 위한 MCP 도구들
 * - 초기화 및 마이그레이션
 * - 조회 및 검증
 * - 프로젝트/도메인/포트 관리
 */

import { z } from 'zod';
import { getSSOTManager, SSOTManager } from '../lib/ssot-manager.js';
import type {
  CodeBSSOT,
  SSOTProject,
  SSOTValidationResult,
  SSOTSyncResult,
  SSOTHistoryEntry,
} from '../lib/ssot-types.js';

// ============================================================================
// 스키마 정의
// ============================================================================

const InitializeSSOTSchema = z.object({
  serverIp: z.string().describe('서버 IP 주소'),
  zones: z.array(z.string()).describe('관리할 DNS 존 목록 (예: ["codeb.dev", "one-q.xyz"])'),
  force: z.boolean().optional().describe('기존 SSOT 덮어쓰기 여부'),
});

const MigrateSSOTSchema = z.object({
  scanContainers: z.boolean().optional().default(true).describe('실행 중인 컨테이너 스캔'),
  scanCaddy: z.boolean().optional().default(true).describe('Caddy 설정에서 도메인 스캔'),
});

const ValidateSSOTSchema = z.object({
  autoFix: z.boolean().optional().default(false).describe('불일치 자동 수정'),
});

const RegisterProjectSchema = z.object({
  projectId: z.string().describe('프로젝트 ID'),
  name: z.string().describe('프로젝트 표시 이름'),
  type: z.enum(['nextjs', 'remix', 'nodejs', 'static', 'python', 'go']).describe('프로젝트 유형'),
  repository: z.string().optional().describe('GitHub 저장소 URL'),
});

const SetDomainSchema = z.object({
  projectId: z.string().describe('프로젝트 ID'),
  environment: z.enum(['staging', 'production', 'preview']).describe('환경'),
  domain: z.string().describe('도메인'),
  port: z.number().describe('타겟 포트'),
  prNumber: z.string().optional().describe('Preview 환경 PR 번호'),
});

const AllocatePortSchema = z.object({
  projectId: z.string().describe('프로젝트 ID'),
  environment: z.enum(['staging', 'production', 'preview']).describe('환경'),
  service: z.enum(['app', 'db', 'redis']).describe('서비스 유형'),
  prNumber: z.string().optional().describe('Preview 환경 PR 번호'),
});

const GetProjectSchema = z.object({
  projectId: z.string().describe('프로젝트 ID'),
});

const GetHistorySchema = z.object({
  limit: z.number().optional().default(50).describe('조회할 히스토리 수'),
});

// ============================================================================
// 도구 구현
// ============================================================================

/**
 * SSOT 초기화
 */
export async function ssotInitialize(
  args: z.infer<typeof InitializeSSOTSchema>
): Promise<{ success: boolean; ssot?: CodeBSSOT; error?: string }> {
  try {
    const manager = getSSOTManager();
    const ssot = await manager.initialize(args.serverIp, args.zones);

    return {
      success: true,
      ssot,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 기존 서버 상태를 SSOT로 마이그레이션
 */
export async function ssotMigrate(
  args: z.infer<typeof MigrateSSOTSchema>
): Promise<{ success: boolean; added: string[]; errors: string[] }> {
  try {
    const manager = getSSOTManager();
    const result = await manager.scanAndMigrate();

    return {
      success: result.errors.length === 0,
      added: result.added,
      errors: result.errors,
    };
  } catch (error) {
    return {
      success: false,
      added: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * SSOT 검증
 */
export async function ssotValidate(
  args: z.infer<typeof ValidateSSOTSchema>
): Promise<SSOTValidationResult & { synced?: SSOTSyncResult }> {
  const manager = getSSOTManager();
  const validation = await manager.validate();

  let synced: SSOTSyncResult | undefined;

  if (args.autoFix && !validation.valid) {
    synced = await manager.syncFromSSOT();
  }

  return {
    ...validation,
    synced,
  };
}

/**
 * SSOT 전체 조회
 */
export async function ssotGet(
  args?: { includeIndexes?: boolean }
): Promise<CodeBSSOT> {
  const manager = getSSOTManager();
  return manager.load();
}

/**
 * 프로젝트 등록
 */
export async function ssotRegisterProject(
  args: z.infer<typeof RegisterProjectSchema>
): Promise<{ success: boolean; project?: SSOTProject; error?: string }> {
  try {
    const manager = getSSOTManager();
    const project = await manager.registerProject({
      id: args.projectId,
      name: args.name,
      type: args.type,
      repository: args.repository,
      environments: {},
    });

    return {
      success: true,
      project,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 프로젝트 조회
 */
export async function ssotGetProject(
  args: z.infer<typeof GetProjectSchema>
): Promise<{ found: boolean; project?: SSOTProject }> {
  const manager = getSSOTManager();
  const project = await manager.getProject(args.projectId);

  return {
    found: !!project,
    project: project || undefined,
  };
}

/**
 * 모든 프로젝트 목록
 */
export async function ssotListProjects(
  args?: { status?: string }
): Promise<{ projects: SSOTProject[] }> {
  const manager = getSSOTManager();
  const projects = await manager.listProjects();

  return { projects };
}

/**
 * 도메인 설정 (SSOT + Caddy + DNS 통합)
 */
export async function ssotSetDomain(
  args: z.infer<typeof SetDomainSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    const manager = getSSOTManager();
    await manager.setDomain(
      args.projectId,
      args.environment,
      args.domain,
      args.port,
      args.prNumber
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 도메인 제거
 */
export async function ssotRemoveDomain(
  args: { projectId: string; environment: string; prNumber?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const manager = getSSOTManager();
    await manager.removeDomain(args.projectId, args.environment, args.prNumber);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 포트 할당
 */
export async function ssotAllocatePort(
  args: z.infer<typeof AllocatePortSchema>
): Promise<{ success: boolean; port?: number; error?: string }> {
  try {
    const manager = getSSOTManager();
    const port = await manager.allocatePort(
      args.projectId,
      args.environment,
      args.service,
      args.prNumber
    );

    return {
      success: true,
      port,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 포트 해제
 */
export async function ssotReleasePort(
  args: { port: number }
): Promise<{ success: boolean; error?: string }> {
  try {
    const manager = getSSOTManager();
    await manager.releasePort(args.port);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 사용 가능한 포트 찾기
 */
export async function ssotFindAvailablePort(
  args: { environment: 'staging' | 'production' | 'preview'; service: 'app' | 'db' | 'redis' }
): Promise<{ port?: number; error?: string }> {
  try {
    const manager = getSSOTManager();
    const port = await manager.findAvailablePort(args.environment, args.service);

    return { port };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 히스토리 조회
 */
export async function ssotGetHistory(
  args: z.infer<typeof GetHistorySchema>
): Promise<{ history: SSOTHistoryEntry[] }> {
  const manager = getSSOTManager();
  const history = await manager.getHistory(args.limit);

  return { history };
}

/**
 * SSOT 기준으로 시스템 동기화 (수동 트리거)
 */
export async function ssotSync(
  args?: { dryRun?: boolean; components?: string[] }
): Promise<SSOTSyncResult> {
  const manager = getSSOTManager();
  return manager.syncFromSSOT();
}

// ============================================================================
// MCP 도구 등록 (index.ts에서 사용)
// ============================================================================

export const ssotTools = {
  ssot_initialize: {
    description: 'SSOT (Single Source of Truth) 초기화. 서버에 새로운 SSOT 레지스트리를 생성합니다.',
    schema: InitializeSSOTSchema,
    handler: ssotInitialize,
  },
  ssot_migrate: {
    description: '기존 서버 상태(컨테이너, Caddy)를 스캔하여 SSOT에 마이그레이션합니다.',
    schema: MigrateSSOTSchema,
    handler: ssotMigrate,
  },
  ssot_validate: {
    description: 'SSOT와 실제 시스템 상태를 검증합니다. autoFix=true 시 불일치 자동 수정.',
    schema: ValidateSSOTSchema,
    handler: ssotValidate,
  },
  ssot_get: {
    description: '전체 SSOT 데이터를 조회합니다.',
    schema: z.object({}),
    handler: ssotGet,
  },
  ssot_register_project: {
    description: 'SSOT에 새 프로젝트를 등록합니다.',
    schema: RegisterProjectSchema,
    handler: ssotRegisterProject,
  },
  ssot_get_project: {
    description: '특정 프로젝트 정보를 조회합니다.',
    schema: GetProjectSchema,
    handler: ssotGetProject,
  },
  ssot_list_projects: {
    description: '모든 프로젝트 목록을 조회합니다.',
    schema: z.object({}),
    handler: ssotListProjects,
  },
  ssot_set_domain: {
    description: '프로젝트에 도메인을 설정합니다. SSOT, Caddy, DNS를 동시에 업데이트합니다.',
    schema: SetDomainSchema,
    handler: ssotSetDomain,
  },
  ssot_remove_domain: {
    description: '프로젝트의 도메인을 제거합니다.',
    schema: z.object({
      projectId: z.string(),
      environment: z.string(),
      prNumber: z.string().optional(),
    }),
    handler: ssotRemoveDomain,
  },
  ssot_allocate_port: {
    description: '프로젝트에 포트를 할당합니다. SSOT에 예약됩니다.',
    schema: AllocatePortSchema,
    handler: ssotAllocatePort,
  },
  ssot_release_port: {
    description: '할당된 포트를 해제합니다.',
    schema: z.object({ port: z.number() }),
    handler: ssotReleasePort,
  },
  ssot_find_available_port: {
    description: '사용 가능한 포트를 찾습니다.',
    schema: z.object({
      environment: z.enum(['staging', 'production', 'preview']),
      service: z.enum(['app', 'db', 'redis']),
    }),
    handler: ssotFindAvailablePort,
  },
  ssot_get_history: {
    description: 'SSOT 변경 히스토리를 조회합니다.',
    schema: GetHistorySchema,
    handler: ssotGetHistory,
  },
  ssot_sync: {
    description: 'SSOT 기준으로 시스템(Caddy, DNS)을 동기화합니다.',
    schema: z.object({}),
    handler: ssotSync,
  },
};

export type SSOTToolName = keyof typeof ssotTools;
