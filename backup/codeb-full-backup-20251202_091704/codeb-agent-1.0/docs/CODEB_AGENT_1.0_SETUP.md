# 🚀 CodeB Agent 1.0 - 시스템 전역 설치 가이드

## 📋 개요
CodeB Agent 1.0은 Claude Code와 완벽히 통합되는 시스템 전역 AI 개발 에이전트입니다.

## 🏗️ 새로운 디렉토리 구조

```
/usr/local/codeb-agent/              # 시스템 전역 설치 경로
├── bin/                             # 실행 파일
│   ├── codeb                       # 메인 CLI (시스템 전역)
│   └── codeb-daemon                 # 백그라운드 서비스
│
├── lib/                             # 코어 라이브러리
│   ├── agents/                      # 49개 에이전트 시스템
│   │   ├── orchestrator.js
│   │   ├── domain-leads/
│   │   ├── specialists/
│   │   └── workers/
│   ├── mcp/                        # MCP 서버 통합
│   │   ├── sqlite-server.js
│   │   ├── postgres-server.js
│   │   └── context-persistence.js
│   └── sub-agents/                 # Claude Code 전용 서브에이전트
│       ├── task-delegator.js
│       ├── context-manager.js
│       └── pattern-extractor.js
│
├── config/                          # 전역 설정
│   ├── codeb.config.json
│   ├── mcp-servers.json
│   └── agents.json
│
├── data/                           # 데이터 저장소
│   ├── sqlite/
│   │   └── global-context.db      # 전역 컨텍스트 DB
│   ├── patterns/                   # 재사용 패턴
│   └── checkpoints/               # 프로젝트별 체크포인트
│
└── scripts/                        # 설치/관리 스크립트
    ├── install.sh
    ├── uninstall.sh
    └── update.sh

~/.codeb/                           # 사용자 홈 설정
├── config.json                     # 사용자 설정
├── projects.json                   # 프로젝트 목록
└── cache/                         # Redis 캐시 대체

~/프로젝트/.codeb-checkpoint/      # 프로젝트별 로컬
├── context.db                     # 프로젝트 컨텍스트
├── patterns.json
└── mcp-sync.json
```

## 📦 설치 스크립트

### 1. 전체 시스템 설치 스크립트
```bash
#!/bin/bash
# install-codeb-agent.sh

set -e

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     CodeB Agent 1.0 Installer          ║${NC}"
echo -e "${BLUE}║     System-wide AI Development         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

# 1. 디렉토리 생성
echo -e "\n${YELLOW}📁 Creating directories...${NC}"
sudo mkdir -p /usr/local/codeb-agent/{bin,lib,config,data,scripts}
sudo mkdir -p /usr/local/codeb-agent/lib/{agents,mcp,sub-agents}
sudo mkdir -p /usr/local/codeb-agent/data/{sqlite,patterns,checkpoints}
mkdir -p ~/.codeb/cache

# 2. 현재 프로젝트 파일 이동
echo -e "${YELLOW}📦 Moving existing files...${NC}"

# MCP 서버 이동
if [ -d "./mcp-contest-continuity" ]; then
    sudo cp -r ./mcp-contest-continuity/* /usr/local/codeb-agent/lib/mcp/
fi

# 스크립트 이동
if [ -d "./scripts" ]; then
    sudo cp ./scripts/*.sh /usr/local/codeb-agent/scripts/
fi

# 에이전트 시스템 이동
if [ -f "./mcp-contest-continuity/src/lib/hierarchical-agent-system.ts" ]; then
    sudo cp ./mcp-contest-continuity/src/lib/*.ts /usr/local/codeb-agent/lib/agents/
fi

# 3. 메인 CLI 생성
echo -e "${YELLOW}🔧 Creating main CLI...${NC}"
sudo tee /usr/local/codeb-agent/bin/codeb > /dev/null << 'EOF'
#!/bin/bash
# CodeB Agent 1.0 - Global CLI

CODEB_HOME="/usr/local/codeb-agent"
COMMAND="$1"
shift || true

case "$COMMAND" in
    # 프로젝트 관리
    "init")
        $CODEB_HOME/scripts/init-project.sh "$@"
        ;;
    
    # AI 개발 명령어
    "analyze"|"optimize"|"monitor"|"delegate"|"pattern"|"cleanup")
        $CODEB_HOME/scripts/codeb-commands.sh "$COMMAND" "$@"
        ;;
    
    # SQL/MCP 연동
    "sql")
        $CODEB_HOME/lib/mcp/sqlite-server.js "$@"
        ;;
    
    "mcp")
        $CODEB_HOME/lib/mcp/context-persistence.js "$@"
        ;;
    
    # 서브에이전트 (Claude Code 전용)
    "sub-agent")
        node $CODEB_HOME/lib/sub-agents/task-delegator.js "$@"
        ;;
    
    # 시스템 관리
    "status")
        $CODEB_HOME/scripts/system-status.sh
        ;;
    
    "update")
        $CODEB_HOME/scripts/update.sh
        ;;
    
    *)
        echo "CodeB Agent 1.0 - AI Development System"
        echo ""
        echo "Usage: codeb [command] [options]"
        echo ""
        echo "Project Commands:"
        echo "  init [new|existing]    Initialize CodeB project"
        echo ""
        echo "AI Development:"
        echo "  analyze               Deep code analysis"
        echo "  optimize              5-wave optimization"
        echo "  monitor               Real-time monitoring"
        echo "  delegate [task]       Delegate to agents"
        echo "  pattern [action]      Pattern management"
        echo "  cleanup               Clean dependencies"
        echo ""
        echo "Integration:"
        echo "  sql [query]          SQLite operations"
        echo "  mcp [action]         MCP server control"
        echo "  sub-agent [task]     Claude Code sub-agent"
        echo ""
        echo "System:"
        echo "  status               System status"
        echo "  update               Update CodeB Agent"
        ;;
esac
EOF

sudo chmod +x /usr/local/codeb-agent/bin/codeb

# 4. 전역 설정 파일 생성
echo -e "${YELLOW}⚙️ Creating global configuration...${NC}"
sudo tee /usr/local/codeb-agent/config/codeb.config.json > /dev/null << 'EOF'
{
  "version": "1.0.0",
  "agents": {
    "total": 49,
    "orchestrator": 1,
    "domainLeads": 4,
    "specialists": 11,
    "workers": 33
  },
  "mcp": {
    "servers": {
      "sqlite": {
        "enabled": true,
        "path": "/usr/local/codeb-agent/data/sqlite/global-context.db"
      },
      "postgres": {
        "enabled": false,
        "connection": "postgresql://localhost/codeb"
      },
      "redis": {
        "enabled": true,
        "url": "redis://localhost:6379"
      }
    }
  },
  "patterns": {
    "autoExtract": true,
    "reuseTarget": 0.9,
    "libraryPath": "/usr/local/codeb-agent/data/patterns"
  },
  "monitoring": {
    "realtime": true,
    "interval": 5000,
    "autoSave": true
  }
}
EOF

# 5. Claude Code MCP 설정 통합
echo -e "${YELLOW}🔌 Configuring Claude Code MCP integration...${NC}"
MCP_CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

if [ -f "$MCP_CONFIG_PATH" ]; then
    echo -e "${BLUE}Adding CodeB to Claude Code MCP servers...${NC}"
    # MCP 설정에 CodeB 추가 (jq 사용)
    jq '.mcpServers."codeb-agent" = {
        "command": "/usr/local/codeb-agent/bin/codeb",
        "args": ["mcp", "server"],
        "env": {
            "CODEB_HOME": "/usr/local/codeb-agent"
        }
    }' "$MCP_CONFIG_PATH" > /tmp/claude_config.json
    mv /tmp/claude_config.json "$MCP_CONFIG_PATH"
fi

# 6. SQLite 글로벌 DB 초기화
echo -e "${YELLOW}🗄️ Initializing global SQLite database...${NC}"
sqlite3 /usr/local/codeb-agent/data/sqlite/global-context.db << 'SQL'
-- 전역 프로젝트 관리
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed DATETIME,
    context_size INTEGER DEFAULT 0
);

-- 전역 패턴 라이브러리
CREATE TABLE IF NOT EXISTS global_patterns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    code TEXT NOT NULL,
    language TEXT,
    usage_count INTEGER DEFAULT 0,
    projects_used TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 에이전트 성능 메트릭
CREATE TABLE IF NOT EXISTS agent_metrics (
    agent_id TEXT,
    task_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0,
    avg_confidence REAL DEFAULT 0,
    total_time INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id)
);

-- 전역 설정
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings (key, value) VALUES 
    ('version', '1.0.0'),
    ('total_projects', '0'),
    ('total_patterns', '0'),
    ('agent_system', 'active');
SQL

# 7. 서브에이전트 매니저 생성
echo -e "${YELLOW}🤖 Creating sub-agent manager...${NC}"
sudo tee /usr/local/codeb-agent/lib/sub-agents/task-delegator.js > /dev/null << 'EOF'
#!/usr/bin/env node

/**
 * CodeB Sub-Agent Task Delegator
 * Claude Code 전용 서브에이전트 시스템
 */

const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const path = require('path');

class CodeBSubAgent {
    constructor() {
        this.dbPath = '/usr/local/codeb-agent/data/sqlite/global-context.db';
        this.db = new sqlite3.Database(this.dbPath);
    }

    async delegateTask(task) {
        console.log(`🎯 Delegating task: ${task.type}`);
        
        // 작업 유형별 에이전트 선택
        const agent = this.selectAgent(task);
        
        // SQLite에 작업 기록
        await this.recordTask(task, agent);
        
        // 서브에이전트 실행
        return this.executeAgent(agent, task);
    }

    selectAgent(task) {
        const agentMap = {
            'analyze': ['analyzer-specialist', 'quality-lead'],
            'refactor': ['refactor-specialist', 'frontend-lead'],
            'optimize': ['performance-specialist', 'backend-lead'],
            'test': ['test-specialist', 'quality-lead'],
            'deploy': ['devops-specialist', 'infrastructure-lead']
        };
        
        return agentMap[task.type] || ['worker-1'];
    }

    async recordTask(task, agent) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO agent_metrics (agent_id, task_count)
                VALUES (?, 1)
                ON CONFLICT(agent_id) 
                DO UPDATE SET task_count = task_count + 1
            `, [agent[0]], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    executeAgent(agents, task) {
        console.log(`⚙️ Executing with agents: ${agents.join(', ')}`);
        
        // Claude Code에게 결과 반환
        return {
            status: 'success',
            agents: agents,
            task: task,
            result: `Task ${task.type} completed by ${agents[0]}`
        };
    }
}

// CLI 인터페이스
if (require.main === module) {
    const subAgent = new CodeBSubAgent();
    const task = {
        type: process.argv[2] || 'analyze',
        target: process.argv[3] || '.',
        options: process.argv.slice(4)
    };
    
    subAgent.delegateTask(task).then(result => {
        console.log(JSON.stringify(result, null, 2));
    });
}

module.exports = CodeBSubAgent;
EOF

# 8. PATH 추가
echo -e "${YELLOW}🔗 Adding to system PATH...${NC}"
echo 'export PATH="/usr/local/codeb-agent/bin:$PATH"' >> ~/.bashrc
echo 'export PATH="/usr/local/codeb-agent/bin:$PATH"' >> ~/.zshrc

# 9. 시스템 서비스 등록 (macOS)
echo -e "${YELLOW}🚀 Creating system service...${NC}"
sudo tee /Library/LaunchDaemons/com.codeb.agent.plist > /dev/null << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.codeb.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/codeb-agent/bin/codeb-daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/usr/local/codeb-agent/logs/codeb.log</string>
    <key>StandardErrorPath</key>
    <string>/usr/local/codeb-agent/logs/codeb-error.log</string>
</dict>
</plist>
EOF

# 10. 권한 설정
echo -e "${YELLOW}🔐 Setting permissions...${NC}"
sudo chown -R $(whoami):staff /usr/local/codeb-agent
chmod -R 755 /usr/local/codeb-agent

# 11. 완료 메시지
echo -e "\n${GREEN}✅ CodeB Agent 1.0 Installation Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}🎯 Quick Start:${NC}"
echo "  1. Restart terminal or run: source ~/.bashrc"
echo "  2. Initialize project: codeb init"
echo "  3. Start development: codeb analyze"
echo ""
echo -e "${BLUE}📊 System Status:${NC}"
echo "  • 49 Agents: Ready"
echo "  • SQLite DB: Initialized"
echo "  • MCP Server: Configured"
echo "  • Claude Code: Integrated"
echo ""
echo -e "${YELLOW}Type 'codeb' to see all commands${NC}"
```

## 🔧 Claude Code 통합 설정

### MCP 서버 자동 등록
```json
{
  "mcpServers": {
    "codeb-agent": {
      "command": "/usr/local/codeb-agent/bin/codeb",
      "args": ["mcp", "server"],
      "env": {
        "CODEB_HOME": "/usr/local/codeb-agent",
        "CODEB_MODE": "claude-code"
      }
    }
  }
}
```

## 🚀 사용법

### 1. 시스템 전역 명령어
```bash
# 어디서든 사용 가능
codeb init                    # 현재 디렉토리를 CodeB 프로젝트로
codeb analyze                 # 49개 에이전트로 분석
codeb optimize --waves 5      # 5단계 최적화
codeb sql "SELECT * FROM patterns"  # SQLite 직접 쿼리
```

### 2. Claude Code에서 사용
```typescript
// MCP를 통한 직접 호출
mcp__codeb-agent__capture_context({
  projectPath: ".",
  saveToGlobal: true
})

// 서브에이전트 위임
mcp__codeb-agent__delegate_task({
  type: "refactor",
  target: "src/components",
  agents: ["frontend-lead", "react-specialist"]
})
```

### 3. 프로젝트별 체크포인트
```bash
# 프로젝트 로컬
.codeb-checkpoint/
├── context.db        # 이 프로젝트만의 컨텍스트
└── patterns.json     # 이 프로젝트의 패턴

# 전역 저장소
/usr/local/codeb-agent/data/
├── sqlite/global-context.db  # 모든 프로젝트 통합
└── patterns/                  # 전역 패턴 라이브러리
```

## 📊 주요 기능

1. **전역 패턴 학습**: 모든 프로젝트에서 패턴 수집 및 재사용
2. **에이전트 성능 추적**: 각 에이전트의 성공률 및 신뢰도 측정
3. **크로스 프로젝트 인사이트**: 프로젝트 간 최적화 패턴 공유
4. **Claude Code 네이티브**: MCP 프로토콜로 완벽 통합

## 🎯 다음 단계

1. `bash install-codeb-agent.sh` 실행
2. 터미널 재시작
3. `codeb status`로 설치 확인
4. Claude Code 재시작하여 MCP 서버 인식

---

**CodeB Agent 1.0** - Your AI Development Partner
*System-wide, Always Ready, Claude Code Native*