#!/bin/bash
# CodeB v7.0 - File-based SSOT to PostgreSQL Migration Script
#
# Architecture:
#   - App Server (158.247.203.55): /opt/codeb/registry/slots/*.json (source)
#   - DB Server (64.176.226.119): PostgreSQL codeb database (target)
#
# Usage: ./scripts/migrate-file-to-db.sh

set -e

echo "🚀 CodeB SSOT Migration: File → PostgreSQL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Configuration
APP_SERVER="root@158.247.203.55"
DB_SERVER="root@64.176.226.119"
SLOTS_DIR="/opt/codeb/registry/slots"
DB_CONTAINER="codeb-postgres"
DB_USER="codeb"
DB_NAME="codeb"

# Check existing team
echo ""
echo "[1/4] 기존 팀 확인..."
TEAM_INFO=$(ssh $DB_SERVER "docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c \"SELECT id, slug FROM teams LIMIT 1;\"" 2>/dev/null | tr -d ' ')
if [ -z "$TEAM_INFO" ]; then
    echo "❌ 팀이 없습니다. 먼저 팀을 생성해주세요."
    exit 1
fi
TEAM_ID=$(echo "$TEAM_INFO" | cut -d'|' -f1)
TEAM_SLUG=$(echo "$TEAM_INFO" | cut -d'|' -f2)
echo "   ✅ 팀 발견: ID=$TEAM_ID, Slug=$TEAM_SLUG"

# Get list of slot files
echo ""
echo "[2/4] 슬롯 파일 목록 확인..."
SLOT_FILES=$(ssh $APP_SERVER "ls $SLOTS_DIR/*.json 2>/dev/null" | tr '\n' ' ')
FILE_COUNT=$(ssh $APP_SERVER "ls $SLOTS_DIR/*.json 2>/dev/null | wc -l")
echo "   ✅ ${FILE_COUNT}개의 슬롯 파일 발견"

# Process each slot file
echo ""
echo "[3/4] 데이터 마이그레이션 중..."
SUCCESS_COUNT=0
ERROR_COUNT=0

for FILE in $SLOT_FILES; do
    FILENAME=$(basename "$FILE")

    # Read JSON file content
    JSON=$(ssh $APP_SERVER "cat $FILE" 2>/dev/null)

    # Extract fields using jq (run locally)
    PROJECT_NAME=$(echo "$JSON" | jq -r '.projectName // empty')
    TEAM_ID_FROM_FILE=$(echo "$JSON" | jq -r '.teamId // empty')
    ENVIRONMENT=$(echo "$JSON" | jq -r '.environment // "production"')
    ACTIVE_SLOT=$(echo "$JSON" | jq -r '.activeSlot // "blue"')

    # Blue slot data
    BLUE_STATE=$(echo "$JSON" | jq -r '.blue.state // "empty"')
    BLUE_PORT=$(echo "$JSON" | jq -r '.blue.port // 0')
    BLUE_VERSION=$(echo "$JSON" | jq -r '.blue.version // empty')
    BLUE_IMAGE=$(echo "$JSON" | jq -r '.blue.image // empty')
    BLUE_DEPLOYED_AT=$(echo "$JSON" | jq -r '.blue.deployedAt // empty')
    BLUE_DEPLOYED_BY=$(echo "$JSON" | jq -r '.blue.deployedBy // empty')
    BLUE_HEALTH=$(echo "$JSON" | jq -r '.blue.healthStatus // "unknown"')

    # Green slot data
    GREEN_STATE=$(echo "$JSON" | jq -r '.green.state // "empty"')
    GREEN_PORT=$(echo "$JSON" | jq -r '.green.port // 0')
    GREEN_VERSION=$(echo "$JSON" | jq -r '.green.version // empty')
    GREEN_IMAGE=$(echo "$JSON" | jq -r '.green.image // empty')
    GREEN_DEPLOYED_AT=$(echo "$JSON" | jq -r '.green.deployedAt // empty')
    GREEN_DEPLOYED_BY=$(echo "$JSON" | jq -r '.green.deployedBy // empty')
    GREEN_HEALTH=$(echo "$JSON" | jq -r '.green.healthStatus // "unknown"')

    if [ -z "$PROJECT_NAME" ]; then
        echo "   ⚠️  $FILENAME: projectName 없음, 스킵"
        ((ERROR_COUNT++))
        continue
    fi

    # Handle null values for SQL
    [ "$BLUE_VERSION" = "null" ] && BLUE_VERSION=""
    [ "$BLUE_IMAGE" = "null" ] && BLUE_IMAGE=""
    [ "$BLUE_DEPLOYED_AT" = "null" ] && BLUE_DEPLOYED_AT=""
    [ "$BLUE_DEPLOYED_BY" = "null" ] && BLUE_DEPLOYED_BY=""
    [ "$GREEN_VERSION" = "null" ] && GREEN_VERSION=""
    [ "$GREEN_IMAGE" = "null" ] && GREEN_IMAGE=""
    [ "$GREEN_DEPLOYED_AT" = "null" ] && GREEN_DEPLOYED_AT=""
    [ "$GREEN_DEPLOYED_BY" = "null" ] && GREEN_DEPLOYED_BY=""

    # Insert into projects table
    ssh $DB_SERVER "docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c \"
        INSERT INTO projects (name, team_id, type)
        VALUES ('$PROJECT_NAME', '$TEAM_ID', 'nextjs')
        ON CONFLICT (name) DO NOTHING;
    \"" > /dev/null 2>&1

    # Build SQL for project_slots
    SQL="INSERT INTO project_slots (
        project_name, environment, active_slot,
        blue_state, blue_port, blue_version, blue_image, blue_deployed_at, blue_deployed_by, blue_health_status,
        green_state, green_port, green_version, green_image, green_deployed_at, green_deployed_by, green_health_status
    ) VALUES (
        '$PROJECT_NAME', '$ENVIRONMENT', '$ACTIVE_SLOT',
        '$BLUE_STATE', $BLUE_PORT,
        $([ -z "$BLUE_VERSION" ] && echo "NULL" || echo "'$BLUE_VERSION'"),
        $([ -z "$BLUE_IMAGE" ] && echo "NULL" || echo "'$BLUE_IMAGE'"),
        $([ -z "$BLUE_DEPLOYED_AT" ] && echo "NULL" || echo "'$BLUE_DEPLOYED_AT'"),
        $([ -z "$BLUE_DEPLOYED_BY" ] && echo "NULL" || echo "'$BLUE_DEPLOYED_BY'"),
        '$BLUE_HEALTH',
        '$GREEN_STATE', $GREEN_PORT,
        $([ -z "$GREEN_VERSION" ] && echo "NULL" || echo "'$GREEN_VERSION'"),
        $([ -z "$GREEN_IMAGE" ] && echo "NULL" || echo "'$GREEN_IMAGE'"),
        $([ -z "$GREEN_DEPLOYED_AT" ] && echo "NULL" || echo "'$GREEN_DEPLOYED_AT'"),
        $([ -z "$GREEN_DEPLOYED_BY" ] && echo "NULL" || echo "'$GREEN_DEPLOYED_BY'"),
        '$GREEN_HEALTH'
    ) ON CONFLICT (project_name, environment) DO UPDATE SET
        active_slot = EXCLUDED.active_slot,
        blue_state = EXCLUDED.blue_state,
        blue_port = EXCLUDED.blue_port,
        blue_version = EXCLUDED.blue_version,
        blue_image = EXCLUDED.blue_image,
        blue_deployed_at = EXCLUDED.blue_deployed_at,
        blue_deployed_by = EXCLUDED.blue_deployed_by,
        blue_health_status = EXCLUDED.blue_health_status,
        green_state = EXCLUDED.green_state,
        green_port = EXCLUDED.green_port,
        green_version = EXCLUDED.green_version,
        green_image = EXCLUDED.green_image,
        green_deployed_at = EXCLUDED.green_deployed_at,
        green_deployed_by = EXCLUDED.green_deployed_by,
        green_health_status = EXCLUDED.green_health_status,
        updated_at = NOW();"

    # Execute SQL
    if ssh $DB_SERVER "docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c \"$SQL\"" > /dev/null 2>&1; then
        echo "   ✅ $PROJECT_NAME ($ENVIRONMENT): 포트 $BLUE_PORT/$GREEN_PORT"
        ((SUCCESS_COUNT++))
    else
        echo "   ❌ $PROJECT_NAME ($ENVIRONMENT): 마이그레이션 실패"
        ((ERROR_COUNT++))
    fi
done

# Verify migration
echo ""
echo "[4/4] 마이그레이션 검증..."
PROJECT_COUNT=$(ssh $DB_SERVER "docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c 'SELECT COUNT(*) FROM projects;'" 2>/dev/null | tr -d ' ')
SLOT_COUNT=$(ssh $DB_SERVER "docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c 'SELECT COUNT(*) FROM project_slots;'" 2>/dev/null | tr -d ' ')

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 마이그레이션 완료!"
echo ""
echo "📊 결과:"
echo "   • 성공: ${SUCCESS_COUNT}개"
echo "   • 실패: ${ERROR_COUNT}개"
echo ""
echo "📋 DB 상태:"
echo "   • projects 테이블: ${PROJECT_COUNT}개"
echo "   • project_slots 테이블: ${SLOT_COUNT}개"
echo ""
echo "🔍 확인 명령어:"
echo "   ssh $DB_SERVER \"docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c 'SELECT name, team_id FROM projects;'\""
echo "   ssh $DB_SERVER \"docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c 'SELECT project_name, environment, active_slot, blue_port, green_port FROM project_slots;'\""
