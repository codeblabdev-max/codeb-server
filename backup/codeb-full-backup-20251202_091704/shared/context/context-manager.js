/**
 * Context Manager for Multi-Agent System
 * Manages token allocation and context overflow between agents
 */

class ContextManager {
  constructor() {
    // Initialize context pools for each agent
    this.contexts = {
      master: { 
        limit: 30000, 
        used: 0, 
        priority: 1,
        description: 'Orchestration and coordination'
      },
      dbSchema: { 
        limit: 200000, 
        used: 0, 
        priority: 2,
        description: 'Database architecture and schema design'
      },
      frontendPC: { 
        limit: 200000, 
        used: 0, 
        priority: 2,
        description: 'Desktop web application development'
      },
      frontendMobile: { 
        limit: 200000, 
        used: 0, 
        priority: 2,
        description: 'Mobile-optimized interfaces'
      },
      adminPanel: { 
        limit: 200000, 
        used: 0, 
        priority: 2,
        description: 'Administrative interfaces and dashboards'
      }
    };

    // Context overflow queue
    this.overflowQueue = [];
    
    // Context sharing map
    this.sharedContexts = new Map();
    
    // Performance metrics
    this.metrics = {
      allocations: 0,
      overflows: 0,
      compressions: 0,
      failures: 0
    };
  }

  /**
   * Allocate tokens to an agent
   * @param {string} agent - Agent identifier
   * @param {number} tokens - Number of tokens to allocate
   * @returns {boolean} Success status
   */
  allocate(agent, tokens) {
    if (!this.contexts[agent]) {
      console.error(`Unknown agent: ${agent}`);
      this.metrics.failures++;
      return false;
    }

    const context = this.contexts[agent];
    const available = context.limit - context.used;

    if (tokens <= available) {
      context.used += tokens;
      this.metrics.allocations++;
      console.log(`✅ Allocated ${tokens} tokens to ${agent} (${context.used}/${context.limit})`);
      return true;
    }

    // Try compression first
    if (this.compress(agent, tokens)) {
      return true;
    }

    // Handle overflow
    return this.handleOverflow(agent, tokens);
  }

  /**
   * Compress context to free up space
   * @param {string} agent - Agent identifier
   * @param {number} needed - Tokens needed
   * @returns {boolean} Success status
   */
  compress(agent, needed) {
    const context = this.contexts[agent];
    const compressionRatio = 0.3; // Can compress up to 30%
    const compressible = Math.floor(context.used * compressionRatio);

    if (compressible >= needed) {
      context.used -= compressible;
      this.metrics.compressions++;
      console.log(`🗜️ Compressed ${compressible} tokens in ${agent}`);
      return this.allocate(agent, needed);
    }

    return false;
  }

  /**
   * Handle context overflow by redistributing to other agents
   * @param {string} fromAgent - Source agent
   * @param {number} tokens - Tokens to overflow
   * @returns {boolean} Success status
   */
  handleOverflow(fromAgent, tokens) {
    console.log(`⚠️ Context overflow in ${fromAgent}, need ${tokens} tokens`);

    // Find agents with available capacity
    const availableAgents = Object.entries(this.contexts)
      .filter(([name, ctx]) => name !== fromAgent && (ctx.limit - ctx.used) > tokens)
      .sort((a, b) => (b[1].limit - b[1].used) - (a[1].limit - a[1].used));

    if (availableAgents.length === 0) {
      console.error(`❌ No agents available for overflow from ${fromAgent}`);
      this.metrics.failures++;
      return false;
    }

    const [targetAgent, targetContext] = availableAgents[0];
    
    // Queue overflow task
    this.overflowQueue.push({
      from: fromAgent,
      to: targetAgent,
      tokens: tokens,
      timestamp: Date.now()
    });

    targetContext.used += tokens;
    this.metrics.overflows++;
    
    console.log(`🔄 Overflow: ${fromAgent} → ${targetAgent} (${tokens} tokens)`);
    return true;
  }

  /**
   * Release tokens from an agent
   * @param {string} agent - Agent identifier
   * @param {number} tokens - Tokens to release
   */
  release(agent, tokens) {
    if (!this.contexts[agent]) {
      console.error(`Unknown agent: ${agent}`);
      return;
    }

    const context = this.contexts[agent];
    context.used = Math.max(0, context.used - tokens);
    console.log(`♻️ Released ${tokens} tokens from ${agent} (${context.used}/${context.limit})`);
  }

  /**
   * Share context between agents
   * @param {string} fromAgent - Source agent
   * @param {string} toAgent - Target agent
   * @param {object} sharedData - Data to share
   */
  shareContext(fromAgent, toAgent, sharedData) {
    const key = `${fromAgent}->${toAgent}`;
    
    if (!this.sharedContexts.has(key)) {
      this.sharedContexts.set(key, []);
    }
    
    this.sharedContexts.get(key).push({
      data: sharedData,
      timestamp: Date.now(),
      tokens: this.estimateTokens(sharedData)
    });
    
    console.log(`📤 Shared context: ${fromAgent} → ${toAgent}`);
  }

  /**
   * Retrieve shared context
   * @param {string} fromAgent - Source agent
   * @param {string} toAgent - Target agent
   * @returns {array} Shared context history
   */
  getSharedContext(fromAgent, toAgent) {
    const key = `${fromAgent}->${toAgent}`;
    return this.sharedContexts.get(key) || [];
  }

  /**
   * Estimate token count for data
   * @param {any} data - Data to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(data) {
    // Rough estimation: 1 token ≈ 4 characters
    const str = JSON.stringify(data);
    return Math.ceil(str.length / 4);
  }

  /**
   * Get current status of all agents
   * @returns {object} Status report
   */
  getStatus() {
    const status = {
      agents: {},
      metrics: this.metrics,
      overflowQueue: this.overflowQueue.length,
      sharedContexts: this.sharedContexts.size
    };

    for (const [agent, context] of Object.entries(this.contexts)) {
      status.agents[agent] = {
        used: context.used,
        limit: context.limit,
        utilization: ((context.used / context.limit) * 100).toFixed(1) + '%',
        available: context.limit - context.used
      };
    }

    return status;
  }

  /**
   * Reset context for an agent
   * @param {string} agent - Agent to reset
   */
  reset(agent) {
    if (!this.contexts[agent]) {
      console.error(`Unknown agent: ${agent}`);
      return;
    }

    this.contexts[agent].used = 0;
    console.log(`🔄 Reset context for ${agent}`);
  }

  /**
   * Clear all contexts and metrics
   */
  clearAll() {
    for (const agent of Object.keys(this.contexts)) {
      this.reset(agent);
    }
    
    this.overflowQueue = [];
    this.sharedContexts.clear();
    this.metrics = {
      allocations: 0,
      overflows: 0,
      compressions: 0,
      failures: 0
    };
    
    console.log('🧹 Cleared all contexts and metrics');
  }
}

module.exports = ContextManager;