/**
 * CodeB CLI - Link Command
 * Link current directory to a CodeB project
 */

import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

interface LinkCommandProps {
  project?: string;
  ci?: boolean;
}

interface Project {
  projectName: string;
  environment: string;
  activeSlot: string;
  lastUpdated: string;
}

type LinkState = 'init' | 'loading' | 'select' | 'create' | 'linking' | 'success' | 'error';

export function LinkCommand({ project: projectArg, ci = false }: LinkCommandProps) {
  const { exit } = useApp();
  const config = new ConfigStore();
  const cwd = process.cwd();

  const [state, setState] = useState<LinkState>('init');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(projectArg || null);
  const [newProjectName, setNewProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Check if already linked
  useEffect(() => {
    const linked = config.getLinkedProject(cwd);
    if (linked) {
      setSelectedProject(linked);
      setState('success');
      return;
    }

    // If project specified via args, link directly
    if (projectArg) {
      linkProject(projectArg);
    } else {
      loadProjects();
    }
  }, []);

  const loadProjects = async () => {
    setState('loading');
    const apiKey = config.getApiKey();

    if (!apiKey) {
      setError('Not logged in. Run `we login` first.');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      const result = await client.call<Project[]>('slot_list', {});

      if (result.success && result.data) {
        // Get unique projects
        const uniqueProjects = new Map<string, Project>();
        for (const project of result.data) {
          if (!uniqueProjects.has(project.projectName)) {
            uniqueProjects.set(project.projectName, project);
          }
        }
        setProjects(Array.from(uniqueProjects.values()));
        setState('select');
      } else {
        // No projects found, prompt to create
        setState('create');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
      setState('error');
    }
  };

  const linkProject = async (name: string) => {
    setState('linking');

    try {
      config.linkProject(cwd, name);
      setSelectedProject(name);
      setState('success');

      if (ci) {
        setTimeout(() => exit(), 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link project');
      setState('error');
    }
  };

  const handleSelect = (item: { value: string }) => {
    if (item.value === 'create-new') {
      setState('create');
    } else {
      linkProject(item.value);
    }
  };

  const handleCreateSubmit = () => {
    if (newProjectName.trim()) {
      linkProject(newProjectName.trim());
    }
  };

  // Handle keyboard input for escape
  useInput((input, key) => {
    if (key.escape) {
      exit();
    }
  });

  // Not authenticated
  if (!config.getApiKey() && state === 'init') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red">Not logged in</Text>
        </Box>
        <Text color="gray">
          Run <Text color="cyan">we login</Text> to authenticate first.
        </Text>
      </Box>
    );
  }

  // Loading
  if (state === 'loading' || state === 'init') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading projects...</Text>
      </Box>
    );
  }

  // Linking in progress
  if (state === 'linking') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Linking to project...</Text>
      </Box>
    );
  }

  // Success
  if (state === 'success') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="green">{figures.tick} </Text>
          <Text>Linked to </Text>
          <Text color="cyan" bold>{selectedProject}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Directory: {cwd}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">
            You can now run <Text color="cyan">we deploy</Text> without specifying a project.
          </Text>
        </Box>
      </Box>
    );
  }

  // Error
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

  // Create new project
  if (state === 'create') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold>Create or Link Project</Text>
        <Box marginTop={1}>
          <Text color="gray">Enter project name: </Text>
          <TextInput
            value={newProjectName}
            onChange={setNewProjectName}
            onSubmit={handleCreateSubmit}
            placeholder="my-project"
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Press Enter to confirm, Escape to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  // Select from existing projects
  const items = [
    ...projects.map(p => ({
      label: `${p.projectName} (${p.environment})`,
      value: p.projectName,
    })),
    { label: '+ Create new project', value: 'create-new' },
  ];

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>Link to Project</Text>
      <Text color="gray" dimColor>
        Directory: {cwd}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <SelectInput items={items} onSelect={handleSelect} />
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Use arrow keys to navigate, Enter to select
        </Text>
      </Box>
    </Box>
  );
}
