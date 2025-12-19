/**
 * Automation Engine
 * 
 * 완전 자동화 시스템 및 바이브 코딩 컨테스트 연속성 구현
 * - 모든 시스템 구성 요소 통합 및 조정
 * - 이벤트 기반 자동화 워크플로우
 * - 컨테스트 연속성 및 Context 영속화
 */

import { EventEmitter } from 'events';
import { ContestContextManager } from './context-manager.js';
import { TestDocumentGenerator } from './test-generator.js';
import { DocumentVersionManager } from './version-manager.js';
import { MCPIntegrationCoordinator } from './mcp-coordinator.js';
import { DevelopmentTracker } from './development-tracker.js';

interface AutomationConfig {
  context_manager: ContestContextManager;
  test_generator: TestDocumentGenerator;
  version_manager: DocumentVersionManager;
  mcp_coordinator: MCPIntegrationCoordinator;
  development_tracker: DevelopmentTracker;
}

interface AutomationWorkflow {
  workflow_id: string;
  name: string;
  trigger_events: string[];
  steps: AutomationStep[];
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  created_at: string;
  last_run?: string;
  run_count: number;
}

interface AutomationStep {
  step_id: string;
  name: string;
  component: string;
  action: string;
  parameters: any;
  retry_count: number;
  timeout: number;
}

interface ContestContinuityState {
  current_contest_id?: string;
  active_patterns: string[];
  accumulated_context: any;
  reuse_opportunities: any[];
  quality_metrics: any;
}

export class AutomationEngine extends EventEmitter {
  private components: AutomationConfig;
  private workflows: Map<string, AutomationWorkflow> = new Map();
  private activeWorkflows: Set<string> = new Set();
  private contestState: ContestContinuityState;

  constructor(components: AutomationConfig) {
    super();
    this.components = components;
    this.contestState = {
      active_patterns: [],
      accumulated_context: {},
      reuse_opportunities: [],
      quality_metrics: {}
    };
    
    this.setupDefaultWorkflows();
    this.setupEventListeners();
    
    console.log('[Automation Engine] Initialized with full automation capabilities');
  }

  /**
   * 기본 자동화 워크플로우 설정
   */
  private setupDefaultWorkflows(): void {
    // 1. 코드 생성 → 테스트 문서 자동 업데이트 워크플로우
    this.registerWorkflow({
      workflow_id: 'code_to_test_automation',
      name: '코드 생성 시 테스트 문서 자동 업데이트',
      trigger_events: ['file_created', 'component_detected', 'api_endpoint_created'],
      steps: [
        {
          step_id: 'detect_component_type',
          name: '컴포넌트 타입 감지',
          component: 'development_tracker',
          action: 'analyze_component',
          parameters: { deep_analysis: true },
          retry_count: 2,
          timeout: 5000
        },
        {
          step_id: 'generate_test_document',
          name: '테스트 문서 자동 생성',
          component: 'test_generator',
          action: 'generate_test_document',
          parameters: { context_aware: true, auto_update: true },
          retry_count: 3,
          timeout: 10000
        },
        {
          step_id: 'version_backup',
          name: '문서 버전 백업',
          component: 'version_manager',
          action: 'backup_document',
          parameters: { description: 'Auto-generated test update' },
          retry_count: 2,
          timeout: 5000
        }
      ],
      status: 'idle',
      created_at: new Date().toISOString(),
      run_count: 0
    });

    // 2. Context 영속화 워크플로우
    this.registerWorkflow({
      workflow_id: 'context_persistence',
      name: 'Context 영속화 및 패턴 추출',
      trigger_events: ['significant_changes', 'session_milestone', 'feature_completion'],
      steps: [
        {
          step_id: 'capture_context',
          name: 'Context 캡처',
          component: 'context_manager',
          action: 'capture_context',
          parameters: { deep_analysis: true, include_dependencies: true },
          retry_count: 2,
          timeout: 15000
        },
        {
          step_id: 'extract_patterns',
          name: '패턴 추출 및 분석',
          component: 'development_tracker',
          action: 'extract_patterns',
          parameters: { pattern_matching: true },
          retry_count: 2,
          timeout: 10000
        },
        {
          step_id: 'update_contest_continuity',
          name: '컨테스트 연속성 업데이트',
          component: 'automation_engine',
          action: 'update_contest_state',
          parameters: {},
          retry_count: 1,
          timeout: 5000
        }
      ],
      status: 'idle',
      created_at: new Date().toISOString(),
      run_count: 0
    });

    // 3. MCP 서버 통합 워크플로우
    this.registerWorkflow({
      workflow_id: 'mcp_integration',
      name: 'Sequential, Context7 MCP 서버 연동',
      trigger_events: ['complex_task_detected', 'documentation_needed', 'pattern_research_required'],
      steps: [
        {
          step_id: 'coordinate_mcp_servers',
          name: 'MCP 서버 조정',
          component: 'mcp_coordinator',
          action: 'coordinate_integration',
          parameters: { 
            server_names: ['sequential', 'context7'],
            integration_type: 'coordinate',
            context_sharing: true
          },
          retry_count: 3,
          timeout: 20000
        },
        {
          step_id: 'apply_mcp_results',
          name: 'MCP 결과 적용',
          component: 'automation_engine',
          action: 'apply_mcp_insights',
          parameters: {},
          retry_count: 2,
          timeout: 10000
        }
      ],
      status: 'idle',
      created_at: new Date().toISOString(),
      run_count: 0
    });

    // 4. 문서 분할 및 버전 관리 워크플로우
    this.registerWorkflow({
      workflow_id: 'document_management',
      name: '500줄 분할 및 버전 관리',
      trigger_events: ['document_size_exceeded', 'manual_split_request'],
      steps: [
        {
          step_id: 'check_document_size',
          name: '문서 크기 확인',
          component: 'version_manager',
          action: 'check_and_split',
          parameters: { split_threshold: 500 },
          retry_count: 2,
          timeout: 10000
        },
        {
          step_id: 'update_navigation',
          name: '네비게이션 업데이트',
          component: 'automation_engine',
          action: 'update_navigation',
          parameters: {},
          retry_count: 2,
          timeout: 5000
        }
      ],
      status: 'idle',
      created_at: new Date().toISOString(),
      run_count: 0
    });

    console.log(`[Automation Engine] Registered ${this.workflows.size} default workflows`);
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    // Development Tracker 이벤트
    this.components.development_tracker.on('changes_tracked', async (data) => {
      await this.handleEvent('file_changes', data);
    });

    this.components.development_tracker.on('test_opportunities', async (data) => {
      await this.handleEvent('test_opportunities_detected', data);
    });

    this.components.development_tracker.on('context_snapshot', async (data) => {
      await this.handleEvent('context_snapshot_created', data);
    });

    // MCP Coordinator 이벤트
    this.components.mcp_coordinator.on('task_completed', async (data) => {
      await this.handleEvent('mcp_task_completed', data);
    });

    this.components.mcp_coordinator.on('task_failed', async (data) => {
      await this.handleEvent('mcp_task_failed', data);
    });

    // 내부 이벤트
    this.on('workflow_completed', async (data) => {
      await this.handleWorkflowCompletion(data);
    });

    this.on('workflow_failed', async (data) => {
      await this.handleWorkflowFailure(data);
    });

    console.log('[Automation Engine] Event listeners configured');
  }

  /**
   * 이벤트 핸들링
   */
  private async handleEvent(eventType: string, eventData: any): Promise<void> {
    console.log(`[Automation Engine] Handling event: ${eventType}`);

    // 이벤트 타입에 따른 자동 워크플로우 분류
    const triggerMappings = {
      'file_changes': ['code_to_test_automation', 'context_persistence'],
      'test_opportunities_detected': ['code_to_test_automation'],
      'context_snapshot_created': ['context_persistence'],
      'mcp_task_completed': ['mcp_integration'],
      'significant_changes': ['context_persistence', 'document_management'],
      'document_size_exceeded': ['document_management']
    };

    const triggeredWorkflows = triggerMappings[eventType] || [];

    for (const workflowId of triggeredWorkflows) {
      if (!this.activeWorkflows.has(workflowId)) {
        await this.executeWorkflow(workflowId, eventData);
      }
    }

    // 컨테스트 연속성 업데이트
    await this.updateContestContinuity(eventType, eventData);
  }

  /**
   * 워크플로우 실행
   */
  async executeWorkflow(workflowId: string, triggerData?: any): Promise<boolean> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      console.error(`[Automation Engine] Workflow not found: ${workflowId}`);
      return false;
    }

    if (this.activeWorkflows.has(workflowId)) {
      console.log(`[Automation Engine] Workflow already running: ${workflowId}`);
      return false;
    }

    console.log(`[Automation Engine] Executing workflow: ${workflow.name}`);
    
    this.activeWorkflows.add(workflowId);
    workflow.status = 'running';
    workflow.last_run = new Date().toISOString();
    workflow.run_count++;

    try {
      const results = {};
      
      for (const step of workflow.steps) {
        console.log(`[Automation Engine] Executing step: ${step.name}`);
        
        const stepResult = await this.executeWorkflowStep(step, {
          workflow_id: workflowId,
          trigger_data: triggerData,
          previous_results: results
        });
        
        results[step.step_id] = stepResult;
      }

      workflow.status = 'completed';
      this.emit('workflow_completed', { 
        workflow_id: workflowId, 
        workflow_name: workflow.name,
        results 
      });

      console.log(`[Automation Engine] Workflow completed: ${workflow.name}`);
      return true;

    } catch (error) {
      workflow.status = 'failed';
      this.emit('workflow_failed', { 
        workflow_id: workflowId, 
        workflow_name: workflow.name,
        error: error.message 
      });

      console.error(`[Automation Engine] Workflow failed: ${workflow.name}`, error);
      return false;

    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  /**
   * 워크플로우 스텝 실행
   */
  private async executeWorkflowStep(step: AutomationStep, context: any): Promise<any> {
    const { component, action, parameters, retry_count, timeout } = step;
    
    let lastError;
    for (let attempt = 0; attempt <= retry_count; attempt++) {
      try {
        const result = await Promise.race([
          this.callComponentAction(component, action, { ...parameters, ...context }),
          this.createTimeout(timeout)
        ]);
        
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < retry_count) {
          console.warn(`[Automation Engine] Step failed, retrying (${attempt + 1}/${retry_count}): ${step.name}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // 지수 백오프
        }
      }
    }
    
    throw lastError || new Error(`Step failed after ${retry_count + 1} attempts: ${step.name}`);
  }

  /**
   * 컴포넌트 액션 호출
   */
  private async callComponentAction(componentName: string, action: string, parameters: any): Promise<any> {
    const component = this.components[componentName];
    if (!component) {
      throw new Error(`Component not found: ${componentName}`);
    }

    // 특별한 경우: automation_engine 자체 메서드 호출
    if (componentName === 'automation_engine') {
      return await this[action](parameters);
    }

    // 일반적인 컴포넌트 메서드 호출
    if (typeof component[action] === 'function') {
      return await component[action](parameters);
    } else {
      throw new Error(`Action not found: ${componentName}.${action}`);
    }
  }

  /**
   * 컨테스트 연속성 업데이트
   */
  async updateContestContinuity(eventType: string, eventData: any): Promise<void> {
    // 활성 패턴 업데이트
    if (eventData.patterns_detected) {
      for (const pattern of eventData.patterns_detected) {
        if (!this.contestState.active_patterns.includes(pattern)) {
          this.contestState.active_patterns.push(pattern);
        }
      }
    }

    // Context 축적
    if (eventData.context_snapshot) {
      this.contestState.accumulated_context[eventType] = {
        timestamp: new Date().toISOString(),
        data: eventData.context_snapshot
      };
    }

    // 재사용 기회 업데이트
    if (eventData.reuse_opportunities) {
      this.contestState.reuse_opportunities.push(...eventData.reuse_opportunities);
    }

    // 품질 메트릭 업데이트
    if (eventData.quality_metrics) {
      this.contestState.quality_metrics = {
        ...this.contestState.quality_metrics,
        ...eventData.quality_metrics,
        last_updated: new Date().toISOString()
      };
    }

    this.emit('contest_continuity_updated', this.contestState);
  }

  /**
   * MCP 인사이트 적용
   */
  async applyMcpInsights(parameters: any): Promise<any> {
    const { previous_results } = parameters;
    const mcpResults = previous_results?.coordinate_mcp_servers;

    if (!mcpResults) {
      throw new Error('No MCP results to apply');
    }

    console.log('[Automation Engine] Applying MCP insights');

    const appliedInsights = {
      recommendations_applied: [],
      patterns_integrated: [],
      optimizations_made: []
    };

    // Sequential MCP 결과 적용
    if (mcpResults.sequential) {
      const sequentialResults = mcpResults.sequential;
      
      if (sequentialResults.recommendations) {
        for (const recommendation of sequentialResults.recommendations) {
          appliedInsights.recommendations_applied.push({
            source: 'sequential',
            recommendation,
            applied_at: new Date().toISOString()
          });
        }
      }

      if (sequentialResults.analysis?.insights) {
        appliedInsights.patterns_integrated.push(...sequentialResults.analysis.insights);
      }
    }

    // Context7 MCP 결과 적용
    if (mcpResults.context7) {
      const context7Results = mcpResults.context7;
      
      if (context7Results.documentation?.best_practices) {
        for (const practice of context7Results.documentation.best_practices) {
          appliedInsights.optimizations_made.push({
            source: 'context7',
            optimization: practice,
            applied_at: new Date().toISOString()
          });
        }
      }
    }

    // 컨테스트 상태에 통합
    this.contestState.accumulated_context.mcp_insights = appliedInsights;

    return appliedInsights;
  }

  /**
   * 네비게이션 업데이트
   */
  async updateNavigation(parameters: any): Promise<any> {
    console.log('[Automation Engine] Updating navigation after document split');
    
    // 분할된 페이지들의 네비게이션 링크 업데이트
    const navigationUpdate = {
      updated_files: [],
      navigation_structure: {},
      index_pages_created: []
    };

    // 실제 구현에서는 분할된 파일들을 찾아서 네비게이션 업데이트
    // 여기서는 시뮬레이션
    
    return navigationUpdate;
  }

  /**
   * 컨테스트 상태 업데이트
   */
  async updateContestState(parameters: any): Promise<any> {
    const { previous_results } = parameters;
    
    // Context 캡처 결과를 컨테스트 상태에 반영
    if (previous_results?.capture_context) {
      this.contestState.current_contest_id = previous_results.capture_context;
    }

    // 패턴 추출 결과 반영
    if (previous_results?.extract_patterns) {
      const newPatterns = previous_results.extract_patterns.filter(
        pattern => !this.contestState.active_patterns.includes(pattern)
      );
      this.contestState.active_patterns.push(...newPatterns);
    }

    console.log('[Automation Engine] Contest state updated');
    return this.contestState;
  }

  /**
   * 워크플로우 완료 처리
   */
  private async handleWorkflowCompletion(data: any): Promise<void> {
    console.log(`[Automation Engine] Workflow completed: ${data.workflow_name}`);
    
    // 완료된 워크플로우 결과를 다른 워크플로우의 트리거로 사용
    if (data.workflow_id === 'code_to_test_automation') {
      // 테스트 문서가 생성되었으므로 문서 크기 체크
      this.emit('document_size_check_needed', data.results);
    }

    if (data.workflow_id === 'context_persistence') {
      // Context가 캡처되었으므로 재사용 기회 분석
      this.emit('reuse_opportunities_updated', data.results);
    }
  }

  /**
   * 워크플로우 실패 처리
   */
  private async handleWorkflowFailure(data: any): Promise<void> {
    console.error(`[Automation Engine] Workflow failed: ${data.workflow_name}`, data.error);
    
    // 실패한 워크플로우 재시도 또는 대체 워크플로우 실행
    const workflow = this.workflows.get(data.workflow_id);
    if (workflow && workflow.run_count < 3) {
      console.log(`[Automation Engine] Scheduling retry for failed workflow: ${data.workflow_name}`);
      setTimeout(() => {
        this.executeWorkflow(data.workflow_id, { retry: true });
      }, 5000 * workflow.run_count); // 지수 백오프
    }
  }

  /**
   * 유틸리티 메서드들
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
  }

  private registerWorkflow(workflow: AutomationWorkflow): void {
    this.workflows.set(workflow.workflow_id, workflow);
  }

  /**
   * 공개 API
   */
  async triggerEvent(eventType: string, eventData: any): Promise<void> {
    await this.handleEvent(eventType, eventData);
  }

  getActiveWorkflows(): string[] {
    return Array.from(this.activeWorkflows);
  }

  getWorkflowStatus(workflowId: string): AutomationWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  getAllWorkflows(): AutomationWorkflow[] {
    return Array.from(this.workflows.values());
  }

  getContestState(): ContestContinuityState {
    return { ...this.contestState };
  }

  async pauseWorkflow(workflowId: string): Promise<boolean> {
    const workflow = this.workflows.get(workflowId);
    if (workflow && workflow.status === 'running') {
      workflow.status = 'paused';
      return true;
    }
    return false;
  }

  async resumeWorkflow(workflowId: string): Promise<boolean> {
    const workflow = this.workflows.get(workflowId);
    if (workflow && workflow.status === 'paused') {
      workflow.status = 'running';
      return true;
    }
    return false;
  }

  /**
   * 정리 작업
   */
  async cleanup(): Promise<void> {
    console.log('[Automation Engine] Cleaning up...');
    
    // 활성 워크플로우 정리
    for (const workflowId of this.activeWorkflows) {
      await this.pauseWorkflow(workflowId);
    }

    // 개발 추적 중단
    if (this.components.development_tracker.getCurrentSession()) {
      await this.components.development_tracker.stopTracking();
    }

    // 이벤트 리스너 정리
    this.removeAllListeners();

    console.log('[Automation Engine] Cleanup completed');
  }
}