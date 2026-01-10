/**
 * CodeB v6.0 - Edge Runtime Server
 *
 * Isolated VM 기반의 Edge Function 실행 환경
 * Vercel Edge Functions와 유사한 기능 제공
 *
 * Port: 9200
 */

import express, { Request, Response, NextFunction } from 'express';
import ivm from 'isolated-vm';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { createLogger, format, transports } from 'winston';

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.EDGE_PORT || '9200', 10);
const FUNCTIONS_BASE = process.env.EDGE_FUNCTIONS_BASE || '/opt/codeb/edge-functions';
const MAX_MEMORY_MB = parseInt(process.env.EDGE_MAX_MEMORY || '128', 10);
const DEFAULT_TIMEOUT_MS = parseInt(process.env.EDGE_DEFAULT_TIMEOUT || '10000', 10);
const MAX_TIMEOUT_MS = 30000;

// ============================================================================
// Logger
// ============================================================================

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'edge-runtime' },
  transports: [
    new transports.Console(),
    new transports.File({
      filename: '/var/log/codeb/edge-runtime.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

// ============================================================================
// Metrics
// ============================================================================

const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

const invocationsTotal = new Counter({
  name: 'codeb_edge_invocations_total',
  help: 'Total number of edge function invocations',
  labelNames: ['project', 'function', 'status'],
  registers: [metricsRegistry],
});

const durationHistogram = new Histogram({
  name: 'codeb_edge_duration_seconds',
  help: 'Edge function execution duration',
  labelNames: ['project', 'function'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

const coldStartsTotal = new Counter({
  name: 'codeb_edge_cold_starts_total',
  help: 'Total number of cold starts',
  labelNames: ['project', 'function'],
  registers: [metricsRegistry],
});

const activeIsolates = new Gauge({
  name: 'codeb_edge_active_isolates',
  help: 'Number of active isolates',
  registers: [metricsRegistry],
});

// ============================================================================
// Types
// ============================================================================

interface EdgeFunction {
  name: string;
  code: string;
  type: 'middleware' | 'api' | 'rewrite' | 'redirect';
  routes: string[];
  timeout: number;
  memory: number;
  lastModified: number;
}

interface EdgeManifest {
  version: string;
  projectId: string;
  functions: Array<{
    name: string;
    type: 'middleware' | 'api' | 'rewrite' | 'redirect';
    routes: string[];
    runtime: string;
    timeout: number;
    memory: number;
  }>;
  routes: Array<{
    src: string;
    dest: string;
  }>;
  updatedAt: string;
}

interface IsolateCache {
  isolate: ivm.Isolate;
  context: ivm.Context;
  script: ivm.Script;
  createdAt: number;
  lastUsed: number;
  invocations: number;
}

interface EdgeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

interface EdgeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// ============================================================================
// Isolate Pool
// ============================================================================

class IsolatePool {
  private cache: Map<string, IsolateCache> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 5분마다 오래된 isolate 정리
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async getOrCreate(project: string, functionName: string, code: string, memoryLimit: number): Promise<IsolateCache> {
    const key = `${project}:${functionName}`;
    let cached = this.cache.get(key);

    // 캐시된 isolate가 있고 코드가 변경되지 않았으면 재사용
    if (cached) {
      cached.lastUsed = Date.now();
      cached.invocations++;
      return cached;
    }

    // 새 isolate 생성 (cold start)
    coldStartsTotal.inc({ project, function: functionName });
    logger.info(`Cold start: ${key}`);

    const isolate = new ivm.Isolate({ memoryLimit });
    const context = await isolate.createContext();

    // 글로벌 객체 설정
    const jail = context.global;
    await jail.set('global', jail.derefInto());

    // Console 구현
    await jail.set('_log', new ivm.Reference((level: string, ...args: unknown[]) => {
      const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      this.logFunction(project, functionName, level, message);
    }));

    await context.eval(`
      const console = {
        log: (...args) => _log.apply(undefined, ['info', ...args]),
        info: (...args) => _log.apply(undefined, ['info', ...args]),
        warn: (...args) => _log.apply(undefined, ['warn', ...args]),
        error: (...args) => _log.apply(undefined, ['error', ...args]),
        debug: (...args) => _log.apply(undefined, ['debug', ...args]),
      };
    `);

    // Response 클래스 구현
    await context.eval(`
      class Response {
        constructor(body, init = {}) {
          this.body = typeof body === 'object' ? JSON.stringify(body) : String(body || '');
          this.status = init.status || 200;
          this.headers = init.headers || {};
        }

        static json(data, init = {}) {
          return new Response(JSON.stringify(data), {
            ...init,
            headers: { 'content-type': 'application/json', ...(init.headers || {}) }
          });
        }

        static redirect(url, status = 302) {
          return new Response(null, {
            status,
            headers: { location: url }
          });
        }
      }

      class Request {
        constructor(url, init = {}) {
          this.url = url;
          this.method = init.method || 'GET';
          this.headers = new Map(Object.entries(init.headers || {}));
          this.body = init.body;
        }

        async json() {
          return JSON.parse(this.body || '{}');
        }

        async text() {
          return this.body || '';
        }
      }
    `);

    // 사용자 코드 컴파일
    const wrappedCode = `
      ${code}

      // Export default function을 _handler로 매핑
      if (typeof handler !== 'undefined') {
        globalThis._handler = handler;
      } else if (typeof default_1 !== 'undefined') {
        globalThis._handler = default_1;
      }
    `;

    const script = await isolate.compileScript(wrappedCode);
    await script.run(context);

    cached = {
      isolate,
      context,
      script,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      invocations: 1,
    };

    this.cache.set(key, cached);
    activeIsolates.set(this.cache.size);

    return cached;
  }

  private logFunction(project: string, functionName: string, level: string, message: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      function: functionName,
      project,
      message,
    };

    // 파일에 로그 기록
    const logDir = `/var/log/codeb/edge`;
    const logFile = join(logDir, `${project}.log`);

    try {
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      const fs = require('fs');
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    } catch {}

    // 콘솔에도 출력
    logger.log(level as 'info' | 'warn' | 'error' | 'debug', `[${project}/${functionName}] ${message}`);
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10분

    for (const [key, cached] of this.cache) {
      if (now - cached.lastUsed > maxAge) {
        logger.info(`Disposing idle isolate: ${key}`);
        try {
          cached.isolate.dispose();
        } catch {}
        this.cache.delete(key);
      }
    }

    activeIsolates.set(this.cache.size);
  }

  dispose(): void {
    clearInterval(this.cleanupInterval);
    for (const [, cached] of this.cache) {
      try {
        cached.isolate.dispose();
      } catch {}
    }
    this.cache.clear();
  }
}

// ============================================================================
// Function Loader
// ============================================================================

class FunctionLoader {
  private manifests: Map<string, EdgeManifest> = new Map();
  private functions: Map<string, EdgeFunction> = new Map();

  loadProject(projectName: string): EdgeManifest | null {
    const manifestPath = join(FUNCTIONS_BASE, projectName, 'manifest.json');

    if (!existsSync(manifestPath)) {
      return null;
    }

    try {
      const content = readFileSync(manifestPath, 'utf-8');
      const manifest: EdgeManifest = JSON.parse(content);
      this.manifests.set(projectName, manifest);

      // 함수 코드 로드
      for (const fn of manifest.functions) {
        const codePath = join(FUNCTIONS_BASE, projectName, 'functions', `${fn.name}.ts`);
        if (existsSync(codePath)) {
          const code = readFileSync(codePath, 'utf-8');
          const stat = statSync(codePath);

          this.functions.set(`${projectName}:${fn.name}`, {
            name: fn.name,
            code,
            type: fn.type,
            routes: fn.routes,
            timeout: fn.timeout || DEFAULT_TIMEOUT_MS,
            memory: fn.memory || MAX_MEMORY_MB,
            lastModified: stat.mtimeMs,
          });
        }
      }

      logger.info(`Loaded project: ${projectName} with ${manifest.functions.length} functions`);
      return manifest;
    } catch (error) {
      logger.error(`Failed to load project ${projectName}:`, error);
      return null;
    }
  }

  reloadProject(projectName: string): boolean {
    // 기존 함수 제거
    for (const key of this.functions.keys()) {
      if (key.startsWith(`${projectName}:`)) {
        this.functions.delete(key);
      }
    }
    this.manifests.delete(projectName);

    return this.loadProject(projectName) !== null;
  }

  getFunction(projectName: string, functionName: string): EdgeFunction | null {
    return this.functions.get(`${projectName}:${functionName}`) || null;
  }

  getManifest(projectName: string): EdgeManifest | null {
    return this.manifests.get(projectName) || null;
  }

  matchRoute(projectName: string, path: string): string | null {
    const manifest = this.manifests.get(projectName);
    if (!manifest) return null;

    for (const route of manifest.routes) {
      if (this.matchPath(route.src, path)) {
        return route.dest;
      }
    }

    return null;
  }

  private matchPath(pattern: string, path: string): boolean {
    // 간단한 glob 매칭
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(path);
  }

  listProjects(): string[] {
    if (!existsSync(FUNCTIONS_BASE)) return [];

    return readdirSync(FUNCTIONS_BASE)
      .filter(name => {
        const dir = join(FUNCTIONS_BASE, name);
        return statSync(dir).isDirectory() && existsSync(join(dir, 'manifest.json'));
      });
  }
}

// ============================================================================
// Express App
// ============================================================================

const app = express();
const pool = new IsolatePool();
const loader = new FunctionLoader();

// Body parser
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ limit: '1mb' }));
app.use(express.raw({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'edge-runtime',
    version: '6.0.0',
    uptime: process.uptime(),
    isolates: pool['cache']?.size || 0,
  });
});

// Metrics
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

// Reload project
app.post('/reload', (req, res) => {
  const project = req.query.project as string;

  if (!project) {
    return res.status(400).json({ error: 'project parameter required' });
  }

  const success = loader.reloadProject(project);

  if (success) {
    logger.info(`Project reloaded: ${project}`);
    res.json({ success: true, project });
  } else {
    res.status(404).json({ error: `Project not found: ${project}` });
  }
});

// List projects
app.get('/projects', (_req, res) => {
  const projects = loader.listProjects();
  res.json({ projects });
});

// Get project manifest
app.get('/projects/:project', (req, res) => {
  const manifest = loader.getManifest(req.params.project) || loader.loadProject(req.params.project);

  if (!manifest) {
    return res.status(404).json({ error: 'Project not found' });
  }

  res.json(manifest);
});

// Invoke function directly (for testing)
app.all('/invoke/:project/:function', async (req, res) => {
  await invokeFunction(req, res, req.params.project, req.params.function);
});

// Route-based invocation: /:project/*
app.all('/:project/*', async (req, res) => {
  const projectName = req.params.project;
  const path = '/' + (req.params[0] || '');

  // 매니페스트 로드
  if (!loader.getManifest(projectName)) {
    loader.loadProject(projectName);
  }

  // 라우트 매칭
  const functionName = loader.matchRoute(projectName, path);

  if (!functionName) {
    return res.status(404).json({ error: `No function matched for path: ${path}` });
  }

  await invokeFunction(req, res, projectName, functionName);
});

// ============================================================================
// Function Invocation
// ============================================================================

async function invokeFunction(req: Request, res: Response, projectName: string, functionName: string): Promise<void> {
  const startTime = Date.now();

  try {
    // 함수 로드
    const fn = loader.getFunction(projectName, functionName);

    if (!fn) {
      invocationsTotal.inc({ project: projectName, function: functionName, status: 'not_found' });
      res.status(404).json({ error: `Function not found: ${functionName}` });
      return;
    }

    // Isolate 가져오기
    const cached = await pool.getOrCreate(projectName, functionName, fn.code, fn.memory);

    // Request 객체 생성
    const edgeRequest: EdgeRequest = {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers as Record<string, string>,
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
    };

    // 함수 실행 (타임아웃 적용)
    const timeout = Math.min(fn.timeout, MAX_TIMEOUT_MS);

    const result = await Promise.race([
      executeInIsolate(cached, edgeRequest),
      new Promise<EdgeResponse>((_, reject) =>
        setTimeout(() => reject(new Error('Function timeout')), timeout)
      ),
    ]);

    // 응답 전송
    res.status(result.status);
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
    res.send(result.body);

    // 메트릭 기록
    const duration = (Date.now() - startTime) / 1000;
    durationHistogram.observe({ project: projectName, function: functionName }, duration);
    invocationsTotal.inc({ project: projectName, function: functionName, status: 'success' });

    logger.info(`Invoked ${projectName}/${functionName} in ${duration.toFixed(3)}s`);

  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    durationHistogram.observe({ project: projectName, function: functionName }, duration);
    invocationsTotal.inc({ project: projectName, function: functionName, status: 'error' });

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error invoking ${projectName}/${functionName}: ${errorMessage}`);

    res.status(500).json({
      error: 'Function execution failed',
      message: errorMessage,
    });
  }
}

async function executeInIsolate(cached: IsolateCache, request: EdgeRequest): Promise<EdgeResponse> {
  const { context } = cached;

  // Request 객체 전달
  await context.global.set('_request', new ivm.ExternalCopy({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
  }).copyInto());

  // 핸들러 실행
  const result = await context.eval(`
    (async () => {
      const req = new Request(_request.url, {
        method: _request.method,
        headers: _request.headers,
        body: _request.body,
      });

      if (typeof _handler === 'function') {
        const response = await _handler(req);
        return {
          status: response.status || 200,
          headers: response.headers || {},
          body: response.body || '',
        };
      } else if (typeof handler === 'function') {
        const response = await handler(req);
        return {
          status: response.status || 200,
          headers: response.headers || {},
          body: response.body || '',
        };
      } else {
        throw new Error('No handler function found');
      }
    })()
  `, { promise: true });

  return result as EdgeResponse;
}

// ============================================================================
// Error Handler
// ============================================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ============================================================================
// Startup
// ============================================================================

// 시작 시 모든 프로젝트 로드
const projects = loader.listProjects();
for (const project of projects) {
  loader.loadProject(project);
}

app.listen(PORT, () => {
  logger.info(`Edge Runtime started on port ${PORT}`);
  logger.info(`Functions base: ${FUNCTIONS_BASE}`);
  logger.info(`Loaded projects: ${projects.length}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  pool.dispose();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  pool.dispose();
  process.exit(0);
});

export { app, pool, loader };
