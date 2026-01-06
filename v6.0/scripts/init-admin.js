#!/usr/bin/env node
/**
 * CodeB v6.0 - Admin Initialization Script
 * Creates admin team and generates API keys
 */

import { createHash, randomBytes } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

// Configuration
const REGISTRY_PATH = '/opt/codeb/registry';
const API_KEYS_PATH = `${REGISTRY_PATH}/api-keys.json`;
const TEAMS_PATH = `${REGISTRY_PATH}/teams.json`;

// Role hierarchy
const ROLES = ['viewer', 'member', 'admin', 'owner'];

// Helper functions
function generateApiKey(teamId, role) {
  const token = randomBytes(18).toString('base64url');
  return `codeb_${teamId}_${role}_${token}`;
}

function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

// Initialize admin
function initializeAdmin() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              CodeB v6.0 - Admin Initialization             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Ensure registry directory
  if (!existsSync(REGISTRY_PATH)) {
    mkdirSync(REGISTRY_PATH, { recursive: true });
    console.log(`✓ Created directory: ${REGISTRY_PATH}`);
  }

  // Create admin team
  const teamId = 'codeb-admin';
  const team = {
    id: teamId,
    name: 'CodeB Admin',
    slug: teamId,
    createdAt: new Date().toISOString(),
    owner: 'system',
    plan: 'enterprise',
    projects: ['*'], // Access to all projects
    settings: {
      defaultEnvironment: 'production',
      autoPromote: false,
      gracePeriodHours: 48,
    },
  };

  const teamsRegistry = {
    version: '6.0',
    updatedAt: new Date().toISOString(),
    teams: {
      [teamId]: team,
    },
  };

  // Generate API keys for different roles
  const keys = {};
  const generatedKeys = [];

  const keyConfigs = [
    { name: 'Admin Owner Key', role: 'owner', desc: 'Full access (Admin)' },
    { name: 'Admin Key', role: 'admin', desc: 'Admin operations' },
    { name: 'Developer Key', role: 'member', desc: 'Deploy/Promote/Rollback' },
    { name: 'Viewer Key', role: 'viewer', desc: 'Read-only access' },
  ];

  for (const config of keyConfigs) {
    const key = generateApiKey(teamId, config.role);
    const keyHash = hashApiKey(key);
    const keyId = `key_${randomBytes(8).toString('hex')}`;

    keys[keyId] = {
      id: keyId,
      keyHash,
      name: config.name,
      teamId,
      role: config.role,
      createdAt: new Date().toISOString(),
      createdBy: 'system-init',
      scopes: ['*'],
    };

    generatedKeys.push({
      ...config,
      keyId,
      key, // Plain key - only shown once!
    });
  }

  const apiKeysRegistry = {
    version: '6.0',
    updatedAt: new Date().toISOString(),
    keys,
  };

  // Save registries
  writeFileSync(TEAMS_PATH, JSON.stringify(teamsRegistry, null, 2));
  console.log(`✓ Created teams registry: ${TEAMS_PATH}`);

  writeFileSync(API_KEYS_PATH, JSON.stringify(apiKeysRegistry, null, 2));
  console.log(`✓ Created API keys registry: ${API_KEYS_PATH}`);

  // Output generated keys
  console.log('\n┌────────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                         🔑 Generated API Keys (SAVE THESE!)                            │');
  console.log('├────────────────────────────────────────────────────────────────────────────────────────┤');

  for (const k of generatedKeys) {
    console.log(`│ ${k.role.toUpperCase().padEnd(8)} │ ${k.desc.padEnd(25)} │`);
    console.log(`│          │ ${k.key} │`);
    console.log('├────────────────────────────────────────────────────────────────────────────────────────┤');
  }

  console.log('└────────────────────────────────────────────────────────────────────────────────────────┘');

  console.log('\n⚠️  IMPORTANT: These keys are shown only ONCE. Store them securely!');
  console.log('\n📋 Usage example:');
  console.log('   curl -X POST https://api.codeb.kr/api/tool \\');
  console.log('     -H "X-API-Key: <your-api-key>" \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"tool": "slot_list", "params": {}}\'');

  // Return keys for programmatic use
  return generatedKeys;
}

// Run
const keys = initializeAdmin();

// Export for module use
export { keys };
