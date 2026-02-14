/**
 * @codeb/shared - Project Zod Schemas
 */

import { z } from 'zod';

const projectTypeSchema = z.enum(['nextjs', 'remix', 'nodejs', 'python', 'go']);

export const projectInitSchema = z.object({
  projectName: z.string().min(1).max(100),
  type: projectTypeSchema.default('nextjs'),
  database: z.boolean().default(true),
  redis: z.boolean().default(true),
});

export const projectScanSchema = z.object({
  projectName: z.string().min(1).max(100),
});

export const workflowGenerateSchema = z.object({
  projectName: z.string().min(1).max(100),
  type: projectTypeSchema.default('nextjs'),
  database: z.boolean().default(true),
  redis: z.boolean().default(true),
});

export type ProjectInitSchema = z.infer<typeof projectInitSchema>;
export type ProjectScanSchema = z.infer<typeof projectScanSchema>;
export type WorkflowGenerateSchema = z.infer<typeof workflowGenerateSchema>;
