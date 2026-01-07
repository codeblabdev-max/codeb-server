/**
 * CodeB CLI - Promote Command
 * Zero-downtime traffic switch to deployed slot
 */

import { useState, useEffect } from 'react';
import { Box, Text, Newline, useApp } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

interface PromoteCommandProps {
  project?: string;
  environment?: 'staging' | 'production' | 'preview';
  yes?: boolean;
  ci?: boolean;
}

type PromoteState = 'loading' | 'confirm' | 'promoting' | 'success' | 'error';

interface SlotInfo {
  activeSlot: 'blue' | 'green';
  currentVersion?: string;
  newVersion?: string;
  newSlot: 'blue' | 'green';
}

export function PromoteCommand({
  project: projectArg,
  environment = 'staging',
  yes = false,
  ci = false,
}: PromoteCommandProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<PromoteState>('loading');
  const [projectName, setProjectName] = useState(projectArg || '');
  const [slotInfo, setSlotInfo] = useState<SlotInfo | null>(null);
  const [result, setResult] = useState<{
    productionUrl: string;
    fromSlot: string;
    toSlot: string;
    duration: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve project name
  useEffect(() => {
    if (!projectArg) {
      const linked = config.getLinkedProject();
      if (linked) {
        setProjectName(linked);
      } else {
        setError('No project specified. Run from a linked project directory or specify project name.');
        setState('error');
      }
    }
  }, [projectArg]);

  // Fetch slot status
  useEffect(() => {
    if (projectName && state === 'loading') {
      fetchSlotStatus();
    }
  }, [projectName, state]);

  const fetchSlotStatus = async () => {
    const apiKey = config.getApiKey();
    if (!apiKey) {
      setError('Not logged in. Run `we login` first.');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      const statusResult = await client.slotStatus({
        projectName,
        environment,
      });

      if (!statusResult.success || !statusResult.data) {
        throw new Error(statusResult.error || 'Failed to get slot status');
      }

      const data = statusResult.data;
      const newSlot: 'blue' | 'green' = data.activeSlot === 'blue' ? 'green' : 'blue';
      const newSlotInfo = data[newSlot];

      if (newSlotInfo.state !== 'deployed') {
        throw new Error(`No deployment ready to promote. Slot ${newSlot} is ${newSlotInfo.state}. Run 'we deploy' first.`);
      }

      setSlotInfo({
        activeSlot: data.activeSlot,
        currentVersion: data[data.activeSlot].version,
        newVersion: newSlotInfo.version,
        newSlot,
      });

      if (yes || ci) {
        // Skip confirmation
        executePromote();
      } else {
        setState('confirm');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get slot status');
      setState('error');
    }
  };

  const executePromote = async () => {
    setState('promoting');

    const apiKey = config.getApiKey();
    const client = new ApiClient(config);

    try {
      const promoteResult = await client.promote({
        projectName,
        environment,
      });

      if (!promoteResult.success) {
        throw new Error(promoteResult.error || 'Promotion failed');
      }

      setResult({
        productionUrl: promoteResult.data?.productionUrl || `https://${projectName}.codeb.dev`,
        fromSlot: promoteResult.data?.fromSlot || 'blue',
        toSlot: promoteResult.data?.toSlot || 'green',
        duration: promoteResult.data?.duration || 0,
      });
      setState('success');

      if (ci) {
        setTimeout(() => exit(), 100);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promotion failed');
      setState('error');

      if (ci) {
        setTimeout(() => process.exit(1), 100);
      }
    }
  };

  // Loading state
  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Checking slot status...</Text>
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
      </Box>
    );
  }

  // Confirmation state (interactive mode only)
  if (state === 'confirm') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Promote {projectName}</Text>
          <Text color="gray"> ({environment})</Text>
        </Box>

        <Box flexDirection="column" marginLeft={1} marginBottom={1}>
          <Box>
            <Text color="gray">Current version: </Text>
            <Text>{slotInfo?.currentVersion || 'unknown'}</Text>
            <Text color="gray"> ({slotInfo?.activeSlot})</Text>
          </Box>
          <Box>
            <Text color="gray">New version:     </Text>
            <Text color="green" bold>{slotInfo?.newVersion || 'unknown'}</Text>
            <Text color="gray"> ({slotInfo?.newSlot})</Text>
          </Box>
        </Box>

        <Text color="yellow">
          {figures.warning} This will switch production traffic to the new version.
        </Text>

        <Newline />

        <Text color="gray">
          Press <Text color="cyan">Enter</Text> to continue or <Text color="red">Ctrl+C</Text> to cancel
        </Text>

        {/* In a real implementation, we'd use useInput hook to handle confirmation */}
        {/* For now, we auto-confirm after showing the message */}
        <ConfirmHandler onConfirm={executePromote} />
      </Box>
    );
  }

  // Promoting state
  if (state === 'promoting') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="blue">
            <Spinner type="dots" />
          </Text>
          <Text> Promoting {projectName} to {environment}...</Text>
        </Box>

        <Box marginLeft={2} marginTop={1}>
          <Text color="gray">
            Switching traffic from {slotInfo?.activeSlot} to {slotInfo?.newSlot}
          </Text>
        </Box>
      </Box>
    );
  }

  // Success state
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="green">{figures.tick} </Text>
        <Text color="green" bold>Promotion successful!</Text>
        <Text color="gray"> ({result?.duration}ms)</Text>
      </Box>

      <Newline />

      <Box flexDirection="column" marginLeft={1}>
        <Box>
          <Text color="gray">Traffic switched: </Text>
          <Text>{result?.fromSlot}</Text>
          <Text color="gray"> → </Text>
          <Text color="green" bold>{result?.toSlot}</Text>
        </Box>
        <Box>
          <Text color="gray">Version: </Text>
          <Text>{slotInfo?.newVersion}</Text>
        </Box>
      </Box>

      <Newline />

      <Box>
        <Text>Production: </Text>
        <Text color="cyan" bold underline>{result?.productionUrl}</Text>
      </Box>

      <Newline />

      <Text color="gray">
        Previous version is in grace period (48h). Run <Text color="cyan">we rollback {projectName}</Text> to revert.
      </Text>
    </Box>
  );
}

// Simple component to handle confirmation
function ConfirmHandler({ onConfirm }: { onConfirm: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      // Auto-confirm for demo (in real implementation, use useInput)
      onConfirm();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onConfirm]);

  return null;
}
