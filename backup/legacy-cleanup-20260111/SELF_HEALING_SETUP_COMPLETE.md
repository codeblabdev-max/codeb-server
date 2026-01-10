# CodeB Self-Healing CI/CD Setup Complete ✅

## Files Created

### 1. Scripts

#### `/scripts/setup-self-hosted-runner.sh` ✅
Complete GitHub Actions self-hosted runner installation script with:
- Node.js 20 installation
- GitHub CLI setup
- Claude Code CLI installation
- Runner user creation
- systemd service configuration
- Automated verification

#### `/scripts/setup-claude-code-max.sh` ✅
Claude Code Max configuration script with:
- API key authentication
- MCP server connection
- Environment variables setup
- Runner hooks creation
- Connection testing

#### `/scripts/make-executable.sh` ✅
Helper script to make all scripts executable

### 2. Workflows

#### `/.github/workflows/self-healing-complete.yml` ✅
Enhanced CI/CD workflow with:
- **Job 1**: Build & Test with error classification
- **Job 2**: Claude Code auto-fix with validation
- **Job 3**: Preview environments for PRs
- **Job 4**: Docker image build and push
- **Job 5**: Production deployment
- **Job 6**: Metrics collection

**Features**:
- Error type classification (TypeScript, ESLint, Build, Test, Import)
- Fix complexity assessment (Low, Medium, High)
- No-Deletion Principle validation
- Forbidden pattern detection
- Slack notifications
- Success rate metrics

### 3. Documentation

#### `/docs/SELF_HEALING_GUIDE.md` ✅
Comprehensive 500+ line guide including:
- Complete architecture overview
- No-Deletion Principle explanation
- Step-by-step setup instructions
- Configuration reference
- Usage examples
- Monitoring & metrics
- Troubleshooting guide
- Best practices
- FAQ section

## Quick Start

### Step 1: Make Scripts Executable

```bash
chmod +x scripts/make-executable.sh
./scripts/make-executable.sh
```

### Step 2: Install Self-Hosted Runner

```bash
# Set required environment variables
export GITHUB_TOKEN="ghp_YOUR_GITHUB_TOKEN"
export GITHUB_REPO="owner/repository"  # or GITHUB_ORG="organization"

# Run installation
sudo -E ./scripts/setup-self-hosted-runner.sh
```

### Step 3: Configure Claude Code Max

```bash
# Set Claude API key
export CLAUDE_API_KEY="sk-ant-YOUR_CLAUDE_KEY"

# Optional: Set MCP server URL
export MCP_SERVER_URL="http://localhost:3100"

# Run configuration
sudo -E ./scripts/setup-claude-code-max.sh
```

### Step 4: Configure GitHub Secrets (Optional)

Add to repository secrets:
- `SLACK_WEBHOOK_URL`: For Slack notifications

### Step 5: Test the Setup

```bash
# Push a test commit
git add .
git commit -m "test: trigger self-healing CI"
git push origin main

# Monitor runner
journalctl -u actions.runner.* -f
```

## System Requirements

### Server Requirements
- **OS**: Ubuntu 20.04+ (or Debian-based)
- **RAM**: 4GB minimum, 8GB recommended
- **CPU**: 2 cores minimum, 4 cores recommended
- **Disk**: 20GB minimum for runner workspace

### Required Accounts
- **GitHub**: Repository or organization with Actions enabled
- **Anthropic**: Claude API account with Code Max subscription ($200/month)
- **Slack**: Webhook for notifications (optional)

## Cost Breakdown

| Service | Cost | Notes |
|---------|------|-------|
| Claude Code Max | $200/month | Unlimited tokens |
| Self-Hosted Runner | Variable | Your server costs |
| GitHub Actions | Free | For public repos |
| Slack | Free | Basic plan sufficient |

**Total**: ~$200/month + infrastructure costs

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                       │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  .github/workflows/self-healing-complete.yml           │    │
│  └────────────────────┬───────────────────────────────────┘    │
│                       │ Triggers on push/PR                     │
└───────────────────────┼─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Self-Hosted Runner (codeb-runner)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GitHub Actions Runner Service                           │  │
│  │  - Labels: self-hosted, codeb, claude-code              │  │
│  │  - Work Directory: /opt/codeb/actions-runner/_work      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Claude Code CLI                                          │  │
│  │  - API Key: ~/.claude/auth.json                          │  │
│  │  - Model: claude-sonnet-4                                │  │
│  │  - Max Tokens: Unlimited                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MCP Server Connection                                    │  │
│  │  - URL: http://localhost:3100                            │  │
│  │  - Tools: getBuildErrors, validateFix, autoFixBuildLoop  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Podman Container Runtime                                 │  │
│  │  - Preview Environments: pr-{number}.preview.codeb.dev   │  │
│  │  - Production Deployments                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Workflow Execution Flow

### 1. Build & Test Phase
```
Push to GitHub
    ↓
Checkout code
    ↓
Install dependencies
    ↓
┌─────────────────┐
│  Type Check     │ → typecheck.log
│  Lint           │ → lint.log
│  Build          │ → build.log
│  Test           │ → test.log
└─────────────────┘
    ↓
Capture & Classify Errors
    ↓
Upload Error Logs
```

### 2. Auto-Fix Phase (if errors detected)
```
Decode Error Logs
    ↓
Create Fix Prompt
    ↓
┌─────────────────────────────────┐
│  Claude Code CLI Execution      │
│  - Read error files             │
│  - Analyze issues               │
│  - Generate fixes               │
│  - Apply changes                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  Validation Gates               │
│  1. Deletion Ratio Check        │
│  2. Forbidden Pattern Scan      │
│  3. Build Verification          │
└─────────────────────────────────┘
    ↓
Commit & Push Fix
    ↓
Notify Slack
```

### 3. Deploy Phase
```
Build Docker Image
    ↓
Push to GitHub Container Registry
    ↓
Pull on Production Server
    ↓
Deploy with Podman
    ↓
Health Check
    ↓
Notify Success
```

## No-Deletion Principle

### Core Rule
**"Never delete code to make errors disappear"**

### Validation Checks
1. **Deletion Ratio**: Additions must be ≥ Deletions
2. **Forbidden Patterns**: No suppression comments or type erasure
3. **Build Success**: Full test suite must pass

### Examples

#### ❌ Forbidden
```typescript
// @ts-ignore - Suppressing error
const data: any = response; // Type erasure
test.skip('broken test', () => {}); // Test skip
```

#### ✅ Allowed
```typescript
interface ResponseData {
  id: number;
  name: string;
}
const data: ResponseData = response; // Proper typing

// Fix the test instead of skipping
test('working test', () => {
  expect(result).toBe(expectedValue);
});
```

## Monitoring

### Runner Status
```bash
# Check runner service
systemctl status actions.runner.*

# View logs
journalctl -u actions.runner.* -f

# Check hooks
tail -f /var/log/codeb/runner-hooks.log
```

### Workflow Metrics
- Total workflow runs
- Successful auto-fixes
- Success rate percentage
- Average fix attempts
- Error type distribution

### MCP Server Health
```bash
curl http://localhost:3100/health
```

## Troubleshooting

### Common Issues

1. **Runner Not Connecting**
   ```bash
   sudo systemctl restart actions.runner.*
   journalctl -u actions.runner.* -n 100
   ```

2. **Claude CLI Fails**
   ```bash
   sudo -u github-runner claude --version
   cat /home/github-runner/.env | grep CLAUDE_API_KEY
   ```

3. **Fix Validation Fails**
   - Review `claude_output.log` in artifacts
   - Check forbidden patterns
   - Manual fix may be required

## Next Steps

1. **Monitor First Runs**: Watch the first few workflow executions
2. **Tune Prompts**: Adjust fix prompts based on project needs
3. **Set Up Slack**: Configure webhook for notifications
4. **Enable Metrics**: Track success rates and improvement areas
5. **Scale**: Add more runners for larger projects

## Support

- **Documentation**: `/docs/SELF_HEALING_GUIDE.md`
- **Issues**: GitHub repository issues
- **Logs**: `/var/log/codeb/` and `journalctl`

## Version Information

- **Setup Scripts**: v1.0.0
- **Workflow**: v1.0.0
- **Documentation**: v1.0.0
- **Last Updated**: 2024-12-09

---

## Summary

✅ **All components successfully created**:
- 2 setup scripts with full automation
- 1 enhanced CI/CD workflow with 6 jobs
- 1 comprehensive 500+ line documentation guide
- Helper scripts for easy execution

🚀 **Ready to deploy**:
- Run setup scripts in sequence
- Test with a push to main branch
- Monitor self-healing in action

💡 **Key Features**:
- Automatic error detection and classification
- AI-powered fixes with Claude Code Max
- No-Deletion Principle enforcement
- Preview environments for PRs
- Slack notifications
- Comprehensive metrics tracking

**The CodeB Self-Healing CI/CD system is 100% complete and ready for deployment! 🎉**
