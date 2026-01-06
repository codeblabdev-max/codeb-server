import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://158.247.203.55:9101";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ============================================
// v6.0 Blue-Green Slot Types
// ============================================

export type SlotName = "blue" | "green";
export type SlotState = "empty" | "deploying" | "deployed" | "active" | "grace" | "draining";
export type HealthStatus = "unknown" | "healthy" | "unhealthy" | "degraded";

export interface SlotInfo {
  name: SlotName;
  state: SlotState;
  port: number;
  version?: string;
  image?: string;
  deployedAt?: string;
  healthStatus: HealthStatus;
  healthCheckedAt?: string;
  containerName?: string;
  error?: string;
}

export interface SlotRegistry {
  projectName: string;
  environment: "staging" | "production" | "preview";
  activeSlot: SlotName | null;
  blue: SlotInfo;
  green: SlotInfo;
  lastUpdated: string;
  version: string;
}

export interface DeploymentResult {
  success: boolean;
  slot: SlotName;
  port: number;
  previewUrl: string;
  version: string;
  duration: number;
  containerName: string;
}

export interface PromoteResult {
  success: boolean;
  previousSlot: SlotName;
  newActiveSlot: SlotName;
  previousVersion?: string;
  newVersion?: string;
  gracePeriodEnds?: string;
}

// ============================================
// v6.0 Migration Types
// ============================================

export type LegacySystemType = "workflow-v1" | "ssot-v1" | "quadlet-v6" | "unknown";

export interface LegacyProject {
  name: string;
  environments: string[];
  ports: Record<string, number>;
  containers: string[];
  volumes: string[];
  domains: Record<string, string>;
}

export interface LegacyDetectionResult {
  systemType: LegacySystemType;
  version: string;
  projects: LegacyProject[];
  containers: Array<{
    name: string;
    status: string;
    port?: number;
    image?: string;
  }>;
  hasWorkflowFiles: boolean;
  hasSSOTRegistry: boolean;
  hasQuadletFiles: boolean;
  warnings: string[];
}

export interface MigrationPlan {
  id: string;
  source: LegacySystemType;
  target: "quadlet-v6";
  projects: string[];
  estimatedDowntime: number;
  steps: string[];
  createdAt: string;
}

export interface MigrationResult {
  success: boolean;
  projectsMigrated: string[];
  duration: number;
  warnings: string[];
  rollbackAvailable: boolean;
  rollbackExpiresAt?: string;
}

// ============================================
// Legacy Types (Compatibility)
// ============================================

export interface Project {
  id: string;
  name: string;
  type: "nextjs" | "remix" | "nodejs" | "static";
  gitRepo?: string;
  status: "active" | "inactive" | "deploying";
  environments: Environment[];
  createdAt: string;
  updatedAt: string;
  // v6.0 additions
  slots?: Record<string, SlotRegistry>;
}

export interface Environment {
  name: "staging" | "production" | "preview";
  status: "running" | "stopped" | "deploying" | "failed";
  ports: {
    app?: number;
    db?: number;
    redis?: number;
  };
  domain?: string;
  lastDeployedAt?: string;
  // v6.0 additions
  activeSlot?: SlotName;
  bluePort?: number;
  greenPort?: number;
}

export interface PortAllocation {
  port: number;
  projectId: string;
  projectName: string;
  service: "app" | "db" | "redis";
  environment: "staging" | "production" | "preview";
  status: "active" | "reserved";
}

export interface Domain {
  domain: string;
  projectId: string;
  projectName: string;
  environment: string;
  targetPort: number;
  sslEnabled: boolean;
  status: "active" | "pending" | "error";
}

export interface ServerHealth {
  status: "healthy" | "warning" | "critical";
  disk: {
    total: string;
    used: string;
    percentage: number;
  };
  memory: {
    total: string;
    used: string;
    percentage: number;
  };
  containers: {
    total: number;
    running: number;
    stopped: number;
  };
  lastChecked: string;
}

// API Functions
export const projectApi = {
  list: async (): Promise<Project[]> => {
    const { data } = await api.get("/api/projects");
    return data.data || [];
  },

  get: async (name: string): Promise<Project> => {
    const { data } = await api.get(`/api/projects/${name}`);
    return data.data;
  },

  create: async (project: Partial<Project>): Promise<Project> => {
    const { data } = await api.post("/api/projects", project);
    return data.data;
  },

  delete: async (name: string): Promise<void> => {
    await api.delete(`/api/projects/${name}?force=true`);
  },

  deploy: async (projectName: string, environment: string): Promise<void> => {
    await api.post("/api/deploy", { projectName, environment });
  },
};

export const portApi = {
  list: async (): Promise<PortAllocation[]> => {
    const { data } = await api.get("/api/ports");
    return data.data || [];
  },

  summary: async () => {
    const { data } = await api.get("/api/ports/summary");
    return data.data;
  },
};

export const domainApi = {
  list: async (projectName?: string): Promise<Domain[]> => {
    if (projectName) {
      const { data } = await api.post("/api/tool", {
        tool: "domain_list",
        params: { projectName },
      });
      return data.data || [];
    }
    const { data } = await api.get("/api/domains");
    return data.data || [];
  },

  create: async (domain: Partial<Domain>): Promise<Domain> => {
    const { data } = await api.post("/api/domains", domain);
    return data.data;
  },

  delete: async (domain: string, projectName?: string): Promise<void> => {
    if (projectName) {
      await api.post("/api/tool", {
        tool: "domain_delete",
        params: { domain, projectName },
      });
      return;
    }
    await api.delete(`/api/domains/${domain}`);
  },

  checkStatus: async (domain: string) => {
    const { data } = await api.get(`/api/domains/${domain}/status`);
    return data.data;
  },

  // v6.0: Setup domain with auto SSL
  setup: async (params: {
    projectName: string;
    domain: string;
    environment: string;
    ssl?: boolean;
  }) => {
    const { data } = await api.post("/api/tool", {
      tool: "domain_setup",
      params: { ...params, ssl: params.ssl ?? true },
    });
    return data;
  },

  // v6.0: Verify DNS configuration
  verify: async (domain: string) => {
    const { data } = await api.post("/api/tool", {
      tool: "domain_verify",
      params: { domain },
    });
    return data;
  },

  // v6.0: Get SSL certificate status
  sslStatus: async (domain: string) => {
    const { data } = await api.post("/api/tool", {
      tool: "ssl_status",
      params: { domain },
    });
    return data;
  },
};

export const healthApi = {
  check: async (): Promise<ServerHealth> => {
    const { data } = await api.get("/api/health");
    return data.data;
  },

  full: async () => {
    const { data } = await api.get("/api/health/full");
    return data.data;
  },
};

export const envApi = {
  get: async (project: string, environment: string) => {
    const { data } = await api.get(`/api/env/${project}/${environment}`);
    return data.data;
  },

  set: async (project: string, environment: string, variables: Record<string, string>) => {
    const { data } = await api.put(`/api/env/${project}/${environment}`, { variables });
    return data.data;
  },

  // v6.0: ENV scan for migration status
  scan: async (project?: string) => {
    const url = project ? `/api/tool` : `/api/tool`;
    const { data } = await api.post(url, {
      tool: "env_scan",
      params: { projectName: project },
    });
    return data.data;
  },

  // v6.0: ENV restore from backup
  restore: async (project: string, environment: string, version: "master" | "current" | string) => {
    const { data } = await api.post("/api/tool", {
      tool: "env_restore",
      params: { projectName: project, environment, version },
    });
    return data.data;
  },

  // v6.0: Get backup list
  backups: async (project: string, environment: string) => {
    const { data } = await api.post("/api/tool", {
      tool: "env_backup_list",
      params: { projectName: project, environment },
    });
    return data.data;
  },
};

// ============================================
// v6.0 Slot API
// ============================================

export const slotApi = {
  // Get slot status for a project/environment
  status: async (project: string, environment?: string): Promise<SlotRegistry | SlotRegistry[]> => {
    const { data } = await api.post("/api/tool", {
      tool: "slot_status",
      params: { projectName: project, environment },
    });
    return data.data;
  },

  // List all slots across all projects
  list: async (): Promise<SlotRegistry[]> => {
    const { data } = await api.post("/api/tool", {
      tool: "slot_list",
      params: {},
    });
    return data.data || [];
  },

  // Deploy to inactive slot (returns preview URL)
  deploy: async (
    project: string,
    environment: string,
    version: string,
    image?: string
  ): Promise<DeploymentResult> => {
    const { data } = await api.post("/api/tool", {
      tool: "deploy",
      params: { projectName: project, environment, version, image },
    });
    return data.data;
  },

  // Promote deployed slot to active (zero-downtime switch)
  promote: async (project: string, environment: string): Promise<PromoteResult> => {
    const { data } = await api.post("/api/tool", {
      tool: "promote",
      params: { projectName: project, environment },
    });
    return data.data;
  },

  // Rollback to previous active slot
  rollback: async (project: string, environment: string, reason?: string): Promise<PromoteResult> => {
    const { data } = await api.post("/api/tool", {
      tool: "rollback",
      params: { projectName: project, environment, reason },
    });
    return data.data;
  },

  // Cleanup grace-period expired slots
  cleanup: async (project?: string): Promise<{ cleaned: number; slots: string[] }> => {
    const { data } = await api.post("/api/tool", {
      tool: "slot_cleanup",
      params: { projectName: project },
    });
    return data.data;
  },
};

// ============================================
// v6.0 Migration API
// ============================================

export const migrateApi = {
  // Detect legacy system type
  detect: async (verbose?: boolean): Promise<LegacyDetectionResult> => {
    const { data } = await api.post("/api/tool", {
      tool: "migrate_detect",
      params: { verbose },
    });
    return data.data;
  },

  // Create migration plan
  plan: async (projects?: string[]): Promise<MigrationPlan> => {
    const { data } = await api.post("/api/tool", {
      tool: "migrate_plan",
      params: { projects },
    });
    return data.data;
  },

  // Execute migration (with confirmation)
  execute: async (planId: string, confirm?: boolean): Promise<MigrationResult> => {
    const { data } = await api.post("/api/tool", {
      tool: "migrate_execute",
      params: { id: planId, yes: confirm },
    });
    return data.data;
  },

  // Safe migration (zero-downtime, register only)
  safe: async (projects?: string[]): Promise<MigrationResult> => {
    const { data } = await api.post("/api/tool", {
      tool: "migrate_safe",
      params: { projects },
    });
    return data.data;
  },

  // Rollback migration
  rollback: async (planId: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.post("/api/tool", {
      tool: "migrate_rollback",
      params: { id: planId },
    });
    return data.data;
  },

  // Get migration status
  status: async (planId?: string) => {
    const { data } = await api.post("/api/tool", {
      tool: "migrate_status",
      params: { id: planId },
    });
    return data.data;
  },

  // Generate GitHub Actions workflow
  generateWorkflow: async (project: string): Promise<{ workflow: string; path: string }> => {
    const { data } = await api.post("/api/tool", {
      tool: "migrate_generate_workflow",
      params: { projectName: project },
    });
    return data.data;
  },
};

// ============================================
// v6.0 Registry API (SSOT replacement)
// ============================================

export const registryApi = {
  // Get registry status
  status: async () => {
    const { data } = await api.post("/api/tool", {
      tool: "registry_status",
      params: {},
    });
    return data.data;
  },

  // Sync registry with actual state
  sync: async () => {
    const { data } = await api.post("/api/tool", {
      tool: "registry_sync",
      params: {},
    });
    return data.data;
  },
};

// ============================================
// v6.0 Real-time Events (for Centrifugo)
// ============================================

export interface RealtimeEvent {
  type: "deployment" | "promote" | "rollback" | "health" | "error";
  project: string;
  environment: string;
  slot?: SlotName;
  data: Record<string, unknown>;
  timestamp: string;
}

export const realtimeApi = {
  // Get connection token for Centrifugo
  getToken: async (): Promise<{ token: string; url: string }> => {
    const { data } = await api.get("/api/realtime/token");
    return data.data;
  },

  // Subscribe to project events
  getChannels: (project?: string): string[] => {
    if (project) {
      return [
        `deployment:${project}`,
        `health:${project}`,
        `slot:${project}`,
      ];
    }
    return ["deployment:all", "health:all", "slot:all"];
  },
};
