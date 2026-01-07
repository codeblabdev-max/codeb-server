/**
 * CodeB CLI - Whoami Command
 * Display current user and team information
 */

import { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

interface WhoamiData {
  teamId: string;
  teamName?: string;
  role: string;
  keyId: string;
  projects: string[];
  permissions: string[];
  rateLimit: {
    remaining: number;
    limit: number;
    resetAt: string;
  };
}

type WhoamiState = 'loading' | 'success' | 'error' | 'not-logged-in';

export function WhoamiCommand() {
  const [state, setState] = useState<WhoamiState>('loading');
  const [data, setData] = useState<WhoamiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = new ConfigStore();

  useEffect(() => {
    const fetchWhoami = async () => {
      const apiKey = config.getApiKey();

      if (!apiKey) {
        setState('not-logged-in');
        return;
      }

      try {
        const client = new ApiClient(config);
        const result = await client.whoami();

        if (result.success && result.data) {
          setData(result.data as WhoamiData);
          setState('success');
        } else {
          setError(result.error || 'Failed to get user info');
          setState('error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        setState('error');
      }
    };

    fetchWhoami();
  }, []);

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Fetching account info...</Text>
      </Box>
    );
  }

  if (state === 'not-logged-in') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="yellow">{figures.warning} </Text>
          <Text>Not logged in</Text>
        </Box>
        <Newline />
        <Text color="gray">
          Run <Text color="cyan">we login</Text> to authenticate.
        </Text>
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
        <Newline />
        <Text color="gray">
          Try <Text color="cyan">we login</Text> to re-authenticate.
        </Text>
      </Box>
    );
  }

  // Success state
  const roleColor = getRoleColor(data?.role || 'viewer');

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">CodeB Account</Text>
      </Box>

      {/* Team Info */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="gray" dimColor>{'Team:      '}</Text>
          <Text bold>{data?.teamName || data?.teamId}</Text>
        </Box>
        <Box>
          <Text color="gray" dimColor>{'Team ID:   '}</Text>
          <Text>{data?.teamId}</Text>
        </Box>
        <Box>
          <Text color="gray" dimColor>{'Role:      '}</Text>
          <Text color={roleColor} bold>{data?.role}</Text>
        </Box>
        <Box>
          <Text color="gray" dimColor>{'Key ID:    '}</Text>
          <Text>{data?.keyId}</Text>
        </Box>
      </Box>

      {/* Projects */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray" dimColor>Projects:</Text>
        <Box marginLeft={2} flexDirection="column">
          {data?.projects.length === 0 ? (
            <Text color="gray">No projects yet</Text>
          ) : (
            data?.projects.slice(0, 5).map((project, i) => (
              <Text key={i}>
                <Text color="green">{figures.pointer}</Text> {project}
              </Text>
            ))
          )}
          {data?.projects && data.projects.length > 5 && (
            <Text color="gray">+{data.projects.length - 5} more</Text>
          )}
        </Box>
      </Box>

      {/* Rate Limit */}
      {data?.rateLimit && (
        <Box flexDirection="column">
          <Text color="gray" dimColor>Rate Limit:</Text>
          <Box marginLeft={2}>
            <Text>
              {data.rateLimit.remaining}/{data.rateLimit.limit} requests remaining
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'owner':
      return 'magenta';
    case 'admin':
      return 'red';
    case 'member':
      return 'blue';
    case 'viewer':
      return 'gray';
    default:
      return 'white';
  }
}
