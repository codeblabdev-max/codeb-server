# CLAUDE.md - CodeB Server Project Rules

## Critical Rules

### 1. Environment File Protection (MANDATORY)

**NEVER overwrite existing .env files without explicit user permission.**

When running `/we:init`, `we workflow init`, or any initialization command:

1. **Check for existing .env files FIRST**
   - `.env`
   - `.env.local`
   - `.env.development`
   - `.env.production`

2. **If .env files exist:**
   - Show current values to user
   - Ask for confirmation before ANY modification
   - Create `.env.backup.{timestamp}` before changes
   - MERGE new variables, don't replace entire file
   - NEVER change existing DATABASE_URL, REDIS_URL without explicit confirmation

3. **Protected Variables (require explicit confirmation):**
   ```
   DATABASE_URL
   REDIS_URL
   DIRECT_URL
   POSTGRES_*
   DB_*
   ```

4. **Safe to auto-add (if not exists):**
   ```
   NODE_ENV
   PORT
   NEXT_PUBLIC_*
   ```

### 2. Database Connection Rules

- **Local development**: Use localhost/127.0.0.1 with local containers
- **Server deployment**: Use server IP or container network names
- **NEVER mix local and server DB configs in the same .env**

### 3. Workflow Init Behavior

When `we workflow init` runs on existing project:

```
1. Detect existing project (check package.json, .env files)
2. If project exists:
   - Show current configuration
   - Ask: "Project already exists. Update workflow files only? (Y/n)"
   - If Y: Update only workflow files (.github/workflows/, quadlet/)
   - If n: Ask which files to regenerate
3. NEVER auto-regenerate .env files for existing projects
```

### 4. Port Assignment Rules

- Always scan server ports BEFORE assigning
- Use GitOps port ranges:
  - Staging: 3000-3499 (app), 15432-15499 (db), 16379-16399 (redis)
  - Production: 4000-4499 (app), 25432-25499 (db), 26379-26399 (redis)
  - Preview: 5000-5999 (app)
- Auto-adjust on conflict, but SHOW user what changed

## Project Structure

```
codeb-server/
├── cli/                    # /we CLI tool
├── codeb-deploy-system/    # MCP server for deployments
├── infrastructure/         # Terraform configs
├── docs/                   # Documentation
└── scripts/                # Utility scripts
```

## MCP Server

Located at: `/opt/codeb/mcp-server/` on deployment server
Local dev: `./codeb-deploy-system/mcp-server/`

## Common Commands

```bash
# CLI
we workflow init <project>     # Initialize new project
we workflow sync <project>     # Sync files to server
we deploy <project>            # Deploy project

# Development
npm link                       # Link CLI globally (in cli/ directory)
npm run build                  # Build MCP server (in mcp-server/ directory)
```
