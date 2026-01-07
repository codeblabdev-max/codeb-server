/**
 * CodeB CLI - Migrate Command
 * 레거시 시스템(v3.x/v5.x)에서 v6.0 Blue-Green 슬롯 시스템으로 마이그레이션
 */

import { useState, useEffect } from 'react';
import { Box, Text, Newline, useApp } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

// ============================================================================
// Migrate Detect Command
// ============================================================================

interface MigrateDetectProps {
  verbose?: boolean;
}

interface DetectionResult {
  systemType: string;
  hasSSOT: boolean;
  ssotVersion?: string;
  projects: Array<{
    name: string;
    source: string;
    environments: Array<{
      name: string;
      port?: number;
      domain?: string;
      status: string;
    }>;
    canMigrate: boolean;
    migrationBlocker?: string;
  }>;
  containers: Array<{
    name: string;
    status: string;
    ports: Array<{ host: number; container: number }>;
  }>;
  warnings: string[];
  errors: string[];
}

type DetectState = 'loading' | 'success' | 'error';

export function MigrateDetectCommand({ verbose = false }: MigrateDetectProps) {
  const config = new ConfigStore();
  const [state, setState] = useState<DetectState>('loading');
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detect = async () => {
      const apiKey = config.getApiKey();
      if (!apiKey) {
        setError('Not logged in. Run `we login` first.');
        setState('error');
        return;
      }

      const client = new ApiClient(config);

      try {
        const response = await client.call<DetectionResult>('migrate_detect', {});

        if (response.success && response.data) {
          setResult(response.data);
          setState('success');
        } else {
          setError(response.error || 'Detection failed');
          setState('error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Detection failed');
        setState('error');
      }
    };

    detect();
  }, []);

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Scanning server for legacy systems...</Text>
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

  if (!result) return null;

  const migratable = result.projects.filter(p => p.canMigrate);
  const blocked = result.projects.filter(p => !p.canMigrate);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Legacy System Detection</Text>
      </Box>

      {/* System Info */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="gray">System Type: </Text>
          <Text bold>{formatSystemType(result.systemType)}</Text>
        </Box>
        {result.hasSSOT && (
          <Box>
            <Text color="gray">SSOT Version: </Text>
            <Text>{result.ssotVersion}</Text>
          </Box>
        )}
        <Box>
          <Text color="gray">Projects Found: </Text>
          <Text>{result.projects.length}</Text>
        </Box>
        <Box>
          <Text color="gray">Containers: </Text>
          <Text>{result.containers.length}</Text>
        </Box>
      </Box>

      {/* Migratable Projects */}
      {migratable.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="green">{figures.tick} Ready to Migrate ({migratable.length})</Text>
          <Box flexDirection="column" marginLeft={2}>
            {migratable.map((project, i) => (
              <Box key={i}>
                <Text>{project.name}</Text>
                <Text color="gray"> ({project.environments.map(e => e.name).join(', ')})</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Blocked Projects */}
      {blocked.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">{figures.warning} Cannot Migrate ({blocked.length})</Text>
          <Box flexDirection="column" marginLeft={2}>
            {blocked.map((project, i) => (
              <Box key={i} flexDirection="column">
                <Text color="yellow">{project.name}</Text>
                <Text color="gray" dimColor>  {project.migrationBlocker}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">Warnings:</Text>
          {result.warnings.map((warning, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="yellow">{figures.warning} {warning}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Verbose: Container Details */}
      {verbose && result.containers.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="gray">Containers:</Text>
          {result.containers.map((container, i) => (
            <Box key={i} marginLeft={2}>
              <Text color={container.status === 'running' ? 'green' : 'gray'}>
                {container.status === 'running' ? figures.tick : figures.circle}
              </Text>
              <Text> {container.name}</Text>
              {container.ports.length > 0 && (
                <Text color="gray"> (:{container.ports.map(p => p.host).join(', ')})</Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Next Steps */}
      <Newline />
      {migratable.length > 0 ? (
        <Box flexDirection="column">
          <Text color="gray">Next steps:</Text>
          <Text color="cyan">  we migrate plan</Text>
          <Text color="gray">    Preview migration plan</Text>
          <Text color="cyan">  we migrate execute</Text>
          <Text color="gray">    Execute migration</Text>
        </Box>
      ) : (
        <Text color="gray">
          No projects available for migration.
          {result.systemType === 'quadlet-v6' && ' All projects already use v6.0 slot system.'}
        </Text>
      )}
    </Box>
  );
}

// ============================================================================
// Migrate Plan Command
// ============================================================================

interface MigratePlanProps {
  projects?: string[];
  dryRun?: boolean;
}

interface MigrationPlan {
  id: string;
  sourceSystem: string;
  projects: Array<{
    name: string;
    current: {
      port: number;
      domain?: string;
      containerName: string;
    };
    target: {
      bluePort: number;
      greenPort: number;
      domain?: string;
    };
    environments: Array<{
      name: string;
      action: string;
    }>;
  }>;
  steps: Array<{
    id: string;
    name: string;
    description: string;
    order: number;
  }>;
  estimatedDowntime: string;
  canRollback: boolean;
}

type PlanState = 'loading' | 'success' | 'error';

export function MigratePlanCommand({ projects, dryRun = true }: MigratePlanProps) {
  const config = new ConfigStore();
  const [state, setState] = useState<PlanState>('loading');
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const createPlan = async () => {
      const apiKey = config.getApiKey();
      if (!apiKey) {
        setError('Not logged in. Run `we login` first.');
        setState('error');
        return;
      }

      const client = new ApiClient(config);

      try {
        const response = await client.call<{ plan: MigrationPlan }>('migrate_plan', {
          projects,
          dryRun,
        });

        if (response.success && response.data) {
          setPlan(response.data.plan);
          setState('success');
        } else {
          setError(response.error || 'Failed to create migration plan');
          setState('error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create plan');
        setState('error');
      }
    };

    createPlan();
  }, []);

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Creating migration plan...</Text>
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

  if (!plan) return null;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Migration Plan</Text>
        <Text color="gray"> ({plan.id})</Text>
      </Box>

      {/* Overview */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="gray">Source System: </Text>
          <Text>{formatSystemType(plan.sourceSystem)}</Text>
        </Box>
        <Box>
          <Text color="gray">Projects: </Text>
          <Text>{plan.projects.length}</Text>
        </Box>
        <Box>
          <Text color="gray">Est. Downtime: </Text>
          <Text color="yellow">{plan.estimatedDowntime}</Text>
        </Box>
        <Box>
          <Text color="gray">Rollback: </Text>
          <Text color={plan.canRollback ? 'green' : 'red'}>
            {plan.canRollback ? 'Available' : 'Not available'}
          </Text>
        </Box>
      </Box>

      {/* Projects */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Projects to Migrate:</Text>
        {plan.projects.map((project, i) => (
          <Box key={i} flexDirection="column" marginLeft={2} marginTop={1}>
            <Text bold color="cyan">{project.name}</Text>

            <Box marginLeft={2}>
              <Text color="gray">Current: </Text>
              <Text>:{project.current.port}</Text>
              {project.current.domain && (
                <Text color="gray"> → {project.current.domain}</Text>
              )}
            </Box>

            <Box marginLeft={2}>
              <Text color="gray">Target:  </Text>
              <Text color="blue">Blue :{project.target.bluePort}</Text>
              <Text> / </Text>
              <Text color="green">Green :{project.target.greenPort}</Text>
            </Box>

            {project.environments.map((env, j) => (
              <Box key={j} marginLeft={2}>
                <Text color="gray">{env.name}: </Text>
                <Text color={env.action === 'migrate' ? 'green' : 'yellow'}>
                  {env.action}
                </Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      {/* Steps Preview */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Migration Steps ({plan.steps.length}):</Text>
        <Box flexDirection="column" marginLeft={2}>
          {plan.steps.slice(0, 5).map((step, i) => (
            <Box key={i}>
              <Text color="gray">{step.order}. </Text>
              <Text>{step.description}</Text>
            </Box>
          ))}
          {plan.steps.length > 5 && (
            <Text color="gray">  ... and {plan.steps.length - 5} more steps</Text>
          )}
        </Box>
      </Box>

      {/* Actions */}
      <Newline />
      <Box flexDirection="column">
        <Text color="yellow">{figures.warning} This is a preview. No changes have been made.</Text>
        <Newline />
        <Text color="gray">To execute this migration:</Text>
        <Text color="cyan">  we migrate execute --id {plan.id}</Text>
      </Box>
    </Box>
  );
}

// ============================================================================
// Migrate Execute Command
// ============================================================================

interface MigrateExecuteProps {
  migrationId?: string;
  force?: boolean;
  yes?: boolean;
}

interface MigrationResult {
  success: boolean;
  migrationId: string;
  migratedProjects: string[];
  failedProjects: Array<{ name: string; error: string }>;
  duration: number;
  nextSteps: string[];
  warnings: string[];
}

interface Step {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration?: number;
}

type ExecuteState = 'confirm' | 'executing' | 'success' | 'error';

export function MigrateExecuteCommand({
  migrationId,
  force = false,
  yes = false,
}: MigrateExecuteProps) {
  const { exit } = useApp();
  const config = new ConfigStore();
  const [state, setState] = useState<ExecuteState>(yes ? 'executing' : 'confirm');
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state === 'executing') {
      executeMigration();
    }
  }, [state]);

  const executeMigration = async () => {
    const apiKey = config.getApiKey();
    if (!apiKey) {
      setError('Not logged in');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      // 먼저 계획 가져오기
      const planResponse = await client.call<{ plan: MigrationPlan }>('migrate_plan', {});

      if (!planResponse.success || !planResponse.data) {
        throw new Error(planResponse.error || 'Failed to get migration plan');
      }

      const plan = planResponse.data.plan;
      setSteps(plan.steps.map(s => ({ ...s, status: 'pending' as const })));

      // 마이그레이션 실행
      const response = await client.call<MigrationResult>('migrate_execute', {
        migrationId: migrationId || plan.id,
        force,
      });

      if (response.success && response.data) {
        setResult(response.data);
        setState('success');
      } else {
        setError(response.error || 'Migration failed');
        setState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration failed');
      setState('error');
    }
  };

  // Confirmation
  if (state === 'confirm') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="yellow">{figures.warning} Migration Confirmation</Text>
        </Box>

        <Text>This will migrate all legacy projects to the v6.0 slot system.</Text>
        <Newline />

        <Text color="yellow">• Containers will be renamed</Text>
        <Text color="yellow">• Ports will be reassigned to Blue-Green ranges</Text>
        <Text color="yellow">• Caddy configs will be updated</Text>
        <Newline />

        <Text color="gray">
          Press <Text color="cyan">Enter</Text> to continue or <Text color="red">Ctrl+C</Text> to cancel
        </Text>

        {/* Auto-confirm after showing */}
        <ConfirmHandler onConfirm={() => setState('executing')} />
      </Box>
    );
  }

  // Executing
  if (state === 'executing') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Executing Migration</Text>
        </Box>

        <Box>
          <Text color="blue">
            <Spinner type="dots" />
          </Text>
          <Text> Migrating projects to v6.0 slot system...</Text>
        </Box>

        {steps.length > 0 && (
          <Box flexDirection="column" marginTop={1} marginLeft={2}>
            {steps.slice(0, 5).map((step, i) => (
              <Box key={i}>
                <Box width={3}>
                  {step.status === 'running' && (
                    <Text color="blue"><Spinner type="dots" /></Text>
                  )}
                  {step.status === 'completed' && (
                    <Text color="green">{figures.tick}</Text>
                  )}
                  {step.status === 'failed' && (
                    <Text color="red">{figures.cross}</Text>
                  )}
                  {step.status === 'pending' && (
                    <Text color="gray">{figures.circle}</Text>
                  )}
                </Box>
                <Text color={step.status === 'running' ? 'blue' : 'white'}>
                  {step.description}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // Error
  if (state === 'error') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="red">{figures.cross} </Text>
          <Text color="red" bold>Migration Failed</Text>
        </Box>
        <Newline />
        <Text color="red">{error}</Text>
        <Newline />
        <Text color="gray">
          Run <Text color="cyan">we migrate rollback</Text> to revert changes.
        </Text>
      </Box>
    );
  }

  // Success
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="green">{figures.tick} </Text>
        <Text color="green" bold>Migration Complete!</Text>
        <Text color="gray"> ({result?.duration}ms)</Text>
      </Box>

      <Newline />

      {/* Migrated Projects */}
      {result && result.migratedProjects.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Migrated Projects:</Text>
          {result.migratedProjects.map((project, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="green">{figures.tick} </Text>
              <Text>{project}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Failed Projects */}
      {result && result.failedProjects.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="red">Failed:</Text>
          {result.failedProjects.map((project, i) => (
            <Box key={i} marginLeft={2} flexDirection="column">
              <Box>
                <Text color="red">{figures.cross} </Text>
                <Text>{project.name}</Text>
              </Box>
              <Text color="gray" dimColor>  {project.error}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Warnings */}
      {result && result.warnings.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">Warnings:</Text>
          {result.warnings.map((warning, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="yellow">{warning}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Next Steps */}
      <Box flexDirection="column">
        <Text bold>Next Steps:</Text>
        {result?.nextSteps.map((step, i) => (
          <Box key={i} marginLeft={2}>
            <Text color="gray">{i + 1}. </Text>
            <Text>{step}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function ConfirmHandler({ onConfirm }: { onConfirm: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onConfirm, 2000);
    return () => clearTimeout(timer);
  }, [onConfirm]);

  return null;
}

function formatSystemType(type: string): string {
  switch (type) {
    case 'ssot-v1':
      return 'SSOT v1.0 (v5.x)';
    case 'workflow':
      return 'Workflow (v3.x)';
    case 'docker-compose':
      return 'Docker Compose';
    case 'podman-direct':
      return 'Podman Direct';
    case 'quadlet-v6':
      return 'v6.0 Slot System (already migrated)';
    default:
      return type;
  }
}
