/**
 * @codeb/shared - Environment Variable Types
 * Based on mcp-server/src/lib/types.ts
 */

import type { Environment } from './deployment.js';

export interface EnvFile {
  projectName: string;
  environment: Environment;
  version: 'master' | 'current' | string;
  variables: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface EnvSyncInput {
  projectName: string;
  environment: Environment;
  variables: Record<string, string>;
  mode: 'merge' | 'overwrite';
}

export interface EnvScanResult {
  projectName: string;
  environment: Environment;
  localKeys: string[];
  serverKeys: string[];
  missingOnServer: string[];
  missingLocally: string[];
  matched: string[];
}
