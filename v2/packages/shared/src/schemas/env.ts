/**
 * @codeb/shared - Environment Variable Zod Schemas
 */

import { z } from 'zod';

const environmentSchema = z.enum(['staging', 'production', 'preview']);

export const envSyncSchema = z.object({
  projectName: z.string().min(1).max(100),
  environment: environmentSchema.default('production'),
  variables: z.record(z.string(), z.string()),
  mode: z.enum(['merge', 'overwrite']).default('merge'),
});

export const envScanSchema = z.object({
  projectName: z.string().min(1).max(100).optional(),
  environment: environmentSchema.optional(),
});

export const envRestoreSchema = z.object({
  projectName: z.string().min(1).max(100),
  environment: environmentSchema.default('production'),
  version: z.enum(['master', 'current']).default('master'),
});

export type EnvSyncSchema = z.infer<typeof envSyncSchema>;
export type EnvScanSchema = z.infer<typeof envScanSchema>;
export type EnvRestoreSchema = z.infer<typeof envRestoreSchema>;
