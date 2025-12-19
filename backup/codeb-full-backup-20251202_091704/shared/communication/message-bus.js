/**
 * Message Bus for Inter-Agent Communication
 * Handles asynchronous message passing between agents
 */

const EventEmitter = require('events');

class MessageBus extends EventEmitter {
  constructor() {
    super();
    
    // Message queue for each agent
    this.queues = {
      master: [],
      dbSchema: [],
      frontendPC: [],
      frontendMobile: [],
      adminPanel: []
    };
    
    // Message history for debugging
    this.history = [];
    
    // Message ID counter
    this.messageIdCounter = 0;
    
    // Pending responses
    this.pendingResponses = new Map();
    
    // Performance metrics
    this.metrics = {
      sent: 0,
      received: 0,
      failed: 0,
      avgResponseTime: 0
    };
  }

  /**
   * Send a message from one agent to another
   * @param {string} from - Sender agent
   * @param {string} to - Recipient agent
   * @param {string} type - Message type
   * @param {object} payload - Message payload
   * @returns {Promise} Response promise
   */
  async send(from, to, type, payload) {
    const messageId = this.generateMessageId();
    
    const message = {
      id: messageId,
      from,
      to,
      type,
      payload,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    // Validate agents
    if (!this.queues[from] || !this.queues[to]) {
      console.error(`Invalid agents: ${from} → ${to}`);
      this.metrics.failed++;
      throw new Error(`Invalid agent in message routing`);
    }
    
    // Add to recipient's queue
    this.queues[to].push(message);
    
    // Add to history
    this.history.push(message);
    
    // Emit event for the recipient
    this.emit(`message:${to}`, message);
    
    // Log the message
    console.log(`📨 Message ${messageId}: ${from} → ${to} [${type}]`);
    
    this.metrics.sent++;
    
    // Create response promise
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(messageId);
        reject(new Error(`Message ${messageId} timed out`));
      }, 30000); // 30 second timeout
      
      this.pendingResponses.set(messageId, {
        resolve,
        reject,
        timeout,
        startTime: Date.now()
      });
    });
  }

  /**
   * Broadcast a message to all agents
   * @param {string} from - Sender agent
   * @param {string} type - Message type
   * @param {object} payload - Message payload
   */
  broadcast(from, type, payload) {
    const agents = Object.keys(this.queues).filter(agent => agent !== from);
    
    const promises = agents.map(agent => 
      this.send(from, agent, type, payload).catch(err => {
        console.error(`Broadcast failed to ${agent}:`, err);
        return null;
      })
    );
    
    console.log(`📢 Broadcast from ${from}: ${type}`);
    return Promise.allSettled(promises);
  }

  /**
   * Process messages for an agent
   * @param {string} agent - Agent identifier
   * @param {function} handler - Message handler function
   */
  async process(agent, handler) {
    if (!this.queues[agent]) {
      throw new Error(`Unknown agent: ${agent}`);
    }
    
    // Get pending messages
    const messages = [...this.queues[agent]];
    this.queues[agent] = [];
    
    for (const message of messages) {
      try {
        console.log(`⚙️ ${agent} processing message ${message.id}`);
        
        // Process the message
        const response = await handler(message);
        
        // Send response
        if (response !== undefined) {
          await this.respond(message.id, agent, response);
        }
        
        message.status = 'processed';
        this.metrics.received++;
        
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
        message.status = 'failed';
        message.error = error.message;
        this.metrics.failed++;
        
        // Send error response
        await this.respond(message.id, agent, {
          error: error.message
        }, true);
      }
    }
    
    return messages.length;
  }

  /**
   * Send a response to a message
   * @param {string} messageId - Original message ID
   * @param {string} from - Responder agent
   * @param {object} payload - Response payload
   * @param {boolean} isError - Whether this is an error response
   */
  async respond(messageId, from, payload, isError = false) {
    const pending = this.pendingResponses.get(messageId);
    
    if (!pending) {
      console.warn(`No pending response for message ${messageId}`);
      return;
    }
    
    // Clear timeout
    clearTimeout(pending.timeout);
    
    // Calculate response time
    const responseTime = Date.now() - pending.startTime;
    this.updateAverageResponseTime(responseTime);
    
    // Create response message
    const response = {
      id: this.generateMessageId(),
      inResponseTo: messageId,
      from,
      payload,
      timestamp: Date.now(),
      responseTime,
      isError
    };
    
    // Add to history
    this.history.push(response);
    
    // Resolve or reject the promise
    if (isError) {
      pending.reject(payload);
    } else {
      pending.resolve(payload);
    }
    
    // Remove from pending
    this.pendingResponses.delete(messageId);
    
    console.log(`📬 Response ${response.id} for message ${messageId} (${responseTime}ms)`);
  }

  /**
   * Register a message handler for an agent
   * @param {string} agent - Agent identifier
   * @param {function} handler - Message handler function
   */
  on(agent, handler) {
    super.on(`message:${agent}`, async (message) => {
      try {
        const response = await handler(message);
        if (response !== undefined) {
          await this.respond(message.id, agent, response);
        }
      } catch (error) {
        await this.respond(message.id, agent, {
          error: error.message
        }, true);
      }
    });
  }

  /**
   * Generate unique message ID
   * @returns {string} Message ID
   */
  generateMessageId() {
    return `msg-${++this.messageIdCounter}-${Date.now()}`;
  }

  /**
   * Update average response time metric
   * @param {number} responseTime - Response time in ms
   */
  updateAverageResponseTime(responseTime) {
    const count = this.metrics.received || 1;
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (count - 1) + responseTime) / count;
  }

  /**
   * Get message queue size for an agent
   * @param {string} agent - Agent identifier
   * @returns {number} Queue size
   */
  getQueueSize(agent) {
    return this.queues[agent] ? this.queues[agent].length : 0;
  }

  /**
   * Get all pending messages for an agent
   * @param {string} agent - Agent identifier
   * @returns {array} Pending messages
   */
  getPendingMessages(agent) {
    return this.queues[agent] || [];
  }

  /**
   * Clear message queue for an agent
   * @param {string} agent - Agent identifier
   */
  clearQueue(agent) {
    if (this.queues[agent]) {
      this.queues[agent] = [];
      console.log(`🧹 Cleared queue for ${agent}`);
    }
  }

  /**
   * Get message history
   * @param {object} filter - Optional filter criteria
   * @returns {array} Filtered message history
   */
  getHistory(filter = {}) {
    let filtered = [...this.history];
    
    if (filter.from) {
      filtered = filtered.filter(m => m.from === filter.from);
    }
    
    if (filter.to) {
      filtered = filtered.filter(m => m.to === filter.to);
    }
    
    if (filter.type) {
      filtered = filtered.filter(m => m.type === filter.type);
    }
    
    if (filter.since) {
      filtered = filtered.filter(m => m.timestamp >= filter.since);
    }
    
    return filtered;
  }

  /**
   * Get communication metrics
   * @returns {object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      pendingResponses: this.pendingResponses.size,
      totalQueued: Object.values(this.queues).reduce((sum, q) => sum + q.length, 0),
      historySize: this.history.length
    };
  }

  /**
   * Clear all queues and history
   */
  clearAll() {
    for (const agent of Object.keys(this.queues)) {
      this.queues[agent] = [];
    }
    
    this.history = [];
    this.pendingResponses.clear();
    this.messageIdCounter = 0;
    
    console.log('🧹 Cleared all message queues and history');
  }
}

module.exports = MessageBus;