/**
 * @codeb/shared - Domain Types
 */

import type { Environment } from './deployment.js';

export interface DomainConfig {
  name: string;
  projectName: string;
  environment: Environment;
  type: 'subdomain' | 'custom';
  dns: {
    provider: string;
    zone: string;
    recordType: string;
    value: string;
  };
  ssl: {
    enabled: boolean;
    provider: string;
  };
}

export interface DomainRecord {
  id: number;
  domain: string;
  projectName: string | null;
  environment: string;
  type: 'subdomain' | 'custom';
  sslEnabled: boolean;
  sslIssuer: string;
  dnsConfigured: boolean;
  dnsVerifiedAt: string | null;
  caddyConfigured: boolean;
  status: 'pending' | 'active' | 'error' | 'deleted';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
