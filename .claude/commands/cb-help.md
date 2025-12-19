---
description: Show CodeB Agent help and available commands
---

# CodeB Agent Help

## Available Commands:

### /cb analyze
Run 49-agent comprehensive analysis on your project
- Executes all agents in 7 batches
- Generates detailed report
- Saves results to SQLite

### /cb optimize
Run 5-wave optimization strategy
- Progressive improvement waves
- Automatic issue fixing
- Performance optimization

### /cb cleanup [deps|code|all]
Clean duplicate dependencies and code
- deps: Remove duplicate/unused packages
- code: Remove duplicate code
- all: Complete cleanup

### /cb pattern [extract|apply]
Manage reusable patterns
- extract: Find and save patterns
- apply: Apply patterns from library

### /cb monitor
Start real-time monitoring
- Watch file changes
- Track dependencies
- Monitor performance

### /cb delegate "task"
Delegate tasks to agent hierarchy
- Automatic agent assignment
- Task distribution
- Progress tracking

### /cb status
Check CodeB Agent status
- System health
- Last analysis results
- Current configuration

## Examples:
```
/cb analyze
/cb optimize --waves 3
/cb cleanup deps
/cb pattern extract
/cb delegate "implement user authentication"
```

## Agent Structure:
- 49 Total Agents
- 7 Execution Batches
- 4 Domain Leads
- 11 Specialists
- 33 Workers

## Results Location:
- Reports: .codeb-checkpoint/analysis-report.md
- Database: .codeb-checkpoint/context.db
- Patterns: .codeb-checkpoint/patterns/