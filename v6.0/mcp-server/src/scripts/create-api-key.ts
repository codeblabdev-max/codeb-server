#!/usr/bin/env npx tsx
/**
 * Create initial API Key for CodeB v6.0
 *
 * Usage:
 *   npx tsx src/scripts/create-api-key.ts --team myteam --role owner
 *   npx tsx src/scripts/create-api-key.ts --team myteam --role member --name "Developer Key"
 */

import { randomBytes, createHash } from 'crypto';

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
};

const teamId = getArg('team') || 'default';
const role = getArg('role') || 'member';
const name = getArg('name') || `${role}-key`;

// Validate role
const validRoles = ['owner', 'admin', 'member', 'viewer'];
if (!validRoles.includes(role)) {
  console.error(`Error: Invalid role "${role}". Must be one of: ${validRoles.join(', ')}`);
  process.exit(1);
}

// Generate API Key
function generateApiKey(teamId: string, role: string): { key: string; keyId: string; keyHash: string } {
  const randomPart = randomBytes(16).toString('hex');
  const key = `codeb_${teamId}_${role}_${randomPart}`;
  const keyId = `key_${randomBytes(8).toString('hex')}`;
  const keyHash = createHash('sha256').update(key).digest('hex');

  return { key, keyId, keyHash };
}

// Generate
const { key, keyId, keyHash } = generateApiKey(teamId, role);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    CodeB API Key Created                        ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  Team ID:    ${teamId.padEnd(45)}║
║  Role:       ${role.padEnd(45)}║
║  Name:       ${name.padEnd(45)}║
║  Key ID:     ${keyId.padEnd(45)}║
║                                                                 ║
╠════════════════════════════════════════════════════════════════╣
║  API Key (save this - it won't be shown again):                ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  ${key}  ║
║                                                                 ║
╠════════════════════════════════════════════════════════════════╣
║  Key Hash (store in database):                                  ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  ${keyHash}  ║
║                                                                 ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  Usage:                                                         ║
║  ───────────────────────────────────────────────────────────── ║
║                                                                 ║
║  # Environment variable                                         ║
║  export CODEB_API_KEY="${key}"                                  ║
║                                                                 ║
║  # API request                                                  ║
║  curl -X POST https://api.codeb.kr/api/tool \\                  ║
║    -H "X-API-Key: ${key.slice(0, 30)}..." \\                    ║
║    -H "Content-Type: application/json" \\                       ║
║    -d '{"tool": "health_check"}'                                ║
║                                                                 ║
╚════════════════════════════════════════════════════════════════╝
`);

// Output JSON for database insertion
console.log('\n--- Database Insert SQL ---\n');
console.log(`INSERT INTO api_keys (key_id, team_id, key_hash, role, name, created_at, is_active)
VALUES (
  '${keyId}',
  '${teamId}',
  '${keyHash}',
  '${role}',
  '${name}',
  NOW(),
  true
);`);

console.log('\n--- JSON Format ---\n');
console.log(JSON.stringify({
  keyId,
  teamId,
  keyHash,
  role,
  name,
  createdAt: new Date().toISOString(),
  isActive: true,
}, null, 2));
