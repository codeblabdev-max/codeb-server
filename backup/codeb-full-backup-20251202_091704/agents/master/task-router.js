/**
 * Task Router for Master Agent
 * Routes tasks to appropriate sub-agents based on capabilities
 */

class TaskRouter {
  constructor(messageBus) {
    this.messageBus = messageBus;
    
    // Agent capability matrix
    this.capabilities = {
      dbSchema: {
        domains: ['database', 'schema', 'migration', 'data'],
        skills: ['postgresql', 'sql', 'normalization', 'indexing', 'optimization'],
        maxConcurrent: 3
      },
      frontendPC: {
        domains: ['frontend', 'ui', 'desktop', 'web'],
        skills: ['react', 'nextjs', 'typescript', 'css', 'responsive'],
        maxConcurrent: 2
      },
      frontendMobile: {
        domains: ['mobile', 'frontend', 'pwa'],
        skills: ['react-native', 'mobile-first', 'touch', 'offline'],
        maxConcurrent: 2
      },
      adminPanel: {
        domains: ['admin', 'dashboard', 'monitoring', 'analytics'],
        skills: ['charts', 'data-visualization', 'user-management', 'reporting'],
        maxConcurrent: 2
      }
    };
    
    // Current agent workload
    this.workload = {
      dbSchema: 0,
      frontendPC: 0,
      frontendMobile: 0,
      adminPanel: 0
    };
    
    // Routing history for learning
    this.routingHistory = [];
  }

  /**
   * Create a routing plan for tasks
   * @param {array} tasks - Tasks to route
   * @param {object} analysis - Task analysis
   * @returns {array} Routing plan
   */
  async createRoutingPlan(tasks, analysis) {
    const plan = [];
    
    for (const task of tasks) {
      const route = await this.routeTask(task, analysis);
      plan.push(route);
    }
    
    // Optimize plan for parallel execution
    const optimized = this.optimizePlan(plan);
    
    return optimized;
  }

  /**
   * Route a single task to appropriate agent
   * @param {object} task - Task to route
   * @param {object} analysis - Task analysis
   * @returns {object} Routing decision
   */
  async routeTask(task, analysis) {
    // Calculate affinity scores for each agent
    const scores = this.calculateAffinityScores(task);
    
    // Consider current workload
    const adjustedScores = this.adjustForWorkload(scores);
    
    // Select best agent
    const selectedAgent = this.selectBestAgent(adjustedScores);
    
    // Create routing entry
    const routing = {
      id: task.id,
      task: task,
      assignedAgent: selectedAgent,
      affinityScore: adjustedScores[selectedAgent],
      estimatedDuration: this.estimateDuration(task, selectedAgent),
      dependencies: task.dependencies || [],
      priority: task.priority || 'normal'
    };
    
    // Update workload
    this.workload[selectedAgent]++;
    
    // Record routing decision
    this.recordRouting(routing);
    
    console.log(`🎯 Routed task ${task.id} to ${selectedAgent} (score: ${routing.affinityScore})`);
    
    return routing;
  }

  /**
   * Calculate affinity scores for each agent
   * @param {object} task - Task to score
   * @returns {object} Affinity scores
   */
  calculateAffinityScores(task) {
    const scores = {};
    
    for (const [agent, capabilities] of Object.entries(this.capabilities)) {
      let score = 0;
      
      // Check domain match
      for (const domain of capabilities.domains) {
        if (task.domain === domain || task.description?.includes(domain)) {
          score += 30;
        }
      }
      
      // Check skill match
      for (const skill of capabilities.skills) {
        if (task.description?.toLowerCase().includes(skill)) {
          score += 20;
        }
      }
      
      // Check task type match
      if (task.type) {
        if (agent === 'dbSchema' && task.type === 'database') score += 25;
        if (agent === 'frontendPC' && task.type === 'ui' && task.platform !== 'mobile') score += 25;
        if (agent === 'frontendMobile' && task.type === 'ui' && task.platform === 'mobile') score += 25;
        if (agent === 'adminPanel' && task.type === 'admin') score += 25;
      }
      
      scores[agent] = score;
    }
    
    return scores;
  }

  /**
   * Adjust scores based on current workload
   * @param {object} scores - Base affinity scores
   * @returns {object} Adjusted scores
   */
  adjustForWorkload(scores) {
    const adjusted = { ...scores };
    
    for (const [agent, workload] of Object.entries(this.workload)) {
      const capacity = this.capabilities[agent].maxConcurrent;
      const utilization = workload / capacity;
      
      // Reduce score based on utilization
      if (utilization >= 1) {
        adjusted[agent] *= 0.1; // Agent at capacity
      } else if (utilization >= 0.75) {
        adjusted[agent] *= 0.5; // Agent busy
      } else if (utilization >= 0.5) {
        adjusted[agent] *= 0.8; // Agent moderately loaded
      }
    }
    
    return adjusted;
  }

  /**
   * Select best agent based on scores
   * @param {object} scores - Adjusted affinity scores
   * @returns {string} Selected agent
   */
  selectBestAgent(scores) {
    let bestAgent = null;
    let bestScore = -1;
    
    for (const [agent, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }
    
    // Fallback to least loaded agent if no clear winner
    if (bestScore < 10) {
      bestAgent = this.getLeastLoadedAgent();
    }
    
    return bestAgent;
  }

  /**
   * Get agent with lowest workload
   * @returns {string} Agent ID
   */
  getLeastLoadedAgent() {
    let minLoad = Infinity;
    let selectedAgent = 'dbSchema';
    
    for (const [agent, load] of Object.entries(this.workload)) {
      const relativeLoad = load / this.capabilities[agent].maxConcurrent;
      if (relativeLoad < minLoad) {
        minLoad = relativeLoad;
        selectedAgent = agent;
      }
    }
    
    return selectedAgent;
  }

  /**
   * Estimate task duration
   * @param {object} task - Task
   * @param {string} agent - Assigned agent
   * @returns {number} Estimated duration in ms
   */
  estimateDuration(task, agent) {
    // Base duration by task type
    const baseDuration = {
      design: 5000,
      implementation: 10000,
      validation: 3000,
      general: 7000
    };
    
    let duration = baseDuration[task.type] || 7000;
    
    // Adjust for complexity
    if (task.complexity === 'high') duration *= 2;
    if (task.complexity === 'low') duration *= 0.5;
    
    // Adjust for agent expertise
    const affinity = this.calculateAffinityScores(task)[agent];
    if (affinity > 50) duration *= 0.8; // Agent is expert
    if (affinity < 20) duration *= 1.5; // Agent is not ideal
    
    return Math.round(duration);
  }

  /**
   * Optimize routing plan for parallel execution
   * @param {array} plan - Initial routing plan
   * @returns {array} Optimized plan
   */
  optimizePlan(plan) {
    // Sort by priority and dependencies
    const optimized = [...plan].sort((a, b) => {
      // Higher priority first
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Tasks with no dependencies first
      const depDiff = a.dependencies.length - b.dependencies.length;
      if (depDiff !== 0) return depDiff;
      
      // Shorter tasks first
      return a.estimatedDuration - b.estimatedDuration;
    });
    
    return optimized;
  }

  /**
   * Record routing decision for learning
   * @param {object} routing - Routing decision
   */
  recordRouting(routing) {
    this.routingHistory.push({
      ...routing,
      timestamp: Date.now()
    });
    
    // Keep only last 100 routing decisions
    if (this.routingHistory.length > 100) {
      this.routingHistory.shift();
    }
  }

  /**
   * Release workload when task completes
   * @param {string} agent - Agent ID
   */
  releaseWorkload(agent) {
    if (this.workload[agent] > 0) {
      this.workload[agent]--;
      console.log(`📉 Released workload for ${agent}: ${this.workload[agent]}`);
    }
  }

  /**
   * Get routing statistics
   * @returns {object} Statistics
   */
  getStatistics() {
    const stats = {
      totalRouted: this.routingHistory.length,
      byAgent: {},
      avgAffinityScore: 0,
      workload: this.workload
    };
    
    // Count by agent
    for (const routing of this.routingHistory) {
      stats.byAgent[routing.assignedAgent] = 
        (stats.byAgent[routing.assignedAgent] || 0) + 1;
    }
    
    // Average affinity score
    if (this.routingHistory.length > 0) {
      const totalScore = this.routingHistory.reduce((sum, r) => sum + r.affinityScore, 0);
      stats.avgAffinityScore = totalScore / this.routingHistory.length;
    }
    
    return stats;
  }

  /**
   * Reset workload counters
   */
  resetWorkload() {
    for (const agent of Object.keys(this.workload)) {
      this.workload[agent] = 0;
    }
    console.log('🔄 Reset all agent workloads');
  }
}

module.exports = TaskRouter;