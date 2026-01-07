/**
 * CodeB CLI - Slot Status Component
 * Visual representation of Blue-Green slot status
 */

import { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

interface SlotData {
  state: string;
  port: number;
  version?: string;
  deployedAt?: string;
  deployedBy?: string;
  healthStatus?: string;
  graceExpiresAt?: string;
}

interface SlotStatusData {
  projectName: string;
  environment: string;
  activeSlot: 'blue' | 'green';
  blue: SlotData;
  green: SlotData;
  lastUpdated: string;
}

interface SlotStatusProps {
  project: string;
  environment: 'staging' | 'production' | 'preview';
}

type StatusState = 'loading' | 'success' | 'error';

export function SlotStatus({ project, environment }: SlotStatusProps) {
  const [state, setState] = useState<StatusState>('loading');
  const [data, setData] = useState<SlotStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = new ConfigStore();

  useEffect(() => {
    const fetchStatus = async () => {
      const apiKey = config.getApiKey();
      if (!apiKey) {
        setError('Not logged in');
        setState('error');
        return;
      }

      const client = new ApiClient(config);

      try {
        const result = await client.slotStatus({
          projectName: project,
          environment,
        });

        if (result.success && result.data) {
          setData(result.data as SlotStatusData);
          setState('success');
        } else {
          setError(result.error || 'Failed to get slot status');
          setState('error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
        setState('error');
      }
    };

    fetchStatus();
  }, [project, environment]);

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading slot status...</Text>
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

  if (!data) {
    return null;
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">{data.projectName}</Text>
        <Text color="gray"> / {data.environment}</Text>
      </Box>

      {/* Slots Diagram */}
      <Box flexDirection="row" marginBottom={1}>
        <SlotBox
          name="blue"
          data={data.blue}
          isActive={data.activeSlot === 'blue'}
        />
        <Box marginX={2} alignItems="center">
          <Text color="gray">
            {data.activeSlot === 'blue' ? '← active' : 'active →'}
          </Text>
        </Box>
        <SlotBox
          name="green"
          data={data.green}
          isActive={data.activeSlot === 'green'}
        />
      </Box>

      {/* Legend */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>Last updated: {formatDate(data.lastUpdated)}</Text>
      </Box>

      <Newline />

      {/* State Legend */}
      <Box flexDirection="column">
        <Text color="gray" dimColor>States:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>
            <Text color="green">{figures.tick}</Text> active - Serving traffic
          </Text>
          <Text>
            <Text color="blue">{figures.circle}</Text> deployed - Ready to promote
          </Text>
          <Text>
            <Text color="yellow">{figures.warning}</Text> grace - Available for rollback (48h)
          </Text>
          <Text>
            <Text color="gray">{figures.circleFilled}</Text> empty - No deployment
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

// Individual slot box component
function SlotBox({
  name,
  data,
  isActive,
}: {
  name: 'blue' | 'green';
  data: SlotData;
  isActive: boolean;
}) {
  const stateIcon = getStateIcon(data.state);
  const stateColor = getStateColor(data.state);
  const slotColor = name === 'blue' ? 'blue' : 'green';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isActive ? slotColor : 'gray'}
      paddingX={2}
      paddingY={1}
      width={30}
    >
      {/* Slot Name */}
      <Box justifyContent="center">
        <Text bold color={slotColor}>{name.toUpperCase()}</Text>
        {isActive && <Text color="green"> ●</Text>}
      </Box>

      {/* State */}
      <Box marginTop={1}>
        <Text color={stateColor}>{stateIcon} {data.state}</Text>
      </Box>

      {/* Version */}
      <Box>
        <Text color="gray">Version: </Text>
        <Text>{data.version || 'none'}</Text>
      </Box>

      {/* Port */}
      <Box>
        <Text color="gray">Port: </Text>
        <Text>{data.port}</Text>
      </Box>

      {/* Health */}
      {data.healthStatus && (
        <Box>
          <Text color="gray">Health: </Text>
          <Text color={data.healthStatus === 'healthy' ? 'green' : 'red'}>
            {data.healthStatus}
          </Text>
        </Box>
      )}

      {/* Grace Period */}
      {data.graceExpiresAt && (
        <Box>
          <Text color="gray">Expires: </Text>
          <Text color="yellow">{getTimeRemaining(data.graceExpiresAt)}</Text>
        </Box>
      )}

      {/* Deployed At */}
      {data.deployedAt && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>{formatDate(data.deployedAt)}</Text>
        </Box>
      )}
    </Box>
  );
}

function getStateIcon(state: string): string {
  switch (state) {
    case 'active':
      return figures.tick;
    case 'deployed':
      return figures.circle;
    case 'grace':
      return figures.warning;
    case 'empty':
      return figures.circleFilled;
    default:
      return figures.questionMarkPrefix;
  }
}

function getStateColor(state: string): string {
  switch (state) {
    case 'active':
      return 'green';
    case 'deployed':
      return 'blue';
    case 'grace':
      return 'yellow';
    case 'empty':
      return 'gray';
    default:
      return 'white';
  }
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getTimeRemaining(isoString: string): string {
  const expiresAt = new Date(isoString);
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  if (hours <= 0) return 'expired';
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}
