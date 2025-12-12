/**
 * Validators
 *
 * Validation utilities for CLI inputs
 */

import { readFile } from 'fs/promises';
import { parse } from 'yaml';

/**
 * Validate environment name
 */
export async function validateEnvironment(env) {
  const validEnvs = ['staging', 'production', 'preview', 'development'];

  if (!validEnvs.includes(env)) {
    throw new Error(`Invalid environment: ${env}. Must be one of: ${validEnvs.join(', ')}`);
  }

  return true;
}

/**
 * Validate docker-compose file
 */
export async function validateDockerCompose(filePath) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };

  try {
    const content = await readFile(filePath, 'utf8');

    // Basic validation checks
    if (!content.includes('services:')) {
      result.valid = false;
      result.errors.push('Missing "services:" section');
    }

    if (!content.includes('version:')) {
      result.warnings.push('No version specified in docker-compose.yml');
    }

    // Check for common issues
    if (content.includes('privileged: true')) {
      result.warnings.push('Using privileged mode - security risk');
    }

    if (content.includes('network_mode: host')) {
      result.warnings.push('Using host network mode - may cause conflicts');
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`Failed to read compose file: ${error.message}`);
  }

  return result;
}

/**
 * Validate domain name
 */
export function validateDomain(domain) {
  const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;

  if (!domain) {
    return { valid: false, error: 'Domain name is required' };
  }

  if (!domainRegex.test(domain)) {
    return { valid: false, error: 'Invalid domain name format' };
  }

  if (domain.length > 253) {
    return { valid: false, error: 'Domain name too long (max 253 characters)' };
  }

  return { valid: true };
}
