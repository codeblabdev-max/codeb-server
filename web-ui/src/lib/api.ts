import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://158.247.203.55:9101";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Types
export interface Project {
  id: string;
  name: string;
  type: "nextjs" | "remix" | "nodejs" | "static";
  gitRepo?: string;
  status: "active" | "inactive" | "deploying";
  environments: Environment[];
  createdAt: string;
  updatedAt: string;
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
  list: async (): Promise<Domain[]> => {
    const { data } = await api.get("/api/domains");
    return data.data || [];
  },

  create: async (domain: Partial<Domain>): Promise<Domain> => {
    const { data } = await api.post("/api/domains", domain);
    return data.data;
  },

  delete: async (domain: string): Promise<void> => {
    await api.delete(`/api/domains/${domain}`);
  },

  checkStatus: async (domain: string) => {
    const { data } = await api.get(`/api/domains/${domain}/status`);
    return data.data;
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
};
