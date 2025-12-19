#!/bin/bash

# CodeB Agent - Global Commands Installation
# Claude Code 전역 명령어 설치 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${PURPLE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║     CodeB Agent - Global Commands Installation        ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. ~/.claude/commands 디렉토리 생성
echo -e "${CYAN}📁 Creating global commands directory...${NC}"
mkdir -p ~/.claude/commands

# 2. 명령어 파일 생성
echo -e "${CYAN}📝 Installing CodeB commands...${NC}"

# /cb - 메인 명령
cat > ~/.claude/commands/cb.md << 'EOF'
---
description: CodeB Agent - 49 agents analysis and optimization system
argument-hint: [analyze|optimize|cleanup|pattern|monitor|delegate|status|help] [options]
---

# CodeB Agent Command (/cb)

Execute CodeB Agent's 49-agent system for comprehensive project analysis and optimization.

## Command: $ARGUMENTS

I'll execute the CodeB Agent system with the specified command.

Let me run the CodeB Agent now.
EOF

# /cb-analyze - 분석 명령
cat > ~/.claude/commands/cb-analyze.md << 'EOF'
---
description: Run CodeB 49-agent comprehensive analysis
argument-hint: [depth] [focus]
---

# CodeB Agent Analysis - 49 Agents in 7 Batches

I will execute a comprehensive analysis using 49 specialized agents.

## Analysis Parameters: $ARGUMENTS

Let me run the CodeB Agent analysis system now.
EOF

# /cb-optimize - 최적화 명령
cat > ~/.claude/commands/cb-optimize.md << 'EOF'
---
description: Run CodeB 5-wave optimization strategy
argument-hint: [waves] [target]
---

# CodeB Agent Optimization

I will execute the 5-wave optimization strategy.

## Optimization Parameters: $ARGUMENTS

Starting the optimization process.
EOF

# /cb-cleanup - 정리 명령
cat > ~/.claude/commands/cb-cleanup.md << 'EOF'
---
description: Clean duplicate dependencies and code
argument-hint: [deps|code|all]
---

# CodeB Agent Cleanup

I will clean up your project.

## Cleanup Target: $ARGUMENTS

Executing cleanup operation.
EOF

# /cb-pattern - 패턴 명령
cat > ~/.claude/commands/cb-pattern.md << 'EOF'
---
description: Extract or apply reusable patterns
argument-hint: [extract|apply] [--from source]
---

# CodeB Agent Pattern Management

Managing reusable patterns in your codebase.

## Pattern Operation: $ARGUMENTS

Processing patterns now.
EOF

# /cb-help - 도움말 명령
cat > ~/.claude/commands/cb-help.md << 'EOF'
---
description: Show CodeB Agent help and available commands
---

# CodeB Agent Help

## Available Commands:

### Core Commands:
- `/cb analyze` - Run 49-agent analysis
- `/cb optimize` - Execute 5-wave optimization
- `/cb cleanup` - Remove duplicates
- `/cb pattern` - Manage patterns
- `/cb monitor` - Real-time monitoring
- `/cb delegate` - Task delegation
- `/cb status` - System status

## Quick Start:
1. `/cb analyze` - Analyze your project first
2. `/cb optimize` - Fix identified issues
3. `/cb cleanup all` - Final cleanup

## Agent Structure:
- 49 Total Agents
- 7 Execution Batches
- 4 Domain Leads
- 11 Specialists
- 33 Workers
EOF

echo -e "  ${GREEN}✓${NC} Created /cb command"
echo -e "  ${GREEN}✓${NC} Created /cb-analyze command"
echo -e "  ${GREEN}✓${NC} Created /cb-optimize command"
echo -e "  ${GREEN}✓${NC} Created /cb-cleanup command"
echo -e "  ${GREEN}✓${NC} Created /cb-pattern command"
echo -e "  ${GREEN}✓${NC} Created /cb-help command"

# 3. 권한 설정
echo -e "${CYAN}🔧 Setting permissions...${NC}"
chmod 644 ~/.claude/commands/*.md
echo -e "  ${GREEN}✓${NC} Permissions set"

# 4. 설치 확인
echo -e "${CYAN}🔍 Verifying installation...${NC}"
COMMAND_COUNT=$(ls -1 ~/.claude/commands/cb*.md 2>/dev/null | wc -l)
echo -e "  ${GREEN}✓${NC} $COMMAND_COUNT CodeB commands installed"

# 5. 완료 메시지
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ CodeB Agent Global Commands Installed Successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}📋 Available Commands (works in any project):${NC}"
echo -e "  ${YELLOW}/cb${NC}          - Main CodeB command"
echo -e "  ${YELLOW}/cb-analyze${NC}  - Run 49-agent analysis"
echo -e "  ${YELLOW}/cb-optimize${NC} - Execute optimization"
echo -e "  ${YELLOW}/cb-cleanup${NC}  - Clean duplicates"
echo -e "  ${YELLOW}/cb-pattern${NC}  - Manage patterns"
echo -e "  ${YELLOW}/cb-help${NC}     - Show help"
echo ""
echo -e "${PURPLE}💡 Usage:${NC}"
echo -e "  1. Open Claude Code in any project"
echo -e "  2. Type ${YELLOW}/${NC} to see command list"
echo -e "  3. Select or type ${YELLOW}/cb-analyze${NC}"
echo ""
echo -e "${BLUE}📍 Commands location: ~/.claude/commands/${NC}"
echo ""
echo -e "${GREEN}These commands are now available globally in all your projects!${NC}"