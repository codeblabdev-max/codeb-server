/**
 * CodeB Context Persistence System
 * Based on international developer best practices (2024-2025)
 * Implements SQLite + Redis + Vector DB hybrid approach
 */

import * as sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as Redis from 'redis';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Types
interface CodeBContext {
  sessionId: string;
  projectPath: string;
  timestamp: number;
  agents: AgentState[];
  patterns: PatternLibrary;
  dependencies: DependencyMap;
  metrics: ContextMetrics;
  checksum: string;
}

interface AgentState {
  id: string;
  type: 'orchestrator' | 'lead' | 'specialist' | 'worker';
  status: 'active' | 'idle' | 'blocked';
  confidence: number;
  lastTask?: any;
}

interface PatternLibrary {
  components: Map<string, Pattern>;
  apis: Map<string, Pattern>;
  databases: Map<string, Pattern>;
  totalReuse: number;
}

interface Pattern {
  id: string;
  name: string;
  code: string;
  usage: number;
  lastUsed: number;
  embedding?: number[];
}

interface DependencyMap {
  verified: Map<string, DependencyInfo>;
  duplicates: string[];
  unused: string[];
}

interface DependencyInfo {
  name: string;
  version: string;
  usage: 'high' | 'medium' | 'low';
}

interface ContextMetrics {
  codeReuse: number;
  duplicateDependencies: number;
  testCoverage: number;
  agentConfidence: number;
  contextSize: number;
}

/**
 * Main Context Persistence Manager
 * Implements 3-tier storage strategy from international best practices
 */
export class CodeBContextPersistence extends EventEmitter {
  private sqliteDb?: Database;
  private redisClient?: Redis.RedisClientType;
  private checkpointDir: string;
  private vectorStore: Map<string, number[]> = new Map();
  
  constructor(projectPath: string) {
    super();
    this.checkpointDir = path.join(projectPath, '.codeb-checkpoint');
  }

  /**
   * Initialize all persistence layers
   * Following MCP best practices
   */
  async initialize(): Promise<void> {
    // 1. Ensure checkpoint directory exists
    await fs.mkdir(this.checkpointDir, { recursive: true });
    
    // 2. Initialize SQLite (Primary storage)
    await this.initSQLite();
    
    // 3. Initialize Redis (Performance cache)
    await this.initRedis();
    
    // 4. Load vector embeddings (Semantic search)
    await this.loadVectorStore();
    
    this.emit('initialized', { 
      sqlite: true, 
      redis: !!this.redisClient,
      vectors: this.vectorStore.size 
    });
  }

  /**
   * SQLite initialization with schema
   * Based on mcp-sqlite-server patterns
   */
  private async initSQLite(): Promise<void> {
    const dbPath = path.join(this.checkpointDir, 'context.db');
    
    this.sqliteDb = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Create tables following international schema patterns
    await this.sqliteDb.exec(`
      -- Context sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        context_json TEXT NOT NULL,
        checksum TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Agent states table  
      CREATE TABLE IF NOT EXISTS agent_states (
        session_id TEXT,
        agent_id TEXT,
        agent_type TEXT,
        status TEXT,
        confidence REAL,
        last_task TEXT,
        timestamp INTEGER,
        PRIMARY KEY (session_id, agent_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      -- Pattern library table
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        code TEXT NOT NULL,
        usage_count INTEGER DEFAULT 0,
        last_used INTEGER,
        embedding BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Dependencies tracking
      CREATE TABLE IF NOT EXISTS dependencies (
        session_id TEXT,
        name TEXT,
        version TEXT,
        usage_level TEXT,
        is_duplicate BOOLEAN DEFAULT FALSE,
        is_unused BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (session_id, name),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      -- Metrics history
      CREATE TABLE IF NOT EXISTS metrics (
        session_id TEXT PRIMARY KEY,
        code_reuse REAL,
        duplicate_deps INTEGER,
        test_coverage REAL,
        agent_confidence REAL,
        context_size INTEGER,
        timestamp INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_patterns_usage ON patterns(usage_count DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_states_session ON agent_states(session_id);
    `);
  }

  /**
   * Redis initialization for high-performance caching
   * Based on Redis + LangGraph patterns
   */
  private async initRedis(): Promise<void> {
    try {
      this.redisClient = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 3) return false;
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.redisClient.on('error', (err) => {
        console.warn('Redis error (falling back to SQLite):', err.message);
        this.redisClient = undefined;
      });

      await this.redisClient.connect();
      
      // Set Redis namespace for CodeB
      await this.redisClient.select(1); // Use database 1 for CodeB
      
    } catch (error) {
      console.warn('Redis not available, using SQLite only');
      this.redisClient = undefined;
    }
  }

  /**
   * Load vector store for semantic search
   * Based on GitHub vector DB solutions
   */
  private async loadVectorStore(): Promise<void> {
    const vectorPath = path.join(this.checkpointDir, 'vectors.json');
    
    try {
      const data = await fs.readFile(vectorPath, 'utf-8');
      const vectors = JSON.parse(data);
      
      for (const [id, vector] of Object.entries(vectors)) {
        this.vectorStore.set(id, vector as number[]);
      }
    } catch (error) {
      // Initialize empty vector store
      await this.saveVectorStore();
    }
  }

  /**
   * Save current context with all 49 agents state
   * Implements transaction-based approach from best practices
   */
  async saveContext(context: CodeBContext): Promise<void> {
    const sessionId = context.sessionId || this.generateSessionId();
    const checksum = this.calculateChecksum(context);
    
    // Begin transaction
    await this.sqliteDb!.run('BEGIN TRANSACTION');
    
    try {
      // 1. Save session
      await this.sqliteDb!.run(`
        INSERT OR REPLACE INTO sessions (id, project_path, timestamp, context_json, checksum)
        VALUES (?, ?, ?, ?, ?)
      `, [sessionId, context.projectPath, context.timestamp, JSON.stringify(context), checksum]);

      // 2. Save agent states
      for (const agent of context.agents) {
        await this.sqliteDb!.run(`
          INSERT OR REPLACE INTO agent_states 
          (session_id, agent_id, agent_type, status, confidence, last_task, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [sessionId, agent.id, agent.type, agent.status, agent.confidence, 
            JSON.stringify(agent.lastTask), context.timestamp]);
      }

      // 3. Save patterns
      for (const [category, patterns] of Object.entries(context.patterns)) {
        for (const [name, pattern] of Object.entries(patterns as any)) {
          await this.savePattern(pattern as Pattern, category);
        }
      }

      // 4. Save dependencies
      for (const [name, info] of context.dependencies.verified.entries()) {
        await this.sqliteDb!.run(`
          INSERT OR REPLACE INTO dependencies 
          (session_id, name, version, usage_level, is_duplicate, is_unused)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [sessionId, name, info.version, info.usage, false, false]);
      }

      // 5. Save metrics
      await this.sqliteDb!.run(`
        INSERT OR REPLACE INTO metrics 
        (session_id, code_reuse, duplicate_deps, test_coverage, agent_confidence, context_size, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [sessionId, context.metrics.codeReuse, context.metrics.duplicateDependencies,
          context.metrics.testCoverage, context.metrics.agentConfidence, 
          context.metrics.contextSize, context.timestamp]);

      // Commit transaction
      await this.sqliteDb!.run('COMMIT');

      // Cache in Redis if available
      if (this.redisClient) {
        await this.cacheInRedis(sessionId, context);
      }

      // Save to filesystem backup
      await this.saveToFilesystem(sessionId, context);

      this.emit('context-saved', { sessionId, checksum });
      
    } catch (error) {
      await this.sqliteDb!.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Load context with fallback chain
   * Implements Redis → SQLite → Filesystem pattern
   */
  async loadContext(sessionId?: string): Promise<CodeBContext | null> {
    // If no sessionId, get latest
    if (!sessionId) {
      const latest = await this.sqliteDb!.get(`
        SELECT id FROM sessions 
        ORDER BY timestamp DESC 
        LIMIT 1
      `);
      
      if (!latest) return null;
      sessionId = latest.id;
    }

    // 1. Try Redis cache first (fastest)
    if (this.redisClient) {
      try {
        const cached = await this.redisClient.get(`codeb:session:${sessionId}`);
        if (cached) {
          this.emit('context-loaded', { source: 'redis', sessionId });
          return JSON.parse(cached);
        }
      } catch (error) {
        console.warn('Redis retrieval failed:', error);
      }
    }

    // 2. Try SQLite (reliable)
    const session = await this.sqliteDb!.get(`
      SELECT * FROM sessions WHERE id = ?
    `, [sessionId]);

    if (session) {
      const context = JSON.parse(session.context_json);
      
      // Warm up Redis cache
      if (this.redisClient) {
        await this.cacheInRedis(sessionId, context);
      }
      
      this.emit('context-loaded', { source: 'sqlite', sessionId });
      return context;
    }

    // 3. Try filesystem backup (last resort)
    try {
      const fsPath = path.join(this.checkpointDir, 'sessions', `${sessionId}.json`);
      const data = await fs.readFile(fsPath, 'utf-8');
      const context = JSON.parse(data);
      
      // Restore to SQLite
      await this.saveContext(context);
      
      this.emit('context-loaded', { source: 'filesystem', sessionId });
      return context;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save pattern with embedding for semantic search
   * Based on vector DB best practices
   */
  private async savePattern(pattern: Pattern, category: string): Promise<void> {
    await this.sqliteDb!.run(`
      INSERT OR REPLACE INTO patterns (id, name, category, code, usage_count, last_used, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [pattern.id, pattern.name, category, pattern.code, 
        pattern.usage, pattern.lastUsed, 
        pattern.embedding ? Buffer.from(pattern.embedding) : null]);

    // Update vector store
    if (pattern.embedding) {
      this.vectorStore.set(pattern.id, pattern.embedding);
    }
  }

  /**
   * Semantic search for similar patterns
   * Implements cosine similarity from GitHub examples
   */
  async findSimilarPatterns(query: string, limit = 5): Promise<Pattern[]> {
    // Generate embedding for query (simplified - use real embedding model)
    const queryEmbedding = this.generateSimpleEmbedding(query);
    
    // Calculate similarities
    const similarities: Array<{ id: string; score: number }> = [];
    
    for (const [id, embedding] of this.vectorStore.entries()) {
      const score = this.cosineSimilarity(queryEmbedding, embedding);
      similarities.push({ id, score });
    }

    // Sort and get top results
    similarities.sort((a, b) => b.score - a.score);
    const topIds = similarities.slice(0, limit).map(s => s.id);

    // Fetch patterns from database
    const patterns: Pattern[] = [];
    for (const id of topIds) {
      const pattern = await this.sqliteDb!.get(`
        SELECT * FROM patterns WHERE id = ?
      `, [id]);
      
      if (pattern) {
        patterns.push({
          id: pattern.id,
          name: pattern.name,
          code: pattern.code,
          usage: pattern.usage_count,
          lastUsed: pattern.last_used
        });
      }
    }

    return patterns;
  }

  /**
   * Cache in Redis with TTL
   * Based on Redis + LangGraph patterns
   */
  private async cacheInRedis(sessionId: string, context: CodeBContext): Promise<void> {
    if (!this.redisClient) return;

    const key = `codeb:session:${sessionId}`;
    const ttl = 3600; // 1 hour TTL
    
    await this.redisClient.setEx(key, ttl, JSON.stringify(context));
    
    // Also cache individual components for fast access
    await this.redisClient.setEx(`codeb:agents:${sessionId}`, ttl, JSON.stringify(context.agents));
    await this.redisClient.setEx(`codeb:patterns:${sessionId}`, ttl, JSON.stringify(context.patterns));
    await this.redisClient.setEx(`codeb:metrics:${sessionId}`, ttl, JSON.stringify(context.metrics));
  }

  /**
   * Filesystem backup (Git-trackable)
   * Based on community JSON approach
   */
  private async saveToFilesystem(sessionId: string, context: CodeBContext): Promise<void> {
    const sessionsDir = path.join(this.checkpointDir, 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });
    
    const filePath = path.join(sessionsDir, `${sessionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(context, null, 2));
    
    // Keep only last 10 sessions
    const files = await fs.readdir(sessionsDir);
    if (files.length > 10) {
      const sorted = files.sort();
      const toDelete = sorted.slice(0, files.length - 10);
      
      for (const file of toDelete) {
        await fs.unlink(path.join(sessionsDir, file)).catch(() => {});
      }
    }
  }

  /**
   * Save vector store to disk
   */
  private async saveVectorStore(): Promise<void> {
    const vectorPath = path.join(this.checkpointDir, 'vectors.json');
    const vectors: Record<string, number[]> = {};
    
    for (const [id, vector] of this.vectorStore.entries()) {
      vectors[id] = vector;
    }
    
    await fs.writeFile(vectorPath, JSON.stringify(vectors));
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Calculate checksum for integrity
   */
  private calculateChecksum(context: CodeBContext): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(context));
    return hash.digest('hex');
  }

  /**
   * Simple embedding generation (replace with real model)
   */
  private generateSimpleEmbedding(text: string): number[] {
    const embedding = new Array(128).fill(0);
    for (let i = 0; i < text.length && i < 128; i++) {
      embedding[i] = text.charCodeAt(i) / 255;
    }
    return embedding;
  }

  /**
   * Cosine similarity calculation
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get context statistics
   */
  async getStatistics(): Promise<any> {
    const stats = await this.sqliteDb!.get(`
      SELECT 
        COUNT(DISTINCT id) as total_sessions,
        AVG(code_reuse) as avg_code_reuse,
        AVG(duplicate_deps) as avg_duplicates,
        AVG(test_coverage) as avg_coverage,
        AVG(agent_confidence) as avg_confidence,
        MAX(timestamp) as last_session
      FROM sessions
      JOIN metrics ON sessions.id = metrics.session_id
    `);

    const patterns = await this.sqliteDb!.get(`
      SELECT 
        COUNT(*) as total_patterns,
        SUM(usage_count) as total_usage,
        AVG(usage_count) as avg_usage
      FROM patterns
    `);

    return { sessions: stats, patterns };
  }

  /**
   * Cleanup old sessions
   */
  async cleanup(daysToKeep = 30): Promise<void> {
    const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    await this.sqliteDb!.run(`
      DELETE FROM sessions WHERE timestamp < ?
    `, [cutoff]);
    
    await this.sqliteDb!.run(`
      DELETE FROM agent_states WHERE session_id NOT IN (SELECT id FROM sessions)
    `);
    
    await this.sqliteDb!.run(`
      DELETE FROM metrics WHERE session_id NOT IN (SELECT id FROM sessions)
    `);

    this.emit('cleanup-complete', { cutoff });
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.sqliteDb) {
      await this.sqliteDb.close();
    }
    
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    
    await this.saveVectorStore();
    
    this.emit('closed');
  }
}

/**
 * MCP Integration Helper
 * Connects to MCP servers for context operations
 */
export class MCPContextIntegration {
  private persistence: CodeBContextPersistence;
  
  constructor(persistence: CodeBContextPersistence) {
    this.persistence = persistence;
  }

  /**
   * Handle MCP capture_context tool
   */
  async captureContext(params: any): Promise<any> {
    const context = await this.buildCurrentContext(params.projectPath);
    await this.persistence.saveContext(context);
    
    return {
      sessionId: context.sessionId,
      checksum: context.checksum,
      metrics: context.metrics
    };
  }

  /**
   * Handle MCP resume_context tool  
   */
  async resumeContext(params: any): Promise<any> {
    const context = await this.persistence.loadContext(params.contextId);
    
    if (!context) {
      throw new Error(`Context ${params.contextId} not found`);
    }
    
    return {
      sessionId: context.sessionId,
      projectPath: context.projectPath,
      agents: context.agents,
      metrics: context.metrics
    };
  }

  /**
   * Build current context from project
   */
  private async buildCurrentContext(projectPath: string): Promise<CodeBContext> {
    // Implementation would scan project and build context
    // This is a simplified version
    return {
      sessionId: crypto.randomBytes(8).toString('hex'),
      projectPath,
      timestamp: Date.now(),
      agents: this.getDefaultAgents(),
      patterns: {
        components: new Map(),
        apis: new Map(),
        databases: new Map(),
        totalReuse: 0
      },
      dependencies: {
        verified: new Map(),
        duplicates: [],
        unused: []
      },
      metrics: {
        codeReuse: 0,
        duplicateDependencies: 0,
        testCoverage: 0,
        agentConfidence: 0,
        contextSize: 0
      },
      checksum: ''
    };
  }

  /**
   * Get default agent configuration
   */
  private getDefaultAgents(): AgentState[] {
    const agents: AgentState[] = [
      { id: 'orchestrator-001', type: 'orchestrator', status: 'active', confidence: 1.0 }
    ];
    
    // Add domain leads
    const leads = ['frontend', 'backend', 'infrastructure', 'quality'];
    for (const lead of leads) {
      agents.push({
        id: `${lead}-lead`,
        type: 'lead',
        status: 'idle',
        confidence: 0.9
      });
    }
    
    // Add specialists and workers (simplified)
    for (let i = 1; i <= 11; i++) {
      agents.push({
        id: `specialist-${i}`,
        type: 'specialist',
        status: 'idle',
        confidence: 0.85
      });
    }
    
    for (let i = 1; i <= 33; i++) {
      agents.push({
        id: `worker-${i}`,
        type: 'worker',
        status: 'idle',
        confidence: 0.8
      });
    }
    
    return agents;
  }
}