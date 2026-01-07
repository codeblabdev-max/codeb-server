/**
 * CodeB CLI - Login Command
 * Authenticate with CodeB API
 */

import { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import figures from 'figures';
import { ApiClient, SimpleConfig } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

interface LoginCommandProps {
  token?: string;
}

type LoginState = 'input' | 'validating' | 'success' | 'error';

export function LoginCommand({ token: initialToken }: LoginCommandProps) {
  const [state, setState] = useState<LoginState>(initialToken ? 'validating' : 'input');
  const [token, setToken] = useState(initialToken || '');
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{
    teamId: string;
    teamName: string;
    role: string;
    projects: string[];
  } | null>(null);

  const config = new ConfigStore();

  useEffect(() => {
    if (initialToken) {
      validateToken(initialToken);
    }
  }, [initialToken]);

  const validateToken = async (apiKey: string) => {
    setState('validating');
    setError(null);

    try {
      const client = new ApiClient(new SimpleConfig(apiKey));
      const result = await client.whoami();

      if (result.success && result.data) {
        // Save token
        config.set('apiKey', apiKey);

        setUserInfo({
          teamId: result.data.teamId,
          teamName: result.data.teamName || result.data.teamId,
          role: result.data.role,
          projects: result.data.projects || [],
        });
        setState('success');
      } else {
        setError(result.error || 'Invalid API key');
        setState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setState('error');
    }
  };

  const handleSubmit = (value: string) => {
    if (value.trim()) {
      validateToken(value.trim());
    }
  };

  if (state === 'input') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">CodeB Login</Text>
        </Box>

        <Text color="gray">
          Enter your API key from the CodeB dashboard.
        </Text>
        <Text color="gray">
          Get one at: <Text color="cyan" underline>https://codeb.dev/settings/tokens</Text>
        </Text>

        <Newline />

        <Box>
          <Text>API Key: </Text>
          <TextInput
            value={token}
            onChange={setToken}
            onSubmit={handleSubmit}
            mask="*"
            placeholder="codeb_..."
          />
        </Box>

        <Newline />
        <Text color="gray" dimColor>
          Press Enter to continue
        </Text>
      </Box>
    );
  }

  if (state === 'validating') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Validating API key...</Text>
      </Box>
    );
  }

  if (state === 'error') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red">Login failed: {error}</Text>
        </Box>
        <Newline />
        <Text color="gray">
          Make sure your API key is valid and try again.
        </Text>
      </Box>
    );
  }

  // Success state
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="green">{figures.tick} </Text>
        <Text color="green" bold>Logged in successfully!</Text>
      </Box>

      <Newline />

      <Box flexDirection="column" marginLeft={2}>
        <Box>
          <Text color="gray">Team:     </Text>
          <Text bold>{userInfo?.teamName}</Text>
        </Box>
        <Box>
          <Text color="gray">Role:     </Text>
          <Text>{userInfo?.role}</Text>
        </Box>
        <Box>
          <Text color="gray">Projects: </Text>
          <Text>
            {userInfo?.projects.length === 0
              ? 'None yet'
              : userInfo?.projects.slice(0, 3).join(', ')}
            {userInfo?.projects && userInfo.projects.length > 3 &&
              ` +${userInfo.projects.length - 3} more`}
          </Text>
        </Box>
      </Box>

      <Newline />

      <Text color="gray">
        Run <Text color="cyan">we deploy</Text> to deploy your first project.
      </Text>
    </Box>
  );
}
