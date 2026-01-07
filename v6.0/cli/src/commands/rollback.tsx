/**
 * CodeB CLI - Rollback Command
 * Instant rollback to previous version
 */

import { useState, useEffect } from 'react';
import { Box, Text, Newline, useApp } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

interface RollbackCommandProps {
  project?: string;
  environment?: 'staging' | 'production' | 'preview';
  reason?: string;
  yes?: boolean;
  ci?: boolean;
}

type RollbackState = 'loading' | 'confirm' | 'rolling-back' | 'success' | 'error';

interface SlotInfo {
  activeSlot: 'blue' | 'green';
  currentVersion?: string;
  graceVersion?: string;
  graceSlot: 'blue' | 'green';
  graceExpiresAt?: string;
}

export function RollbackCommand({
  project: projectArg,
  environment = 'staging',
  reason,
  yes = false,
  ci = false,
}: RollbackCommandProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<RollbackState>('loading');
  const [projectName, setProjectName] = useState(projectArg || '');
  const [slotInfo, setSlotInfo] = useState<SlotInfo | null>(null);
  const [result, setResult] = useState<{
    restoredVersion: string;
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
      const graceSlot: 'blue' | 'green' = data.activeSlot === 'blue' ? 'green' : 'blue';
      const graceSlotInfo = data[graceSlot];

      if (graceSlotInfo.state !== 'grace') {
        throw new Error(`No previous version available for rollback. Slot ${graceSlot} is ${graceSlotInfo.state}.`);
      }

      setSlotInfo({
        activeSlot: data.activeSlot,
        currentVersion: data[data.activeSlot].version,
        graceVersion: graceSlotInfo.version,
        graceSlot,
        graceExpiresAt: graceSlotInfo.graceExpiresAt,
      });

      if (yes || ci) {
        // Skip confirmation
        executeRollback();
      } else {
        setState('confirm');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get slot status');
      setState('error');
    }
  };

  const executeRollback = async () => {
    setState('rolling-back');

    const apiKey = config.getApiKey();
    const client = new ApiClient(config);

    try {
      const rollbackResult = await client.rollback({
        projectName,
        environment,
        reason,
      });

      if (!rollbackResult.success) {
        throw new Error(rollbackResult.error || 'Rollback failed');
      }

      setResult({
        restoredVersion: rollbackResult.data?.restoredVersion || slotInfo?.graceVersion || 'unknown',
        fromSlot: rollbackResult.data?.fromSlot || 'blue',
        toSlot: rollbackResult.data?.toSlot || 'green',
        duration: rollbackResult.data?.duration || 0,
      });
      setState('success');

      if (ci) {
        setTimeout(() => exit(), 100);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
      setState('error');

      if (ci) {
        setTimeout(() => process.exit(1), 100);
      }
    }
  };

  // Calculate time remaining in grace period
  const getGraceTimeRemaining = () => {
    if (!slotInfo?.graceExpiresAt) return null;
    const expiresAt = new Date(slotInfo.graceExpiresAt);
    const now = new Date();
    const hoursRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
    return hoursRemaining > 0 ? hoursRemaining : 0;
  };

  // Loading state
  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Checking rollback availability...</Text>
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
        <Newline />
        <Text color="gray">
          Rollback requires a previous version in grace period (48h after promote).
        </Text>
      </Box>
    );
  }

  // Confirmation state
  if (state === 'confirm') {
    const hoursRemaining = getGraceTimeRemaining();

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="yellow">Rollback {projectName}</Text>
          <Text color="gray"> ({environment})</Text>
        </Box>

        <Box flexDirection="column" marginLeft={1} marginBottom={1}>
          <Box>
            <Text color="gray">Current version:  </Text>
            <Text color="red">{slotInfo?.currentVersion || 'unknown'}</Text>
            <Text color="gray"> ({slotInfo?.activeSlot})</Text>
          </Box>
          <Box>
            <Text color="gray">Rollback to:      </Text>
            <Text color="green" bold>{slotInfo?.graceVersion || 'unknown'}</Text>
            <Text color="gray"> ({slotInfo?.graceSlot})</Text>
          </Box>
          {hoursRemaining !== null && (
            <Box>
              <Text color="gray">Grace expires in: </Text>
              <Text color={hoursRemaining < 6 ? 'yellow' : 'white'}>{hoursRemaining}h</Text>
            </Box>
          )}
        </Box>

        <Text color="yellow">
          {figures.warning} This will instantly revert production traffic.
        </Text>

        <Newline />

        <Text color="gray">
          Press <Text color="cyan">Enter</Text> to rollback or <Text color="red">Ctrl+C</Text> to cancel
        </Text>

        <ConfirmHandler onConfirm={executeRollback} />
      </Box>
    );
  }

  // Rolling back state
  if (state === 'rolling-back') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Rolling back {projectName}...</Text>
        </Box>

        <Box marginLeft={2} marginTop={1}>
          <Text color="gray">
            Reverting to {slotInfo?.graceVersion} ({slotInfo?.graceSlot} slot)
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
        <Text color="green" bold>Rollback complete!</Text>
        <Text color="gray"> ({result?.duration}ms)</Text>
      </Box>

      <Newline />

      <Box flexDirection="column" marginLeft={1}>
        <Box>
          <Text color="gray">Traffic reverted: </Text>
          <Text>{result?.fromSlot}</Text>
          <Text color="gray"> → </Text>
          <Text color="green" bold>{result?.toSlot}</Text>
        </Box>
        <Box>
          <Text color="gray">Restored version: </Text>
          <Text color="green">{result?.restoredVersion}</Text>
        </Box>
        {reason && (
          <Box>
            <Text color="gray">Reason: </Text>
            <Text>{reason}</Text>
          </Box>
        )}
      </Box>

      <Newline />

      <Text color="gray">
        The previous version is now in deployed state and can be promoted again if needed.
      </Text>
    </Box>
  );
}

// Simple component to handle confirmation
function ConfirmHandler({ onConfirm }: { onConfirm: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onConfirm();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onConfirm]);

  return null;
}
