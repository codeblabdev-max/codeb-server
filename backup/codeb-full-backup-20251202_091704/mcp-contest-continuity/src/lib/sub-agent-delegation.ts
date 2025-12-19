/**
 * Sub-Agent Delegation System
 * 
 * 병렬 처리를 위한 작업 분할 및 Sub-Agent 델리게이션 시스템
 * - 복잡한 작업을 여러 Sub-Agent에 분산
 * - 병렬 실행 및 결과 집계
 * - Agent 간 통신 및 동기화
 * - 실패 처리 및 재시도 메커니즘
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';

// Sub-Agent 정의 스키마
const SubAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['analyzer', 'generator', 'validator', 'transformer', 'specialist']),
  specialization: z.array(z.string()), // 예: ['react', 'typescript', 'testing']
  capabilities: z.array(z.enum([
    'code_analysis', 'pattern_extraction', 'test_generation', 'documentation',
    'refactoring', 'optimization', 'security_scan', 'dependency_analysis'
  ])),
  status: z.enum(['idle', 'busy', 'error', 'offline']),
  current_task: z.string().optional(),
  performance_metrics: z.object({
    tasks_completed: z.number(),
    success_rate: z.number(), // 0-1
    average_execution_time: z.number(), // milliseconds
    error_count: z.number(),
    last_activity: z.string()
  }),
  resource_usage: z.object({
    cpu_percent: z.number(),
    memory_mb: z.number(),
    max_concurrent_tasks: z.number(),
    current_load: z.number()
  })
});

export type SubAgent = z.infer<typeof SubAgentSchema>;

// 작업 정의 스키마
const TaskSchema = z.object({
  id: z.string(),
  type: z.enum(['analysis', 'generation', 'validation', 'transformation']),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  payload: z.object({
    operation: z.string(),
    input_data: z.any(),
    parameters: z.record(z.any()),
    context: z.record(z.any()).optional()
  }),
  requirements: z.object({
    specialization: z.array(z.string()).optional(),
    capabilities: z.array(z.string()),
    estimated_duration: z.number(), // milliseconds
    resource_requirements: z.object({
      cpu_intensive: z.boolean(),
      memory_intensive: z.boolean(),
      io_intensive: z.boolean()
    })
  }),
  constraints: z.object({
    timeout: z.number(), // milliseconds
    max_retries: z.number(),
    dependencies: z.array(z.string()), // task IDs that must complete first
    exclusive: z.boolean() // whether this task requires exclusive access
  }),
  created_at: z.string(),
  assigned_agent: z.string().optional(),
  status: z.enum(['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled']),
  result: z.any().optional(),
  error: z.string().optional(),
  execution_log: z.array(z.object({
    timestamp: z.string(),
    event: z.string(),
    details: z.any().optional()
  }))
});

export type Task = z.infer<typeof TaskSchema>;

// 작업 결과 집계 스키마
const AggregationResultSchema = z.object({
  task_group_id: z.string(),
  total_tasks: z.number(),
  completed_tasks: z.number(),
  failed_tasks: z.number(),
  aggregated_result: z.any(),
  execution_time: z.number(),
  agent_contributions: z.record(z.object({
    tasks_completed: z.number(),
    execution_time: z.number(),
    success_rate: z.number()
  })),
  created_at: z.string(),
  completed_at: z.string().optional()
});

export type AggregationResult = z.infer<typeof AggregationResultSchema>;

// 델리게이션 전략
interface DelegationStrategy {
  name: string;
  description: string;
  selector: (task: Task, availableAgents: SubAgent[]) => SubAgent | null;
  loadBalancer: (tasks: Task[], availableAgents: SubAgent[]) => Map<string, Task[]>;
}

export class SubAgentDelegationSystem extends EventEmitter {
  private agents: Map<string, SubAgent> = new Map();
  private tasks: Map<string, Task> = new Map();
  private taskQueue: Task[] = [];
  private runningTasks: Map<string, Task> = new Map();
  private completedTasks: Map<string, Task> = new Map();
  private taskGroups: Map<string, string[]> = new Map(); // group_id -> task_ids
  private strategies: Map<string, DelegationStrategy> = new Map();
  private activeWorkers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.initializeStrategies();
    this.startTaskScheduler();
  }

  /**
   * Sub-Agent 등록
   */
  registerAgent(agentConfig: Omit<SubAgent, 'id' | 'status' | 'current_task' | 'performance_metrics' | 'resource_usage'>): string {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const agent: SubAgent = {
      id: agentId,
      ...agentConfig,
      status: 'idle',
      performance_metrics: {
        tasks_completed: 0,
        success_rate: 1.0,
        average_execution_time: 0,
        error_count: 0,
        last_activity: new Date().toISOString()
      },
      resource_usage: {
        cpu_percent: 0,
        memory_mb: 0,
        max_concurrent_tasks: agentConfig.type === 'specialist' ? 1 : 3,
        current_load: 0
      }
    };

    this.agents.set(agentId, agent);
    
    console.log(`[SubAgentDelegation] Registered agent: ${agent.name} (${agentId})`);
    this.emit('agent_registered', { agentId, agent });
    
    return agentId;
  }

  /**
   * 복잡한 작업을 여러 Sub-Task로 분할
   */
  async delegateComplexTask(
    taskDescription: string,
    inputData: any,
    options: {
      strategy?: string;
      maxParallelTasks?: number;
      timeout?: number;
      splitStrategy?: 'by_files' | 'by_functions' | 'by_modules' | 'by_analysis_type';
    } = {}
  ): Promise<string> {
    console.log(`[SubAgentDelegation] Delegating complex task: ${taskDescription}`);

    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 작업 분할
    const subTasks = await this.splitComplexTask(taskDescription, inputData, options);
    
    // 각 Sub-Task를 큐에 추가
    const taskIds: string[] = [];
    for (const subTask of subTasks) {
      const taskId = this.scheduleTask(subTask);
      taskIds.push(taskId);
    }

    // 작업 그룹 등록
    this.taskGroups.set(groupId, taskIds);
    
    this.emit('complex_task_delegated', { 
      groupId, 
      taskDescription, 
      subTaskCount: subTasks.length,
      taskIds
    });

    return groupId;
  }

  /**
   * 복잡한 작업 분할
   */
  private async splitComplexTask(
    description: string,
    inputData: any,
    options: any
  ): Promise<Omit<Task, 'id' | 'created_at' | 'status' | 'execution_log'>[]> {
    const splitStrategy = options.splitStrategy || 'by_analysis_type';
    
    switch (splitStrategy) {
      case 'by_files':
        return this.splitByFiles(description, inputData, options);
        
      case 'by_functions':
        return this.splitByFunctions(description, inputData, options);
        
      case 'by_modules':
        return this.splitByModules(description, inputData, options);
        
      case 'by_analysis_type':
      default:
        return this.splitByAnalysisType(description, inputData, options);
    }
  }

  /**
   * 파일별 분할
   */
  private async splitByFiles(description: string, inputData: any, options: any): Promise<any[]> {
    if (!inputData.files || !Array.isArray(inputData.files)) {
      return [this.createSingleTask(description, inputData, options)];
    }

    return inputData.files.map((file: string, index: number) => ({
      type: 'analysis' as const,
      priority: 'normal' as const,
      payload: {
        operation: `analyze_file_${index}`,
        input_data: { file, originalContext: inputData },
        parameters: { ...options, fileIndex: index },
        context: { originalDescription: description, splitStrategy: 'by_files' }
      },
      requirements: {
        capabilities: ['code_analysis'],
        estimated_duration: 30000,
        resource_requirements: {
          cpu_intensive: true,
          memory_intensive: false,
          io_intensive: true
        }
      },
      constraints: {
        timeout: options.timeout || 60000,
        max_retries: 2,
        dependencies: [],
        exclusive: false
      }
    }));
  }

  /**
   * 함수별 분할
   */
  private async splitByFunctions(description: string, inputData: any, options: any): Promise<any[]> {
    if (!inputData.functions || !Array.isArray(inputData.functions)) {
      return [this.createSingleTask(description, inputData, options)];
    }

    return inputData.functions.map((func: any, index: number) => ({
      type: 'analysis' as const,
      priority: 'normal' as const,
      payload: {
        operation: `analyze_function_${index}`,
        input_data: { function: func, originalContext: inputData },
        parameters: { ...options, functionIndex: index },
        context: { originalDescription: description, splitStrategy: 'by_functions' }
      },
      requirements: {
        capabilities: ['code_analysis', 'pattern_extraction'],
        estimated_duration: 15000,
        resource_requirements: {
          cpu_intensive: true,
          memory_intensive: false,
          io_intensive: false
        }
      },
      constraints: {
        timeout: options.timeout || 30000,
        max_retries: 2,
        dependencies: [],
        exclusive: false
      }
    }));
  }

  /**
   * 모듈별 분할
   */
  private async splitByModules(description: string, inputData: any, options: any): Promise<any[]> {
    if (!inputData.modules || !Array.isArray(inputData.modules)) {
      return [this.createSingleTask(description, inputData, options)];
    }

    return inputData.modules.map((module: any, index: number) => ({
      type: 'analysis' as const,
      priority: 'normal' as const,
      payload: {
        operation: `analyze_module_${index}`,
        input_data: { module, originalContext: inputData },
        parameters: { ...options, moduleIndex: index },
        context: { originalDescription: description, splitStrategy: 'by_modules' }
      },
      requirements: {
        capabilities: ['code_analysis', 'dependency_analysis'],
        estimated_duration: 45000,
        resource_requirements: {
          cpu_intensive: true,
          memory_intensive: true,
          io_intensive: true
        }
      },
      constraints: {
        timeout: options.timeout || 90000,
        max_retries: 2,
        dependencies: [],
        exclusive: false
      }
    }));
  }

  /**
   * 분석 타입별 분할
   */
  private async splitByAnalysisType(description: string, inputData: any, options: any): Promise<any[]> {
    const analysisTypes = [
      {
        type: 'code_structure',
        capability: 'code_analysis',
        duration: 20000,
        description: 'Analyze code structure and organization'
      },
      {
        type: 'pattern_extraction',
        capability: 'pattern_extraction', 
        duration: 25000,
        description: 'Extract reusable patterns'
      },
      {
        type: 'dependency_analysis',
        capability: 'dependency_analysis',
        duration: 15000,
        description: 'Analyze dependencies and imports'
      },
      {
        type: 'security_scan',
        capability: 'security_scan',
        duration: 30000,
        description: 'Perform security analysis'
      }
    ];

    return analysisTypes.map((analysis, index) => ({
      type: 'analysis' as const,
      priority: 'normal' as const,
      payload: {
        operation: analysis.type,
        input_data: inputData,
        parameters: { ...options, analysisType: analysis.type },
        context: { 
          originalDescription: description, 
          splitStrategy: 'by_analysis_type',
          analysisDescription: analysis.description
        }
      },
      requirements: {
        capabilities: [analysis.capability as any],
        estimated_duration: analysis.duration,
        resource_requirements: {
          cpu_intensive: analysis.type === 'pattern_extraction',
          memory_intensive: analysis.type === 'dependency_analysis',
          io_intensive: analysis.type === 'security_scan'
        }
      },
      constraints: {
        timeout: analysis.duration * 2,
        max_retries: 2,
        dependencies: [],
        exclusive: analysis.type === 'security_scan'
      }
    }));
  }

  /**
   * 단일 작업 생성
   */
  private createSingleTask(description: string, inputData: any, options: any): any {
    return {
      type: 'analysis' as const,
      priority: 'normal' as const,
      payload: {
        operation: 'comprehensive_analysis',
        input_data: inputData,
        parameters: options,
        context: { originalDescription: description }
      },
      requirements: {
        capabilities: ['code_analysis', 'pattern_extraction'],
        estimated_duration: 60000,
        resource_requirements: {
          cpu_intensive: true,
          memory_intensive: true,
          io_intensive: true
        }
      },
      constraints: {
        timeout: options.timeout || 120000,
        max_retries: 3,
        dependencies: [],
        exclusive: false
      }
    };
  }

  /**
   * 작업 스케줄링
   */
  scheduleTask(taskConfig: Omit<Task, 'id' | 'created_at' | 'status' | 'execution_log'>): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task: Task = {
      id: taskId,
      ...taskConfig,
      created_at: new Date().toISOString(),
      status: 'pending',
      execution_log: [{
        timestamp: new Date().toISOString(),
        event: 'task_created',
        details: { operation: taskConfig.payload.operation }
      }]
    };

    this.tasks.set(taskId, task);
    this.taskQueue.push(task);
    
    // 우선순위별 정렬
    this.taskQueue.sort(this.comparePriority);
    
    console.log(`[SubAgentDelegation] Task scheduled: ${taskConfig.payload.operation} (${taskId})`);
    this.emit('task_scheduled', { taskId, task });

    return taskId;
  }

  /**
   * 작업 실행기 (스케줄러)
   */
  private startTaskScheduler(): void {
    const scheduler = setInterval(() => {
      this.processTaskQueue();
    }, 1000); // 1초마다 실행

    // 프로세스 종료시 정리
    process.on('SIGINT', () => {
      clearInterval(scheduler);
    });
  }

  /**
   * 작업 큐 처리
   */
  private async processTaskQueue(): Promise<void> {
    if (this.taskQueue.length === 0) {
      return;
    }

    // 사용 가능한 Agent 찾기
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => 
        agent.status === 'idle' && 
        agent.resource_usage.current_load < agent.resource_usage.max_concurrent_tasks
      );

    if (availableAgents.length === 0) {
      return;
    }

    // 의존성을 만족하는 작업 찾기
    const readyTasks = this.taskQueue.filter(task => 
      this.areDependenciesSatisfied(task)
    );

    if (readyTasks.length === 0) {
      return;
    }

    // 각 사용 가능한 Agent에 작업 할당
    for (const agent of availableAgents) {
      if (readyTasks.length === 0) break;

      const suitableTask = this.findSuitableTask(readyTasks, agent);
      if (suitableTask) {
        await this.assignTaskToAgent(suitableTask, agent);
        
        // 큐에서 제거
        const taskIndex = this.taskQueue.findIndex(t => t.id === suitableTask.id);
        if (taskIndex >= 0) {
          this.taskQueue.splice(taskIndex, 1);
        }
        
        // ready tasks에서도 제거
        const readyIndex = readyTasks.findIndex(t => t.id === suitableTask.id);
        if (readyIndex >= 0) {
          readyTasks.splice(readyIndex, 1);
        }
      }
    }
  }

  /**
   * 의존성 만족 여부 확인
   */
  private areDependenciesSatisfied(task: Task): boolean {
    return task.constraints.dependencies.every(depId => 
      this.completedTasks.has(depId)
    );
  }

  /**
   * Agent에 적합한 작업 찾기
   */
  private findSuitableTask(tasks: Task[], agent: SubAgent): Task | null {
    const strategy = this.strategies.get('capability_matching');
    if (!strategy) {
      return tasks[0] || null;
    }

    for (const task of tasks) {
      if (this.isAgentSuitableForTask(agent, task)) {
        return task;
      }
    }

    return null;
  }

  /**
   * Agent가 작업에 적합한지 확인
   */
  private isAgentSuitableForTask(agent: SubAgent, task: Task): boolean {
    // 능력 확인
    const hasRequiredCapabilities = task.requirements.capabilities.every(cap =>
      agent.capabilities.includes(cap as any)
    );

    if (!hasRequiredCapabilities) {
      return false;
    }

    // 전문 분야 확인
    if (task.requirements.specialization && task.requirements.specialization.length > 0) {
      const hasSpecialization = task.requirements.specialization.some(spec =>
        agent.specialization.includes(spec)
      );
      
      if (!hasSpecialization) {
        return false;
      }
    }

    // 리소스 확인
    if (agent.resource_usage.current_load >= agent.resource_usage.max_concurrent_tasks) {
      return false;
    }

    // 독점 작업 확인
    if (task.constraints.exclusive && agent.resource_usage.current_load > 0) {
      return false;
    }

    return true;
  }

  /**
   * 작업을 Agent에 할당
   */
  private async assignTaskToAgent(task: Task, agent: SubAgent): Promise<void> {
    console.log(`[SubAgentDelegation] Assigning task ${task.id} to agent ${agent.name}`);

    // 작업 상태 업데이트
    task.status = 'assigned';
    task.assigned_agent = agent.id;
    task.execution_log.push({
      timestamp: new Date().toISOString(),
      event: 'task_assigned',
      details: { agentId: agent.id, agentName: agent.name }
    });

    // Agent 상태 업데이트
    agent.status = 'busy';
    agent.current_task = task.id;
    agent.resource_usage.current_load++;
    agent.performance_metrics.last_activity = new Date().toISOString();

    // 실행 큐에 추가
    this.runningTasks.set(task.id, task);

    this.emit('task_assigned', { taskId: task.id, agentId: agent.id });

    // 작업 실행
    await this.executeTask(task, agent);
  }

  /**
   * 작업 실행
   */
  private async executeTask(task: Task, agent: SubAgent): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`[SubAgentDelegation] Executing task ${task.id} on agent ${agent.name}`);

      // 작업 상태 업데이트
      task.status = 'running';
      task.execution_log.push({
        timestamp: new Date().toISOString(),
        event: 'task_started',
        details: { estimatedDuration: task.requirements.estimated_duration }
      });

      this.emit('task_started', { taskId: task.id, agentId: agent.id });

      // 타임아웃 설정
      const timeoutHandle = setTimeout(() => {
        this.handleTaskTimeout(task, agent);
      }, task.constraints.timeout);

      // 실제 작업 실행 (시뮬레이션)
      const result = await this.simulateTaskExecution(task, agent);
      
      clearTimeout(timeoutHandle);

      // 성공적 완료
      await this.completeTask(task, agent, result, startTime);

    } catch (error) {
      await this.handleTaskError(task, agent, error as Error, startTime);
    }
  }

  /**
   * 작업 실행 시뮬레이션
   */
  private async simulateTaskExecution(task: Task, agent: SubAgent): Promise<any> {
    // 실제 구현에서는 여기서 실제 작업을 수행
    // 현재는 시뮬레이션을 위한 대기
    
    const executionTime = task.requirements.estimated_duration + 
      (Math.random() - 0.5) * task.requirements.estimated_duration * 0.3;

    await new Promise(resolve => setTimeout(resolve, Math.max(1000, executionTime)));

    // 시뮬레이션 결과 생성
    const operation = task.payload.operation;
    
    if (operation.includes('analyze_file')) {
      return {
        type: 'file_analysis',
        file: task.payload.input_data.file,
        analysis: {
          functions: Math.floor(Math.random() * 10) + 1,
          complexity: Math.random() * 10,
          lines_of_code: Math.floor(Math.random() * 500) + 50,
          patterns_found: Math.floor(Math.random() * 5)
        },
        recommendations: [
          'Consider extracting common patterns',
          'Add unit tests for complex functions',
          'Improve code documentation'
        ]
      };
    } else if (operation.includes('pattern_extraction')) {
      return {
        type: 'pattern_analysis',
        patterns_extracted: Math.floor(Math.random() * 8) + 2,
        patterns: [
          { name: 'React Component Pattern', confidence: 0.9 },
          { name: 'API Client Pattern', confidence: 0.8 },
          { name: 'Error Handler Pattern', confidence: 0.7 }
        ]
      };
    } else {
      return {
        type: 'generic_analysis',
        status: 'completed',
        insights: [
          'Code structure is well organized',
          'Good separation of concerns',
          'Consider performance optimizations'
        ],
        metrics: {
          quality_score: Math.random() * 40 + 60,
          maintainability: Math.random() * 30 + 70,
          complexity: Math.random() * 50 + 25
        }
      };
    }
  }

  /**
   * 작업 완료 처리
   */
  private async completeTask(
    task: Task, 
    agent: SubAgent, 
    result: any, 
    startTime: number
  ): Promise<void> {
    const executionTime = Date.now() - startTime;

    console.log(`[SubAgentDelegation] Task ${task.id} completed successfully in ${executionTime}ms`);

    // 작업 상태 업데이트
    task.status = 'completed';
    task.result = result;
    task.execution_log.push({
      timestamp: new Date().toISOString(),
      event: 'task_completed',
      details: { executionTime, resultType: typeof result }
    });

    // Agent 상태 업데이트
    agent.status = 'idle';
    agent.current_task = undefined;
    agent.resource_usage.current_load--;
    agent.performance_metrics.tasks_completed++;
    agent.performance_metrics.last_activity = new Date().toISOString();
    
    // 평균 실행 시간 업데이트
    const currentAvg = agent.performance_metrics.average_execution_time;
    const taskCount = agent.performance_metrics.tasks_completed;
    agent.performance_metrics.average_execution_time = 
      ((currentAvg * (taskCount - 1)) + executionTime) / taskCount;

    // 성공률 업데이트
    const totalTasks = agent.performance_metrics.tasks_completed + agent.performance_metrics.error_count;
    agent.performance_metrics.success_rate = agent.performance_metrics.tasks_completed / totalTasks;

    // 큐에서 제거하고 완료 목록에 추가
    this.runningTasks.delete(task.id);
    this.completedTasks.set(task.id, task);

    this.emit('task_completed', { taskId: task.id, agentId: agent.id, result, executionTime });

    // 그룹 완료 확인
    await this.checkGroupCompletion(task.id);
  }

  /**
   * 작업 오류 처리
   */
  private async handleTaskError(
    task: Task, 
    agent: SubAgent, 
    error: Error, 
    startTime: number
  ): Promise<void> {
    const executionTime = Date.now() - startTime;

    console.error(`[SubAgentDelegation] Task ${task.id} failed:`, error.message);

    // 재시도 가능한지 확인
    const currentAttempts = task.execution_log.filter(log => 
      log.event === 'task_started'
    ).length;

    if (currentAttempts < task.constraints.max_retries) {
      // 재시도 스케줄링
      task.status = 'pending';
      task.assigned_agent = undefined;
      task.execution_log.push({
        timestamp: new Date().toISOString(),
        event: 'task_retry_scheduled',
        details: { error: error.message, attempt: currentAttempts }
      });

      // Agent 상태 복구
      agent.status = 'idle';
      agent.current_task = undefined;
      agent.resource_usage.current_load--;

      // 큐에 다시 추가
      this.runningTasks.delete(task.id);
      this.taskQueue.unshift(task); // 우선순위 높여서 앞에 추가

      this.emit('task_retry_scheduled', { taskId: task.id, attempt: currentAttempts });

    } else {
      // 최종 실패
      task.status = 'failed';
      task.error = error.message;
      task.execution_log.push({
        timestamp: new Date().toISOString(),
        event: 'task_failed',
        details: { error: error.message, executionTime }
      });

      // Agent 상태 업데이트
      agent.status = 'idle';
      agent.current_task = undefined;
      agent.resource_usage.current_load--;
      agent.performance_metrics.error_count++;
      agent.performance_metrics.last_activity = new Date().toISOString();

      // 성공률 업데이트
      const totalTasks = agent.performance_metrics.tasks_completed + agent.performance_metrics.error_count;
      agent.performance_metrics.success_rate = agent.performance_metrics.tasks_completed / totalTasks;

      this.runningTasks.delete(task.id);

      this.emit('task_failed', { taskId: task.id, agentId: agent.id, error: error.message });

      // 그룹 실패 확인
      await this.checkGroupCompletion(task.id);
    }
  }

  /**
   * 작업 타임아웃 처리
   */
  private handleTaskTimeout(task: Task, agent: SubAgent): void {
    console.warn(`[SubAgentDelegation] Task ${task.id} timed out`);
    
    this.handleTaskError(task, agent, new Error('Task timeout'), Date.now() - new Date(task.created_at).getTime());
  }

  /**
   * 그룹 완료 확인
   */
  private async checkGroupCompletion(taskId: string): Promise<void> {
    // 이 작업이 속한 그룹 찾기
    let groupId: string | null = null;
    for (const [gId, taskIds] of this.taskGroups.entries()) {
      if (taskIds.includes(taskId)) {
        groupId = gId;
        break;
      }
    }

    if (!groupId) return;

    const taskIds = this.taskGroups.get(groupId)!;
    const tasks = taskIds.map(id => this.tasks.get(id) || this.completedTasks.get(id)).filter(t => t);
    
    // 모든 작업이 완료되었는지 확인
    const completedTasks = tasks.filter(t => t!.status === 'completed');
    const failedTasks = tasks.filter(t => t!.status === 'failed');
    const totalTasks = tasks.length;

    if (completedTasks.length + failedTasks.length === totalTasks) {
      // 그룹 완료
      console.log(`[SubAgentDelegation] Task group ${groupId} completed`);
      
      const result = await this.aggregateGroupResults(groupId, tasks as Task[]);
      
      this.emit('group_completed', { 
        groupId, 
        result,
        totalTasks,
        completedTasks: completedTasks.length,
        failedTasks: failedTasks.length
      });
    }
  }

  /**
   * 그룹 결과 집계
   */
  private async aggregateGroupResults(groupId: string, tasks: Task[]): Promise<AggregationResult> {
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const failedTasks = tasks.filter(t => t.status === 'failed');

    // Agent별 기여도 계산
    const agentContributions: Record<string, any> = {};
    
    for (const task of completedTasks) {
      if (task.assigned_agent) {
        if (!agentContributions[task.assigned_agent]) {
          agentContributions[task.assigned_agent] = {
            tasks_completed: 0,
            execution_time: 0,
            success_rate: 0
          };
        }
        
        const contribution = agentContributions[task.assigned_agent];
        contribution.tasks_completed++;
        
        const executionLog = task.execution_log;
        const startLog = executionLog.find(log => log.event === 'task_started');
        const endLog = executionLog.find(log => log.event === 'task_completed');
        
        if (startLog && endLog) {
          const executionTime = new Date(endLog.timestamp).getTime() - new Date(startLog.timestamp).getTime();
          contribution.execution_time += executionTime;
        }
      }
    }

    // 성공률 계산
    for (const [agentId, contribution] of Object.entries(agentContributions)) {
      const agentTasks = tasks.filter(t => t.assigned_agent === agentId);
      const agentCompleted = agentTasks.filter(t => t.status === 'completed');
      contribution.success_rate = agentCompleted.length / agentTasks.length;
    }

    // 결과 집계
    const aggregatedResult = this.mergeTaskResults(completedTasks.map(t => t.result));

    const result: AggregationResult = {
      task_group_id: groupId,
      total_tasks: tasks.length,
      completed_tasks: completedTasks.length,
      failed_tasks: failedTasks.length,
      aggregated_result: aggregatedResult,
      execution_time: this.calculateTotalExecutionTime(tasks),
      agent_contributions: agentContributions,
      created_at: tasks[0]?.created_at || new Date().toISOString(),
      completed_at: new Date().toISOString()
    };

    return result;
  }

  /**
   * 작업 결과 병합
   */
  private mergeTaskResults(results: any[]): any {
    // 결과 타입별 병합 로직
    const merged: any = {
      summary: {
        total_results: results.length,
        result_types: {},
        combined_insights: [],
        combined_metrics: {}
      }
    };

    for (const result of results) {
      if (!result) continue;

      const resultType = result.type || 'unknown';
      
      // 타입별 카운트
      merged.summary.result_types[resultType] = (merged.summary.result_types[resultType] || 0) + 1;

      // 인사이트 병합
      if (result.insights && Array.isArray(result.insights)) {
        merged.summary.combined_insights.push(...result.insights);
      }

      // 메트릭 병합
      if (result.metrics) {
        for (const [key, value] of Object.entries(result.metrics)) {
          if (typeof value === 'number') {
            if (!merged.summary.combined_metrics[key]) {
              merged.summary.combined_metrics[key] = { sum: 0, count: 0, average: 0 };
            }
            merged.summary.combined_metrics[key].sum += value;
            merged.summary.combined_metrics[key].count++;
            merged.summary.combined_metrics[key].average = 
              merged.summary.combined_metrics[key].sum / merged.summary.combined_metrics[key].count;
          }
        }
      }

      // 결과별 상세 정보
      if (!merged[resultType]) {
        merged[resultType] = [];
      }
      merged[resultType].push(result);
    }

    // 중복 인사이트 제거
    merged.summary.combined_insights = [...new Set(merged.summary.combined_insights)];

    return merged;
  }

  /**
   * 총 실행 시간 계산
   */
  private calculateTotalExecutionTime(tasks: Task[]): number {
    // 병렬 실행을 고려한 총 실행 시간 계산
    const timeRanges: Array<{start: number, end: number}> = [];

    for (const task of tasks) {
      const startLog = task.execution_log.find(log => log.event === 'task_started');
      const endLog = task.execution_log.find(log => log.event === 'task_completed' || log.event === 'task_failed');

      if (startLog && endLog) {
        timeRanges.push({
          start: new Date(startLog.timestamp).getTime(),
          end: new Date(endLog.timestamp).getTime()
        });
      }
    }

    if (timeRanges.length === 0) return 0;

    // 겹치는 시간 구간을 병합하여 실제 실행 시간 계산
    timeRanges.sort((a, b) => a.start - b.start);
    
    let totalTime = 0;
    let currentEnd = 0;

    for (const range of timeRanges) {
      if (range.start > currentEnd) {
        // 새로운 구간
        totalTime += range.end - range.start;
        currentEnd = range.end;
      } else if (range.end > currentEnd) {
        // 겹치는 구간
        totalTime += range.end - currentEnd;
        currentEnd = range.end;
      }
    }

    return totalTime;
  }

  /**
   * 델리게이션 전략 초기화
   */
  private initializeStrategies(): void {
    // 능력 기반 매칭 전략
    this.strategies.set('capability_matching', {
      name: 'Capability Matching',
      description: 'Match tasks to agents based on required capabilities',
      selector: (task, agents) => {
        return agents.find(agent => 
          task.requirements.capabilities.every(cap => 
            agent.capabilities.includes(cap as any)
          )
        ) || null;
      },
      loadBalancer: (tasks, agents) => {
        const assignment = new Map<string, Task[]>();
        
        for (const agent of agents) {
          assignment.set(agent.id, []);
        }

        for (const task of tasks) {
          const suitableAgents = agents.filter(agent =>
            task.requirements.capabilities.every(cap =>
              agent.capabilities.includes(cap as any)
            )
          );

          if (suitableAgents.length > 0) {
            // 가장 적게 할당받은 Agent 선택
            const selectedAgent = suitableAgents.reduce((min, agent) => 
              (assignment.get(agent.id)?.length || 0) < (assignment.get(min.id)?.length || 0) ? agent : min
            );

            assignment.get(selectedAgent.id)?.push(task);
          }
        }

        return assignment;
      }
    });

    // 성능 기반 전략
    this.strategies.set('performance_based', {
      name: 'Performance Based',
      description: 'Assign tasks based on agent performance metrics',
      selector: (task, agents) => {
        const suitableAgents = agents.filter(agent =>
          task.requirements.capabilities.every(cap =>
            agent.capabilities.includes(cap as any)
          )
        );

        if (suitableAgents.length === 0) return null;

        // 성공률과 평균 실행 시간을 고려한 점수 계산
        return suitableAgents.reduce((best, agent) => {
          const agentScore = (agent.performance_metrics.success_rate * 0.7) + 
                          ((1 / (agent.performance_metrics.average_execution_time || 1000)) * 0.3);
          const bestScore = (best.performance_metrics.success_rate * 0.7) + 
                          ((1 / (best.performance_metrics.average_execution_time || 1000)) * 0.3);
          
          return agentScore > bestScore ? agent : best;
        });
      },
      loadBalancer: (tasks, agents) => {
        // 성능 기반 로드 밸런싱 구현
        return new Map(); // 간단화
      }
    });
  }

  /**
   * 우선순위 비교 함수
   */
  private comparePriority = (a: Task, b: Task): number => {
    const priorityOrder = { 'critical': 4, 'high': 3, 'normal': 2, 'low': 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  };

  /**
   * 시스템 통계
   */
  getStatistics() {
    const agents = Array.from(this.agents.values());
    const tasks = Array.from(this.tasks.values());
    const completedTasks = Array.from(this.completedTasks.values());

    return {
      agents: {
        total: agents.length,
        by_status: this.groupByStatus(agents),
        by_type: this.groupByType(agents),
        average_success_rate: agents.reduce((sum, a) => sum + a.performance_metrics.success_rate, 0) / agents.length,
        total_tasks_completed: agents.reduce((sum, a) => sum + a.performance_metrics.tasks_completed, 0)
      },
      tasks: {
        total: tasks.length + completedTasks.length,
        queued: this.taskQueue.length,
        running: this.runningTasks.size,
        completed: completedTasks.length,
        by_priority: this.groupByPriority([...tasks, ...completedTasks]),
        by_type: this.groupByTaskType([...tasks, ...completedTasks])
      },
      groups: {
        total: this.taskGroups.size,
        average_tasks_per_group: Array.from(this.taskGroups.values())
          .reduce((sum, tasks) => sum + tasks.length, 0) / this.taskGroups.size
      },
      performance: {
        average_execution_time: completedTasks.length > 0 ? 
          completedTasks.reduce((sum, task) => {
            const start = task.execution_log.find(log => log.event === 'task_started');
            const end = task.execution_log.find(log => log.event === 'task_completed');
            if (start && end) {
              return sum + (new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime());
            }
            return sum;
          }, 0) / completedTasks.length : 0,
        success_rate: tasks.length + completedTasks.length > 0 ?
          completedTasks.length / (tasks.length + completedTasks.length) : 0
      }
    };
  }

  /**
   * 유틸리티 메서드들
   */
  private groupByStatus(agents: SubAgent[]) {
    return agents.reduce((groups, agent) => {
      groups[agent.status] = (groups[agent.status] || 0) + 1;
      return groups;
    }, {} as Record<string, number>);
  }

  private groupByType(agents: SubAgent[]) {
    return agents.reduce((groups, agent) => {
      groups[agent.type] = (groups[agent.type] || 0) + 1;
      return groups;
    }, {} as Record<string, number>);
  }

  private groupByPriority(tasks: Task[]) {
    return tasks.reduce((groups, task) => {
      groups[task.priority] = (groups[task.priority] || 0) + 1;
      return groups;
    }, {} as Record<string, number>);
  }

  private groupByTaskType(tasks: Task[]) {
    return tasks.reduce((groups, task) => {
      groups[task.type] = (groups[task.type] || 0) + 1;
      return groups;
    }, {} as Record<string, number>);
  }

  /**
   * 정리
   */
  async cleanup(): Promise<void> {
    // 실행 중인 작업들 정리
    for (const [taskId, timeout] of this.activeWorkers.entries()) {
      clearTimeout(timeout);
    }
    this.activeWorkers.clear();

    // 모든 Agent를 idle 상태로 설정
    for (const agent of this.agents.values()) {
      agent.status = 'idle';
      agent.current_task = undefined;
      agent.resource_usage.current_load = 0;
    }

    console.log('[SubAgentDelegation] Cleanup completed');
  }
}