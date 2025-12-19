#!/bin/bash

# Sub-Agent Manager Script
# 바이브 코딩의 복잡한 작업을 병렬로 처리하는 관리 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 프로젝트 경로
PROJECT_PATH="${1:-$(pwd)}"
OPERATION="${2:-analyze}"

echo -e "${BLUE}🚀 Sub-Agent Manager 시작${NC}"
echo -e "프로젝트: $PROJECT_PATH"
echo -e "작업: $OPERATION"

# 작업별 Sub-Agent 델리게이션
case "$OPERATION" in
  "cleanup-deps")
    echo -e "${YELLOW}📦 의존성 정리 작업 시작${NC}"
    
    # Agent 1: package.json 분석
    echo -e "${GREEN}Agent 1: package.json 분석 중...${NC}"
    cat > /tmp/agent1_task.json << EOF
{
  "task": "analyze_dependencies",
  "params": {
    "projectPath": "$PROJECT_PATH",
    "action": "analyze",
    "autoFix": false
  }
}
EOF
    
    # Agent 2: import 패턴 스캔
    echo -e "${GREEN}Agent 2: import 패턴 스캔 중...${NC}"
    cat > /tmp/agent2_task.json << EOF
{
  "task": "scan_imports",
  "params": {
    "projectPath": "$PROJECT_PATH",
    "filePattern": "**/*.{js,jsx,ts,tsx}",
    "extractDependencies": true
  }
}
EOF
    
    # Agent 3: 미사용 패키지 탐지
    echo -e "${GREEN}Agent 3: 미사용 패키지 탐지 중...${NC}"
    cat > /tmp/agent3_task.json << EOF
{
  "task": "detect_unused",
  "params": {
    "projectPath": "$PROJECT_PATH",
    "checkDevDeps": true,
    "generateReport": true
  }
}
EOF
    
    # 병렬 실행
    echo -e "${BLUE}⚡ 3개 Agent 병렬 실행 중...${NC}"
    
    # MCP 서버로 위임
    echo '{"tool": "delegate_tasks", "params": {"tasks": ["/tmp/agent1_task.json", "/tmp/agent2_task.json", "/tmp/agent3_task.json"], "parallel": true}}' | \
    node /Users/admin/new_project/codeb-server/mcp-contest-continuity/dist/index.js
    
    echo -e "${GREEN}✅ 의존성 정리 완료${NC}"
    ;;
    
  "pattern-extract")
    echo -e "${YELLOW}🎨 패턴 추출 작업 시작${NC}"
    
    # Wave 1: 구조 분석
    echo -e "${GREEN}Wave 1: 프로젝트 구조 분석${NC}"
    cat > /tmp/wave1_task.json << EOF
{
  "task": "analyze_structure",
  "params": {
    "projectPath": "$PROJECT_PATH",
    "depth": 3,
    "includePatterns": ["components", "hooks", "utils", "api"]
  }
}
EOF
    
    # Wave 2: 패턴 식별
    echo -e "${GREEN}Wave 2: 코드 패턴 식별${NC}"
    cat > /tmp/wave2_task.json << EOF
{
  "task": "identify_patterns",
  "params": {
    "projectPath": "$PROJECT_PATH",
    "patternTypes": ["auth", "crud", "state", "routing"],
    "minOccurrence": 2
  }
}
EOF
    
    # Wave 3: 템플릿 생성
    echo -e "${GREEN}Wave 3: 재사용 템플릿 생성${NC}"
    cat > /tmp/wave3_task.json << EOF
{
  "task": "generate_templates",
  "params": {
    "projectPath": "$PROJECT_PATH",
    "outputPath": "./templates",
    "includeTests": true
  }
}
EOF
    
    echo -e "${BLUE}🌊 Wave 방식 순차 실행 중...${NC}"
    
    # 순차 실행 (Wave)
    for wave in wave1 wave2 wave3; do
      echo '{"tool": "manage_patterns", "params": '$(cat /tmp/${wave}_task.json)'}' | \
      node /Users/admin/new_project/codeb-server/mcp-contest-continuity/dist/index.js
      sleep 1
    done
    
    echo -e "${GREEN}✅ 패턴 추출 완료${NC}"
    ;;
    
  "realtime-monitor")
    echo -e "${YELLOW}👁️ 실시간 모니터링 시작${NC}"
    
    # 모니터링 설정
    cat > /tmp/monitor_config.json << EOF
{
  "projectPath": "$PROJECT_PATH",
  "watchPatterns": ["**/*.{js,jsx,ts,tsx}", "**/*.md"],
  "excludePatterns": ["node_modules", "dist", ".git"],
  "actions": {
    "onCodeChange": ["update_tests", "check_patterns"],
    "onDocChange": ["split_if_needed", "update_index"],
    "onConfigChange": ["validate_config", "reload_services"]
  },
  "interval": 5000
}
EOF
    
    echo -e "${BLUE}🔄 백그라운드 모니터링 시작...${NC}"
    
    # 백그라운드 실행
    nohup node -e "
      const config = require('/tmp/monitor_config.json');
      const { exec } = require('child_process');
      
      console.log('Monitoring started for:', config.projectPath);
      
      setInterval(() => {
        exec('echo {\"tool\": \"monitor_realtime\", \"params\": ' + JSON.stringify(config) + '} | node /Users/admin/new_project/codeb-server/mcp-contest-continuity/dist/index.js', 
          (error, stdout, stderr) => {
            if (error) console.error('Monitor error:', error);
            else console.log('Monitor update:', stdout);
          }
        );
      }, config.interval);
    " > /tmp/monitor.log 2>&1 &
    
    MONITOR_PID=$!
    echo -e "${GREEN}✅ 모니터링 시작됨 (PID: $MONITOR_PID)${NC}"
    echo $MONITOR_PID > /tmp/monitor.pid
    ;;
    
  "full-optimization")
    echo -e "${YELLOW}🚀 전체 최적화 작업 시작${NC}"
    
    # 모든 작업을 조합
    echo -e "${BLUE}Step 1: 컨텍스트 캡처${NC}"
    echo '{"tool": "capture_context", "params": {"projectPath": "'$PROJECT_PATH'", "contextName": "optimization-start"}}' | \
    node /Users/admin/new_project/codeb-server/mcp-contest-continuity/dist/index.js
    
    echo -e "${BLUE}Step 2: 의존성 분석 및 정리${NC}"
    $0 "$PROJECT_PATH" "cleanup-deps"
    
    echo -e "${BLUE}Step 3: 패턴 추출 및 템플릿화${NC}"
    $0 "$PROJECT_PATH" "pattern-extract"
    
    echo -e "${BLUE}Step 4: 테스트 문서 생성${NC}"
    echo '{"tool": "generate_test_document", "params": {"contextId": "optimization-start", "outputPath": "./docs/tests.md", "testTypes": ["ui", "api", "integration"]}}' | \
    node /Users/admin/new_project/codeb-server/mcp-contest-continuity/dist/index.js
    
    echo -e "${BLUE}Step 5: 실시간 모니터링 활성화${NC}"
    $0 "$PROJECT_PATH" "realtime-monitor"
    
    echo -e "${GREEN}✅ 전체 최적화 완료!${NC}"
    ;;
    
  "stop-monitor")
    echo -e "${YELLOW}🛑 모니터링 중지${NC}"
    if [ -f /tmp/monitor.pid ]; then
      kill $(cat /tmp/monitor.pid) 2>/dev/null || true
      rm /tmp/monitor.pid
      echo -e "${GREEN}✅ 모니터링 중지됨${NC}"
    else
      echo -e "${RED}❌ 실행 중인 모니터가 없습니다${NC}"
    fi
    ;;
    
  *)
    echo -e "${RED}❌ 알 수 없는 작업: $OPERATION${NC}"
    echo "사용 가능한 작업:"
    echo "  cleanup-deps     - 의존성 정리"
    echo "  pattern-extract  - 패턴 추출"
    echo "  realtime-monitor - 실시간 모니터링"
    echo "  full-optimization - 전체 최적화"
    echo "  stop-monitor     - 모니터링 중지"
    exit 1
    ;;
esac

echo -e "${BLUE}🎉 Sub-Agent Manager 완료${NC}"