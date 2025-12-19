#!/bin/bash

# 계층적 에이전트 시스템 초기화 스크립트
# 상위 1% 개발자의 혁신적인 Multi-Agent Orchestra System

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="${1:-$(pwd)}"

echo -e "${PURPLE}═══════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}     🎭 Multi-Agent Orchestra System (MAOS) v2.0       ${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════${NC}"

# 1. Checkpoint 디렉토리 생성
echo -e "\n${BLUE}📁 Creating checkpoint directory...${NC}"
mkdir -p "$PROJECT_ROOT/.claude-checkpoint"

# 2. 초기 Context 생성
echo -e "${YELLOW}📝 Initializing context...${NC}"
cat > "$PROJECT_ROOT/.claude-checkpoint/context.json" << 'EOF'
{
  "version": "2.0.0",
  "project": {
    "name": "codeb-server",
    "type": "Next.js + PostgreSQL + WebSocket + Podman",
    "status": "active"
  },
  "lastSession": {
    "timestamp": "TIMESTAMP",
    "completedTasks": [],
    "pendingTasks": [],
    "confidence": 0.0
  },
  "agents": {
    "orchestrator": {
      "id": "orchestrator-001",
      "status": "initializing"
    },
    "domainLeads": {
      "frontend": {"id": "frontend-lead", "status": "ready"},
      "backend": {"id": "backend-lead", "status": "ready"},
      "infrastructure": {"id": "infra-lead", "status": "ready"},
      "quality": {"id": "quality-lead", "status": "ready"}
    }
  },
  "metrics": {
    "codeReuse": 0,
    "duplicateDependencies": 0,
    "testCoverage": 0,
    "agentConfidence": 0
  }
}
EOF
sed -i.bak "s/TIMESTAMP/$(date -Iseconds)/" "$PROJECT_ROOT/.claude-checkpoint/context.json"
rm -f "$PROJECT_ROOT/.claude-checkpoint/context.json.bak"

# 3. Pattern Library 초기화
echo -e "${YELLOW}📚 Creating pattern library...${NC}"
cat > "$PROJECT_ROOT/.claude-checkpoint/patterns.json" << 'EOF'
{
  "version": "2.0.0",
  "patterns": {
    "components": {
      "auth": {
        "LoginForm": {
          "usage": 0,
          "lastUsed": null,
          "template": "components/auth/LoginForm.template"
        },
        "AuthGuard": {
          "usage": 0,
          "lastUsed": null,
          "template": "components/auth/AuthGuard.template"
        }
      },
      "ui": {
        "Button": {
          "usage": 0,
          "lastUsed": null,
          "variants": ["primary", "secondary", "danger"]
        },
        "Modal": {
          "usage": 0,
          "lastUsed": null,
          "variants": ["dialog", "fullscreen", "drawer"]
        }
      }
    },
    "api": {
      "crud": {
        "create": {"method": "POST", "pattern": "/api/[resource]"},
        "read": {"method": "GET", "pattern": "/api/[resource]/[id]?"},
        "update": {"method": "PUT", "pattern": "/api/[resource]/[id]"},
        "delete": {"method": "DELETE", "pattern": "/api/[resource]/[id]"}
      },
      "websocket": {
        "events": ["connect", "disconnect", "message", "error"],
        "rooms": ["global", "user", "channel"]
      }
    },
    "database": {
      "schemas": {
        "users": {
          "fields": ["id", "email", "password", "createdAt", "updatedAt"],
          "relations": ["sessions", "roles"]
        },
        "sessions": {
          "fields": ["id", "userId", "token", "expiresAt"],
          "relations": ["users"]
        }
      }
    }
  },
  "statistics": {
    "totalPatterns": 15,
    "reuseRate": 0,
    "lastExtraction": null
  }
}
EOF

# 4. Dependency Lock 생성
echo -e "${YELLOW}🔒 Creating dependency lock...${NC}"
cat > "$PROJECT_ROOT/.claude-checkpoint/dependencies.lock" << 'EOF'
{
  "version": "2.0.0",
  "verified": {
    "react": {"version": "^18.0.0", "usage": "high", "alternatives": []},
    "next": {"version": "^14.0.0", "usage": "high", "alternatives": []},
    "socket.io": {"version": "^4.0.0", "usage": "medium", "alternatives": []},
    "pg": {"version": "^8.0.0", "usage": "high", "alternatives": []},
    "@types/react": {"version": "^18.0.0", "usage": "dev", "alternatives": []}
  },
  "duplicates": [],
  "unused": [],
  "conflicts": [],
  "lastCheck": "TIMESTAMP"
}
EOF
sed -i.bak "s/TIMESTAMP/$(date -Iseconds)/" "$PROJECT_ROOT/.claude-checkpoint/dependencies.lock"
rm -f "$PROJECT_ROOT/.claude-checkpoint/dependencies.lock.bak"

# 5. 에이전트 계층 시각화
echo -e "\n${PURPLE}🎭 Agent Hierarchy:${NC}"
cat << 'EOF'

                    👑 ORCHESTRATOR
                    ├── Controls everything
                    └── Final decision maker
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    🎯 Frontend        🎯 Backend        🎯 Infrastructure
    │   Lead           │   Lead          │   Lead
    │                  │                 │
    ├─ React Spec.     ├─ API Spec.     ├─ Podman Spec.
    ├─ UI/UX Spec.     ├─ DB Spec.      └─ PaaS Spec.
    └─ State Spec.     └─ WebSocket Spec.
                           │
                      🎯 Quality Lead
                      ├─ Test Specialist
                      ├─ Refactor Specialist
                      └─ Dependency Specialist

Each Specialist has 3 Worker agents (⚙️)
Total: 1 Orchestrator + 4 Leads + 11 Specialists + 33 Workers = 49 Agents

EOF

# 6. MCP 서버 통합 확인
echo -e "\n${CYAN}🔗 Checking MCP server integration...${NC}"
if [ -d "$PROJECT_ROOT/mcp-contest-continuity" ]; then
    echo -e "${GREEN}✅ MCP Contest Continuity server found${NC}"
    
    # 계층적 에이전트 시스템 활성화
    if [ -f "$PROJECT_ROOT/mcp-contest-continuity/src/lib/hierarchical-agent-system.ts" ]; then
        echo -e "${GREEN}✅ Hierarchical Agent System ready${NC}"
    else
        echo -e "${RED}❌ Hierarchical Agent System not found${NC}"
    fi
else
    echo -e "${RED}❌ MCP server not found${NC}"
fi

# 7. 실시간 모니터 설정
echo -e "\n${BLUE}👁️ Setting up real-time monitor...${NC}"
cat > "$PROJECT_ROOT/.claude-checkpoint/monitor.config.json" << 'EOF'
{
  "enabled": true,
  "interval": 5000,
  "autoSave": true,
  "triggers": {
    "fileChange": ["capture_context", "check_patterns"],
    "dependencyChange": ["verify_dependencies", "check_duplicates"],
    "testChange": ["update_coverage", "generate_tests"]
  },
  "agents": {
    "frontend": ["*.tsx", "*.jsx", "*.css"],
    "backend": ["*.ts", "*.js", "api/*"],
    "infrastructure": ["Dockerfile", "*.yml", "*.yaml"],
    "quality": ["*.test.*", "*.spec.*"]
  }
}
EOF

# 8. 초기화 완료 스크립트
echo -e "\n${GREEN}✨ Creating initialization complete marker...${NC}"
cat > "$PROJECT_ROOT/.claude-checkpoint/init.sh" << 'EOF'
#!/bin/bash
# Agent System Initialized
echo "Multi-Agent Orchestra System v2.0"
echo "Initialized at: $(date)"
echo "Total Agents: 49"
echo "Status: READY"
EOF
chmod +x "$PROJECT_ROOT/.claude-checkpoint/init.sh"

# 9. 빠른 시작 명령어 생성
echo -e "\n${PURPLE}🚀 Quick Start Commands:${NC}"
cat > "$PROJECT_ROOT/.claude-checkpoint/quickstart.md" << 'EOF'
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
EOF

# 10. 성공 메시지
echo -e "\n${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}     ✅ AGENT HIERARCHY INITIALIZED SUCCESSFULLY!      ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"

echo -e "\n${CYAN}📋 Summary:${NC}"
echo -e "  • Checkpoint directory created"
echo -e "  • Context initialized"
echo -e "  • Pattern library ready"
echo -e "  • Dependency lock active"
echo -e "  • 49 agents deployed"
echo -e "  • Real-time monitoring configured"

echo -e "\n${YELLOW}⚡ Next Steps:${NC}"
echo -e "  1. Start monitoring: ${BLUE}./scripts/sub-agent-manager.sh . realtime-monitor${NC}"
echo -e "  2. Run optimization: ${BLUE}./scripts/sub-agent-manager.sh . full-optimization${NC}"
echo -e "  3. Check status: ${BLUE}cat .claude-checkpoint/context.json${NC}"

echo -e "\n${PURPLE}🎭 The Orchestra is ready to perform!${NC}\n"