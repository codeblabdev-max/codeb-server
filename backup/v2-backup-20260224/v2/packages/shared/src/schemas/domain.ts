/**
 * @codeb/shared - Domain Zod Schemas
 */

import { z } from 'zod';

const environmentSchema = z.enum(['staging', 'production', 'preview']);

export const domainSetupSchema = z.object({
  projectName: z.string().min(1).max(100),
  domain: z.string().min(1).max(255),
  environment: environmentSchema.default('production'),
});

export const domainDeleteSchema = z.object({
  projectName: z.string().min(1).max(100),
  domain: z.string().min(1).max(255),
});

export type DomainSetupSchema = z.infer<typeof domainSetupSchema>;
export type DomainDeleteSchema = z.infer<typeof domainDeleteSchema>;
