/**
 * Hierarchical Multi-Agent Orchestra System (MAOS)
 * 상위 1% 개발자의 혁신적인 계층형 에이전트 시스템
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Agent 계층 정의
export enum AgentTier {
  ORCHESTRATOR = 'orchestrator',    // 최상위: 전체 조율
  DOMAIN_LEAD = 'domain_lead',       // 대분류: 도메인 리더
  SPECIALIST = 'specialist',         // 중분류: 전문가
  WORKER = 'worker'                  // 소분류: 실행자
}

// Agent 타입 정의
export interface Agent {
  id: string;
  name: string;
  tier: AgentTier;
  domain?: string;
  specialization?: string;
  parent?: string;
  children: string[];
  capabilities: string[];
  status: 'idle' | 'working' | 'reviewing' | 'blocked';
  currentTask?: any;
}

// 작업 결과 타입
export interface TaskResult {
  agentId: string;
  taskId: string;
  status: 'success' | 'failure' | 'partial';
  data: any;
  confidence: number;
  reviewRequired: boolean;
  errors?: string[];
  suggestions?: string[];
}

/**
 * 계층적 Multi-Agent Orchestra System
 */
export class HierarchicalAgentSystem extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private taskQueue: Map<string, any[]> = new Map();
  private resultCache: Map<string, TaskResult> = new Map();
  private orchestratorId: string;

  constructor() {
    super();
    this.orchestratorId = this.createOrchestrator();
    this.setupAgentHierarchy();
  }

  /**
   * 최상위 오케스트레이터 생성
   */
  private createOrchestrator(): string {
    const orchestrator: Agent = {
      id: 'orchestrator-001',
      name: 'Master Orchestrator',
      tier: AgentTier.ORCHESTRATOR,
      children: [],
      capabilities: [
        'task_decomposition',
        'agent_assignment',
        'result_aggregation',
        'quality_assurance',
        'conflict_resolution'
      ],
      status: 'idle'
    };

    this.agents.set(orchestrator.id, orchestrator);
    return orchestrator.id;
  }

  /**
   * 전체 에이전트 계층 구조 설정
   */
  private setupAgentHierarchy(): void {
    // Domain Lead Agents (대분류)
    const domains = [
      { id: 'frontend-lead', name: 'Frontend Domain Lead', domain: 'frontend' },
      { id: 'backend-lead', name: 'Backend Domain Lead', domain: 'backend' },
      { id: 'infra-lead', name: 'Infrastructure Domain Lead', domain: 'infrastructure' },
      { id: 'quality-lead', name: 'Quality Domain Lead', domain: 'quality' }
    ];

    domains.forEach(domain => {
      this.createDomainLead(domain);
    });

    // Specialist Agents (중분류)
    this.createSpecialists();

    // Worker Agents (소분류)
    this.createWorkers();
  }

  /**
   * Domain Lead 에이전트 생성
   */
  private createDomainLead(config: any): void {
    const lead: Agent = {
      id: config.id,
      name: config.name,
      tier: AgentTier.DOMAIN_LEAD,
      domain: config.domain,
      parent: this.orchestratorId,
      children: [],
      capabilities: [
        `${config.domain}_analysis`,
        `${config.domain}_planning`,
        `${config.domain}_review`,
        'specialist_coordination'
      ],
      status: 'idle'
    };

    this.agents.set(lead.id, lead);
    
    // 오케스트레이터에 연결
    const orchestrator = this.agents.get(this.orchestratorId)!;
    orchestrator.children.push(lead.id);
  }

  /**
   * Specialist 에이전트 생성
   */
  private createSpecialists(): void {
    const specialists = [
      // Frontend Specialists
      { id: 'react-specialist', parent: 'frontend-lead', specialization: 'React/Next.js' },
      { id: 'ui-specialist', parent: 'frontend-lead', specialization: 'UI/UX' },
      { id: 'state-specialist', parent: 'frontend-lead', specialization: 'State Management' },
      
      // Backend Specialists
      { id: 'api-specialist', parent: 'backend-lead', specialization: 'API Design' },
      { id: 'db-specialist', parent: 'backend-lead', specialization: 'Database' },
      { id: 'websocket-specialist', parent: 'backend-lead', specialization: 'WebSocket/Realtime' },
      
      // Infrastructure Specialists
      { id: 'container-specialist', parent: 'infra-lead', specialization: 'Podman/Docker' },
      { id: 'paas-specialist', parent: 'infra-lead', specialization: 'PaaS Deployment' },
      
      // Quality Specialists
      { id: 'test-specialist', parent: 'quality-lead', specialization: 'Testing' },
      { id: 'refactor-specialist', parent: 'quality-lead', specialization: 'Refactoring' },
      { id: 'dependency-specialist', parent: 'quality-lead', specialization: 'Dependencies' }
    ];

    specialists.forEach(spec => {
      const specialist: Agent = {
        id: spec.id,
        name: `${spec.specialization} Specialist`,
        tier: AgentTier.SPECIALIST,
        specialization: spec.specialization,
        parent: spec.parent,
        children: [],
        capabilities: [
          `analyze_${spec.specialization.toLowerCase().replace(/[^a-z]/g, '_')}`,
          `implement_${spec.specialization.toLowerCase().replace(/[^a-z]/g, '_')}`,
          `optimize_${spec.specialization.toLowerCase().replace(/[^a-z]/g, '_')}`
        ],
        status: 'idle'
      };

      this.agents.set(specialist.id, specialist);
      
      // 부모에 연결
      const parent = this.agents.get(spec.parent);
      if (parent) {
        parent.children.push(specialist.id);
      }
    });
  }

  /**
   * Worker 에이전트 생성
   */
  private createWorkers(): void {
    // 각 Specialist마다 3개의 Worker 생성
    this.agents.forEach(agent => {
      if (agent.tier === AgentTier.SPECIALIST) {
        for (let i = 1; i <= 3; i++) {
          const worker: Agent = {
            id: `${agent.id}-worker-${i}`,
            name: `${agent.specialization} Worker ${i}`,
            tier: AgentTier.WORKER,
            parent: agent.id,
            children: [],
            capabilities: [
              'execute_task',
              'validate_result',
              'report_status'
            ],
            status: 'idle'
          };

          this.agents.set(worker.id, worker);
          agent.children.push(worker.id);
        }
      }
    });
  }

  /**
   * 작업 위임 (최상위에서 시작)
   */
  public async delegateTask(task: any): Promise<TaskResult> {
    console.log(`🎯 Orchestrator received task: ${task.description}`);
    
    // 작업 분해
    const subtasks = await this.decomposeTask(task);
    
    // Domain Lead에게 할당
    const assignments = await this.assignToDomainLeads(subtasks);
    
    // 실행 및 모니터링
    const results = await this.executeAndMonitor(assignments);
    
    // 결과 집계 및 검증
    const finalResult = await this.aggregateAndValidate(results);
    
    return finalResult;
  }

  /**
   * 작업 분해
   */
  private async decomposeTask(task: any): Promise<any[]> {
    const subtasks = [];
    
    // 작업 타입에 따라 분해
    if (task.type === 'cleanup-dependencies') {
      subtasks.push(
        { domain: 'frontend', action: 'analyze_dependencies', scope: 'React/Next.js' },
        { domain: 'backend', action: 'analyze_dependencies', scope: 'Socket.io/API' },
        { domain: 'quality', action: 'detect_duplicates', scope: 'all' },
        { domain: 'quality', action: 'suggest_removals', scope: 'unused' }
      );
    } else if (task.type === 'pattern-extraction') {
      subtasks.push(
        { domain: 'frontend', action: 'extract_components', scope: 'reusable' },
        { domain: 'backend', action: 'extract_api_patterns', scope: 'CRUD' },
        { domain: 'infrastructure', action: 'extract_configs', scope: 'deployment' },
        { domain: 'quality', action: 'create_templates', scope: 'patterns' }
      );
    }
    
    return subtasks;
  }

  /**
   * Domain Lead에게 작업 할당
   */
  private async assignToDomainLeads(subtasks: any[]): Promise<Map<string, any[]>> {
    const assignments = new Map<string, any[]>();
    
    subtasks.forEach(subtask => {
      const leadId = `${subtask.domain}-lead`;
      if (!assignments.has(leadId)) {
        assignments.set(leadId, []);
      }
      assignments.get(leadId)!.push(subtask);
    });
    
    // 각 Domain Lead가 자신의 Specialist에게 재할당
    for (const [leadId, tasks] of assignments) {
      const lead = this.agents.get(leadId);
      if (lead) {
        await this.cascadeToSpecialists(lead, tasks);
      }
    }
    
    return assignments;
  }

  /**
   * Specialist에게 연쇄 할당
   */
  private async cascadeToSpecialists(lead: Agent, tasks: any[]): Promise<void> {
    for (const task of tasks) {
      // 적합한 Specialist 찾기
      const specialist = lead.children.find(childId => {
        const child = this.agents.get(childId);
        return child && child.capabilities.some(cap => cap.includes(task.action));
      });
      
      if (specialist) {
        const specialistAgent = this.agents.get(specialist)!;
        
        // Worker에게 최종 할당
        const worker = this.selectIdleWorker(specialistAgent.children);
        if (worker) {
          await this.assignToWorker(worker, task);
        }
      }
    }
  }

  /**
   * 유휴 Worker 선택
   */
  private selectIdleWorker(workerIds: string[]): string | null {
    for (const workerId of workerIds) {
      const worker = this.agents.get(workerId);
      if (worker && worker.status === 'idle') {
        return workerId;
      }
    }
    return null;
  }

  /**
   * Worker에 작업 할당
   */
  private async assignToWorker(workerId: string, task: any): Promise<void> {
    const worker = this.agents.get(workerId)!;
    worker.status = 'working';
    worker.currentTask = task;
    
    // 실제 작업 실행 (Claude Code 명령 또는 스크립트)
    this.emit('worker-started', { workerId, task });
    
    // 비동기 작업 시뮬레이션
    setTimeout(() => {
      worker.status = 'idle';
      worker.currentTask = undefined;
      this.emit('worker-completed', { workerId, task, result: 'success' });
    }, Math.random() * 5000);
  }

  /**
   * 실행 모니터링
   */
  private async executeAndMonitor(assignments: Map<string, any[]>): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    
    // 모든 작업 완료 대기
    await new Promise(resolve => {
      let completedCount = 0;
      const totalTasks = Array.from(assignments.values()).flat().length;
      
      this.on('worker-completed', (event) => {
        completedCount++;
        
        results.push({
          agentId: event.workerId,
          taskId: `task-${Date.now()}`,
          status: 'success',
          data: event.result,
          confidence: 0.95,
          reviewRequired: false
        });
        
        if (completedCount >= totalTasks) {
          resolve(undefined);
        }
      });
    });
    
    return results;
  }

  /**
   * 결과 집계 및 검증
   */
  private async aggregateAndValidate(results: TaskResult[]): Promise<TaskResult> {
    // 계층적 검증: Worker → Specialist → Domain Lead → Orchestrator
    let aggregatedResult: TaskResult = {
      agentId: this.orchestratorId,
      taskId: `final-${Date.now()}`,
      status: 'success',
      data: {},
      confidence: 0,
      reviewRequired: false
    };
    
    // 각 계층에서 검증
    for (const result of results) {
      const agent = this.agents.get(result.agentId);
      if (agent && agent.parent) {
        const parent = this.agents.get(agent.parent);
        if (parent) {
          // 상위 에이전트가 검토
          result.reviewRequired = result.confidence < 0.8;
          
          if (result.reviewRequired) {
            console.log(`🔍 ${parent.name} reviewing ${agent.name}'s work`);
          }
        }
      }
      
      // 결과 병합
      Object.assign(aggregatedResult.data, result.data);
      aggregatedResult.confidence = Math.max(aggregatedResult.confidence, result.confidence);
    }
    
    return aggregatedResult;
  }

  /**
   * 에이전트 상태 모니터링
   */
  public getSystemStatus(): any {
    const status = {
      total: this.agents.size,
      byTier: {
        orchestrator: 0,
        domainLead: 0,
        specialist: 0,
        worker: 0
      },
      byStatus: {
        idle: 0,
        working: 0,
        reviewing: 0,
        blocked: 0
      }
    };
    
    this.agents.forEach(agent => {
      status.byTier[agent.tier as keyof typeof status.byTier]++;
      status.byStatus[agent.status]++;
    });
    
    return status;
  }

  /**
   * 에이전트 트리 시각화
   */
  public visualizeHierarchy(): string {
    let tree = '🎭 Multi-Agent Orchestra System\n';
    
    const buildTree = (agentId: string, depth: number = 0): void => {
      const agent = this.agents.get(agentId);
      if (!agent) return;
      
      const indent = '  '.repeat(depth);
      const icon = this.getTierIcon(agent.tier);
      tree += `${indent}${icon} ${agent.name} [${agent.status}]\n`;
      
      agent.children.forEach(childId => {
        buildTree(childId, depth + 1);
      });
    };
    
    buildTree(this.orchestratorId);
    return tree;
  }

  private getTierIcon(tier: AgentTier): string {
    switch (tier) {
      case AgentTier.ORCHESTRATOR: return '👑';
      case AgentTier.DOMAIN_LEAD: return '🎯';
      case AgentTier.SPECIALIST: return '🔧';
      case AgentTier.WORKER: return '⚙️';
      default: return '❓';
    }
  }
}