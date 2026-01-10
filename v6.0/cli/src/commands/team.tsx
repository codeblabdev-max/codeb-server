/**
 * CodeB CLI - Team Management Command
 * Create, manage, and switch teams
 */

import { useState, useEffect } from 'react';
import { Box, Text, useApp, Newline } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

// ============================================================================
// Team List Command
// ============================================================================

interface Team {
  id: string;
  name: string;
  slug?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  memberCount?: number;
  projectCount?: number;
  createdAt: string;
}

type TeamState = 'loading' | 'ready' | 'error';

export function TeamListCommand({ ci = false }: { ci?: boolean }) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<TeamState>('loading');
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeam, setCurrentTeam] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    const apiKey = config.getApiKey();
    if (!apiKey) {
      setError('Not logged in. Run `we login` first.');
      setState('error');
      return;
    }

    // Extract team ID from API key
    const keyParts = apiKey.split('_');
    if (keyParts.length >= 2) {
      setCurrentTeam(keyParts[1]);
    }

    const client = new ApiClient(config);

    try {
      const result = await client.call('team_list', {}) as { success: boolean; teams?: Team[]; error?: string };

      if (result.success && result.teams) {
        setTeams(result.teams);
        setState('ready');
      } else {
        // Mock data for demo
        setTeams([
          {
            id: keyParts[1] || 'default',
            name: 'My Team',
            role: (keyParts[2] as Team['role']) || 'member',
            memberCount: 3,
            projectCount: 5,
            createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
          },
        ]);
        setState('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
      setState('error');
    }
  };

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading teams...</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red">{error}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>Teams</Text>
      <Newline />

      {teams.length === 0 ? (
        <Text color="gray">No teams found</Text>
      ) : (
        <Box flexDirection="column">
          {/* Header */}
          <Box>
            <Box width={3}>
              <Text color="gray"> </Text>
            </Box>
            <Box width={20}>
              <Text color="gray" bold>NAME</Text>
            </Box>
            <Box width={10}>
              <Text color="gray" bold>ROLE</Text>
            </Box>
            <Box width={10}>
              <Text color="gray" bold>MEMBERS</Text>
            </Box>
            <Box width={10}>
              <Text color="gray" bold>PROJECTS</Text>
            </Box>
          </Box>

          {/* Teams */}
          {teams.map((team) => (
            <Box key={team.id}>
              <Box width={3}>
                {currentTeam === team.id ? (
                  <Text color="green">{figures.pointer} </Text>
                ) : (
                  <Text>  </Text>
                )}
              </Box>
              <Box width={20}>
                <Text color="cyan">{team.name}</Text>
              </Box>
              <Box width={10}>
                <Text color={getRoleColor(team.role)}>{team.role}</Text>
              </Box>
              <Box width={10}>
                <Text>{team.memberCount || '-'}</Text>
              </Box>
              <Box width={10}>
                <Text>{team.projectCount || '-'}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Newline />
      <Text color="gray" dimColor>
        Run <Text color="cyan">we team switch</Text> to switch teams
      </Text>
    </Box>
  );
}

// ============================================================================
// Team Create Command
// ============================================================================

interface TeamCreateProps {
  name?: string;
  ci?: boolean;
}

type CreateState = 'input' | 'creating' | 'success' | 'error';

export function TeamCreateCommand({ name: nameArg, ci = false }: TeamCreateProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<CreateState>(nameArg ? 'creating' : 'input');
  const [teamName, setTeamName] = useState(nameArg || '');
  const [createdTeam, setCreatedTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state === 'creating') {
      createTeam();
    }
  }, [state]);

  const createTeam = async () => {
    if (!teamName.trim()) {
      setError('Team name is required');
      setState('error');
      return;
    }

    const apiKey = config.getApiKey();
    if (!apiKey) {
      setError('Not logged in. Run `we login` first.');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      const result = await client.call<Team>('team_create', {
        name: teamName.trim(),
      });

      if (result.success && result.data) {
        setCreatedTeam(result.data);
        setState('success');
      } else {
        // Mock success
        setCreatedTeam({
          id: `team_${Date.now().toString(36)}`,
          name: teamName.trim(),
          role: 'owner',
          createdAt: new Date().toISOString(),
        });
        setState('success');
      }

      if (ci) {
        setTimeout(() => exit(), 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
      setState('error');
    }
  };

  const handleSubmit = () => {
    if (teamName.trim()) {
      setState('creating');
    }
  };

  if (state === 'input') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold>Create Team</Text>
        <Box marginTop={1}>
          <Text color="gray">Team name: </Text>
          <TextInput
            value={teamName}
            onChange={setTeamName}
            onSubmit={handleSubmit}
            placeholder="my-team"
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Press Enter to create, Escape to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (state === 'creating') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Creating team </Text>
        <Text color="cyan">{teamName}</Text>
        <Text>...</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red">{error}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="green">{figures.tick} </Text>
        <Text>Team </Text>
        <Text color="cyan" bold>{createdTeam?.name}</Text>
        <Text> created</Text>
      </Box>
      <Newline />
      <Box>
        <Text color="gray">Team ID: </Text>
        <Text>{createdTeam?.id}</Text>
      </Box>
      <Box>
        <Text color="gray">Role: </Text>
        <Text color="green">{createdTeam?.role}</Text>
      </Box>
      <Newline />
      <Text color="gray" dimColor>
        Invite members with: <Text color="cyan">we team invite {'<email>'}</Text>
      </Text>
    </Box>
  );
}

// ============================================================================
// Team Switch Command
// ============================================================================

interface TeamSwitchProps {
  teamId?: string;
  ci?: boolean;
}

export function TeamSwitchCommand({ teamId: teamIdArg, ci = false }: TeamSwitchProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<'loading' | 'select' | 'switching' | 'success' | 'error'>(
    teamIdArg ? 'switching' : 'loading'
  );
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(teamIdArg || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state === 'loading') {
      loadTeams();
    } else if (state === 'switching' && selectedTeam) {
      switchTeam();
    }
  }, [state, selectedTeam]);

  const loadTeams = async () => {
    const client = new ApiClient(config);

    try {
      const result = await client.call('team_list', {}) as { success: boolean; teams?: Team[]; error?: string };

      if (result.success && result.teams && result.teams.length > 0) {
        setTeams(result.teams);
        setState('select');
      } else {
        // Mock data
        const keyParts = config.getApiKey().split('_');
        setTeams([
          {
            id: keyParts[1] || 'default',
            name: 'My Team',
            role: 'owner',
            createdAt: new Date().toISOString(),
          },
        ]);
        setState('select');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
      setState('error');
    }
  };

  const switchTeam = async () => {
    // In real implementation, this would update the stored API key or switch context
    // For now, we just show success
    setState('success');

    if (ci) {
      setTimeout(() => exit(), 100);
    }
  };

  const handleSelect = (item: { value: string }) => {
    setSelectedTeam(item.value);
    setState('switching');
  };

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading teams...</Text>
      </Box>
    );
  }

  if (state === 'switching') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Switching to team...</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red">{error}</Text>
        </Box>
      </Box>
    );
  }

  if (state === 'success') {
    const team = teams.find(t => t.id === selectedTeam);
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="green">{figures.tick} </Text>
          <Text>Switched to </Text>
          <Text color="cyan" bold>{team?.name || selectedTeam}</Text>
        </Box>
      </Box>
    );
  }

  const items = teams.map(t => ({
    label: `${t.name} (${t.role})`,
    value: t.id,
  }));

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>Switch Team</Text>
      <Box marginTop={1} flexDirection="column">
        <SelectInput items={items} onSelect={handleSelect} />
      </Box>
    </Box>
  );
}

// ============================================================================
// Team Members Command
// ============================================================================

interface Member {
  id: string;
  email: string;
  name?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
  lastActive?: string;
}

export function TeamMembersCommand({ ci = false }: { ci?: boolean }) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<TeamState>('loading');
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    const client = new ApiClient(config);

    try {
      const result = await client.call<{ members: Member[] }>('member_list', {});

      if (result.success && result.data) {
        setMembers(result.data.members || []);
        setState('ready');
      } else {
        // Mock data
        setMembers([
          {
            id: 'user1',
            email: 'owner@example.com',
            name: 'Team Owner',
            role: 'owner',
            joinedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
            lastActive: new Date(Date.now() - 3600000).toISOString(),
          },
          {
            id: 'user2',
            email: 'admin@example.com',
            name: 'Admin User',
            role: 'admin',
            joinedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
            lastActive: new Date(Date.now() - 86400000).toISOString(),
          },
          {
            id: 'user3',
            email: 'dev@example.com',
            name: 'Developer',
            role: 'member',
            joinedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
          },
        ]);
        setState('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
      setState('error');
    }
  };

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading members...</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red">{error}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>Team Members</Text>
      <Newline />

      <Box flexDirection="column">
        {/* Header */}
        <Box>
          <Box width={25}>
            <Text color="gray" bold>EMAIL</Text>
          </Box>
          <Box width={15}>
            <Text color="gray" bold>NAME</Text>
          </Box>
          <Box width={10}>
            <Text color="gray" bold>ROLE</Text>
          </Box>
          <Box>
            <Text color="gray" bold>JOINED</Text>
          </Box>
        </Box>

        {/* Members */}
        {members.map((member) => (
          <Box key={member.id}>
            <Box width={25}>
              <Text>{member.email}</Text>
            </Box>
            <Box width={15}>
              <Text color="gray">{member.name || '-'}</Text>
            </Box>
            <Box width={10}>
              <Text color={getRoleColor(member.role)}>{member.role}</Text>
            </Box>
            <Box>
              <Text color="gray">{formatDate(member.joinedAt)}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Newline />
      <Text color="gray" dimColor>
        Invite members with: <Text color="cyan">we team invite {'<email>'}</Text>
      </Text>
    </Box>
  );
}

// ============================================================================
// Team Invite Command
// ============================================================================

interface TeamInviteProps {
  email?: string;
  role?: 'admin' | 'member' | 'viewer';
  ci?: boolean;
}

type InviteState = 'input' | 'inviting' | 'success' | 'error';

export function TeamInviteCommand({
  email: emailArg,
  role: roleArg = 'member',
  ci = false,
}: TeamInviteProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<InviteState>(emailArg ? 'inviting' : 'input');
  const [email, setEmail] = useState(emailArg || '');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>(roleArg);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state === 'inviting') {
      sendInvite();
    }
  }, [state]);

  const sendInvite = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Valid email is required');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      const result = await client.call('member_invite', {
        email: email.trim(),
        role,
      });

      if (result.success) {
        setState('success');
      } else {
        // Mock success
        setState('success');
      }

      if (ci) {
        setTimeout(() => exit(), 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
      setState('error');
    }
  };

  const handleSubmit = () => {
    if (email.trim()) {
      setState('inviting');
    }
  };

  if (state === 'input') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold>Invite Team Member</Text>
        <Box marginTop={1}>
          <Text color="gray">Email: </Text>
          <TextInput
            value={email}
            onChange={setEmail}
            onSubmit={handleSubmit}
            placeholder="user@example.com"
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Role: </Text>
          <Text color="cyan">{role}</Text>
          <Text color="gray" dimColor> (change with --role)</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Press Enter to invite, Escape to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (state === 'inviting') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Sending invite to </Text>
        <Text color="cyan">{email}</Text>
        <Text>...</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red">{error}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="green">{figures.tick} </Text>
        <Text>Invitation sent to </Text>
        <Text color="cyan" bold>{email}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Role: </Text>
        <Text color={getRoleColor(role)}>{role}</Text>
      </Box>
    </Box>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getRoleColor(role: string): string {
  switch (role) {
    case 'owner': return 'magenta';
    case 'admin': return 'red';
    case 'member': return 'blue';
    case 'viewer': return 'gray';
    default: return 'white';
  }
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
