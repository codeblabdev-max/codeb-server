/**
 * @codeb/shared - Deployment Zod Schemas
 */

import { z } from 'zod';

const environmentSchema = z.enum(['staging', 'production', 'preview']);

export const deployInputSchema = z.object({
  projectName: z.string().min(1).max(100),
  environment: environmentSchema.default('production'),
  version: z.string().optional(),
  image: z.string().optional(),
  useGhcr: z.boolean().optional(),
  skipHealthcheck: z.boolean().optional(),
  skipValidation: z.boolean().optional(),
});

export const promoteInputSchema = z.object({
  projectName: z.string().min(1).max(100),
  environment: environmentSchema.default('production'),
});

export const rollbackInputSchema = z.object({
  projectName: z.string().min(1).max(100),
  environment: environmentSchema.default('production'),
  reason: z.string().optional(),
});

export type DeployInputSchema = z.infer<typeof deployInputSchema>;
export type PromoteInputSchema = z.infer<typeof promoteInputSchema>;
export type RollbackInputSchema = z.infer<typeof rollbackInputSchema>;
