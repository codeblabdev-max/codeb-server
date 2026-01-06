/**
 * CodeB CLI - Deploy Progress Component
 * Beautiful deployment progress with real-time updates
 */

import React from 'react';
import { Box, Text, Newline } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';

interface Step {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  duration?: number;
  output?: string;
  error?: string;
}

interface DeployProgressProps {
  projectName: string;
  environment: string;
  steps: Step[];
  isComplete: boolean;
  previewUrl?: string;
  error?: string;
  startTime?: number;
}

export function DeployProgress({
  projectName,
  environment,
  steps,
  isComplete,
  previewUrl,
  error,
  startTime,
}: DeployProgressProps) {
  const totalDuration = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Deploying {projectName}
        </Text>
        <Text color="gray"> to {environment}</Text>
        {startTime && !isComplete && (
          <Text color="gray"> ({totalDuration}s)</Text>
        )}
      </Box>

      {/* Steps */}
      <Box flexDirection="column" marginLeft={1}>
        {steps.map((step, index) => (
          <StepRow key={index} step={step} />
        ))}
      </Box>

      {/* Success Result */}
      {isComplete && !error && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color="green" bold>
              {figures.tick} Deployment successful
            </Text>
            <Text color="gray"> in {totalDuration}s</Text>
          </Box>
          <Newline />
          <Box>
            <Text>Preview: </Text>
            <Text color="cyan" bold underline>
              {previewUrl}
            </Text>
          </Box>
          <Newline />
          <Text color="gray">
            Run `we promote {projectName}` to go live
          </Text>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red" bold>
            {figures.cross} Deployment failed
          </Text>
          <Text color="red">{error}</Text>
          <Newline />
          <Text color="gray">
            Run `we logs {projectName}` for more details
          </Text>
        </Box>
      )}
    </Box>
  );
}

function StepRow({ step }: { step: Step }) {
  const icon = getStepIcon(step.status);
  const color = getStepColor(step.status);
  const displayName = formatStepName(step.name);

  return (
    <Box>
      <Box width={3}>{icon}</Box>
      <Text color={color}>{displayName}</Text>
      {step.duration !== undefined && step.status === 'success' && (
        <Text color="gray"> ({(step.duration / 1000).toFixed(1)}s)</Text>
      )}
      {step.output && step.status === 'success' && (
        <Text color="gray"> - {step.output}</Text>
      )}
      {step.error && (
        <Text color="red"> - {step.error}</Text>
      )}
    </Box>
  );
}

function getStepIcon(status: Step['status']): React.ReactNode {
  switch (status) {
    case 'pending':
      return <Text color="gray">{figures.circle}</Text>;
    case 'running':
      return <Text color="blue"><Spinner type="dots" /></Text>;
    case 'success':
      return <Text color="green">{figures.tick}</Text>;
    case 'failed':
      return <Text color="red">{figures.cross}</Text>;
    case 'skipped':
      return <Text color="yellow">{figures.line}</Text>;
  }
}

function getStepColor(status: Step['status']): string {
  switch (status) {
    case 'pending':
      return 'gray';
    case 'running':
      return 'blue';
    case 'success':
      return 'green';
    case 'failed':
      return 'red';
    case 'skipped':
      return 'yellow';
  }
}

function formatStepName(name: string): string {
  const nameMap: Record<string, string> = {
    get_slot_status: 'Getting slot status',
    select_slot: 'Selecting target slot',
    generate_quadlet: 'Generating container config',
    daemon_reload: 'Reloading systemd',
    start_container: 'Starting container',
    health_check: 'Running health checks',
    update_registry: 'Updating registry',
  };

  return nameMap[name] || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
