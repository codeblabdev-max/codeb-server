#!/bin/bash

echo "🧹 모든 테스트 프로젝트 삭제"
echo "============================"

API_URL="http://141.164.60.51:3007/api"

# 삭제할 테스트 프로젝트 UUID 목록
TEST_PROJECT_UUIDS=(
    "pk8wokk0wkoc4kk8so4kw0gs"  # codeb-test
    "s4so4kk4c880s0ookw8sc0cc"  # codeb-full-test
    "zw8wk88wkk0sgs8sw88kw0oc"  # codeb-final
    "nkc0kkgwgg8wgooko0w8sww0"  # codeb-git-app
    "h8s4sg4kg4w84csk4ws88s84"  # codeb-nextjs-app
    "r0g84swgc4cwggkkso4kk0sk"  # codeb-app-final
    "pk88swo8ooows8k8g4880sok"  # auto-domain-test
    "i8okgw0wgggg0ow8kksgkc4c"  # final-auto-ssl
    "vcsk4ogkwwsocwgosogwoc00"  # proper-app-test
    "zkc0goko0wcks4gs0gc48ocs"  # proper-app-test (duplicate)
    "f8gw4wcw4koo8ko00o4g0oc0"  # nextjs-login-app
    "d8448okwksg40o88w0g8wg88"  # app-fix-test
    "jgkcs4ck8wws0wg044wkk8g8"  # app-correct-test
    "q408kc88kgkkw0ck4co0cwc0"  # final-fix-app
    "qk4ogosocgc04o00w44w88wo"  # debug-api-test
    "bc8gwoc4koscwc0soo0so844"  # real-final-fix
    "hc088scg0k08w0wwc0ww0c0g"  # no-domain-test
    "ecwc0g04g480w4o80go4oggw"  # powerdns-test-1755292797
    "a088kg4c4c4ckkwkcwsw04w0"  # complete-test-1755292840
    "d4og0swcwk8gssk0g0cw0048"  # generate-domain-test
)

echo "📋 삭제할 프로젝트 수: ${#TEST_PROJECT_UUIDS[@]}"
echo ""

# 삭제 전 상태 확인
echo "🔍 삭제 전 프로젝트 수:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as total_projects FROM projects;\""

echo ""
echo "🔍 삭제 전 애플리케이션 수:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as total_applications FROM applications;\""

echo ""
echo "🗑️  프로젝트 삭제 시작..."

SUCCESS_COUNT=0
FAILED_COUNT=0

for uuid in "${TEST_PROJECT_UUIDS[@]}"; do
    echo "삭제 중: $uuid"
    
    RESPONSE=$(curl -s -X DELETE "$API_URL/projects/$uuid")
    
    if echo "$RESPONSE" | grep -q "deleted successfully"; then
        echo "✅ 성공: $uuid"
        ((SUCCESS_COUNT++))
    else
        echo "❌ 실패: $uuid"
        echo "   응답: $RESPONSE"
        ((FAILED_COUNT++))
    fi
    
    # 삭제 간 잠시 대기
    sleep 2
done

echo ""
echo "📊 삭제 결과:"
echo "   성공: $SUCCESS_COUNT"
echo "   실패: $FAILED_COUNT"

echo ""
echo "🔍 삭제 후 프로젝트 수:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as total_projects FROM projects;\""

echo ""
echo "🔍 삭제 후 애플리케이션 수:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as total_applications FROM applications;\""

echo ""
echo "🔍 남은 프로젝트들:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT name, uuid FROM projects ORDER BY created_at;\""

echo ""
echo "=========================="
echo "✅ 테스트 프로젝트 삭제 완료!"