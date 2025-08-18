#!/bin/bash

echo "🧹 강제로 테스트 프로젝트 정리"
echo "=========================="

echo "🔍 현재 실행 중인 애플리케이션들:"
ssh root@141.164.60.51 "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep -E 'test|codeb|domain|powerdns|complete|generate|auto|proper|final|nextjs|app|debug|no-domain'"

echo ""
echo "🛑 테스트 관련 컨테이너 중지 및 삭제..."
ssh root@141.164.60.51 "docker ps -a --format '{{.Names}}' | grep -E 'test|codeb|domain|powerdns|complete|generate|auto|proper|final|nextjs|app|debug|no-domain' | xargs -r docker stop"
ssh root@141.164.60.51 "docker ps -a --format '{{.Names}}' | grep -E 'test|codeb|domain|powerdns|complete|generate|auto|proper|final|nextjs|app|debug|no-domain' | xargs -r docker rm"

echo ""
echo "🗑️  데이터베이스에서 직접 삭제..."

# 애플리케이션 먼저 삭제 (FK 제약조건 때문)
echo "애플리케이션 삭제..."
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"
DELETE FROM applications WHERE 
name LIKE '%test%' OR 
name LIKE '%codeb%' OR 
name LIKE '%domain%' OR 
name LIKE '%powerdns%' OR 
name LIKE '%complete%' OR 
name LIKE '%generate%' OR 
name LIKE '%auto%' OR 
name LIKE '%proper%' OR 
name LIKE '%final%' OR 
name LIKE '%nextjs%' OR 
name LIKE '%debug%';
\""

# 서비스 삭제
echo "서비스 삭제..."
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"
DELETE FROM services WHERE 
name LIKE '%test%' OR 
name LIKE '%codeb%' OR 
name LIKE '%domain%' OR 
name LIKE '%powerdns%' OR 
name LIKE '%complete%' OR 
name LIKE '%generate%' OR 
name LIKE '%auto%' OR 
name LIKE '%proper%' OR 
name LIKE '%final%' OR 
name LIKE '%nextjs%' OR 
name LIKE '%debug%';
\""

# 데이터베이스 삭제
echo "데이터베이스 삭제..."
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"
DELETE FROM standalone_postgresqls WHERE 
name LIKE '%test%' OR 
name LIKE '%codeb%' OR 
name LIKE '%domain%' OR 
name LIKE '%powerdns%' OR 
name LIKE '%complete%' OR 
name LIKE '%generate%' OR 
name LIKE '%auto%' OR 
name LIKE '%proper%' OR 
name LIKE '%final%' OR 
name LIKE '%nextjs%' OR 
name LIKE '%debug%';
\""

# 프로젝트 삭제 (모든 리소스 삭제 후)
echo "프로젝트 삭제..."
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"
DELETE FROM projects WHERE 
name LIKE '%test%' OR 
name LIKE '%codeb%' OR 
name LIKE '%domain%' OR 
name LIKE '%powerdns%' OR 
name LIKE '%complete%' OR 
name LIKE '%generate%' OR 
name LIKE '%auto%' OR 
name LIKE '%proper%' OR 
name LIKE '%final%' OR 
name LIKE '%nextjs%' OR 
name LIKE '%debug%';
\""

echo ""
echo "🧹 Docker 시스템 정리..."
ssh root@141.164.60.51 "docker system prune -f"

echo ""
echo "🔍 정리 후 상태:"
echo "남은 프로젝트 수:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as total_projects FROM projects;\""

echo ""
echo "남은 애플리케이션 수:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as total_applications FROM applications;\""

echo ""
echo "남은 프로젝트들:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT name, uuid FROM projects ORDER BY created_at;\""

echo ""
echo "=========================="
echo "✅ 강제 정리 완료!"