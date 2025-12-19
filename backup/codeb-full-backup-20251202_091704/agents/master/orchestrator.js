/**
 * Master Agent Orchestrator
 * Central coordinator for the Multi-Agent system
 * Token Budget: 30K (lightweight orchestrator)
 */

const ContextManager = require('../../shared/context/context-manager');
const MessageBus = require('../../shared/communication/message-bus');
const TaskRouter = require('./task-router');

class MasterOrchestrator {
  constructor() {
    this.agentId = 'master';
    this.contextManager = new ContextManager();
    this.messageBus = new MessageBus();
    this.taskRouter = new TaskRouter(this.messageBus);
    
    // Agent registry
    this.agents = {
      dbSchema: {
        status: 'idle',
        capabilities: ['database', 'schema', 'migration', 'optimization'],
        currentTask: null
      },
      frontendPC: {
        status: 'idle',
        capabilities: ['react', 'nextjs', 'desktop', 'responsive'],
        currentTask: null
      },
      frontendMobile: {
        status: 'idle',
        capabilities: ['mobile', 'pwa', 'touch', 'performance'],
        currentTask: null
      },
      adminPanel: {
        status: 'idle',
        capabilities: ['dashboard', 'analytics', 'monitoring', 'admin'],
        currentTask: null
      }
    };
    
    // Task queue
    this.taskQueue = [];
    
    // Execution history
    this.executionHistory = [];
    
    // Performance metrics
    this.metrics = {
      tasksReceived: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTime: 0,
      contextUtilization: 0
    };
    
    // Initialize message handlers
    this.initializeHandlers();
  }

  /**
   * Initialize message handlers for the master agent
   */
  initializeHandlers() {
    // Handle responses from sub-agents
    this.messageBus.on(this.agentId, async (message) => {
      console.log(`🎛️ Master received: ${message.type} from ${message.from}`);
      
      switch (message.type) {
        case 'task_complete':
          await this.handleTaskComplete(message);
          break;
        case 'task_failed':
          await this.handleTaskFailed(message);
          break;
        case 'context_request':
          await this.handleContextRequest(message);
          break;
        case 'status_update':
          await this.handleStatusUpdate(message);
          break;
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    });
  }

  /**
   * Main orchestration method - receives and processes user tasks
   * @param {object} userTask - Task from user
   * @returns {object} Execution result
   */
  async orchestrate(userTask) {
    console.log('🎯 Master Orchestrator: Starting task orchestration');
    
    this.metrics.tasksReceived++;
    const startTime = Date.now();
    
    try {
      // Step 1: Analyze the task
      const analysis = await this.analyzeTask(userTask);
      console.log('📊 Task Analysis:', analysis);
      
      // Step 2: Decompose into sub-tasks
      const subTasks = await this.decomposeTask(userTask, analysis);
      console.log(`📋 Decomposed into ${subTasks.length} sub-tasks`);
      
      // Step 3: Allocate context
      const contextAllocation = await this.allocateContext(subTasks);
      console.log('💾 Context allocated:', contextAllocation);
      
      // Step 4: Route tasks to agents
      const routingPlan = await this.taskRouter.createRoutingPlan(subTasks, analysis);
      console.log('🗺️ Routing plan created:', routingPlan);
      
      // Step 5: Execute tasks
      const results = await this.executeTasks(routingPlan);
      console.log('✅ Tasks executed:', results.length);
      
      // Step 6: Integrate results
      const integrated = await this.integrateResults(results);
      
      // Step 7: Validate output
      const validated = await this.validateOutput(integrated, userTask);
      
      // Update metrics
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, true);
      
      // Record in history
      this.executionHistory.push({
        task: userTask,
        analysis,
        subTasks: subTasks.length,
        executionTime,
        timestamp: Date.now(),
        success: true
      });
      
      return {
        success: true,
        result: validated,
        metrics: {
          executionTime,
          subTasks: subTasks.length,
          contextUsed: this.contextManager.getStatus()
        }
      };
      
    } catch (error) {
      console.error('❌ Orchestration failed:', error);
      
      this.metrics.tasksFailed++;
      
      // Record failure in history
      this.executionHistory.push({
        task: userTask,
        error: error.message,
        timestamp: Date.now(),
        success: false
      });
      
      return {
        success: false,
        error: error.message,
        metrics: this.metrics
      };
    }
  }

  /**
   * Analyze the task to understand requirements
   * @param {object} task - User task
   * @returns {object} Task analysis
   */
  async analyzeTask(task) {
    // Allocate tokens for analysis
    this.contextManager.allocate(this.agentId, 1000);
    
    const analysis = {
      complexity: this.assessComplexity(task),
      domains: this.identifyDomains(task),
      priority: task.priority || 'normal',
      estimatedTokens: this.estimateTokenUsage(task),
      requiredAgents: [],
      dependencies: []
    };
    
    // Determine required agents based on domains
    for (const domain of analysis.domains) {
      if (domain === 'database') analysis.requiredAgents.push('dbSchema');
      if (domain === 'frontend' && task.platform === 'desktop') analysis.requiredAgents.push('frontendPC');
      if (domain === 'frontend' && task.platform === 'mobile') analysis.requiredAgents.push('frontendMobile');
      if (domain === 'admin') analysis.requiredAgents.push('adminPanel');
    }
    
    // If no specific agents identified, determine based on task type
    if (analysis.requiredAgents.length === 0) {
      analysis.requiredAgents = this.inferRequiredAgents(task);
    }
    
    return analysis;
  }

  /**
   * Decompose task into sub-tasks
   * @param {object} task - Original task
   * @param {object} analysis - Task analysis
   * @returns {array} Sub-tasks
   */
  async decomposeTask(task, analysis) {
    const subTasks = [];
    
    // Complex task decomposition logic
    if (analysis.complexity === 'high') {
      // Break into phases: design, implementation, validation
      subTasks.push(
        {
          id: `${task.id}-design`,
          type: 'design',
          description: `Design ${task.description}`,
          domain: analysis.domains[0],
          priority: 'high',
          dependencies: []
        },
        {
          id: `${task.id}-implement`,
          type: 'implementation',
          description: `Implement ${task.description}`,
          domain: analysis.domains[0],
          priority: 'high',
          dependencies: [`${task.id}-design`]
        },
        {
          id: `${task.id}-validate`,
          type: 'validation',
          description: `Validate ${task.description}`,
          domain: 'testing',
          priority: 'normal',
          dependencies: [`${task.id}-implement`]
        }
      );
    } else {
      // Simple task - single sub-task
      subTasks.push({
        id: `${task.id}-main`,
        type: task.type || 'general',
        description: task.description,
        domain: analysis.domains[0] || 'general',
        priority: analysis.priority,
        dependencies: []
      });
    }
    
    return subTasks;
  }

  /**
   * Allocate context for sub-tasks
   * @param {array} subTasks - Sub-tasks
   * @returns {object} Context allocation
   */
  async allocateContext(subTasks) {
    const allocation = {};
    
    for (const task of subTasks) {
      const estimatedTokens = this.estimateTaskTokens(task);
      const targetAgent = this.selectAgentForTask(task);
      
      if (this.contextManager.allocate(targetAgent, estimatedTokens)) {
        allocation[task.id] = {
          agent: targetAgent,
          tokens: estimatedTokens,
          status: 'allocated'
        };
      } else {
        allocation[task.id] = {
          agent: targetAgent,
          tokens: estimatedTokens,
          status: 'overflow'
        };
      }
    }
    
    return allocation;
  }

  /**
   * Execute tasks through agents
   * @param {object} routingPlan - Task routing plan
   * @returns {array} Execution results
   */
  async executeTasks(routingPlan) {
    const results = [];
    const executions = [];
    
    // Group tasks by dependencies
    const taskGroups = this.groupTasksByDependencies(routingPlan);
    
    // Execute task groups in sequence
    for (const group of taskGroups) {
      const groupPromises = group.map(async (task) => {
        const agent = task.assignedAgent;
        
        // Update agent status
        this.agents[agent].status = 'busy';
        this.agents[agent].currentTask = task.id;
        
        // Send task to agent
        const response = await this.messageBus.send(
          this.agentId,
          agent,
          'execute_task',
          task
        );
        
        // Update agent status
        this.agents[agent].status = 'idle';
        this.agents[agent].currentTask = null;
        
        return {
          taskId: task.id,
          agent,
          result: response
        };
      });
      
      // Wait for group to complete
      const groupResults = await Promise.all(groupPromises);
      results.push(...groupResults);
    }
    
    return results;
  }

  /**
   * Integrate results from multiple agents
   * @param {array} results - Execution results
   * @returns {object} Integrated result
   */
  async integrateResults(results) {
    const integrated = {
      components: {},
      artifacts: [],
      summary: '',
      metadata: {}
    };
    
    for (const result of results) {
      // Store component results
      integrated.components[result.taskId] = result.result;
      
      // Extract artifacts
      if (result.result.artifacts) {
        integrated.artifacts.push(...result.result.artifacts);
      }
      
      // Merge metadata
      if (result.result.metadata) {
        Object.assign(integrated.metadata, result.result.metadata);
      }
    }
    
    // Generate summary
    integrated.summary = this.generateSummary(results);
    
    return integrated;
  }

  /**
   * Validate output against requirements
   * @param {object} output - Integrated output
   * @param {object} originalTask - Original task
   * @returns {object} Validated output
   */
  async validateOutput(output, originalTask) {
    const validation = {
      valid: true,
      issues: [],
      output
    };
    
    // Check completeness
    if (!output.components || Object.keys(output.components).length === 0) {
      validation.valid = false;
      validation.issues.push('No components generated');
    }
    
    // Check for errors in components
    for (const [id, component] of Object.entries(output.components)) {
      if (component.error) {
        validation.valid = false;
        validation.issues.push(`Component ${id} has error: ${component.error}`);
      }
    }
    
    // Validate against original requirements
    if (originalTask.requirements) {
      for (const req of originalTask.requirements) {
        if (!this.checkRequirement(output, req)) {
          validation.issues.push(`Requirement not met: ${req}`);
        }
      }
    }
    
    return validation;
  }

  // Helper methods

  assessComplexity(task) {
    // Simple complexity assessment
    const factors = {
      size: task.description?.length > 200 ? 2 : 1,
      domains: task.domains?.length > 1 ? 2 : 1,
      dependencies: task.dependencies?.length > 0 ? 2 : 1
    };
    
    const score = Object.values(factors).reduce((a, b) => a + b, 0);
    
    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  identifyDomains(task) {
    const domains = [];
    const desc = task.description?.toLowerCase() || '';
    
    if (desc.includes('database') || desc.includes('schema')) domains.push('database');
    if (desc.includes('frontend') || desc.includes('ui')) domains.push('frontend');
    if (desc.includes('admin') || desc.includes('dashboard')) domains.push('admin');
    if (desc.includes('api') || desc.includes('backend')) domains.push('backend');
    
    return domains.length > 0 ? domains : ['general'];
  }

  estimateTokenUsage(task) {
    // Rough estimation based on task complexity
    const base = 1000;
    const complexity = this.assessComplexity(task);
    
    const multipliers = {
      low: 1,
      medium: 3,
      high: 5
    };
    
    return base * multipliers[complexity];
  }

  estimateTaskTokens(task) {
    // More precise token estimation for sub-tasks
    const typeTokens = {
      design: 2000,
      implementation: 5000,
      validation: 1000,
      general: 3000
    };
    
    return typeTokens[task.type] || 3000;
  }

  selectAgentForTask(task) {
    // Select best agent for task based on domain
    const domainAgentMap = {
      database: 'dbSchema',
      frontend: task.platform === 'mobile' ? 'frontendMobile' : 'frontendPC',
      admin: 'adminPanel',
      testing: 'dbSchema', // Fallback to any available agent
      general: 'dbSchema'
    };
    
    return domainAgentMap[task.domain] || 'dbSchema';
  }

  inferRequiredAgents(task) {
    // Infer agents when not explicitly specified
    const desc = task.description?.toLowerCase() || '';
    const agents = [];
    
    if (desc.includes('full') || desc.includes('complete')) {
      // Full stack - need all agents
      return ['dbSchema', 'frontendPC', 'adminPanel'];
    }
    
    // Default to single agent based on first matching keyword
    for (const [agent, info] of Object.entries(this.agents)) {
      for (const capability of info.capabilities) {
        if (desc.includes(capability)) {
          return [agent];
        }
      }
    }
    
    return ['dbSchema']; // Default fallback
  }

  groupTasksByDependencies(routingPlan) {
    // Group tasks that can be executed in parallel
    const groups = [];
    const processed = new Set();
    
    for (const task of routingPlan) {
      if (processed.has(task.id)) continue;
      
      const group = [task];
      processed.add(task.id);
      
      // Find other tasks with same dependencies
      for (const other of routingPlan) {
        if (processed.has(other.id)) continue;
        
        const sameDeps = 
          task.dependencies.length === other.dependencies.length &&
          task.dependencies.every(dep => other.dependencies.includes(dep));
        
        if (sameDeps) {
          group.push(other);
          processed.add(other.id);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  generateSummary(results) {
    const summary = [];
    summary.push(`Executed ${results.length} tasks`);
    
    const byAgent = {};
    for (const result of results) {
      byAgent[result.agent] = (byAgent[result.agent] || 0) + 1;
    }
    
    for (const [agent, count] of Object.entries(byAgent)) {
      summary.push(`  - ${agent}: ${count} tasks`);
    }
    
    return summary.join('\\n');
  }

  checkRequirement(output, requirement) {
    // Simple requirement checking
    // In real implementation, this would be more sophisticated
    return true;
  }

  updateMetrics(executionTime, success) {
    if (success) {
      this.metrics.tasksCompleted++;
    } else {
      this.metrics.tasksFailed++;
    }
    
    // Update average execution time
    const count = this.metrics.tasksCompleted + this.metrics.tasksFailed;
    this.metrics.avgExecutionTime = 
      (this.metrics.avgExecutionTime * (count - 1) + executionTime) / count;
    
    // Update context utilization
    const status = this.contextManager.getStatus();
    let totalUsed = 0;
    let totalLimit = 0;
    
    for (const agent of Object.values(status.agents)) {
      totalUsed += agent.used;
      totalLimit += agent.limit;
    }
    
    this.metrics.contextUtilization = (totalUsed / totalLimit) * 100;
  }

  // Message handlers

  async handleTaskComplete(message) {
    console.log(`✅ Task complete from ${message.from}:`, message.payload);
    // Handle task completion logic
  }

  async handleTaskFailed(message) {
    console.error(`❌ Task failed from ${message.from}:`, message.payload);
    // Handle task failure logic
  }

  async handleContextRequest(message) {
    console.log(`💾 Context request from ${message.from}`);
    // Handle context request logic
  }

  async handleStatusUpdate(message) {
    console.log(`📊 Status update from ${message.from}:`, message.payload);
    // Update agent status
    if (this.agents[message.from]) {
      this.agents[message.from].status = message.payload.status;
    }
  }

  // Public methods

  getStatus() {
    return {
      agents: this.agents,
      taskQueue: this.taskQueue.length,
      metrics: this.metrics,
      context: this.contextManager.getStatus(),
      messages: this.messageBus.getMetrics()
    };
  }

  getHistory() {
    return this.executionHistory;
  }
}

module.exports = MasterOrchestrator;