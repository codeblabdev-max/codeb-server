import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes, createHash } from 'crypto';

// Config file path - use shared registry path with MCP API
// Priority: CODEB_REGISTRY_PATH > /opt/codeb/registry > /tmp/codeb-config (fallback)
const REGISTRY_PATH = process.env.CODEB_REGISTRY_PATH || '/opt/codeb/registry';
const CONFIG_PATH = join(REGISTRY_PATH, 'team-members.json');
const API_KEYS_PATH = join(REGISTRY_PATH, 'api-keys.json');

/**
 * Generate secure API Key (v6.0 format)
 * Format: codeb_{teamId}_{role}_{randomToken}
 * Matches MCP API server format for unified authentication
 */
function generateApiKey(teamId: string, role: string): string {
  const token = randomBytes(18).toString('base64url'); // 24 chars, URL-safe
  return `codeb_${teamId}_${role}_${token}`;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
  apiKey: string;  // API Key for GitHub Actions CODEB_API_KEY
  permissions: {
    ssh: boolean;
    deploy: boolean;
    envManage: boolean;
    teamManage: boolean;
    serverConfig: boolean;
  };
  sshKeyPath?: string;
  createdAt: string;
  active: boolean;
}

interface TeamConfig {
  version: string;
  updatedAt: string;
  members: TeamMember[];
  roles: Record<string, {
    description: string;
    defaultPermissions: TeamMember['permissions'];
  }>;
}

function loadConfig(): TeamConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      members: [],
      roles: {
        admin: {
          description: '전체 관리자 - SSH 직접 접속 가능',
          defaultPermissions: {
            ssh: true,
            deploy: true,
            envManage: true,
            teamManage: true,
            serverConfig: true
          }
        },
        developer: {
          description: '개발자 - MCP API만 사용 (SSH 금지)',
          defaultPermissions: {
            ssh: false,
            deploy: true,
            envManage: false,
            teamManage: false,
            serverConfig: false
          }
        },
        viewer: {
          description: '뷰어 - 읽기 전용',
          defaultPermissions: {
            ssh: false,
            deploy: false,
            envManage: false,
            teamManage: false,
            serverConfig: false
          }
        }
      }
    };
  }

  const content = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(content);
}

function saveConfig(config: TeamConfig): void {
  config.updatedAt = new Date().toISOString();

  // Ensure config directory exists
  const configDir = dirname(CONFIG_PATH);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Update API_KEYS registry (v6.0 format)
 * Syncs with MCP API server's api-keys.json format
 */
function updateApiKeysRegistry(config: TeamConfig, newMember?: TeamMember, newApiKey?: string): void {
  // Load existing registry or create new
  let registry: {
    version: string;
    updatedAt: string;
    keys: Record<string, {
      id: string;
      keyHash: string;
      name: string;
      teamId: string;
      role: string;
      createdAt: string;
      createdBy: string;
      scopes: string[];
      lastUsed?: string;
    }>;
  };

  try {
    if (existsSync(API_KEYS_PATH)) {
      registry = JSON.parse(readFileSync(API_KEYS_PATH, 'utf-8'));
    } else {
      registry = { version: '6.0.5', updatedAt: new Date().toISOString(), keys: {} };
    }
  } catch {
    registry = { version: '6.0.5', updatedAt: new Date().toISOString(), keys: {} };
  }

  // If new member with API key, add to registry
  if (newMember && newApiKey) {
    const keyHash = createHash('sha256').update(newApiKey).digest('hex');
    const keyId = `key_${randomBytes(8).toString('hex')}`;

    registry.keys[keyId] = {
      id: keyId,
      keyHash,
      name: newMember.name,
      teamId: 'default', // Default team
      role: newMember.role,
      createdAt: newMember.createdAt,
      createdBy: 'web-ui',
      scopes: ['*'],
    };
  }

  registry.updatedAt = new Date().toISOString();
  writeFileSync(API_KEYS_PATH, JSON.stringify(registry, null, 2));
}

// GET - 팀원 목록 조회
export async function GET(request: NextRequest) {
  try {
    const config = loadConfig();

    return NextResponse.json({
      success: true,
      data: {
        members: config.members,
        roles: config.roles,
        version: config.version,
        updatedAt: config.updatedAt
      }
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST - 팀원 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, role = 'developer' } = body;

    if (!name || !email) {
      return NextResponse.json(
        { success: false, error: 'name and email are required' },
        { status: 400 }
      );
    }

    const config = loadConfig();

    // Check if email already exists
    if (config.members.some(m => m.email === email)) {
      return NextResponse.json(
        { success: false, error: 'Email already exists' },
        { status: 400 }
      );
    }

    // Generate unique ID
    const id = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Get default permissions for role
    const roleConfig = config.roles[role];
    if (!roleConfig) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Generate API Key for the new member (v6.0 format with teamId)
    const teamId = 'default'; // Use default team, can be expanded later
    const apiKey = generateApiKey(teamId, role);

    const newMember: TeamMember = {
      id,
      name,
      email,
      role,
      apiKey,
      permissions: { ...roleConfig.defaultPermissions },
      createdAt: new Date().toISOString(),
      active: true
    };

    config.members.push(newMember);
    saveConfig(config);

    // Sync to MCP API registry
    updateApiKeysRegistry(config, newMember, apiKey);

    return NextResponse.json({
      success: true,
      data: newMember,
      // Show API Key only on creation (one-time display)
      apiKey: apiKey,
      message: 'API Key는 한 번만 표시됩니다. GitHub Secrets의 CODEB_API_KEY에 저장하세요.'
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// PUT - 팀원 수정
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    const config = loadConfig();
    const memberIndex = config.members.findIndex(m => m.id === id);

    if (memberIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    // Prevent modifying admin's SSH permission
    if (id === 'admin' && updates.permissions?.ssh === false) {
      return NextResponse.json(
        { success: false, error: 'Cannot disable SSH for admin' },
        { status: 400 }
      );
    }

    // Update member
    config.members[memberIndex] = {
      ...config.members[memberIndex],
      ...updates,
      id // Prevent ID change
    };

    saveConfig(config);

    return NextResponse.json({
      success: true,
      data: config.members[memberIndex]
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE - 팀원 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    // Prevent deleting admin
    if (id === 'admin') {
      return NextResponse.json(
        { success: false, error: 'Cannot delete admin' },
        { status: 400 }
      );
    }

    const config = loadConfig();
    const memberIndex = config.members.findIndex(m => m.id === id);

    if (memberIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    const deleted = config.members.splice(memberIndex, 1)[0];
    saveConfig(config);

    return NextResponse.json({
      success: true,
      data: deleted
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
