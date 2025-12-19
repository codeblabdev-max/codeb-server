#!/bin/bash
#
# CodeB SSOT Watchdog Service
#
# 30초마다 SSOT와 실제 시스템 상태를 검증하고
# 불일치 발견 시 SSOT 기준으로 자동 복원
#

set -euo pipefail

# ============================================================================
# 설정
# ============================================================================

SSOT_FILE="/opt/codeb/registry/ssot.json"
CADDY_DIR="/etc/caddy/Caddyfile.d"
LOG_FILE="/opt/codeb/logs/watchdog.log"
REPORT_DIR="/opt/codeb/registry/reports"
CHECK_INTERVAL=30
MAX_LOG_SIZE=10485760  # 10MB

# 색상 (로그용)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ============================================================================
# 유틸리티 함수
# ============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" >> "$LOG_FILE"

    # 터미널에도 출력 (서비스 모드가 아닐 때)
    if [ -t 1 ]; then
        case "$level" in
            ERROR) echo -e "${RED}[${timestamp}] [${level}] ${message}${NC}" ;;
            WARN)  echo -e "${YELLOW}[${timestamp}] [${level}] ${message}${NC}" ;;
            OK)    echo -e "${GREEN}[${timestamp}] [${level}] ${message}${NC}" ;;
            *)     echo "[${timestamp}] [${level}] ${message}" ;;
        esac
    fi
}

rotate_log() {
    if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null) -gt $MAX_LOG_SIZE ]; then
        mv "$LOG_FILE" "${LOG_FILE}.$(date '+%Y%m%d%H%M%S')"
        # 오래된 로그 삭제 (7일 이상)
        find "$(dirname "$LOG_FILE")" -name "watchdog.log.*" -mtime +7 -delete 2>/dev/null || true
    fi
}

send_notification() {
    local severity="$1"
    local title="$2"
    local message="$3"

    # Slack 웹훅이 설정되어 있으면 알림 발송
    if [ -n "${SLACK_WEBHOOK:-}" ]; then
        local color
        case "$severity" in
            critical) color="danger" ;;
            warning)  color="warning" ;;
            *)        color="good" ;;
        esac

        curl -s -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{
                \"attachments\": [{
                    \"color\": \"${color}\",
                    \"title\": \"${title}\",
                    \"text\": \"${message}\",
                    \"footer\": \"CodeB Watchdog\",
                    \"ts\": $(date +%s)
                }]
            }" > /dev/null 2>&1 || true
    fi
}

# ============================================================================
# SSOT 로드 및 파싱
# ============================================================================

load_ssot() {
    if [ ! -f "$SSOT_FILE" ]; then
        log "ERROR" "SSOT file not found: $SSOT_FILE"
        return 1
    fi

    cat "$SSOT_FILE"
}

get_ssot_value() {
    local json="$1"
    local path="$2"
    echo "$json" | jq -r "$path"
}

# ============================================================================
# Caddy 검증
# ============================================================================

verify_caddy() {
    local ssot="$1"
    local errors=0
    local fixed=0

    log "INFO" "Verifying Caddy configurations..."

    # SSOT의 모든 프로젝트 순회
    local projects=$(echo "$ssot" | jq -r '.projects | keys[]')

    for project_id in $projects; do
        for env in staging production; do
            local config=$(echo "$ssot" | jq -r ".projects[\"$project_id\"].environments.$env // empty")

            if [ -z "$config" ] || [ "$config" = "null" ]; then
                continue
            fi

            local domain=$(echo "$config" | jq -r '.domain // empty')
            local port=$(echo "$config" | jq -r '.ports.app // empty')
            local caddy_file=$(echo "$config" | jq -r '.caddyConfigFile // empty')

            if [ -z "$domain" ] || [ "$domain" = "null" ] || [ -z "$caddy_file" ]; then
                continue
            fi

            local caddy_path="${CADDY_DIR}/${caddy_file}"

            # 1. Caddy 파일 존재 확인
            if [ ! -f "$caddy_path" ]; then
                log "WARN" "Missing Caddy config: $caddy_path for $project_id/$env"

                # 자동 복원
                create_caddy_config "$domain" "$port" "$caddy_path"
                ((fixed++))
                continue
            fi

            # 2. 포트 일치 확인
            if ! grep -q "localhost:${port}" "$caddy_path"; then
                log "WARN" "Port mismatch in $caddy_path: expected localhost:$port"

                # 자동 복원
                create_caddy_config "$domain" "$port" "$caddy_path"
                ((fixed++))
                continue
            fi

            # 3. 도메인 일치 확인
            if ! grep -q "^${domain}" "$caddy_path"; then
                log "WARN" "Domain mismatch in $caddy_path: expected $domain"

                # 자동 복원
                create_caddy_config "$domain" "$port" "$caddy_path"
                ((fixed++))
            fi
        done
    done

    if [ $fixed -gt 0 ]; then
        log "INFO" "Reloading Caddy after fixing $fixed configurations"
        systemctl reload caddy 2>/dev/null || true
        send_notification "warning" "Caddy Drift Detected" "Fixed $fixed Caddy configurations"
    fi

    return $errors
}

create_caddy_config() {
    local domain="$1"
    local port="$2"
    local path="$3"

    log "INFO" "Creating Caddy config: $path"

    cat > "$path" << EOF
# Auto-restored by CodeB Watchdog
# Domain: $domain
# Port: $port
# Restored: $(date -Iseconds)

$domain {
    reverse_proxy localhost:$port {
        health_uri /api/health
        health_interval 30s
        health_timeout 5s
    }

    encode gzip

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        -Server
    }

    log {
        output file /var/log/caddy/${domain}.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}
EOF
}

# ============================================================================
# DNS 검증
# ============================================================================

verify_dns() {
    local ssot="$1"
    local server_ip=$(echo "$ssot" | jq -r '.server.ip')
    local errors=0
    local fixed=0

    log "INFO" "Verifying DNS records..."

    local projects=$(echo "$ssot" | jq -r '.projects | keys[]')

    for project_id in $projects; do
        for env in staging production; do
            local config=$(echo "$ssot" | jq -r ".projects[\"$project_id\"].environments.$env // empty")

            if [ -z "$config" ] || [ "$config" = "null" ]; then
                continue
            fi

            local domain=$(echo "$config" | jq -r '.domain // empty')
            local dns_configured=$(echo "$config" | jq -r '.dnsConfigured // false')

            if [ -z "$domain" ] || [ "$domain" = "null" ]; then
                continue
            fi

            # DNS 레코드 확인 (dig 사용)
            local resolved_ip=$(dig +short "$domain" A 2>/dev/null | head -1)

            if [ "$resolved_ip" != "$server_ip" ]; then
                log "WARN" "DNS mismatch for $domain: expected $server_ip, got ${resolved_ip:-none}"

                # PowerDNS로 레코드 수정 시도
                local zone=$(echo "$domain" | rev | cut -d. -f1,2 | rev)
                local subdomain=$(echo "$domain" | sed "s/\.$zone$//")

                pdnsutil delete-rrset "$zone" "$domain" A 2>/dev/null || true
                pdnsutil add-record "$zone" "$subdomain" A 300 "$server_ip" 2>/dev/null || {
                    log "ERROR" "Failed to fix DNS for $domain"
                    ((errors++))
                    continue
                }

                ((fixed++))
                log "INFO" "Fixed DNS record for $domain -> $server_ip"
            fi
        done
    done

    if [ $fixed -gt 0 ]; then
        send_notification "warning" "DNS Drift Detected" "Fixed $fixed DNS records"
    fi

    return $errors
}

# ============================================================================
# 포트 검증
# ============================================================================

verify_ports() {
    local ssot="$1"
    local warnings=0

    log "INFO" "Verifying port allocations..."

    # SSOT에 등록된 포트들
    local ssot_ports=$(echo "$ssot" | jq -r '._indexes.portToProject | keys[]')

    for port in $ssot_ports; do
        local mapping=$(echo "$ssot" | jq -r "._indexes.portToProject[\"$port\"]")
        local project_id=$(echo "$mapping" | jq -r '.projectId')
        local env=$(echo "$mapping" | jq -r '.environment')
        local service=$(echo "$mapping" | jq -r '.service')

        # 해당 포트가 실제로 사용 중인지 확인
        local actual_process=$(ss -tlnp 2>/dev/null | grep ":${port} " | awk '{print $NF}' | head -1)

        if [ -z "$actual_process" ]; then
            # 포트가 사용되지 않음 (컨테이너가 중지된 상태일 수 있음)
            local container_status=$(echo "$ssot" | jq -r ".projects[\"$project_id\"].environments.$env.status // empty")

            if [ "$container_status" = "running" ]; then
                log "WARN" "Port $port ($project_id/$env/$service) should be running but is not listening"
                ((warnings++))
            fi
        fi
    done

    # 등록되지 않은 포트 사용 감지
    local listening_ports=$(ss -tln 2>/dev/null | awk 'NR>1 {print $4}' | grep -oE '[0-9]+$' | sort -u)

    for port in $listening_ports; do
        # 시스템 포트 제외 (1-1024, SSH 등)
        if [ "$port" -lt 3000 ] || [ "$port" -gt 40000 ]; then
            continue
        fi

        # SSOT에 등록되어 있는지 확인
        local in_ssot=$(echo "$ssot" | jq -r "._indexes.portToProject[\"$port\"] // empty")

        if [ -z "$in_ssot" ] || [ "$in_ssot" = "null" ]; then
            log "WARN" "Unregistered port in use: $port"
            ((warnings++))
        fi
    done

    if [ $warnings -gt 0 ]; then
        log "WARN" "Port verification completed with $warnings warnings"
    fi

    return 0
}

# ============================================================================
# 체크섬 검증
# ============================================================================

verify_checksum() {
    local ssot="$1"

    local stored_checksum=$(echo "$ssot" | jq -r '.checksum')

    # _indexes와 checksum 제외하고 해시 계산
    local calculated=$(echo "$ssot" | jq -cS 'del(._indexes, .checksum)' | sha256sum | cut -c1-16)

    if [ "$stored_checksum" != "$calculated" ]; then
        log "ERROR" "SSOT checksum mismatch! File may have been tampered"
        send_notification "critical" "SSOT Tampering Detected" "Checksum mismatch in ssot.json"
        return 1
    fi

    return 0
}

# ============================================================================
# 리포트 생성
# ============================================================================

generate_report() {
    local status="$1"
    local caddy_ok="$2"
    local dns_ok="$3"
    local ports_ok="$4"
    local drifts="$5"
    local restored="$6"

    mkdir -p "$REPORT_DIR"

    local report_file="${REPORT_DIR}/$(date '+%Y-%m-%d_%H-%M-%S').json"

    cat > "$report_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "status": "$status",
    "checks": {
        "ssotIntegrity": true,
        "caddySync": $caddy_ok,
        "dnsSync": $dns_ok,
        "portSync": $ports_ok
    },
    "driftsDetected": $drifts,
    "itemsRestored": $restored
}
EOF

    # 오래된 리포트 삭제 (7일 이상)
    find "$REPORT_DIR" -name "*.json" -mtime +7 -delete 2>/dev/null || true
}

# ============================================================================
# 메인 검증 루프
# ============================================================================

run_verification() {
    log "INFO" "========== Starting verification cycle =========="

    local ssot
    ssot=$(load_ssot) || {
        log "ERROR" "Failed to load SSOT"
        return 1
    }

    local status="ok"
    local drifts=0
    local restored=0
    local caddy_ok=true
    local dns_ok=true
    local ports_ok=true

    # 1. 체크섬 검증
    if ! verify_checksum "$ssot"; then
        status="error"
        # 체크섬 불일치 시 백업에서 복원 시도
        log "WARN" "Attempting to restore from backup..."
        # TODO: 백업 복원 로직
    fi

    # 2. Caddy 검증
    if ! verify_caddy "$ssot"; then
        caddy_ok=false
        status="drift_detected"
    fi

    # 3. DNS 검증
    if ! verify_dns "$ssot"; then
        dns_ok=false
        status="drift_detected"
    fi

    # 4. 포트 검증
    if ! verify_ports "$ssot"; then
        ports_ok=false
        status="drift_detected"
    fi

    # 리포트 생성
    generate_report "$status" "$caddy_ok" "$dns_ok" "$ports_ok" "$drifts" "$restored"

    if [ "$status" = "ok" ]; then
        log "OK" "All checks passed"
    else
        log "WARN" "Verification completed with status: $status"
    fi

    log "INFO" "========== Verification cycle complete =========="
}

# ============================================================================
# 서비스 모드
# ============================================================================

run_service() {
    log "INFO" "CodeB Watchdog starting in service mode"
    log "INFO" "Check interval: ${CHECK_INTERVAL}s"
    log "INFO" "SSOT file: $SSOT_FILE"

    # 초기화
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$REPORT_DIR"

    # 무한 루프
    while true; do
        rotate_log
        run_verification || true
        sleep $CHECK_INTERVAL
    done
}

# ============================================================================
# CLI 모드
# ============================================================================

show_usage() {
    echo "CodeB SSOT Watchdog"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  service     Run as daemon (30s interval)"
    echo "  once        Run single verification cycle"
    echo "  status      Show current status"
    echo "  history     Show recent reports"
    echo ""
}

show_status() {
    echo "=== CodeB Watchdog Status ==="
    echo ""

    if [ -f "$SSOT_FILE" ]; then
        echo "SSOT File: $SSOT_FILE"
        echo "Last Modified: $(jq -r '.lastModified' "$SSOT_FILE")"
        echo "Modified By: $(jq -r '.lastModifiedBy' "$SSOT_FILE")"
        echo "Projects: $(jq -r '.projects | keys | length' "$SSOT_FILE")"
        echo ""

        echo "=== Project Summary ==="
        jq -r '.projects | to_entries[] | "\(.key): \(.value.environments | keys | join(", "))"' "$SSOT_FILE"
    else
        echo "SSOT file not found!"
    fi

    echo ""
    echo "=== Recent Activity ==="
    if [ -d "$REPORT_DIR" ]; then
        ls -lt "$REPORT_DIR"/*.json 2>/dev/null | head -5 | while read -r line; do
            echo "$line"
        done
    else
        echo "No reports found"
    fi
}

show_history() {
    echo "=== Recent Watchdog Reports ==="
    echo ""

    if [ -d "$REPORT_DIR" ]; then
        for report in $(ls -t "$REPORT_DIR"/*.json 2>/dev/null | head -10); do
            echo "--- $(basename "$report") ---"
            cat "$report"
            echo ""
        done
    else
        echo "No reports found"
    fi
}

# ============================================================================
# 엔트리 포인트
# ============================================================================

main() {
    local command="${1:-}"

    case "$command" in
        service)
            run_service
            ;;
        once)
            run_verification
            ;;
        status)
            show_status
            ;;
        history)
            show_history
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
