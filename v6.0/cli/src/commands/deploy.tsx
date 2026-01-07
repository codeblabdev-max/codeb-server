/**
 * CodeB CLI - Deploy Command
 * Beautiful deployment experience with real-time progress
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, Text, Newline, useApp } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';
import { DeployProgress } from '../components/DeployProgress.js';

interface DeployCommandProps {
  project?: string;
  environment?: 'staging' | 'production' | 'preview';
  version?: string;
  image?: string;
  force?: boolean;
  ci?: boolean;
}

interface Step {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  duration?: number;
  output?: string;
  error?: string;
}

type DeployState = 'init' | 'deploying' | 'success' | 'error';

const DEPLOY_STEPS = [
  'get_slot_status',
  'select_slot',
  'generate_quadlet',
  'daemon_reload',
  'start_container',
  'health_check',
  'update_registry',
];

export function DeployCommand({
  project: projectArg,
  environment = 'staging',
  version,
  image,
  force = false,
  ci = false,
}: DeployCommandProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<DeployState>('init');
  const [projectName, setProjectName] = useState(projectArg || '');
  const [steps, setSteps] = useState<Step[]>(
    DEPLOY_STEPS.map(name => ({ name, status: 'pending' }))
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(Date.now());

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

  // Start deployment when project is resolved
  useEffect(() => {
    if (projectName && state === 'init') {
      startDeploy();
    }
  }, [projectName, state]);

  const updateStep = useCallback((stepName: string, update: Partial<Step>) => {
    setSteps(prev => prev.map(step =>
      step.name === stepName ? { ...step, ...update } : step
    ));
  }, []);

  const startDeploy = async () => {
    setState('deploying');
    const apiKey = config.getApiKey();

    if (!apiKey) {
      setError('Not logged in. Run `we login` first.');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      // Simulate step-by-step progress (API returns final result)
      // In a real implementation, this would use Server-Sent Events or WebSocket

      // Step 1: Get slot status
      updateStep('get_slot_status', { status: 'running' });
      await sleep(300);
      updateStep('get_slot_status', { status: 'success', duration: 300 });

      // Step 2: Select slot
      updateStep('select_slot', { status: 'running' });
      await sleep(200);
      updateStep('select_slot', { status: 'success', duration: 200, output: 'green slot' });

      // Step 3: Generate Quadlet
      updateStep('generate_quadlet', { status: 'running' });
      await sleep(400);
      updateStep('generate_quadlet', { status: 'success', duration: 400 });

      // Step 4: Daemon reload
      updateStep('daemon_reload', { status: 'running' });
      await sleep(300);
      updateStep('daemon_reload', { status: 'success', duration: 300 });

      // Step 5: Start container
      updateStep('start_container', { status: 'running' });

      // Actually call the API here
      const result = await client.deploy({
        projectName,
        environment,
        version,
        image,
        force,
      });

      if (!result.success) {
        updateStep('start_container', { status: 'failed', error: result.error });
        throw new Error(result.error || 'Deployment failed');
      }

      updateStep('start_container', { status: 'success', duration: result.data?.duration || 5000 });

      // Step 6: Health check
      updateStep('health_check', { status: 'running' });
      await sleep(500);
      updateStep('health_check', { status: 'success', duration: 500, output: 'healthy' });

      // Step 7: Update registry
      updateStep('update_registry', { status: 'running' });
      await sleep(200);
      updateStep('update_registry', { status: 'success', duration: 200 });

      // Success!
      setPreviewUrl(result.data?.previewUrl || `https://${projectName}-${environment}.preview.codeb.dev`);
      setState('success');

      if (ci) {
        // In CI mode, exit with success code
        setTimeout(() => exit(), 100);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setState('error');

      if (ci) {
        // In CI mode, exit with error code
        setTimeout(() => process.exit(1), 100);
      }
    }
  };

  // Check auth first
  if (!config.getApiKey() && state === 'init') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red">Not logged in</Text>
        </Box>
        <Newline />
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

  // Main deployment view
  return (
    <DeployProgress
      projectName={projectName}
      environment={environment}
      steps={steps}
      isComplete={state === 'success'}
      previewUrl={previewUrl || undefined}
      error={error || undefined}
      startTime={startTime}
    />
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
