#!/usr/bin/env node

/**
 * MCP Contest Continuity Server
 * 
 * 바이브 코딩 컨테스트 연속성 및 Context 영속화를 위한 MCP 서버
 * - Context 영속화: 개발 중 축적된 Context 정보 보존
 * - 자동 트리거: 코드 생성 → 테스트 문서 자동 업데이트  
 * - MCP 통합: Sequential, Context7 서버와 연동
 * - 완전 자동화: 수동 개입 없이 모든 시스템 작동
 * - 바이브 코딩 컨테스트: "컨테스트가 계속 진행되는 것처럼" Context 연속성 제공
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListResourcesRequestSchema, 
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ContestContextManager } from './lib/context-manager.js';
import { TestDocumentGenerator } from './lib/test-generator.js';
import { DocumentVersionManager } from './lib/version-manager.js';
import { MCPIntegrationCoordinator } from './lib/mcp-coordinator.js';
import { DevelopmentTracker } from './lib/development-tracker.js';
import { AutomationEngine } from './lib/automation-engine.js';
import { HierarchicalAgentSystem } from './lib/hierarchical-agent-system.js';

import { 
  CaptureContextTool,
  ResumeContextTool,
  GenerateTestDocumentTool,
  TrackDevelopmentTool,
  ManageDocumentVersionsTool,
  CoordinateIntegrationTool,
  AnalyzeDependenciesTool,
  ManagePatternsTool,
  SyncProjectsTool,
  MonitorRealtimeTool,
  DelegateTasksTool
} from './tools/index.js';

class ContestContinuityServer {
  private server: Server;
  private contextManager!: ContestContextManager;
  private testGenerator!: TestDocumentGenerator;
  private versionManager!: DocumentVersionManager;
  private mcpCoordinator!: MCPIntegrationCoordinator;
  private developmentTracker!: DevelopmentTracker;
  private automationEngine!: AutomationEngine;
  private agentSystem!: HierarchicalAgentSystem;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-contest-continuity',
        version: '1.0.0',
      }
    );

    this.setupManagers();
    this.setupTools();
    this.setupResources(); 
    this.setupEventHandlers();
  }

  private setupManagers(): void {
    this.contextManager = new ContestContextManager();
    this.testGenerator = new TestDocumentGenerator();
    this.versionManager = new DocumentVersionManager(); 
    this.mcpCoordinator = new MCPIntegrationCoordinator();
    this.developmentTracker = new DevelopmentTracker();
    this.agentSystem = new HierarchicalAgentSystem();
    
    this.automationEngine = new AutomationEngine({
      contest_continuity: {
        context_manager: this.contextManager,
        test_generator: this.testGenerator,
        version_manager: this.versionManager,
        mcp_coordinator: this.mcpCoordinator,
        development_tracker: this.developmentTracker,
        agent_system: this.agentSystem
      },
      workflows: []
    });
    
    // Agent System 이벤트 리스너 설정
    this.agentSystem.on('worker-started', (event) => {
      console.log(`🚀 Agent ${event.workerId} started task: ${event.task.action}`);
    });
    
    this.agentSystem.on('worker-completed', (event) => {
      console.log(`✅ Agent ${event.workerId} completed task: ${event.task.action}`);
    });
  }

  private setupTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'capture_contest_context',
          description: '현재 프로젝트의 Context 캡처 및 영속화 - 바이브 코딩 컨테스트 연속성을 위한 핵심 기능',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: '프로젝트 루트 경로'
              },
              contest_type: {
                type: 'string',
                enum: ['nextjs', 'remix', 'react', 'vue', 'general'],
                description: '컨테스트/프로젝트 유형'
              },
              capture_options: {
                type: 'object',
                properties: {
                  deep_analysis: { type: 'boolean', default: true },
                  include_dependencies: { type: 'boolean', default: true },
                  capture_patterns: { type: 'boolean', default: true },
                  preserve_test_items: { type: 'boolean', default: true }
                }
              }
            },
            required: ['project_path', 'contest_type']
          }
        },
        {
          name: 'resume_contest_context',
          description: '이전 컨테스트 Context 복원 및 연속성 제공 - 마치 컨테스트가 계속 진행되는 것처럼',
          inputSchema: {
            type: 'object',
            properties: {
              context_id: {
                type: 'string', 
                description: '복원할 Context ID 또는 패턴 이름'
              },
              project_path: {
                type: 'string',
                description: '새 프로젝트 경로'
              },
              resume_options: {
                type: 'object',
                properties: {
                  auto_setup: { type: 'boolean', default: true },
                  copy_structure: { type: 'boolean', default: true },
                  generate_templates: { type: 'boolean', default: true },
                  setup_automation: { type: 'boolean', default: true }
                }
              }
            },
            required: ['context_id', 'project_path']
          }
        },
        {
          name: 'auto_generate_tests',
          description: 'Context 유지 상태에서 자동 테스트 문서 생성 - UI/API/DB 컴포넌트 생성과 동시에 테스트 항목 자동화',
          inputSchema: {
            type: 'object',
            properties: {
              component_info: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['ui', 'api', 'database', 'integration'] },
                  name: { type: 'string' },
                  file_path: { type: 'string' },
                  metadata: { type: 'object' }
                },
                required: ['type', 'name']
              },
              test_type: {
                type: 'string',
                enum: ['unit', 'integration', 'e2e', 'comprehensive'],
                default: 'comprehensive'
              },
              context_data: {
                type: 'object',
                description: '현재 유지되고 있는 개발 Context 정보'
              }
            },
            required: ['component_info']
          }
        },
        {
          name: 'track_development_context',
          description: '실시간 개발 Context 추적 및 기록 - 개발 중 모든 중요한 결정과 패턴 자동 추적',
          inputSchema: {
            type: 'object',
            properties: {
              file_changes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    file_path: { type: 'string' },
                    change_type: { type: 'string', enum: ['create', 'modify', 'delete'] },
                    content_summary: { type: 'string' }
                  }
                }
              },
              context_snapshot: {
                type: 'object',
                description: '현재 개발 Context 스냅샷'
              },
              tracking_options: {
                type: 'object',
                properties: {
                  auto_categorize: { type: 'boolean', default: true },
                  extract_patterns: { type: 'boolean', default: true },
                  update_tests: { type: 'boolean', default: true }
                }
              }
            },
            required: ['file_changes']
          }
        },
        {
          name: 'manage_document_versions',
          description: '문서 버전 관리 및 500줄 분할 시스템 - 자동 백업, 롤백, 페이지 분할',
          inputSchema: {
            type: 'object',
            properties: {
              document_path: {
                type: 'string',
                description: '관리할 문서 파일 경로'
              },
              operation: {
                type: 'string',
                enum: ['backup', 'rollback', 'split_check', 'auto_split', 'version_list'],
                description: '수행할 버전 관리 작업'
              },
              version_options: {
                type: 'object',
                properties: {
                  target_version: { type: 'string' },
                  split_threshold: { type: 'number', default: 500 },
                  auto_navigation: { type: 'boolean', default: true },
                  backup_comment: { type: 'string' }
                }
              }
            },
            required: ['document_path', 'operation']
          }
        },
        {
          name: 'integrate_mcp_servers',
          description: 'Sequential, Context7 MCP 서버와의 통합 조정 - 다른 MCP 서버들과의 협력 및 워크플로우 조정',
          inputSchema: {
            type: 'object',
            properties: {
              server_names: {
                type: 'array',
                items: { type: 'string' },
                description: '연동할 MCP 서버 이름들 (sequential, context7 등)'
              },
              integration_type: {
                type: 'string',
                enum: ['coordinate', 'delegate', 'synchronize', 'query'],
                description: '통합 작업 유형'
              },
              coordination_options: {
                type: 'object',
                properties: {
                  task_description: { type: 'string' },
                  expected_outcome: { type: 'string' },
                  context_sharing: { type: 'boolean', default: true },
                  result_aggregation: { type: 'boolean', default: true }
                }
              }
            },
            required: ['server_names', 'integration_type']
          }
        },
        {
          name: 'analyze_dependencies',
          description: '프로젝트 의존성 분석 및 중복 제거 - 자동 의존성 정리, 버전 충돌 해결, 사용하지 않는 패키지 탐지',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['analyze', 'detect_duplicates', 'detect_unused', 'cleanup', 'resolve_conflicts'],
                description: '수행할 의존성 분석 작업'
              },
              project_path: {
                type: 'string',
                description: '분석할 프로젝트 경로'
              },
              analysis_options: {
                type: 'object',
                properties: {
                  include_dev_deps: { type: 'boolean', default: true },
                  check_vulnerabilities: { type: 'boolean', default: true },
                  auto_cleanup: { type: 'boolean', default: false },
                  deep_analysis: { type: 'boolean', default: true }
                }
              }
            },
            required: ['operation', 'project_path']
          }
        },
        {
          name: 'manage_patterns',
          description: '코드 패턴 라이브러리 관리 - 자동 패턴 추출, 재사용 가능한 템플릿 생성, 패턴 검색 및 적용',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['extract', 'search', 'apply', 'list', 'analyze'],
                description: '수행할 패턴 관리 작업'
              },
              project_path: {
                type: 'string',
                description: '패턴을 추출하거나 적용할 프로젝트 경로'
              },
              pattern_types: {
                type: 'array',
                items: { type: 'string', enum: ['component', 'api', 'hook', 'utility', 'service'] },
                description: '추출할 패턴 유형'
              },
              search_query: {
                type: 'string',
                description: '패턴 검색 쿼리 (search 작업용)'
              },
              extraction_options: {
                type: 'object',
                properties: {
                  min_complexity: { type: 'number', default: 5 },
                  include_tests: { type: 'boolean', default: true },
                  auto_categorize: { type: 'boolean', default: true }
                }
              }
            },
            required: ['operation']
          }
        },
        {
          name: 'sync_projects',
          description: '다중 프로젝트 Context 동기화 - 프로젝트 간 패턴, 설정, 템플릿 공유 및 동기화',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['register', 'sync', 'share_context', 'enable_network', 'status'],
                description: '수행할 동기화 작업'
              },
              project_path: {
                type: 'string',
                description: '프로젝트 경로'
              },
              project_name: {
                type: 'string',
                description: '프로젝트 이름'
              },
              framework: {
                type: 'string',
                description: '프로젝트 프레임워크 (React, Vue, Next.js 등)'
              },
              source_project_id: {
                type: 'string',
                description: '소스 프로젝트 ID'
              },
              target_project_id: {
                type: 'string',
                description: '대상 프로젝트 ID'
              },
              sync_options: {
                type: 'object',
                properties: {
                  include_patterns: { type: 'boolean', default: true },
                  include_configurations: { type: 'boolean', default: true },
                  auto_resolve_conflicts: { type: 'boolean', default: false }
                }
              }
            },
            required: ['operation']
          }
        },
        {
          name: 'monitor_realtime',
          description: '실시간 코드 변경 모니터링 - 파일 변경 감지, 자동 복잡도 분석, 문서 자동 업데이트',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['start', 'stop', 'status', 'history', 'statistics'],
                description: '수행할 모니터링 작업'
              },
              project_path: {
                type: 'string',
                description: '모니터링할 프로젝트 경로'
              },
              config: {
                type: 'object',
                properties: {
                  watch_patterns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '감시할 파일 패턴'
                  },
                  ignore_patterns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '무시할 파일 패턴'
                  },
                  debounce_ms: { type: 'number', default: 500 },
                  auto_actions: {
                    type: 'object',
                    properties: {
                      generate_tests: { type: 'boolean', default: false },
                      update_documentation: { type: 'boolean', default: true },
                      extract_patterns: { type: 'boolean', default: true }
                    }
                  }
                }
              }
            },
            required: ['operation']
          }
        },
        {
          name: 'delegate_tasks',
          description: 'Sub-Agent 작업 위임 시스템 - 복잡한 작업을 여러 전문 에이전트에게 병렬 위임 처리',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['register_agent', 'delegate_task', 'get_status', 'get_results', 'cancel_task'],
                description: '수행할 위임 작업'
              },
              agent_config: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['analyzer', 'generator', 'validator', 'transformer', 'specialist'] },
                  specialization: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  capabilities: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                }
              },
              task_description: {
                type: 'string',
                description: '위임할 작업 설명'
              },
              delegation_options: {
                type: 'object',
                properties: {
                  strategy: { type: 'string' },
                  max_parallel_tasks: { type: 'number', default: 5 },
                  timeout: { type: 'number', default: 300000 }
                }
              },
              task_group_id: {
                type: 'string',
                description: '작업 그룹 ID'
              },
              task_id: {
                type: 'string',
                description: '개별 작업 ID'
              }
            },
            required: ['operation']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'capture_contest_context':
          return new CaptureContextTool().execute(args as any);
        
        case 'resume_contest_context':
          return new ResumeContextTool().execute(args as any);
        
        case 'auto_generate_tests':
          return new GenerateTestDocumentTool().execute(args as any);
        
        case 'track_development_context':
          return new TrackDevelopmentTool().execute(args as any);
        
        case 'manage_document_versions':
          return new ManageDocumentVersionsTool().execute(args as any);
        
        case 'integrate_mcp_servers':
          return new CoordinateIntegrationTool().execute(args as any);

        case 'analyze_dependencies':
          return new AnalyzeDependenciesTool().execute(args as any);

        case 'manage_patterns':
          return new ManagePatternsTool().execute(args as any);

        case 'sync_projects':
          return new SyncProjectsTool().execute(args as any);

        case 'monitor_realtime':
          return new MonitorRealtimeTool().execute(args as any);

        case 'delegate_tasks':
          return new DelegateTasksTool().execute(args as any);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private setupResources(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'contest-context://database',
          mimeType: 'application/json',
          name: 'Contest Context Database',
          description: '영속화된 컨테스트 Context 데이터베이스'
        },
        {
          uri: 'test-templates://ui',
          mimeType: 'text/markdown', 
          name: 'UI Test Templates',
          description: 'UI 컴포넌트 테스트 자동 생성 템플릿'
        },
        {
          uri: 'test-templates://api',
          mimeType: 'text/markdown',
          name: 'API Test Templates', 
          description: 'API 엔드포인트 테스트 자동 생성 템플릿'
        },
        {
          uri: 'test-templates://database',
          mimeType: 'text/markdown',
          name: 'Database Test Templates',
          description: '데이터베이스 테스트 자동 생성 템플릿'
        },
        {
          uri: 'version-history://documents',
          mimeType: 'application/json',
          name: 'Document Version History',
          description: '문서 버전 히스토리 및 롤백 데이터'
        }
      ]
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (uri.startsWith('contest-context://')) {
        return await this.contextManager.getContextResource(uri);
      }
      
      if (uri.startsWith('test-templates://')) {
        return await this.testGenerator.getTemplateResource(uri);
      }
      
      if (uri.startsWith('version-history://')) {
        return await this.versionManager.getVersionResource(uri);
      }
      
      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  private setupEventHandlers(): void {
    // 자동화 엔진 이벤트 핸들러 설정
    this.automationEngine.on('context_captured', (data) => {
      console.log('[MCP Contest Continuity] Context captured:', data.context_id);
    });

    this.automationEngine.on('test_generated', (data) => {
      console.log('[MCP Contest Continuity] Test document generated:', data.file_path);
    });

    this.automationEngine.on('document_split', (data) => {
      console.log('[MCP Contest Continuity] Document auto-split:', data.original_file, '→', data.new_pages);
    });

    // 프로세스 종료 시 정리
    process.on('SIGINT', async () => {
      console.log('[MCP Contest Continuity] Shutting down gracefully...');
      await this.automationEngine.cleanup();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('[MCP Contest Continuity] Server started and ready for connections');
    console.log('[MCP Contest Continuity] Enhanced Features:');
    console.log('  • Context Persistence & Auto Test Generation');
    console.log('  • MCP Server Integration & Coordination');
    console.log('  • Dependency Analysis & Cleanup');
    console.log('  • Pattern Library Management');
    console.log('  • Multi-Project Context Synchronization');
    console.log('  • Real-time Code Monitoring');
    console.log('  • Sub-Agent Task Delegation');
    console.log('[MCP Contest Continuity] Ready with 11 enhanced tools');
  }
}

// 서버 시작
const server = new ContestContinuityServer();
server.run().catch((error) => {
  console.error('[MCP Contest Continuity] Failed to start server:', error);
  process.exit(1);
});