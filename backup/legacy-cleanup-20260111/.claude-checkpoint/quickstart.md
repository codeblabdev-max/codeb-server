# Quick Start Commands

## 1. Start Agent System
```bash
./scripts/init-agent-hierarchy.sh
```

## 2. Load Context
```bash
mcp__contest-continuity__resume_context --latest
```

## 3. Start Monitoring
```bash
./scripts/sub-agent-manager.sh . realtime-monitor
```

## 4. Cleanup Dependencies
```bash
./scripts/sub-agent-manager.sh . cleanup-deps
```

## 5. Extract Patterns
```bash
./scripts/sub-agent-manager.sh . pattern-extract
```

## 6. Full Optimization
```bash
./scripts/sub-agent-manager.sh . full-optimization
```

## 7. Check Agent Status
```bash
curl -X POST http://localhost:3000/mcp/agent-status
```

## 8. Delegate Task
```bash
echo '{"type": "cleanup-dependencies"}' | \
  node mcp-contest-continuity/dist/index.js delegate
```
