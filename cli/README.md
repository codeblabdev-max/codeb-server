# CodeB Unified CLI

> Single entry point for all CodeB operations - Deploy, Analyze, Optimize with 7-Agent System

## Installation

```bash
# From CLI directory
cd /Users/admin/new_project/codeb-server/cli
npm install
npm link

# Verify installation
codeb --version
```

## Commands

### 🚀 Deploy

Deploy projects to staging, production, or preview environments with MCP integration.

```bash
# Deploy to staging
codeb deploy myapp --environment staging

# Deploy to production with no cache
codeb deploy myapp --environment production --no-cache

# Dry run (show plan without executing)
codeb deploy myapp --dry-run

# Force deployment (skip warnings)
codeb deploy myapp --force
```

**Options:**
- `-e, --environment <env>` - Target environment (staging|production|preview)
- `-f, --file <path>` - Docker compose file path (default: docker-compose.yml)
- `--no-cache` - Build without cache
- `--force` - Force deployment even with warnings
- `--dry-run` - Show deployment plan without executing

### 🔍 Analyze

Comprehensive project analysis using the 7-Agent system.

```bash
# Standard analysis
codeb analyze

# Deep security analysis
codeb analyze --depth deep --focus security

# Frontend-specific analysis
codeb analyze --agent frontend --output json

# Save analysis report
codeb analyze --depth normal --save report.md
```

**Options:**
- `-d, --depth <level>` - Analysis depth (shallow|normal|deep)
- `-f, --focus <area>` - Focus area (security|performance|quality|all)
- `-a, --agent <type>` - Specific agent (master|api|frontend|db|e2e|admin)
- `-o, --output <format>` - Output format (text|json|markdown)
- `--save <path>` - Save analysis report to file

**Agents:**
- `master` - 👑 Master Orchestrator (project-wide coordination)
- `api` - 🔖 API Contract Guardian (API design)
- `frontend` - 🎨 Frontend Specialist (UI/UX development)
- `db` - 💾 Database Schema Architect (database design)
- `e2e` - 🧪 E2E Test Strategist (comprehensive testing)
- `admin` - 🛡️ Admin Panel Builder (admin interfaces)

### ⚡ Optimize

Performance and resource optimization.

```bash
# Optimize everything
codeb optimize --target all

# Aggressive bundle optimization
codeb optimize --target bundle --aggressive

# Safe mode optimization
codeb optimize --safe-mode

# Dry run
codeb optimize --dry-run
```

**Options:**
- `-t, --target <type>` - Optimization target (bundle|memory|database|all)
- `--aggressive` - Use aggressive optimization strategies
- `--safe-mode` - Conservative optimization with validation
- `--dry-run` - Show optimization plan without executing

### 💚 Health

System health checks via MCP full_health_check.

```bash
# Basic health check
codeb health

# Verbose output
codeb health --verbose

# JSON output
codeb health --json

# Continuous monitoring
codeb health --watch --interval 30
```

**Options:**
- `-v, --verbose` - Show detailed health information
- `-j, --json` - Output in JSON format
- `-w, --watch` - Continuous health monitoring
- `-i, --interval <seconds>` - Watch interval in seconds (default: 30)

### 🌐 Domain

Domain management with SSL support.

```bash
# Setup domain with SSL
codeb domain setup example.com --ssl --www

# Remove domain
codeb domain remove example.com

# Check domain status
codeb domain check example.com

# List all domains
codeb domain list
```

**Actions:**
- `setup` - Configure new domain
- `remove` - Remove domain configuration
- `check` - Check domain status
- `list` - List all configured domains

**Options:**
- `-p, --project <name>` - Project name
- `--ssl` - Enable SSL/TLS
- `--www` - Include www subdomain
- `--force` - Force operation without confirmation

### 🤖 Agent

Direct invocation of 7-Agent system.

```bash
# Invoke frontend agent
codeb agent frontend "Create responsive navbar component"

# Invoke all agents sequentially
codeb agent all "Analyze entire application"

# With context
codeb agent api "Design REST API" --context '{"framework":"express"}'

# Async execution
codeb agent e2e "Create test suite" --async

# Save output
codeb agent db "Optimize schema" --save schema-report.json
```

**Options:**
- `-c, --context <json>` - Additional context as JSON
- `-o, --output <format>` - Output format (text|json)
- `--save <path>` - Save agent output to file
- `--async` - Run agent asynchronously

### 📊 Monitor

Real-time system monitoring with metrics.

```bash
# Monitor CPU and memory
codeb monitor --metrics cpu,memory

# Monitor with custom threshold
codeb monitor --metrics cpu,memory,disk --threshold 90

# Monitor for 30 minutes
codeb monitor --interval 5 --duration 30

# Continuous monitoring
codeb monitor --duration 0
```

**Options:**
- `-m, --metrics <types>` - Metrics to monitor (cpu,memory,network,disk)
- `-i, --interval <seconds>` - Update interval (default: 5)
- `-d, --duration <minutes>` - Duration in minutes (0 = infinite)
- `-t, --threshold <value>` - Alert threshold percentage (default: 80)

### ⏪ Rollback

Safe deployment rollback.

```bash
# List available versions
codeb rollback myapp --list

# Rollback to previous version
codeb rollback myapp --environment production

# Rollback to specific version
codeb rollback myapp --version v1.2.3

# Dry run
codeb rollback myapp --dry-run
```

**Options:**
- `-e, --environment <env>` - Target environment
- `-v, --version <tag>` - Specific version to rollback to
- `--list` - List available versions
- `--force` - Force rollback without confirmation
- `--dry-run` - Show rollback plan without executing

## Architecture

### 7-Agent System

The CLI integrates with CodeB's 7-Agent system for specialized tasks:

1. **Master Orchestrator** (`master-orchestrator`)
   - Project-wide orchestration
   - Cross-agent coordination
   - Quality validation

2. **API Contract Guardian** (`api-contract-guardian`)
   - API design and contracts
   - OpenAPI specification
   - Version management

3. **Frontend Specialist** (`frontend-specialist`)
   - Desktop and mobile UI
   - React/Next.js expertise
   - Responsive design

4. **Database Schema Architect** (`db-schema-architect`)
   - Schema design
   - PostgreSQL/MongoDB/Redis
   - Optimization

5. **E2E Test Strategist** (`e2e-test-strategist`)
   - Playwright testing
   - Test automation
   - Coverage strategies

6. **Admin Panel Builder** (`admin-panel-builder`)
   - Dashboard development
   - Role management
   - Data visualization

### MCP Integration

The CLI communicates with MCP servers:

- **codeb-deploy**: Deployment operations
- **full_health_check**: System health monitoring
- Additional MCP tools as needed

### Configuration

CLI reads configuration from `.mcp.json`:

```json
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["path/to/mcp-server/index.js"],
      "env": {
        "CODEB_SERVER_HOST": "your-server",
        "CODEB_SERVER_USER": "root",
        "CODEB_SSH_KEY_PATH": "/path/to/key"
      }
    }
  }
}
```

## Examples

### Complete Deployment Workflow

```bash
# 1. Analyze project
codeb analyze --depth deep --focus all

# 2. Optimize before deployment
codeb optimize --target all

# 3. Deploy to staging
codeb deploy myapp --environment staging

# 4. Check health
codeb health --verbose

# 5. Setup domain
codeb domain setup myapp.com --ssl --www

# 6. Monitor performance
codeb monitor --metrics cpu,memory --duration 30
```

### Development Workflow

```bash
# Frontend development
codeb agent frontend "Create user dashboard" --save dashboard-spec.json

# API design
codeb agent api "Design REST API for users"

# Database optimization
codeb agent db "Optimize user queries"

# E2E testing
codeb agent e2e "Create test suite for user flows"

# Admin panel
codeb agent admin "Create user management dashboard"
```

### Troubleshooting

```bash
# Check system health
codeb health --verbose

# Analyze issues
codeb analyze --depth deep --focus all

# Check deployment logs
codeb deploy myapp --dry-run

# Rollback if needed
codeb rollback myapp --list
codeb rollback myapp --version v1.0.0
```

## Best Practices

1. **Always run analysis before deployment**
   ```bash
   codeb analyze --depth normal --focus security
   ```

2. **Use dry-run for validation**
   ```bash
   codeb deploy myapp --dry-run
   codeb optimize --dry-run
   ```

3. **Monitor after deployment**
   ```bash
   codeb health --watch --interval 30
   codeb monitor --metrics cpu,memory,disk
   ```

4. **Save analysis reports**
   ```bash
   codeb analyze --save analysis-$(date +%Y%m%d).md
   ```

5. **Use appropriate depth levels**
   - `shallow`: Quick checks
   - `normal`: Standard analysis
   - `deep`: Comprehensive review

## Development

```bash
# Install dependencies
npm install

# Link for development
npm link

# Test commands
codeb --help
codeb deploy --help
codeb analyze --help
```

## Support

- Documentation: https://codeb.io/docs/cli
- Issues: https://github.com/codeb/codeb-server/issues
- Deployment Rules: See DEPLOYMENT_RULES.md

## License

MIT © CodeB Team
