/**
 * @codeb/cli - Configuration Loader
 *
 * Reads/writes CLI configuration from ~/.codeb/config.json.
 * Manages API URL, API key, and client version.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ============================================================================
// Types
// ============================================================================

export interface CLIConfig {
  apiUrl: string;
  apiKey: string;
  version: string;
}

// ============================================================================
// Defaults
// ============================================================================

const CONFIG_DIR = join(homedir(), '.codeb');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: CLIConfig = {
  apiUrl: 'https://api.codeb.kr',
  apiKey: '',
  version: '8.0.1',
};

// ============================================================================
// Config Operations
// ============================================================================

/**
 * Load CLI configuration from ~/.codeb/config.json.
 * Returns defaults for missing values.
 */
export async function loadConfig(): Promise<CLIConfig> {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content) as Partial<CLIConfig>;

    return {
      apiUrl: parsed.apiUrl || DEFAULT_CONFIG.apiUrl,
      apiKey: parsed.apiKey || DEFAULT_CONFIG.apiKey,
      version: parsed.version || DEFAULT_CONFIG.version,
    };
  } catch {
    // Config doesn't exist yet, return defaults
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save CLI configuration to ~/.codeb/config.json.
 */
export async function saveConfig(config: CLIConfig): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }

  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Get the config file path.
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
