# 🎯 /cb - CodeB Agent Commands for Claude Code

## Overview

`/cb` is the CodeB Agent command system for Claude Code, similar to SuperClaude's `/sc` command.

## Command Structure

```
/cb [command] [options]
```

## Available Commands

### 🔍 /cb analyze
Run 49-agent comprehensive analysis on your project.

**Usage:**
```
/cb analyze
/cb analyze --depth deep
/cb analyze --focus frontend
```

**What it does:**
- Activates 49 specialized agents in 7 batches
- Scans entire codebase for issues
- Generates detailed report
- Saves results to SQLite

### ⚡ /cb optimize
Run 5-wave optimization to fix identified issues.

**Usage:**
```
/cb optimize
/cb optimize --waves 3
/cb optimize --target deps
```

**Options:**
- `--waves [1-5]`: Number of optimization waves
- `--target [all|deps|frontend|backend|docker]`: Optimization target

### 🧹 /cb cleanup
Clean up duplicate dependencies and code.

**Usage:**
```
/cb cleanup deps
/cb cleanup code
/cb cleanup all
```

### 🎨 /cb pattern
Extract or apply reusable patterns.

**Usage:**
```
/cb pattern extract
/cb pattern apply --from templates/saas
```

### 📊 /cb monitor
Start real-time monitoring of code changes.

**Usage:**
```
/cb monitor
/cb monitor --interval 5
```

### 🎯 /cb delegate
Delegate specific tasks to agent hierarchy.

**Usage:**
```
/cb delegate "implement user authentication"
/cb delegate "optimize database queries" --priority high
```

### 📋 /cb status
Check CodeB Agent system status.

**Usage:**
```
/cb status
```

### ❓ /cb help
Show help and available commands.

**Usage:**
```
/cb help
/cb help analyze
```

## Quick Examples

### Example 1: Full Project Analysis
```
/cb analyze
```

**Output:**
```
🚀 CodeB Agent Analysis Starting...

👑 Phase 1: Orchestrator Planning
  Found 247 source files

🎯 Phase 2: Domain Leads (Batch 1/7)
  ✓ Frontend Lead: 12 issues
  ✓ Backend Lead: 15 issues
  ✓ Infrastructure Lead: 8 issues
  ✓ Quality Lead: 23 issues

🔧 Phase 3: Specialists (Batch 2-3/7)
  ✓ 11 Specialists completed

⚙️ Phase 4: Workers (Batch 4-7/7)
  ✓ 33 Workers completed

📊 Results:
  • Total Issues: 121
  • Code Reuse: 35% (can be 87%)
  • Dependencies: 150 (can be 96)
  • Docker Size: 2.3GB (can be 387MB)

💾 Report saved to .codeb-checkpoint/analysis-report.md
```

### Example 2: Quick Dependency Cleanup
```
/cb cleanup deps
```

**Output:**
```
🧹 CodeB Cleanup - Dependencies

Analyzing package.json...
  • Found 23 duplicate dependencies
  • Found 31 unused packages
  • Total size: 847MB

Removing duplicates...
  ✓ Removed: lodash (duplicate of lodash-es)
  ✓ Removed: moment (replaced with date-fns)
  ✓ Removed: 21 more...

Results:
  • Dependencies: 150 → 96 (-36%)
  • Size: 847MB → 512MB (-40%)
  • Install time: 3x faster

✅ Cleanup complete!
```

### Example 3: Pattern Extraction
```
/cb pattern extract
```

**Output:**
```
🎨 CodeB Pattern Extraction

Analyzing codebase for patterns...
  • Scanning React components...
  • Analyzing API endpoints...
  • Checking database queries...

Patterns Found:
  📦 Components (12)
    • AuthForm pattern
    • DataTable pattern
    • Modal pattern
    ...

  🔌 API Patterns (8)
    • CRUD endpoint pattern
    • Auth middleware pattern
    • Error handling pattern
    ...

  💾 Database Patterns (5)
    • Query builder pattern
    • Migration pattern
    • Seed pattern
    ...

✅ 25 patterns extracted to .codeb-checkpoint/patterns/
```

## Integration with Claude Code

The `/cb` commands integrate directly with Claude Code's:
- **Task Tool**: For sub-agent delegation
- **Read/Write/Edit**: For file operations
- **Bash**: For system commands
- **TodoWrite**: For task tracking

## Batch Processing

Due to Claude Code limitations (max 10 parallel agents), the 49 agents run in 7 batches:

| Batch | Agents | Count |
|-------|--------|-------|
| 1 | Domain Leads | 4 |
| 2 | Specialists 1-10 | 10 |
| 3 | Specialist 11 | 1 |
| 4 | Workers 1-10 | 10 |
| 5 | Workers 11-20 | 10 |
| 6 | Workers 21-30 | 10 |
| 7 | Workers 31-33 | 3 |
| **Total** | | **49** |

## Comparison with Other Commands

| Feature | /cb (CodeB) | /sc (SuperClaude) | @codeb- (CLI) |
|---------|------------|------------------|--------------|
| **Context** | Claude Code | Claude Code | Terminal |
| **Agents** | 49 agents | N/A | 49 agents |
| **Batching** | Automatic | N/A | Automatic |
| **Persistence** | SQLite | Memory | SQLite |
| **Reports** | Markdown | Inline | Markdown |

## Tips

1. **First Time**: Always run `/cb analyze` first to understand your project
2. **Optimization**: After analysis, run `/cb optimize` to auto-fix issues
3. **Monitoring**: Use `/cb monitor` during development for real-time feedback
4. **Patterns**: Extract patterns regularly with `/cb pattern extract`

## Configuration

Settings are stored in:
- Local: `~/.codeb-agent/config/`
- Global: `/etc/codeb-agent/`
- Project: `.codeb-checkpoint/`

---

© 2024 CodeB Agent - Enterprise Development Automation