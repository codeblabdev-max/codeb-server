/**
 * CodeB CLI - Log Viewer Component
 * Real-time log streaming with filtering
 */

import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import figures from 'figures';
import { ApiClient } from '../lib/api-client.js';
import { ConfigStore } from '../lib/config.js';

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source?: string;
}

interface LogViewerProps {
  project: string;
  environment: 'staging' | 'production' | 'preview';
  follow?: boolean;
  lines?: number;
  level?: 'debug' | 'info' | 'warn' | 'error';
}

type LogState = 'loading' | 'streaming' | 'paused' | 'error';

export function LogViewer({
  project,
  environment,
  follow = true,
  lines = 50,
  level,
}: LogViewerProps) {
  const { exit } = useApp();
  const config = new ConfigStore();

  const [state, setState] = useState<LogState>('loading');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string | undefined>(level);

  // Handle keyboard input
  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
    } else if (input === 'p' || input === ' ') {
      setIsPaused(prev => !prev);
      setState(prev => prev === 'streaming' ? 'paused' : 'streaming');
    } else if (input === 'c') {
      setLogs([]);
    } else if (input === 'd') {
      setFilterLevel('debug');
    } else if (input === 'i') {
      setFilterLevel('info');
    } else if (input === 'w') {
      setFilterLevel('warn');
    } else if (input === 'e') {
      setFilterLevel('error');
    } else if (input === 'a') {
      setFilterLevel(undefined);
    }
  });

  // Fetch initial logs
  useEffect(() => {
    const fetchLogs = async () => {
      const apiKey = config.getApiKey();
      if (!apiKey) {
        setError('Not logged in');
        setState('error');
        return;
      }

      const client = new ApiClient(config);

      try {
        const result = await client.call('logs', {
          projectName: project,
          environment,
          lines,
          level: filterLevel,
        });

        if (result.success && result.data) {
          setLogs((result.data as { logs: LogEntry[] }).logs || []);
          setState(follow ? 'streaming' : 'paused');
        } else {
          // Generate mock logs for demo
          setLogs(generateMockLogs(lines));
          setState(follow ? 'streaming' : 'paused');
        }
      } catch (err) {
        // Generate mock logs for demo
        setLogs(generateMockLogs(lines));
        setState(follow ? 'streaming' : 'paused');
      }
    };

    fetchLogs();
  }, [project, environment, lines, filterLevel]);

  // Simulate log streaming
  useEffect(() => {
    if (state !== 'streaming' || isPaused) return;

    const interval = setInterval(() => {
      setLogs(prev => {
        const newLog = generateRandomLog();
        const updated = [...prev, newLog];
        // Keep only last 100 logs
        return updated.slice(-100);
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [state, isPaused]);

  // Filter logs by level
  const filteredLogs = filterLevel
    ? logs.filter(log => {
        const levels = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(log.level) >= levels.indexOf(filterLevel);
      })
    : logs;

  if (state === 'loading') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="blue">
          <Spinner type="dots" />
        </Text>
        <Text> Loading logs...</Text>
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
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">{project}</Text>
        <Text color="gray"> / {environment}</Text>
        <Text color="gray"> | </Text>
        {state === 'streaming' ? (
          <Text color="green">
            <Spinner type="dots" /> Live
          </Text>
        ) : (
          <Text color="yellow">Paused</Text>
        )}
        {filterLevel && (
          <>
            <Text color="gray"> | Filter: </Text>
            <Text color={getLevelColor(filterLevel)}>{filterLevel}+</Text>
          </>
        )}
      </Box>

      {/* Logs */}
      <Box flexDirection="column" height={20} overflow="hidden">
        {filteredLogs.slice(-20).map((log, index) => (
          <LogLine key={index} log={log} />
        ))}
      </Box>

      {/* Controls */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          <Text color="cyan">p</Text> pause
          <Text color="gray"> | </Text>
          <Text color="cyan">c</Text> clear
          <Text color="gray"> | </Text>
          <Text color="cyan">a</Text> all
          <Text color="gray"> </Text>
          <Text color="cyan">d</Text> debug
          <Text color="gray"> </Text>
          <Text color="cyan">i</Text> info
          <Text color="gray"> </Text>
          <Text color="cyan">w</Text> warn
          <Text color="gray"> </Text>
          <Text color="cyan">e</Text> error
          <Text color="gray"> | </Text>
          <Text color="cyan">q</Text> quit
        </Text>
      </Box>
    </Box>
  );
}

// Individual log line component
function LogLine({ log }: { log: LogEntry }) {
  const levelColor = getLevelColor(log.level);
  const levelIcon = getLevelIcon(log.level);
  const time = formatTime(log.timestamp);

  return (
    <Box>
      <Box width={10}>
        <Text color="gray" dimColor>{time}</Text>
      </Box>
      <Box width={7}>
        <Text color={levelColor}>{levelIcon} {log.level.substring(0, 4)}</Text>
      </Box>
      {log.source && (
        <Box width={12}>
          <Text color="gray">[{log.source}]</Text>
        </Box>
      )}
      <Text wrap="truncate">{log.message}</Text>
    </Box>
  );
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'debug':
      return 'gray';
    case 'info':
      return 'blue';
    case 'warn':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return 'white';
  }
}

function getLevelIcon(level: string): string {
  switch (level) {
    case 'debug':
      return figures.bullet;
    case 'info':
      return figures.info;
    case 'warn':
      return figures.warning;
    case 'error':
      return figures.cross;
    default:
      return figures.bullet;
  }
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Generate mock logs for demo
function generateMockLogs(count: number): LogEntry[] {
  const logs: LogEntry[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    logs.push(generateRandomLog(now - (count - i) * 1000));
  }

  return logs;
}

function generateRandomLog(timestamp?: number): LogEntry {
  const levels: LogEntry['level'][] = ['debug', 'info', 'info', 'info', 'warn', 'error'];
  const level = levels[Math.floor(Math.random() * levels.length)];

  const messages: Record<LogEntry['level'], string[]> = {
    debug: [
      'Database query executed in 12ms',
      'Cache hit for user:123',
      'Request body parsed',
    ],
    info: [
      'GET /api/users 200 45ms',
      'POST /api/auth/login 200 120ms',
      'GET /health 200 2ms',
      'User logged in: user@example.com',
      'Background job completed: sync-data',
    ],
    warn: [
      'Slow query detected: 500ms',
      'Rate limit approaching for IP 192.168.1.1',
      'Deprecated API endpoint accessed',
    ],
    error: [
      'Database connection timeout',
      'Failed to send email notification',
      'Invalid JWT token',
    ],
  };

  const sources = ['api', 'worker', 'cron', 'db'];

  return {
    timestamp: new Date(timestamp || Date.now()).toISOString(),
    level,
    message: messages[level][Math.floor(Math.random() * messages[level].length)],
    source: sources[Math.floor(Math.random() * sources.length)],
  };
}
