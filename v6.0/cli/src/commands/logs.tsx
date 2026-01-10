/**
 * CodeB CLI - Logs Command
 * Real-time log streaming with filtering
 */

import { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import chalk from 'chalk';
import { ConfigStore } from '../lib/config.js';
import { LogViewer } from '../components/LogViewer.js';

interface LogsCommandProps {
  project?: string;
  environment?: 'staging' | 'production' | 'preview';
  follow?: boolean;
  lines?: number;
  level?: 'debug' | 'info' | 'warn' | 'error';
  ci?: boolean;
}

type LogsState = 'init' | 'ready' | 'error';

export function LogsCommand({
  project: projectArg,
  environment = 'staging',
  follow = true,
  lines = 50,
  level,
  ci = false,
}: LogsCommandProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<LogsState>('init');
  const [projectName, setProjectName] = useState(projectArg || '');
  const [error, setError] = useState<string | null>(null);

  // Resolve project name
  useEffect(() => {
    if (!projectArg) {
      const linked = config.getLinkedProject();
      if (linked) {
        setProjectName(linked);
        setState('ready');
      } else {
        setError('No project specified. Run from a linked project directory or specify project name.');
        setState('error');
        if (ci) {
          setTimeout(() => process.exit(1), 100);
        }
      }
    } else {
      setProjectName(projectArg);
      setState('ready');
    }
  }, [projectArg, ci]);

  // Check auth
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

  // Loading project
  if (!projectName && state === 'init') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Resolving project...</Text>
      </Box>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red">{error}</Text>
        </Box>
        <Text color="gray">
          Run <Text color="cyan">we link</Text> to link this directory to a project.
        </Text>
      </Box>
    );
  }

  // Ready - render LogViewer
  return (
    <LogViewer
      project={projectName}
      environment={environment}
      follow={follow}
      lines={lines}
      level={level}
    />
  );
}
