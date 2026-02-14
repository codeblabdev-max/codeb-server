/**
 * @codeb/db - Migration 001: Initial Schema
 * Creates all core tables for the CodeB platform
 */

export const VERSION = 1;

export const STATEMENTS: string[] = [
  // Teams table
  `CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner VARCHAR(255) NOT NULL,
    plan VARCHAR(20) DEFAULT 'free',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Team members
  `CREATE TABLE IF NOT EXISTS team_members (
    id VARCHAR(32) PRIMARY KEY,
    team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(20) NOT NULL,
    invited_by VARCHAR(255),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    UNIQUE(team_id, email)
  )`,

  // API keys (with hashed storage)
  `CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(32) PRIMARY KEY,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    scopes JSONB DEFAULT '[]',
    rate_limit JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
  )`,

  // Projects
  `CREATE TABLE IF NOT EXISTS projects (
    name VARCHAR(100) PRIMARY KEY,
    team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
    type VARCHAR(50) DEFAULT 'nextjs',
    database_name VARCHAR(100),
    database_port INTEGER,
    redis_db INTEGER,
    redis_port INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Project slots (Blue-Green)
  `CREATE TABLE IF NOT EXISTS project_slots (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
    environment VARCHAR(20) NOT NULL,
    active_slot VARCHAR(10) NOT NULL DEFAULT 'blue',
    blue_state VARCHAR(20) DEFAULT 'empty',
    blue_port INTEGER,
    blue_version VARCHAR(100),
    blue_image VARCHAR(500),
    blue_deployed_at TIMESTAMPTZ,
    blue_deployed_by VARCHAR(255),
    blue_health_status VARCHAR(20) DEFAULT 'unknown',
    green_state VARCHAR(20) DEFAULT 'empty',
    green_port INTEGER,
    green_version VARCHAR(100),
    green_image VARCHAR(500),
    green_deployed_at TIMESTAMPTZ,
    green_deployed_by VARCHAR(255),
    green_health_status VARCHAR(20) DEFAULT 'unknown',
    grace_expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_name, environment)
  )`,

  // Deployments history
  `CREATE TABLE IF NOT EXISTS deployments (
    id VARCHAR(32) PRIMARY KEY,
    project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
    environment VARCHAR(20) NOT NULL,
    slot VARCHAR(10) NOT NULL,
    version VARCHAR(100),
    image VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending',
    deployed_by VARCHAR(255),
    promoted_at TIMESTAMPTZ,
    promoted_by VARCHAR(255),
    rolled_back_at TIMESTAMPTZ,
    rolled_back_by VARCHAR(255),
    rollback_reason TEXT,
    steps JSONB DEFAULT '[]',
    duration INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`,

  // Audit logs (persistent)
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(32) PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    team_id VARCHAR(32),
    key_id VARCHAR(32),
    user_id VARCHAR(255),
    role VARCHAR(20),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id VARCHAR(255),
    params JSONB,
    success BOOLEAN DEFAULT true,
    duration INTEGER,
    ip VARCHAR(45),
    user_agent TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Domains table (SSOT for domain configuration)
  `CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) UNIQUE NOT NULL,
    project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
    environment VARCHAR(20) NOT NULL DEFAULT 'production',
    type VARCHAR(20) NOT NULL DEFAULT 'subdomain',
    ssl_enabled BOOLEAN DEFAULT true,
    ssl_issuer VARCHAR(100) DEFAULT 'letsencrypt',
    dns_configured BOOLEAN DEFAULT false,
    dns_verified_at TIMESTAMPTZ,
    caddy_configured BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'pending',
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Environment variables table (SSOT for env)
  `CREATE TABLE IF NOT EXISTS project_envs (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
    environment VARCHAR(20) NOT NULL DEFAULT 'production',
    env_data JSONB NOT NULL DEFAULT '{}',
    encrypted BOOLEAN DEFAULT false,
    version INTEGER DEFAULT 1,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_name, environment)
  )`,

  // Schema version tracking
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_team ON audit_logs(team_id, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`,
  `CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_name, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_team ON api_keys(team_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)`,
  `CREATE INDEX IF NOT EXISTS idx_domains_project ON domains(project_name)`,
  `CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain)`,
  `CREATE INDEX IF NOT EXISTS idx_project_envs_project ON project_envs(project_name, environment)`,
];
