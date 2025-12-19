#!/bin/bash
# =============================================================================
# CodeB Deployment Logger
# =============================================================================
# 목적: MCP 배포 과정의 모든 로그를 기록하여 AI 우회 검토 가능
# 사용: source scripts/deployment-logger.sh && start_deployment_log "project-name" "environment"
# =============================================================================

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 로그 디렉토리
LOG_DIR="./deployment-logs"
CURRENT_LOG=""
SESSION_ID=""

# 배포 로그 시작
start_deployment_log() {
    local project_name="$1"
    local environment="${2:-staging}"

    SESSION_ID=$(date +%Y%m%d_%H%M%S)
    mkdir -p "$LOG_DIR"
    CURRENT_LOG="$LOG_DIR/${project_name}-${environment}-${SESSION_ID}.log"

    cat > "$CURRENT_LOG" << EOF
================================================================================
CodeB Deployment Log
================================================================================
Project:     $project_name
Environment: $environment
Session ID:  $SESSION_ID
Started:     $(date '+%Y-%m-%d %H:%M:%S')
User:        $(whoami)
Host:        $(hostname)
================================================================================

[INIT] Deployment session started

EOF

    echo -e "${GREEN}📝 Deployment log started: $CURRENT_LOG${NC}"
    export CURRENT_LOG
    export SESSION_ID
}

# 로그 기록 함수
log_entry() {
    local level="$1"
    local category="$2"
    local message="$3"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[$timestamp] [$level] [$category] $message" >> "$CURRENT_LOG"

    case $level in
        "INFO")  echo -e "${BLUE}ℹ️  [$category] $message${NC}" ;;
        "SUCCESS") echo -e "${GREEN}✅ [$category] $message${NC}" ;;
        "WARNING") echo -e "${YELLOW}⚠️  [$category] $message${NC}" ;;
        "ERROR") echo -e "${RED}❌ [$category] $message${NC}" ;;
        "MCP") echo -e "${CYAN}🔧 [$category] $message${NC}" ;;
        "AI_ACTION") echo -e "${YELLOW}🤖 [$category] $message${NC}" ;;
        "BYPASS_DETECTED") echo -e "${RED}🚨 [$category] BYPASS: $message${NC}" ;;
    esac
}

# MCP 도구 호출 로깅
log_mcp_call() {
    local tool_name="$1"
    local parameters="$2"
    local result="$3"

    cat >> "$CURRENT_LOG" << EOF

--- MCP TOOL CALL ---
Tool:       $tool_name
Parameters: $parameters
Timestamp:  $(date '+%Y-%m-%d %H:%M:%S')
Result:     $result
--- END MCP CALL ---

EOF
}

# AI 수정 액션 로깅 (우회 감지용)
log_ai_action() {
    local action_type="$1"
    local description="$2"
    local file_affected="$3"
    local original_code="$4"
    local new_code="$5"

    cat >> "$CURRENT_LOG" << EOF

=== AI ACTION RECORDED ===
Type:        $action_type
Description: $description
File:        $file_affected
Timestamp:   $(date '+%Y-%m-%d %H:%M:%S')

--- ORIGINAL CODE ---
$original_code
--- END ORIGINAL ---

--- NEW CODE ---
$new_code
--- END NEW ---

=== END AI ACTION ===

EOF

    # 우회 패턴 감지
    detect_bypass_pattern "$new_code" "$action_type" "$description"
}

# 우회 패턴 자동 감지
detect_bypass_pattern() {
    local code="$1"
    local action_type="$2"
    local description="$3"

    local bypass_detected=false
    local bypass_reasons=""

    # 1. || true 패턴
    if echo "$code" | grep -q '|| true'; then
        bypass_detected=true
        bypass_reasons+="[|| true 에러 무시] "
    fi

    # 2. || echo 패턴 (에러를 경고로 변환)
    if echo "$code" | grep -qE '\|\| echo.*[Ww]arn|skip|ignore'; then
        bypass_detected=true
        bypass_reasons+="[|| echo로 에러 경고 변환] "
    fi

    # 3. continue-on-error
    if echo "$code" | grep -q 'continue-on-error: true'; then
        bypass_detected=true
        bypass_reasons+="[continue-on-error 사용] "
    fi

    # 4. --network 플래그 제거
    if echo "$description" | grep -qi 'network' && ! echo "$code" | grep -q '\-\-network'; then
        bypass_detected=true
        bypass_reasons+="[--network 플래그 제거 의심] "
    fi

    # 5. IP 직접 하드코딩
    if echo "$code" | grep -qE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+'; then
        bypass_detected=true
        bypass_reasons+="[IP 직접 하드코딩] "
    fi

    # 6. chmod 777
    if echo "$code" | grep -q 'chmod 777'; then
        bypass_detected=true
        bypass_reasons+="[chmod 777 보안 위험] "
    fi

    # 7. --privileged
    if echo "$code" | grep -q '\-\-privileged'; then
        bypass_detected=true
        bypass_reasons+="[--privileged 권한 상승] "
    fi

    # 8. fallback 패턴
    if echo "$code" | grep -qi 'fallback'; then
        bypass_detected=true
        bypass_reasons+="[fallback 우회 의심] "
    fi

    # 9. @ts-ignore / @ts-nocheck
    if echo "$code" | grep -qE '@ts-ignore|@ts-nocheck'; then
        bypass_detected=true
        bypass_reasons+="[TypeScript 검사 무시] "
    fi

    # 10. eslint-disable
    if echo "$code" | grep -q 'eslint-disable'; then
        bypass_detected=true
        bypass_reasons+="[ESLint 검사 무시] "
    fi

    # 11. any 타입
    if echo "$code" | grep -qE ': any\b|as any'; then
        bypass_detected=true
        bypass_reasons+="[any 타입 사용] "
    fi

    if [ "$bypass_detected" = true ]; then
        log_entry "BYPASS_DETECTED" "AUTO_DETECT" "$bypass_reasons"

        cat >> "$CURRENT_LOG" << EOF

🚨🚨🚨 BYPASS PATTERN DETECTED 🚨🚨🚨
Action Type: $action_type
Reasons:     $bypass_reasons
Review Required: YES
🚨🚨🚨 END BYPASS ALERT 🚨🚨🚨

EOF
    fi
}

# 에러 발생 시 로깅
log_error() {
    local error_source="$1"
    local error_message="$2"
    local attempted_fix="$3"

    cat >> "$CURRENT_LOG" << EOF

!!! ERROR OCCURRED !!!
Source:        $error_source
Message:       $error_message
Timestamp:     $(date '+%Y-%m-%d %H:%M:%S')
Attempted Fix: $attempted_fix
!!! END ERROR !!!

EOF
}

# 배포 로그 종료
end_deployment_log() {
    local final_status="$1"

    cat >> "$CURRENT_LOG" << EOF

================================================================================
Deployment Session Ended
================================================================================
Final Status: $final_status
Ended:        $(date '+%Y-%m-%d %H:%M:%S')
================================================================================

SUMMARY:
$(grep -c "BYPASS_DETECTED" "$CURRENT_LOG" || echo "0") bypass patterns detected
$(grep -c "ERROR" "$CURRENT_LOG" || echo "0") errors occurred
$(grep -c "MCP TOOL CALL" "$CURRENT_LOG" || echo "0") MCP tools called
$(grep -c "AI ACTION" "$CURRENT_LOG" || echo "0") AI actions recorded

EOF

    echo -e "${GREEN}📝 Deployment log saved: $CURRENT_LOG${NC}"

    # 바이패스 감지되면 경고
    local bypass_count=$(grep -c "BYPASS_DETECTED" "$CURRENT_LOG" || echo "0")
    if [ "$bypass_count" -gt 0 ]; then
        echo -e "${RED}🚨 WARNING: $bypass_count bypass patterns detected! Review log for details.${NC}"
    fi
}

# 로그 비교 도구
compare_with_original() {
    local log_file="$1"
    local original_file="$2"

    echo -e "${BLUE}📊 Comparing deployment log with original code...${NC}"

    # AI ACTION 섹션 추출
    grep -A 20 "=== AI ACTION RECORDED ===" "$log_file" | while read -r line; do
        echo "$line"
    done

    # BYPASS 섹션 추출
    echo -e "\n${RED}🚨 BYPASS PATTERNS FOUND:${NC}"
    grep -B 2 -A 5 "BYPASS_DETECTED" "$log_file"
}

# 최근 로그 보기
view_recent_logs() {
    local count="${1:-5}"
    echo -e "${BLUE}📋 Recent deployment logs:${NC}"
    ls -lt "$LOG_DIR"/*.log 2>/dev/null | head -n "$count"
}

# 바이패스 리포트 생성
generate_bypass_report() {
    local log_file="${1:-$CURRENT_LOG}"
    local report_file="${log_file%.log}-bypass-report.md"

    cat > "$report_file" << EOF
# Bypass Detection Report

**Log File:** $log_file
**Generated:** $(date '+%Y-%m-%d %H:%M:%S')

## Summary

EOF

    if grep -q "BYPASS_DETECTED" "$log_file"; then
        echo "### ⚠️ Bypass Patterns Detected" >> "$report_file"
        echo "" >> "$report_file"
        grep -B 2 -A 3 "BYPASS_DETECTED" "$log_file" >> "$report_file"
    else
        echo "### ✅ No Bypass Patterns Detected" >> "$report_file"
    fi

    cat >> "$report_file" << EOF

## Recommended Actions

1. Review all AI actions marked with BYPASS_DETECTED
2. Compare with original project patterns
3. Revert any unauthorized bypasses
4. Update Self-Healing rules if needed

## Full Log Reference

See: $log_file
EOF

    echo -e "${GREEN}📄 Bypass report generated: $report_file${NC}"
}

echo -e "${GREEN}✅ Deployment Logger loaded. Use:${NC}"
echo "  start_deployment_log <project> <environment>"
echo "  log_entry <level> <category> <message>"
echo "  log_mcp_call <tool> <params> <result>"
echo "  log_ai_action <type> <desc> <file> <old_code> <new_code>"
echo "  end_deployment_log <status>"
echo "  generate_bypass_report [log_file]"
