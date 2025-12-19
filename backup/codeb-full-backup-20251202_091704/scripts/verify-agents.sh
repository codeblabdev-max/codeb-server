#!/bin/bash

# CodeB Agent System Verification Script
# 시스템 전역 에이전트 설치 확인

echo "========================================="
echo "🎯 CodeB Agent System Verification"
echo "========================================="
echo ""

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 전역 에이전트 디렉토리
GLOBAL_AGENTS_DIR="$HOME/.claude/agents"

# 필수 에이전트 목록
REQUIRED_AGENTS=(
    "master-orchestrator"
    "db-schema-architect"
    "frontend-pc-specialist"
    "frontend-mobile-expert"
    "api-contract-guardian"
    "admin-panel-builder"
    "e2e-test-strategist"
)

echo "📂 Checking global agents directory..."
if [ -d "$GLOBAL_AGENTS_DIR" ]; then
    echo -e "${GREEN}✅ Global agents directory exists${NC}: $GLOBAL_AGENTS_DIR"
else
    echo -e "${RED}❌ Global agents directory not found${NC}"
    exit 1
fi

echo ""
echo "🔍 Verifying installed agents..."
echo "----------------------------------------"

MISSING_AGENTS=()
INSTALLED_COUNT=0

for agent in "${REQUIRED_AGENTS[@]}"; do
    if [ -f "$GLOBAL_AGENTS_DIR/${agent}.md" ]; then
        SIZE=$(ls -lh "$GLOBAL_AGENTS_DIR/${agent}.md" | awk '{print $5}')
        echo -e "${GREEN}✅${NC} ${agent} (${SIZE})"
        ((INSTALLED_COUNT++))
    else
        echo -e "${RED}❌${NC} ${agent} - NOT FOUND"
        MISSING_AGENTS+=("$agent")
    fi
done

echo "----------------------------------------"
echo ""

# 요약
if [ ${#MISSING_AGENTS[@]} -eq 0 ]; then
    echo -e "${GREEN}🎉 SUCCESS: All ${INSTALLED_COUNT} agents are installed globally!${NC}"
    echo ""
    echo "📍 Location: $GLOBAL_AGENTS_DIR"
    echo "🚀 Status: Ready to use in ANY project"
    echo ""
    echo "💡 Usage Examples:"
    echo "   - \"Use master-orchestrator to design a new project\""
    echo "   - \"Use db-schema-architect for database design\""
    echo "   - \"Use e2e-test-strategist to create test plan\""
else
    echo -e "${RED}⚠️  WARNING: ${#MISSING_AGENTS[@]} agents are missing!${NC}"
    echo "Missing agents:"
    for agent in "${MISSING_AGENTS[@]}"; do
        echo "  - $agent"
    done
    echo ""
    echo "Run the installation script to fix this issue."
    exit 1
fi

echo ""
echo "========================================="
echo "📊 Agent System Statistics:"
echo "========================================="
echo "Total Agents: ${#REQUIRED_AGENTS[@]}"
echo "Installed: $INSTALLED_COUNT"
echo "Total Size: $(du -sh "$GLOBAL_AGENTS_DIR" 2>/dev/null | cut -f1)"
echo ""

# 에이전트 역할 요약
echo "🎭 Agent Roles:"
echo "----------------------------------------"
echo "👑 master-orchestrator    - Project conductor"
echo "💾 db-schema-architect    - Database expert"
echo "🖥️  frontend-pc-specialist - Desktop UI expert"
echo "📱 frontend-mobile-expert - Mobile UI expert"
echo "🔌 api-contract-guardian  - API design expert"
echo "👨‍💼 admin-panel-builder    - Admin panel expert"
echo "🧪 e2e-test-strategist    - E2E testing expert"
echo "========================================="

# 에이전트 우선순위 정보
echo ""
echo "ℹ️  Priority Information:"
echo "----------------------------------------"
echo "• Project agents (.claude/agents/) override global"
echo "• Global agents (~/.claude/agents/) available everywhere"
echo "• Auto-activation: Agents with 'MUST BE USED' in description"
echo ""

exit 0