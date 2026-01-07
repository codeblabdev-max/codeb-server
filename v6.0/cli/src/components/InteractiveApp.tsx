/**
 * CodeB CLI - Interactive App
 * Full-screen interactive mode with project selection and quick actions
 */

import { useState, useEffect } from 'react';
import { Box, Text, Newline, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

interface Project {
  name: string;
  environment: string;
  activeSlot: 'blue' | 'green';
  version?: string;
  status: 'healthy' | 'unhealthy' | 'deploying' | 'unknown';
  url?: string;
}

type AppState = 'loading' | 'projects' | 'actions' | 'error' | 'not-logged-in';

interface QuickAction {
  key: string;
  label: string;
  description: string;
  action: () => void;
}

export function InteractiveApp() {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<AppState>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{
    teamName: string;
    role: string;
  } | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const apiKey = config.getApiKey();

    if (!apiKey) {
      setState('not-logged-in');
      return;
    }

    const client = new ApiClient(config);

    try {
      // Fetch user info and projects in parallel
      const [whoamiResult, slotsResult] = await Promise.all([
        client.whoami(),
        client.call('slot_list', {}),
      ]);

      if (whoamiResult.success && whoamiResult.data) {
        setUserInfo({
          teamName: whoamiResult.data.teamName || whoamiResult.data.teamId,
          role: whoamiResult.data.role,
        });
      }

      if (slotsResult.success && slotsResult.data) {
        const slots = slotsResult.data as Array<{
          projectName: string;
          environment: string;
          activeSlot: 'blue' | 'green';
          blueState: string;
          greenState: string;
          lastUpdated: string;
        }>;

        const projectList: Project[] = slots.map(slot => ({
          name: slot.projectName,
          environment: slot.environment,
          activeSlot: slot.activeSlot,
          status: 'healthy', // Would need additional health check
          url: `https://${slot.projectName}${slot.environment !== 'production' ? `-${slot.environment}` : ''}.codeb.dev`,
        }));

        setProjects(projectList);
      }

      setState('projects');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setState('error');
    }
  };

  // Handle keyboard input
  useInput((input, key) => {
    if (state === 'projects') {
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(projects.length - 1, prev + 1));
      } else if (key.return) {
        setSelectedProject(projects[selectedIndex]);
        setState('actions');
      } else if (input === 'q') {
        exit();
      } else if (input === 'r') {
        setState('loading');
        fetchData();
      }
    } else if (state === 'actions') {
      if (key.escape || input === 'b') {
        setSelectedProject(null);
        setState('projects');
      } else if (input === 'q') {
        exit();
      }
      // Action keys would be handled here
    }
  });

  // Loading state
  if (state === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header />
        <Box marginTop={1}>
          <Text color="blue">
            <Spinner type="dots" />
          </Text>
          <Text> Loading projects...</Text>
        </Box>
      </Box>
    );
  }

  // Not logged in
  if (state === 'not-logged-in') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header />
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="yellow">{figures.warning} </Text>
            <Text>Not logged in</Text>
          </Box>
          <Newline />
          <Text color="gray">
            Run <Text color="cyan">we login</Text> to authenticate.
          </Text>
        </Box>
      </Box>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Header />
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color="red">{figures.cross} </Text>
            <Text color="red">{error}</Text>
          </Box>
          <Newline />
          <Text color="gray">
            Press <Text color="cyan">r</Text> to retry or <Text color="cyan">q</Text> to quit.
          </Text>
        </Box>
      </Box>
    );
  }

  // Actions view
  if (state === 'actions' && selectedProject) {
    return (
      <Box flexDirection="column" padding={1}>
        <Header userInfo={userInfo} />

        <Box marginTop={1} marginBottom={1}>
          <Text bold color="cyan">{selectedProject.name}</Text>
          <Text color="gray"> ({selectedProject.environment})</Text>
        </Box>

        <Box flexDirection="column" marginLeft={2}>
          <ActionItem keyChar="d" label="Deploy" description="Deploy new version" />
          <ActionItem keyChar="p" label="Promote" description="Switch to deployed version" />
          <ActionItem keyChar="r" label="Rollback" description="Revert to previous version" />
          <ActionItem keyChar="l" label="Logs" description="View application logs" />
          <ActionItem keyChar="s" label="Status" description="Show detailed status" />
          <ActionItem keyChar="e" label="Env" description="Manage environment variables" />
        </Box>

        <Box marginTop={2}>
          <Text color="gray">
            Press <Text color="cyan">b</Text> to go back, <Text color="cyan">q</Text> to quit
          </Text>
        </Box>
      </Box>
    );
  }

  // Projects list view
  return (
    <Box flexDirection="column" padding={1}>
      <Header userInfo={userInfo} />

      <Box marginTop={1} marginBottom={1}>
        <Text bold>Projects</Text>
        <Text color="gray"> ({projects.length})</Text>
      </Box>

      {projects.length === 0 ? (
        <Box flexDirection="column" marginLeft={2}>
          <Text color="gray">No projects yet.</Text>
          <Newline />
          <Text color="gray">
            Run <Text color="cyan">we deploy &lt;project&gt;</Text> to deploy your first project.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {projects.map((project, index) => (
            <ProjectRow
              key={`${project.name}-${project.environment}`}
              project={project}
              isSelected={index === selectedIndex}
            />
          ))}
        </Box>
      )}

      <Box marginTop={2}>
        <Text color="gray">
          <Text color="cyan">{figures.arrowUp}{figures.arrowDown}</Text> navigate
          <Text color="cyan"> Enter</Text> select
          <Text color="cyan"> r</Text> refresh
          <Text color="cyan"> q</Text> quit
        </Text>
      </Box>
    </Box>
  );
}

// Header component
function Header({ userInfo }: { userInfo?: { teamName: string; role: string } | null }) {
  return (
    <Box>
      <Text bold color="cyan">CodeB</Text>
      {userInfo && (
        <>
          <Text color="gray"> | </Text>
          <Text>{userInfo.teamName}</Text>
          <Text color="gray"> ({userInfo.role})</Text>
        </>
      )}
    </Box>
  );
}

// Project row component
function ProjectRow({ project, isSelected }: { project: Project; isSelected: boolean }) {
  const statusIcon = getStatusIcon(project.status);
  const statusColor = getStatusColor(project.status);

  return (
    <Box>
      <Box width={3}>
        {isSelected ? (
          <Text color="cyan">{figures.pointer} </Text>
        ) : (
          <Text>  </Text>
        )}
      </Box>
      <Box width={20}>
        <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
          {project.name}
        </Text>
      </Box>
      <Box width={12}>
        <Text color="gray">{project.environment}</Text>
      </Box>
      <Box width={8}>
        <Text color="gray">{project.activeSlot}</Text>
      </Box>
      <Box width={3}>
        <Text color={statusColor}>{statusIcon}</Text>
      </Box>
      <Box>
        <Text color="gray" dimColor>{project.url}</Text>
      </Box>
    </Box>
  );
}

// Action item component
function ActionItem({
  keyChar,
  label,
  description,
}: {
  keyChar: string;
  label: string;
  description: string;
}) {
  return (
    <Box>
      <Box width={5}>
        <Text color="cyan">[{keyChar}]</Text>
      </Box>
      <Box width={12}>
        <Text bold>{label}</Text>
      </Box>
      <Text color="gray">{description}</Text>
    </Box>
  );
}

function getStatusIcon(status: Project['status']): string {
  switch (status) {
    case 'healthy':
      return figures.tick;
    case 'unhealthy':
      return figures.cross;
    case 'deploying':
      return figures.ellipsis;
    default:
      return figures.questionMarkPrefix;
  }
}

function getStatusColor(status: Project['status']): string {
  switch (status) {
    case 'healthy':
      return 'green';
    case 'unhealthy':
      return 'red';
    case 'deploying':
      return 'yellow';
    default:
      return 'gray';
  }
}
