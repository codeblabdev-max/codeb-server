#!/usr/bin/env node

/**
 * CodeB Deploy MCP Server
 * 100% CI/CD 자동화를 위한 MCP 서버
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Tools import
import { analyzeServerTool, executeAnalyzeServer } from './tools/analyze-server.js';
import { initProjectTool, executeInitProject } from './tools/init-project.js';
import { deployTool, executeDeploy } from './tools/deploy.js';
import { healthcheckTool, executeHealthcheck } from './tools/healthcheck.js';
import { rollbackTool, executeRollback, versionHistoryTool, getVersionHistory } from './tools/rollback.js';
import { notifyTool, executeNotify } from './tools/notify.js';
import { securityScanTool, executeSecurityScan, sbomTool, generateSBOM } from './tools/security-scan.js';
import { previewTool, executePreview } from './tools/preview.js';
import { monitoringTool, executeMonitoring } from './tools/monitoring.js';

// Port Registry
import { portRegistry } from './lib/port-registry.js';

// 서버 인스턴스 생성
const server = new Server(
  {
    name: 'codeb-deploy-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 도구 목록
const tools = [
  {
    name: 'analyze_server',
    description: '서버 상태를 분석합니다 (시스템 정보, 컨테이너, PM2 프로세스, 포트, 데이터베이스, 레지스트리)',
    inputSchema: {
      type: 'object',
      properties: {
        includeContainers: {
          type: 'boolean',
          description: '컨테이너 정보 포함 여부',
        },
        includePm2: {
          type: 'boolean',
          description: 'PM2 프로세스 정보 포함 여부',
        },
        includePorts: {
          type: 'boolean',
          description: '포트 정보 포함 여부',
        },
        includeDatabases: {
          type: 'boolean',
          description: '데이터베이스 정보 포함 여부',
        },
        includeRegistry: {
          type: 'boolean',
          description: '레지스트리 정보 포함 여부',
        },
      },
    },
  },
  {
    name: 'init_project',
    description: '새 프로젝트를 초기화합니다 (배포 설정, GitHub Actions, 환경 분리)',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        projectType: {
          type: 'string',
          enum: ['nextjs', 'remix', 'nodejs', 'static'],
          description: '프로젝트 유형',
        },
        gitRepo: { type: 'string', description: 'GitHub 저장소 URL' },
        domain: { type: 'string', description: '기본 도메인' },
        services: {
          type: 'object',
          properties: {
            database: { type: 'boolean', description: 'PostgreSQL 사용 여부' },
            redis: { type: 'boolean', description: 'Redis 사용 여부' },
          },
        },
      },
      required: ['projectName', 'projectType'],
    },
  },
  {
    name: 'deploy',
    description: '프로젝트를 배포합니다 (Rolling, Blue-Green, Canary 전략 지원)',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '배포 환경',
        },
        version: { type: 'string', description: '배포할 버전 태그' },
        strategy: {
          type: 'string',
          enum: ['rolling', 'blue-green', 'canary'],
          description: '배포 전략',
        },
        canaryWeight: { type: 'number', description: 'Canary 트래픽 비율 (%)' },
        skipTests: { type: 'boolean', description: '테스트 스킵 여부' },
        skipHealthcheck: { type: 'boolean', description: '헬스체크 스킵 여부' },
        prNumber: { type: 'string', description: 'Preview 환경 PR 번호' },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'healthcheck',
    description: '배포된 서비스의 상태를 확인합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        checks: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['http', 'container', 'database', 'redis', 'custom'],
          },
          description: '수행할 체크 종류',
        },
        httpEndpoint: { type: 'string', description: 'HTTP 헬스체크 엔드포인트' },
        timeout: { type: 'number', description: '타임아웃 (초)' },
        retries: { type: 'number', description: '재시도 횟수' },
        autoRollback: { type: 'boolean', description: '실패 시 자동 롤백' },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'rollback',
    description: '배포를 이전 버전으로 롤백합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        targetVersion: { type: 'string', description: '롤백할 특정 버전' },
        reason: { type: 'string', description: '롤백 사유' },
        notify: { type: 'boolean', description: '알림 발송 여부' },
        dryRun: { type: 'boolean', description: '시뮬레이션 모드' },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'get_version_history',
    description: '배포 버전 히스토리를 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        limit: { type: 'number', description: '조회할 버전 수' },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'notify',
    description: 'Slack, PagerDuty, 이메일 등으로 알림을 전송합니다',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          enum: ['slack', 'pagerduty', 'email', 'webhook'],
          description: '알림 채널',
        },
        type: {
          type: 'string',
          enum: ['deployment', 'rollback', 'healthcheck', 'security', 'custom'],
          description: '알림 유형',
        },
        severity: {
          type: 'string',
          enum: ['info', 'warning', 'error', 'critical'],
          description: '심각도',
        },
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        title: { type: 'string', description: '알림 제목' },
        message: { type: 'string', description: '알림 메시지' },
        details: { type: 'object', description: '추가 상세 정보' },
        webhookUrl: { type: 'string', description: '커스텀 웹훅 URL' },
      },
      required: ['channel', 'type', 'severity', 'projectName', 'title', 'message'],
    },
  },
  {
    name: 'security_scan',
    description: 'Trivy로 이미지 취약점을 스캔하고 gitleaks로 시크릿을 검사합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        scanType: {
          type: 'string',
          enum: ['image', 'secrets', 'all'],
          description: '스캔 유형',
        },
        imageTag: { type: 'string', description: '스캔할 이미지 태그' },
        repoPath: { type: 'string', description: '스캔할 저장소 경로' },
        severity: {
          type: 'string',
          enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
          description: '최소 심각도 필터',
        },
        failOnVulnerability: { type: 'boolean', description: '취약점 발견 시 실패 처리' },
      },
      required: ['projectName', 'scanType'],
    },
  },
  {
    name: 'generate_sbom',
    description: 'SBOM (Software Bill of Materials)을 생성합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        imageTag: { type: 'string', description: '이미지 태그' },
        format: {
          type: 'string',
          enum: ['spdx-json', 'cyclonedx', 'github'],
          description: 'SBOM 형식',
        },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'preview',
    description: 'PR 기반 Preview 환경을 생성, 업데이트, 삭제, 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'list', 'get'],
          description: '액션',
        },
        projectName: { type: 'string', description: '프로젝트 이름' },
        prNumber: { type: 'string', description: 'PR 번호' },
        gitRef: { type: 'string', description: 'Git 참조' },
        ttlHours: { type: 'number', description: '자동 삭제까지 시간' },
      },
      required: ['action', 'projectName'],
    },
  },
  {
    name: 'monitoring',
    description: 'Prometheus + Grafana 기반 모니터링 스택을 설정하고 메트릭/알림을 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['setup', 'status', 'metrics', 'alerts', 'configure'],
          description: '액션',
        },
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        metric: { type: 'string', description: '조회할 메트릭 이름' },
        timeRange: { type: 'string', description: '시간 범위 (예: 1h, 24h)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'port_summary',
    description: '포트 할당 현황을 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// 도구 목록 요청 핸들러
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// 도구 실행 핸들러
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'analyze_server':
        result = await executeAnalyzeServer(args as any);
        break;

      case 'init_project':
        result = await executeInitProject(args as any);
        break;

      case 'deploy':
        result = await executeDeploy(args as any);
        break;

      case 'healthcheck':
        result = await executeHealthcheck(args as any);
        break;

      case 'rollback':
        result = await executeRollback(args as any);
        break;

      case 'get_version_history':
        result = await getVersionHistory(args as any);
        break;

      case 'notify':
        result = await executeNotify(args as any);
        break;

      case 'security_scan':
        result = await executeSecurityScan(args as any);
        break;

      case 'generate_sbom':
        result = await generateSBOM(args as any);
        break;

      case 'preview':
        result = await executePreview(args as any);
        break;

      case 'monitoring':
        result = await executeMonitoring(args as any);
        break;

      case 'port_summary':
        result = portRegistry.getSummary();
        break;

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };

  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// 서버 시작
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CodeB Deploy MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
