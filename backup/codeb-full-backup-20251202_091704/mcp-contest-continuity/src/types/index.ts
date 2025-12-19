/**
 * MCP Contest Continuity - Type Definitions
 * 
 * Core TypeScript types for the contest continuity MCP server
 */

import { z } from 'zod';

// =============================================================================
// Core MCP Types
// =============================================================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  execute(args: any): Promise<any>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

// =============================================================================
// Context Management Types
// =============================================================================

export interface CapturedContext {
  id: string;
  name: string;
  timestamp: number;
  projectStructure: ProjectStructure;
  codePatterns: CodePatterns;
  testInfo?: TestInfo;
  dependencies: Dependency[];
  metadata: ContextMetadata;
}

export interface ProjectStructure {
  framework?: string;
  architecture?: string;
  directories: string[];
  files?: FileInfo[];
  packageManagers: string[];
  buildTools: string[];
  configFiles: string[];
}

export interface FileInfo {
  path: string;
  type: 'component' | 'utility' | 'config' | 'test' | 'asset' | 'other';
  size: number;
  lastModified: number;
  imports?: string[];
  exports?: string[];
}

export interface CodePatterns {
  components?: ComponentInfo[];
  utilities?: UtilityInfo[];
  apis?: APIInfo[];
  patterns: Record<string, PatternInfo>;
}

export interface ComponentInfo {
  name: string;
  path: string;
  type: 'page' | 'layout' | 'ui' | 'hook' | 'service' | 'other';
  framework: string;
  props?: PropInfo[];
  dependencies: string[];
  hasTests: boolean;
  complexity?: number;
  lines: number;
}

export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface UtilityInfo {
  name: string;
  path: string;
  functions: FunctionInfo[];
  dependencies: string[];
  hasTests: boolean;
  exports: string[];
}

export interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType?: string;
  description?: string;
  complexity?: number;
  lines: number;
}

export interface ParameterInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface APIInfo {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  handler: string;
  parameters?: ParameterInfo[];
  responseType?: string;
  middleware: string[];
}

export interface PatternInfo {
  name: string;
  frequency: number;
  examples: string[];
  description?: string;
  category: 'architectural' | 'design' | 'coding' | 'testing' | 'other';
}

export interface TestInfo {
  testFiles: TestFileInfo[];
  coverage?: number;
  testTypes: TestType[];
  frameworkConfig?: Record<string, any>;
}

export interface TestFileInfo {
  path: string;
  type: TestType;
  components: string[];
  testCount: number;
  assertions: number;
}

export type TestType = 'unit' | 'integration' | 'e2e' | 'performance' | 'visual';

export interface Dependency {
  name: string;
  version: string;
  type: 'production' | 'development' | 'peer';
  description?: string;
  homepage?: string;
}

export interface ContextMetadata {
  capturedBy: string;
  captureReason?: string;
  tags: string[];
  environment: string;
  gitBranch?: string;
  gitCommit?: string;
}

// =============================================================================
// Test Generation Types
// =============================================================================

export interface TestDocument {
  id: string;
  contextId: string;
  content: string;
  testCount: number;
  testTypes: TestType[];
  components: string[];
  timestamp: number;
  format: 'markdown' | 'json' | 'yaml';
}

export interface TestGenerationOptions {
  testTypes: TestType[];
  includeSetup: boolean;
  generateMockData: boolean;
  targetComponent?: string;
  outputFormat?: 'markdown' | 'json' | 'yaml';
}

export interface GeneratedTest {
  name: string;
  type: TestType;
  description: string;
  setup?: string;
  teardown?: string;
  testCases: TestCase[];
  mockData?: MockData;
}

export interface TestCase {
  name: string;
  description: string;
  given: string;
  when: string;
  then: string;
  code: string;
  assertions: string[];
}

export interface MockData {
  name: string;
  type: string;
  data: any;
  description?: string;
}

// =============================================================================
// Version Management Types
// =============================================================================

export interface DocumentVersion {
  version: string;
  timestamp: number;
  path: string;
  size: number;
  changes?: VersionChange[];
  reason?: string;
  author?: string;
}

export interface VersionChange {
  type: 'added' | 'removed' | 'modified';
  line: number;
  content: string;
  description?: string;
}

export interface BackupResult {
  success: boolean;
  version?: string;
  timestamp?: number;
  backupPath?: string;
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  timestamp?: number;
  changes?: VersionChange[];
  error?: string;
}

export interface SplitResult {
  wasSplit: boolean;
  currentLines?: number;
  newFiles?: string[];
  backupVersion?: string;
  reason?: string;
}

// =============================================================================
// Development Tracking Types
// =============================================================================

export interface DevelopmentSnapshot {
  id: string;
  timestamp: number;
  projectPath: string;
  contextId?: string;
  changes: FileChange[];
  patterns: Record<string, PatternInfo>;
  metrics: DevelopmentMetrics;
}

export interface FileChange {
  path: string;
  type: 'created' | 'modified' | 'deleted' | 'renamed';
  timestamp: number;
  size?: number;
  content?: string;
  diff?: string;
}

export interface DevelopmentMetrics {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  complexity: number;
  testCoverage?: number;
  performance?: PerformanceMetrics;
}

export interface PerformanceMetrics {
  buildTime?: number;
  bundleSize?: number;
  memoryUsage?: number;
  loadTime?: number;
}

export interface TrackingStats {
  filesWatched: number;
  changesDetected: number;
  snapshotsTaken: number;
  lastActivity: number | null;
  patterns: Record<string, number>;
}

// =============================================================================
// MCP Coordination Types
// =============================================================================

export interface MCPServerConfig {
  name: string;
  url?: string;
  capabilities: string[];
  priority: number;
  timeout: number;
  retries: number;
}

export interface CoordinationRequest {
  server: string;
  operation: string;
  context: any;
  options?: Record<string, any>;
}

export interface CoordinationResponse {
  server: string;
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
}

export interface IntegrationResult {
  operation: string;
  results: Record<string, CoordinationResponse>;
  summary: string;
  recommendations: string[];
  executionTime: number;
}

// =============================================================================
// Automation Engine Types
// =============================================================================

export interface WorkflowConfig {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  options: WorkflowOptions;
}

export interface WorkflowTrigger {
  type: 'file_change' | 'context_capture' | 'test_generation' | 'schedule' | 'manual';
  pattern?: string;
  schedule?: string;
  conditions?: Record<string, any>;
}

export interface WorkflowStep {
  name: string;
  action: string;
  inputs: Record<string, any>;
  outputs?: string[];
  retries?: number;
  timeout?: number;
  condition?: string;
}

export interface WorkflowOptions {
  parallel: boolean;
  continueOnError: boolean;
  retries: number;
  timeout: number;
  notifications: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflowName: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  steps: WorkflowStepExecution[];
  error?: string;
  results?: any;
}

export interface WorkflowStepExecution {
  name: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  error?: string;
}

export interface ContestContinuityState {
  isActive: boolean;
  currentContext?: string;
  activeWorkflows: string[];
  lastSnapshot?: number;
  patterns: Record<string, PatternInfo>;
  metrics: ContestMetrics;
}

export interface ContestMetrics {
  contextsCaptured: number;
  testsGenerated: number;
  documentsCreated: number;
  workflowsExecuted: number;
  averageResponseTime: number;
  successRate: number;
}

// =============================================================================
// Event Types
// =============================================================================

export interface MCPEvent {
  type: string;
  timestamp: number;
  source: string;
  data: any;
}

export interface ContextEvent extends MCPEvent {
  type: 'context_captured' | 'context_resumed' | 'context_updated';
  data: {
    contextId: string;
    projectPath: string;
    changes?: string[];
  };
}

export interface TestEvent extends MCPEvent {
  type: 'test_generated' | 'test_updated' | 'test_executed';
  data: {
    testId: string;
    contextId: string;
    testTypes: TestType[];
    success: boolean;
  };
}

export interface FileEvent extends MCPEvent {
  type: 'file_created' | 'file_modified' | 'file_deleted';
  data: {
    path: string;
    size?: number;
    content?: string;
  };
}

export interface WorkflowEvent extends MCPEvent {
  type: 'workflow_started' | 'workflow_completed' | 'workflow_failed';
  data: {
    workflowId: string;
    workflowName: string;
    status: string;
    error?: string;
  };
}

// =============================================================================
// Utility Types
// =============================================================================

export type Awaitable<T> = T | Promise<T>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type NonEmptyArray<T> = [T, ...T[]];

export type Brand<T, B> = T & { __brand: B };

export type ContextId = Brand<string, 'ContextId'>;
export type WorkflowId = Brand<string, 'WorkflowId'>;
export type TestId = Brand<string, 'TestId'>;

// =============================================================================
// Configuration Types
// =============================================================================

export interface MCPServerConfiguration {
  server: {
    name: string;
    version: string;
    description: string;
    author: string;
  };
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
    logging: boolean;
  };
  storage: {
    contextDatabase: string;
    versionsDirectory: string;
    snapshotsDirectory: string;
    backupDirectory: string;
  };
  integration: {
    servers: MCPServerConfig[];
    defaultTimeout: number;
    retryAttempts: number;
  };
  automation: {
    enableAutomation: boolean;
    defaultWorkflows: WorkflowConfig[];
    contestContinuity: {
      autoCapture: boolean;
      autoRestore: boolean;
      snapshotInterval: number;
    };
  };
  development: {
    watchPatterns: string[];
    ignorePatterns: string[];
    debugMode: boolean;
    verbose: boolean;
  };
}