#!/bin/bash
# ============================================================================
# CodeB SSH Key Manager
# 서버의 authorized_keys 파일을 직접 관리하는 스크립트
#
# 설치 위치: /opt/codeb/scripts/ssh-key-manager.sh
# 키 저장소: /opt/codeb/config/ssh-keys.json
# ============================================================================

set -e

CODEB_DIR="/opt/codeb"
CONFIG_DIR="$CODEB_DIR/config"
SCRIPTS_DIR="$CODEB_DIR/scripts"
SSH_KEYS_FILE="$CONFIG_DIR/ssh-keys.json"
AUTHORIZED_KEYS="/root/.ssh/authorized_keys"
BACKUP_DIR="$CONFIG_DIR/backups"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 초기화
init() {
    mkdir -p "$CONFIG_DIR" "$SCRIPTS_DIR" "$BACKUP_DIR"

    if [ ! -f "$SSH_KEYS_FILE" ]; then
        echo '{"keys": [], "lastUpdated": "'$(date -Iseconds)'"}' > "$SSH_KEYS_FILE"
        echo -e "${GREEN}✓ SSH 키 저장소 초기화됨${NC}"
    fi
}

# 키 목록 조회
list_keys() {
    local format="${1:-text}"

    if [ ! -f "$SSH_KEYS_FILE" ]; then
        echo -e "${RED}SSH 키 저장소가 없습니다. 'init' 명령을 실행하세요.${NC}"
        exit 1
    fi

    if [ "$format" == "json" ]; then
        cat "$SSH_KEYS_FILE"
    else
        echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║                    SSH Key Registry                               ║${NC}"
        echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════╝${NC}"
        echo ""

        local count=$(jq '.keys | length' "$SSH_KEYS_FILE")
        echo -e "${YELLOW}등록된 키: $count개${NC}"
        echo ""

        if [ "$count" -gt 0 ]; then
            jq -r '.keys[] | "\(.name) | \(.type) | \(.addedAt | split("T")[0]) | \(.fingerprint)"' "$SSH_KEYS_FILE" | \
            while IFS='|' read -r name type date fingerprint; do
                echo -e "  ${GREEN}•${NC} $name"
                echo -e "    Type: $type | Added: $date"
                echo -e "    Fingerprint: $fingerprint"
                echo ""
            done
        else
            echo -e "  ${YELLOW}등록된 키가 없습니다.${NC}"
        fi
    fi
}

# 키 등록 (공개키)
add_key() {
    local name="$1"
    local public_key="$2"

    if [ -z "$name" ] || [ -z "$public_key" ]; then
        echo -e "${RED}사용법: $0 add <이름> <공개키>${NC}"
        echo -e "${YELLOW}예: $0 add \"홍길동\" \"ssh-ed25519 AAAA... user@host\"${NC}"
        exit 1
    fi

    # 키 유형 감지
    local key_type=$(echo "$public_key" | awk '{print $1}')

    # 핑거프린트 계산
    local fingerprint=$(echo "$public_key" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')
    if [ -z "$fingerprint" ]; then
        fingerprint="unknown"
    fi

    # 중복 확인
    local existing=$(jq -r --arg fp "$fingerprint" '.keys[] | select(.fingerprint == $fp) | .name' "$SSH_KEYS_FILE")
    if [ -n "$existing" ]; then
        echo -e "${YELLOW}⚠️  이 키는 이미 등록되어 있습니다: $existing${NC}"
        return 1
    fi

    # 키 추가
    local timestamp=$(date -Iseconds)
    local new_key=$(jq -n \
        --arg name "$name" \
        --arg type "$key_type" \
        --arg key "$public_key" \
        --arg fp "$fingerprint" \
        --arg ts "$timestamp" \
        '{name: $name, type: $type, publicKey: $key, fingerprint: $fp, addedAt: $ts}')

    jq --argjson newkey "$new_key" '.keys += [$newkey] | .lastUpdated = "'$timestamp'"' "$SSH_KEYS_FILE" > "${SSH_KEYS_FILE}.tmp"
    mv "${SSH_KEYS_FILE}.tmp" "$SSH_KEYS_FILE"

    echo -e "${GREEN}✓ SSH 키 등록됨: $name${NC}"
    echo -e "  Type: $key_type"
    echo -e "  Fingerprint: $fingerprint"

    # authorized_keys 동기화
    sync_authorized_keys
}

# 키 삭제
remove_key() {
    local identifier="$1"

    if [ -z "$identifier" ]; then
        echo -e "${RED}사용법: $0 remove <이름 또는 fingerprint>${NC}"
        exit 1
    fi

    # 이름 또는 fingerprint로 검색
    local found=$(jq -r --arg id "$identifier" '.keys[] | select(.name == $id or .fingerprint == $id) | .name' "$SSH_KEYS_FILE")

    if [ -z "$found" ]; then
        echo -e "${RED}키를 찾을 수 없습니다: $identifier${NC}"
        exit 1
    fi

    # 키 삭제
    local timestamp=$(date -Iseconds)
    jq --arg id "$identifier" 'del(.keys[] | select(.name == $id or .fingerprint == $id)) | .lastUpdated = "'$timestamp'"' "$SSH_KEYS_FILE" > "${SSH_KEYS_FILE}.tmp"
    mv "${SSH_KEYS_FILE}.tmp" "$SSH_KEYS_FILE"

    echo -e "${GREEN}✓ SSH 키 삭제됨: $found${NC}"

    # authorized_keys 동기화
    sync_authorized_keys
}

# authorized_keys 동기화
sync_authorized_keys() {
    echo -e "${YELLOW}📤 authorized_keys 동기화 중...${NC}"

    # 백업
    if [ -f "$AUTHORIZED_KEYS" ]; then
        cp "$AUTHORIZED_KEYS" "$BACKUP_DIR/authorized_keys.$(date +%Y%m%d_%H%M%S)"
    fi

    # 새 authorized_keys 생성
    {
        echo "# CodeB SSH Key Manager - Auto-generated"
        echo "# Last updated: $(date -Iseconds)"
        echo "# DO NOT EDIT MANUALLY - use ssh-key-manager.sh"
        echo ""

        # 시스템 키 (기존 키 보존)
        if [ -f "$AUTHORIZED_KEYS" ]; then
            grep -v "^# CodeB" "$AUTHORIZED_KEYS" 2>/dev/null | grep -v "^#.*Auto-generated" | grep -v "^#.*DO NOT EDIT" | grep -v "^$" || true
        fi

        echo ""
        echo "# === CodeB Managed Keys ==="

        # 등록된 키 추가
        jq -r '.keys[] | "# \(.name) (\(.addedAt | split("T")[0]))\n\(.publicKey)"' "$SSH_KEYS_FILE" 2>/dev/null || true

    } > "${AUTHORIZED_KEYS}.new"

    # 적용
    mv "${AUTHORIZED_KEYS}.new" "$AUTHORIZED_KEYS"
    chmod 600 "$AUTHORIZED_KEYS"

    local count=$(jq '.keys | length' "$SSH_KEYS_FILE")
    echo -e "${GREEN}✓ authorized_keys 동기화 완료 ($count개 키)${NC}"
}

# 파일에서 키 가져오기
import_from_file() {
    local file="$1"
    local name="$2"

    if [ -z "$file" ]; then
        echo -e "${RED}사용법: $0 import <공개키파일> [이름]${NC}"
        exit 1
    fi

    if [ ! -f "$file" ]; then
        echo -e "${RED}파일을 찾을 수 없습니다: $file${NC}"
        exit 1
    fi

    local public_key=$(cat "$file")

    # 이름이 없으면 파일에서 추출
    if [ -z "$name" ]; then
        name=$(echo "$public_key" | awk '{print $NF}')
        if [ -z "$name" ]; then
            name="imported-key-$(date +%s)"
        fi
    fi

    add_key "$name" "$public_key"
}

# 원격 서버와 동기화 (multi-server support)
sync_remote() {
    local remote_host="$1"
    local remote_user="${2:-root}"

    if [ -z "$remote_host" ]; then
        echo -e "${RED}사용법: $0 sync-remote <host> [user]${NC}"
        exit 1
    fi

    echo -e "${YELLOW}📤 $remote_user@$remote_host와 동기화 중...${NC}"

    # SSH 키 저장소 전송
    scp "$SSH_KEYS_FILE" "$remote_user@$remote_host:/opt/codeb/config/ssh-keys.json"

    # 원격에서 sync 실행
    ssh "$remote_user@$remote_host" "/opt/codeb/scripts/ssh-key-manager.sh sync"

    echo -e "${GREEN}✓ 원격 동기화 완료${NC}"
}

# 상태 확인
status() {
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                    SSH Key Manager Status                         ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${YELLOW}설정 파일:${NC}"
    echo "  SSH Keys: $SSH_KEYS_FILE"
    echo "  Authorized Keys: $AUTHORIZED_KEYS"
    echo ""

    if [ -f "$SSH_KEYS_FILE" ]; then
        local count=$(jq '.keys | length' "$SSH_KEYS_FILE")
        local lastUpdated=$(jq -r '.lastUpdated' "$SSH_KEYS_FILE")
        echo -e "${YELLOW}등록된 키:${NC} $count개"
        echo -e "${YELLOW}마지막 업데이트:${NC} $lastUpdated"
    else
        echo -e "${RED}SSH 키 저장소가 없습니다.${NC}"
    fi

    echo ""

    if [ -f "$AUTHORIZED_KEYS" ]; then
        local auth_count=$(grep -c "^ssh-" "$AUTHORIZED_KEYS" 2>/dev/null || echo "0")
        echo -e "${YELLOW}authorized_keys 키:${NC} $auth_count개"
    else
        echo -e "${RED}authorized_keys 파일이 없습니다.${NC}"
    fi
}

# 도움말
show_help() {
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                CodeB SSH Key Manager v1.0                         ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "사용법: $0 <command> [arguments]"
    echo ""
    echo "Commands:"
    echo "  init              - 키 저장소 초기화"
    echo "  list [--json]     - 등록된 키 목록"
    echo "  add <name> <key>  - 새 공개키 등록"
    echo "  remove <name|fp>  - 키 삭제"
    echo "  import <file> [name] - 파일에서 키 가져오기"
    echo "  sync              - authorized_keys 동기화"
    echo "  sync-remote <host> [user] - 원격 서버 동기화"
    echo "  status            - 상태 확인"
    echo "  help              - 이 도움말"
    echo ""
    echo "예제:"
    echo "  $0 add \"홍길동\" \"ssh-ed25519 AAAA... user@host\""
    echo "  $0 import ~/.ssh/id_ed25519.pub \"김개발\""
    echo "  $0 remove \"홍길동\""
    echo "  $0 sync-remote server2.example.com root"
}

# 메인
case "${1:-help}" in
    init)
        init
        ;;
    list|ls)
        shift
        list_keys "$@"
        ;;
    add)
        shift
        add_key "$@"
        ;;
    remove|rm|delete)
        shift
        remove_key "$@"
        ;;
    import)
        shift
        import_from_file "$@"
        ;;
    sync)
        sync_authorized_keys
        ;;
    sync-remote)
        shift
        sync_remote "$@"
        ;;
    status)
        status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}알 수 없는 명령: $1${NC}"
        show_help
        exit 1
        ;;
esac
