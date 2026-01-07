/**
 * CodeB CLI - API Client
 * HTTP client for CodeB API with real-time support
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
  timestamp?: string;
}

interface DeployParams {
  projectName: string;
  environment: 'staging' | 'production' | 'preview';
  version?: string;
  image?: string;
  force?: boolean;
  skipHealthcheck?: boolean;
}

interface PromoteParams {
  projectName: string;
  environment: 'staging' | 'production' | 'preview';
}

interface RollbackParams {
  projectName: string;
  environment: 'staging' | 'production' | 'preview';
  reason?: string;
}

interface SlotStatusParams {
  projectName: string;
  environment: 'staging' | 'production' | 'preview';
}

interface WhoamiData {
  teamId: string;
  teamName?: string;
  role: string;
  keyId: string;
  projects: string[];
  permissions?: string[];
  rateLimit?: {
    remaining: number;
    limit: number;
    resetAt: string;
  };
}

interface DeployResult {
  slot: 'blue' | 'green';
  port: number;
  previewUrl: string;
  duration: number;
  version?: string;
}

interface PromoteResult {
  fromSlot: 'blue' | 'green';
  toSlot: 'blue' | 'green';
  productionUrl: string;
  previousVersion?: string;
  newVersion?: string;
  duration: number;
}

interface RollbackResult {
  fromSlot: 'blue' | 'green';
  toSlot: 'blue' | 'green';
  restoredVersion: string;
  duration: number;
}

// Default API URL
const DEFAULT_API_URL = 'https://api.codeb.kr/api';
const FALLBACK_API_URL = 'http://158.247.203.55:9101/api';

export interface ConfigLike {
  getApiKey(): string;
  getApiUrl(): string;
}

// Simple implementation for standalone API key usage
export class SimpleConfig implements ConfigLike {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string, apiUrl: string = 'https://api.codeb.kr/api') {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }
}

export class ApiClient {
  private config: ConfigLike;
  private defaultHeaders: Record<string, string>;

  constructor(config: ConfigLike) {
    this.config = config;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private get apiKey(): string {
    return this.config.getApiKey();
  }

  private get apiUrl(): string {
    return this.config.getApiUrl();
  }

  /**
   * Generic API tool call
   */
  async call<T = unknown>(
    tool: string,
    params: Record<string, unknown> = {}
  ): Promise<ApiResponse<T>> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'Not authenticated. Run `we login` first.',
      };
    }

    // Try primary, then fallback
    const urls = [this.apiUrl, FALLBACK_API_URL];

    for (const url of urls) {
      try {
        const response = await fetch(`${url}/tool`, {
          method: 'POST',
          headers: {
            ...this.defaultHeaders,
            'X-API-Key': this.apiKey,
          },
          body: JSON.stringify({ tool, params }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          return {
            success: false,
            error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        return await response.json() as ApiResponse<T>;
      } catch (error) {
        // Try next URL
        if (url === urls[urls.length - 1]) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Network error',
          };
        }
      }
    }

    return {
      success: false,
      error: 'All API endpoints unreachable',
    };
  }

  /**
   * Deploy to Blue-Green slot
   */
  async deploy(params: DeployParams): Promise<ApiResponse<DeployResult>> {
    return this.call<DeployResult>('deploy', params as unknown as Record<string, unknown>);
  }

  /**
   * Promote deployment to production
   */
  async promote(params: PromoteParams): Promise<ApiResponse<PromoteResult>> {
    return this.call<PromoteResult>('promote', params as unknown as Record<string, unknown>);
  }

  /**
   * Rollback to previous version
   */
  async rollback(params: RollbackParams): Promise<ApiResponse<RollbackResult>> {
    return this.call<RollbackResult>('rollback', params as unknown as Record<string, unknown>);
  }

  /**
   * Get slot status
   */
  async slotStatus(params: SlotStatusParams): Promise<ApiResponse<{
    projectName: string;
    environment: string;
    activeSlot: 'blue' | 'green';
    blue: {
      state: string;
      port: number;
      version?: string;
      deployedAt?: string;
      healthStatus?: string;
      graceExpiresAt?: string;
    };
    green: {
      state: string;
      port: number;
      version?: string;
      deployedAt?: string;
      healthStatus?: string;
      graceExpiresAt?: string;
    };
    lastUpdated: string;
  }>> {
    return this.call('slot_status', params as unknown as Record<string, unknown>);
  }

  /**
   * Get current user/token info
   */
  async whoami(): Promise<ApiResponse<WhoamiData>> {
    // First try to get team info
    // Note: team_list returns { success, teams: [...] } not { success, data: { teams: [...] } }
    const teamsResult = await this.call<unknown>('team_list', {}) as ApiResponse & { teams?: Array<{ id: string; name: string }> };

    if (teamsResult.success && teamsResult.teams?.[0]) {
      const team = teamsResult.teams[0];

      // Parse API key to extract info
      // Format: codeb_{teamId}_{role}_{token}
      const keyParts = this.apiKey.split('_');
      const role = keyParts[2] || 'member';

      // Get projects for this team
      const slotsResult = await this.call<Array<{
        projectName: string;
        environment: string;
      }>>('slot_list', {});

      const projects = slotsResult.success && slotsResult.data
        ? [...new Set(slotsResult.data.map(s => s.projectName))]
        : [];

      return {
        success: true,
        data: {
          teamId: team.id,
          teamName: team.name,
          role,
          keyId: keyParts.slice(-1)[0]?.substring(0, 8) || 'unknown',
          projects,
        },
      };
    }

    // If team_list fails, try a simple health check
    const health = await this.healthCheck();

    if (health) {
      // Token works but can't get team info
      const keyParts = this.apiKey.split('_');
      return {
        success: true,
        data: {
          teamId: keyParts[1] || 'unknown',
          role: keyParts[2] || 'member',
          keyId: keyParts.slice(-1)[0]?.substring(0, 8) || 'unknown',
          projects: [],
        },
      };
    }

    return {
      success: false,
      error: teamsResult.error || 'Invalid API key',
    };
  }

  /**
   * List all projects (slots)
   */
  async listProjects(): Promise<ApiResponse<Array<{
    projectName: string;
    environment: string;
    activeSlot: 'blue' | 'green';
    blueState: string;
    greenState: string;
    lastUpdated: string;
  }>>> {
    return this.call('slot_list', {});
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    const urls = [this.apiUrl, FALLBACK_API_URL];

    for (const url of urls) {
      try {
        const healthUrl = url.replace('/api', '') + '/health';
        const response = await fetch(healthUrl, { method: 'GET' });

        if (response.ok) {
          return true;
        }
      } catch {
        // Try next URL
      }
    }

    return false;
  }

  /**
   * Get environment variables
   */
  async envGet(projectName: string, environment: string): Promise<ApiResponse<{
    variables: Record<string, string>;
    lastUpdated: string;
  }>> {
    return this.call('env_get', { projectName, environment });
  }

  /**
   * Set environment variables
   */
  async envSet(
    projectName: string,
    environment: string,
    variables: Record<string, string>
  ): Promise<ApiResponse> {
    return this.call('env_set', { projectName, environment, variables });
  }

  /**
   * Deploy edge function
   */
  async edgeDeploy(params: {
    projectName: string;
    functionName: string;
    code: string;
    type?: 'middleware' | 'api' | 'rewrite' | 'redirect';
    routes?: string[];
  }): Promise<ApiResponse> {
    return this.call('edge_deploy', params);
  }

  /**
   * Get analytics overview
   */
  async analyticsOverview(params: {
    projectName: string;
    environment?: string;
    period?: '1h' | '24h' | '7d' | '30d';
  }): Promise<ApiResponse> {
    return this.call('analytics_overview', params);
  }

  /**
   * Get Web Vitals metrics
   */
  async analyticsWebVitals(params: {
    projectName: string;
    environment?: string;
    period?: '1h' | '24h' | '7d' | '30d';
  }): Promise<ApiResponse> {
    return this.call('analytics_webvitals', params);
  }
}
