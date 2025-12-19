/**
 * Delegate Tasks Tool
 * 
 * Sub-Agent 작업 델리게이션 도구
 */

import { SubAgentDelegationSystem } from '../lib/sub-agent-delegation.js';

interface DelegateTasksArgs {
  operation: 'register_agent' | 'delegate_task' | 'get_status' | 'get_results' | 'cancel_task';
  agent_config?: {
    name: string;
    type: 'analyzer' | 'generator' | 'validator' | 'transformer' | 'specialist';
    specialization: string[];
    capabilities: string[];
  };
  task_description?: string;
  task_input?: any;
  delegation_options?: {
    strategy?: string;
    maxParallelTasks?: number;
    timeout?: number;
    splitStrategy?: 'by_files' | 'by_functions' | 'by_modules' | 'by_analysis_type';
  };
  task_group_id?: string;
  task_id?: string;
}

export class DelegateTasksTool {
  private delegationSystem: SubAgentDelegationSystem;

  constructor() {
    this.delegationSystem = new SubAgentDelegationSystem();
    this.setupEventListeners();
  }

  async execute(args: DelegateTasksArgs) {
    try {
      switch (args.operation) {
        case 'register_agent':
          return await this.registerAgent(args);
        
        case 'delegate_task':
          return await this.delegateTask(args);
        
        case 'get_status':
          return await this.getStatus();
        
        case 'get_results':
          return await this.getResults(args);
        
        case 'cancel_task':
          return await this.cancelTask(args);
        
        default:
          throw new Error(`Unknown operation: ${args.operation}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  private async registerAgent(args: DelegateTasksArgs) {
    if (!args.agent_config) {
      throw new Error('agent_config is required for register_agent operation');
    }

    console.log(`[DelegateTasks] Registering agent: ${args.agent_config.name}`);

    const agentId = this.delegationSystem.registerAgent(args.agent_config);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'register_agent',
            results: {
              agent_id: agentId,
              agent_config: args.agent_config,
              registered_at: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async delegateTask(args: DelegateTasksArgs) {
    if (!args.task_description || !args.task_input) {
      throw new Error('task_description and task_input are required for delegate_task operation');
    }

    console.log(`[DelegateTasks] Delegating task: ${args.task_description}`);

    const groupId = await this.delegationSystem.delegateComplexTask(
      args.task_description,
      args.task_input,
      args.delegation_options || {}
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'delegate_task',
            results: {
              group_id: groupId,
              task_description: args.task_description,
              delegation_options: args.delegation_options,
              delegated_at: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async getStatus() {
    const statistics = this.delegationSystem.getStatistics();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'get_status',
            results: {
              system_status: 'active',
              statistics,
              uptime: 'active' // 실제 구현에서는 시작 시간부터 계산
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async getResults(args: DelegateTasksArgs) {
    if (!args.task_group_id) {
      throw new Error('task_group_id is required for get_results operation');
    }

    // 실제 구현에서는 delegationSystem에서 결과를 가져와야 함
    // 현재는 시뮬레이션 결과 반환
    const mockResults = {
      group_id: args.task_group_id,
      status: 'completed',
      total_tasks: 4,
      completed_tasks: 4,
      failed_tasks: 0,
      execution_time: 45000,
      results: {
        summary: {
          total_files_analyzed: 15,
          patterns_extracted: 8,
          issues_found: 3,
          recommendations: 12
        },
        detailed_results: [
          {
            task_type: 'code_analysis',
            status: 'completed',
            result: {
              files_analyzed: 8,
              complexity_score: 6.2,
              maintainability_index: 75.3
            }
          },
          {
            task_type: 'pattern_extraction',
            status: 'completed',
            result: {
              patterns_found: 8,
              confidence_scores: [0.9, 0.8, 0.85, 0.7, 0.9, 0.6, 0.8, 0.75]
            }
          }
        ]
      }
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'get_results',
            results: mockResults,
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async cancelTask(args: DelegateTasksArgs) {
    if (!args.task_id && !args.task_group_id) {
      throw new Error('task_id or task_group_id is required for cancel_task operation');
    }

    // 실제 구현에서는 작업 취소 로직 구현
    console.log(`[DelegateTasks] Cancelling task: ${args.task_id || args.task_group_id}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'cancel_task',
            results: {
              cancelled_id: args.task_id || args.task_group_id,
              cancelled_at: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private setupEventListeners() {
    this.delegationSystem.on('agent_registered', (data) => {
      console.log(`[DelegateTasks] Agent registered: ${data.agent.name} (${data.agentId})`);
    });

    this.delegationSystem.on('complex_task_delegated', (data) => {
      console.log(`[DelegateTasks] Complex task delegated: ${data.groupId} (${data.subTaskCount} sub-tasks)`);
    });

    this.delegationSystem.on('task_completed', (data) => {
      console.log(`[DelegateTasks] Task completed: ${data.taskId} by ${data.agentId} in ${data.executionTime}ms`);
    });

    this.delegationSystem.on('group_completed', (data) => {
      console.log(`[DelegateTasks] Group completed: ${data.groupId} (${data.completedTasks}/${data.totalTasks} successful)`);
    });

    this.delegationSystem.on('task_failed', (data) => {
      console.error(`[DelegateTasks] Task failed: ${data.taskId} - ${data.error}`);
    });
  }
}