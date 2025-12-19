import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Config file path
const CONFIG_PATH = join(process.cwd(), '..', 'config', 'team-members.json');

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
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
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
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

    const newMember: TeamMember = {
      id,
      name,
      email,
      role,
      permissions: { ...roleConfig.defaultPermissions },
      createdAt: new Date().toISOString(),
      active: true
    };

    config.members.push(newMember);
    saveConfig(config);

    return NextResponse.json({
      success: true,
      data: newMember
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
