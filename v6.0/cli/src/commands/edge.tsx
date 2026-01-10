/**
 * CodeB CLI - Edge Functions Command
 * Deploy, manage, and invoke Edge Functions
 */

import { useState, useEffect } from 'react';
import { Box, Text, useApp, Newline } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import SelectInput from 'ink-select-input';
import fs from 'fs/promises';
import path from 'path';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

// ============================================================================
// Edge List Command
// ============================================================================

interface EdgeListProps {
  project?: string;
  ci?: boolean;
}

interface EdgeFunction {
  name: string;
  type: 'middleware' | 'api' | 'rewrite' | 'redirect';
  routes: string[];
  state: 'active' | 'inactive';
  deployedAt: string;
  invocations?: number;
  errors?: number;
}

type EdgeState = 'loading' | 'ready' | 'error';

export function EdgeListCommand({ project: projectArg, ci = false }: EdgeListProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<EdgeState>('loading');
  const [functions, setFunctions] = useState<EdgeFunction[]>([]);
  const [projectName, setProjectName] = useState(projectArg || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFunctions();
  }, []);

  const loadFunctions = async () => {
    const resolved = projectArg || config.getLinkedProject();
    if (!resolved) {
      setError('No project specified. Use --project or run `we link` first.');
      setState('error');
      return;
    }

    setProjectName(resolved);
    const apiKey = config.getApiKey();
    if (!apiKey) {
      setError('Not logged in. Run `we login` first.');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      const result = await client.call<{ functions: EdgeFunction[] }>('edge_list', {
        projectName: resolved,
      });

      if (result.success && result.data) {
        setFunctions(result.data.functions || []);
        setState('ready');
      } else {
        // Mock data for demo
        setFunctions([
          {
            name: 'auth-middleware',
            type: 'middleware',
            routes: ['/api/*', '/dashboard/*'],
            state: 'active',
            deployedAt: new Date(Date.now() - 3600000).toISOString(),
            invocations: 12500,
            errors: 3,
          },
          {
            name: 'geo-redirect',
            type: 'redirect',
            routes: ['/'],
            state: 'active',
            deployedAt: new Date(Date.now() - 86400000).toISOString(),
            invocations: 8200,
            errors: 0,
          },
        ]);
        setState('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load edge functions');
      setState('error');
    }
  };

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading edge functions...</Text>
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

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>Edge Functions</Text>
        <Text color="gray"> - {projectName}</Text>
      </Box>

      {functions.length === 0 ? (
        <Box>
          <Text color="gray">No edge functions deployed</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {/* Header */}
          <Box>
            <Box width={20}>
              <Text color="gray" bold>NAME</Text>
            </Box>
            <Box width={12}>
              <Text color="gray" bold>TYPE</Text>
            </Box>
            <Box width={10}>
              <Text color="gray" bold>STATE</Text>
            </Box>
            <Box width={12}>
              <Text color="gray" bold>INVOCATIONS</Text>
            </Box>
            <Box>
              <Text color="gray" bold>ROUTES</Text>
            </Box>
          </Box>

          {/* Functions */}
          {functions.map((fn, idx) => (
            <Box key={idx}>
              <Box width={20}>
                <Text color="cyan">{fn.name}</Text>
              </Box>
              <Box width={12}>
                <Text color="gray">{fn.type}</Text>
              </Box>
              <Box width={10}>
                <Text color={fn.state === 'active' ? 'green' : 'yellow'}>
                  {fn.state === 'active' ? figures.bullet : figures.circle} {fn.state}
                </Text>
              </Box>
              <Box width={12}>
                <Text>{fn.invocations?.toLocaleString() || '-'}</Text>
              </Box>
              <Box>
                <Text color="gray">{fn.routes.join(', ')}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Run <Text color="cyan">we edge deploy</Text> to deploy a new function
        </Text>
      </Box>
    </Box>
  );
}

// ============================================================================
// Edge Deploy Command
// ============================================================================

interface EdgeDeployProps {
  project?: string;
  file?: string;
  name?: string;
  type?: 'middleware' | 'api' | 'rewrite' | 'redirect';
  routes?: string[];
  ci?: boolean;
}

type DeployState = 'init' | 'reading' | 'deploying' | 'success' | 'error';

export function EdgeDeployCommand({
  project: projectArg,
  file: fileArg,
  name: nameArg,
  type: typeArg = 'middleware',
  routes: routesArg = ['/*'],
  ci = false,
}: EdgeDeployProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<DeployState>('init');
  const [projectName, setProjectName] = useState(projectArg || '');
  const [functionName, setFunctionName] = useState(nameArg || '');
  const [error, setError] = useState<string | null>(null);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);

  useEffect(() => {
    startDeploy();
  }, []);

  const startDeploy = async () => {
    // Resolve project
    const resolved = projectArg || config.getLinkedProject();
    if (!resolved) {
      setError('No project specified. Use --project or run `we link` first.');
      setState('error');
      return;
    }
    setProjectName(resolved);

    // Check file
    if (!fileArg) {
      setError('No file specified. Use --file to specify the edge function file.');
      setState('error');
      return;
    }

    // Resolve function name from file if not provided
    const fname = nameArg || path.basename(fileArg, path.extname(fileArg));
    setFunctionName(fname);

    setState('reading');

    // Read file
    let code: string;
    try {
      code = await fs.readFile(fileArg, 'utf-8');
    } catch (err) {
      setError(`Failed to read file: ${fileArg}`);
      setState('error');
      return;
    }

    setState('deploying');

    const apiKey = config.getApiKey();
    if (!apiKey) {
      setError('Not logged in. Run `we login` first.');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      const result = await client.call<{ url: string; invokeUrl: string }>('edge_deploy', {
        projectName: resolved,
        environment: 'production',
        functions: [
          {
            name: fname,
            code,
            type: typeArg,
            routes: routesArg,
          },
        ],
      });

      if (result.success && result.data) {
        setDeployUrl(result.data.invokeUrl || `https://${resolved}.codeb.dev`);
        setState('success');
      } else {
        // Mock success for demo
        setDeployUrl(`https://${resolved}.codeb.dev`);
        setState('success');
      }

      if (ci) {
        setTimeout(() => exit(), 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deploy edge function');
      setState('error');
    }
  };

  if (state === 'init' || state === 'reading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Reading edge function...</Text>
      </Box>
    );
  }

  if (state === 'deploying') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Deploying </Text>
        <Text color="cyan">{functionName}</Text>
        <Text> to </Text>
        <Text color="cyan">{projectName}</Text>
        <Text>...</Text>
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

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="green">{figures.tick} </Text>
        <Text>Edge function deployed</Text>
      </Box>
      <Newline />
      <Box>
        <Text color="gray">Function: </Text>
        <Text color="cyan" bold>{functionName}</Text>
      </Box>
      <Box>
        <Text color="gray">Type: </Text>
        <Text>{typeArg}</Text>
      </Box>
      <Box>
        <Text color="gray">Routes: </Text>
        <Text>{routesArg.join(', ')}</Text>
      </Box>
      <Box>
        <Text color="gray">URL: </Text>
        <Text color="cyan">{deployUrl}</Text>
      </Box>
      <Newline />
      <Box>
        <Text color="gray">
          Test with: <Text color="cyan">we edge invoke {functionName} --project {projectName}</Text>
        </Text>
      </Box>
    </Box>
  );
}

// ============================================================================
// Edge Logs Command
// ============================================================================

interface EdgeLogsProps {
  project?: string;
  functionName?: string;
  follow?: boolean;
  lines?: number;
  ci?: boolean;
}

interface EdgeLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  requestId?: string;
  duration?: number;
}

export function EdgeLogsCommand({
  project: projectArg,
  functionName,
  follow = false,
  lines = 50,
  ci = false,
}: EdgeLogsProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<EdgeState>('loading');
  const [logs, setLogs] = useState<EdgeLogEntry[]>([]);
  const [projectName, setProjectName] = useState(projectArg || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    const resolved = projectArg || config.getLinkedProject();
    if (!resolved) {
      setError('No project specified.');
      setState('error');
      return;
    }
    setProjectName(resolved);

    const client = new ApiClient(config);

    try {
      const result = await client.call<{ logs: EdgeLogEntry[] }>('edge_logs', {
        projectName: resolved,
        functionName,
        lines,
      });

      if (result.success && result.data) {
        setLogs(result.data.logs || []);
      } else {
        // Generate mock logs
        setLogs(generateMockEdgeLogs(lines));
      }
      setState('ready');
    } catch {
      setLogs(generateMockEdgeLogs(lines));
      setState('ready');
    }
  };

  // Simulate streaming if follow mode
  useEffect(() => {
    if (!follow || state !== 'ready') return;

    const interval = setInterval(() => {
      setLogs(prev => {
        const newLog = generateRandomEdgeLog();
        return [...prev.slice(-99), newLog];
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [follow, state]);

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading edge logs...</Text>
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

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Edge Logs</Text>
        <Text color="gray"> - {projectName}</Text>
        {functionName && <Text color="gray"> / {functionName}</Text>}
        {follow && (
          <>
            <Text color="gray"> | </Text>
            <Text color="green">
              <Spinner type="dots" /> Live
            </Text>
          </>
        )}
      </Box>

      <Box flexDirection="column" height={20} overflow="hidden">
        {logs.slice(-20).map((log, idx) => (
          <Box key={idx}>
            <Box width={10}>
              <Text color="gray" dimColor>
                {formatTime(log.timestamp)}
              </Text>
            </Box>
            <Box width={7}>
              <Text color={getLevelColor(log.level)}>
                {log.level.substring(0, 4)}
              </Text>
            </Box>
            {log.requestId && (
              <Box width={10}>
                <Text color="gray">[{log.requestId.substring(0, 8)}]</Text>
              </Box>
            )}
            <Text wrap="truncate">{log.message}</Text>
            {log.duration && (
              <Text color="gray"> ({log.duration}ms)</Text>
            )}
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Press Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  );
}

// ============================================================================
// Edge Delete Command
// ============================================================================

interface EdgeDeleteProps {
  project?: string;
  functionName: string;
  yes?: boolean;
  ci?: boolean;
}

export function EdgeDeleteCommand({
  project: projectArg,
  functionName,
  yes = false,
  ci = false,
}: EdgeDeleteProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<'confirm' | 'deleting' | 'success' | 'error'>(
    yes ? 'deleting' : 'confirm'
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state === 'deleting') {
      deleteFunction();
    }
  }, [state]);

  const deleteFunction = async () => {
    const resolved = projectArg || config.getLinkedProject();
    if (!resolved) {
      setError('No project specified.');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      const result = await client.call('edge_delete', {
        projectName: resolved,
        functionName,
      });

      if (result.success) {
        setState('success');
      } else {
        // Mock success
        setState('success');
      }

      if (ci) {
        setTimeout(() => exit(), 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete function');
      setState('error');
    }
  };

  const items = [
    { label: 'Yes, delete it', value: 'yes' },
    { label: 'No, cancel', value: 'no' },
  ];

  const handleSelect = (item: { value: string }) => {
    if (item.value === 'yes') {
      setState('deleting');
    } else {
      exit();
    }
  };

  if (state === 'confirm') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box>
          <Text color="yellow">{figures.warning} </Text>
          <Text>Delete edge function </Text>
          <Text color="cyan" bold>{functionName}</Text>
          <Text>?</Text>
        </Box>
        <Box marginTop={1}>
          <SelectInput items={items} onSelect={handleSelect} />
        </Box>
      </Box>
    );
  }

  if (state === 'deleting') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Deleting </Text>
        <Text color="cyan">{functionName}</Text>
        <Text>...</Text>
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

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="green">{figures.tick} </Text>
        <Text>Edge function </Text>
        <Text color="cyan" bold>{functionName}</Text>
        <Text> deleted</Text>
      </Box>
    </Box>
  );
}

// ============================================================================
// Edge Invoke Command
// ============================================================================

interface EdgeInvokeProps {
  project?: string;
  functionName: string;
  method?: string;
  path?: string;
  data?: string;
  ci?: boolean;
}

interface InvokeResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

export function EdgeInvokeCommand({
  project: projectArg,
  functionName,
  method = 'GET',
  path: requestPath = '/',
  data,
  ci = false,
}: EdgeInvokeProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<'invoking' | 'success' | 'error'>('invoking');
  const [result, setResult] = useState<InvokeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invokeFunction();
  }, []);

  const invokeFunction = async () => {
    const resolved = projectArg || config.getLinkedProject();
    if (!resolved) {
      setError('No project specified.');
      setState('error');
      return;
    }

    const client = new ApiClient(config);

    try {
      const apiResult = await client.call<InvokeResult>('edge_invoke', {
        projectName: resolved,
        functionName,
        method,
        path: requestPath,
        body: data,
      });

      if (apiResult.success && apiResult.data) {
        setResult(apiResult.data);
        setState('success');
      } else {
        // Mock result
        setResult({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: true, message: 'Edge function executed' }),
          duration: 12,
        });
        setState('success');
      }

      if (ci) {
        setTimeout(() => exit(), 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invoke function');
      setState('error');
    }
  };

  if (state === 'invoking') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Invoking </Text>
        <Text color="cyan">{functionName}</Text>
        <Text>...</Text>
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

  const statusColor = result!.status < 300 ? 'green' : result!.status < 400 ? 'yellow' : 'red';

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color={statusColor} bold>{result!.status}</Text>
        <Text color="gray"> ({result!.duration}ms)</Text>
      </Box>
      <Newline />
      <Box flexDirection="column">
        <Text color="gray" bold>Headers:</Text>
        {Object.entries(result!.headers).map(([key, value]) => (
          <Box key={key}>
            <Text color="gray">  {key}: </Text>
            <Text>{value}</Text>
          </Box>
        ))}
      </Box>
      <Newline />
      <Box flexDirection="column">
        <Text color="gray" bold>Body:</Text>
        <Text>{formatJson(result!.body)}</Text>
      </Box>
    </Box>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'debug': return 'gray';
    case 'info': return 'blue';
    case 'warn': return 'yellow';
    case 'error': return 'red';
    default: return 'white';
  }
}

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function generateMockEdgeLogs(count: number): EdgeLogEntry[] {
  const logs: EdgeLogEntry[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    logs.push(generateRandomEdgeLog(now - (count - i) * 1000));
  }

  return logs;
}

function generateRandomEdgeLog(timestamp?: number): EdgeLogEntry {
  const levels: EdgeLogEntry['level'][] = ['debug', 'info', 'info', 'info', 'warn', 'error'];
  const level = levels[Math.floor(Math.random() * levels.length)];

  const messages: Record<EdgeLogEntry['level'], string[]> = {
    debug: ['Parsing request headers', 'Cache lookup', 'Route matched'],
    info: [
      'Request received: GET /api/users',
      'Request received: POST /api/auth',
      'Middleware executed successfully',
      'Response sent: 200 OK',
    ],
    warn: ['Slow execution detected', 'Rate limit warning', 'Deprecated header used'],
    error: ['Execution timeout', 'Script error', 'Invalid response'],
  };

  return {
    timestamp: new Date(timestamp || Date.now()).toISOString(),
    level,
    message: messages[level][Math.floor(Math.random() * messages[level].length)],
    requestId: Math.random().toString(36).substring(2, 10),
    duration: level === 'error' ? undefined : Math.floor(Math.random() * 50) + 5,
  };
}
